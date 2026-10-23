#!/usr/bin/env bash
# Launch the whole app locally with one command: the three Brev embedding instances, their tunnels, the API and the web UI.
#
#   scripts/local-launch.sh start         start the Brev instances if needed, start the API and UI, open the browser;
#                                         the models connect in the background (no waiting)
#   scripts/local-launch.sh start --wait  ...but wait until the models answer before starting the app
#   scripts/local-launch.sh start --no-models   only the API and UI (also what happens when Brev is unavailable)
#   scripts/local-launch.sh connect       (re)connect the models: instances, Omni server, tunnels. Safe to repeat.
#   scripts/local-launch.sh watch         keep the tunnels alive: check them every 30 s and reopen any that dropped
#                                         (`start` runs this in the background after connecting)
#   scripts/local-launch.sh status        what is up
#   scripts/local-launch.sh stop          stop the API, the UI and the tunnels (GPU instances keep running)
#   scripts/local-launch.sh stop --gpus   ...and stop the Brev instances too, so they stop billing
#
# It is safe to run `start` again: whatever is already healthy is left alone.
# Settings can be overridden with environment variables, e.g.  QWEN_INSTANCE=my-qwen scripts/local-launch.sh start
#   QWEN_INSTANCE, OMNI_INSTANCE, COSMOS_INSTANCE   Brev instance names   (military-tan-rook, omni-embed, cosmos-embed1)
#                                  set COSMOS_INSTANCE= (empty) to leave the Cosmos-Embed1 instance out
#   QWEN_LOCAL_PORT, OMNI_LOCAL_PORT, COSMOS_LOCAL_PORT  local tunnel ports  (8011, 8002, 8012; must match backend/.env)
#   API_PORT, UI_PORT              backend and web UI ports         (8080, 5173)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/.local-launch"
mkdir -p "$RUN"

QWEN_INSTANCE="${QWEN_INSTANCE:-military-tan-rook}"
OMNI_INSTANCE="${OMNI_INSTANCE:-omni-embed}"
QWEN_LOCAL_PORT="${QWEN_LOCAL_PORT:-8011}"; QWEN_REMOTE_PORT=8001   # vLLM container, published on the instance as 8001
OMNI_LOCAL_PORT="${OMNI_LOCAL_PORT:-8002}"; OMNI_REMOTE_PORT=8002   # omni_embed_server.py (uvicorn) on the instance
COSMOS_INSTANCE="${COSMOS_INSTANCE-cosmos-embed1}"                  # empty = not used
COSMOS_LOCAL_PORT="${COSMOS_LOCAL_PORT:-8012}"; COSMOS_REMOTE_PORT=8000   # Cosmos-Embed1 NIM (created fresh by brev-cosmos-embed1.sh)
INSTANCES="$QWEN_INSTANCE $OMNI_INSTANCE${COSMOS_INSTANCE:+ $COSMOS_INSTANCE}"
API_PORT="${API_PORT:-8080}"
UI_PORT="${UI_PORT:-5173}"
WAIT_INSTANCE_S="${WAIT_INSTANCE_S:-900}"   # a GPU instance can take a few minutes to stop and then to boot
POLL_S="${POLL_S:-10}"
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
# `brev ls` is sometimes empty or an error for a moment (the Brev API can be flaky, especially after an outage), so ask
# a few times before concluding anything. Prints the table, or nothing if Brev never answered.
# The three model connectors run side by side and all ask for the instance list, so share one answer for a few seconds
# (Brev rate-limits its API) instead of every poll hitting it.
BREV_CACHE_S=8
brev_table() {
  local i out cache="$RUN/brev-ls.cache" now mtime
  now="$(date +%s)"; mtime="$(stat -f %m "$cache" 2>/dev/null || stat -c %Y "$cache" 2>/dev/null || echo 0)"
  if [ -s "$cache" ] && [ $((now - mtime)) -lt "$BREV_CACHE_S" ]; then cat "$cache"; return 0; fi
  for i in 1 2 3 4; do
    out="$(brev ls 2>/dev/null)" && echo "$out" | grep -q '^ *NAME ' && { echo "$out" > "$cache.$$" && mv "$cache.$$" "$cache"; echo "$out"; return 0; }
    sleep 2
  done
  return 1
}
instance_state() { brev_table | awk -v n="$1" '$1 == n { print $2 " " $4 }'; }   # "RUNNING READY"

kick_instance() {   # `brev start` in the background; remember that we did, so we do not start it twice
  say "Starting Brev instance $1 (GPU billing starts now)"
  : > "$RUN/started-$1"
  nohup brev start "$1" > "$RUN/brev-start-$1.log" 2>&1 &
}

