FROM ubuntu:22.04

ENV BOOTSTRAP_HASKELL_NONINTERACTIVE=1
ENV PATH=${PATH}:/root/.local/bin
ENV PATH=${PATH}:/root/.ghcup/bin

WORKDIR /home

RUN apt-get update && apt-get install -y \
    dc ruby nodejs python-pip curl libtinfo-dev libgmp3-dev \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

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
 && cd .. \
 && cabal install --lib dlist split murmur-hash memoize