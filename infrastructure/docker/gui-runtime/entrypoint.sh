#!/bin/sh
set -eu

DISPLAY_NUM=99
export DISPLAY=":${DISPLAY_NUM}"

# Xvfb refuses to auto-create /tmp/.X11-unix itself when not running as
# root ("_XSERVTransmkdir: ERROR: euid != 0") — a fresh tmpfs mount at
# /tmp (this image's writable path under both the Docker and Kubernetes
# admins) never has it, so create it ourselves first. /tmp itself is
# mode 1777 (world-writable + sticky), so the non-root `student` user can
# do this.
mkdir -p /tmp/.X11-unix

Xvfb "${DISPLAY}" -screen 0 1280x800x24 -nolisten tcp &

# Wait for the X socket rather than a fixed sleep — Xvfb's startup time
# varies with host load.
for _ in $(seq 1 50); do
  [ -e "/tmp/.X11-unix/X${DISPLAY_NUM}" ] && break
  sleep 0.1
done
if [ ! -e "/tmp/.X11-unix/X${DISPLAY_NUM}" ]; then
  echo "Xvfb did not start in time" >&2
  exit 1
fi

fluxbox &

# -localhost: only reachable via the co-located websockify process below,
# never directly — the WS-grant check in gui-execution-api plus the
# container/pod network isolation are the real trust boundary (see plan
# section 8, item 4).
x11vnc -display "${DISPLAY}" -forever -shared -rfbport 5900 -localhost -nopw -quiet &

websockify --web=/usr/share/novnc 6080 localhost:5900 &

mkdir -p /tmp/out
if ! javac -d /tmp/out /workspace/src/*.java 2>/tmp/compile.log; then
  cat /tmp/compile.log >&2
  # Distinctive exit code so the provisioning worker/reaper can tell
  # "compile failed" apart from a runtime crash or an external SIGTERM.
  exit 42
fi

# `exec` replaces this shell with the JVM (PID 1), so SIGTERM from the
# platform (hard runtime cap, Stop button, activeDeadlineSeconds) reaches
# it directly instead of an intermediate shell swallowing the signal.
exec java -cp /tmp/out "${MAIN_CLASS}"
