const ws = require('ws');
const fss = require('fs');
const fs = fss.promises;
const exec = require('child_process').exec;
const server = new ws.Server({ port: 5620 });

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

const available_langs = new Set(["ruby", "bash", "dc"]);

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
    if (!available_langs.has(message.lang)) {
        ws.send(
            JSON.stringify({
                type: "not_such_lang",
                lang: message.lang
            })
        );
        ws.close();
        return;
    }
    fss.writeFileSync("source-code/source-code", message.code);
    let files = fss.readdirSync(`problems/${message.problem_number}/inputs`);
    ws.send(JSON.stringify({
        type: "number_of_test_cases",
        n: files.length,
    }));
    let promises = files.map(file => (async() => {
        let output = docker_run(message.lang, await fs.readFile(`problems/${message.problem_number}/inputs/${file}`));
        let correct_output = fs.readFile(`problems/${message.problem_number}/outputs/${file}`);
        let { type, stdout, time } = await output;
        correct_output = (await correct_output).toString();
        let result = {
            type: "submission_result",
            test_case_number: Number(file),
            result: typeof stdout === 'string' ? stdout.toString() === correct_output : false,
            time: time,
            killed: type === "killed"
        };
        ws.send(JSON.stringify(result));
    })());
    await Promise.all(promises);
    ws.close();
};

const handle_code_test = async(ws, message) => {
    fss.writeFileSync("source-code/source-code", message.code);
    let [output, time] = await docker_run(message.lang, message.input ? Buffer.from(message.input, 'base64') : null);
    ws.send(`{"result":"${Buffer.from(output).toString('base64')}","time":${time}}`);
    ws.close();
};

const docker_run = (lang, input = null) =>
    new Promise((resolve, reject) => {
        exec(`docker create -i -m 1000m -v $(pwd)/source-code:/source-code:ro golf-${lang}`, (_error, container_id_out, _stderr) => {
            let timeout;
            let killed = false;
            let time_before = new Date();
            let container_id = container_id_out.slice(0, -1);
            let child = exec(`docker start -i ${container_id}`, (_error, stdout, _stderr) => {
                if (killed) {
                    resolve({ type: "killed", time: new Date() - time_before });
                } else {
                    clearTimeout(timeout);
                    resolve({ type: "ended", stdout: stdout, time: new Date() - time_before });
                }
                exec(`docker stop ${container_id} && docker rm ${container_id}`);
            });
            if (input) {
                child.stdin.write(Buffer.from(input, 'base64'));
                child.stdin.end();
            }
            let seconds = 15;
            timeout = setTimeout(() => {
                console.log('Timeout');
                child.kill('SIGKILL');
                killed = true;
            }, seconds * 1000);
        });
    });