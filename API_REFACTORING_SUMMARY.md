# API Gateway URL Structure Refactoring Summary

## Overview
Refactored the API Gateway URL structure to remove the redundant `/eval/` level and organize endpoints into logical functional groups.

## Changes Made

### Backend (CDK Stack)
**File:** `deployment/eval_service/eval_service_stack.py`

#### Old Structure:
```
/v1/eval/video/*  (most endpoints)
/v1/eval/eval/*   (evaluation task endpoints)
```

#### New Structure:
```
/v1/video/*       (video management)
/v1/analyze/*     (analysis task management)
/v1/model/*       (model operations)
/v1/gt/*          (ground truth)
/v1/eval/*        (evaluation tasks)
/v1/util/*        (utilities)
```

### Endpoint Mapping

#### Video Management (`/v1/video/`)
- `POST /v1/video/add-video`
- `POST /v1/video/get-videos`
- `POST /v1/video/delete-video`

#### Analysis Task Management (`/v1/analyze/`)
- `POST /v1/analyze/get-analyze-tasks`
- `POST /v1/analyze/delete-analyze-task`

#### Model Operations (`/v1/model/`)
- `POST /v1/model/start-nova-mme`
- `POST /v1/model/start-tlabs-mme`
- `POST /v1/model/nova-mme-search-vector`
- `POST /v1/model/tlabs-mme-search-vector`

#### Ground Truth (`/v1/gt/`)
- `POST /v1/gt/upsert-ground-truth`
- `POST /v1/gt/get-ground-truths`
- `POST /v1/gt/delete-ground-truth`

#### Evaluation Tasks (`/v1/eval/`)
- `POST /v1/eval/upsert-evaluation-task`
- `POST /v1/eval/get-evaluation-tasks`
- `POST /v1/eval/delete-evaluation-task`

#### Utilities (`/v1/util/`)
- `POST /v1/util/manage-s3-presigned-url`

---

## Frontend Changes

### Files Updated:

1. **`source/frontend/src/utils/api.js`**
   - Updated all API endpoint paths in the `evalAPI` object
   - Added new helper methods for consistency

2. **`source/frontend/src/components/GroundTruthTaskDetail.jsx`**
   - Updated: `/video/upsert-ground-truth` → `/gt/upsert-ground-truth` (2 occurrences)

3. **`source/frontend/src/components/GroundTruth/GroundTruthReview.jsx`**
   - Updated: `/video/upsert-ground-truth` → `/gt/upsert-ground-truth`

4. **`source/frontend/src/components/GroundTruthManagement.jsx`**
   - Updated: `/video/get-ground-truths` → `/gt/get-ground-truths`
   - Updated: `/video/delete-ground-truth` → `/gt/delete-ground-truth`

5. **`source/frontend/src/static/modelConfig.js`**
   - Updated: `/video/start-nova-mme` → `/model/start-nova-mme`
   - Updated: `/video/start-tlabs-mme` → `/model/start-tlabs-mme`

6. **`source/frontend/src/components/CreateEvaluationInline.jsx`**
   - Updated: `/video/get-analyze-tasks` → `/analyze/get-analyze-tasks`

7. **`source/frontend/src/components/AnalyzeView/AnalyzeView.jsx`**
   - Updated: `/video/get-analyze-tasks` → `/analyze/get-analyze-tasks`
   - Updated: `/video/delete-analyze-task` → `/analyze/delete-analyze-task`
   - Updated: `/video/nova-mme-search-vector` → `/model/nova-mme-search-vector`
   - Updated: `/video/tlabs-mme-search-vector` → `/model/tlabs-mme-search-vector`

8. **`source/frontend/src/components/GroundTruth/EmbeddingSearch.jsx`**
   - Updated: `/video/get-analyze-tasks` → `/analyze/get-analyze-tasks`
   - Updated: `/video/nova-mme-search-vector` → `/model/nova-mme-search-vector`
   - Updated: `/video/tlabs-mme-search-vector` → `/model/tlabs-mme-search-vector`

9. **`source/frontend/src/components/CreateEvaluation/AnalysisTaskSelector.jsx`**
   - Updated: `/video/nova-mme-search-vector` → `/model/nova-mme-search-vector`
   - Updated: `/video/tlabs-mme-search-vector` → `/model/tlabs-mme-search-vector`

---

## Deployment Instructions

### 1. Backend Deployment
```bash
cd deployment
cdk deploy
```

### 2. Frontend Deployment
The frontend changes are already in place. After backend deployment:
```bash
cd source/frontend
npm run build
# Deploy the built files to your hosting service
```

### 3. Environment Variables
No changes required to environment variables. The base URL remains the same:
- `VITE_APIGATEWAY_BASE_URL_EVAL_SRV` - points to the API Gateway base URL

---

## Testing Checklist

After deployment, verify the following endpoints:

### Video Management
- [ ] Upload video
- [ ] List videos
- [ ] Delete video

### Analysis Tasks
- [ ] Get analyze tasks
- [ ] Delete analyze task

### Model Operations
- [ ] Start Nova MME
- [ ] Start TwelveLabs MME
- [ ] Search Nova embeddings
- [ ] Search TwelveLabs embeddings

### Ground Truth
- [ ] Create/update ground truth
- [ ] List ground truths
- [ ] Delete ground truth

### Evaluation Tasks
- [ ] Create/update evaluation task
- [ ] List evaluation tasks
- [ ] Delete evaluation task

### Utilities
- [ ] Generate S3 presigned URLs

---

## Benefits

1. **Cleaner URL Structure**: Removed redundant `/eval/` nesting
2. **Better Organization**: Endpoints grouped by functional domain
3. **Scalability**: Easy to add new model types under `/model/`
4. **Maintainability**: Clear separation of concerns
5. **RESTful Design**: More intuitive API structure

---

## Rollback Plan

If issues arise, you can rollback by:
1. Reverting the CDK stack changes in `deployment/eval_service/eval_service_stack.py`
2. Reverting the frontend changes in the files listed above
3. Redeploying both backend and frontend

---

## Notes

- All Lambda functions remain unchanged (only API Gateway routing updated)
- DynamoDB tables remain unchanged
- S3 bucket structure remains unchanged
- Cognito configuration remains unchanged
- The refactoring is purely at the API Gateway routing level
