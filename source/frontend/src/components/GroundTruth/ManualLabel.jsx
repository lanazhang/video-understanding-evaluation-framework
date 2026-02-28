import { useState, useRef, useEffect } from 'react'
import './ManualLabel.css'

function ManualLabel({ video, allResults, setAllResults, isMaximized, resetTrigger }) {
  const [startTime, setStartTime] = useState(null)
  const [endTime, setEndTime] = useState(null)
  const [label, setLabel] = useState('')
  const [editingIndex, setEditingIndex] = useState(null)
  const [videoDuration, setVideoDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const videoPlayerRef = useRef(null)
  const timelineRef = useRef(null)

  // Show all labels in the manual label list (from all sources) to allow editing
  const manualLabels = allResults
  
  // Debug: log to see what's in allResults
  useEffect(() => {
    console.log('allResults:', allResults)
    console.log('manualLabels:', manualLabels)
    console.log('sources:', allResults.map(r => r.source))
  }, [allResults])

  // Handle reset trigger
  useEffect(() => {
    if (resetTrigger) {
      setStartTime(null)
      setEndTime(null)
      setLabel('')
      setEditingIndex(null)
    }
  }, [resetTrigger])

  useEffect(() => {
    const video = videoPlayerRef.current
    if (!video) return

    const handleLoadedMetadata = () => {
      setVideoDuration(video.duration)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)

    if (video.readyState >= 1) {
      setVideoDuration(video.duration)
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
    }
  }, [])

  const handleVideoClick = () => {
    if (videoPlayerRef.current) {
      const currentTime = videoPlayerRef.current.currentTime
      
      if (startTime === null) {
        setStartTime(currentTime)
        setEndTime(null)
      } else if (endTime === null) {
        if (currentTime > startTime) {
          setEndTime(currentTime)
          videoPlayerRef.current.pause()
        } else {
          setStartTime(currentTime)
          setEndTime(null)
        }
      } else {
        setStartTime(currentTime)
        setEndTime(null)
      }
    }
  }

  const handleTimelineClick = (e) => {
    if (!timelineRef.current || !videoDuration) return
    
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    const clickedTime = percentage * videoDuration
    
    if (startTime === null) {
      setStartTime(clickedTime)
      setEndTime(null)
    } else if (endTime === null) {
      if (clickedTime > startTime) {
        setEndTime(clickedTime)
      } else {
        setStartTime(clickedTime)
        setEndTime(null)
      }
    } else {
      setStartTime(clickedTime)
      setEndTime(null)
    }
  }

  const handleStartTimeChange = (e) => {
    const value = parseFloat(e.target.value)
    if (!isNaN(value) && value >= 0 && value < videoDuration) {
      setStartTime(value)
      if (endTime !== null && value >= endTime) {
        setEndTime(null)
      }
    }
  }

  const handleEndTimeChange = (e) => {
    const value = parseFloat(e.target.value)
    if (!isNaN(value) && value >= 0 && value <= videoDuration) {
      if (startTime !== null && value > startTime) {
        setEndTime(value)
      }
    }
  }

  const handleAddLabel = () => {
    if (startTime === null || endTime === null) {
      alert('Please set both start and end times')
      return
    }

    if (!label.trim()) {
      alert('Please enter a label')
      return
    }

    const newLabel = {
      StartSec: typeof startTime === 'number' ? parseFloat(startTime.toFixed(2)) : startTime,
      EndSec: typeof endTime === 'number' ? parseFloat(endTime.toFixed(2)) : endTime,
      query: label.trim(),
      Distance: 0,
      source: editingIndex !== null ? manualLabels[editingIndex].source : 'manual'
    }

    if (editingIndex !== null) {
      const oldLabel = manualLabels[editingIndex]
      
      // Update in allResults array - find by matching the old label's exact properties
      const updatedAllResults = allResults.map(result => {
        if (result.StartSec === oldLabel.StartSec && 
            result.EndSec === oldLabel.EndSec && 
            result.query === oldLabel.query &&
            result.source === oldLabel.source) {
          return newLabel
        }
        return result
      })
      setAllResults(updatedAllResults)
      
      // Clear editing state
      setEditingIndex(null)
      setStartTime(null)
      setEndTime(null)
      setLabel('')
    } else {
      setAllResults([...allResults, newLabel])
      setStartTime(null)
      setEndTime(null)
      // Keep the label value for quick consecutive labeling
      
      // Start playing the video after adding label
      if (videoPlayerRef.current) {
        videoPlayerRef.current.play().catch(err => {
          console.log('Auto-play prevented:', err)
        })
      }
    }
  }

  const handleEditLabel = (index) => {
    const labelToEdit = manualLabels[index]
    setStartTime(labelToEdit.StartSec)
    setEndTime(labelToEdit.EndSec)
    setLabel(labelToEdit.query)
    setEditingIndex(index)
  }

  const handleRemoveLabel = (index) => {
    const labelToRemove = manualLabels[index]
    
    const updatedAllResults = allResults.filter(result => 
      !(result.StartSec === labelToRemove.StartSec && 
        result.EndSec === labelToRemove.EndSec && 
        result.query === labelToRemove.query &&
        result.source === labelToRemove.source)
    )
    setAllResults(updatedAllResults)
    
    if (editingIndex === index) {
      setEditingIndex(null)
      setStartTime(null)
      setEndTime(null)
      setLabel('')
    }
  }

  const handleReset = () => {
    setStartTime(null)
    setEndTime(null)
    setEditingIndex(null)
  }

  const handleSetCurrentAsStart = () => {
    if (videoPlayerRef.current) {
      setStartTime(videoPlayerRef.current.currentTime)
      if (endTime !== null && videoPlayerRef.current.currentTime >= endTime) {
        setEndTime(null)
      }
    }
  }

  const handleSetCurrentAsEnd = () => {
    if (videoPlayerRef.current && startTime !== null) {
      const current = videoPlayerRef.current.currentTime
      if (current > startTime) {
        setEndTime(current)
        videoPlayerRef.current.pause()
      }
    }
  }

  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '0s'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    if (mins > 0) {
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
    }
    return `${secs}s`
  }

  const handleSeekToLabel = (startSec, endSec, labelText, index) => {
    // Load the label data into the inputs
    setStartTime(parseFloat(startSec))
    setEndTime(parseFloat(endSec))
    setLabel(labelText)
    setEditingIndex(index)
    
    // Play the video segment
    if (videoPlayerRef.current) {
      const videoEl = videoPlayerRef.current
      videoEl.currentTime = startSec
      videoEl.play()
      
      const handleTimeUpdate = () => {
        if (videoEl.currentTime >= endSec) {
          videoEl.pause()
          videoEl.removeEventListener('timeupdate', handleTimeUpdate)
        }
      }
      
      videoEl.addEventListener('timeupdate', handleTimeUpdate)
      
      const handlePause = () => {
        videoEl.removeEventListener('timeupdate', handleTimeUpdate)
        videoEl.removeEventListener('pause', handlePause)
      }
      
      videoEl.addEventListener('pause', handlePause, { once: true })
    }
  }

  const handleGoBackFromCurrent = () => {
    if (videoPlayerRef.current) {
      const newTime = Math.max(0, videoPlayerRef.current.currentTime - 1)
      videoPlayerRef.current.currentTime = newTime
    }
  }

  const handleGoForwardFromCurrent = () => {
    if (videoPlayerRef.current) {
      const newTime = Math.min(videoDuration, videoPlayerRef.current.currentTime + 1)
      videoPlayerRef.current.currentTime = newTime
    }
  }

  const getTimelinePosition = (time) => {
    if (!videoDuration) return 0
    return (time / videoDuration) * 100
  }

  return (
    <>
      <div className={`manual-label-container ${isMaximized ? 'maximized' : ''}`}>
        <div className="manual-label-main">
        <div className="video-section-large">
          <div className="video-wrapper-large">
            <video 
              ref={videoPlayerRef}
              src={video.video_url || `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`}
              controls
              muted
              className="manual-label-video-large"
              onClick={handleVideoClick}
            >
              Your browser does not support the video tag.
            </video>
            {!isMaximized && (
              <div className="video-click-hint">
                {startTime === null ? 'Click video or timeline to set START time' : 
                 endTime === null ? 'Click video or timeline to set END time' : 
                 'Click to reset and start new segment'}
              </div>
            )}
          </div>

          {/* Visual Timeline */}
          <div className="timeline-container">
            <div 
              ref={timelineRef}
              className="timeline-track" 
              onClick={handleTimelineClick}
            >
              {/* Current playhead */}
              <div 
                className="timeline-playhead" 
                style={{ left: `${getTimelinePosition(currentTime)}%` }}
              />
              
              {/* Start marker */}
              {startTime !== null && (
                <div 
                  className="timeline-marker timeline-marker-start" 
                  style={{ left: `${getTimelinePosition(startTime)}%` }}
                  title={`Start: ${formatTime(startTime)}`}
                >
                  <div className="timeline-marker-label">S</div>
                </div>
              )}
              
              {/* End marker */}
              {endTime !== null && (
                <div 
                  className="timeline-marker timeline-marker-end" 
                  style={{ left: `${getTimelinePosition(endTime)}%` }}
                  title={`End: ${formatTime(endTime)}`}
                >
                  <div className="timeline-marker-label">E</div>
                </div>
              )}
              
              {/* Selected range */}
              {startTime !== null && endTime !== null && (
                <div 
                  className="timeline-range" 
                  style={{ 
                    left: `${getTimelinePosition(startTime)}%`,
                    width: `${getTimelinePosition(endTime) - getTimelinePosition(startTime)}%`
                  }}
                />
              )}
              
              {/* Existing labels on timeline */}
              {manualLabels.map((labelItem, index) => (
                <div
                  key={index}
                  className={`timeline-existing-label ${editingIndex === index ? 'editing' : ''}`}
                  style={{
                    left: `${getTimelinePosition(labelItem.StartSec)}%`,
                    width: `${getTimelinePosition(labelItem.EndSec) - getTimelinePosition(labelItem.StartSec)}%`
                  }}
                  title={labelItem.query}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleEditLabel(index)
                  }}
                />
              ))}
            </div>
            <div className="timeline-time-labels">
              <span>0:00</span>
              <span>{formatTime(videoDuration)}</span>
            </div>
          </div>

          {/* Time Controls */}
          <div className="time-controls-section">
            <div className="time-control-group">
              <label>Start Time</label>
              <div className="time-input-row">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={videoDuration}
                  value={typeof startTime === 'number' ? startTime.toFixed(2) : ''}
                  onChange={handleStartTimeChange}
                  placeholder="0.00"
                  className="time-input"
                />
                <span className="time-display">{formatTime(startTime)}</span>
                <button 
                  className="btn-set-current"
                  onClick={handleSetCurrentAsStart}
                  title="Set current video time as start"
                >
                  Set Current
                </button>
              </div>
            </div>

            <div className="time-control-group">
              <label>End Time</label>
              <div className="time-input-row">
                <input
                  type="number"
                  step="0.01"
                  min={startTime || 0}
                  max={videoDuration}
                  value={typeof endTime === 'number' ? endTime.toFixed(2) : ''}
                  onChange={handleEndTimeChange}
                  placeholder="0.00"
                  className="time-input"
                  disabled={startTime === null}
                />
                <span className="time-display">{formatTime(endTime)}</span>
                <button 
                  className="btn-set-current"
                  onClick={handleSetCurrentAsEnd}
                  disabled={startTime === null}
                  title="Set current video time as end"
                >
                  Set Current
                </button>
              </div>
            </div>

            <button 
              className="btn-go-back-time"
              onClick={handleGoBackFromCurrent}
              title="Go back 1 second"
            >
              -1s
            </button>

            <button 
              className="btn-go-forward-time"
              onClick={handleGoForwardFromCurrent}
              title="Go forward 1 second"
            >
              +1s
            </button>

            <div className="time-control-group">
              <label>Duration</label>
              <div className="duration-display">
                {startTime !== null && endTime !== null 
                  ? formatDuration(endTime - startTime)
                  : '--'}
              </div>
            </div>
          </div>

          {/* Label Input */}
          <div className="label-input-row-horizontal">
            <input
              type="text"
              className="label-input-large"
              placeholder="Enter label for this segment..."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddLabel()}
            />
            <div className="label-actions">
              <button 
                className="btn-add-label-large"
                onClick={handleAddLabel}
                disabled={startTime === null || endTime === null || !label.trim()}
              >
                {editingIndex !== null ? 'Update' : 'Add'}
              </button>
              <button 
                className="btn-reset-times"
                onClick={handleReset}
                disabled={startTime === null && endTime === null}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Labels Sidebar */}
      <div className="labels-sidebar">
        <div className="sidebar-header">
          <h3>Time Range Labels</h3>
          <span className="label-count">{manualLabels.length}</span>
        </div>
        
        {manualLabels.length === 0 ? (
          <div className="no-labels-message">
            No labels created yet. Click on the video or timeline to start.
          </div>
        ) : (
          <div className="manual-labels-list">
            {[...manualLabels]
              .sort((a, b) => b.StartSec - a.StartSec)
              .map((labelItem, displayIndex) => {
                const originalIndex = manualLabels.findIndex(l => l === labelItem)
                const sourceLabel = labelItem.source === 'manual' ? 'Manual' : 
                                   labelItem.source === 'embedding' ? 'Embedding' : 
                                   labelItem.source === 'video-understanding' ? 'Video' : 'Other'
                return (
              <div 
                key={originalIndex} 
                className={`manual-label-card ${editingIndex === originalIndex ? 'editing' : ''}`}
                onClick={() => handleSeekToLabel(labelItem.StartSec, labelItem.EndSec, labelItem.query, originalIndex)}
              >
                <span className="label-number">#{originalIndex + 1}</span>
                <span className={`label-source-badge source-${labelItem.source}`}>{sourceLabel}</span>
                <div className="label-text">{labelItem.query}</div>
                <div className="label-time-compact">
                  {formatTime(labelItem.StartSec)} - {formatTime(labelItem.EndSec)}
                </div>
                <span className="label-duration">{formatDuration(labelItem.EndSec - labelItem.StartSec)}</span>
                <div className="label-card-actions">
                  <button 
                    className="btn-remove-label"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveLabel(originalIndex)
                    }}
                    title="Remove label"
                  >
                    ✕
                  </button>
                </div>
              </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
    </>
  )
}

export default ManualLabel
