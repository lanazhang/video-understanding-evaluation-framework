import { useState, useRef } from 'react'
import './EvaluationTaskDetail.css'
import videosData from '../static/videos.json'

function EvaluationTaskDetail({ task, onBack }) {
  const [selectedLabel, setSelectedLabel] = useState(null)
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0)
  const [labelVerifications, setLabelVerifications] = useState({})
  const videoRef = useRef(null)

  // Get video data
  const video = videosData.find(v => v.id === task.videoId)
  
  // Ground truth data is now embedded in the task object
  const groundTruthLabels = task.labels || []
  const predictedLabels = task.results?.predictedLabels || []

  const handleLabelClick = (label) => {
    setSelectedLabel(label)
    if (videoRef.current) {
      videoRef.current.currentTime = label.timestamp
      videoRef.current.play()
    }
  }

  const handleVerifyLabel = (labelId, verification) => {
    setLabelVerifications({
      ...labelVerifications,
      [labelId]: verification
    })
    // TODO: Save verification to API
    console.log(`Label ${labelId} verified as ${verification}`)
  }

  const handleNextLabel = () => {
    if (currentReviewIndex < predictedLabels.length - 1) {
      const nextIndex = currentReviewIndex + 1
      setCurrentReviewIndex(nextIndex)
      handleLabelClick(predictedLabels[nextIndex])
    }
  }

  const handlePreviousLabel = () => {
    if (currentReviewIndex > 0) {
      const prevIndex = currentReviewIndex - 1
      setCurrentReviewIndex(prevIndex)
      handleLabelClick(predictedLabels[prevIndex])
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getEvaluationBadge = (evaluation) => {
    const badges = {
      'true-positive': { text: 'TP', color: '#4caf50', label: 'True Positive' },
      'false-positive': { text: 'FP', color: '#f44336', label: 'False Positive' },
      'false-negative': { text: 'FN', color: '#ff9800', label: 'False Negative' },
    }
    return badges[evaluation]
  }

  const getVerificationBadge = (verification) => {
    const badges = {
      'correct': { text: '✓ Correct', color: '#4caf50' },
      'incorrect': { text: '✗ Incorrect', color: '#f44336' },
      'uncertain': { text: '? Uncertain', color: '#ff9800' },
    }
    return badges[verification]
  }

  if (!video) {
    return (
      <div className="task-detail">
        <div className="task-detail-header">
          <button className="btn-back" onClick={onBack}>← Back</button>
          <h1>Error: Video not found</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="task-detail evaluation-detail">
      <div className="task-detail-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <h1>{task.taskName}</h1>
        <span className={`status-badge ${task.status}`}>{task.status}</span>
      </div>

      <div className="evaluation-info-section">
        <div className="info-card">
          <h3>Task Information</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Video:</span>
              <span className="info-value">{video.name}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Ground Truth:</span>
              <span className="info-value">{task.taskName || 'N/A'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Model:</span>
              <span className="info-value">{task.model}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Created:</span>
              <span className="info-value">{task.createdDate}</span>
            </div>
          </div>
        </div>

        {task.results && (
          <div className="info-card metrics-card">
            <h3>Evaluation Metrics</h3>
            <div className="metrics-grid">
              <div className="metric-item">
                <span className="metric-label">Precision</span>
                <span className="metric-value">{(task.results.precision * 100).toFixed(1)}%</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Recall</span>
                <span className="metric-value">{(task.results.recall * 100).toFixed(1)}%</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">F1 Score</span>
                <span className="metric-value">{(task.results.f1Score * 100).toFixed(1)}%</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">True Positives</span>
                <span className="metric-value">{task.results.truePositives}</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">False Positives</span>
                <span className="metric-value">{task.results.falsePositives}</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">False Negatives</span>
                <span className="metric-value">{task.results.falseNegatives}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {task.status === 'pending' || task.status === 'in-progress' ? (
        <div className="processing-message">
          <p>Task is being processed. Results will be available once processing is complete.</p>
        </div>
      ) : (
        <div className="evaluation-content">
          <div className="video-section">
            <div className="video-player">
              <video
                ref={videoRef}
                src={video.url}
                controls
                width="100%"
                muted
              >
                Your browser does not support the video tag.
              </video>
            </div>

            <div className="review-navigation">
              <h3>Review Labels ({currentReviewIndex + 1} of {predictedLabels.length})</h3>
              <div className="nav-buttons">
                <button 
                  className="btn-nav"
                  onClick={handlePreviousLabel}
                  disabled={currentReviewIndex === 0}
                >
                  ← Previous
                </button>
                <button 
                  className="btn-nav"
                  onClick={handleNextLabel}
                  disabled={currentReviewIndex === predictedLabels.length - 1}
                >
                  Next →
                </button>
              </div>
            </div>

            {predictedLabels[currentReviewIndex] && (
              <div className="current-label-review">
                <h3>Current Label Review</h3>
                <div className="label-review-card">
                  <div className="label-review-info">
                    <div className="label-review-header">
                      <span className="label-name">{predictedLabels[currentReviewIndex].name}</span>
                      {(() => {
                        const badge = getEvaluationBadge(predictedLabels[currentReviewIndex].evaluation)
                        return badge && (
                          <span 
                            className="evaluation-badge"
                            style={{ backgroundColor: badge.color }}
                            title={badge.label}
                          >
                            {badge.text}
                          </span>
                        )
                      })()}
                    </div>
                    <div className="label-details">
                      <div className="detail-item">
                        <span className="detail-label">Time Range:</span>
                        <span className="detail-value">
                          {formatTime(predictedLabels[currentReviewIndex].timestamp)} - {formatTime(predictedLabels[currentReviewIndex].timestamp + predictedLabels[currentReviewIndex].duration)}
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Confidence:</span>
                        <span className="detail-value">{(predictedLabels[currentReviewIndex].confidence * 100).toFixed(1)}%</span>
                      </div>
                      {predictedLabels[currentReviewIndex].matchedGroundTruth && (
                        <div className="detail-item">
                          <span className="detail-label">Matched Ground Truth:</span>
                          <span className="detail-value">Yes</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="verification-actions">
                    <h4>Verify this prediction:</h4>
                    <div className="verification-buttons">
                      <button
                        className={`btn-verify correct ${labelVerifications[predictedLabels[currentReviewIndex].id] === 'correct' ? 'active' : ''}`}
                        onClick={() => handleVerifyLabel(predictedLabels[currentReviewIndex].id, 'correct')}
                      >
                        ✓ Correct
                      </button>
                      <button
                        className={`btn-verify incorrect ${labelVerifications[predictedLabels[currentReviewIndex].id] === 'incorrect' ? 'active' : ''}`}
                        onClick={() => handleVerifyLabel(predictedLabels[currentReviewIndex].id, 'incorrect')}
                      >
                        ✗ Incorrect
                      </button>
                      <button
                        className={`btn-verify uncertain ${labelVerifications[predictedLabels[currentReviewIndex].id] === 'uncertain' ? 'active' : ''}`}
                        onClick={() => handleVerifyLabel(predictedLabels[currentReviewIndex].id, 'uncertain')}
                      >
                        ? Uncertain
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="labels-comparison-section">
            <div className="labels-panel">
              <h3>Predicted Labels ({predictedLabels.length})</h3>
              <div className="labels-list">
                {predictedLabels.map((label, index) => {
                  const badge = getEvaluationBadge(label.evaluation)
                  const verification = labelVerifications[label.id]
                  const verificationBadge = verification ? getVerificationBadge(verification) : null
                  
                  return (
                    <div
                      key={label.id}
                      className={`label-item ${selectedLabel?.id === label.id ? 'active' : ''} ${index === currentReviewIndex ? 'current' : ''}`}
                      onClick={() => {
                        setCurrentReviewIndex(index)
                        handleLabelClick(label)
                      }}
                    >
                      <div className="label-info">
                        <span className="label-name">
                          {label.name}
                          {badge && (
                            <span 
                              className="evaluation-badge"
                              style={{ backgroundColor: badge.color }}
                              title={badge.label}
                            >
                              {badge.text}
                            </span>
                          )}
                          {verificationBadge && (
                            <span 
                              className="verification-badge"
                              style={{ backgroundColor: verificationBadge.color }}
                            >
                              {verificationBadge.text}
                            </span>
                          )}
                        </span>
                        <span className="label-time">
                          {formatTime(label.timestamp)} - {formatTime(label.timestamp + label.duration)}
                        </span>
                        <span className="label-confidence">
                          Confidence: {(label.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="labels-panel">
              <h3>Ground Truth Labels ({groundTruthLabels.length})</h3>
              <div className="labels-list">
                {groundTruthLabels.map((label) => (
                  <div
                    key={label.id}
                    className="label-item ground-truth"
                    onClick={() => handleLabelClick(label)}
                  >
                    <div className="label-info">
                      <span className="label-name">
                        {label.name}
                        <span className="badge ground-truth-badge">GT</span>
                      </span>
                      <span className="label-time">
                        {formatTime(label.timestamp)} - {formatTime(label.timestamp + label.duration)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EvaluationTaskDetail
