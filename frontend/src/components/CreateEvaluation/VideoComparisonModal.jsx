import { useState, useRef, useEffect } from 'react'
import './VideoComparisonModal.css'

function VideoComparisonModal({ video, groundTruthLabels, evaluationLabels, matchingDetails, onClose }) {
  const videoRef = useRef(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hoveredSegment, setHoveredSegment] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [selectedRange, setSelectedRange] = useState(null)

  // Create a map of evaluation label indices to their status
  const evalStatusMap = {}
  if (matchingDetails && matchingDetails.predMatches) {
    matchingDetails.predMatches.forEach(match => {
      evalStatusMap[match.predIndex] = match.status
    })
  }

  // Create a map of ground truth label indices to their status
  const gtStatusMap = {}
  if (matchingDetails && matchingDetails.gtMatches) {
    matchingDetails.gtMatches.forEach(match => {
      gtStatusMap[match.gtIndex] = match.status
    })
  }

  useEffect(() => {
    const videoElement = videoRef.current
    if (!videoElement) return

    const handleTimeUpdate = () => {
      setCurrentTime(videoElement.currentTime)
    }

    const handleLoadedMetadata = () => {
      setDuration(videoElement.duration)
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    videoElement.addEventListener('timeupdate', handleTimeUpdate)
    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata)
    videoElement.addEventListener('play', handlePlay)
    videoElement.addEventListener('pause', handlePause)

    return () => {
      videoElement.removeEventListener('timeupdate', handleTimeUpdate)
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata)
      videoElement.removeEventListener('play', handlePlay)
      videoElement.removeEventListener('pause', handlePause)
    }
  }, [])

  const handleTimelineClick = (e, timelineRef) => {
    const rect = timelineRef.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    const newTime = percentage * duration
    
    if (videoRef.current) {
      videoRef.current.currentTime = newTime
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleSegmentHover = (segment, e) => {
    setHoveredSegment(segment)
    setTooltipPosition({ x: e.clientX, y: e.clientY })
  }

  const handleSegmentLeave = () => {
    setHoveredSegment(null)
  }

  const handleSegmentClick = (startTime, endTime, label, type, status, e) => {
    e.stopPropagation()
    
    // Set selected range info
    setSelectedRange({
      type,
      label,
      startTime,
      endTime,
      status
    })
    
    if (videoRef.current) {
      videoRef.current.currentTime = startTime
      videoRef.current.play()
      
      // Set up a listener to pause at end time
      const handleTimeUpdate = () => {
        if (videoRef.current && videoRef.current.currentTime >= endTime) {
          videoRef.current.pause()
          videoRef.current.removeEventListener('timeupdate', handleTimeUpdate)
        }
      }
      
      videoRef.current.addEventListener('timeupdate', handleTimeUpdate)
    }
  }

  const gtTimelineRef = useRef(null)
  const evalTimelineRef = useRef(null)

  return (
    <div className="video-comparison-modal-overlay" onClick={onClose}>
      <div className="video-comparison-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="video-comparison-modal-header">
          <h2>{video.Name}</h2>
          <button className="btn-close-modal" onClick={onClose}>
            ✕
          </button>
        </div>
        
        <div className="video-comparison-modal-body">
          <div className="video-player-section">
            {video.video_url ? (
              <video 
                ref={videoRef}
                controls 
                muted
                className="video-player"
                src={video.video_url}
              >
                Your browser does not support the video tag.
              </video>
            ) : (
              <div className="no-video-message">
                Video not available
              </div>
            )}
          </div>

          <div className="timelines-section">
            <div className="timeline-row">
              <div className="timeline-label">Ground Truth</div>
              <div 
                className="timeline-track"
                ref={gtTimelineRef}
                onClick={(e) => handleTimelineClick(e, gtTimelineRef.current)}
              >
                {groundTruthLabels.map((label, idx) => {
                  const startPercent = (label.StartTs / duration) * 100
                  const widthPercent = ((label.EndTs - label.StartTs) / duration) * 100
                  const status = gtStatusMap[idx] || null
                  return (
                    <div
                      key={idx}
                      className={`timeline-segment gt-segment ${status ? `status-${status.toLowerCase()}` : ''}`}
                      style={{
                        left: `${startPercent}%`,
                        width: `${widthPercent}%`
                      }}
                      onClick={(e) => handleSegmentClick(label.StartTs, label.EndTs, label.Label || 'N/A', 'Ground Truth', status, e)}
                      onMouseEnter={(e) => handleSegmentHover({
                        type: 'Ground Truth',
                        label: label.Label || 'N/A',
                        start: label.StartTs,
                        end: label.EndTs,
                        status
                      }, e)}
                      onMouseMove={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
                      onMouseLeave={handleSegmentLeave}
                    />
                  )
                })}
              </div>
            </div>

            <div className="timeline-row">
              <div className="timeline-label">Evaluation Results</div>
              <div 
                className="timeline-track"
                ref={evalTimelineRef}
                onClick={(e) => handleTimelineClick(e, evalTimelineRef.current)}
              >
                {evaluationLabels.map((label, idx) => {
                  const startPercent = (label.StartTs / duration) * 100
                  const widthPercent = ((label.EndTs - label.StartTs) / duration) * 100
                  const status = evalStatusMap[idx] || null
                  return (
                    <div
                      key={idx}
                      className={`timeline-segment eval-segment ${status ? `status-${status.toLowerCase()}` : ''}`}
                      style={{
                        left: `${startPercent}%`,
                        width: `${widthPercent}%`
                      }}
                      onClick={(e) => handleSegmentClick(label.StartTs, label.EndTs, label.Label || 'Search Result', 'Evaluation Result', status, e)}
                      onMouseEnter={(e) => handleSegmentHover({
                        type: 'Evaluation Result',
                        label: label.Label || 'Search Result',
                        start: label.StartTs,
                        end: label.EndTs,
                        status
                      }, e)}
                      onMouseMove={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
                      onMouseLeave={handleSegmentLeave}
                    />
                  )
                })}
              </div>
            </div>
            
            <div className="timeline-time-display">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          {selectedRange && (
            <div className="selected-range-info">
              <div className="range-info-header">
                <span className={`range-type-badge ${selectedRange.type === 'Ground Truth' ? 'gt-badge' : 'eval-badge'}`}>
                  {selectedRange.type}
                </span>
                {selectedRange.status && (
                  <span className={`status-badge ${selectedRange.status.toLowerCase()}`}>
                    {selectedRange.status}
                  </span>
                )}
                <button 
                  className="btn-clear-selection"
                  onClick={() => setSelectedRange(null)}
                  title="Clear selection"
                >
                  ✕
                </button>
              </div>
              <div className="range-info-details">
                <div className="range-info-item">
                  <span className="range-info-label">Label:</span>
                  <span className="range-info-value">{selectedRange.label}</span>
                </div>
                <div className="range-info-item">
                  <span className="range-info-label">Time Range:</span>
                  <span className="range-info-value">
                    {selectedRange.startTime.toFixed(2)}s - {selectedRange.endTime.toFixed(2)}s
                  </span>
                </div>
                <div className="range-info-item">
                  <span className="range-info-label">Duration:</span>
                  <span className="range-info-value">
                    {(selectedRange.endTime - selectedRange.startTime).toFixed(2)}s
                  </span>
                </div>
              </div>
            </div>
          )}

          {hoveredSegment && (
            <div 
              className="segment-tooltip"
              style={{
                left: `${tooltipPosition.x + 10}px`,
                top: `${tooltipPosition.y + 10}px`
              }}
            >
              <div className="tooltip-type">
                {hoveredSegment.type}
                {hoveredSegment.status && (
                  <span className={`status-badge ${hoveredSegment.status.toLowerCase()}`}>
                    {hoveredSegment.status}
                  </span>
                )}
              </div>
              <div className="tooltip-label">{hoveredSegment.label}</div>
              <div className="tooltip-time">
                {hoveredSegment.start.toFixed(2)}s - {hoveredSegment.end.toFixed(2)}s
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default VideoComparisonModal
