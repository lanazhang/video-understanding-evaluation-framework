import './GroundTruthTaskDetail.css'
import { useEffect, useState, useRef } from 'react'
import { FetchPost } from '../utils/apiHelper'

function GroundTruthTaskDetail({ task, onBack }) {
  const [activeTab, setActiveTab] = useState('pending')
  const [reviewMode, setReviewMode] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editedLabel, setEditedLabel] = useState(null)
  const videoRef = useRef(null)
  
  // Ground truth name editing state
  const [editingName, setEditingName] = useState(false)
  const [editedName, setEditedName] = useState(task.Name || task.taskName || '')
  
  // New label capture state
  const [captureMode, setCaptureMode] = useState(false)
  const [newLabel, setNewLabel] = useState({
    startTs: null,
    endTs: null,
    label: ''
  })

  useEffect(() => {
    console.log('GroundTruthTaskDetail - Full task data:', task)
    console.log('GroundTruthTaskDetail - Video data:', task?.video)
    console.log('GroundTruthTaskDetail - Video URL:', task?.video?.video_url)
  }, [task])

  // Handle video time update to auto-stop at end timestamp
  useEffect(() => {
    if (!videoRef.current || !selectedLabel || editMode) return

    const handleTimeUpdate = () => {
      if (videoRef.current.currentTime >= selectedLabel.EndTs) {
        videoRef.current.pause()
      }
    }

    videoRef.current.addEventListener('timeupdate', handleTimeUpdate)
    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('timeupdate', handleTimeUpdate)
      }
    }
  }, [selectedLabel, editMode])

  const formatTimestamp = (ts) => {
    const minutes = Math.floor(ts / 60)
    const seconds = (ts % 60).toFixed(2)
    return `${minutes}:${seconds.padStart(5, '0')}`
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleString()
  }

  const getReviewBadgeClass = (reviewResult) => {
    // Handle both short codes and full API values
    const normalizedResult = reviewResult?.toLowerCase()
    if (normalizedResult === 'tp' || normalizedResult === 'true_positive') return 'review-badge-tp'
    if (normalizedResult === 'fp' || normalizedResult === 'false_positive') return 'review-badge-fp'
    if (normalizedResult === 'unreviewed') return 'review-badge-unreviewed'
    return 'review-badge-default'
  }

  const getReviewBadgeText = (reviewResult) => {
    // Display short codes for UI
    const normalizedResult = reviewResult?.toLowerCase()
    if (normalizedResult === 'true_positive') return 'tp'
    if (normalizedResult === 'false_positive') return 'fp'
    return reviewResult || 'unreviewed'
  }

  const handleLabelClick = (label) => {
    setSelectedLabel(label)
    setEditMode(false)
    
    // Navigate video to start timestamp and play
    if (videoRef.current) {
      videoRef.current.currentTime = label.StartTs
      videoRef.current.play().catch(err => {
        console.log('Video play failed:', err)
      })
    }
  }

  const selectNextLabel = () => {
    if (!selectedLabel || activeTab !== 'pending') return
    
    const currentIndex = pendingLabels.findIndex(l => l === selectedLabel)
    if (currentIndex >= 0 && currentIndex < pendingLabels.length - 1) {
      const nextLabel = pendingLabels[currentIndex + 1]
      setSelectedLabel(nextLabel)
      setEditMode(false)
      
      // Navigate video to next label's start timestamp and play
      if (videoRef.current) {
        videoRef.current.currentTime = nextLabel.StartTs
        videoRef.current.play()
      }
    } else {
      // No more labels to review
      setSelectedLabel(null)
      setEditMode(false)
    }
  }

  const saveGroundTruth = async () => {
    try {
      const labels = task.Labels || task.labels || []
      
      // Determine status based on review completion
      const allReviewed = labels.every(label => 
        label.ReviewResult && label.ReviewResult !== 'unreviewed'
      )
      const anyReviewed = labels.some(label => 
        label.ReviewResult && label.ReviewResult !== 'unreviewed'
      )
      
      let status = 'created'
      if (allReviewed) {
        status = 'reviewed'
      } else if (anyReviewed) {
        status = 'in_review'
      }
      
      // Prepare payload for upsert API
      const payload = {
        Id: task.Id || task.id,
        Name: task.Name || task.taskName,
        Description: task.Description || task.description,
        CreatedBy: task.CreatedBy || task.createdBy,
        VideoId: task.VideoId || task.videoId,
        VideoAnalyzeTaskIds: task.VideoAnalyzeTaskIds || task.videoAnalyzeTaskIds || [],
        Status: status,
        Labels: labels.map(label => ({
          StartTs: label.StartTs,
          EndTs: label.EndTs,
          Score: label.Score,
          Label: label.Label,
          Source: label.Source,
          ReviewResult: label.ReviewResult || 'unreviewed'
        }))
      }
      
      console.log('Auto-saving ground truth:', payload)
      
      const response = await FetchPost('/video/upsert-ground-truth', payload, 'EvalService')
      
      console.log('Save response:', response)
      
      return response
    } catch (error) {
      console.error('Error saving ground truth:', error)
      throw error
    }
  }

  const handleReview = async (reviewResult) => {
    if (!selectedLabel) return
    
    // Map short codes to full API values
    const reviewResultMap = {
      'tp': 'true_positive',
      'fp': 'false_positive',
      'unreviewed': 'unreviewed'
    }
    
    const apiReviewResult = reviewResultMap[reviewResult] || reviewResult
    
    console.log('Review label:', selectedLabel, 'Result:', apiReviewResult)
    
    // Update local state
    selectedLabel.ReviewResult = apiReviewResult
    
    // Auto-save to backend
    try {
      await saveGroundTruth()
    } catch (error) {
      alert('Failed to save review: ' + error.message)
      return
    }
    
    // If marking as unreviewed from reviewed tab, just clear selection
    if (reviewResult === 'unreviewed' && activeTab === 'reviewed') {
      setSelectedLabel(null)
      return
    }
    
    // Auto-select next label for pending tab
    if (activeTab === 'pending') {
      selectNextLabel()
    }
  }

  const handleModify = () => {
    setEditMode(true)
    setEditedLabel({
      Label: selectedLabel.Label,
      StartTs: selectedLabel.StartTs,
      EndTs: selectedLabel.EndTs
    })
  }

  const handleSaveModification = async () => {
    if (!editedLabel || !selectedLabel) return
    
    console.log('Update label:', selectedLabel, 'New values:', editedLabel)
    
    // Update local state
    selectedLabel.Label = editedLabel.Label
    selectedLabel.StartTs = editedLabel.StartTs
    selectedLabel.EndTs = editedLabel.EndTs
    selectedLabel.ReviewResult = 'true_positive' // Mark as reviewed after modification
    
    setEditedLabel(null)
    
    // Auto-save to backend
    try {
      await saveGroundTruth()
    } catch (error) {
      alert('Failed to save modification: ' + error.message)
      return
    }
    
    // Auto-select next label
    selectNextLabel()
  }

  const handleCancelEdit = () => {
    setEditMode(false)
    setEditedLabel(null)
  }
  
  const handleMarkStart = () => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime
      setNewLabel(prev => ({ ...prev, startTs: currentTime }))
    }
  }
  
  const handleMarkEnd = () => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime
      setNewLabel(prev => ({ ...prev, endTs: currentTime }))
    }
  }
  
  const handleAddNewLabel = async () => {
    if (!newLabel.startTs || !newLabel.endTs || !newLabel.label.trim()) {
      alert('Please mark start/end timestamps and enter a label')
      return
    }
    
    if (newLabel.startTs >= newLabel.endTs) {
      alert('End timestamp must be greater than start timestamp')
      return
    }
    
    // Add new label to the task
    const labels = task.Labels || task.labels || []
    const newLabelObj = {
      StartTs: newLabel.startTs,
      EndTs: newLabel.endTs,
      Score: 1.0,
      Label: newLabel.label,
      Source: 'manual',
      ReviewResult: 'unreviewed'
    }
    
    labels.push(newLabelObj)
    
    // Update task labels
    if (task.Labels) {
      task.Labels = labels
    } else {
      task.labels = labels
    }
    
    // Auto-save to backend
    try {
      await saveGroundTruth()
      alert('New label added successfully!')
    } catch (error) {
      alert('Failed to add label: ' + error.message)
      // Remove the label from local state if save failed
      labels.pop()
      return
    }
    
    // Reset capture state
    setNewLabel({ startTs: null, endTs: null, label: '' })
    setCaptureMode(false)
  }
  
  const handleCancelCapture = () => {
    setNewLabel({ startTs: null, endTs: null, label: '' })
    setCaptureMode(false)
  }

  const handleSaveNameEdit = async () => {
    if (!editedName.trim()) {
      alert('Name cannot be empty')
      return
    }
    
    // Update task name
    if (task.Name) {
      task.Name = editedName
    } else {
      task.taskName = editedName
    }
    
    // Auto-save to backend
    try {
      await saveGroundTruth()
      setEditingName(false)
    } catch (error) {
      alert('Failed to save name: ' + error.message)
    }
  }

  const handleCancelNameEdit = () => {
    setEditedName(task.Name || task.taskName || '')
    setEditingName(false)
  }

  const video = task.video || {}
  const labels = task.Labels || task.labels || []
  
  // Filter labels based on review status
  const reviewedLabels = labels.filter(label => {
    const result = label.ReviewResult?.toLowerCase()
    return result && result !== 'unreviewed'
  })
  const pendingLabels = labels.filter(label => {
    const result = label.ReviewResult?.toLowerCase()
    return !result || result === 'unreviewed'
  })
  
  const displayedLabels = activeTab === 'reviewed' ? reviewedLabels : pendingLabels

  return (
    <div className="task-detail">
      <div className="task-detail-header">
        <button className="btn-back" onClick={onBack}>
          ← Back
        </button>
        {editingName ? (
          <div className="name-edit-container">
            <input 
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              className="name-edit-input"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSaveNameEdit()
                } else if (e.key === 'Escape') {
                  handleCancelNameEdit()
                }
              }}
            />
            <button 
              className="btn-save-name"
              onClick={handleSaveNameEdit}
              title="Save"
            >
              ✓
            </button>
            <button 
              className="btn-cancel-name"
              onClick={handleCancelNameEdit}
              title="Cancel"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="name-display-container">
            <h1>{task.Name || task.taskName || 'Ground Truth Detail'}</h1>
            <button 
              className="btn-edit-name"
              onClick={() => setEditingName(true)}
              title="Edit name"
            >
              ✎
            </button>
          </div>
        )}
      </div>

      <div className="ground-truth-layout">
        {/* Main Content - Two Columns */}
        <div className="ground-truth-main">
          {/* Left Column: Video + Metadata */}
          <div className="ground-truth-left">
            {/* Video Player */}
            <div className="ground-truth-video">
              {video.video_url ? (
                <video 
                  ref={videoRef}
                  controls 
                  muted
                  src={video.video_url}
                  className="video-player"
                  crossOrigin="anonymous"
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="video-placeholder">
                  No video available
                  {video && Object.keys(video).length > 0 && (
                    <div style={{ fontSize: '0.8em', marginTop: '10px' }}>
                      Video data exists but no URL found
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Metadata Below Video */}
            <div className="ground-truth-metadata">
              <div className="metadata-section-compact">
                <div className="metadata-grid-compact">
                  <div className="metadata-item-inline">
                    <span className="metadata-value">{video.Name || 'N/A'}</span>
                  </div>
                  <div className="metadata-item-inline">
                    <span className="metadata-value">{video.Duration ? `${video.Duration.toFixed(2)}s` : 'N/A'} • {video.Fps ? `${video.Fps.toFixed(2)} fps` : 'N/A'}</span>
                  </div>
                  <div className="metadata-item-inline">
                    <span className="metadata-value">
                      {video.Resolution ? `${video.Resolution[0]}x${video.Resolution[1]}` : 'N/A'} • {video.Size ? `${(video.Size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="metadata-section-compact">
                <div className="metadata-grid-compact">
                  <div className="metadata-item-inline">
                    <span className="metadata-value-small">{task.Id || task.id || 'N/A'}</span>
                  </div>
                  <div className="metadata-item-inline">
                    <span className="metadata-value">{task.CreatedBy || task.createdBy || 'N/A'} • {formatDate(task.CreatedAt || task.createdAt)}</span>
                  </div>
                  {(task.Description || task.description) && (
                    <div className="metadata-item-inline">
                      <span className="metadata-value">{task.Description || task.description}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Labels */}
          <div className="ground-truth-right">
            <div className="ground-truth-labels">
              <div className="labels-header-with-tabs">
                <h3>Labels ({labels.length})</h3>
                <div className="labels-controls">
                  <button 
                    className={`btn-capture-mode ${captureMode ? 'active' : ''}`}
                    onClick={() => {
                      setCaptureMode(!captureMode)
                      setReviewMode(false)
                      setSelectedLabel(null)
                      setEditMode(false)
                    }}
                  >
                    {captureMode ? 'Stop Capture' : 'Add New Label'}
                  </button>
                  {pendingLabels.length > 0 && (
                    <button 
                      className={`btn-review-mode ${reviewMode ? 'active' : ''}`}
                      onClick={() => {
                        const newReviewMode = !reviewMode
                        setReviewMode(newReviewMode)
                        setEditMode(false)
                        setCaptureMode(false)
                        
                        if (newReviewMode) {
                          // Auto-select first item when starting review
                          const currentLabels = activeTab === 'reviewed' ? reviewedLabels : pendingLabels
                          if (currentLabels.length > 0) {
                            handleLabelClick(currentLabels[0])
                          } else {
                            setSelectedLabel(null)
                          }
                        } else {
                          setSelectedLabel(null)
                        }
                      }}
                      disabled={!reviewMode && displayedLabels.length === 0}
                    >
                      {reviewMode ? 'Stop Review' : 'Start Review'}
                    </button>
                  )}
                  <div className="labels-tabs">
                    <button 
                      className={`tab-button ${activeTab === 'pending' ? 'active' : ''}`}
                      onClick={() => setActiveTab('pending')}
                    >
                      Pending ({pendingLabels.length})
                    </button>
                    <button 
                      className={`tab-button ${activeTab === 'reviewed' ? 'active' : ''}`}
                      onClick={() => setActiveTab('reviewed')}
                    >
                      Reviewed ({reviewedLabels.length})
                    </button>
                  </div>
                </div>
              </div>

              {captureMode && (
                <div className="capture-panel">
                  <div className="capture-panel-content">
                    <div className="capture-info">
                      <h4>Add New Label</h4>
                      <p>Play the video and mark the start and end timestamps for the new label</p>
                    </div>
                    <div className="capture-form">
                      <div className="capture-timestamps">
                        <button 
                          className="btn-mark-timestamp"
                          onClick={handleMarkStart}
                        >
                          Mark Start
                        </button>
                        <span className="timestamp-display">
                          {newLabel.startTs !== null ? formatTimestamp(newLabel.startTs) : '--:--'}
                        </span>
                        <button 
                          className="btn-mark-timestamp"
                          onClick={handleMarkEnd}
                        >
                          Mark End
                        </button>
                        <span className="timestamp-display">
                          {newLabel.endTs !== null ? formatTimestamp(newLabel.endTs) : '--:--'}
                        </span>
                      </div>
                      <div className="capture-label-input">
                        <input 
                          type="text"
                          placeholder="Enter label name..."
                          value={newLabel.label}
                          onChange={(e) => setNewLabel(prev => ({ ...prev, label: e.target.value }))}
                          className="label-input"
                        />
                      </div>
                      <div className="capture-actions">
                        <button 
                          className="btn-add-label"
                          onClick={handleAddNewLabel}
                        >
                          Add Label
                        </button>
                        <button 
                          className="btn-cancel-capture"
                          onClick={handleCancelCapture}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {reviewMode && selectedLabel && (
                <div className="review-panel">
                  <button 
                    className="btn-close-review-panel"
                    onClick={() => {
                      setSelectedLabel(null)
                      setEditMode(false)
                    }}
                    title="Close"
                  >
                    ✕
                  </button>
                  {editMode ? (
                    <div className="review-panel-content edit-mode">
                      <div className="edit-form">
                        <div className="edit-form-row">
                          <label>Label:</label>
                          <input 
                            type="text"
                            value={editedLabel.Label}
                            onChange={(e) => setEditedLabel({...editedLabel, Label: e.target.value})}
                            className="edit-input"
                          />
                        </div>
                        <div className="edit-form-row">
                          <label>Start Time (s):</label>
                          <input 
                            type="number"
                            step="0.01"
                            value={editedLabel.StartTs}
                            onChange={(e) => setEditedLabel({...editedLabel, StartTs: parseFloat(e.target.value)})}
                            className="edit-input"
                          />
                        </div>
                        <div className="edit-form-row">
                          <label>End Time (s):</label>
                          <input 
                            type="number"
                            step="0.01"
                            value={editedLabel.EndTs}
                            onChange={(e) => setEditedLabel({...editedLabel, EndTs: parseFloat(e.target.value)})}
                            className="edit-input"
                          />
                        </div>
                      </div>
                      <div className="edit-actions">
                        <button 
                          className="btn-review-action btn-save-edit"
                          onClick={handleSaveModification}
                        >
                          Save Changes
                        </button>
                        <button 
                          className="btn-review-action btn-cancel-edit"
                          onClick={handleCancelEdit}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="review-panel-content">
                      <div className="review-label-info">
                        <strong>{selectedLabel.Label}</strong>
                        <span>{formatTimestamp(selectedLabel.StartTs)} - {formatTimestamp(selectedLabel.EndTs)}</span>
                      </div>
                      <div className="review-actions">
                        <button 
                          className="btn-review-action btn-true-positive"
                          onClick={() => handleReview('tp')}
                          title="True Positive"
                        >
                          ✓
                        </button>
                        <button 
                          className="btn-review-action btn-false-positive"
                          onClick={() => handleReview('fp')}
                          title="False Positive"
                        >
                          ✗
                        </button>
                        <button 
                          className="btn-review-action btn-modify"
                          onClick={handleModify}
                          title="Modify"
                        >
                          ✎
                        </button>
                        {activeTab === 'reviewed' && (
                          <button 
                            className="btn-review-action btn-mark-unreviewed"
                            onClick={() => handleReview('unreviewed')}
                            title="Mark as Unreviewed"
                          >
                            ↺
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="labels-list">
                {displayedLabels.length === 0 ? (
                  <div className="no-labels">
                    No {activeTab === 'reviewed' ? 'reviewed' : 'pending'} labels
                  </div>
                ) : (
                  displayedLabels.map((label, index) => (
                    <div 
                      key={index} 
                      className={`label-card clickable ${selectedLabel === label ? 'selected' : ''}`}
                      onClick={() => handleLabelClick(label)}
                    >
                      <div className="label-card-header">
                        <span className="label-name">{label.Label}</span>
                        <span className={`review-badge ${getReviewBadgeClass(label.ReviewResult)}`}>
                          {getReviewBadgeText(label.ReviewResult)}
                        </span>
                      </div>
                      <div className="label-card-body">
                        <div className="label-info-compact">
                          {formatTimestamp(label.StartTs)} - {formatTimestamp(label.EndTs)}
                        </div>
                        <div className="label-info-compact">
                          Score: {label.Score ? label.Score.toFixed(4) : 'N/A'} • {label.Source || 'N/A'}
                        </div>
                        {activeTab === 'reviewed' && (
                          <div className="label-card-actions">
                            <button 
                              className="btn-edit-review"
                              onClick={(e) => {
                                e.stopPropagation()
                                setReviewMode(true)
                                handleLabelClick(label)
                              }}
                            >
                              Edit Review
                            </button>
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
