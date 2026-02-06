import { useState, useEffect } from 'react'
import './CreateGroundTruthTask.css'
import { modelGroups } from '../static/modelConfig'

function CreateGroundTruthTask({ onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    taskName: '',
    selectedVideos: [],
    eventTypes: '',
    baseModel: '',
    requireHumanAnnotation: true,
  })
  const [availableVideos, setAvailableVideos] = useState([])

  useEffect(() => {
    fetchAvailableVideos()
  }, [])

  const fetchAvailableVideos = async () => {
    // TODO: Replace with actual API call
    // const response = await fetch('/api/videos')
    // const data = await response.json()
    // setAvailableVideos(data)
    
    // Mock data
    setAvailableVideos([
      { id: 1, name: 'Sample Video 1', label: 'Action', group: 'Group A' },
      { id: 2, name: 'Sample Video 2', label: 'Scene', group: 'Group B' },
      { id: 3, name: 'Sample Video 3', label: 'Action', group: 'Group A' },
    ])
  }

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleVideoUpload = (e) => {
    const selectedIds = Array.from(e.target.selectedOptions, option => parseInt(option.value))
    setFormData(prev => ({
      ...prev,
      selectedVideos: selectedIds
    }))
  }

  const removeVideo = (videoId) => {
    setFormData(prev => ({
      ...prev,
      selectedVideos: prev.selectedVideos.filter(id => id !== videoId)
    }))
  }

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
            <label htmlFor="videos">Select Videos *</label>
            <select
              id="videos"
              multiple
              size="5"
              onChange={handleVideoUpload}
              className="video-select"
              required={formData.selectedVideos.length === 0}
            >
              {availableVideos.map(video => (
                <option key={video.id} value={video.id}>
                  {video.name} - {video.label} ({video.group})
                </option>
              ))}
            </select>
            <p className="help-text">Hold Ctrl/Cmd to select multiple videos</p>
            {formData.selectedVideos.length > 0 && (
              <div className="video-list">
                {formData.selectedVideos.map(videoId => {
                  const video = availableVideos.find(v => v.id === videoId)
                  return video ? (
                    <div key={videoId} className="video-item">
                      <span>{video.name}</span>
                      <button type="button" onClick={() => removeVideo(videoId)}>Remove</button>
                    </div>
                  ) : null
                })}
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
