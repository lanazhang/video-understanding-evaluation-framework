import { useNavigate } from 'react-router-dom'
import VideoTableRow from './VideoTableRow'

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
    <div className="video-table">
      <table>
        <thead>
          <tr>
            <th></th>
            <th onClick={() => onSort('name')} style={{ cursor: 'pointer' }}>
              Name {getSortIcon('name')}
            </th>
            <th onClick={() => onSort('uploaded_ts')} style={{ cursor: 'pointer' }}>
              Upload Date {getSortIcon('uploaded_ts')}
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {videos.length === 0 ? (
            <tr>
              <td colSpan="4" className="no-results-cell">
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
              </td>
            </tr>
          ) : (
            videos.map(video => (
              <VideoTableRow
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
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export default VideoTable
