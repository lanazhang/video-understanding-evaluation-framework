#!/usr/bin/env bash
# Launch the whole app locally with one command: the two Brev embedding instances, their tunnels, the API and the web UI.
#
#   scripts/local-launch.sh start         start the Brev instances if needed, start the API and UI, open the browser;
#                                         the models connect in the background (no waiting)
#   scripts/local-launch.sh start --wait  ...but wait until both models answer before starting the app
#   scripts/local-launch.sh connect       (re)connect the models: instances, Omni server, tunnels. Safe to repeat.
#   scripts/local-launch.sh status        what is up
#   scripts/local-launch.sh stop          stop the API, the UI and the tunnels (GPU instances keep running)
#   scripts/local-launch.sh stop --gpus   ...and stop the Brev instances too, so they stop billing
#
# It is safe to run `start` again: whatever is already healthy is left alone.
# Settings can be overridden with environment variables, e.g.  QWEN_INSTANCE=my-qwen scripts/local-launch.sh start
#   QWEN_INSTANCE, OMNI_INSTANCE   Brev instance names            (military-tan-rook, omni-embed)
#   QWEN_LOCAL_PORT, OMNI_LOCAL_PORT  local tunnel ports            (8011, 8002; must match backend/.env)
#   API_PORT, UI_PORT              backend and web UI ports         (8080, 5173)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/.local-launch"
mkdir -p "$RUN"

QWEN_INSTANCE="${QWEN_INSTANCE:-military-tan-rook}"
OMNI_INSTANCE="${OMNI_INSTANCE:-omni-embed}"
QWEN_LOCAL_PORT="${QWEN_LOCAL_PORT:-8011}"; QWEN_REMOTE_PORT=8001   # vLLM container, published on the instance as 8001
OMNI_LOCAL_PORT="${OMNI_LOCAL_PORT:-8002}"; OMNI_REMOTE_PORT=8002   # omni_embed_server.py (uvicorn) on the instance
API_PORT="${API_PORT:-8080}"
UI_PORT="${UI_PORT:-5173}"
WAIT_INSTANCE_S="${WAIT_INSTANCE_S:-900}"   # a GPU instance can take a few minutes to stop and then to boot
POLL_S="${POLL_S:-5}"
WAIT_MODEL_S=300      # loading the model after boot

if [ -t 1 ]; then G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; B=$'\033[1m'; N=$'\033[0m'; else G=; Y=; R=; B=; N=; fi
say()  { printf '%s\n' "${B}==>${N} $*"; }
ok()   { printf '    %s\n' "${G}ok${N}  $*"; }
warn() { printf '    %s\n' "${Y}!!${N}  $*"; }
die()  { printf '%s\n' "${R}error:${N} $*" >&2; exit 1; }

# run a command with a time limit (macOS has no `timeout`)
limited() { local s="$1"; shift; perl -e 'alarm shift; exec @ARGV' "$s" "$@"; }

http_code() { curl -s -m 4 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true; }
wait_http() {  # url, seconds, label
  local url="$1" secs="$2" label="$3" t=0
  while [ "$t" -lt "$secs" ]; do
    [ "$(http_code "$url")" = "200" ] && return 0
    sleep 3; t=$((t + 3))
  done
  return 1
}

listener_pid() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1; }
pid_cmd()      { ps -o command= -p "$1" 2>/dev/null; }

# ---------- Brev instances ----------
instance_state() { brev ls 2>/dev/null | awk -v n="$1" '$1 == n { print $2 " " $4 }'; }   # "RUNNING READY"

kick_instance() {   # `brev start` in the background; remember that we did, so we do not start it twice
  say "Starting Brev instance $1 (GPU billing starts now)"
  : > "$RUN/started-$1"
  nohup brev start "$1" > "$RUN/brev-start-$1.log" 2>&1 &
}

