import trashIcon from '../../assets/icons/trash.svg'
import documentIcon from '../../assets/icons/document.svg'
import './VideoCard.css'

function VideoCard({ video, gtCount, onAnalyze, onDelete, onViewGTs, formatDate, getThumbnailUrl, placeholderThumbnail }) {
  const hasGTs = gtCount > 0

  return (
    <div 
      className="video-card"
      onClick={() => onAnalyze(video)}
    >
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
        <div className="video-card-actions" onClick={(e) => e.stopPropagation()}>
          {hasGTs ? (
            <button 
              className="btn-view-gt" 
              onClick={() => onViewGTs(video.Id)}
              title={`View ${gtCount} ground truth${gtCount > 1 ? 's' : ''}`}
            >
              <img src={documentIcon} alt="View GTs" />
              <span>{gtCount} GT{gtCount > 1 ? 's' : ''}</span>
            </button>
          ) : (
            <button 
              className="btn-delete" 
              onClick={() => onDelete(video.Id || video.id)}
              title="Delete video"
            >
              <img src={trashIcon} alt="Delete" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default VideoCard