start_instance() {
  local name="$1" st table
  table="$(brev_table)" || { warn "Brev did not answer for $name; the background connection will retry it"; return 0; }
  st="$(echo "$table" | awk -v n="$name" '$1 == n { print $2 " " $4 }')"
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

# Cosmos-Embed1: a container that is stopped and started again (which is also what rebooting the instance does) answers text
# queries but fails every video request, while a freshly created one works. So the container is never restarted: the setup
# script on the instance (scripts/brev-cosmos-embed1.sh) removes it and creates a new one, and this launcher runs that script
# whenever the container is not running, or when a real video request through the tunnel fails.
recreate_cosmos_container() {
  say "Creating a fresh Cosmos-Embed1 container on $COSMOS_INSTANCE (about a minute; the weights are cached)"
  limited 60 brev copy "$ROOT/scripts/brev-cosmos-embed1.sh" "$COSMOS_INSTANCE:~/" </dev/null >/dev/null 2>&1 \
    || { warn "could not copy brev-cosmos-embed1.sh to $COSMOS_INSTANCE"; return 1; }
  local out; out="$(limited 400 brev exec "$COSMOS_INSTANCE" "bash ~/brev-cosmos-embed1.sh 2>&1 | tail -3" </dev/null 2>&1)"
  if echo "$out" | grep -q "no NGC API key"; then
    warn "no NGC API key is stored on $COSMOS_INSTANCE yet. Run once:  brev shell $COSMOS_INSTANCE   then   bash ~/brev-cosmos-embed1.sh"
    return 1
  fi
  echo "$out" | grep -q "Started" || { warn "the setup script did not finish cleanly: $(echo "$out" | tail -1 | cut -c1-120)"; return 1; }
  return 0
}

ensure_cosmos_server() {
  [ -n "$COSMOS_INSTANCE" ] || return 0
  local state
  # brev exec prints the instance name as its last line, so pick the status word out of the output
  state="$(limited 25 brev exec "$COSMOS_INSTANCE" "docker inspect -f '{{.State.Status}}' cosmos-embed1 2>/dev/null || echo missing" </dev/null 2>/dev/null | grep -o -w -E 'running|restarting|exited|created|paused|dead|missing' | head -1)"
  case "$state" in
    running) ok "Cosmos-Embed1 container is running on $COSMOS_INSTANCE (a video request below checks that it really works)" ;;
    "") warn "could not reach $COSMOS_INSTANCE through brev exec (the Brev API may be down, or the instance is not ready); run 'scripts/local-launch.sh connect' again in a minute" ;;
    *) recreate_cosmos_container ;;   # exited / created / paused / dead / restarting / missing: always a new container
  esac
}

# A tiny two-second clip (16 frames, the NIM needs at least 8), made once with the ffmpeg that ships with the backend.
cosmos_probe_clip() {
  local f="$RUN/cosmos-probe.b64" ff
  [ -s "$f" ] && { cat "$f"; return 0; }
  ff="$("$ROOT/backend/.venv/bin/python" -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())' 2>/dev/null)"
  [ -n "$ff" ] || ff="$(command -v ffmpeg)"
  [ -n "$ff" ] || return 1
  "$ff" -loglevel error -y -f lavfi -i testsrc=duration=2:size=224x224:rate=8 -c:v libx264 -pix_fmt yuv420p "$RUN/cosmos-probe.mp4" 2>/dev/null || return 1
  base64 < "$RUN/cosmos-probe.mp4" | tr -d '\n' > "$f"; cat "$f"
}

# HTTP status of a real video embedding request through the tunnel (000 when the tunnel is down).
cosmos_video_status() {
  local b64; b64="$(cosmos_probe_clip)" || { echo skip; return; }
  printf '{"model":"nvidia/cosmos-embed1","request_type":"query","input":"data:video/mp4;base64,%s"}' "$b64" \
    | curl -s -m 60 -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' --data-binary @- "http://localhost:$COSMOS_LOCAL_PORT/v1/embeddings" 2>/dev/null || echo 000
}

# ---------- tunnels ----------
# brev refresh / port-forward are done one at a time across the parallel connectors (a mkdir lock), because bursts of them make
# the Brev API answer "rate limit exceeded".
brev_lock()   { local i=0; while ! mkdir "$RUN/brev.lock" 2>/dev/null; do i=$((i + 1)); [ "$i" -gt 90 ] && { rmdir "$RUN/brev.lock" 2>/dev/null; break; }; sleep 1; done; }
brev_unlock() { rmdir "$RUN/brev.lock" 2>/dev/null; }

