import { useState, useEffect, useRef } from 'react'
import './AnalyzeView.css'
import TaskList from './TaskList'
import CreateEmbeddingForm from './CreateEmbeddingForm'
import CompareModal from './CompareModal'
import { FetchPost } from '../../utils/apiHelper'
import arrowLeftIcon from '../../assets/icons/arrow-left.svg'

function AnalyzeView({ video, onBack, onGroundTruthSaved, isGroundTruthMode = false, currentUser }) {
  const [activeTab, setActiveTab] = useState('embedding')
  const [analyzeTasks, setAnalyzeTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [tasksError, setTasksError] = useState(null)
  
  // Task selection and comparison state
  const [selectedTasks, setSelectedTasks] = useState([])
  const [showCompareModal, setShowCompareModal] = useState(false)
  
  const videoPlayerRef = useRef(null)

  useEffect(() => {
    loadAnalyzeTasks()
  }, [])

  const loadAnalyzeTasks = async () => {
    const videoId = video.Id || video.id
    
    if (!videoId) {
      console.error('No video ID available')
      return
    }
    
    setLoadingTasks(true)
    setTasksError(null)
    try {
      const data = await FetchPost('/video/get-analyze-tasks', { VideoId: videoId }, 'EvalService')
      
      if (data.statusCode === 200) {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        const allTasks = responseBody.Tasks || []
        setAnalyzeTasks(allTasks)
      } else {
        const errorMessage = typeof data.body === 'object' && data.body.error 
          ? data.body.error 
          : data.body
        setTasksError(errorMessage || 'Failed to load analyze tasks')
      }
    } catch (err) {
      console.error('Error loading analyze tasks:', err)
      setTasksError('Failed to load analyze tasks')
    } finally {
      setLoadingTasks(false)
    }
  }

  const handleToggleTaskSelection = (task) => {
    setSelectedTasks(prev => {
      const isSelected = prev.some(t => t.Id === task.Id)
      if (isSelected) {
        return prev.filter(t => t.Id !== task.Id)
      } else {
        return [...prev, task]
      }
    })
  }

  const handleOpenSearchModal = (taskId, vectorIndex, task) => {
    setSelectedTasks([task])
    setShowCompareModal(true)
  }

  const handleOpenCompareModal = () => {
    if (selectedTasks.length === 0) {
      alert('Please select at least one task to compare')
      return
    }
    setShowCompareModal(true)
  }

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task? This will remove all associated data including embeddings and cannot be undone.')) {
      return
    }

    try {
      const data = await FetchPost('/video/delete-analyze-task', { TaskId: taskId }, 'EvalService')
      
      if (data.statusCode === 200) {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        setAnalyzeTasks(prev => prev.filter(t => t.Id !== taskId))
        
        if (responseBody?.errors && responseBody.errors.length > 0) {
          const errorList = responseBody.errors.join('; ')
          alert(`Task deleted, but some cleanup operations failed:\n${errorList}`)
        }
      } else {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        const errorMessage = responseBody?.error || data.body || 'Failed to delete task'
        alert(`Failed to delete task: ${errorMessage}`)
      }
    } catch (err) {
      console.error('Error deleting task:', err)
      alert(`Error deleting task: ${err.message}`)
    }
  }

  const handleCreateEmbedding = async (createParams, selectedModel, analyzeTasks) => {
    let payload
    
    if (selectedModel?.parameterType === 'nova-mme') {
      const durationS = parseInt(createParams.durationS)
      const embeddingDim = parseInt(createParams.embeddingDim)
      
      const existingTask = analyzeTasks.find(task => 
        task.Type === 'nova-mme' &&
        task.Request?.DurationS === durationS &&
        task.Request?.EmbedMode === createParams.embedMode &&
        task.Request?.EmbeddingDim === embeddingDim
      )

      if (existingTask) {
        const confirmCreate = window.confirm(
          `A task with the same parameters already exists:\n\n` +
          `Type: ${existingTask.Type}\n` +
          `Duration: ${existingTask.Request?.DurationS}s\n` +
          `Mode: ${existingTask.Request?.EmbedMode}\n` +
          `Dimension: ${existingTask.Request?.EmbeddingDim}\n` +
          `Status: ${existingTask.Status}\n\n` +
          `Do you want to create a duplicate task?`
        )
        
        if (!confirmCreate) {
          throw new Error('Task creation cancelled')
        }
      }

      payload = {
        VideoId: video.Id || video.id,
        ModelId: createParams.modelId,
        Description: createParams.description,
        Request: {
          DurationS: durationS,
          EmbedMode: createParams.embedMode,
          EmbeddingDim: embeddingDim
        }
      }
    } else if (selectedModel?.parameterType === 'twelvelabs') {
      const segmentationConfig = {
        method: createParams.segmentationMethod
      }
      
      if (createParams.segmentationMethod === 'dynamic') {
        segmentationConfig.dynamic = {
          minDurationSec: createParams.minDurationSec.toString()
        }
      } else if (createParams.segmentationMethod === 'fixed') {
        segmentationConfig.fixed = {
          durationSec: createParams.minDurationSec.toString()
        }
      }
      
      payload = {
        VideoId: video.Id || video.id,
        ModelId: createParams.modelId,
        Description: createParams.description,
        Request: {
          segmentation: segmentationConfig,
          embeddingScope: createParams.embeddingScope,
          embeddingOption: createParams.embeddingOption
        }
      }
    } else {
      throw new Error('Unknown model type')
    }

    const data = await FetchPost(selectedModel.api, payload, 'EvalService')
    
    if (data.statusCode === 200) {
      loadAnalyzeTasks()
      alert('Embedding task started successfully!')
    } else {
      const errorMessage = typeof data.body === 'object' && data.body.error 
        ? data.body.error 
        : data.body
      throw new Error(errorMessage || 'Failed to start embedding task')
    }
  }

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

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    return new Date(timestamp).toLocaleString()
  }

  const formatFps = (fps) => {
    if (!fps) return 'N/A'
    return `${Math.round(fps)} fps`
  }

  return (
    <div className="analyze-view">
      {!isGroundTruthMode && (
        <div className="analyze-header">
          <button className="btn-back" onClick={onBack}>
            <img src={arrowLeftIcon} alt="Back" />
            Back to Videos
          </button>
          <h1>Analyze Video</h1>
        </div>
      )}

      <div className="analyze-content">
        <div className="video-preview-section">
          <div className="video-preview-card">
            <video 
              ref={videoPlayerRef}
              src={video.video_url || `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`}
              controls
              muted
              className="video-preview-player"
            >
              Your browser does not support the video tag.
            </video>
            <div className="video-preview-info">
              <h4>{video.Name}</h4>
              <p className="video-id">ID: {video.Id || video.id}</p>
              <div className="video-metadata">
                <div className="metadata-row">
                  <div className="metadata-item">
                    <span className="metadata-label">Duration:</span>
                    <span className="metadata-value">{formatDuration(video.Duration)}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Resolution:</span>
                    <span className="metadata-value">{formatResolution(video.Resolution)}</span>
                  </div>
                </div>
                <div className="metadata-row">
                  <div className="metadata-item">
                    <span className="metadata-label">Frame Rate:</span>
                    <span className="metadata-value">{formatFps(video.Fps)}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">File Size:</span>
                    <span className="metadata-value">{formatFileSize(video.Size)}</span>
                  </div>
                </div>
                <div className="metadata-row">
                  <div className="metadata-item">
                    <span className="metadata-label">Uploaded By:</span>
                    <span className="metadata-value">{video.UploadedBy || 'N/A'}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Uploaded:</span>
                    <span className="metadata-value">{formatDate(video.UploadedTs)}</span>
                  </div>
                </div>
              </div>
              {video.Description && <p className="video-description">{video.Description}</p>}
            </div>
          </div>
        </div>

        <div className="analyze-form">
          <div className="analyze-tabs">
            <button
              type="button"
              className={`tab-button ${activeTab === 'embedding' ? 'active' : ''}`}
              onClick={() => setActiveTab('embedding')}
            >
              Multimodal Embedding
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'understanding' ? 'active' : ''}`}
              onClick={() => setActiveTab('understanding')}
            >
              Video Understanding
            </button>
          </div>

          {activeTab === 'embedding' && (
            <div className="tab-content">
              <TaskList
                tasks={analyzeTasks}
                loading={loadingTasks}
                error={tasksError}
                selectedTasks={selectedTasks}
                onToggleTaskSelection={handleToggleTaskSelection}
                onOpenSearchModal={handleOpenSearchModal}
                onDeleteTask={handleDeleteTask}
                onRefresh={loadAnalyzeTasks}
                onCompare={handleOpenCompareModal}
                isGroundTruthMode={isGroundTruthMode}
              />

              <CreateEmbeddingForm
                video={video}
                analyzeTasks={analyzeTasks}
                onCreate={handleCreateEmbedding}
              />
            </div>
          )}

          {activeTab === 'understanding' && (
            <div className="tab-content">
              <div className="coming-soon-section">
                <p>Video Understanding features coming soon.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCompareModal && (
        <CompareModal
          video={video}
          selectedTasks={selectedTasks}
          onClose={() => setShowCompareModal(false)}
          onGroundTruthSaved={onGroundTruthSaved}
          isGroundTruthMode={isGroundTruthMode}
          currentUser={currentUser}
        />
      )}
    </div>
  )
}

export default AnalyzeView
