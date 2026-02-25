import { useState, useRef } from 'react'
import './ManualLabel.css'

function ManualLabel({ video, allResults, setAllResults }) {
  const [startTime, setStartTime] = useState(null)
  const [endTime, setEndTime] = useState(null)
  const [label, setLabel] = useState('')
  const [manualLabels, setManualLabels] = useState([])
  const videoPlayerRef = useRef(null)

  const handleOverlayClick = (e) => {
    // Capture clicks anywhere on the overlay
    e.preventDefault()
    e.stopPropagation()
    
    if (videoPlayerRef.current) {
      const currentTime = videoPlayerRef.current.currentTime
      
      if (startTime === null) {
        // First click - set start time
        setStartTime(currentTime)
        setEndTime(null)
      } else if (endTime === null) {
        // Second click - set end time and pause video
        if (currentTime > startTime) {
          setEndTime(currentTime)
          videoPlayerRef.current.pause()
        } else {
          // If clicked before start time, reset and use as new start
          setStartTime(currentTime)
          setEndTime(null)
        }
      } else {
        // Both times set, reset and start new
        setStartTime(currentTime)
        setEndTime(null)
      }
    }
  }

  const handleAddLabel = () => {
    if (startTime === null || endTime === null) {
      alert('Please click on the video twice to set start and end times')
      return
    }

    if (!label.trim()) {
      alert('Please enter a label')
      return
    }

    const newLabel = {
      StartSec: parseFloat(startTime.toFixed(2)),
      EndSec: parseFloat(endTime.toFixed(2)),
      query: label.trim(),
      Distance: 0, // Manual labels have no distance score
      source: 'manual' // Mark as manual source
    }

    // Add to manual labels list
    const updatedManualLabels = [...manualLabels, newLabel]
    setManualLabels(updatedManualLabels)
    
    // Add to all results for the review step
    setAllResults([...allResults, newLabel])

    // Reset form
    setStartTime(null)
    setEndTime(null)
    setLabel('')
  }

  const handleRemoveLabel = (index) => {
    const labelToRemove = manualLabels[index]
    
    // Remove from manual labels
    const updatedManualLabels = manualLabels.filter((_, i) => i !== index)
    setManualLabels(updatedManualLabels)
    
    // Remove from all results
    const updatedAllResults = allResults.filter(result => 
      !(result.StartSec === labelToRemove.StartSec && 
        result.EndSec === labelToRemove.EndSec && 
        result.query === labelToRemove.query &&
        result.source === 'manual')
    )
    setAllResults(updatedAllResults)
  }

  const handleReset = () => {
    setStartTime(null)
    setEndTime(null)
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
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }

  const handlePlaySegment = (startSec, endSec) => {
    if (videoPlayerRef.current) {
      const videoEl = videoPlayerRef.current
      videoEl.currentTime = startSec
      videoEl.play()
      
      const stopAtEndListener = () => {
        if (videoEl.currentTime >= endSec) {
          videoEl.pause()
          videoEl.removeEventListener('timeupdate', stopAtEndListener)
        }
      }
      
      videoEl.addEventListener('timeupdate', stopAtEndListener)
    }
  }

  return (
    <div className="manual-label-content">
      {/* Left: Video and Controls */}
      <div className="manual-label-left">
        <h3>Create Manual Labels</h3>
        <p className="instruction-text">Click on the video to capture start and end times. Labels will be added to the shared collection.</p>
        
        <div className="video-container">
          <video 
            ref={videoPlayerRef}
            src={video.video_url || `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`}
            controls
            muted
            className="manual-label-video"
          >
            Your browser does not support the video tag.
          </video>
          <div className="video-overlay" onClick={handleOverlayClick}>
            <span className="overlay-hint">Click to capture time</span>
          </div>
        </div>

        <div className="time-capture-section">
          <div className="time-display-row">
            <div className="time-display-item">
              <label>Start Time</label>
              <div className={`time-value ${startTime !== null ? 'captured' : ''}`}>
                {formatTime(startTime)}
              </div>
            </div>
            <div className="time-display-item">
              <label>End Time</label>
              <div className={`time-value ${endTime !== null ? 'captured' : ''}`}>
                {formatTime(endTime)}
              </div>
            </div>
            <div className="time-display-item">
              <label>Duration</label>
              <div className="time-value">
                {startTime !== null && endTime !== null 
                  ? formatDuration(endTime - startTime)
                  : '--'}
              </div>
            </div>
          </div>
          
          <button 
            className="btn-reset-times"
            onClick={handleReset}
            disabled={startTime === null && endTime === null}
          >
            Reset Times
          </button>
        </div>

        <div className="label-input-section">
          <label>Label</label>
          <input
            type="text"
            className="label-input"
            placeholder="Enter label for this segment..."
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddLabel()}
          />
          <button 
            className="btn-add-label"
            onClick={handleAddLabel}
            disabled={startTime === null || endTime === null || !label.trim()}
          >
            Add Label
          </button>
        </div>
      </div>

      {/* Right: Labels List */}
      <div className="manual-label-right">
        <h3>Manual Labels ({manualLabels.length})</h3>
        
        {manualLabels.length === 0 ? (
          <div className="no-labels-message">
            No manual labels created yet. Click on the video to start.
          </div>
        ) : (
          <div className="manual-labels-list">
            {manualLabels.map((labelItem, index) => (
              <div key={index} className="manual-label-card">
                <div className="label-card-header">
                  <span className="label-number">#{index + 1}</span>
                  <button 
                    className="btn-play-segment"
                    onClick={() => handlePlaySegment(labelItem.StartSec, labelItem.EndSec)}
                    title="Play segment"
                  >
                    ▶
                  </button>
                  <button 
                    className="btn-remove-label"
                    onClick={() => handleRemoveLabel(index)}
                    title="Remove label"
                  >
                    ✕
                  </button>
                </div>
                <div className="label-card-body">
                  <div className="label-text">{labelItem.query}</div>
                  <div className="label-time-info">
                    <span>{formatTime(labelItem.StartSec)} - {formatTime(labelItem.EndSec)}</span>
                    <span className="label-duration">{formatDuration(labelItem.EndSec - labelItem.StartSec)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ManualLabel
