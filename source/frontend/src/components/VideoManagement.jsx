import { useState, useEffect, useRef } from 'react'
import './VideoManagement.css'
import VideoUpload from './VideoUpload'
import { FetchPost } from '../utils/apiHelper'
import refreshIcon from '../assets/icons/refresh.svg'
import SearchBar from './VideoList/SearchBar'
import VideoTable from './VideoList/VideoTable'
import PaginationControls from './VideoList/PaginationControls'
import AnalyzeView from './AnalyzeView/AnalyzeView'

function VideoManagement({ currentUser }) {
  const [videos, setVideos] = useState([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showAnalyze, setShowAnalyze] = useState(false)
  const [analyzeVideo, setAnalyzeVideo] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sortField, setSortField] = useState('uploaded_ts')
  const [sortDirection, setSortDirection] = useState('desc')
  
  // Task expansion state
  const [expandedTaskId, setExpandedTaskId] = useState(null)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  
  // Ref to track if initial fetch has been done
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    // Only fetch once on mount
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true
      fetchVideos()
    }
  }, [])

  const fetchVideos = async (page = 1) => {
    setLoading(true)
    setError(null)
    
    try {
      const startIndex = (page - 1) * pageSize
      
      const payload = {
        start_index: startIndex,
        page_size: pageSize,
        uploaded_by: '',
        group: ''
      }
      
      const data = await FetchPost('/video/get-videos', payload, 'EvalService')
      
      console.log('API Response:', data)
      
      // FetchPost returns the parsed response body directly
      if (data.videos !== undefined) {
        setVideos(data.videos || [])
        setTotalCount(data.total_count || 0)
        setHasMore(data.has_more || false)
        setCurrentPage(page)
      } else if (data.error) {
        setError(data.error || 'Failed to fetch videos')
      } else {
        setError('Unexpected response format')
      }
    } catch (err) {
      console.error('Error fetching videos:', err)
      setError(err.message || 'Failed to fetch videos')
    } finally {
      setLoading(false)
    }
  }

  const handleLoadMore = () => {
    fetchVideos(currentPage + 1)
  }

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      fetchVideos(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (hasMore) {
      fetchVideos(currentPage + 1)
    }
  }

  const getTotalPages = () => {
    return Math.ceil(totalCount / pageSize)
  }

  const handleUploadSuccess = () => {
    setShowUploadModal(false)
    fetchVideos() // Refresh the video list
  }

  const handleDelete = async (id) => {
    const video = videos.find(v => v.Id === id || v.id === id)
    const gtCount = video?.gt_count || 0
    
    if (gtCount > 0) {
      alert(`Cannot delete this video. It has ${gtCount} ground truth record${gtCount > 1 ? 's' : ''} associated with it.`)
      return
    }
    
    if (!window.confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
      return
    }

    try {
      const data = await FetchPost('/video/delete-video', { Id: id }, 'EvalService')
      
      // FetchPost returns the parsed response body directly
      if (data.error) {
        setError(data.error || 'Failed to delete video')
      } else {
        // Remove from local state
        setVideos(prev => prev.filter(v => v.Id !== id && v.id !== id))
        console.log('Video deleted successfully:', id)
      }
    } catch (err) {
      console.error('Error deleting video:', err)
      setError(err.message || 'Failed to delete video')
    }
  }

  const handleAnalyze = (video) => {
    setAnalyzeVideo(video)
    setShowAnalyze(true)
  }

  const handleViewGTs = (videoId) => {
    // Navigate to ground truth page with video filter
    // This will be handled by the parent App component
    window.dispatchEvent(new CustomEvent('navigateToGT', { detail: { videoId } }))
  }

  const handleSort = (field) => {
    if (sortField === field) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // Set new field with default descending order
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const getSortedVideos = (videosToSort) => {
    const sorted = [...videosToSort].sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      // Handle null/undefined values
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      // Convert to lowercase for string comparison
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }

  // Filter videos based on search query
  const filteredVideos = videos.filter(video => {
    const query = searchQuery.toLowerCase()
    const name = video.Name?.toLowerCase() || ''
    const description = video.Description?.toLowerCase() || ''
    const uploadedBy = video.UploadedBy?.toLowerCase() || ''
    
    return name.includes(query) || 
           description.includes(query) || 
           uploadedBy.includes(query)
  })

  // Apply sorting to filtered videos
  const sortedAndFilteredVideos = getSortedVideos(filteredVideos)

  // Helper function to format timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  // Helper function to get S3 URL
  const getThumbnailUrl = (video) => {
    // Use pre-signed URL if available, otherwise fall back to direct S3 URL
    if (video.thumbnail_url) {
      return video.thumbnail_url
    }
  }

  // Placeholder thumbnail as data URI
  const placeholderThumbnail = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"%3E%3Crect width="160" height="90" fill="%23e0e0e0"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="%23666"%3ENo Thumbnail%3C/text%3E%3C/svg%3E'

  // If showing upload, render that view instead
  if (showUploadModal) {
    return (
      <div className="video-management">
        <div className="content-header">
          <button 
            className="btn-back" 
            onClick={() => setShowUploadModal(false)}
          >
            ← Back to Videos
          </button>
          <h1>Upload Videos</h1>
        </div>
        <VideoUpload
          onSuccess={handleUploadSuccess}
          onCancel={() => setShowUploadModal(false)}
        />
      </div>
    )
  }

  // If showing analyze, render that view instead
  if (showAnalyze && analyzeVideo) {
    return (
      <AnalyzeView
        video={analyzeVideo}
        onBack={() => {
          setShowAnalyze(false)
          setAnalyzeVideo(null)
        }}
      />
    )
  }

  return (
    <div className="video-management">
      <div className="content-header">
        <h1>Video Inventory</h1>
        <div className="header-actions">
          <button 
            className="btn-refresh" 
            onClick={() => fetchVideos(currentPage)}
            disabled={loading}
            title="Refresh video list"
          >
            <img src={refreshIcon} alt="Refresh" />
          </button>
          <button className="btn-create" onClick={() => setShowUploadModal(true)}>
            + Upload Videos
          </button>
        </div>
      </div>

      <SearchBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClear={() => setSearchQuery('')}
      />

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {loading && videos.length === 0 ? (
        <div className="loading-message">Loading videos...</div>
      ) : (
        <>
          <VideoTable
            videos={sortedAndFilteredVideos}
            searchQuery={searchQuery}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
            onAnalyze={handleAnalyze}
            onDelete={handleDelete}
            onViewGTs={handleViewGTs}
            formatDate={formatDate}
            getThumbnailUrl={getThumbnailUrl}
            placeholderThumbnail={placeholderThumbnail}
          />

          <PaginationControls
            currentPage={currentPage}
            pageSize={pageSize}
            totalCount={totalCount}
            hasMore={hasMore}
            loading={loading}
            onPrevious={handlePreviousPage}
            onNext={handleNextPage}
          />
        </>
      )}
    </div>
  )
}

export default VideoManagement
