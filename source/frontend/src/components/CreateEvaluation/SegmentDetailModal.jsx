function SegmentDetailModal({ segment, selectedVideo, onClose }) {
  if (!segment) return null

  return (
    <div className="segment-modal-overlay" onClick={onClose}>
      <div className="segment-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="segment-modal-header">
          <h2>Segment Details</h2>
          <button className="segment-modal-close" onClick={onClose}>&times;</button>
        </div>
        
        <div className="segment-modal-body">
          <div className="segment-video-container">
            <video 
              src={selectedVideo.video_url || `https://${selectedVideo.S3Bucket}.s3.us-east-1.amazonaws.com/${selectedVideo.S3KeyVideo}`}
              controls
              autoPlay
              muted
              className="segment-video-player"
              ref={(el) => {
                if (el) {
                  const startTime = segment.type === 'gt' 
                    ? parseFloat(segment.gtLabel.StartTs || 0)
                    : parseFloat(segment.predLabel.StartTs || 0)
                  const endTime = segment.type === 'gt'
                    ? parseFloat(segment.gtLabel.EndTs || 0)
                    : parseFloat(segment.predLabel.EndTs || 0)
                  
                  el.currentTime = startTime
                  
                  const stopListener = () => {
                    if (el.currentTime >= endTime) {
                      el.pause()
                      el.currentTime = startTime
                    }
                  }
                  
                  el.addEventListener('timeupdate', stopListener)
                  return () => el.removeEventListener('timeupdate', stopListener)
                }
              }}
            >
              Your browser does not support the video tag.
            </video>
          </div>

          <div className="segment-details-grid">
            <div className="segment-detail-section">
              <h3>Ground Truth Segment</h3>
              {segment.gtLabel ? (
                <div className="segment-detail-card">
                  <div className="segment-detail-row">
                    <span className="segment-detail-label">Time Range:</span>
                    <span className="segment-detail-value">
                      {parseFloat(segment.gtLabel.StartTs || 0).toFixed(2)}s - {parseFloat(segment.gtLabel.EndTs || 0).toFixed(2)}s
                    </span>
                  </div>
                  <div className="segment-detail-row">
                    <span className="segment-detail-label">Duration:</span>
                    <span className="segment-detail-value">
                      {(parseFloat(segment.gtLabel.EndTs || 0) - parseFloat(segment.gtLabel.StartTs || 0)).toFixed(2)}s
                    </span>
                  </div>
                  <div className="segment-detail-row">
                    <span className="segment-detail-label">Label:</span>
                    <span className="segment-detail-value">{segment.gtLabel.Label || 'No label'}</span>
                  </div>
                  {segment.gtLabel.Score !== undefined && (
                    <div className="segment-detail-row">
                      <span className="segment-detail-label">Score:</span>
                      <span className="segment-detail-value">{segment.gtLabel.Score.toFixed(4)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="segment-no-match">No ground truth segment</div>
              )}
            </div>

            <div className="segment-detail-section">
              <h3>Prediction Segment</h3>
              {segment.predLabel ? (
                <div className="segment-detail-card">
                  <div className="segment-detail-row">
                    <span className="segment-detail-label">Time Range:</span>
                    <span className="segment-detail-value">
                      {parseFloat(segment.predLabel.StartTs || 0).toFixed(2)}s - {parseFloat(segment.predLabel.EndTs || 0).toFixed(2)}s
                    </span>
                  </div>
                  <div className="segment-detail-row">
                    <span className="segment-detail-label">Duration:</span>
                    <span className="segment-detail-value">
                      {(parseFloat(segment.predLabel.EndTs || 0) - parseFloat(segment.predLabel.StartTs || 0)).toFixed(2)}s
                    </span>
                  </div>
                  <div className="segment-detail-row">
                    <span className="segment-detail-label">Label:</span>
                    <span className="segment-detail-value">{segment.predLabel.Label || 'No label'}</span>
                  </div>
                  {segment.predLabel.Score !== undefined && (
                    <div className="segment-detail-row">
                      <span className="segment-detail-label">Distance:</span>
                      <span className="segment-detail-value">{segment.predLabel.Score.toFixed(4)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="segment-no-match">No prediction segment</div>
              )}
            </div>
          </div>

          <div className="segment-match-info">
            <div className="segment-match-status">
              <span className="segment-match-label">Match Status:</span>
              <span className={`status-badge ${segment.status.toLowerCase()} large`}>
                {segment.status}
              </span>
              {segment.labelMatch && segment.status === 'TP' && (
                <span className="label-match-indicator large" title="Labels matched">✓ Labels Match</span>
              )}
            </div>
            {segment.status === 'TP' && (
              <div className="segment-match-iou">
                <span className="segment-match-label">IoU (Temporal Overlap):</span>
                <span className="segment-match-value">{(segment.iou * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SegmentDetailModal
