# Ground Truth Creation Wizard

## Overview
A new streamlined wizard interface for creating ground truth labels with a clear multi-step workflow.

## Features

### Step 1: Select Video
- Browse and search through available videos
- Visual grid layout with thumbnails
- Pagination support
- Click to select a video and proceed

### Step 2: Create Labels
Three methods to create labels, accessible via tabs:

#### Manual Label (Default Tab)
- Watch the video and click to capture start/end times
- Add descriptive labels for each segment
- Play back segments to verify
- Real-time duration calculation
- Labels are added to a shared collection

#### Multimodal Embedding Search
- Select from available embedding indexes (Nova MME or TwelveLabs)
- Search with text queries
- Specify Top K results
- Preview results with video playback
- Add search results to label collection

#### Video Understanding Results
- Browse completed video understanding tasks
- Preview formatted results with timestamps
- Click segments to play in video
- Import all segments as labels

### Unified Label Collection
- Shows all labels from all three methods in one place
- Real-time count of segments
- Badges showing source breakdown (embedding searches, video understanding tasks, manual labels)
- Clear all functionality
- "Proceed to Review" button when ready

### Step 3: Review & Save
- Review all collected labels
- Edit, remove, or reorder labels
- Add ground truth name and description
- Save to database

## Technical Implementation

### New Components
- `CreateGroundTruthWizard.jsx` - Main wizard container
- `VideoSelector.jsx` - Step 1 video selection
- `LabelCreator.jsx` - Step 2 label creation with three tabs
- Reuses existing `GroundTruthReview.jsx` for Step 3

### Integration
- Integrated into `GroundTruthManagement.jsx`
- Replaces the old inline creation form
- Maintains backward compatibility with existing data structures

### Key Improvements
1. **Clearer workflow** - Step-by-step process is more intuitive
2. **Manual labeling first** - Most common use case is now the default tab
3. **Unified collection** - All labels from different sources are collected together
4. **Better UX** - Video selection is separate from label creation
5. **Consistent styling** - Reuses existing modal styles for embedding and video understanding

## Usage
1. Click "Create Ground Truth" button in Ground Truth Management
2. Select a video from the grid
3. Create labels using any combination of the three methods
4. Click "Proceed to Review" when done
5. Review, edit, and save your ground truth

## Notes
- All three label creation methods can be used together
- Labels are accumulated across all tabs
- The wizard maintains state when switching between tabs
- Video playback is available in all relevant views for verification