start_instance() {
  local name="$1" st; st="$(instance_state "$name")"
  [ -n "$st" ] || die "Brev instance '$name' not found. Check the name with: brev ls"
  case "$st" in
    "RUNNING READY") ok "$name already running" ;;
    STOPPED*)        kick_instance "$name" ;;
    STOPPING*)       say "$name is still stopping; it is started as soon as it has stopped" ;;
    *)               say "$name is ${st%% *}; waiting for it" ;;
  esac
}

wait_instance() {
  local name="$1" t=0 st
  while [ "$t" -lt "$WAIT_INSTANCE_S" ]; do
    st="$(instance_state "$name")"
    case "$st" in
      "RUNNING READY") ok "$name is running"; return 0 ;;
      STOPPED*)        [ -f "$RUN/started-$name" ] || kick_instance "$name" ;;   # it finished stopping while we waited
      STARTING*|RUNNING*)   # Brev's status can lag well behind the instance; if SSH already works, go on
        if [ $((t % 30)) -lt "$POLL_S" ] && limited 25 brev exec "$name" true </dev/null >/dev/null 2>&1; then
          ok "$name is up (reachable over SSH; Brev still reports ${st%% *})"; return 0
        fi ;;
    esac
    sleep "$POLL_S"; t=$((t + POLL_S))
    [ $((t % 30)) -lt "$POLL_S" ] && printf '    ...  %s: %s (waited %ss)\n' "$name" "${st%% *}" "$t"
  done
  die "$name did not become RUNNING/READY within $((WAIT_INSTANCE_S / 60)) minutes (see $RUN/brev-start-$name.log)"
}

# Omni-Embed is a plain uvicorn process (no Docker, no systemd), so it is gone after a stop/start. Qwen's container restarts itself.
ensure_omni_server() {
  if limited 25 brev exec "$OMNI_INSTANCE" "curl -s -m 3 localhost:$OMNI_REMOTE_PORT/info" </dev/null 2>/dev/null | grep -q '"dim\|dim"'; then
    ok "Omni-Embed server is running on $OMNI_INSTANCE"; return 0
  fi
  say "Starting the Omni-Embed server on $OMNI_INSTANCE"
  limited 60 brev exec "$OMNI_INSTANCE" "cd ~ && ATTN_IMPLEMENTATION=sdpa setsid nohup ~/omni/bin/uvicorn omni_embed_server:app --host 127.0.0.1 --port $OMNI_REMOTE_PORT > omni.log 2>&1 < /dev/null &" </dev/null >/dev/null 2>&1 \
    || warn "could not start it through brev exec; start it by hand (see backend/README.md)"
}

# ---------- tunnels ----------
ensure_tunnel() {   # instance, local port, remote port
  local name="$1" lport="$2" rport="$3" pid
  pid="$(listener_pid "$lport")"
  if [ -n "$pid" ] && pid_cmd "$pid" | grep -q '^ssh'; then
    ok "tunnel localhost:$lport -> $name:$rport already up"; return 0
  fi
  [ -z "$pid" ] || die "local port $lport is used by another program (pid $pid: $(pid_cmd "$pid" | cut -c1-60)). Free it or set a different port."
  brev refresh >/dev/null 2>&1   # a restarted instance may have a new IP
  brev port-forward "$name" -p "$lport:$rport" > "$RUN/tunnel-$lport.log" 2>&1
  sleep 2
  [ -n "$(listener_pid "$lport")" ] && ok "tunnel localhost:$lport -> $name:$rport" || die "tunnel to $name failed (see $RUN/tunnel-$lport.log)"
}

# ---------- API and UI ----------
start_proc() {   # name, port, matcher, then the command to run (in the background)
  local name="$1" port="$2" match="$3"; shift 3
  local pid; pid="$(listener_pid "$port")"
  if [ -n "$pid" ]; then
    if pid_cmd "$pid" | grep -q "$match"; then
      ok "$name already running on :$port (pid $pid). If you changed code, run 'scripts/local-launch.sh stop' first."; return 0
    fi
    die "port $port is used by another program (pid $pid: $(pid_cmd "$pid" | cut -c1-60))"
  fi
  say "Starting $name on :$port"
  nohup "$@" > "$RUN/$name.log" 2>&1 &
  echo $! > "$RUN/$name.pid"
}

