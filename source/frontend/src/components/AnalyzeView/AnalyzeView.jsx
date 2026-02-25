import { useState, useEffect, useRef } from 'react'
import { FetchPost } from '../../utils/apiHelper'
import { modelGroups } from '../../static/modelConfig'
import arrowLeftIcon from '../../assets/icons/arrow-left.svg'
import refreshIcon from '../../assets/icons/refresh.svg'
import VideoPreview from './VideoPreview'
import TaskList from './TaskList'
import CreateEmbeddingForm from './CreateEmbeddingForm'
import SearchEmbeddings from './SearchEmbeddings'
import './AnalyzeView.css'

function AnalyzeView({ video, onBack }) {
  const [activeTab, setActiveTab] = useState('embedding')
  const [analyzeTasks, setAnalyzeTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [tasksError, setTasksError] = useState(null)
  
  // Task expansion and search state
  const [expandedTaskId, setExpandedTaskId] = useState(null)
  const [selectedTasks, setSelectedTasks] = useState([])
  const [showCompareModal, setShowCompareModal] = useState(false)
  const [compareSearchText, setCompareSearchText] = useState('')
  const [compareTopK, setCompareTopK] = useState(10)
  const [compareResults, setCompareResults] = useState({})
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState(null)
  const [sortBy, setSortBy] = useState('distance') // 'distance' or 'timestamp'
  const [sortOrder, setSortOrder] = useState('asc') // 'asc' or 'desc'
  const [createParams, setCreateParams] = useState({
    modelId: 'amazon.nova-2-multimodal-embeddings-v1:0',
    durationS: 5,
    embedMode: 'AUDIO_VIDEO_COMBINED',
    embeddingDim: 1024,
    segmentationMethod: 'dynamic',
    minDurationSec: 4,
    embeddingScope: ['clip'],
    embeddingOption: ['visual', 'audio', 'transcription'],
    description: ''
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  
  const videoPlayerRef = useRef(null)
  const modalVideoPlayerRef = useRef(null)

  // Get selected model info
  const selectedModel = modelGroups
    .find(group => group.groupName === 'Multimodal Embedding')
    ?.models.find(model => model.modelId === createParams.modelId)
  
  // Update embeddingDim when model changes
  useEffect(() => {
    if (selectedModel?.dims && selectedModel.dims.length > 0) {
      if (!selectedModel.dims.includes(parseInt(createParams.embeddingDim))) {
        setCreateParams(prev => ({ ...prev, embeddingDim: selectedModel.dims[0] }))
      }
    }
  }, [selectedModel, createParams.embeddingDim])

  useEffect(() => {
    if (video && (video.Id || video.id)) {
      loadAnalyzeTasks()
    }
  }, [video])

  const loadAnalyzeTasks = async () => {
    const videoId = video.Id || video.id
    
    if (!videoId) {
      console.error('No video ID available')
      return
    }
    
    setLoadingTasks(true)
    setTasksError(null)
    try {
      const data = await FetchPost('/analyze/get-analyze-tasks', { VideoId: videoId }, 'EvalService')
      
      // Handle response - check if it's wrapped in statusCode/body or direct
      let responseBody
      if (data.statusCode) {
        // Lambda response format
        if (data.statusCode === 200) {
          responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        } else {
          const errorMessage = typeof data.body === 'object' && data.body.error 
            ? data.body.error 
            : (typeof data.body === 'string' ? JSON.parse(data.body).error : data.body)
          setTasksError(errorMessage || 'Failed to load analyze tasks')
          return
        }
      } else {
        // Direct response format
        responseBody = data
      }
      
      const allTasks = responseBody.Tasks || []
      setAnalyzeTasks(allTasks)
    } catch (err) {
      console.error('Error loading analyze tasks:', err)
      setTasksError('Failed to load analyze tasks')
    } finally {
      setLoadingTasks(false)
    }
  }

  const handleOpenSearchModal = (taskId, vectorIndex, task) => {
    setSelectedTasks([task])
    setShowCompareModal(true)
    setCompareResults({})
    setCompareSearchText('')
    setCompareError(null)
  }

  const handleCloseSearch = () => {
    setShowCompareModal(false)
    setSelectedTasks([])
    setCompareResults({})
    setCompareSearchText('')
    setCompareError(null)
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

  const handleOpenCompareModal = () => {
    if (selectedTasks.length === 0) {
      alert('Please select at least one task to compare')
      return
    }
    setShowCompareModal(true)
    setCompareResults({})
    setCompareSearchText('')
    setCompareError(null)
  }

  const handleCompareSearch = async () => {
    if (!compareSearchText.trim()) {
      setCompareError('Please enter a search query')
      return
    }

    setCompareLoading(true)
    setCompareError(null)
    const results = {}

    try {
      for (const task of selectedTasks) {
        const payload = {
          TaskId: task.Id,
          SearchText: compareSearchText,
          InputType: 'text',
          TopK: parseInt(compareTopK) || 10,
          PageSize: 1000,
          FromIndex: 0,
          IncludeVideoUrl: true,
          EmbeddingOptions: ['audio-video', 'video', 'audio']
        }

        let endpoint = '/model/nova-mme-search-vector'
        if (task.Type === 'tlabs-mme') {
          endpoint = '/model/tlabs-mme-search-vector'
        }

        const data = await FetchPost(endpoint, payload, 'EvalService')
        
        // Handle response - check if it's wrapped in statusCode/body or direct
        let responseBody
        if (data.statusCode) {
          // Lambda response format
          if (data.statusCode === 200) {
            responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
          } else {
            const errorMessage = typeof data.body === 'object' && data.body.error 
              ? data.body.error 
              : (typeof data.body === 'string' ? JSON.parse(data.body).error : data.body)
            results[task.Id] = {
              task: task,
              results: [],
              error: errorMessage || 'Search failed'
            }
            continue
          }
        } else if (Array.isArray(data)) {
          // Direct array response format
          responseBody = data
        } else {
          // Direct object response format
          responseBody = data
        }
        
        results[task.Id] = {
          task: task,
          results: responseBody || [],
          error: null
        }
      }

      setCompareResults(results)
    } catch (err) {
      console.error('Error comparing embeddings:', err)
      setCompareError('Comparison failed: ' + err.message)
    } finally {
      setCompareLoading(false)
    }
  }

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task? This will remove all associated data including embeddings and cannot be undone.')) {
      return
    }

    try {
      const data = await FetchPost('/analyze/delete-analyze-task', { TaskId: taskId }, 'EvalService')
      
      if (data.task_id && !data.error) {
        setAnalyzeTasks(prev => prev.filter(t => t.Id !== taskId))
        
        if (data.errors && data.errors.length > 0) {
          const errorList = data.errors.join('; ')
          alert(`Task deleted successfully, but some cleanup operations had issues:\n${errorList}`)
        }
      } else {
        const errorMessage = data.error || data.message || 'Failed to delete task'
        alert(`Failed to delete task: ${errorMessage}`)
      }
    } catch (err) {
      console.error('Error deleting task:', err)
      alert(`Error deleting task: ${err.message}`)
    }
  }

  const handleTimeRangeClick = (startSec, endSec) => {
    // Use videoPlayerRef for inline search, modalVideoPlayerRef for modal (if we add it back)
    const videoElement = videoPlayerRef.current || modalVideoPlayerRef.current
    
    if (videoElement) {
      const endTime = parseFloat(endSec || 0)
      
      videoElement.currentTime = parseFloat(startSec || 0)
      videoElement.muted = true
      
      const existingListener = videoElement._stopAtEndListener
      if (existingListener) {
        videoElement.removeEventListener('timeupdate', existingListener)
      }
      
      const stopAtEndListener = () => {
        if (videoElement.currentTime >= endTime) {
          videoElement.pause()
          videoElement.removeEventListener('timeupdate', stopAtEndListener)
          delete videoElement._stopAtEndListener
        }
      }
      
      videoElement._stopAtEndListener = stopAtEndListener
      videoElement.addEventListener('timeupdate', stopAtEndListener)
      
      videoElement.play().catch(err => {
        console.log('Auto-play prevented:', err)
      })
    }
  }

  const handleCreateEmbedding = async () => {
    setCreating(true)
    setCreateError(null)

    try {
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
            setCreating(false)
            return
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
        setCreateError('Unknown model type')
        setCreating(false)
        return
      }

      const data = await FetchPost(selectedModel.api, payload, 'EvalService')
      
      if (data.statusCode === 200) {
        if (selectedModel?.parameterType === 'nova-mme') {
          setCreateParams(prev => ({
            ...prev,
            durationS: 5,
            embedMode: 'AUDIO_VIDEO_COMBINED',
            embeddingDim: 1024,
            description: ''
          }))
        } else if (selectedModel?.parameterType === 'twelvelabs') {
          setCreateParams(prev => ({
            ...prev,
            segmentationMethod: 'dynamic',
            minDurationSec: 4,
            embeddingScope: ['clip'],
            embeddingOption: ['visual', 'audio', 'transcription'],
            description: ''
          }))
        }
        setCreateError(null)
        loadAnalyzeTasks()
      } else {
        const errorMessage = typeof data.body === 'object' && data.body.error 
          ? data.body.error 
          : data.body
        setCreateError(errorMessage || 'Failed to start embedding task')
      }
    } catch (err) {
      console.error('Error creating embedding:', err)
      setCreateError('Failed to start embedding task: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

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
      <div className="analyze-header">
        <button className="btn-back" onClick={onBack}>
          <img src={arrowLeftIcon} alt="Back" />
          Back to Videos
        </button>
        <h1>Analyze Video</h1>
      </div>

      <div className="analyze-content">
        <VideoPreview
          video={video}
          videoPlayerRef={videoPlayerRef}
          formatDuration={formatDuration}
          formatResolution={formatResolution}
          formatFps={formatFps}
          formatFileSize={formatFileSize}
          formatDate={formatDate}
        />

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
                analyzeTasks={analyzeTasks}
                loadingTasks={loadingTasks}
                tasksError={tasksError}
                selectedTasks={selectedTasks}
                expandedTaskId={expandedTaskId}
                onRefresh={loadAnalyzeTasks}
                onToggleSelection={handleToggleTaskSelection}
                onOpenCompare={handleOpenCompareModal}
                onOpenSearch={handleOpenSearchModal}
                onDeleteTask={handleDeleteTask}
                onToggleExpand={setExpandedTaskId}
                onSelectAll={setSelectedTasks}
                formatDate={formatDate}
                showSearch={showCompareModal}
                video={video}
                compareSearchText={compareSearchText}
                setCompareSearchText={setCompareSearchText}
                compareTopK={compareTopK}
                setCompareTopK={setCompareTopK}
                compareLoading={compareLoading}
                compareError={compareError}
                compareResults={compareResults}
                onSearch={handleCompareSearch}
                onCloseSearch={handleCloseSearch}
                videoPlayerRef={videoPlayerRef}
                onTimeRangeClick={handleTimeRangeClick}
                sortBy={sortBy}
                setSortBy={setSortBy}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
              />

              <CreateEmbeddingForm
                createParams={createParams}
                setCreateParams={setCreateParams}
                selectedModel={selectedModel}
                creating={creating}
                createError={createError}
                onCreateEmbedding={handleCreateEmbedding}
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
    </div>
  )
}

export default AnalyzeView