ensure_tunnel() {   # instance, local port, remote port
  local name="$1" lport="$2" rport="$3" pid attempt
  pid="$(listener_pid "$lport")"
  if [ -n "$pid" ] && pid_cmd "$pid" | grep -q '^ssh'; then
    ok "tunnel localhost:$lport -> $name:$rport already up"; return 0
  fi
  [ -z "$pid" ] || die "local port $lport is used by another program (pid $pid: $(pid_cmd "$pid" | cut -c1-60)). Free it or set a different port."
  for attempt in 1 2 3 4 5 6; do
    brev_lock
    brev refresh >/dev/null 2>&1   # a restarted instance may have a new IP
    brev port-forward "$name" -p "$lport:$rport" > "$RUN/tunnel-$lport.log" 2>&1
    brev_unlock
    sleep 2
    [ -n "$(listener_pid "$lport")" ] && { ok "tunnel localhost:$lport -> $name:$rport"; return 0; }
    if grep -qi "rate limit" "$RUN/tunnel-$lport.log" 2>/dev/null; then
      warn "Brev says rate limit exceeded; retrying the tunnel to $name in $((attempt * 8))s"; sleep $((attempt * 8)); continue
    fi
    break
  done
  die "tunnel to $name failed (see $RUN/tunnel-$lport.log)"
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
# Prefix every line of a stream with a tag and flush at once (sed would hold the lines back until the stream ends).
tag_lines() { awk -v p="$1" '{ print p $0; fflush() }'; }

# Each model connects on its own: a slow instance (an H100 can take 10+ minutes to boot) must not hold back the others.
connect_qwen() {
  wait_instance "$QWEN_INSTANCE"
  ensure_tunnel "$QWEN_INSTANCE" "$QWEN_LOCAL_PORT" "$QWEN_REMOTE_PORT"
  wait_http "http://localhost:$QWEN_LOCAL_PORT/v1/models" "$WAIT_MODEL_S" qwen && ok "Qwen3-VL-Embedding answers" \
    || warn "Qwen did not answer within $((WAIT_MODEL_S / 60)) min; check: brev exec $QWEN_INSTANCE 'docker logs --tail 20 qwen3-vl-embedding'"
}

connect_omni() {
  wait_instance "$OMNI_INSTANCE"
  ensure_omni_server
  ensure_tunnel "$OMNI_INSTANCE" "$OMNI_LOCAL_PORT" "$OMNI_REMOTE_PORT"
  wait_http "http://localhost:$OMNI_LOCAL_PORT/info" "$WAIT_MODEL_S" omni && ok "Omni-Embed answers" \
    || warn "Omni-Embed did not answer within $((WAIT_MODEL_S / 60)) min; check: brev exec $OMNI_INSTANCE 'tail -20 omni.log'"
}

connect_cosmos() {
  wait_instance "$COSMOS_INSTANCE"
  ensure_cosmos_server
  ensure_tunnel "$COSMOS_INSTANCE" "$COSMOS_LOCAL_PORT" "$COSMOS_REMOTE_PORT"
  local ready="http://localhost:$COSMOS_LOCAL_PORT/v1/health/ready" st
  wait_http "$ready" "$WAIT_MODEL_S" cosmos \
    || { warn "Cosmos-Embed1 did not answer within $((WAIT_MODEL_S / 60)) min; check: brev exec $COSMOS_INSTANCE 'docker logs --tail 20 cosmos-embed1'"; return 0; }
  st="$(cosmos_video_status)"
  if [ "$st" = "200" ] || [ "$st" = "skip" ]; then
    ok "Cosmos-Embed1 answers$([ "$st" = skip ] && echo ' (video not checked: no ffmpeg found)' || echo ', video requests work')"; return 0
  fi
  warn "Cosmos-Embed1 is up but a video request fails (HTTP $st): a container that was restarted loses video decoding"
  recreate_cosmos_container || return 0
  wait_http "$ready" "$WAIT_MODEL_S" cosmos || { warn "Cosmos-Embed1 did not come back within $((WAIT_MODEL_S / 60)) min"; return 0; }
  st="$(cosmos_video_status)"
  [ "$st" = "200" ] && ok "Cosmos-Embed1 answers, video requests work (fresh container)" \
    || warn "video requests still fail (HTTP $st); see: brev exec $COSMOS_INSTANCE 'docker logs --tail 30 cosmos-embed1'"
}

# Idle ssh tunnels do not last: the one to the GCP-hosted Cosmos instance disappeared on its own, repeatedly, between tasks.
# So after connecting, the background process keeps going: every WATCH_S seconds it sends each model a small health request
# through its tunnel (which also keeps the connection from going idle) and reopens any tunnel that is gone.
WATCH_S="${WATCH_S:-30}"
watch_one() {   # tag, instance, local port, remote port, health url
  local tag="$1" inst="$2" lport="$3" rport="$4" url="$5" down="$RUN/watch-down-$1"
  if [ "$(http_code "$url")" = "200" ]; then
    [ -f "$down" ] && { rm -f "$down"; ok "$tag tunnel is back"; }
    return 0
  fi
  [ -n "$(listener_pid "$lport")" ] && return 0     # the tunnel is there; the model server is just not answering (loading)
  [ -f "$down" ] || { warn "$tag tunnel :$lport is down; reopening it ($(date +%T))"; : > "$down"; }
  ( ensure_tunnel "$inst" "$lport" "$rport" ) 2>&1 | tag_lines "[$tag] " || true
}

cmd_watch() {
  say "Watching the tunnels every ${WATCH_S}s ($(date +%T)); a dropped one is reopened"
  rm -f "$RUN"/watch-down-*; : > "$RUN/watching"; trap 'rm -f "$RUN/watching"' EXIT
  while true; do
    sleep "$WATCH_S"
    watch_one qwen "$QWEN_INSTANCE" "$QWEN_LOCAL_PORT" "$QWEN_REMOTE_PORT" "http://localhost:$QWEN_LOCAL_PORT/v1/models"
    watch_one omni "$OMNI_INSTANCE" "$OMNI_LOCAL_PORT" "$OMNI_REMOTE_PORT" "http://localhost:$OMNI_LOCAL_PORT/info"
    [ -z "$COSMOS_INSTANCE" ] || watch_one cosmos "$COSMOS_INSTANCE" "$COSMOS_LOCAL_PORT" "$COSMOS_REMOTE_PORT" "http://localhost:$COSMOS_LOCAL_PORT/v1/health/ready"
  done
}

cmd_connect() {
  command -v brev >/dev/null || die "the Brev CLI is not installed"
  say "Connecting the models ($(date +%T)); each one is reported as soon as it is ready"
  # The three run side by side; every line is tagged with its model. A failure in one (die exits only its own subshell)
  # leaves the others running.
  ( connect_qwen 2>&1 | tag_lines '[qwen]   ' ) &
  ( connect_omni 2>&1 | tag_lines '[omni]   ' ) &
  [ -z "$COSMOS_INSTANCE" ] || { ( connect_cosmos 2>&1 | tag_lines '[cosmos] ' ) & }
  wait
  say "Model connection finished ($(date +%T)); 'scripts/local-launch.sh status' shows which are up"
  [ "${1:-}" = "--watch" ] && cmd_watch
  return 0
}

spawn_connect() {   # run cmd_connect detached, once
  local pid; [ -f "$RUN/connect.pid" ] && pid="$(cat "$RUN/connect.pid")" || pid=
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then ok "already connecting the models in the background (pid $pid)"; return 0; fi
  nohup bash "${BASH_SOURCE[0]}" connect --watch >> "$RUN/connect.log" 2>&1 &
  echo $! > "$RUN/connect.pid"
  ok "connecting the models in the background; follow it with: tail -f $RUN/connect.log"
}

cmd_start() {
  local open_browser=1 wait_models=0 models=1 arg
  for arg in "$@"; do case "$arg" in --no-open) open_browser=0 ;; --wait) wait_models=1 ;; --no-models) models=0 ;; esac; done
  # The app itself needs no GPU: labeling, saved evaluations and comparisons work without the models. So if Brev cannot be
  # used (not installed, not logged in, or its API is down) the app still starts, without the models.
  if [ "$models" = 1 ]; then
    if ! command -v brev >/dev/null; then
      warn "the Brev CLI is not installed (brew install brevdev/homebrew-brev/brev): starting the app without the models"; models=0
    elif ! brev ls >/dev/null 2>&1; then
      warn "'brev ls' failed (not logged in: run 'brev login'; or the Brev API is unavailable): starting the app without the models"
      warn "when Brev works again, connect them with:  scripts/local-launch.sh connect"; models=0
    fi
  fi

  if [ "$models" = 1 ]; then
    say "Brev instances"
    rm -f "$RUN"/started-*
    for n in $INSTANCES; do start_instance "$n"; done   # started if needed; not waited for here
    if [ "$wait_models" = 1 ]; then
      cmd_connect                  # --wait: block until all models answer, then start the app
    else
      say "Models"
      spawn_connect                # tunnels and models come up in the background while the app starts
    fi
  fi

  say "App"
  start_api
  start_ui
  wait_http "http://localhost:$API_PORT/v1/model/list" 60 api && ok "API answers" || warn "API not answering yet (see $RUN/api.log)"
  wait_http "http://localhost:$UI_PORT/" 60 ui && ok "UI answers" || warn "UI not answering yet (see $RUN/ui.log)"

  printf '\n%s\n' "${B}Demo ready:${N} http://localhost:$UI_PORT"
  if [ "$models" = 0 ]; then
    printf '%s\n' "Running without the models: embedding and search will fail until you run 'scripts/local-launch.sh connect'."
  else
    [ "$wait_models" = 1 ] || printf '%s\n' "The models are still connecting; embedding and search work once 'scripts/local-launch.sh status' shows the tunnels up."
    printf '%s\n' "The Brev GPUs are billing. When you are done:  scripts/local-launch.sh stop --gpus"
  fi
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
  for n in api ui connect; do
    if [ -f "$RUN/$n.pid" ]; then pkill -P "$(cat "$RUN/$n.pid")" 2>/dev/null; kill "$(cat "$RUN/$n.pid")" 2>/dev/null; fi   # -P: the connector's children
    rm -f "$RUN/$n.pid"
  done
  rm -f "$RUN/watching" "$RUN"/watch-down-*
  kill_listener "$API_PORT" "app:app"      # also catches one started by hand
  kill_listener "$UI_PORT" "vite"
  kill_listener "$QWEN_LOCAL_PORT" "^ssh"; kill_listener "$OMNI_LOCAL_PORT" "^ssh"
  [ -z "$COSMOS_INSTANCE" ] || kill_listener "$COSMOS_LOCAL_PORT" "^ssh"
  if [ "${1:-}" = "--gpus" ]; then
    say "Stopping the Brev instances"
    for n in $INSTANCES; do
      case "$(instance_state "$n")" in
        RUNNING*) brev stop "$n" >/dev/null 2>&1 && ok "$n stopped" || warn "could not stop $n; stop it with: brev stop $n" ;;
        *)        ok "$n is not running" ;;
      esac
    done
  else
    warn "the Brev instances were left as they are; if any is running it is billing. Stop them with: scripts/local-launch.sh stop --gpus"
  fi
}

