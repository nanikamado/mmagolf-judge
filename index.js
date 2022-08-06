const ws = require('ws');
const fss = require('fs');
const util = require('util');
const fs = fss.promises;
const execFile = util.promisify(require('child_process').execFile);
const server = new ws.Server({ port: 5620 });

const time_limit = 15 * 1000;

server.on('connection', ws => {
    ws.on('message', message => {
        message = JSON.parse(message);
        if (message.type == "submission") {
            handle_submission(ws, message);
        } else if (message.type == "codetest") {
            handle_code_test(ws, message);
        } else {
            console.error(`unknown type: ${message.type}`);
            ws.close();
        }
    });
    ws.on('close', () => {
        console.log('close');
    });
});

const test_case_priority = t => [t.match(/sample/) ? 0 : 1, Number(t.match(/\d+/g).slice(-1)[0]), t];

const cmp = (a, b) => {
    if (!a.length && !b.length) {
        return 0;
    } else if (!a.length) {
        return -1;
    } else if (!b.length) {
        return 1;
    } else if (a[0] === b[0]) {
        return cmp(a.slice(1), b.slice(1));
    } else if (a[0] < b[0]) {
        return -1;
    } else {
        return 1;
    }
};

const handle_submission = async (ws, message) => {
    if (!fss.existsSync(`problems/${message.problem_name}`)) {
        ws.send(
            JSON.stringify({
                type: "not_such_problem",
                problem_name: message.problem_name
            })
        );
        ws.close();
        return;
    }
    let lang = languages[message.lang];
    if (lang === undefined) {
        ws.send(
            JSON.stringify({
                type: "not_such_lang",
                lang: message.lang
            })
        );
        ws.close();
        return;
    }
    let files = fss.readdirSync(`problems/${message.problem_name}/testcases/in`)
        .sort((a, b) =>
            cmp(test_case_priority(a), test_case_priority(b))
        );
    ws.send(JSON.stringify({
        type: "test_case_names",
        ns: files,
    }));
    let compile_result = await compile(lang, message.code);
    if (compile_result.type === "timeout") {
        throw 'TEL in compile is not expected'
    }
    if (compile_result.type === 'compile_error') {
        send_compile_error(ws, compile_result);
        return;
    }
    let container_rms = [];
    let promises = files.map(file => (async () => {
        let output = run(
            lang,
            compile_result.commit_id,
            await fs.readFile(`problems/${message.problem_name}/testcases/in/${file}`),
            time_limit
        );
        let correct_output = fs.readFile(`problems/${message.problem_name}/testcases/out/${file}`);
        let { stdout, time, killed, status, container_rm } = await output;
        container_rms.push(container_rm);
        correct_output = (await correct_output).toString();
        let result = {
            type: "submission_result",
            test_case_name: file,
            result: status !== 0 ? 're' : typeof stdout === 'string' && stdout.toString() === correct_output ? 'ac' : 'wa',
            time: time,
            killed,
        };
        ws.send(JSON.stringify(result));
    })());
    await Promise.all(promises);
    ws.close();
    await Promise.all(container_rms);
    await execFile("docker", ["rmi", compile_result.commit_id]);
};

const send_compile_error = (ws, compile_result) => {
    ws.send(
        JSON.stringify({
            type: "compile_error",
            stdout: Buffer.from(compile_result.stdout).toString('base64'),
            stderr: Buffer.from(compile_result.stderr).toString('base64'),
            code: compile_result.code,
        })
    );
    ws.close();
};

const handle_code_test = async (ws, message) => {
    let lang = languages[message.lang]
    const compile_result = await compile(lang, message.code);
    if (compile_result.type === 'compile_error') {
        send_compile_error(ws, compile_result);
        return;
    }
    const { stdout, stderr, time, killed, status, container_rm } = await run(lang, compile_result.commit_id, message.input ? Buffer.from(message.input, 'base64') : null, time_limit);
    ws.send(
        JSON.stringify({
            type: "codetest_result",
            stdout: Buffer.from(stdout).toString('base64'),
            stderr: Buffer.from(stderr).toString('base64'),
            time: time,
            status,
            killed,
        })
    );
    ws.close();
    await container_rm;
    await execFile("docker", ["rmi", compile_result.commit_id]);
};

const timeout = ms => new Promise(resolve => {
    setTimeout(() => resolve(null), ms);
});

const compile = async (lang, code) => {
    let container_id = (await execFile("docker", ["create", "-i", "-m", "1000m", "--cpus=1", "--network", "none", "-v", `${process.env.PWD}/volume:/volume:ro`, lang.image, "/volume/compile-helper"].concat(lang.compile_cmd))).stdout.slice(0, -1);
    let child_promise = execFile("docker", ["start", "-i", container_id]);
    child_promise.child.stdin.write(Buffer.from(code));
    child_promise.child.stdin.end();
    let time_limit = 60 * 1000;
    try {
        output = await Promise.race([child_promise, timeout(time_limit)]);
    } catch (e) {
        output = e;
    }
    let result;
    if (output === null) {
        await execFile("docker", ["kill", container_id]);
        result = { type: "timeout" };
    } else if (output.code !== undefined) {
        let { code, stdout, stderr } = output;
        result = { type: "compile_error", code, stdout, stderr };
    } else {
        let commit_id = (await execFile("docker", ["commit", container_id])).stdout.slice(0, -1);
        result = { type: "success", commit_id };
    }
    execFile("docker", ["rm", container_id]);
    return result;
};

const run = async (lang, image, input, time_limit) => {
    let container_id = (await execFile("docker", ["create", "-i", "-m", "1000m", "--cpus=1", "--network", "none", "-v", `${process.env.PWD}/volume:/volume:ro`, image, "/volume/run-helper"].concat([`${time_limit}`]).concat(lang.run_cmd))).stdout.slice(0, -1);
    let child_promise = execFile("docker", ["start", "-i", container_id]);
    if (input !== null) {
        child_promise.child.stdin.write(Buffer.from(input, 'base64'));
    }
    child_promise.child.stdin.end();
    let output = await Promise.race([child_promise, timeout(time_limit + 1000)]);
    let killed = false;
    if (output === null) {
        await execFile("docker", ["kill", container_id]);
        try {
            output = await child_promise;
            output = JSON.parse(output.stdout);
        } catch ({ stdout, stderr }) {
            output = { stdout: '', stderr: '', time: time_limit, status: null };
        }
        killed = true;
    } else {
        output = JSON.parse(output.stdout);
    }
    let { stdout, stderr, time, status } = output;
    return {
        stdout: Buffer.from(stdout, 'base64').toString(),
        stderr: Buffer.from(stderr, 'base64').toString(),
        time,
        killed,
        status,
        container_rm: execFile("docker", ["stop", container_id])
            .then(() => execFile("docker", ["rm", container_id])),
    };
};

const languages = JSON.parse(fss.readFileSync("languages/languages.json"));