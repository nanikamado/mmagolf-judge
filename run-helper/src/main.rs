use serde_json::json;
use std::{
    env::args,
    io::{stdin, stdout, Read, Write},
    time::{Duration, Instant},
};
use subprocess::{Exec, Redirection};

fn main() {
    let args: Vec<String> = args().skip(1).collect();
    let mut input: Vec<u8> = Vec::new();
    stdin().read_to_end(&mut input).unwrap();
    let time_limit: u64 = args[0].parse().unwrap();
    let mut popen = Exec::cmd(&args[1])
        .args(&args[2..])
        .stdin(Redirection::Pipe)
        .stdout(Redirection::Pipe)
        .cwd("/judge")
        .detached()
        .popen()
        .unwrap();
    let start = Instant::now();
    let (cmd_stdout, cmd_stderr) = popen
        .communicate_start(Some(input))
        .limit_time(Duration::from_millis(time_limit))
        .read()
        .unwrap_or_else(|e| e.capture);
    let exit_status = popen
        .wait_timeout(Duration::from_millis(time_limit))
        .unwrap();
    let time = start.elapsed().as_millis();
    let status = exit_status
        .map(|e| format!("{:?}", e))
        .unwrap_or_else(|| "timeout".to_string());
    let output = json!({
        "time": time as u64,
        "status": status,
        "stdout": base64::encode(cmd_stdout.unwrap_or_default()),
        "stderr": base64::encode(cmd_stderr.unwrap_or_default()),
    });
    stdout().write_all(output.to_string().as_bytes()).unwrap();
}
