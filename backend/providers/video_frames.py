"""Frame sampling with the ffmpeg binary bundled by imageio-ffmpeg (no system ffmpeg needed)."""
import math
import re
import subprocess
import tempfile
from pathlib import Path

import imageio_ffmpeg


def _ffmpeg() -> str:
    return imageio_ffmpeg.get_ffmpeg_exe()


def format_ts(seconds: float) -> str:
    s = int(round(seconds))
    h, rem = divmod(s, 3600)
    m, s = divmod(rem, 60)
    return f"{h:d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def probe_duration(path) -> float | None:
    """Duration in seconds, parsed from `ffmpeg -i` (the bundled build has no ffprobe)."""
    proc = subprocess.run([_ffmpeg(), "-hide_banner", "-i", str(path)], capture_output=True, text=True, timeout=60)
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", proc.stderr)
    if not m:
        return None
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def sample_frames(path, duration: float | None, max_frames=32, max_side=768, min_interval=1.0, timeout_s=600):
    """Evenly sample up to max_frames JPEGs. Returns (frames, interval_s) with frames = [(timestamp_s, jpeg_bytes)]."""
    if not duration or duration <= 0:
        duration = probe_duration(path)
    if not duration:
        raise ValueError("could not determine video duration (is this a valid video file?)")
    interval = max(float(min_interval), duration / max(1, int(max_frames)))
    scale = f"scale=w='if(gt(iw,ih),min({int(max_side)},iw),-2)':h='if(gt(iw,ih),-2,min({int(max_side)},ih))'"
    with tempfile.TemporaryDirectory(prefix="frames_") as tmp:
        cmd = [
            _ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(path),
            "-vf", f"fps=1/{interval:.6f},{scale}", "-q:v", "4", "-frames:v", str(int(max_frames)),
            str(Path(tmp) / "f_%05d.jpg"),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
        files = sorted(Path(tmp).glob("f_*.jpg"))
        if proc.returncode != 0 or not files:
            raise RuntimeError(f"ffmpeg frame extraction failed: {proc.stderr.strip()[:300] or 'no frames produced'}")
        frames = [(i * interval, f.read_bytes()) for i, f in enumerate(files)]
    return frames, interval


def estimate_frames(duration: float, max_frames: int, min_interval=1.0) -> int:
    return min(int(max_frames), max(1, math.ceil(duration / min_interval)))


def cut_segment(path, start, duration, max_side=480, fps=2, timeout_s=300) -> bytes:
    """Re-encode [start, start+duration) as a small silent H.264 mp4 and return its bytes."""
    scale = f"scale=w='if(gt(iw,ih),min({int(max_side)},iw),-2)':h='if(gt(iw,ih),-2,min({int(max_side)},ih))'"
    with tempfile.TemporaryDirectory(prefix="seg_") as tmp:
        out = Path(tmp) / "seg.mp4"
        cmd = [
            _ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}",
            "-i", str(path), "-an", "-vf", f"fps={fps},{scale}", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
        if proc.returncode != 0 or not out.exists() or out.stat().st_size == 0:
            raise RuntimeError(f"ffmpeg segment cut failed at {start:.1f}s: {proc.stderr.strip()[:300] or 'empty output'}")
        return out.read_bytes()


def has_audio(path) -> bool:
    """True if the file has an audio stream (parsed from `ffmpeg -i`)."""
    proc = subprocess.run([_ffmpeg(), "-hide_banner", "-i", str(path)], capture_output=True, text=True, timeout=60)
    return bool(re.search(r"Stream #\d+:\d+.*: Audio:", proc.stderr))


def cut_audio(path, start, duration, timeout_s=300) -> bytes | None:
    """[start, start+duration) as 16 kHz mono WAV, or None when the span has no audio."""
    with tempfile.TemporaryDirectory(prefix="aud_") as tmp:
        out = Path(tmp) / "seg.wav"
        cmd = [
            _ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}",
            "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", str(out),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
        if proc.returncode != 0 or not out.exists() or out.stat().st_size < 1000:
            return None
        return out.read_bytes()


def cut_frame(path, t, max_side=768, timeout_s=120) -> bytes:
    """One JPEG still at time t (seconds)."""
    scale = f"scale=w='if(gt(iw,ih),min({int(max_side)},iw),-2)':h='if(gt(iw,ih),-2,min({int(max_side)},ih))'"
    with tempfile.TemporaryDirectory(prefix="frame_") as tmp:
        out = Path(tmp) / "frame.jpg"
        cmd = [_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{max(t, 0):.3f}", "-i", str(path),
               "-frames:v", "1", "-vf", scale, "-q:v", "3", str(out)]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
        if proc.returncode != 0 or not out.exists() or out.stat().st_size == 0:
            raise RuntimeError(f"ffmpeg frame grab failed at {t:.1f}s: {proc.stderr.strip()[:300] or 'empty output'}")
        return out.read_bytes()
