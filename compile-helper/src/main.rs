use std::{
    env::args,
    fs::{create_dir_all, File},
    io::{stdin, Read, Write},
    process::{Command, Stdio},
};

fn main() {
    println!("ok");
    let args: Vec<String> = args().skip(1).collect();
    let mut code: Vec<u8> = Vec::new();
    stdin().read_to_end(&mut code).unwrap();
    println!("ok2");
    create_dir_all("/judge").unwrap();
    let mut source_file = File::create("/judge/source_code").unwrap();
    source_file.write_all(&code).unwrap();
    if !args.is_empty() {
        let output = Command::new(&args[0])
            .args(&args[1..])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir("/judge")
            .output()
            .unwrap();
        println!("{:?}", output);
    }
}
