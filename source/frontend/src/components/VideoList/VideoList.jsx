import { useState } from 'react'
import './VideoList.css'
import VideoListItem from './VideoListItem'
import SearchBar from './SearchBar'
import Pagination from './Pagination'

function VideoList({ 
  videos, 
  loading, 
  error, 
  currentPage, 
  pageSize, 
  totalCount, 
  hasMore,
  onRefresh,
  onPreviousPage,
  onNextPage,
  onAnalyze,
  onDelete
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('uploaded_ts')
  const [sortDirection, setSortDirection] = useState('desc')

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const getSortedVideos = (videosToSort) => {
    const sorted = [...videosToSort].sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }

  const getSortIcon = (field) => {
    if (sortField !== field) return '⇅'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  const filteredVideos = videos.filter(video => {
    const query = searchQuery.toLowerCase()
    const name = video.Name?.toLowerCase() || ''
    const description = video.Description?.toLowerCase() || ''
    const uploadedBy = video.UploadedBy?.toLowerCase() || ''
    
    return name.includes(query) || 
           description.includes(query) || 
           uploadedBy.includes(query)
  })

  const sortedAndFilteredVideos = getSortedVideos(filteredVideos)
  const getTotalPages = () => Math.ceil(totalCount / pageSize)

  return (
    <div className="video-list">
      <SearchBar 
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRefresh={onRefresh}
        loading={loading}
      />

      <div className="sort-controls">
        <label>Sort by:</label>
        <select 
          value={sortField} 
          onChange={(e) => setSortField(e.target.value)}
          className="sort-select"
        >
          <option value="name">Name</option>
          <option value="uploaded_ts">Upload Date</option>
        </select>
        <button 
          onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
          className="sort-direction-btn"
          title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
        >
          {sortDirection === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error">{error}</div>
      )}

      {loading && videos.length === 0 ? (
        <div className="loading-message">Loading videos...</div>
      ) : (
        <>
          {sortedAndFilteredVideos.length === 0 ? (
            <div className="no-results-message">
              {searchQuery ? `No videos found matching "${searchQuery}"` : 'No videos uploaded yet'}
            </div>
          ) : (
            <div className="video-grid">
              {sortedAndFilteredVideos.map(video => (
                <VideoListItem
                  key={video.Id || video.id}
                  video={video}
                  onAnalyze={onAnalyze}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}

          {totalCount > 0 && (
            <Pagination
              currentPage={currentPage}
              pageSize={pageSize}
              totalCount={totalCount}
              hasMore={hasMore}
              loading={loading}
              onPreviousPage={onPreviousPage}
              onNextPage={onNextPage}
              getTotalPages={getTotalPages}
            />
          )}
        </>
      )}
    </div>
  )
}

export default VideoList