cmd_status() {
  printf '%s\n' "${B}Brev instances${N}"
  for n in $INSTANCES; do printf '    %-22s %s\n' "$n" "$(instance_state "$n" || true)"; done
  printf '%s\n' "${B}Services${N}"
  local c cp=; [ -f "$RUN/connect.pid" ] && cp="$(cat "$RUN/connect.pid")"
  if [ -n "$cp" ] && kill -0 "$cp" 2>/dev/null; then
    if [ -f "$RUN/watching" ]; then printf '    %-22s %s\n' "tunnel watch" "${G}running${N} (reopens dropped tunnels; tail -f $RUN/connect.log)"
    else printf '    %-22s %s\n' "model connect" "${Y}in progress${N} (tail -f $RUN/connect.log)"; fi
  fi
  c="$(http_code "http://localhost:$QWEN_LOCAL_PORT/v1/models")"; printf '    %-22s %s\n' "Qwen tunnel :$QWEN_LOCAL_PORT" "$([ "$c" = 200 ] && echo "${G}up${N}" || echo "${Y}down${N}")"
  c="$(http_code "http://localhost:$OMNI_LOCAL_PORT/info")";      printf '    %-22s %s\n' "Omni tunnel :$OMNI_LOCAL_PORT" "$([ "$c" = 200 ] && echo "${G}up${N}" || echo "${Y}down${N}")"
  if [ -n "$COSMOS_INSTANCE" ]; then
    c="$(http_code "http://localhost:$COSMOS_LOCAL_PORT/v1/health/ready")"; printf '    %-22s %s\n' "Cosmos tunnel :$COSMOS_LOCAL_PORT" "$([ "$c" = 200 ] && echo "${G}up${N}" || echo "${Y}down${N}")"
  fi
  c="$(http_code "http://localhost:$API_PORT/v1/model/list")";    printf '    %-22s %s\n' "API :$API_PORT" "$([ "$c" = 200 ] && echo "${G}up${N}" || echo "${Y}down${N}")"
  c="$(http_code "http://localhost:$UI_PORT/")";                  printf '    %-22s %s\n' "UI :$UI_PORT" "$([ "$c" = 200 ] && echo "${G}up${N}" || echo "${Y}down${N}")"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
case "${1:-}" in
  start)  shift; cmd_start "$@" ;;
  connect) shift; cmd_connect "$@" ;;
  watch)   cmd_watch ;;
  stop)   shift; cmd_stop "$@" ;;
  status) cmd_status ;;
  *)      sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
fi
