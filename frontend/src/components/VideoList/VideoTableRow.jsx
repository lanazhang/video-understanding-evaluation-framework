import trashIcon from '../../assets/icons/trash.svg'
import documentIcon from '../../assets/icons/document.svg'

function VideoTableRow({ video, gtCount, onAnalyze, onDelete, onViewGTs, formatDate, getThumbnailUrl, placeholderThumbnail }) {
  const hasGTs = gtCount > 0

  return (
    <tr 
      onClick={() => onAnalyze(video)}
      style={{ cursor: 'pointer' }}
      className="clickable-row"
    >
      <td onClick={(e) => e.stopPropagation()}>
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
        <span className="video-link">
          {video.Name}
        </span>
      </td>
      <td>{formatDate(video.UploadedTs)}</td>
      <td onClick={(e) => e.stopPropagation()}>
        {hasGTs ? (
          <button 
            className="btn-icon-view-gt" 
            onClick={() => onViewGTs(video.Id)}
            title={`View ${gtCount} ground truth${gtCount > 1 ? 's' : ''}`}
          >
            <img src={documentIcon} alt="View GTs" />
            <span className="gt-count">{gtCount}</span>
          </button>
        ) : (
          <button 
            className="btn-icon-delete" 
            onClick={() => onDelete(video.Id || video.id)}
            title="Delete video"
          >
            <img src={trashIcon} alt="Delete" />
          </button>
        )}
      </td>
    </tr>
  )
}

export default VideoTableRow
