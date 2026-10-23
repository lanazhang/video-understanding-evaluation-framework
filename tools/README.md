# tools

Small command-line helpers that are not part of the app itself.

## download-youtube.sh

Downloads a YouTube video as an `.mp4` (H.264 video + AAC audio, which plays in every browser and is what the app's ffmpeg
handles best) into `data/downloads/`, ready to add through **Videos -> Upload**.

```bash
tools/download-youtube.sh https://www.youtube.com/watch?v=VIDEO_ID           # up to 720p
tools/download-youtube.sh -q 480 https://youtu.be/VIDEO_ID                    # smaller: 360, 480, 720 or 1080
tools/download-youtube.sh -o berlin_keynote -d ~/Movies VIDEO_ID               # your own name and folder
tools/download-youtube.sh --info VIDEO_ID                                      # title, length, size per quality; downloads nothing
tools/download-youtube.sh --dry-run VIDEO_ID                                   # shows the yt-dlp command; runs nothing
```

| Option | Meaning |
|---|---|
| `-q, --quality N` | highest picture height: 360, 480, 720 (default) or 1080 |
| `-o, --output NAME` | file name without folders or extension (default: the video title, lower case with underscores) |
| `-d, --dir DIR` | destination folder (default: `data/downloads`, which git ignores) |
| `--info` | show title, channel, length and the download size of each quality |
| `--dry-run` | print what would run |
| `--force` | replace an existing file (it refuses by default) |

The models downscale to about 450 px, so 720p is plenty for evaluation; 1080p mostly adds size (a 94 minute keynote is about
0.9 GB at 720p and 1.5 GB at 1080p).

What it sets up for you: `yt-dlp` (yours on the PATH, else a private copy in `tools/.venv`, created on the first run and
git-ignored), a certificate bundle (some Macs' Python has none, which shows up as `CERTIFICATE_VERIFY_FAILED`), and ffmpeg to
join the separate video and audio streams (the one bundled with the backend, else `ffmpeg` on the PATH). It fetches one
video, never a playlist, and accepts only YouTube links or an 11 character video id.

Only download videos you have the right to use: your own, your employer's, or with permission. YouTube's terms do not allow
downloading without it.
