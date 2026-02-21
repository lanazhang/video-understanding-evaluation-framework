import { useEffect } from 'react'
import './VideoDetail.css'

function VideoDetail({ video, onClose }) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  // Helper function to format duration
  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A'
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    const parts = []
    if (hours > 0) {
      parts.push(`${hours}h`)
    }
    if (mins > 0) {
      parts.push(`${mins}m`)
    }
    if (secs > 0 || parts.length === 0) {
      parts.push(`${secs}s`)
    }
    
    return parts.join(' ')
  }

  // Helper function to format timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  // Helper function to format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  // Helper function to format resolution
  const formatResolution = (resolution) => {
    if (!resolution) return 'N/A'
    if (Array.isArray(resolution)) {
      return `${resolution[0]} × ${resolution[1]}`
    }
    return resolution
  }

  // Helper function to format FPS
  const formatFps = (fps) => {
    if (!fps) return 'N/A'
    return `${Math.round(fps)} fps`
  }

  const getVideoUrl = () => {
    if (video.video_url) {
      return video.video_url
    }
    return `https://${video.s3_bucket}.s3.us-east-1.amazonaws.com/${video.s3_key_video}`
  }

  return (
    <div className="video-detail-modal" onClick={onClose}>
      <div className="video-detail-content" onClick={(e) => e.stopPropagation()}>
        <div className="video-detail-header">
          <h2>{video.name || 'Video Details'}</h2>
          <button className="btn-close" onClick={onClose} title="Close (Esc)">
            ×
          </button>
        </div>

        <div className="video-detail-body">
          <div className="video-player-section">
            <div className="video-player-container">
              <video controls>
                <source src={getVideoUrl()} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
            
            <div className="basic-info">
              {video.description && (
                <div className="info-row">
                  <span className="info-label">Description</span>
                  <span className="info-value">{video.description}</span>
                </div>
              )}
              <div className="info-row-inline">
                <span className="info-label">ID</span>
                <span className="info-value video-id">{video.Id || video.id || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="video-metadata-section">
            <div className="metadata-grid">
              <div className="meta-item">
                <div className="meta-label">Duration</div>
                <div className="meta-value">{formatDuration(video.duration)}</div>
              </div>
              <div className="meta-item">
                <div className="meta-label">Resolution</div>
                <div className="meta-value">{formatResolution(video.resolution)}</div>
              </div>
              <div className="meta-item">
                <div className="meta-label">Frame Rate</div>
                <div className="meta-value">{formatFps(video.fps)}</div>
              </div>
              <div className="meta-item">
                <div className="meta-label">File Size</div>
                <div className="meta-value">{formatFileSize(video.size)}</div>
              </div>
              <div className="meta-item">
                <div className="meta-label">Uploaded By</div>
                <div className="meta-value">{video.uploaded_by || 'N/A'}</div>
              </div>
              <div className="meta-item">
                <div className="meta-label">Upload Date</div>
                <div className="meta-value">{formatDate(video.uploaded_ts)}</div>
              </div>
            </div>

            <div className="storage-info">
              <div className="storage-label">Storage Location</div>
              <div className="storage-path">
                s3://{video.s3_bucket}/{video.s3_key_video || 'N/A'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VideoDetail
