# Video Understanding Evaluation Framework - Frontend

React + Vite web UI for the local runtime: manage videos, create ground truth, run and compare embedding / video
understanding tasks, and evaluate their results. It talks to the FastAPI backend in [`backend/`](../backend/README.md);
there is no login, the app runs as a single local user.

Screenshots of the main screens are in the [root README](../README.md#screenshots).

## Features

- **Videos**: upload (multipart, with per-model embedding settings), thumbnails, metadata, preview
- **Analyze**: create embedding tasks (each model shows the task parameters it declares: segment length, inputs, dimension, ...)
  and video-understanding tasks; search an embedding task, or compare several tasks on the same query
- **Ground truth**: label time ranges by hand or from model search results, review them (Unreviewed / Verified)
- **Evaluation**: create an evaluation from a task + ground truth, score it (Precision, Recall, F1, Accuracy, Mean IoU, mAP,
  Recall@K, MRR, NDCG@10, processing time / speed / tokens / cost), re-score with another matching rule, and compare
  evaluations of the same ground truth side by side
- **Chatbot** and **Settings** screens

## Prerequisites

- Node.js 18+ and npm
- The backend running on `http://localhost:8080` (see [backend/README.md](../backend/README.md))

## Setup and run

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

The defaults work as they are. To change them, copy `.env.example` to `.env`:

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080/v1/` | Backend API |
| `VITE_LOCAL_USER` | `local-user` | Name shown in the UI and stored as `CreatedBy` / `UploadedBy`; keep equal to `LOCAL_USERNAME` in `backend/.env` |
| `VITE_BASE_PATH` | `/` | Build-time only: serve the app from a subfolder, e.g. `VITE_BASE_PATH=/my-app/ npm run build` |

Restart `npm run dev` after editing `.env`.

## Build

```bash
npm run build        # output in dist/
npm run preview      # serve the production build locally
```

## Project structure

```
src/
├── App.jsx                     # routes and layout
├── main.jsx                    # entry point
├── components/
│   ├── VideoManagement.jsx, VideoUpload.jsx, VideoList/      # videos
│   ├── AnalyzeView/                                          # embedding / video-understanding tasks, search, compare
│   ├── GroundTruthManagement.jsx, CreateGroundTruth/, GroundTruth/   # ground-truth labeling
│   ├── EvaluationManagement.jsx, EvaluationDetail.jsx, CreateEvaluation/   # evaluations
│   ├── EmbeddingParamFields.jsx                              # per-model task parameters
│   └── ChatBot/, Settings/, Introduction/
├── static/modelConfig.js       # model lists, loaded from the backend (GET /v1/model/list)
└── utils/
    ├── api.js, apiHelper.js    # backend calls
    ├── embeddingParams.js, embeddingTasks.js
    ├── evaluationEfficiency.js # processing time, speed, tokens, cost
    └── mutePreference.js       # remembers the mute setting of video players (cookie)
```

Evaluation scoring lives in `src/components/CreateEvaluation/evaluationUtils.js`; the matching rules are described in the
[root README](../README.md#evaluation-metrics).

## Models

The model lists are not hard-coded: the app asks the backend for them at start-up, so adding a model is an edit to
`backend/models.yaml` (and a backend restart), not a frontend change.
