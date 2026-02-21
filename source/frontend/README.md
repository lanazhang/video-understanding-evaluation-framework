# Video Understanding Evaluation Framework - Frontend

React-based frontend application for managing video evaluation tasks with AWS Amplify authentication.

## Features

- AWS Cognito authentication with Amplify UI
- Video inventory management
- Ground truth task creation and management
- Evaluation task creation and results viewing
- Secure API integration with AWS API Gateway

## Prerequisites

- Node.js 18+ and npm
- AWS Cognito User Pool configured
- AWS API Gateway endpoints deployed

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create environment configuration:
```bash
cp .env.example .env
```

3. Update `.env` with your AWS credentials:
```env
VITE_COGNITO_REGION=us-east-1
VITE_COGNITO_IDENTITY_POOL_ID=your-identity-pool-id
VITE_COGNITO_USER_POOL_ID=your-user-pool-id
VITE_COGNITO_USER_POOL_CLIENT_ID=your-client-id
VITE_APIGATEWAY_BASE_URL_EVAL_SRV=https://your-api.execute-api.us-east-1.amazonaws.com/
VITE_APIGATEWAY_BASE_URL_VIDEO_SRV=https://your-api.execute-api.us-east-1.amazonaws.com/
```

## Development

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or another port if 5173 is in use).

## Build

Create a production build:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Project Structure

```
src/
├── components/          # React components
│   ├── VideoManagement.jsx
│   ├── CreateGroundTruthTask.jsx
│   ├── CreateEvaluationTask.jsx
│   ├── GroundTruthTaskDetail.jsx
│   └── EvaluationTaskDetail.jsx
├── static/             # Static data files
│   ├── videos.json
│   ├── groundTruthTasks.json
│   └── evaluationTasks.json
├── utils/              # Utility functions
│   └── api.js         # API helper functions
├── App.jsx            # Main app component with auth
├── main.jsx           # Entry point with Amplify config
└── index.css          # Global styles
```

## Authentication

The app uses AWS Amplify Authenticator component which provides:
- Sign in / Sign up forms
- Password reset functionality
- Email verification
- Session management

Users must authenticate before accessing the application.

## API Integration

The app integrates with AWS services through API Gateway:

- **Video Service**: Manages video uploads, retrieval, and S3 presigned URLs
- **Eval Service**: Handles ground truth and evaluation task operations

All API calls include authentication tokens automatically via Amplify.

## Videos Data Schema

Videos are stored with the following schema:
```json
{
  "id": "unique-video-id",
  "name": "Video Name",
  "description": "Video description",
  "s3_bucket": "bucket-name",
  "s3_key_video": "path/to/video.mp4",
  "s3_key_thumbnail": "path/to/thumbnail.jpg",
  "duration": 30,
  "resolution": "1920x1080",
  "uploaded_ts": "2024-01-15T10:30:00Z",
  "uploaded_by": "user@example.com"
}
```

## Environment Variables

All environment variables use the `VITE_` prefix for Vite compatibility:

- `VITE_COGNITO_REGION`: AWS region for Cognito
- `VITE_COGNITO_IDENTITY_POOL_ID`: Cognito Identity Pool ID
- `VITE_COGNITO_USER_POOL_ID`: Cognito User Pool ID
- `VITE_COGNITO_USER_POOL_CLIENT_ID`: Cognito App Client ID
- `VITE_APIGATEWAY_BASE_URL_EVAL_SRV`: Evaluation service API endpoint
- `VITE_APIGATEWAY_BASE_URL_VIDEO_SRV`: Video service API endpoint
