import { useNavigate } from 'react-router-dom'
import VideoCard from './VideoCard'
import './VideoTable.css'

function VideoTable({ 
  videos, 
  searchQuery,
  sortField,
  sortDirection,
  onSort,
  onAnalyze,
  onDelete,
  onViewGTs,
  formatDate,
  getThumbnailUrl,
  placeholderThumbnail
}) {
  const navigate = useNavigate()
  
  const getSortIcon = (field) => {
    if (sortField !== field) return '⇅'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  return (
    <div className="video-container">
      <div className="sort-controls">
        <label>Sort by:</label>
        <select 
          value={sortField} 
          onChange={(e) => onSort(e.target.value)}
          className="sort-select"
        >
          <option value="name">Name</option>
          <option value="uploaded_ts">Upload Date</option>
        </select>
        <button 
          onClick={() => onSort(sortField)}
          className="sort-direction-btn"
          title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
        >
          {sortDirection === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {videos.length === 0 ? (
        <div className="no-results-message">
          {searchQuery ? (
            `No videos found matching "${searchQuery}"`
          ) : (
            <div className="empty-state-message">
              <p>No videos uploaded yet. Get started by uploading your first video!</p>
              <p style={{ marginTop: '12px', fontSize: '13px', color: '#6c757d' }}>
                New to the platform?{' '}
                <button 
                  onClick={() => navigate('/introduction')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#f97316',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit'
                  }}
                >
                  View the Introduction
                </button>
                {' '}to learn how to use this tool.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="video-grid">
          {videos.map(video => (
            <VideoCard
              key={video.Id || video.id}
              video={video}
              gtCount={video.gt_count || 0}
              onAnalyze={onAnalyze}
              onDelete={onDelete}
              onViewGTs={onViewGTs}
              formatDate={formatDate}
              getThumbnailUrl={getThumbnailUrl}
              placeholderThumbnail={placeholderThumbnail}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default VideoTable