start_api() {
  [ -x "$ROOT/backend/.venv/bin/uvicorn" ] || die "backend is not set up. See backend/README.md (one-time setup)."
  cd "$ROOT/backend" || exit 1
  BACKEND_PORT="$API_PORT" CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:$UI_PORT}" \
    start_proc api "$API_PORT" "app:app" .venv/bin/uvicorn app:app --port "$API_PORT"
}

start_ui() {
  [ -d "$ROOT/frontend/node_modules" ] || die "frontend is not set up. Run: cd frontend && npm install"
  cd "$ROOT/frontend" || exit 1
  VITE_API_BASE_URL="http://localhost:$API_PORT/v1/" \
    start_proc ui "$UI_PORT" "vite" npm run dev -- --port "$UI_PORT" --strictPort
}

# ---------- commands ----------
# Brings the models up: waits for the instances, starts the Omni server, opens the tunnels, waits for the models to answer.
# `start` runs this in the background, so the app is usable straight away; run it by hand to re-connect after a dropped tunnel.
cmd_connect() {
  command -v brev >/dev/null || die "the Brev CLI is not installed"
  say "Connecting the models ($(date +%T))"
  wait_instance "$QWEN_INSTANCE"; wait_instance "$OMNI_INSTANCE"
  ensure_omni_server

  say "Tunnels"
  ensure_tunnel "$QWEN_INSTANCE" "$QWEN_LOCAL_PORT" "$QWEN_REMOTE_PORT"
  ensure_tunnel "$OMNI_INSTANCE" "$OMNI_LOCAL_PORT" "$OMNI_REMOTE_PORT"

  say "Waiting for the models to answer (loading takes a minute after a boot)"
  wait_http "http://localhost:$QWEN_LOCAL_PORT/v1/models" "$WAIT_MODEL_S" qwen && ok "Qwen3-VL-Embedding answers" \
    || warn "Qwen did not answer within $((WAIT_MODEL_S / 60)) min; check: brev exec $QWEN_INSTANCE 'docker logs --tail 20 qwen3-vl-embedding'"
  wait_http "http://localhost:$OMNI_LOCAL_PORT/info" "$WAIT_MODEL_S" omni && ok "Omni-Embed answers" \
    || warn "Omni-Embed did not answer within $((WAIT_MODEL_S / 60)) min; check: brev exec $OMNI_INSTANCE 'tail -20 omni.log'"
  say "Models connected ($(date +%T))"
}

spawn_connect() {   # run cmd_connect detached, once
  local pid; [ -f "$RUN/connect.pid" ] && pid="$(cat "$RUN/connect.pid")" || pid=
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then ok "already connecting the models in the background (pid $pid)"; return 0; fi
  nohup bash "${BASH_SOURCE[0]}" connect >> "$RUN/connect.log" 2>&1 &
  echo $! > "$RUN/connect.pid"
  ok "connecting the models in the background; follow it with: tail -f $RUN/connect.log"
}

cmd_start() {
  local open_browser=1 wait_models=0 arg
  for arg in "$@"; do case "$arg" in --no-open) open_browser=0 ;; --wait) wait_models=1 ;; esac; done
  command -v brev >/dev/null || die "the Brev CLI is not installed (brew install brevdev/homebrew-brev/brev)"
  brev ls >/dev/null 2>&1 || die "'brev ls' failed. Run: brev login"

  say "Brev instances"
  rm -f "$RUN"/started-*
  start_instance "$QWEN_INSTANCE"; start_instance "$OMNI_INSTANCE"   # started if needed; not waited for here

  if [ "$wait_models" = 1 ]; then
    cmd_connect                  # --wait: block until both models answer, then start the app
  else
    say "Models"
    spawn_connect                # tunnels and models come up in the background while the app starts
  fi

  say "App"
  start_api
  start_ui
  wait_http "http://localhost:$API_PORT/v1/model/list" 60 api && ok "API answers" || warn "API not answering yet (see $RUN/api.log)"
  wait_http "http://localhost:$UI_PORT/" 60 ui && ok "UI answers" || warn "UI not answering yet (see $RUN/ui.log)"

  printf '\n%s\n' "${B}Demo ready:${N} http://localhost:$UI_PORT"
  if [ "$wait_models" = 0 ]; then
    printf '%s\n' "The models are still connecting; embedding and search work once 'scripts/local-launch.sh status' shows both tunnels up."
  fi
  printf '%s\n' "The Brev GPUs are billing. When you are done:  scripts/local-launch.sh stop --gpus"
  if [ "$open_browser" = 1 ]; then open "http://localhost:$UI_PORT" 2>/dev/null || xdg-open "http://localhost:$UI_PORT" 2>/dev/null || true; fi
}

