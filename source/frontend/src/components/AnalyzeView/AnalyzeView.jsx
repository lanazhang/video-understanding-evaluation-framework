import { useState, useEffect, useRef } from 'react'
import './AnalyzeView.css'
import TaskList from './TaskList'
import CreateEmbeddingForm from './CreateEmbeddingForm'
import { FetchPost } from '../../utils/apiHelper'
import arrowLeftIcon from '../../assets/icons/arrow-left.svg'

function AnalyzeView({ video, onBack, onGroundTruthSaved, isGroundTruthMode = false, currentUser }) {
  const [activeTab, setActiveTab] = useState('embedding')
  const [analyzeTasks, setAnalyzeTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [tasksError, setTasksError] = useState(null)
  
  // Task selection and comparison state
  const [selectedTasks, setSelectedTasks] = useState([])
  
  // Inline search state
  const [compareSearchText, setCompareSearchText] = useState('')
  const [compareTopK, setCompareTopK] = useState(10)
  const [compareResults, setCompareResults] = useState({})
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState(null)
  
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
    // Clear previous results when selecting a new task
    setCompareResults({})
    setCompareSearchText('')
    setCompareError(null)
  }

  const handleOpenCompareModal = () => {
    if (selectedTasks.length === 0) {
      alert('Please select at least one task to compare')
      return
    }
    // Clear previous results when opening compare
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

        let endpoint = '/video/nova-mme-search-vector'
        if (task.Type === 'tlabs-mme') {
          endpoint = '/video/tlabs-mme-search-vector'
        }

        const data = await FetchPost(endpoint, payload, 'EvalService')
        
        if (data.statusCode === 200) {
          const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
          results[task.Id] = {
            task: task,
            results: responseBody || [],
            error: null
          }
        } else {
          const errorMessage = typeof data.body === 'object' && data.body.error 
            ? data.body.error 
            : data.body
          results[task.Id] = {
            task: task,
            results: [],
            error: errorMessage || 'Search failed'
          }
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

  const handleTimeRangeClick = (startSec, endSec) => {
    if (videoPlayerRef.current) {
      const videoEl = videoPlayerRef.current
      const endTime = parseFloat(endSec || 0)
      
      videoEl.currentTime = parseFloat(startSec || 0)
      videoEl.muted = true
      
      const existingListener = videoEl._stopAtEndListener
      if (existingListener) {
        videoEl.removeEventListener('timeupdate', existingListener)
      }
      
      const stopAtEndListener = () => {
        if (videoEl.currentTime >= endTime) {
          videoEl.pause()
          videoEl.removeEventListener('timeupdate', stopAtEndListener)
          delete videoEl._stopAtEndListener
        }
      }
      
      videoEl._stopAtEndListener = stopAtEndListener
      videoEl.addEventListener('timeupdate', stopAtEndListener)
      
      videoEl.play().catch(err => {
        console.log('Auto-play prevented:', err)
      })
    }
  }

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task? This will remove all associated data including embeddings and cannot be undone.')) {
      return
    }

    try {
      const data = await FetchPost('/video/delete-analyze-task', { TaskId: taskId }, 'EvalService')
      
      // Check if the response indicates success (has task_id and message, no error field)
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
            <img
              src={video.thumbnail_url || `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyThumbnail}`}
              alt={video.Name}
              className="video-preview-thumbnail"
              onError={(e) => {
                e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"%3E%3Crect width="320" height="180" fill="%23e0e0e0"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="%23666"%3ENo Thumbnail%3C/text%3E%3C/svg%3E'
              }}
            />
            <div className="video-preview-info">
              <h4>{video.Name}</h4>
              <p className="video-id">ID: {video.Id || video.id}</p>
              <div className="video-metadata">
                <div className="metadata-row-three">
                  <div className="metadata-item">
                    <span className="metadata-value">{formatDuration(video.Duration)}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-value">{formatResolution(video.Resolution)}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-value">{formatFps(video.Fps)}</span>
                  </div>
                </div>
                <div className="metadata-row-three">
                  <div className="metadata-item">
                    <span className="metadata-value">{formatFileSize(video.Size)}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-value">{video.UploadedBy || 'N/A'}</span>
                  </div>
                  <div className="metadata-item">
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

              {selectedTasks.length > 0 && (
                <div className="inline-search-section">
                  <div className="inline-search-header">
                    <h3>{selectedTasks.length === 1 ? 'Search Embeddings' : `Compare Embeddings (${selectedTasks.length} tasks)`}</h3>
                    <button 
                      className="btn-clear-selection"
                      onClick={() => {
                        setSelectedTasks([])
                        setCompareResults({})
                        setCompareSearchText('')
                        setCompareError(null)
                      }}
                      title="Clear selection"
                    >
                      Clear Selection
                    </button>
                  </div>

                  <div className="inline-video-container">
                    <video 
                      ref={videoPlayerRef}
                      src={video.video_url || `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`}
                      controls
                      muted
                      className="inline-video-player"
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>

                  <div className="search-controls-inline">
                    <input
                      type="text"
                      className="search-text-input"
                      placeholder="Enter search query..."
                      value={compareSearchText}
                      onChange={(e) => setCompareSearchText(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleCompareSearch()}
                      disabled={compareLoading}
                    />
                    <input
                      type="number"
                      className="search-topk-input"
                      placeholder="Top K"
                      min="1"
                      max="100"
                      value={compareTopK}
                      onChange={(e) => setCompareTopK(e.target.value)}
                      disabled={compareLoading}
                      title="Number of results to return (1-100)"
                    />
                    <button 
                      className="btn-search"
                      onClick={handleCompareSearch}
                      disabled={compareLoading || !compareSearchText.trim()}
                    >
                      {compareLoading ? 'Searching...' : (selectedTasks.length === 1 ? 'Search' : 'Search All')}
                    </button>
                  </div>
                  
                  {compareError && (
                    <div className="alert alert-error">{compareError}</div>
                  )}
                  
                  <div className="inline-results-container">
                    <div className="inline-results-grid">
                      {selectedTasks.map((task) => {
                        const hasResults = compareResults[task.Id]
                        const resultData = hasResults ? compareResults[task.Id] : null
                        
                        return (
                          <div key={task.Id} className="inline-result-column">
                            <div className="inline-result-header">
                              <h4>
                                {task.Type === 'nova-mme' ? 'Nova MME' : 'TwelveLabs'}
                              </h4>
                              <div className="inline-model-id">{task.ModelId}</div>
                              {resultData && resultData.results.length > 0 && (
                                <span className="inline-result-count">{resultData.results.length} results</span>
                              )}
                            </div>
                            
                            {!hasResults ? (
                              <div className="no-results-message">Waiting for search...</div>
                            ) : resultData.error ? (
                              <div className="alert alert-error">{resultData.error}</div>
                            ) : resultData.results.length > 0 ? (
                              <div className="results-list-inline">
                                {resultData.results.map((result, index) => (
                                  <div key={index} className="result-item-compact">
                                    <span className="result-rank">#{index + 1}</span>
                                    <button 
                                      className="time-range-link"
                                      onClick={() => handleTimeRangeClick(result.StartSec, result.EndSec)}
                                      title="Click to navigate video to this timestamp"
                                    >
                                      {parseFloat(result.StartSec || 0).toFixed(2)}s-{parseFloat(result.EndSec || 0).toFixed(2)}s
                                    </button>
                                    <span className="result-distance">Dist: {result.Distance?.toFixed(4) || 'N/A'}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="no-results-message">No results found</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

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
    </div>
  )
}

export default AnalyzeView
