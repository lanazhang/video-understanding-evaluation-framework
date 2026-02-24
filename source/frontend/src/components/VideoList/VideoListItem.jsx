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

  const placeholderThumbnail = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"%3E%3Crect width="160" height="90" fill="%23e0e0e0"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="%23666"%3ENo Thumbnail%3C/text%3E%3C/svg%3E'

  return (
    <tr>
      <td>
        <img 
          src={getThumbnailUrl(video) || placeholderThumbnail} 
          alt={video.Name}
          className="video-thumbnail"
          onError={(e) => {
            e.target.src = placeholderThumbnail
          }}
        />
      </td>
      <td>
        <span className="video-link">{video.Name}</span>
      </td>
      <td>{formatDate(video.UploadedTs)}</td>
      <td>
        <div style={{ display: 'flex', gap: '8px' }}>
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
      </td>
    </tr>
  )
}

export default VideoListItem