kill_listener() {   # port, matcher
  local pid; pid="$(listener_pid "$1")"
  if [ -n "$pid" ] && pid_cmd "$pid" | grep -q "$2"; then
    kill "$pid" 2>/dev/null; ok "stopped $2 on :$1 (pid $pid)"
  fi
}

cmd_stop() {
  say "Stopping the app"
  for n in api ui connect; do [ -f "$RUN/$n.pid" ] && kill "$(cat "$RUN/$n.pid")" 2>/dev/null; rm -f "$RUN/$n.pid"; done
  kill_listener "$API_PORT" "app:app"      # also catches one started by hand
  kill_listener "$UI_PORT" "vite"
  kill_listener "$QWEN_LOCAL_PORT" "^ssh"; kill_listener "$OMNI_LOCAL_PORT" "^ssh"
  if [ "${1:-}" = "--gpus" ]; then
    say "Stopping the Brev instances"
    for n in "$QWEN_INSTANCE" "$OMNI_INSTANCE"; do
      case "$(instance_state "$n")" in
        RUNNING*) brev stop "$n" >/dev/null 2>&1 && ok "$n stopped" || warn "could not stop $n; stop it with: brev stop $n" ;;
        *)        ok "$n is not running" ;;
      esac
    done
  else
    warn "the GPU instances are still running and billing; stop them with: scripts/local-launch.sh stop --gpus"
  fi
}

cmd_status() {
  printf '%s\n' "${B}Brev instances${N}"
  for n in "$QWEN_INSTANCE" "$OMNI_INSTANCE"; do printf '    %-22s %s\n' "$n" "$(instance_state "$n" || true)"; done
  printf '%s\n' "${B}Services${N}"
  local c cp=; [ -f "$RUN/connect.pid" ] && cp="$(cat "$RUN/connect.pid")"
  if [ -n "$cp" ] && kill -0 "$cp" 2>/dev/null; then printf '    %-22s %s\n' "model connect" "${Y}in progress${N} (tail -f $RUN/connect.log)"; fi
  c="$(http_code "http://localhost:$QWEN_LOCAL_PORT/v1/models")"; printf '    %-22s %s\n' "Qwen tunnel :$QWEN_LOCAL_PORT" "$([ "$c" = 200 ] && echo "${G}up${N}" || echo "${Y}down${N}")"
  c="$(http_code "http://localhost:$OMNI_LOCAL_PORT/info")";      printf '    %-22s %s\n' "Omni tunnel :$OMNI_LOCAL_PORT" "$([ "$c" = 200 ] && echo "${G}up${N}" || echo "${Y}down${N}")"
  c="$(http_code "http://localhost:$API_PORT/v1/model/list")";    printf '    %-22s %s\n' "API :$API_PORT" "$([ "$c" = 200 ] && echo "${G}up${N}" || echo "${Y}down${N}")"
  c="$(http_code "http://localhost:$UI_PORT/")";                  printf '    %-22s %s\n' "UI :$UI_PORT" "$([ "$c" = 200 ] && echo "${G}up${N}" || echo "${Y}down${N}")"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
case "${1:-}" in
  start)  shift; cmd_start "$@" ;;
  connect) cmd_connect ;;
  stop)   shift; cmd_stop "$@" ;;
  status) cmd_status ;;
  *)      sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
fi
