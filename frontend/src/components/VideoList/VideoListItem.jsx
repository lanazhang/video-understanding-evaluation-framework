import './VideoListItem.css'

function VideoListItem({ video, onAnalyze, onDelete }) {
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    return new Date(timestamp).toLocaleString()
  }

  const getThumbnailUrl = (video) => {
    if (video.thumbnail_url) {
      return video.thumbnail_url
    }
    return null
  }

  const placeholderThumbnail = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"%3E%3Crect width="320" height="180" fill="%23e0e0e0"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="%23666"%3ENo Thumbnail%3C/text%3E%3C/svg%3E'

  return (
    <div className="video-card">
      <div className="video-card-thumbnail">
        <img 
          src={getThumbnailUrl(video) || placeholderThumbnail} 
          alt={video.Name}
          onError={(e) => {
            e.target.src = placeholderThumbnail
          }}
        />
      </div>
      <div className="video-card-content">
        <h3 className="video-card-title" title={video.Name}>
          {video.Name}
        </h3>
        <p className="video-card-date">
          {formatDate(video.UploadedTs)}
        </p>
        <div className="video-card-actions">
          <button 
            className="btn-action btn-analyze" 
            onClick={(e) => {
              e.stopPropagation()
              onAnalyze(video)
            }}
          >
            Analyze
          </button>
          <button 
            className="btn-action btn-delete" 
            onClick={(e) => {
              e.stopPropagation()
              onDelete(video.Id || video.id)
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export default VideoListItem
