import { useState } from 'react'
import './CreateEvaluationTask.css'
import { modelGroups } from '../static/modelConfig'
import videosData from '../static/videos.json'
import groundTruthTasksData from '../static/groundTruthTasks.json'

function CreateEvaluationTask({ onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    taskName: '',
    videoId: '',
    groundTruthTaskId: '',
    model: '',
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Evaluation Task</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="taskName">Task Name *</label>
            <input
              type="text"
              id="taskName"
              name="taskName"
              value={formData.taskName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="videoId">Select Video *</label>
            <select
              id="videoId"
              name="videoId"
              value={formData.videoId}
              onChange={handleChange}
              required
            >
              <option value="">-- Select a video --</option>
              {videosData.map(video => (
                <option key={video.id} value={video.id}>
                  {video.name} ({video.duration})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="groundTruthTaskId">Select Ground Truth *</label>
            <select
              id="groundTruthTaskId"
              name="groundTruthTaskId"
              value={formData.groundTruthTaskId}
              onChange={handleChange}
              required
            >
              <option value="">-- Select a ground truth task --</option>
              {groundTruthTasksData.map(task => (
                <option key={task.id} value={task.id}>
                  {task.taskName} - {task.baseModel}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="model">Select Model/Method *</label>
            <select
              id="model"
              name="model"
              value={formData.model}
              onChange={handleChange}
              required
            >
              <option value="">-- Select a model --</option>
              {modelGroups.map(group => (
                <optgroup key={group.groupName} label={group.groupName}>
                  {group.models.map(model => (
                    <option key={model.modelId || model.displayName} value={model.modelId}>
                      {model.displayName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-submit">
              Create & Process
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateEvaluationTask
