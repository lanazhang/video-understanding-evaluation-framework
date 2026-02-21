import { useState, useEffect, useRef } from 'react'
import './VideoManagement.css'
import VideoUpload from './VideoUpload'
import VideoDetail from './VideoDetail'
import { FetchPost } from '../utils/apiHelper'
import { modelGroups } from '../static/modelConfig'

function VideoManagement() {
  const [videos, setVideos] = useState([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [showAnalyze, setShowAnalyze] = useState(false)
  const [analyzeVideo, setAnalyzeVideo] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sortField, setSortField] = useState('uploaded_ts')
  const [sortDirection, setSortDirection] = useState('desc')
  
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
    if (!window.confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
      return
    }

    try {
      const data = await FetchPost('/video/delete-video', { id }, 'EvalService')
      
      if (data.statusCode === 200) {
        // Remove from local state
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

  const handleVideoClick = (video) => {
    setSelectedVideo(video)
  }

  const handleVideoDeleted = (videoId) => {
    // Remove from local state after successful deletion
    setVideos(prev => prev.filter(v => v.Id !== videoId && v.id !== videoId))
  }

  const handleAnalyze = (video) => {
    setAnalyzeVideo(video)
    setShowAnalyze(true)
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

  const getSortIcon = (field) => {
    if (sortField !== field) return '⇅'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  // Filter videos based on search query
  const filteredVideos = videos.filter(video => {
    const query = searchQuery.toLowerCase()
    const name = video.name?.toLowerCase() || ''
    const description = video.description?.toLowerCase() || ''
    const uploadedBy = video.uploaded_by?.toLowerCase() || ''
    
    return name.includes(query) || 
           description.includes(query) || 
           uploadedBy.includes(query)
  })

  // Apply sorting to filtered videos
  const sortedAndFilteredVideos = getSortedVideos(filteredVideos)

  // Helper function to format duration
  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A'
    const mins = Math.floor(seconds / 60)
    const secs = (seconds % 60).toFixed(2)
    return `${mins}:${secs.toString().padStart(5, '0')}`
  }

  // Helper function to format timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  // Helper function to format resolution
  const formatResolution = (resolution) => {
    if (!resolution) return 'N/A'
    if (Array.isArray(resolution) && resolution.length === 2) {
      return `${resolution[0]} × ${resolution[1]}`
    }
    return resolution
  }

  // Helper function to get S3 URL
  const getVideoUrl = (video) => {
    // Use pre-signed URL if available, otherwise fall back to direct S3 URL
    if (video.video_url) {
      return video.video_url
    }
    return `https://${video.s3_bucket}.s3.us-east-1.amazonaws.com/${video.s3_key_video}`
  }

  const getThumbnailUrl = (video) => {
    // Use pre-signed URL if available, otherwise fall back to direct S3 URL
    if (video.thumbnail_url) {
      return video.thumbnail_url
    }
  }

  // Placeholder thumbnail as data URI
  const placeholderThumbnail = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"%3E%3Crect width="160" height="90" fill="%23e0e0e0"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="%23666"%3ENo Thumbnail%3C/text%3E%3C/svg%3E'

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
        <h1>Videos</h1>
        <div className="header-actions">
          <button 
            className="btn-refresh" 
            onClick={() => fetchVideos(currentPage)}
            disabled={loading}
            title="Refresh video list"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
          <button className="btn-create" onClick={() => setShowUploadModal(true)}>
            + Upload Videos
          </button>
        </div>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search videos..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        {searchQuery && (
          <button 
            className="btn-clear-search"
            onClick={() => setSearchQuery('')}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {loading && videos.length === 0 ? (
        <div className="loading-message">Loading videos...</div>
      ) : (
        <>
          <div className="video-table">
            <table>
              <thead>
                <tr>
                  <th>Thumbnail</th>
                  <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                    Name {getSortIcon('name')}
                  </th>
                  <th onClick={() => handleSort('uploaded_ts')} style={{ cursor: 'pointer' }}>
                    Upload Date {getSortIcon('uploaded_ts')}
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredVideos.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="no-results-cell">
                      {searchQuery ? `No videos found matching "${searchQuery}"` : 'No videos uploaded yet'}
                    </td>
                  </tr>
                ) : (
                  sortedAndFilteredVideos.map(video => (
                  <tr key={video.Id || video.id} onClick={() => handleVideoClick(video)} style={{ cursor: 'pointer' }}>
                    <td>
                      <img 
                        src={getThumbnailUrl(video) || placeholderThumbnail} 
                        alt={video.name}
                        className="video-thumbnail"
                        onError={(e) => {
                          e.target.src = placeholderThumbnail
                        }}
                      />
                    </td>
                    <td>
                      <span className="video-link">
                        {video.name}
                      </span>
                    </td>
                    <td>{formatDate(video.uploaded_ts)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn-action btn-analyze" 
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAnalyze(video)
                          }}
                        >
                          Analyze
                        </button>
                        <button 
                          className="btn-action btn-delete" 
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(video.Id || video.id)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
                )}
              </tbody>
            </table>
          </div>

          {totalCount > 0 && (
            <div className="pagination-container">
              <div className="pagination-info">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} videos
              </div>
              <div className="pagination-controls">
                <button 
                  className="btn-page" 
                  onClick={handlePreviousPage}
                  disabled={currentPage === 1 || loading}
                >
                  Previous
                </button>
                <span className="page-indicator">
                  Page {currentPage} of {getTotalPages()}
                </span>
                <button 
                  className="btn-page" 
                  onClick={handleNextPage}
                  disabled={!hasMore || loading}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showUploadModal && (
        <VideoUpload
          onSuccess={handleUploadSuccess}
          onCancel={() => setShowUploadModal(false)}
        />
      )}

      {selectedVideo && (
        <VideoDetail
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
          onDelete={handleVideoDeleted}
        />
      )}
    </div>
  )
}

// Analyze View Component (replaces the list)
function AnalyzeView({ video, onBack }) {
  const [selectedModel, setSelectedModel] = useState(null)
  const [activeTab, setActiveTab] = useState(modelGroups[0]?.groupName || '')
  const [running, setRunning] = useState(false)

  // Helper functions for formatting
  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A'
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    const parts = []
    if (hours > 0) parts.push(`${hours}h`)
    if (mins > 0) parts.push(`${mins}m`)
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)
    
    return parts.join(' ')
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatResolution = (resolution) => {
    if (!resolution) return 'N/A'
    if (Array.isArray(resolution)) {
      return `${resolution[0]} × ${resolution[1]}`
    }
    return resolution
  }

  const formatFps = (fps) => {
    if (!fps) return 'N/A'
    return `${Math.round(fps)} fps`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!selectedModel) {
      alert('Please select a model')
      return
    }

    setRunning(true)
    
    if (!selectedModel.api) {
      alert('Model API endpoint not configured')
      setRunning(false)
      return
    }

    try {
      // Prepare request payload
      const payload = {
        video_id: video.Id || video.id,
        model_id: selectedModel.modelId,
        requested_by: 'current_user' // TODO: Get from Cognito
      }

      console.log(`Calling API: ${selectedModel.api}`, payload)
      
      // Call the API endpoint specified in the model config
      const data = await FetchPost(selectedModel.api, payload, 'EvalService')
      
      if (data.statusCode === 200) {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        alert(`Analysis started successfully!\nTask ID: ${responseBody.task_id}`)
        onBack()
      } else {
        const errorMessage = typeof data.body === 'object' && data.body.error 
          ? data.body.error 
          : data.body
        alert(`Failed to start analysis: ${errorMessage}`)
      }
    } catch (err) {
      console.error('Error starting analysis:', err)
      alert(`Failed to start analysis: ${err.message}`)
    } finally {
      setRunning(false)
    }
  }

  const activeGroup = modelGroups.find(g => g.groupName === activeTab)

  return (
    <div className="analyze-view">
      <div className="analyze-header">
        <button className="btn-back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back to Videos
        </button>
        <h1>Analyze Video</h1>
      </div>

      <div className="analyze-content">
        <div className="video-preview-section">
          <h3>Selected Video</h3>
          <div className="video-preview-card">
            <img 
              src={video.thumbnail_url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="180"%3E%3Crect fill="%23e0e0e0" width="320" height="180"/%3E%3C/svg%3E'} 
              alt={video.name}
              className="video-preview-thumbnail"
            />
            <div className="video-preview-info">
              <h4>{video.name}</h4>
              <p className="video-id">ID: {video.Id || video.id}</p>
              <div className="video-metadata">
                <div className="metadata-row">
                  <div className="metadata-item">
                    <span className="metadata-label">Duration:</span>
                    <span className="metadata-value">{formatDuration(video.duration)}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Resolution:</span>
                    <span className="metadata-value">{formatResolution(video.resolution)}</span>
                  </div>
                </div>
                <div className="metadata-row">
                  <div className="metadata-item">
                    <span className="metadata-label">Frame Rate:</span>
                    <span className="metadata-value">{formatFps(video.fps)}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">File Size:</span>
                    <span className="metadata-value">{formatFileSize(video.size)}</span>
                  </div>
                </div>
              </div>
              {video.description && <p className="video-description">{video.description}</p>}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="analyze-form">
          <div className="form-group">
            <label>Select Model Category and Model *</label>
            
            {/* Tabs */}
            <div className="model-tabs">
              {modelGroups.map(group => (
                <button
                  key={group.groupName}
                  type="button"
                  className={`tab-button ${activeTab === group.groupName ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab(group.groupName)
                    setSelectedModel(null) // Clear selection when switching tabs
                  }}
                >
                  {group.groupName}
                </button>
              ))}
            </div>

            {/* Model List */}
            <div className="model-list-container">
              {activeGroup && activeGroup.models.map((model, index) => (
                <div
                  key={index}
                  className={`model-item ${selectedModel === model ? 'selected' : ''}`}
                  onClick={() => setSelectedModel(model)}
                >
                  <div className="model-item-radio">
                    <input
                      type="radio"
                      name="model"
                      checked={selectedModel === model}
                      onChange={() => setSelectedModel(model)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="model-item-content">
                    <div className="model-item-name">{model.displayName}</div>
                    {model.modelId && (
                      <div className="model-item-id">{model.modelId}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {selectedModel && (
              <p className="help-text">Selected: {selectedModel.displayName}</p>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onBack} disabled={running}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={running || !selectedModel}
            >
              {running ? 'Starting Analysis...' : 'Start Analysis'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Ad Hoc Test Modal Component (DEPRECATED - keeping for reference)
function AdHocTestModal({ video, onClose }) {
  const [selectedModels, setSelectedModels] = useState([])
  const [testName, setTestName] = useState('')
  const [running, setRunning] = useState(false)

  const toggleModel = (modelId) => {
    setSelectedModels(prev =>
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setRunning(true)
    
    // TODO: Implement API call to start ad hoc test
    console.log('Starting ad hoc test:', {
      video: video.Id || video.id,
      models: selectedModels,
      testName
    })
    
    setTimeout(() => {
      setRunning(false)
      alert('Ad hoc test started successfully!')
      onClose()
    }, 1000)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content adhoc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Ad Hoc Test</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        <div className="adhoc-body">
          <div className="video-info-section">
            <h3>Selected Video</h3>
            <div className="video-info-card">
              <img 
                src={video.thumbnail_url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="90"%3E%3Crect fill="%23e0e0e0" width="160" height="90"/%3E%3C/svg%3E'} 
                alt={video.name}
                className="video-info-thumbnail"
              />
              <div className="video-info-details">
                <strong>{video.name}</strong>
                <p>ID: {video.Id || video.id}</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="testName">Test Name *</label>
              <input
                type="text"
                id="testName"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                placeholder="Enter test name"
                required
              />
            </div>

            <div className="form-group">
              <label>Select Models to Test *</label>
              <div className="model-selection">
                {modelGroups.map(group => (
                  <div key={group.groupName} className="model-group">
                    <h4>{group.groupName}</h4>
                    <div className="model-list">
                      {group.models.map((model, index) => {
                        // Use displayName as fallback if modelId is empty
                        const uniqueId = model.modelId || `${group.groupName}-${model.displayName}-${index}`
                        return (
                          <label key={uniqueId} className="model-checkbox">
                            <input
                              type="checkbox"
                              checked={selectedModels.includes(uniqueId)}
                              onChange={() => toggleModel(uniqueId)}
                            />
                            <span>{model.displayName}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {selectedModels.length > 0 && (
                <p className="help-text">{selectedModels.length} model(s) selected</p>
              )}
            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={running}>
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn-primary" 
                disabled={running || selectedModels.length === 0}
              >
                {running ? 'Starting Test...' : 'Start Test'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default VideoManagement
