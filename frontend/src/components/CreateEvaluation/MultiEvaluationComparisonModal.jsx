import { useState, useRef, useEffect } from 'react'
import './MultiEvaluationComparisonModal.css'

function MultiEvaluationComparisonModal({ video, groundTruthLabels, evaluationTasks, onClose }) {
  const videoRef = useRef(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hoveredSegment, setHoveredSegment] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [selectedRange, setSelectedRange] = useState(null)

  const timelineRefs = useRef({})

  // Score of an evaluation result is its distance to the query (cosine, lower = closer); rank 1 is the closest in its evaluation
  const scoreOf = (label) => (label && label.Score !== null && label.Score !== undefined && Number.isFinite(Number(label.Score)) ? Number(label.Score) : null)
  const formatScore = (v) => v.toFixed(3)
  const rankResults = (labels) => labels
    .map((label, idx) => ({ label, idx, score: scoreOf(label) }))
    .filter(r => r.score !== null)
    .sort((a, b) => (a.score - b.score) || (a.idx - b.idx))
  const statusOf = (task, idx) => task.matchingDetails?.predMatches?.find(m => m.predIndex === idx)?.status || null

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

  const handleSegmentClick = (startTime, endTime, label, type, status, taskName, e, score = null, rank = null, rankedOf = null) => {
    e.stopPropagation()
    
    setSelectedRange({
      type,
      label,
      startTime,
      endTime,
      status,
      taskName,
      score,
      rank,
      rankedOf
    })
    
    if (videoRef.current) {
      videoRef.current.currentTime = startTime
      videoRef.current.play()
      
      const handleTimeUpdate = () => {
        if (videoRef.current && videoRef.current.currentTime >= endTime) {
          videoRef.current.pause()
          videoRef.current.removeEventListener('timeupdate', handleTimeUpdate)
        }
      }
      
      videoRef.current.addEventListener('timeupdate', handleTimeUpdate)
    }
  }

  return (
    <div className="multi-eval-comparison-modal-overlay" onClick={onClose}>
      <div className="multi-eval-comparison-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="multi-eval-comparison-modal-header">
          <h2>{video.Name}</h2>
          <button className="btn-close-modal" onClick={onClose}>
            ✕
          </button>
        </div>
        
        <div className="multi-eval-comparison-modal-body">
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
            {/* Ground Truth Timeline */}
            <div className="timeline-row">
              <div className="timeline-label">Ground Truth</div>
              <div 
                className="timeline-track"
                ref={(el) => timelineRefs.current['gt'] = el}
                onClick={(e) => handleTimelineClick(e, timelineRefs.current['gt'])}
              >
                {groundTruthLabels.map((label, idx) => {
                  const startPercent = (label.StartTs / duration) * 100
                  const widthPercent = ((label.EndTs - label.StartTs) / duration) * 100
                  return (
                    <div
                      key={idx}
                      className="timeline-segment gt-segment"
                      style={{
                        left: `${startPercent}%`,
                        width: `${widthPercent}%`
                      }}
                      onClick={(e) => handleSegmentClick(label.StartTs, label.EndTs, label.Label || 'N/A', 'Ground Truth', null, null, e)}
                      onMouseEnter={(e) => handleSegmentHover({
                        type: 'Ground Truth',
                        label: label.Label || 'N/A',
                        start: label.StartTs,
                        end: label.EndTs,
                        status: null,
                        taskName: null
                      }, e)}
                      onMouseMove={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
                      onMouseLeave={handleSegmentLeave}
                    />
                  )
                })}
              </div>
            </div>

            {/* Evaluation Result Timelines */}
            {evaluationTasks.map((task, taskIdx) => {
              const evalLabels = task.Labels || []
              const ranked = rankResults(evalLabels)
              const rankOf = {}
              ranked.forEach((r, i) => { rankOf[r.idx] = i + 1 })
              
              return (
                <div key={taskIdx} className="timeline-row">
                  <div className="timeline-label eval-timeline-label">
                    <span className="eval-label-name">{task.taskName || task.Name}</span>
                    <span className="eval-label-model">{task.analyzeTask?.ModelId || 'N/A'}</span>
                  </div>
                  <div 
                    className="timeline-track"
                    ref={(el) => timelineRefs.current[`eval-${taskIdx}`] = el}
                    onClick={(e) => handleTimelineClick(e, timelineRefs.current[`eval-${taskIdx}`])}
                  >
                    {evalLabels.map((label, idx) => {
                      const startPercent = (label.StartTs / duration) * 100
                      const widthPercent = ((label.EndTs - label.StartTs) / duration) * 100
                      
                      const status = statusOf(task, idx)
                      
                      return (
                        <div
                          key={idx}
                          className={`timeline-segment eval-segment ${status ? `status-${status.toLowerCase()}` : ''}`}
                          style={{
                            left: `${startPercent}%`,
                            width: `${widthPercent}%`
                          }}
                          onClick={(e) => handleSegmentClick(label.StartTs, label.EndTs, label.Label || 'Search Result', 'Evaluation Result', status, task.taskName || task.Name, e, scoreOf(label), rankOf[idx], ranked.length)}
                          onMouseEnter={(e) => handleSegmentHover({
                            type: 'Evaluation Result',
                            label: label.Label || 'Search Result',
                            start: label.StartTs,
                            end: label.EndTs,
                            status,
                            taskName: task.taskName || task.Name,
                            score: scoreOf(label),
                            rank: rankOf[idx]
                          }, e)}
                          onMouseMove={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
                          onMouseLeave={handleSegmentLeave}
                        >
                          {rankOf[idx] && <span className="segment-score">#{rankOf[idx]}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            
            <div className="timeline-time-display">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          {evaluationTasks.some(t => rankResults(t.Labels || []).length > 0) && (
            <div className="results-by-score">
              <div className="results-by-score-title">
                Results by score <span className="results-by-score-hint">distance to the query, lower is closer; click to play</span>
              </div>
              {evaluationTasks.map((task, taskIdx) => {
                const ranked = rankResults(task.Labels || [])
                if (ranked.length === 0) return null
                const name = task.taskName || task.Name
                return (
                  <div key={taskIdx} className="results-by-score-task">
                    <div className="results-by-score-task-name">{name}</div>
                    <div className="results-by-score-list">
                      {ranked.map((r, i) => {
                        const status = statusOf(task, r.idx)
                        return (
                          <button
                            key={r.idx}
                            type="button"
                            className={`result-score-item ${status ? `status-${status.toLowerCase()}` : ''}`}
                            onClick={(e) => handleSegmentClick(r.label.StartTs, r.label.EndTs, r.label.Label || 'Search Result', 'Evaluation Result', status, name, e, r.score, i + 1, ranked.length)}
                          >
                            <span className="result-score-rank">#{i + 1}</span>
                            <span className="result-score-time">{formatTime(r.label.StartTs)} - {formatTime(r.label.EndTs)}</span>
                            <span className="result-score-value">{formatScore(r.score)}</span>
                            {status && <span className={`status-badge ${status.toLowerCase()}`}>{status}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {selectedRange && (
            <div className="selected-range-info">
              <div className="range-info-header">
                <span className={`range-type-badge ${selectedRange.type === 'Ground Truth' ? 'gt-badge' : 'eval-badge'}`}>
                  {selectedRange.type}
                </span>
                {selectedRange.taskName && (
                  <span className="range-task-name">{selectedRange.taskName}</span>
                )}
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
                {selectedRange.score !== null && selectedRange.score !== undefined && (
                  <div className="range-info-item">
                    <span className="range-info-label">Score:</span>
                    <span className="range-info-value">
                      {formatScore(selectedRange.score)} distance (lower is closer){selectedRange.rank ? `, rank ${selectedRange.rank} of ${selectedRange.rankedOf}` : ''}
                    </span>
                  </div>
                )}
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
              {hoveredSegment.taskName && (
                <div className="tooltip-task-name">{hoveredSegment.taskName}</div>
              )}
              <div className="tooltip-label">{hoveredSegment.label}</div>
              <div className="tooltip-time">
                {hoveredSegment.start.toFixed(2)}s - {hoveredSegment.end.toFixed(2)}s
              </div>
              {hoveredSegment.score !== null && hoveredSegment.score !== undefined && (
                <div className="tooltip-time">
                  Score {formatScore(hoveredSegment.score)} (distance){hoveredSegment.rank ? `, rank ${hoveredSegment.rank}` : ''}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MultiEvaluationComparisonModal
