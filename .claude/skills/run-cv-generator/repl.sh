#!/usr/bin/env bash
# Keeps driver.mjs's REPL alive across separate shell invocations.
#
# There is no tmux on this machine, so the session is held open with a FIFO plus a
# writer that never closes it (a bare `echo > fifo` would send EOF and quit the REPL).
#
#   ./.claude/skills/run-cv-generator/repl.sh start
#   ./.claude/skills/run-cv-generator/repl.sh send 'text #name'
#   ./.claude/skills/run-cv-generator/repl.sh send 'cv tmp/mycv.js' 'ss after'
#   ./.claude/skills/run-cv-generator/repl.sh log
#   ./.claude/skills/run-cv-generator/repl.sh stop
#
# `send` prints only the output produced since the previous `send`.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DIR="$REPO/tmp/run-repl"
FIFO="$DIR/cmd"
LOG="$DIR/out.log"
OFF="$DIR/offset"
HOLDER="$DIR/holder.pid"

cd "$REPO"

case "${1:-}" in
start)
    shift
    "$0" stop >/dev/null 2>&1 || true
    mkdir -p "$DIR"
    rm -f "$FIFO" "$LOG" "$OFF"
    mkfifo "$FIFO"
    : > "$LOG"
    echo 0 > "$OFF"
    node "$REPO/.claude/skills/run-cv-generator/driver.mjs" repl "$@" < "$FIFO" >> "$LOG" 2>&1 &
    # Holds the write end open forever so the REPL never sees EOF.
    sleep 86400 > "$FIFO" &
    echo $! > "$HOLDER"
    for _ in $(seq 1 120); do
        grep -q '^ready$' "$LOG" && break
        sleep 1
    done
    cat "$LOG"
    wc -c < "$LOG" | tr -d ' ' > "$OFF"
    ;;
send)
    shift
    [ -p "$FIFO" ] || { echo "no session — run '$0 start' first" >&2; exit 1; }
    for c in "$@"; do printf '%s\n' "$c" > "$FIFO"; done
    sleep "${REPL_WAIT:-2}"
    tail -c "+$(( $(cat "$OFF") + 1 ))" "$LOG"
    wc -c < "$LOG" | tr -d ' ' > "$OFF"
    ;;
log)
    cat "$LOG"
    ;;
stop)
    [ -p "$FIFO" ] && printf 'quit\n' > "$FIFO" 2>/dev/null || true
    [ -f "$HOLDER" ] && kill "$(cat "$HOLDER")" 2>/dev/null || true
    sleep 1
    pkill -f 'driver.mjs repl' 2>/dev/null || true
    rm -f "$FIFO" "$HOLDER"
    echo stopped
    ;;
*)
    echo "usage: $0 start|send <cmd>...|log|stop" >&2
    exit 2
    ;;
esac
