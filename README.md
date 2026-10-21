# Video Understanding Evaluation Framework

A flexible tool that streamlines video labeling and evaluation, enabling teams to work with their own data, reduce ground-truth bias, and accelerate model development.

## Why This Matters

Video understanding is a core growth driver in the GenAI market, enabling new revenue streams across media, advertising, education, retail, and enterprise. By transforming video into structured, actionable intelligence, it powers monetization use cases like contextual ads, shoppable content, personalization, and automation—making it a strategic capability, not just a technical one.

## The Challenge

Video understanding evaluation is uniquely complex:

- **Diverse use cases**: Event detection, scene understanding, labeling, and temporal reasoning often require multiple models rather than a single solution
- **Varied definitions**: "Events" differ widely across industries (M&E content moderation, sports events, IP camera surveillance)
- **Limited access**: Representative sample videos are often restricted by licensing constraints
- **Resource-intensive**: Ground-truth generation requires significant time and effort
- **Complex tooling**: Effective evaluation demands rich UI tools for labeling, visualization, and temporal analysis

From a data scientist's perspective, obtaining high-quality datasets and accurate labels is a major challenge. Diverse content, licensing limits, and complex event definitions make ground-truth generation resource-intensive, yet it's essential for efficient model training and reliable evaluation.

## Solution

This framework helps teams quickly assess customer-provided videos and recommend the most suitable models—not based on popularity or biased assumptions, but on actual data and use cases. It enables rapid insights, supports larger-scale ground-truth tasks, and improves model training by allowing evaluation across multiple models and methods.

### Key Features

- **User-uploaded videos & custom labeling**: Efficiently label videos for specific use cases, reducing dependence on public/licensed datasets and minimizing ground-truth bias
- **Cross-model comparison**: Supports TwelveLabs, Gemini, LLaMA, OpenAI, and Nova Understanding with different video understanding methods (frame-sampling, embedding-based)
- **Human-in-the-loop efficiency**: Auto-label with a base model and quickly refine with human input, reducing labeling time from weeks to hours
- **Flexible evaluation workflow**: Compare outputs across models and methods to identify optimal solutions, adaptable for different industries and content types
- **Interactive review tools**: Side-by-side comparison of predicted vs ground truth labels with metrics (precision, recall, F1) and individual label verification

## Evaluation metrics

An evaluation compares the clips a model returned with the ground-truth moments (only reviewed / true-positive labels count).

**Matching.** A clip matches a moment when their overlap reaches a threshold you choose, after widening both ranges by an
optional buffer time. You pick how overlap is measured (**Match by**):

- **Overlap** (default): the overlap as a share of the *shorter* of the two ranges. A 5 s clip that fully contains a 0.5 s
  moment counts as a hit (100%), which is what you want when ground-truth moments are short and clips are fixed-length.
- **IoU**: intersection over union. Stricter: a 5 s clip around a 0.5 s moment scores about 10%, so it fails at 0.5.

The minimum is any overlap, 10%, 30%, 50% (default), 70% or 90%. With *one-to-one matching* (default) clips claim moments in rank
order. A moment that is already found can be claimed again only by a clip that covers a *new part* of it, so several clips
spread over one long moment all count as hits, while a repeat on the same short moment (nothing new covered) is a duplicate
and counts as a false positive. The ranking metrics (Recall@K, MRR, NDCG@10, mAP) stay strictly one-to-one. Switch
one-to-one off to count every overlapping clip as a hit. On an evaluation's detail page, **Re-score with different matching** recalculates it with other
settings without saving, so saved evaluations can be viewed either way.

| Metric | Meaning |
|---|---|
| Precision | hit clips / clips returned |
| Recall | moments found / moments in the ground truth (a moment counts once, however many clips land on it) |
| F1, Accuracy, Mean IoU | from the above; Accuracy = found / (found + wrong + missed) |
| Recall@1 / @5 / @10 | moments found by the first K ranked clips |
| MRR | reciprocal rank of the first clip that hits (averaged over queries) |
| NDCG@10 | hits in the top 10 weighted by 1/log2(rank+1) (binary gain, one-to-one), divided by the ideal ordering |
| mAP, and mAP @ IoU 0.3 / 0.5 / 0.7 | ranking quality at the chosen rule, and at three fixed IoU thresholds |

Clips are ranked by score (lower distance first); ranking metrics are computed per query and averaged. On the comparison screen each model's card lists the **ground-truth ranges** (found or missed, with the clip that found
them) and, under every returned clip, the **ground-truth range it overlaps**: overlap seconds, IoU, and how far its start
and end are off. A clip that touches a range but does not count says why (below the threshold, or a better-ranked clip
already found that moment). The detail and report tables show the same in their "Matched To" columns. The comparison
screen also shows **processing time, speed (x real time), tokens and cost** of the analysis next to the quality metrics; cost is
N/A for models with no pricing configured (self-hosted). Evaluations saved by earlier versions used a different rule (any
overlap counted, and recall mixed clip and moment counts), so they are marked as such and keep their stored numbers; create
a new evaluation to get the corrected metrics. The settings used are stored with each evaluation (`BufferTime`,
`MatchVersion`, `MatchBy`, `MatchThreshold`, `OneToOne`; `MatchVersion` 2 evaluations used IoU and keep `MatchIouThreshold`).

## Getting Started

### Run the full stack locally (no AWS, no Docker)

The backend (FastAPI + SQLite + local files) and the web UI run on your machine, and models run on NVIDIA
NIM / Brev (or any OpenAI-compatible endpoint). Setup, start commands and troubleshooting are in
[local/README.md](local/README.md). In short, after the one-time setup there:

```bash
cd local/backend && ../.venv/bin/uvicorn app:app --port 8080   # terminal 1: API
cd source/frontend && npm run dev                              # terminal 2: UI at http://localhost:5173
```

### Development (frontend only)

```bash
cd source/frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser. The UI calls the backend at `http://localhost:8080/v1/`
(change it with `VITE_API_BASE_URL`, see `source/frontend/.env.example`).

### Production Build

To create a production build for deployment as a static website:

```bash
cd source/frontend
npm run build
```

The build output will be in the `source/frontend/dist` directory. You can deploy this folder to any static hosting service (AWS S3, Netlify, Vercel, GitHub Pages, etc.).

**Subfolder Deployment**: The app is served from the root (`/`) by default. To deploy under a subfolder, build with
the path set, e.g. `VITE_BASE_PATH=/my-app/ npm run build`, then deploy the `dist` folder to that subfolder of your domain.

To preview the production build locally:

```bash
npm run preview
```

## Tech Stack

- React + Vite (frontend)
- FastAPI, SQLite and local file storage (local runtime, see [local/README.md](local/README.md))
- AWS serverless stack (Lambda, API Gateway, DynamoDB, S3, Bedrock) in `deployment/` and `source/eval_service/`