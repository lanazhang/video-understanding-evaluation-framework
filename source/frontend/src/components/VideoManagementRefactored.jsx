import { useState, useEffect, useRef } from 'react'
import './VideoManagement.css'
import VideoUpload from './VideoUpload'
import VideoList from './VideoList/VideoList'
import AnalyzeView from './AnalyzeView/AnalyzeView'
import { FetchPost } from '../utils/apiHelper'

function VideoManagement() {
  const [videos, setVideos] = useState([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showAnalyze, setShowAnalyze] = useState(false)
  const [analyzeVideo, setAnalyzeVideo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  
  const hasFetchedRef = useRef(false)

  useEffect(() => {
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
      
      if (data.statusCode === 200) {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        
        setVideos(responseBody.videos)
        setTotalCount(responseBody.total_count || 0)
        setHasMore(responseBody.has_more || false)
        setCurrentPage(page)
      } else {
        const errorMessage = typeof data.body === 'object' && data.body.error 
          ? data.body.error 
          : data.body
        setError(errorMessage || 'Failed to fetch videos')
      }
    } catch (err) {
      console.error('Error fetching videos:', err)
      setError(err.message || 'Failed to fetch videos')
    } finally {
      setLoading(false)
    }
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

  const handleUploadSuccess = () => {
    setShowUploadModal(false)
    fetchVideos()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
      return
    }

    try {
      const data = await FetchPost('/video/delete-video', { id }, 'EvalService')
      
      if (data.statusCode === 200) {
        setVideos(prev => prev.filter(v => v.Id !== id && v.id !== id))
        console.log('Video deleted successfully:', id)
      } else {
        const errorMessage = typeof data.body === 'object' && data.body.error 
          ? data.body.error 
          : data.body
        setError(errorMessage || 'Failed to delete video')
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

  const handleBackFromAnalyze = () => {
    setShowAnalyze(false)
    setAnalyzeVideo(null)
  }

  if (showAnalyze && analyzeVideo) {
    return (
      <AnalyzeView
        video={analyzeVideo}
        onBack={handleBackFromAnalyze}
      />
    )
  }

  return (
    <div className="video-management">
      <div className="content-header">
        <h1>Videos</h1>
        <div className="header-actions">
          <button className="btn-create" onClick={() => setShowUploadModal(true)}>
            + Upload Videos
          </button>
        </div>
      </div>

      <VideoList
        videos={videos}
        loading={loading}
        error={error}
        currentPage={currentPage}
        pageSize={pageSize}
        totalCount={totalCount}
        hasMore={hasMore}
        onRefresh={() => fetchVideos(currentPage)}
        onPreviousPage={handlePreviousPage}
        onNextPage={handleNextPage}
        onAnalyze={handleAnalyze}
        onDelete={handleDelete}
      />

      {showUploadModal && (
        <VideoUpload
          onSuccess={handleUploadSuccess}
          onCancel={() => setShowUploadModal(false)}
        />
      )}
    </div>
  )
}

export default VideoManagement
