#!/usr/bin/env bash
# Run this ON the Brev instance that hosts Cosmos-Embed1 (brev shell cosmos-embed1), not on your laptop.
# It always creates a FRESH container of the Cosmos-Embed1 NIM, so it is also what to run to repair or restart it.
#
#   brev copy scripts/brev-cosmos-embed1.sh cosmos-embed1:~/        # from your laptop, once
#   brev shell cosmos-embed1
#   bash ~/brev-cosmos-embed1.sh        # first time: asks for the NGC API key (hidden) and remembers it; later: no prompt
#
# Why fresh every time: on the L4 image this was written for, a container that is stopped and started again (also what
# a reboot of the instance does) answers text queries but fails every video request with "All 1 inputs failed during
# processing", while a newly created container works. The reason is not known, so the container is never restarted: it
# is removed and created again (this takes about a minute, the model weights stay cached). It therefore has no restart
# policy; scripts/local-launch.sh runs this script whenever it finds the NIM broken or down.
#
# The NGC API key comes from $NGC_API_KEY, from ~/.config/cosmos-embed1/ngc.env (written on the first run, mode 600), or
# from a hidden prompt. It is never part of a command line. Docker also keeps the registry login (~/.docker/config.json) and
# the container environment on this instance's disk; that is fine for a single-user instance, not for a shared one.
set -euo pipefail

IMAGE="${COSMOS_IMAGE:-nvcr.io/nim/nvidia/cosmos-embed1:1.1.0}"
NAME=cosmos-embed1
CACHE="$HOME/.cache/cosmos-embed1"            # model weights, kept across containers
KEYFILE="$HOME/.config/cosmos-embed1/ngc.env"
LIBDIR=/usr/lib/x86_64-linux-gnu

# ---- the NGC key ----
if [ -z "${NGC_API_KEY:-}" ] && [ -s "$KEYFILE" ]; then
  NGC_API_KEY="$(grep '^NGC_API_KEY=' "$KEYFILE" | head -1 | cut -d= -f2-)"
fi
if [ -z "${NGC_API_KEY:-}" ]; then
  [ -t 0 ] || { echo "no NGC API key stored and no terminal to ask on; run this once from 'brev shell $NAME'" >&2; exit 1; }
  read -r -s -p "NGC API key (input is hidden): " NGC_API_KEY
  echo
fi
[ -n "$NGC_API_KEY" ] || { echo "no key given" >&2; exit 1; }
if [ ! -s "$KEYFILE" ]; then
  mkdir -p "$(dirname "$KEYFILE")"; chmod 700 "$(dirname "$KEYFILE")"
  ( umask 077; printf 'NGC_API_KEY=%s\n' "$NGC_API_KEY" > "$KEYFILE" )
fi

# ---- the NVIDIA video libraries ----
# The NIM decodes video on the GPU and needs NVIDIA's video libraries (NVENC/NVDEC). Some cloud GPU images ship the
# compute-only driver without them, and the container toolkit then cannot pass them in ("Failed to load NVENC library:
# libnvidia-encode.so.1"). Install the matching libraries once, and mount them into the container below.
if ! ls "$LIBDIR"/libnvidia-encode.so.* >/dev/null 2>&1; then
  DRV="$(grep -o -E '[0-9]{3}\.[0-9]+\.[0-9]+' /proc/driver/nvidia/version | head -1)"
  BRANCH="${DRV%%.*}"
  echo "Installing the NVIDIA video libraries for driver $DRV ..."
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q "libnvidia-encode-${BRANCH}-server" "libnvidia-decode-${BRANCH}-server" \
    || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q "libnvidia-encode-${BRANCH}" "libnvidia-decode-${BRANCH}"
fi
ENC="$(ls "$LIBDIR"/libnvidia-encode.so.[0-9]*.* 2>/dev/null | head -1)"
DEC="$(ls "$LIBDIR"/libnvcuvid.so.[0-9]*.* 2>/dev/null | head -1)"
[ -n "$ENC" ] && [ -n "$DEC" ] || { echo "NVENC/NVDEC libraries not found after install" >&2; exit 1; }

# ---- registry login and a fresh container ----
echo "Logging in to nvcr.io ..."
printf '%s' "$NGC_API_KEY" | docker login nvcr.io -u '$oauthtoken' --password-stdin >/dev/null

mkdir -p "$CACHE"
chmod 777 "$CACHE"   # the NIM runs as a different user and must be able to write its cache

docker rm -f "$NAME" >/dev/null 2>&1 || true
echo "Creating a fresh $NAME container from $IMAGE (the first time this downloads the image and the model; allow several minutes) ..."
# Published on the instance's loopback only: reach it through `brev port-forward`, never from the internet.
# --env-file keeps the key out of the process list; no --restart policy, see the note at the top.
umask 077
ENVFILE="$(mktemp /dev/shm/cosmos-env.XXXXXX)"
trap 'rm -f "$ENVFILE"' EXIT
printf 'NGC_API_KEY=%s\n' "$NGC_API_KEY" > "$ENVFILE"
docker run -d --name "$NAME" \
  --runtime=nvidia --gpus device=0 \
  -p 127.0.0.1:8000:8000 \
  --env-file "$ENVFILE" \
  -v "$CACHE:/opt/nim/.cache" \
  -v "$ENC:$LIBDIR/libnvidia-encode.so.1:ro" \
  -v "$DEC:$LIBDIR/libnvcuvid.so.1:ro" \
  --shm-size=16g --tmpfs /tmp/ram:rw,size=2g \
  "$IMAGE" >/dev/null

echo
echo "Started. Follow the start-up:   docker logs -f $NAME"
echo "Ready when this answers:        curl -s localhost:8000/v1/health/ready   (about a minute)"
