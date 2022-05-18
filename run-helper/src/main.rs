use serde_json::json;
use std::{
    env::args,
    io::{stdin, stdout, Read, Write},
    os::unix::prelude::ExitStatusExt,
    process::{Command, Stdio},
    time::{Duration, Instant},
};
use wait_timeout::ChildExt;

fn main() {
    let args: Vec<String> = args().skip(1).collect();
    let mut input: Vec<u8> = Vec::new();
    stdin().read_to_end(&mut input).unwrap();
    let time_limit: u64 = args[0].parse().unwrap();
    let mut child = Command::new(&args[1])
        .args(&args[2..])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir("/judge")
        .spawn()
        .unwrap();
    let child_stdin = child.stdin.as_mut().unwrap();
    let start = Instant::now();
    child_stdin.write_all(&input).unwrap();
    if child
        .wait_timeout(Duration::from_millis(time_limit))
        .unwrap()
        .is_none()
    {
        child.kill().unwrap();
        child.wait().unwrap();
    }
    let time = start.elapsed().as_millis();
    let output = child.wait_with_output().unwrap();
    let output = json!({
        "time": time as u64,
        "status": output.status.into_raw(),
        "stdout": base64::encode(output.stdout),
        "stderr": base64::encode(output.stderr),
    });
    stdout().write_all(output.to_string().as_bytes()).unwrap();
}
