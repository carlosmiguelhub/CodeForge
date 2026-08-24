#!/bin/sh
set -eu

mkdir -p /tmp/out

# Docker Desktop forwards dockerode's attach request body into the hijacked
# stdin stream. The runner deliberately terminates that internal body as one
# line before starting the container; consume it here so student code receives
# only input explicitly sent from the browser.
IFS= read -r _sqweb_attach_handshake || true

case "${LANGUAGE:-}" in
  python)
    exec python3 -u /workspace/src/main.py
    ;;
  java)
    if ! javac -d /tmp/out /workspace/src/Main.java 2>/tmp/compile.log; then
      cat /tmp/compile.log >&2
      exit 42
    fi
    exec java -cp /tmp/out Main
    ;;
  c)
    if ! gcc -O2 -o /tmp/out/a.out /workspace/src/main.c 2>/tmp/compile.log; then
      cat /tmp/compile.log >&2
      exit 42
    fi
    # Line buffering still hides prompts without a newline (for example,
    # printf("Name: ") immediately before scanf). Fully unbuffer stdout and
    # stderr so prompts reach the browser before the program blocks on input.
    exec stdbuf -o0 -e0 /tmp/out/a.out
    ;;
  cpp)
    if ! g++ -O2 -o /tmp/out/a.out /workspace/src/main.cpp 2>/tmp/compile.log; then
      cat /tmp/compile.log >&2
      exit 42
    fi
    exec stdbuf -o0 -e0 /tmp/out/a.out
    ;;
  javascript)
    exec node --require /usr/local/lib/node-interactive-preload.cjs /workspace/src/main.js
    ;;
  *)
    echo "Unsupported LANGUAGE" >&2
    exit 64
    ;;
esac
