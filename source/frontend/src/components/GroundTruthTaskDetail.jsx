import { useState, useRef, useEffect } from 'react'
import './GroundTruthTaskDetail.css'
import taskConfig from '../static/taskConfig.json'
import videosData from '../static/videos.json'

function GroundTruthTaskDetail({ task, onBack }) {
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [selectedLabel, setSelectedLabel] = useState(null)
  const [showVideoList, setShowVideoList] = useState(true)
  const [reviewMode, setReviewMode] = useState(false)
  const [startTime, setStartTime] = useState(null)
  const [endTime, setEndTime] = useState(null)
  const [selectedEventType, setSelectedEventType] = useState('')
  const [humanAnnotations, setHumanAnnotations] = useState([])
  const [labelReviews, setLabelReviews] = useState({})
  const [captureMode, setCaptureMode] = useState(false)
  const [lastPlayTime, setLastPlayTime] = useState(null)
  const videoRef = useRef(null)

  // Load videos from JSON and filter by task's selectedVideos
  const videos = videosData.filter(video => 
    task.selectedVideos && task.selectedVideos.includes(video.id)
  )

  // Parse event types from task
  const eventTypes = task.eventTypes ? task.eventTypes.split(',').map(e => e.trim()) : taskConfig.eventTypes

  // Set up video event listeners for play/pause capture
  useEffect(() => {
    const video = videoRef.current
    if (!video || !reviewMode || !captureMode) return

    const handlePlay = () => {
      const currentTime = video.currentTime
      if (startTime === null) {
        // First play - mark as start
        setStartTime(currentTime)
        setLastPlayTime(currentTime)
      } else if (endTime === null && lastPlayTime !== null) {
        // Resume after pause - update start if needed
        setLastPlayTime(currentTime)
      }
    }

    const handlePause = () => {
      const currentTime = video.currentTime
      if (startTime !== null && endTime === null) {
        // Pause after start - mark as end
        setEndTime(currentTime)
      }
    }

    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)

    return () => {
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
    }
  }, [reviewMode, captureMode, startTime, endTime, lastPlayTime])

  const handleVideoCardClick = (video) => {
    setSelectedVideo(video)
    setShowVideoList(false)
    setSelectedLabel(null)
  }

  const handleBackToVideoList = () => {
    setShowVideoList(true)
    setSelectedVideo(null)
    setSelectedLabel(null)
  }

  const handleLabelClick = (label) => {
    setSelectedLabel(label)
    if (videoRef.current) {
      videoRef.current.currentTime = label.timestamp
      videoRef.current.play()
    }
  }

  const handleMarkStart = () => {
    if (videoRef.current) {
      setStartTime(videoRef.current.currentTime)
      setEndTime(null)
    }
  }

  const handleMarkEnd = () => {
    if (videoRef.current && startTime !== null) {
      setEndTime(videoRef.current.currentTime)
    }
  }

  const handleSaveAnnotation = () => {
    if (startTime !== null && endTime !== null && selectedEventType) {
      const newAnnotation = {
        id: Date.now(),
        name: selectedEventType,
        timestamp: startTime,
        duration: endTime - startTime,
        type: 'human',
      }
      setHumanAnnotations([...humanAnnotations, newAnnotation])
      // TODO: Save to API
      console.log('Saving annotation:', newAnnotation)
      
      // Reset
      setStartTime(null)
      setEndTime(null)
      setSelectedEventType('')
    }
  }

  const handleCancelAnnotation = () => {
    setStartTime(null)
    setEndTime(null)
    setSelectedEventType('')
    setLastPlayTime(null)
  }

  const handleDeleteAnnotation = (annotationId) => {
    setHumanAnnotations(humanAnnotations.filter(a => a.id !== annotationId))
    // TODO: Delete from API
  }

  const handleReviewLabel = (label, reviewType) => {
    setLabelReviews({
      ...labelReviews,
      [label.id]: reviewType
    })
    // TODO: Save review to API
    console.log(`Label ${label.id} marked as ${reviewType}`)
  }

  const handleQuickReview = (label, action) => {
    if (action === 'accept') {
      handleReviewLabel(label, 'true-positive')
    } else if (action === 'reject') {
      handleReviewLabel(label, 'false-positive')
    } else if (action === 'adjust') {
      // Navigate to label timestamp and allow adjustment
      if (videoRef.current) {
        videoRef.current.currentTime = label.timestamp
        videoRef.current.play()
      }
      setStartTime(label.timestamp)
      setEndTime(label.timestamp + label.duration)
      setSelectedEventType(label.name)
    }
  }

  const handleUpdateAnnotation = () => {
    if (startTime !== null && endTime !== null && selectedEventType) {
      // This updates an existing label or creates a new one
      const annotation = {
        id: Date.now(),
        name: selectedEventType,
        timestamp: startTime,
        duration: endTime - startTime,
        type: 'human',
      }
      setHumanAnnotations([...humanAnnotations, annotation])
      // TODO: Save to API
      console.log('Saving annotation:', annotation)
      
      // Reset
      setStartTime(null)
      setEndTime(null)
      setSelectedEventType('')
      setLastPlayTime(null)
    }
  }

  const getReviewBadge = (labelId) => {
    const review = labelReviews[labelId]
    if (!review) return null
    
    const badges = {
      'true-positive': { text: 'TP', color: '#4caf50' },
      'false-positive': { text: 'FP', color: '#f44336' },
    }
    
    return badges[review]
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="task-detail">
      <div className="task-detail-header">
        <button className="btn-back" onClick={showVideoList ? onBack : handleBackToVideoList}>
          ← Back
        </button>
        <h1>{task.taskName}</h1>
      </div>

      <div className="task-detail-content">
        {showVideoList ? (
          <div className="video-grid">
            {videos.map((video) => (
              <div
                key={video.id}
                className="video-card"
                onClick={() => handleVideoCardClick(video)}
              >
                <div className="video-card-thumbnail">
                  <video 
                    src={video.url} 
                    preload="metadata"
                    muted
                  />
                </div>
                <div className="video-card-content">
                  <h3 className="video-card-title">{video.name}</h3>
                  <div className="video-card-info">
                    <div className="video-card-info-item">
                      <span>Duration: {video.duration}</span>
                    </div>
                    <div className="video-card-info-item">
                      <span>Labels: {video.labelCount}</span>
                    </div>
                    <div className="video-card-info-item">
                      <span>Status: {video.status}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="video-detail-view">
            <div className="video-left-section">
              {selectedVideo && (
                <>
                  <div className="video-player">
                    <video
                      ref={videoRef}
                      src={selectedVideo.url}
                      controls
                      width="100%"
                      muted
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>

                  <div className="video-info-section">
                    <h3>Video Information</h3>
                    <div className="video-info-grid">
                      <div className="video-info-item">
                        <span className="video-info-label">Name</span>
                        <span className="video-info-value">{selectedVideo.name}</span>
                      </div>
                      <div className="video-info-item">
                        <span className="video-info-label">Duration</span>
                        <span className="video-info-value">{selectedVideo.duration}</span>
                      </div>
                      <div className="video-info-item">
                        <span className="video-info-label">Status</span>
                        <span className="video-info-value">{selectedVideo.status}</span>
                      </div>
                      <div className="video-info-item">
                        <span className="video-info-label">Total Labels</span>
                        <span className="video-info-value">{selectedVideo.labelCount}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="labels-right-section">
              {selectedVideo && (
                <>
                  <div className="review-mode-section">
                    <div className="review-mode-header">
                      <h3>Review & Annotation</h3>
                      <button 
                        className={`btn-toggle-review ${reviewMode ? 'active' : ''}`}
                        onClick={() => setReviewMode(!reviewMode)}
                      >
                        {reviewMode ? 'Exit Review' : 'Start Review'}
                      </button>
                    </div>
                    
                    {reviewMode && (
                      <div className="review-mode-controls">
                        <div className="review-instructions">
                          <p>{taskConfig.instructions}</p>
                          <p><strong>Review Mode:</strong> You can annotate new events, review existing labels, or adjust timestamps.</p>
                          <p><strong>Task Info:</strong> Base Model: {task.baseModel} | Human Annotation: {task.requireHumanAnnotation ? 'Required' : 'Optional'}</p>
                        </div>
                        
                        <div className="annotation-form">
                          <div className="capture-mode-toggle">
                            <label className="toggle-switch">
                              <input
                                type="checkbox"
                                checked={captureMode}
                                onChange={(e) => {
                                  setCaptureMode(e.target.checked)
                                  if (!e.target.checked) {
                                    setLastPlayTime(null)
                                  }
                                }}
                              />
                              <span className="toggle-slider"></span>
                            </label>
                            <span className="toggle-label">
                              Play/Pause Capture Mode
                              {captureMode && <span className="capture-hint"> (Press Play to start, Pause to end)</span>}
                            </span>
                          </div>
                          
                          <div className="time-controls">
                            <button 
                              className="btn-mark" 
                              onClick={handleMarkStart}
                              disabled={startTime !== null && endTime === null}
                            >
                              Mark Start
                            </button>
                            <button 
                              className="btn-mark" 
                              onClick={handleMarkEnd}
                              disabled={startTime === null}
                            >
                              Mark End
                            </button>
                          </div>
                          
                          {startTime !== null && (
                            <div className="time-edit-section">
                              <div className="time-display">
                                <div className="time-input-group">
                                  <label>Start Time (seconds)</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={startTime.toFixed(1)}
                                    onChange={(e) => setStartTime(parseFloat(e.target.value))}
                                  />
                                </div>
                                {endTime !== null && (
                                  <div className="time-input-group">
                                    <label>End Time (seconds)</label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={endTime.toFixed(1)}
                                      onChange={(e) => setEndTime(parseFloat(e.target.value))}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {startTime !== null && endTime !== null && (
                            <div className="event-selection">
                              <label htmlFor="eventType">Event Type *</label>
                              <input
                                type="text"
                                id="eventType"
                                value={selectedEventType}
                                onChange={(e) => setSelectedEventType(e.target.value)}
                                placeholder="Enter or select event type"
                                list="eventTypeOptions"
                              />
                              <datalist id="eventTypeOptions">
                                {eventTypes.map((type) => (
                                  <option key={type} value={type} />
                                ))}
                              </datalist>
                              
                              <div className="annotation-actions">
                                <button 
                                  className="btn-save-annotation"
                                  onClick={handleUpdateAnnotation}
                                  disabled={!selectedEventType}
                                >
                                  Save Annotation
                                </button>
                                <button 
                                  className="btn-cancel-annotation"
                                  onClick={handleCancelAnnotation}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="labels-section">
                    <div className="labels-header">
                      <h3>All Labels ({selectedVideo.labels.length + humanAnnotations.length})</h3>
                    </div>
                    <div className="labels-list">
                      {selectedVideo.labels.map((label) => {
                        const reviewBadge = getReviewBadge(label.id)
                        
                        return (
                          <div
                            key={label.id}
                            className={`label-item ${selectedLabel?.id === label.id ? 'active' : ''} ${reviewBadge ? 'reviewed' : ''}`}
                          >
                            <div 
                              className="label-info"
                              onClick={() => handleLabelClick(label)}
                            >
                              <span className="label-name">
                                {label.name}
                                {reviewBadge && (
                                  <span 
                                    className="badge review-badge" 
                                    style={{ backgroundColor: reviewBadge.color }}
                                  >
                                    {reviewBadge.text}
                                  </span>
                                )}
                              </span>
                              <span className="label-time">
                                {formatTime(label.timestamp)} - {formatTime(label.timestamp + label.duration)}
                              </span>
                            </div>
                            {reviewMode && !reviewBadge && (
                              <div className="quick-review-actions">
                                <button 
                                  className="btn-quick-review accept"
                                  onClick={() => handleQuickReview(label, 'accept')}
                                  title="Accept as True Positive"
                                >
                                  ✓
                                </button>
                                <button 
                                  className="btn-quick-review reject"
                                  onClick={() => handleQuickReview(label, 'reject')}
                                  title="Mark as False Positive"
                                >
                                  ✗
                                </button>
                                <button 
                                  className="btn-quick-review adjust"
                                  onClick={() => handleQuickReview(label, 'adjust')}
                                  title="Adjust Timestamps"
                                >
                                  ⟳
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                      
                      {humanAnnotations.map((annotation) => (
                        <div
                          key={annotation.id}
                          className="label-item human-annotation"
                          onClick={() => handleLabelClick(annotation)}
                        >
                          <div className="label-info">
                            <span className="label-name">
                              {annotation.name} <span className="badge">Human</span>
                            </span>
                            <span className="label-time">
                              {formatTime(annotation.timestamp)} - {formatTime(annotation.timestamp + annotation.duration)}
                            </span>
                          </div>
                          {reviewMode && (
                            <button 
                              className="btn-delete-annotation"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteAnnotation(annotation.id)
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GroundTruthTaskDetail
