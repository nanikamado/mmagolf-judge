use std::{
    env::args,
    fs::{create_dir_all, File},
    io::{stdin, Read, Write},
    process::{Command, Stdio},
};

fn main() {
    let args: Vec<String> = args().skip(1).collect();
    let mut code: Vec<u8> = Vec::new();
    stdin().read_to_end(&mut code).unwrap();
    create_dir_all("/judge").unwrap();
    let mut source_file = File::create("/judge/source_code").unwrap();
    source_file.write_all(&code).unwrap();
    if !args.is_empty() {
        let status = Command::new(&args[0])
            .args(&args[1..])
            .stdin(Stdio::null())
            .current_dir("/judge")
            .status()
            .unwrap();
        std::process::exit(status.code().unwrap());
    }
}
