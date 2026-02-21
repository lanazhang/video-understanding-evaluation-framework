import { useState, useEffect } from 'react'
import './CreateGroundTruthTask.css'
import { modelGroups } from '../static/modelConfig'
import { FetchPost } from '../utils/apiHelper'

function CreateGroundTruthTask({ onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    taskName: '',
    selectedVideos: [],
    eventTypes: '',
    baseModel: '',
    requireHumanAnnotation: true,
  })
  const [availableVideos, setAvailableVideos] = useState([])
  const [loadingVideos, setLoadingVideos] = useState(false)
  const [videoError, setVideoError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(12)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    fetchAvailableVideos()
  }, [currentPage, searchQuery])

  const fetchAvailableVideos = async () => {
    setLoadingVideos(true)
    setVideoError(null)
    
    try {
      const startIndex = (currentPage - 1) * pageSize
      
      const payload = {
        start_index: startIndex,
        page_size: pageSize,
        uploaded_by: '',
        group: ''
      }
      
      const data = await FetchPost('/video/get-videos', payload, 'EvalService')
      
      if (data.statusCode === 200) {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        setAvailableVideos(responseBody.videos || [])
        setTotalCount(responseBody.total_count || 0)
        setHasMore(responseBody.has_more || false)
      } else {
        const errorMessage = typeof data.body === 'object' && data.body.error 
          ? data.body.error 
          : data.body
        setVideoError(errorMessage || 'Failed to fetch videos')
      }
    } catch (err) {
      console.error('Error fetching videos:', err)
      setVideoError(err.message || 'Failed to fetch videos')
    } finally {
      setLoadingVideos(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleVideoUpload = (e) => {
    const selectedIds = Array.from(e.target.selectedOptions, option => option.value)
    setFormData(prev => ({
      ...prev,
      selectedVideos: selectedIds
    }))
  }

  const toggleVideoSelection = (videoId) => {
    setFormData(prev => {
      const isSelected = prev.selectedVideos.includes(videoId)
      return {
        ...prev,
        selectedVideos: isSelected
          ? prev.selectedVideos.filter(id => id !== videoId)
          : [...prev.selectedVideos, videoId]
      }
    })
  }

  const removeVideo = (videoId) => {
    setFormData(prev => ({
      ...prev,
      selectedVideos: prev.selectedVideos.filter(id => id !== videoId)
    }))
  }

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value)
    setCurrentPage(1) // Reset to first page on search
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

  const getTotalPages = () => {
    return Math.ceil(totalCount / pageSize)
  }

  const getThumbnailUrl = (video) => {
    if (video.thumbnail_url) {
      return video.thumbnail_url
    }
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"%3E%3Crect width="160" height="90" fill="%23e0e0e0"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="%23666"%3ENo Thumbnail%3C/text%3E%3C/svg%3E'
  }

  const filteredVideos = availableVideos.filter(video => {
    const query = searchQuery.toLowerCase()
    const name = video.name?.toLowerCase() || ''
    return name.includes(query)
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    // TODO: Implement API call to create task
    console.log('Creating task:', formData)
    onSubmit(formData)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Create Ground Truth Task</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="taskName">Task Name *</label>
            <input
              type="text"
              id="taskName"
              name="taskName"
              value={formData.taskName}
              onChange={handleInputChange}
              required
              placeholder="Enter task name"
            />
          </div>

          <div className="form-group">
            <label>Select Videos *</label>
            {videoError && (
              <div className="error-message">{videoError}</div>
            )}
            
            <div className="video-search">
              <input
                type="text"
                placeholder="Search videos..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="search-input-small"
              />
            </div>

            {loadingVideos ? (
              <div className="loading-message">Loading videos...</div>
            ) : (
              <>
                <div className="video-grid">
                  {filteredVideos.map(video => {
                    const videoId = video.Id || video.id
                    const isSelected = formData.selectedVideos.includes(videoId)
                    return (
                      <div
                        key={videoId}
                        className={`video-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleVideoSelection(videoId)}
                      >
                        <img
                          src={getThumbnailUrl(video)}
                          alt={video.name}
                          className="video-card-thumbnail"
                          onError={(e) => {
                            e.target.src = getThumbnailUrl({})
                          }}
                        />
                        <div className="video-card-info">
                          <div className="video-card-name">{video.name}</div>
                          {isSelected && (
                            <div className="video-card-badge">✓ Selected</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {totalCount > 0 && (
                  <div className="video-pagination">
                    <button
                      type="button"
                      className="btn-page-small"
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1 || loadingVideos}
                    >
                      Previous
                    </button>
                    <span className="page-info-small">
                      Page {currentPage} of {getTotalPages()}
                    </span>
                    <button
                      type="button"
                      className="btn-page-small"
                      onClick={handleNextPage}
                      disabled={!hasMore || loadingVideos}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}

            {formData.selectedVideos.length > 0 && (
              <div className="selected-videos-summary">
                <strong>{formData.selectedVideos.length} video(s) selected</strong>
                <div className="video-list">
                  {formData.selectedVideos.map(videoId => {
                    const video = availableVideos.find(v => (v.Id || v.id) === videoId)
                    return video ? (
                      <div key={videoId} className="video-item">
                        <span>{video.name}</span>
                        <button type="button" onClick={() => removeVideo(videoId)}>Remove</button>
                      </div>
                    ) : (
                      <div key={videoId} className="video-item">
                        <span>Video ID: {videoId}</span>
                        <button type="button" onClick={() => removeVideo(videoId)}>Remove</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="eventTypes">Event Types / Labels *</label>
            <textarea
              id="eventTypes"
              name="eventTypes"
              value={formData.eventTypes}
              onChange={handleInputChange}
              required
              placeholder="Enter event types or labels (comma-separated)"
              rows="3"
            />
          </div>

          <div className="form-group">
            <label htmlFor="baseModel">Base Model *</label>
            <select
              id="baseModel"
              name="baseModel"
              value={formData.baseModel}
              onChange={handleInputChange}
              required
            >
              <option value="">Select a base model</option>
              {modelGroups.map((group) => (
                <optgroup key={group.groupName} label={group.groupName}>
                  {group.models.map((model) => (
                    <option key={model.displayName} value={model.modelId || model.displayName}>
                      {model.displayName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                name="requireHumanAnnotation"
                checked={formData.requireHumanAnnotation}
                onChange={handleInputChange}
              />
              <span>Require Human Annotation</span>
            </label>
            <p className="help-text">Independent from base model labels</p>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateGroundTruthTask
