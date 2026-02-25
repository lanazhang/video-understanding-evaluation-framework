import { useState, useEffect, useRef } from 'react'
import './GroundTruthTaskDetail.css'
import arrowLeftIcon from '../assets/icons/arrow-left.svg'
import { FetchPost } from '../utils/apiHelper'
import EmbeddingSearch from './GroundTruth/EmbeddingSearch'
import GroundTruthReview from './GroundTruth/GroundTruthReview'

function GroundTruthTaskDetail({ task, onBack, currentUser }) {
  const [selectedLabel, setSelectedLabel] = useState(null)
  const [isEditMode, setIsEditMode] = useState(task.openInEditMode || false)
  const [editStep, setEditStep] = useState('search') // 'search' or 'review'
  const [allSearches, setAllSearches] = useState([])
  const [allResults, setAllResults] = useState([])
  const [editingSegment, setEditingSegment] = useState(null)
  const [activeTab, setActiveTab] = useState('unreviewed')
  const [segments, setSegments] = useState([])
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
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
          reviewStatus: label.ReviewResult || 'unreviewed'
        }))
      setSegments(initialSegments)
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
    if (videoRef.current) {
      videoRef.current.currentTime = label.StartTs
      videoRef.current.play()
    }
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
    setIsEditMode(true)
    setEditStep('search')
    setEditName(task.Name || task.taskName || '')
    setEditDescription(task.Description || task.description || '')
    // Initialize allResults with existing labels
    if (task.Labels) {
      const existingResults = task.Labels.map(label => ({
        StartSec: label.StartTs,
        EndSec: label.EndTs,
        query: label.Label || '',
        Distance: label.Score || 0,
        reviewStatus: label.ReviewResult || 'reviewed', // Mark existing labels as reviewed
        source: 'manual' // Mark as manual since they're existing labels
      }))
      setAllResults(existingResults)
      setAllSearches([]) // No searches initially
    }
  }

  const handleCancelEdit = () => {
    setIsEditMode(false)
    setEditStep('search')
    setEditingSegment(null)
    setAllSearches([])
    setAllResults([])
    setEditName(task.Name || task.taskName || '')
    setEditDescription(task.Description || task.description || '')
  }

  const handleNextToReview = (searches, results) => {
    setAllSearches(searches)
    setAllResults(results)
    setEditStep('review')
  }

  const handleBackToSearch = () => {
    setEditStep('search')
  }

  const handleSaveFromReview = async () => {
    // This will be called from GroundTruthReview component
    // The save logic is handled there, we just need to exit edit mode
    setIsEditMode(false)
    setEditStep('search')
    // Refresh the task data
    if (onBack) {
      onBack() // Go back to list to refresh
    }
  }

  const handleConfirmSegment = (segment) => {
    setSegments(segments.map(seg => 
      seg === segment ? { ...seg, reviewStatus: 'reviewed' } : seg
    ))
    setEditingSegment(null)
  }

  const handleDeclineSegment = (segment) => {
    setSegments(segments.filter(seg => seg !== segment))
    setEditingSegment(null)
  }

  const handleEditSegment = (segment) => {
    setEditingSegment(segment)
  }

  const handleSaveSegmentEdit = (originalSegment, updates) => {
    setSegments(segments.map(seg => 
      seg === originalSegment ? { ...seg, ...updates } : seg
    ))
    setEditingSegment(null)
  }

  const handleCancelSegmentEdit = () => {
    setEditingSegment(null)
  }

  const handleSaveChanges = async () => {
    if (!editName.trim()) {
      setError('Please enter a name for the ground truth')
      return
    }

    setSaving(true)
    setError(null)

    try {
      // Convert segments back to labels format
      const labels = segments.map(seg => ({
        StartTs: parseFloat(parseFloat(seg.StartSec || 0).toFixed(3)),
        EndTs: parseFloat(parseFloat(seg.EndSec || 0).toFixed(3)),
        Score: parseFloat(seg.Distance || 0),
        Label: seg.query,
        ReviewResult: seg.reviewStatus || 'unreviewed'
      }))

      const payload = {
        Id: task.Id || task.id,
        Name: editName.trim(),
        Description: editDescription.trim(),
        CreatedBy: task.CreatedBy || task.createdBy,
        VideoId: task.VideoId || task.videoId,
        Labels: labels
      }

      const data = await FetchPost('/gt/upsert-ground-truth', payload, 'EvalService')

      console.log('Ground truth update response:', data)

      if (data.statusCode === 200 || data.message) {
        setIsEditMode(false)
        setEditingSegment(null)
        // Update task properties
        task.Labels = labels
        task.Name = editName.trim()
        task.taskName = editName.trim()
        task.Description = editDescription.trim()
        task.description = editDescription.trim()
        alert('Ground truth updated successfully!')
      } else {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        const errorMessage = responseBody?.error || data.error || data.body || 'Failed to update ground truth'
        setError('Failed to update ground truth: ' + errorMessage)
      }
    } catch (err) {
      console.error('Error updating ground truth:', err)
      setError('Error updating ground truth: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const unreviewedSegments = segments.filter(seg => seg.reviewStatus === 'unreviewed')
  const reviewedSegments = segments.filter(seg => seg.reviewStatus === 'reviewed')

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
    if (editStep === 'search') {
      return (
        <div className="edit-ground-truth-container">
          <div className="edit-header">
            <button className="btn-back" onClick={handleCancelEdit}>
              <img src={arrowLeftIcon} alt="Back" style={{ width: '16px', height: '16px', marginRight: '8px' }} />
              Cancel
            </button>
            <h1>Edit Ground Truth - Add/Search Labels</h1>
          </div>
          <EmbeddingSearch 
            video={task.video}
            onNext={handleNextToReview}
            currentUser={currentUser}
            initialSearches={allSearches}
            initialResults={allResults}
          />
        </div>
      )
    } else {
      return (
        <div className="edit-ground-truth-container">
          <div className="edit-header">
            <button className="btn-back" onClick={handleBackToSearch}>
              <img src={arrowLeftIcon} alt="Back" style={{ width: '16px', height: '16px', marginRight: '8px' }} />
              Back to Search
            </button>
            <h1>Edit Ground Truth - Review & Save</h1>
          </div>
          <GroundTruthReview
            video={task.video}
            allSearches={allSearches}
            allResults={allResults}
            onPrevious={handleBackToSearch}
            onUpdate={(updatedSearches, updatedResults) => {
              setAllSearches(updatedSearches)
              setAllResults(updatedResults)
            }}
            onSave={handleSaveFromReview}
            currentUser={currentUser}
            existingGroundTruth={task}
          />
        </div>
      )
    }
  }

  // Render readonly mode
  return (
    <div className="task-detail">
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
                    {task.video?.Width && task.video?.Height 
                      ? `${task.video.Width}x${task.video.Height}` 
                      : 'N/A'}
                  </span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">FPS</span>
                  <span className="metadata-value">{task.video?.FrameRate || 'N/A'}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">File Size</span>
                  <span className="metadata-value">{formatFileSize(task.video?.FileSize)}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Format</span>
                  <span className="metadata-value">{task.video?.Format || 'N/A'}</span>
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

function SegmentItem({ result, index, isEditing, onEdit, onSaveEdit, onCancelEdit, onTimeClick, onConfirm, onDecline, formatDuration, showConfirm, isReviewed, videoPlayerRef }) {
  const [editStartSec, setEditStartSec] = useState(parseFloat(result.StartSec || 0).toFixed(2))
  const [editEndSec, setEditEndSec] = useState(parseFloat(result.EndSec || 0).toFixed(2))
  const [editQuery, setEditQuery] = useState(result.query)

  const handleSave = () => {
    onSaveEdit({
      StartSec: parseFloat(editStartSec),
      EndSec: parseFloat(editEndSec),
      query: editQuery
    })
  }

  const handleCaptureStart = () => {
    if (videoPlayerRef.current) {
      const currentTime = videoPlayerRef.current.currentTime
      setEditStartSec(currentTime.toFixed(2))
    }
  }

  const handleCaptureEnd = () => {
    if (videoPlayerRef.current) {
      const currentTime = videoPlayerRef.current.currentTime
      setEditEndSec(currentTime.toFixed(2))
    }
  }

  const handleCancel = () => {
    onCancelEdit()
  }

  if (isEditing) {
    return (
      <div className={`review-result-item editing ${isReviewed ? 'reviewed' : ''}`}>
        <span className="result-rank">#{index + 1}</span>
        <div className="edit-time-inputs">
          <div className="time-input-group">
            <input
              type="number"
              step="0.01"
              value={editStartSec}
              onChange={(e) => setEditStartSec(e.target.value)}
              className="edit-time-input"
              placeholder="Start"
            />
            <button
              className="btn-capture-time"
              onClick={handleCaptureStart}
              title="Capture current video time"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 1.16667V7L10.5 8.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>
          </div>
          <span>-</span>
          <div className="time-input-group">
            <input
              type="number"
              step="0.01"
              value={editEndSec}
              onChange={(e) => setEditEndSec(e.target.value)}
              className="edit-time-input"
              placeholder="End"
            />
            <button
              className="btn-capture-time"
              onClick={handleCaptureEnd}
              title="Capture current video time"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 1.16667V7L10.5 8.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>
          </div>
        </div>
        <input
          type="text"
          value={editQuery}
          onChange={(e) => setEditQuery(e.target.value)}
          className="edit-query-input"
          placeholder="Label"
        />
        <span className="result-duration">
          {formatDuration(parseFloat(editEndSec || 0) - parseFloat(editStartSec || 0))}
        </span>
        <span className="result-distance">
          {result.Distance?.toFixed(4) || 'N/A'}
        </span>
        <div className="segment-actions">
          <button 
            className="btn-save-edit"
            onClick={handleSave}
            title="Save changes"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button 
            className="btn-cancel-edit"
            onClick={handleCancel}
            title="Cancel"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`review-result-item ${isReviewed ? 'reviewed' : ''}`}>
      <span className="result-rank">#{index + 1}</span>
      <button 
        className="result-time-link"
        onClick={() => onTimeClick(result.StartSec, result.EndSec)}
      >
        {parseFloat(result.StartSec || 0).toFixed(2)}s - {parseFloat(result.EndSec || 0).toFixed(2)}s
      </button>
      <span className="result-query-tag">"{result.query}"</span>
      <span className="result-duration">
        {formatDuration(parseFloat(result.EndSec || 0) - parseFloat(result.StartSec || 0))}
      </span>
      <span className="result-distance">
        {result.Distance?.toFixed(4) || 'N/A'}
      </span>
      <div className="segment-actions">
        {showConfirm && (
          <button 
            className="btn-confirm-segment"
            onClick={onConfirm}
            title="Confirm segment"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        <button 
          className="btn-decline-segment"
          onClick={onDecline}
          title={isReviewed ? "Remove segment" : "Decline segment"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button 
          className="btn-edit-segment"
          onClick={onEdit}
          title="Edit segment"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11.3333 2.00004C11.5084 1.82494 11.716 1.68605 11.9441 1.59129C12.1722 1.49653 12.4165 1.44775 12.6633 1.44775C12.9101 1.44775 13.1544 1.49653 13.3825 1.59129C13.6106 1.68605 13.8183 1.82494 13.9933 2.00004C14.1684 2.17513 14.3073 2.38282 14.4021 2.61091C14.4968 2.839 14.5456 3.08334 14.5456 3.33004C14.5456 3.57674 14.4968 3.82107 14.4021 4.04916C14.3073 4.27725 14.1684 4.48494 13.9933 4.66004L5.00001 13.6534L1.33334 14.6667L2.34668 11L11.3333 2.00004Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

export default GroundTruthTaskDetail
