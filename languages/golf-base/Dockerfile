FROM ubuntu:22.04

WORKDIR /home

RUN apt-get update && apt-get install -y \
    dc ruby nodejs python3-pip pip curl libtinfo-dev libgmp3-dev \
    build-essential wget

# Haskell
ENV BOOTSTRAP_HASKELL_NONINTERACTIVE=1
ENV PATH=${PATH}:/root/.local/bin
ENV PATH=${PATH}:/root/.ghcup/bin
RUN curl --proto '=https' --tlsv1.2 -sSf https://get-ghcup.haskell.org | sh \
 && ghcup upgrade \
 && ghcup install cabal 3.4.0.0 \
 && ghcup set cabal 3.4.0.0 \
 && ghcup install ghc 8.10.7 \
 && ghcup set ghc 8.10.7 \
 && curl -OL http://golfscript.com/nibbles/nibbles-0.25.tgz \
 && tar xf nibbles-0.25.tgz \
 && cd nibbles \
 && ghc -O -package ghc *.hs \
 && ./nibbles -v \
 && cp nibbles /usr/bin/ \
 && rm -rf * \
 && cd .. \
 && cabal install --lib dlist split murmur-hash memoize

# Rust
COPY rusty-club /home/rusty-club
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH \
    RUST_VERSION=1.60.0
RUN set -eux; \
    dpkgArch="$(dpkg --print-architecture)"; \
    case "${dpkgArch##*-}" in \
        amd64) rustArch='x86_64-unknown-linux-gnu'; rustupSha256='3dc5ef50861ee18657f9db2eeb7392f9c2a6c95c90ab41e45ab4ca71476b4338' ;; \
        armhf) rustArch='armv7-unknown-linux-gnueabihf'; rustupSha256='67777ac3bc17277102f2ed73fd5f14c51f4ca5963adadf7f174adf4ebc38747b' ;; \
        arm64) rustArch='aarch64-unknown-linux-gnu'; rustupSha256='32a1532f7cef072a667bac53f1a5542c99666c4071af0c9549795bbdb2069ec1' ;; \
        i386) rustArch='i686-unknown-linux-gnu'; rustupSha256='e50d1deb99048bc5782a0200aa33e4eea70747d49dffdc9d06812fd22a372515' ;; \
        *) echo >&2 "unsupported architecture: ${dpkgArch}"; exit 1 ;; \
    esac; \
    url="https://static.rust-lang.org/rustup/archive/1.24.3/${rustArch}/rustup-init"; \
    wget "$url"; \
    echo "${rustupSha256} *rustup-init" | sha256sum -c -; \
    chmod +x rustup-init; \
    ./rustup-init -y --no-modify-path --profile minimal --default-toolchain $RUST_VERSION --default-host ${rustArch}; \
    rm rustup-init; \
    chmod -R a+w $RUSTUP_HOME $CARGO_HOME; \
    rustup --version; \
    cargo --version; \
    rustc --version; \
    cd rusty-club; \
    cargo build --release; \
    cargo run;

RUN apt-get install -y \
    clang libboost-dev \
 && wget https://github.com/atcoder/ac-library/releases/download/v1.4/ac-library.zip \
 && unzip ac-library.zip -d /opt/ac-library

RUN apt-get install -y rakudo bc zsh fish vim git

RUN git clone https://github.com/DennisMitchell/jellylanguage.git \
 && pip3 install --upgrade jellylanguage/

RUN apt-get install -y pypy3

# RUN apt-get clean \
#  && rm -rf /var/lib/apt/lists/*