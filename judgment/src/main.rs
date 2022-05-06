use rmp_serde::decode;
use std::time::Instant;
use std::{
    fs::File,
    io::{self, Read, Write},
    process::{Command, Stdio},
};

fn main() {
    let mut input = Vec::new();
    io::stdin().read_to_end(&mut input).unwrap();
    let cmd: Vec<String> = decode::from_read(File::open("command").unwrap()).unwrap();
    let start = Instant::now();
    let mut child = Command::new(&cmd[0])
        .args(&cmd[1..])
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.as_mut().unwrap().write_all(&input).unwrap();
    let mut output = child.wait_with_output().unwrap();
    let duration = start.elapsed();
    println!("{}", duration.as_millis());
    io::stdout().write_all(&mut output.stdout).unwrap();
    io::stderr().write_all(&mut output.stderr).unwrap();
}
