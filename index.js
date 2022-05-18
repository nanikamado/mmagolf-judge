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

const handle_submission = async(ws, message) => {
    if (!fss.existsSync(`problems/${message.problem_number}`)) {
        ws.send(
            JSON.stringify({
                type: "not_such_problem",
                problem_number: message.problem_number
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
    let files = fss.readdirSync(`problems/${message.problem_number}/inputs`);
    ws.send(JSON.stringify({
        type: "number_of_test_cases",
        n: files.length,
    }));
    let image = await compile(lang, message.code);
    if (image === null) {
        throw 'TEL in compile is not expected'
    }
    let container_rms = [];
    let promises = files.map(file => (async() => {
        let output = run(lang, image, await fs.readFile(`problems/${message.problem_number}/inputs/${file}`), time_limit);
        let correct_output = fs.readFile(`problems/${message.problem_number}/outputs/${file}`);
        let { stdout, time, killed, container_rm } = await output;
        container_rms.push(container_rm);
        correct_output = (await correct_output).toString();
        let result = {
            type: "submission_result",
            test_case_number: Number(file),
            result: typeof stdout === 'string' ? stdout.toString() === correct_output : false,
            time: time,
            killed,
        };
        ws.send(JSON.stringify(result));
    })());
    await Promise.all(promises);
    ws.close();
    await Promise.all(container_rms);
    await execFile("docker", ["rmi", image]);
};

const handle_code_test = async(ws, message) => {
    let lang = languages[message.lang]
    const image = await compile(lang, message.code);
    const { stdout, stderr, time, killed, container_rm } = await run(lang, image, message.input ? Buffer.from(message.input, 'base64') : null, time_limit);
    ws.send(
        JSON.stringify({
            type: "codetest_result",
            stdout: Buffer.from(stdout).toString('base64'),
            stderr: Buffer.from(stderr).toString('base64'),
            time: time,
            killed,
        })
    );
    ws.close();
    await container_rm;
    await execFile("docker", ["rmi", image]);
};

const timeout = ms => new Promise(resolve => {
    setTimeout(() => resolve(null), ms);
});

const compile = async(lang, code) => {
    let container_id = (await execFile("docker", ["create", "-i", "-m", "1000m", "-v", `${process.env.PWD}/volume:/volume:ro`, lang.image, "/volume/compile-helper"].concat(lang.compile_cmd))).stdout.slice(0, -1);
    let child_promise = execFile("docker", ["start", "-i", container_id]);
    child_promise.child.stdin.write(Buffer.from(code));
    child_promise.child.stdin.end();
    let time_limit = 60 * 1000;
    let output = await Promise.race([child_promise, timeout(time_limit)]);
    let result;
    if (output === null) {
        await execFile("docker", ["kill", container_id]);
        result = null;
    } else {
        let commit_id = (await execFile("docker", ["commit", container_id])).stdout.slice(0, -1);
        result = commit_id;
    }
    execFile("docker", ["rm", container_id]);
    return result;
};

const run = async(lang, image, input, time_limit) => {
    let container_id = (await execFile("docker", ["create", "-i", "-m", "1000m", "-v", `${process.env.PWD}/volume:/volume:ro`, image, "/volume/run-helper"].concat([`${time_limit}`]).concat(lang.run_cmd))).stdout.slice(0, -1);
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
            output = { stdout, stderr, time: time_limit };
        }
        killed = true;
    } else {
        output = JSON.parse(output.stdout);
    }
    let { stdout, stderr, time } = output;
    return {
        stdout,
        stderr,
        time,
        killed,
        container_rm: execFile("docker", ["stop", container_id])
            .then(() => execFile("docker", ["rm", container_id])),
    };
};

const languages = JSON.parse(fss.readFileSync("languages/languages.json"));