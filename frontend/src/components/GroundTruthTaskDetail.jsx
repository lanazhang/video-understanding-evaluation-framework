import { useState, useEffect, useRef } from 'react'
import './GroundTruthTaskDetail.css'
import arrowLeftIcon from '../assets/icons/arrow-left.svg'
import { FetchPost } from '../utils/apiHelper'
import GroundTruthStepIndicator from './CreateGroundTruth/GroundTruthStepIndicator'
import LabelCreator from './CreateGroundTruth/LabelCreator'
import ManualLabel from './GroundTruth/ManualLabel'
import GroundTruthReview from './GroundTruth/GroundTruthReview'

function GroundTruthTaskDetail({ task, onBack, currentUser, onNavigateToEdit }) {
  const [selectedLabel, setSelectedLabel] = useState(null)
  const [isEditMode, setIsEditMode] = useState(task.openInEditMode || false)
  const [editStep, setEditStep] = useState(2) // Start at step 2 (Create Labels) since video is already selected
  const [allSearches, setAllSearches] = useState([])
  const [allResults, setAllResults] = useState([])
  const [activeTab, setActiveTab] = useState('manual')
  const [isMaximized, setIsMaximized] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)
  const [tempName, setTempName] = useState('')
  const videoRef = useRef(null)

  // Initialize segments from task labels
  useEffect(() => {
    if (task.Labels) {
      const initialSegments = [...task.Labels]
        .sort((a, b) => a.StartTs - b.StartTs)
        .map(label => ({
          StartSec: label.StartTs,
          EndSec: label.EndTs,
          query: label.Label || '',
          Distance: label.Score,
          reviewStatus: label.ReviewResult || 'reviewed' // Mark existing as reviewed
        }))
      setAllResults(initialSegments)
    }
    setEditName(task.Name || task.taskName || '')
    setEditDescription(task.Description || task.description || '')
  }, [task.Labels, task.Name, task.taskName, task.Description, task.description])

  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDuration = (seconds) => {
    if (!seconds && seconds !== 0) return '0s'
    if (seconds < 60) return `${Math.floor(seconds)}s`
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const handleLabelClick = (label) => {
    setSelectedLabel(label)
    handleTimeRangeClick(label.StartTs, label.EndTs)
  }

  const handleTimeRangeClick = (startSec, endSec) => {
    if (videoRef.current) {
      const videoEl = videoRef.current
      const endTime = parseFloat(endSec || 0)
      
      videoEl.currentTime = parseFloat(startSec || 0)
      videoEl.muted = true
      
      const existingListener = videoEl._stopAtEndListener
      if (existingListener) {
        videoEl.removeEventListener('timeupdate', existingListener)
      }
      
      const stopAtEndListener = () => {
        if (videoEl.currentTime >= endTime) {
          videoEl.pause()
          videoEl.removeEventListener('timeupdate', stopAtEndListener)
          delete videoEl._stopAtEndListener
        }
      }
      
      videoEl._stopAtEndListener = stopAtEndListener
      videoEl.addEventListener('timeupdate', stopAtEndListener)
      
      videoEl.play().catch(err => {
        console.log('Auto-play prevented:', err)
      })
    }
  }

  const handleEditName = () => {
    setTempName(task.Name || task.taskName || '')
    setIsEditingName(true)
  }

  const handleSaveName = async () => {
    if (!tempName.trim()) {
      alert('Name cannot be empty')
      return
    }

    try {
      const labels = (task.Labels || []).map(label => ({
        StartTs: label.StartTs,
        EndTs: label.EndTs,
        Score: label.Score,
        Label: label.Label,
        ReviewResult: label.ReviewResult
      }))

      const payload = {
        Id: task.Id || task.id,
        Name: tempName.trim(),
        Description: task.Description || task.description || '',
        CreatedBy: task.CreatedBy || task.createdBy,
        VideoId: task.VideoId || task.videoId,
        Labels: labels
      }

      const data = await FetchPost('/gt/upsert-ground-truth', payload, 'EvalService')

      if (data.statusCode === 200 || data.message) {
        task.Name = tempName.trim()
        task.taskName = tempName.trim()
        setIsEditingName(false)
      } else {
        alert('Failed to update name')
      }
    } catch (err) {
      console.error('Error updating name:', err)
      alert('Error updating name: ' + err.message)
    }
  }

  const handleCancelNameEdit = () => {
    setIsEditingName(false)
    setTempName('')
  }

  const handleEditLabels = () => {
    // If onNavigateToEdit is provided (from chatbot modal), use it to navigate away
    if (onNavigateToEdit) {
      onNavigateToEdit()
      return
    }
    
    // Otherwise, enter edit mode within the component (normal behavior)
    setIsEditMode(true)
    setEditStep(2) // Start at Create Labels step
    setEditName(task.Name || task.taskName || '')
    setEditDescription(task.Description || task.description || '')
    // Initialize allResults with existing labels
    if (task.Labels) {
      const existingResults = task.Labels.map(label => ({
        StartSec: label.StartTs,
        EndSec: label.EndTs,
        query: label.Label || '',
        Distance: label.Score || 0,
        reviewStatus: label.ReviewResult || 'reviewed',
        source: 'manual'
      }))
      setAllResults(existingResults)
      setAllSearches([])
    }
  }

  const handleCancelEdit = () => {
    setIsEditMode(false)
    setEditStep(2)
    setAllSearches([])
    setAllResults([])
    setEditName(task.Name || task.taskName || '')
    setEditDescription(task.Description || task.description || '')
    setIsMaximized(false)
  }

  const handleLabelsNext = (searches, results) => {
    setAllSearches(searches)
    setAllResults(results)
    setEditStep(3) // Go to Review Labels step
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
  }

  const handleReviewLabelsNext = () => {
    setEditStep(4) // Go to Save step
  }

  const handleReviewLabelsPrevious = () => {
    setEditStep(2) // Back to Create Labels
  }

  const handleReviewPrevious = () => {
    setEditStep(3) // Back to Review Labels
  }

  const handleSaveFromReview = async () => {
    // This will be called from GroundTruthReview component
    // The save logic is handled there, we just need to exit edit mode
    setIsEditMode(false)
    setEditStep(2)
    setIsMaximized(false)
    // Refresh the task data
    if (onBack) {
      onBack() // Go back to list to refresh
    }
  }

  const getStepTitle = () => {
    switch (editStep) {
      case 2:
        return 'Create Labels'
      case 3:
        return 'Review Labels'
      case 4:
        return 'Save'
      default:
        return 'Edit Ground Truth'
    }
  }

  const sortedLabels = [...(task.Labels || [])].sort((a, b) => a.StartTs - b.StartTs)

  const getReviewBadgeClass = (reviewResult) => {
    switch (reviewResult) {
      case 'true_positive':
        return 'review-badge-tp'
      case 'false_positive':
        return 'review-badge-fp'
      case 'unreviewed':
        return 'review-badge-unreviewed'
      default:
        return 'review-badge-default'
    }
  }

  const getReviewBadgeText = (reviewResult) => {
    switch (reviewResult) {
      case 'true_positive':
        return 'TP'
      case 'false_positive':
        return 'FP'
      case 'false_negative':
        return 'FN'
      case 'true_negative':
        return 'TN'
      case 'unreviewed':
        return 'Unreviewed'
      default:
        return reviewResult || 'N/A'
    }
  }

  // Render edit mode
  if (isEditMode) {
    return (
      <div className="edit-ground-truth-container">
        <div className="wizard-header">
          <button className="btn-back" onClick={handleCancelEdit}>
            <img src={arrowLeftIcon} alt="Back" style={{ width: '16px', height: '16px', marginRight: '8px' }} />
            Cancel
          </button>
          <h1>Edit Ground Truth - {getStepTitle()}</h1>
        </div>

        <GroundTruthStepIndicator currentStep={editStep} />

        <div className={`wizard-content ${(editStep === 2 && activeTab === 'manual') || editStep === 3 ? 'full-height' : ''}`}>
          {editStep === 2 && task.video && (
            <LabelCreator
              video={task.video}
              currentUser={currentUser}
              initialSearches={allSearches}
              initialResults={allResults}
              onNext={handleLabelsNext}
              onTabChange={handleTabChange}
            />
          )}

          {editStep === 3 && task.video && (
            <div className={`review-labels-step ${isMaximized ? 'maximized' : ''}`}>
              <div className="review-labels-controls">
                <button 
                  className="btn-maximize"
                  onClick={() => setIsMaximized(!isMaximized)}
                  title={isMaximized ? 'Exit fullscreen' : 'Maximize'}
                >
                  {isMaximized ? (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 3H3V8M12 3H17V8M8 17H3V12M12 17H17V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 8V3H8M17 8V3H12M3 12V17H8M17 12V17H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  <span>{isMaximized ? 'Exit Fullscreen' : 'Maximize'}</span>
                </button>
              </div>
              <ManualLabel
                video={task.video}
                allResults={allResults}
                setAllResults={setAllResults}
                isMaximized={isMaximized}
                resetTrigger={0}
              />
              {!isMaximized && (
                <div className="review-labels-actions">
                  <button className="btn-secondary" onClick={handleReviewLabelsPrevious}>
                    Previous
                  </button>
                  <button className="btn-primary" onClick={handleReviewLabelsNext}>
                    Next: Save Ground Truth
                  </button>
                </div>
              )}
            </div>
          )}

          {editStep === 4 && task.video && (
            <GroundTruthReview
              video={task.video}
              allSearches={allSearches}
              allResults={allResults}
              onPrevious={handleReviewPrevious}
              onUpdate={(updatedSearches, updatedResults) => {
                setAllSearches(updatedSearches)
                setAllResults(updatedResults)
              }}
              onSave={handleSaveFromReview}
              currentUser={currentUser}
              existingGroundTruth={task}
            />
          )}
        </div>
      </div>
    )
  }

  // Render readonly mode
  return (
    <div className="gt-task-detail task-detail">
      <div className="task-detail-header">
        <button className="btn-back" onClick={onBack}>
          <img src={arrowLeftIcon} alt="Back" style={{ width: '16px', height: '16px', marginRight: '8px' }} />
          Back to List
        </button>
        {isEditingName ? (
          <div className="name-edit-container">
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              className="name-edit-input"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSaveName()
                } else if (e.key === 'Escape') {
                  handleCancelNameEdit()
                }
              }}
            />
            <button className="btn-save-name" onClick={handleSaveName}>
              ✓
            </button>
            <button className="btn-cancel-name" onClick={handleCancelNameEdit}>
              ✕
            </button>
          </div>
        ) : (
          <div className="name-display-container">
            <h1>{task.Name || task.taskName}</h1>
            <button className="btn-edit-name-icon" onClick={handleEditName} title="Edit name">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.3333 2.00004C11.5084 1.82494 11.716 1.68605 11.9441 1.59129C12.1722 1.49653 12.4165 1.44775 12.6633 1.44775C12.9101 1.44775 13.1544 1.49653 13.3825 1.59129C13.6106 1.68605 13.8183 1.82494 13.9933 2.00004C14.1684 2.17513 14.3073 2.38282 14.4021 2.61091C14.4968 2.839 14.5456 3.08334 14.5456 3.33004C14.5456 3.57674 14.4968 3.82107 14.4021 4.04916C14.3073 4.27725 14.1684 4.48494 13.9933 4.66004L5.00001 13.6534L1.33334 14.6667L2.34668 11L11.3333 2.00004Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="ground-truth-layout">
        <div className="ground-truth-main">
          <div className="ground-truth-left">
            {/* Video Player */}
            <div className="ground-truth-video">
              {task.video?.video_url ? (
                <video 
                  ref={videoRef}
                  className="video-player" 
                  controls
                  muted
                  src={task.video.video_url}
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="video-placeholder">No video available</div>
              )}
            </div>

            {/* Video Metadata */}
            <div className="metadata-section">
              <h3>Video Information</h3>
              <div className="metadata-grid">
                <div className="metadata-item">
                  <span className="metadata-label">Video Name</span>
                  <span className="metadata-value">{task.video?.Name || 'N/A'}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Duration</span>
                  <span className="metadata-value">{formatDuration(task.video?.Duration)}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Resolution</span>
                  <span className="metadata-value">
                    {task.video?.Resolution && Array.isArray(task.video.Resolution)
                      ? `${task.video.Resolution[0]}x${task.video.Resolution[1]}`
                      : task.video?.Width && task.video?.Height 
                        ? `${task.video.Width}x${task.video.Height}` 
                        : 'N/A'}
                  </span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">FPS</span>
                  <span className="metadata-value">
                    {task.video?.Fps 
                      ? (typeof task.video.Fps === 'number' ? task.video.Fps.toFixed(2) : task.video.Fps)
                      : task.video?.FrameRate || 'N/A'}
                  </span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">File Size</span>
                  <span className="metadata-value">
                    {formatFileSize(task.video?.Size || task.video?.FileSize)}
                  </span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Format</span>
                  <span className="metadata-value">
                    {task.video?.Format || 
                     (task.video?.Name ? task.video.Name.split('.').pop().toUpperCase() : 'N/A')}
                  </span>
                </div>
              </div>
            </div>

            {/* Ground Truth Metadata */}
            <div className="metadata-section">
              <h3>Ground Truth Information</h3>
              <div className="metadata-grid">
                <div className="metadata-item full-width">
                  <span className="metadata-label">Description</span>
                  <span className="metadata-value">{task.Description || task.description || 'No description'}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Created By</span>
                  <span className="metadata-value">{task.CreatedBy || task.createdBy}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Created Date</span>
                  <span className="metadata-value">
                    {task.CreatedAt 
                      ? new Date(task.CreatedAt).toLocaleString() 
                      : task.createdDate || 'N/A'}
                  </span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Total Labels</span>
                  <span className="metadata-value">{sortedLabels.length}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Ground Truth ID</span>
                  <span className="metadata-value metadata-value-small">{task.Id || task.id}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Labels Section */}
          <div className="ground-truth-right">
            <div className="ground-truth-labels">
              <div className="labels-header">
                <h3>Labels ({sortedLabels.length})</h3>
                <button className="btn-edit-name" onClick={handleEditLabels}>
                  Edit Labels
                </button>
              </div>
              
              <div className="labels-list">
                {sortedLabels.length === 0 ? (
                  <div className="no-labels">No labels available</div>
                ) : (
                  sortedLabels.map((label, index) => (
                    <div
                      key={index}
                      className={`label-card clickable ${selectedLabel === label ? 'selected' : ''}`}
                      onClick={() => handleLabelClick(label)}
                    >
                      <div className="label-card-header">
                        <span className="label-name">
                          {label.Label || `Segment ${index + 1}`}
                        </span>
                        <span className={`review-badge ${getReviewBadgeClass(label.ReviewResult)}`}>
                          {getReviewBadgeText(label.ReviewResult)}
                        </span>
                      </div>
                      <div className="label-card-body">
                        <div className="label-info-row">
                          <span className="label-info-label">Time Range</span>
                          <span className="label-info-value">
                            {formatTime(label.StartTs)} - {formatTime(label.EndTs)}
                          </span>
                        </div>
                        <div className="label-info-row">
                          <span className="label-info-label">Duration</span>
                          <span className="label-info-value">
                            {formatDuration(label.EndTs - label.StartTs)}
                          </span>
                        </div>
                        {label.Score !== undefined && label.Score !== null && (
                          <div className="label-info-row">
                            <span className="label-info-label">Score</span>
                            <span className="label-info-value">
                              {typeof label.Score === 'number' ? label.Score.toFixed(3) : label.Score}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GroundTruthTaskDetail
