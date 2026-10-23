#!/usr/bin/env bash
# Download a YouTube video as an .mp4 the app can use (H.264 video + AAC audio) into data/downloads/.
#
#   tools/download-youtube.sh URL                       720p into data/downloads/<title>.mp4
#   tools/download-youtube.sh -q 480 URL                at most 480p (360, 480, 720 or 1080)
#   tools/download-youtube.sh -o my_keynote URL         name the file (no extension)
#   tools/download-youtube.sh -d ~/Movies URL           another folder
#   tools/download-youtube.sh --info URL                title, length and the size of each quality; downloads nothing
#   tools/download-youtube.sh --dry-run URL             print the yt-dlp command; runs nothing
#
# URL may be a youtube.com / youtu.be link or the 11 character video id. Only a single video is fetched, never a playlist.
#
# What it sets up for you (first run, needs the network):
#   - yt-dlp: the one on your PATH, else a private copy in tools/.venv (created automatically, git-ignored)
#   - a certificate bundle, because the Python of some Macs has none ("CERTIFICATE_VERIFY_FAILED")
#   - ffmpeg, to join the separate video and audio streams: the one bundled with the backend (backend/.venv), else `ffmpeg`
#
# Only download videos you have the right to use (your own, your employer's, or with permission). YouTube's terms do not
# allow downloading without it.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/tools"
DEST="$ROOT/data/downloads"
QUALITY=720
NAME=""
MODE=download   # download | info | dry-run
FORCE=0
URL=""

die()  { printf 'error: %s\n' "$*" >&2; exit 1; }
say()  { printf '==> %s\n' "$*"; }
usage() { sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    -q|--quality) [ $# -ge 2 ] || die "$1 needs a value"; QUALITY="$2"; shift 2 ;;
    -o|--output)  [ $# -ge 2 ] || die "$1 needs a value"; NAME="$2"; shift 2 ;;
    -d|--dir)     [ $# -ge 2 ] || die "$1 needs a value"; DEST="$2"; shift 2 ;;
    --info)       MODE=info; shift ;;
    --dry-run)    MODE=dry-run; shift ;;
    --force)      FORCE=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    --)           shift; break ;;
    -*)           die "unknown option $1 (see --help)" ;;
    *)            [ -z "$URL" ] || die "give one URL only"; URL="$1"; shift ;;
  esac
done
[ -z "$URL" ] && [ $# -gt 0 ] && URL="$1"
[ -n "$URL" ] || { usage; exit 1; }

case "$QUALITY" in 360|480|720|1080) ;; *) die "quality must be 360, 480, 720 or 1080" ;; esac
if [ -n "$NAME" ]; then
  case "$NAME" in */*|*..*|.*) die "-o takes a plain file name without folders or extension" ;; esac
fi

# ---- the URL: a youtube link or a bare id, turned into one canonical watch URL (never starts with "-") ----
if printf '%s' "$URL" | grep -Eq '^[A-Za-z0-9_-]{11}$'; then
  VIDEO_ID="$URL"
elif printf '%s' "$URL" | grep -Eq '^https?://(www\.|m\.|music\.)?(youtube\.com|youtu\.be)/'; then
  VIDEO_ID="$(printf '%s' "$URL" | sed -nE 's#.*[?&]v=([A-Za-z0-9_-]{11}).*#\1#p; s#^https?://youtu\.be/([A-Za-z0-9_-]{11}).*#\1#p; s#.*/(shorts|live|embed)/([A-Za-z0-9_-]{11}).*#\2#p' | head -1)"
else
  die "not a YouTube link or video id: $URL"
fi
[ -n "${VIDEO_ID:-}" ] || die "could not find the video id in: $URL"
WATCH_URL="https://www.youtube.com/watch?v=$VIDEO_ID"

# ---- yt-dlp ----
find_ytdlp() {
  if [ -n "${YT_DLP:-}" ] && [ -x "$YT_DLP" ]; then echo "$YT_DLP"; return; fi
  if command -v yt-dlp >/dev/null 2>&1; then command -v yt-dlp; return; fi
  if [ -x "$TOOLS/.venv/bin/yt-dlp" ]; then echo "$TOOLS/.venv/bin/yt-dlp"; return; fi
  return 1
}
if ! YTDLP="$(find_ytdlp)"; then
  if [ "$MODE" = dry-run ]; then
    YTDLP="$TOOLS/.venv/bin/yt-dlp"   # shown in the printed command; it would be installed on the first real run
  else
    say "Installing yt-dlp into tools/.venv (one time) ..."
    python3 -m venv "$TOOLS/.venv" >/dev/null 2>&1 || die "could not create tools/.venv (is python3 installed?)"
    "$TOOLS/.venv/bin/pip" install -q yt-dlp certifi >/dev/null 2>&1 || die "could not install yt-dlp (network?). Or: brew install yt-dlp"
    YTDLP="$TOOLS/.venv/bin/yt-dlp"
  fi
fi

