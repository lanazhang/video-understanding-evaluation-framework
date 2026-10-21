function VideoPreview({ video, videoPlayerRef, formatDuration, formatResolution, formatFps, formatFileSize, formatDate }) {
  return (
    <div className="video-preview-section">
      <div className="video-preview-card">
        <video 
          ref={videoPlayerRef}
          src={video.video_url || `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`}
          controls
          muted
          className="video-preview-player"
        >
          Your browser does not support the video tag.
        </video>
        <div className="video-preview-info">
          <div className="video-header-compact">
            <h4>{video.Name}</h4>
            <span className="video-id-compact">ID: {video.Id || video.id}</span>
          </div>
          <div className="video-metadata-compact">
            <span className="metadata-item-compact">
              <span className="metadata-label-compact">Duration:</span> {formatDuration(video.Duration)}
            </span>
            <span className="metadata-separator">•</span>
            <span className="metadata-item-compact">
              <span className="metadata-label-compact">Resolution:</span> {formatResolution(video.Resolution)}
            </span>
            <span className="metadata-separator">•</span>
            <span className="metadata-item-compact">
              <span className="metadata-label-compact">FPS:</span> {formatFps(video.Fps)}
            </span>
            <span className="metadata-separator">•</span>
            <span className="metadata-item-compact">
              <span className="metadata-label-compact">Size:</span> {formatFileSize(video.Size)}
            </span>
            <span className="metadata-separator">•</span>
            <span className="metadata-item-compact">
              <span className="metadata-label-compact">By:</span> {video.UploadedBy || 'N/A'}
            </span>
            <span className="metadata-separator">•</span>
            <span className="metadata-item-compact">
              <span className="metadata-label-compact">Uploaded:</span> {formatDate(video.UploadedTs)}
            </span>
          </div>
          {video.Description && <p className="video-description-compact">{video.Description}</p>}
        </div>
      </div>
    </div>
  )
}

export default VideoPreview
