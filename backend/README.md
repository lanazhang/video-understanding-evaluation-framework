# Backend (local runtime)

Runs the serverless backend on one machine with no AWS and no Docker. The Lambda handlers in
`lambdas/` come from the original AWS stack and are loaded by the FastAPI app as they are (with a few small changes for the
local runtime). Four of them only exist locally: `start-embedding`, `embedding-search`, `wf-embed-video` and `openai-compat`.
The original AWS deployment is on the
`aws-original` branch; screenshots of the UI are in the [root README](../README.md#screenshots).

| AWS | Local |
|---|---|
| API Gateway + Cognito | FastAPI (`app.py`), single local user (`LOCAL_USERNAME`) |
| Lambda → Lambda `invoke` | In-process call; async `Event` invokes run on a thread pool (`local_aws.py`) |
| DynamoDB | SQLite, one file (`store/sqlite_table.py`) |
| S3 | Local filesystem + HMAC-signed URLs, including multipart upload (`store/local_s3.py`, `store/files_api.py`) |

Everything is stored under `data/` at the repo root (`app.db` + `files/`). Delete it to reset.

## Quick start

Needs Python 3.10+ and Node 18+ (`brew install node`). No Docker, no AWS account, and no separate ffmpeg install.

### One-time setup

```bash
# from the repo root
cd backend
cp .env.example .env                                   # then edit: see "Models" below
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

cd ../frontend
npm install
```

### Start

Use one terminal per service and leave each one open.

| # | Service | Command (from the repo root) | URL |
|---|---|---|---|
| 1a | Brev tunnel: Qwen3-VL embedding (optional) | `brev port-forward military-tan-rook -p 8011:8001` | http://localhost:8011/v1 |
| 1b | Brev tunnel: Omni-Embed-Nemotron-3B (optional) | `brev port-forward omni-embed -p 8002:8002` | http://localhost:8002 |
| 1c | Brev tunnel: Cosmos-Embed1 NIM (optional) | `brev port-forward cosmos-embed1 -p 8012:8000` | http://localhost:8012 |
| 2 | Backend API | `cd backend && .venv/bin/uvicorn app:app --port 8080` | http://localhost:8080 |
| 3 | Web UI | `cd frontend && npm run dev` | **http://localhost:5173** |

To start all of this (Brev instances, tunnels, API and UI) with one command, use `scripts/local-launch.sh start` from the repo root; see
the [root README](../README.md#launch-the-demo-with-one-command).

Open http://localhost:5173. The UI has no login; it runs as a single local user (`local-user`).

The backend creates the database and tables on startup. Check it with:

```bash
curl http://localhost:8080/health          # {"status":"ok","routes":24}
curl http://localhost:8080/v1/model/list   # models and whether each provider is configured
```

Interactive API docs are at http://localhost:8080/docs. Routes are `POST /v1/<group>/<name>`, the same paths as
API Gateway. Do not paste the `# ...` comments into zsh; it treats them as arguments.

Notes on the Brev tunnel:
- Run `brev port-forward` once and do not wrap it in a loop. It hands the tunnel to a background SSH process and
  returns, so a loop only piles up duplicate SSH processes.
- The instance must be running (`brev ls`; start it with `brev start <name>`; it bills while running,
  so `brev stop <name>` when finished). Start only the tunnels for the embedding models you use.
- If the tunnel drops, running tasks retry for about 35 s and then fail with a clear message. Re-run the
  command, delete the failed task, and create it again.
- Check them with `curl http://localhost:8011/v1/models` (should list `Qwen/Qwen3-VL-Embedding-8B`) and
  `curl http://localhost:8002/info` (should report `nvidia/omni-embed-nemotron-3b`, 2048 dims) and
  `curl http://localhost:8012/v1/health/ready` (should say `NIM Service is ready`).

### Stop and reset

- Stop a service with `Ctrl+C` in its terminal. If a port stays busy, find the process with
  `lsof -nP -iTCP:8080 -sTCP:LISTEN` (or 5173, 8011, 8002, 8012) and `kill <pid>`.
- Restart the backend after changing `backend/.env`, `models.yaml` or any backend code; the UI reloads by itself.
- To wipe all videos, tasks and vectors, stop the backend and delete the `data/` folder in the repo root.

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `{"detail":"Not Found"}` at http://localhost:8080 | You opened the API root. Use http://localhost:5173 for the UI or http://localhost:8080/docs for the API. |
| `404` on `/v1/model/start-embedding` | The backend is an old process. Restart it; `/health` should report 24 routes. |
| `zsh: command not found: npm` | Install Node: `brew install node`, then open a new terminal. |
| Blank page at http://localhost:5173 | Open the browser console and look for the first red error. Check the backend is running. |
| Model dropdowns are empty | The UI could not reach `GET /v1/model/list`; start the backend and refresh. |
| Embedding task fails with `Cannot reach the embedding endpoint` | The Brev tunnel for that model is down (see the notes above). Each model has its own tunnel and port. |
| Search or a task fails with `404 Not Found` / `does not serve /embeddings` | Something other than the model is listening on that local port (another dev server). Check with `lsof -nP -iTCP:<port> -sTCP:LISTEN`, or move the tunnel to a free port and set `EMBED_BASE_URL` / `OMNI_EMBED_BASE_URL` in `backend/.env`. |
| Video understanding fails with an authentication error | Set `NIM_API_KEY` in `backend/.env` (needed for build.nvidia.com) and restart the backend. |

## Models (NVIDIA by default)

The app runs locally; models run wherever you point it. Set `NIM_BASE_URL` in `.env` to any
OpenAI-compatible endpoint:

| Where the model runs | `NIM_BASE_URL` |
|---|---|
| NIM on a Brev instance | the instance's secure link, e.g. `https://<name>-<id>.brevlab.com/v1`, or `http://localhost:8000/v1` after `brev port-forward` |
| build.nvidia.com hosted | `https://integrate.api.nvidia.com/v1` plus `NIM_API_KEY=nvapi-...` |
| Your local network | `http://<host>:8000/v1` |

Models are declared in [models.yaml](models.yaml); set `id` to exactly what your endpoint serves
(`curl $NIM_BASE_URL/models`). Unlisted model ids still work through the default provider.
`GET /v1/model/list` returns the registry. A second OpenAI-compatible provider (vLLM, Ollama, OpenAI)
can be enabled with `OPENAI_COMPAT_BASE_URL`.

Video understanding with these models uses `ApiType: "openai_compat"`: frames are sampled locally with
timestamps and sent to the model (the ffmpeg binary bundled with moviepy is used, nothing to install).
The Bedrock / Gemini / Pegasus handlers are unchanged and remain available as optional providers when
their SDKs and credentials are present.

## Embeddings and search

Three embedding models are registered, and uploading a video creates one `embedding` task per model selected in the
upload form. Both cut the video into segments, embed each segment, and store the vectors in SQLite (exact cosine
search). Search is `POST /v1/model/embedding-search` (text or image query), run against one task's vectors.

| Model | Where | Dim | Task parameters |
|---|---|---|---|
| Qwen3-VL-Embedding-8B | Brev `military-tan-rook`, vLLM (OpenAI-compatible `/v1/embeddings`), tunnel `:8011` | 4096 | segment duration (2-30 s), frame rate, max resolution, dimension (4096 only for now); inputs: video |
| Omni-Embed-Nemotron-3B | Brev `omni-embed`, small FastAPI wrapper (`POST /embed`), tunnel `:8002` | 2048 | segment duration (2-60 s), inputs: video / audio / image keyframe, combined or separate (default: video only), dimension (2048, fixed) |
| Cosmos-Embed1 | Brev `cosmos-embed1`, NVIDIA NIM (`POST /v1/embeddings`), tunnel `:8012` | 256 | segment duration (2-30 s), dimension (256, fixed); inputs: video and text only |

**Cosmos-Embed1 (NIM).** The provider is `cosmos_embed` in `providers/`. The NIM is OpenAI-like but needs a `request_type`
(`query` for one item) and takes video as a base64 `data:video/mp4` string; it rejects a `dimensions` field, returns unit
vectors, and reports `num_videos` rather than tokens for video. It samples **8 frames per clip** and fails on fewer, so
the worker raises the frame rate of short segments (such as the 1 s tail of a video) to give it at least that many
(`min_frames` in `models.yaml`). It decodes video on the GPU, so the instance needs the NVIDIA video libraries; the setup
script `scripts/brev-cosmos-embed1.sh` installs them and creates the container. Setup needs an NGC API key (free) for the
image and model download, entered once at a hidden prompt on the instance (it is kept there in a mode-600 file, never in
the repo).

**Never restart the Cosmos container.** A container that is stopped and started again (which is also what rebooting the
instance does) still answers health checks and text queries but fails every video request with `All 1 inputs failed during
processing`, while a freshly created one works. The cause is not known. So the setup script always removes the container and
creates a new one (it has no restart policy), and `scripts/local-launch.sh connect` checks with a real tiny video request
through the tunnel, because the health endpoint says "ready" even when video is broken. If that request fails, or the
container is not running, the launcher runs the setup script on the instance, which takes about a minute; the key is
already stored there, so there is no prompt. To repair it by hand: `brev exec cosmos-embed1 'bash ~/brev-cosmos-embed1.sh'`. Free use is for development and
testing under the NVIDIA Developer Program; production use falls under NVIDIA AI Enterprise licensing, and the model has
its own license, so confirm the terms before you put it in front of customers.

**Segmenting: fixed length or by shot.** Every embedding model offers the same choice (declared once under
`embedding_parameters` in `models.yaml`, so adding a model gives it for free):

- **Fixed length** (default): a segment every *Segment Duration* seconds, wherever the picture is.
- **By shot**: segments follow the shots of the video. The shots are found with ffmpeg's scene-change detection (a single
  pass over a low-resolution copy: under 2 s for a 12 minute video), then made a usable size:
  - a shot **longer** than *Segment Duration*, which now means the *longest* segment, is divided **evenly** into the fewest
    pieces that fit (a 13 s shot with a 5 s maximum becomes 3 segments of 4.3 s, not 5 + 5 + 3);
  - a shot **shorter** than *Shortest segment* (default 1 s) is joined with the shot after it (a short last shot, with the
    one before), so flashes and quick cuts do not become tiny segments;
  - *Shot sensitivity* (0.05 to 0.9, default 0.3) is ffmpeg's scene score: lower finds more cuts, including soft ones,
    higher keeps only hard cuts.

  The segments cover the whole video with no gaps or overlaps, and each is embedded and stored like a fixed segment (search,
  comparison and evaluation need no changes). The task records how many shots were found and the shortest and longest
  segment. On the keynote sample (281 s), shot mode with a 5 s maximum gives 42 shots and 78 segments of 1.0 to 4.9 s.
  Cosmos-Embed1's frame-count rule still applies to short segments (see above). A long shot is only divided by length, not by
  content, so a video with few cuts (a lecture, a long take) ends up like fixed segments; raise the sensitivity to find more.

**Seeing the segments of an index.** In the Analyze view, expand an index in *Multimodal Embedding Indexes* and click **View
segments**. A timeline draws every segment to scale. By shot, the blocks of one shot share a colour, shots alternate between
two colours, and a long shot that was divided shows as several blocks of one colour separated by thin lines; fixed-length
indexes alternate colours segment by segment. Hover a block for its time range, length and shot piece, zoom up to 16x for dense
passages, open the list for exact times, and click a block (or a row) to play that range in the video player above. The data
comes from `POST /v1/model/embedding-segments {TaskId}`, which reads the stored vectors, so it works for every index; the shot
grouping comes from the `SegmentMap` the embedding worker records for tasks made by shot, so a shot task made before that
existed lists its segments without the shot grouping.

**Inputs.** The Omni server has no "modality" setting: what it embeds is whichever fields you send in `/embed`
(`video`, `audio`, `image`, `text`). The UI mirrors that with a checkbox per input, and the default is **video only**.
Ticked inputs are sent for every segment: with *Combine inputs into one vector* on (the default, shown when two or more
are ticked) the server pools them into ONE vector; off, each input gets its own vector. *Image* is a keyframe grabbed from
the middle of each segment. *Text* is listed but disabled: there is no per-segment text source (a transcript or caption
step) in this app yet. Audio costs extra requests, so tick it when you want to search by what is heard (speech,
applause, music). Qwen takes video only. If a video has no audio track, audio is skipped and the task says so (a task
with only audio selected fails). In search, the "embedding type" filter (all / video + audio / video / audio / image)
limits which kind of vector is searched. Vectors are tagged with the inputs they were made from (`video`, `audio`,
`image`, `video+audio`, ...).

**Dimension.** The app never cuts, rescales or re-normalises vectors: it stores exactly what the model returns. A
model offers only the sizes its *server* supports, declared as `EmbeddingDim` in [models.yaml](models.yaml); for a size
other than the native one, the app asks the server (`dimensions` in the request) and checks the answer has that size.
Today each model offers one size: **Qwen 4096** (its model card documents smaller Matryoshka sizes, but this vLLM server was
not launched with Matryoshka enabled and rejects any `dimensions` value) and **Omni 2048** (the model card lists one
size). To offer more Qwen sizes, relaunch vLLM with Matryoshka support (typically `--hf-overrides '{"is_matryoshka": true}'`,
not tested here) and add the sizes to `options`.

**Where vectors are stored.** In the SQLite file `data/app.db` (repo root), table `vectors`: one row per segment per
kind of vector, with `index_name` (`emb-<task id>`, so one index per task), `key`, `video_id`, `start_sec`, `end_sec`,
`dim`, `option` (the inputs it was made from: `video`, `audio`, `image`, `video+audio`, ...) and `vec`, a float32 blob
(`dim` x 4 bytes). Cosine similarity is computed at search time. Deleting a task deletes its vectors; deleting a whole
video currently leaves its vectors behind. Inspect with `sqlite3 -readonly data/app.db "select index_name, option, dim,
count(*) from vectors group by 1,2,3"`.

Qwen's frame rate and resolution decide the token cost of each segment (its context is 8,192 tokens). Omni takes
text, image, audio and video; video and audio are pooled into one vector, and its server fixes the frame sampling
itself, so it has no frame-rate setting. Tested on a 4 m 41 s video: Qwen embedded 29 segments in ~11 s, Omni
19 segments (15 s each, with audio) in ~15 s.

**Parameters are declared per model** under `parameters:` in [models.yaml](models.yaml) (key, label, type
`number`/`select`/`boolean`/`multiselect`, unit, range, default). The backend validates and clamps a task's settings against that
declaration, stores them on the task, and the UI builds the upload panel, the Create Embedding form and the task
details from it. Adding a model, or a setting, is a `models.yaml` edit. A new model that is not OpenAI-compatible needs a
provider class in `providers/` (see `omni_embed.py`); providers expose `embed_text`, `embed_image` and
`embed_video`.

## Security

The API has **no login**: it is a single-user app meant to run on your own machine, so keep it that way.

- It listens on `127.0.0.1` only. Do not start it with `--host 0.0.0.0` or put it behind a public URL without an
  authenticating proxy in front.
- Other websites cannot drive it: writes must be `application/json`, an `Origin` header must be in `CORS_ORIGINS`, and the
  `Host` header must be a local name (`ALLOWED_HOSTS` adds more).
- Files are served only through short-lived HMAC-signed URLs, from `data/files/<bucket>/` with a plain bucket name, so a
  record cannot point the file server at the database or the signing secret (`data/.signing_secret`).
- Secrets (`NIM_API_KEY`, ...) belong in `backend/.env`, which git ignores. Never commit it.
- Model servers on Brev: publish them on the instance's loopback only (for example `docker run -p 127.0.0.1:8001:8000 ...`),
  because the SSH tunnel reaches loopback, and set an API key if you can (vLLM: `--api-key`). A server on `0.0.0.0` with
  no key is open to anyone the instance's firewall lets in.

## Status

Working and tested over HTTP: routing, SQLite tables and GSI queries, signed uploads (multipart) and
downloads with Range, delete, handler-to-handler invokes, video metadata + thumbnail extraction (no AWS),
and video understanding through an OpenAI-compatible endpoint (tested against a fake endpoint, not yet a
real Brev/NIM one).

Not yet ported (these fail with a clear error rather than silently):
- The chatbot (Strands agents on Bedrock; the page is hidden unless `VITE_ENABLE_CHATBOT=true`, and it needs `pip install strands-agents` plus Bedrock access) and the existing Gemini handler's key storage (`pip install google-genai`).
- Nova MME / Marengo embeddings (Bedrock) — superseded by the provider-based embedding path above.
- `manage-api-key` (Secrets Manager).
- The S3-event listeners (`eval-srv-s3-listener*`) were removed from this branch; the embedding worker replaces them. They are still on the `aws-original` branch.

Not verified: `video_input: video_url` mode; a real NIM endpoint.
