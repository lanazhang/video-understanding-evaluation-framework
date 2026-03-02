import { useState, useEffect } from 'react'
import './VideoSelector.css'
import { FetchPost } from '../../utils/apiHelper'

function VideoSelector({ onVideoSelect }) {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(12)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    fetchVideos()
  }, [currentPage, searchQuery])

  const fetchVideos = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const startIndex = (currentPage - 1) * pageSize
      
      const payload = {
        start_index: startIndex,
        page_size: pageSize,
        uploaded_by: '',
        group: ''
      }
      
      const data = await FetchPost('/video/get-videos', payload, 'EvalService')
      
      if (data.videos !== undefined) {
        setVideos(data.videos || [])
        setTotalCount(data.total_count || 0)
        setHasMore(data.has_more || false)
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

  const getThumbnailUrl = (video) => {
    if (video.thumbnail_url) {
      return video.thumbnail_url
    }
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"%3E%3Crect width="160" height="90" fill="%23e0e0e0"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="%23666"%3ENo Thumbnail%3C/text%3E%3C/svg%3E'
  }

  const filteredVideos = videos.filter(video => {
    const query = searchQuery.toLowerCase()
    const name = video.Name?.toLowerCase() || ''
    return name.includes(query)
  })

  const getTotalPages = () => {
    return Math.ceil(totalCount / pageSize)
  }

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (hasMore) {
      setCurrentPage(currentPage + 1)
    }
  }

  return (
    <div className="video-selector">
      <div className="video-selector-header">
        <h2>Select a Video</h2>
        <p>Choose a video to create ground truth labels for</p>
      </div>

      <div className="video-search">
        <input
          type="text"
          placeholder="Search videos..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      {error && (
        <div className="alert alert-error">{error}</div>
      )}

      {loading ? (
        <div className="loading-message">Loading videos...</div>
      ) : (
        <>
          <div className="video-grid">
            {filteredVideos.map(video => {
              const videoId = video.Id || video.id
              return (
                <div
                  key={videoId}
                  className="video-card"
                  onClick={() => onVideoSelect(video)}
                >
                  <img
                    src={getThumbnailUrl(video)}
                    alt={video.Name}
                    className="video-card-thumbnail"
                    onError={(e) => {
                      e.target.src = getThumbnailUrl({})
                    }}
                  />
                  <div className="video-card-info">
                    <div className="video-card-name">{video.Name}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {totalCount > 0 && (
            <div className="video-pagination">
              <button
                type="button"
                className="btn-page"
                onClick={handlePreviousPage}
                disabled={currentPage === 1 || loading}
              >
                Previous
              </button>
              <span className="page-info">
                Page {currentPage} of {getTotalPages()}
              </span>
              <button
                type="button"
                className="btn-page"
                onClick={handleNextPage}
                disabled={!hasMore || loading}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default VideoSelector
