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

## Getting Started

### Development

```bash
cd source/frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### Production Build

To create a production build for deployment as a static website:

```bash
cd source/frontend
npm run build
```

The build output will be in the `source/frontend/dist` directory. You can deploy this folder to any static hosting service (AWS S3, Netlify, Vercel, GitHub Pages, etc.).

**Subfolder Deployment**: The app is configured to be deployed to `/video-evaluation/` subfolder. To change this:
1. Edit `source/frontend/vite.config.js` and update the `base` property to your desired path (e.g., `/my-app/`)
2. Rebuild with `npm run build`
3. Deploy the `dist` folder to your domain's subfolder

To preview the production build locally:

```bash
npm run preview
```

## Tech Stack

- React + Vite
- JSON-based mock data (backend API integration pending)