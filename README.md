# Video Understanding Evaluation Framework

A web-based tool for evaluating video understanding models by comparing their predictions against ground truth annotations.

## Overview

This framework helps you assess the performance of various video understanding models (including Nova, Gemini, TwelveLabs, and others) by:

- **Managing Videos**: Upload and organize video content with metadata
- **Creating Ground Truth**: Define reference annotations manually or with model assistance
- **Running Evaluations**: Process videos with different models and compare results against ground truth
- **Reviewing Results**: Analyze predictions with metrics (precision, recall, F1) and verify labels individually

## Features

- Support for multiple model types: multimodal embedding, image frame-based, video clip-based, and video understanding models
- Human annotation workflow with timestamp capture
- Side-by-side comparison of predicted vs ground truth labels
- Interactive video player with label navigation
- Evaluation metrics and verification tools

## Getting Started

```bash
cd source/frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Tech Stack

- React + Vite
- JSON-based mock data (backend API integration pending)