# ---- certificates (only when the Python in use has none of its own) ----
if [ -z "${SSL_CERT_FILE:-}" ] && [ -x "$TOOLS/.venv/bin/python" ]; then
  CA="$("$TOOLS/.venv/bin/python" -c 'import certifi; print(certifi.where())' 2>/dev/null || true)"
  [ -n "$CA" ] && export SSL_CERT_FILE="$CA"
fi

# ---- ffmpeg, for joining video and audio ----
find_ffmpeg() {
  if [ -x "$ROOT/backend/.venv/bin/python" ]; then
    local f; f="$("$ROOT/backend/.venv/bin/python" -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())' 2>/dev/null || true)"
    [ -n "$f" ] && [ -x "$f" ] && { echo "$f"; return; }
  fi
  command -v ffmpeg 2>/dev/null
}
FFMPEG="$(find_ffmpeg || true)"
if [ -z "$FFMPEG" ] && [ "$MODE" = download ]; then
  die "no ffmpeg found. Set up the backend first (backend/README.md) or: brew install ffmpeg"
fi

# ---- --info: what is there and how big each quality is ----
INFO_PY=$(cat <<'PY'
import json, sys
d = json.load(sys.stdin)
def mb(b): return "%s MB" % format(round(b / 1048576), ",") if b else "unknown"
def size(f): return f.get("filesize") or f.get("filesize_approx") or 0
print("title:    %s" % d.get("title"))
print("channel:  %s" % (d.get("channel") or d.get("uploader")))
print("length:   %s" % d.get("duration_string"))
fm = d.get("formats", [])
audio = [f for f in fm if f.get("vcodec") == "none" and f.get("ext") == "m4a" and size(f)]
a = max(audio, key=lambda f: f.get("abr") or 0, default=None)
asz = size(a) if a else 0
print("download sizes (H.264 video + AAC audio):")
for h in (360, 480, 720, 1080):
    vids = [f for f in fm if (f.get("vcodec") or "").startswith("avc1") and f.get("height") == h and size(f)]
    v = max(vids, key=lambda f: f.get("tbr") or 0, default=None)
    if v:
        print("  %dp %s fps  about %s" % (h, int(v.get("fps") or 0), mb(size(v) + asz)))
PY
)
if [ "$MODE" = info ]; then
  say "Looking up $WATCH_URL"
  "$YTDLP" --no-playlist --skip-download -J -- "$WATCH_URL" 2>/dev/null | python3 -c "$INFO_PY" \
    || die "could not read the video (wrong link, private video, or no network)"
  exit 0
fi

# ---- the file name: given, or made from the title ----
slug() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g; s/^_+|_+$//g' | cut -c1-80; }
if [ -z "$NAME" ]; then
  if [ "$MODE" = dry-run ]; then
    NAME="<title>"
  else
    TITLE="$("$YTDLP" --no-playlist --skip-download --print title -- "$WATCH_URL" 2>/dev/null | tail -1)"
    [ -n "$TITLE" ] || die "could not read the video title (wrong link, private video, or no network)"
    NAME="$(slug "$TITLE")"
    [ -n "$NAME" ] || NAME="youtube_$VIDEO_ID"
  fi
fi
OUT="$DEST/$NAME.mp4"

# H.264 + AAC first (plays everywhere and is what the app's ffmpeg handles best), then anything up to the height
FORMAT="bv*[height<=$QUALITY][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=$QUALITY]+ba/b[height<=$QUALITY]"
CMD=("$YTDLP" -f "$FORMAT" --merge-output-format mp4 --no-playlist --newline)
[ -n "$FFMPEG" ] && CMD+=(--ffmpeg-location "$FFMPEG")
CMD+=(-o "$DEST/$NAME.%(ext)s" -- "$WATCH_URL")

if [ "$MODE" = dry-run ]; then
  printf 'would run:\n  '; printf '%q ' "${CMD[@]}"; printf '\nwould write: %s\n' "$OUT"; exit 0
fi

mkdir -p "$DEST"
if [ -e "$OUT" ] && [ "$FORCE" != 1 ]; then die "$OUT already exists (use --force to replace it, or -o for another name)"; fi
[ "$FORCE" = 1 ] && CMD=("${CMD[@]:0:${#CMD[@]}-2}" --force-overwrites -- "$WATCH_URL")

say "Downloading $WATCH_URL at up to ${QUALITY}p -> $OUT"
"${CMD[@]}" || die "the download failed (see the messages above)"
[ -s "$OUT" ] || die "yt-dlp finished but $OUT is missing; look in $DEST"

SIZE="$(du -h "$OUT" | cut -f1)"
LEN="$("$FFMPEG" -hide_banner -i "$OUT" 2>&1 | sed -nE 's/.*Duration: ([0-9:.]+).*/\1/p' | head -1)"
say "Done: $OUT  ($SIZE${LEN:+, $LEN})"
echo "Add it to the app with Videos -> Upload (mp4 is supported)."
