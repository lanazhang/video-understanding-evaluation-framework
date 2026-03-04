import { useState, useEffect, useRef } from 'react'
import { modelGroups } from '../../static/modelConfig'
import { FetchPost } from '../../utils/apiHelper'
import refreshIcon from '../../assets/icons/refresh.svg'
import './VideoUnderstandingForm.css'

// Helper function to parse duration string to minutes
const parseDurationToMinutes = (durationStr) => {
  if (!durationStr) return 0
  
  // Convert to string if it's a number
  const str = String(durationStr)
  
  // Handle formats like "00:01:30", "01:30", "90s", "1.5m", etc.
  const parts = str.split(':')
  
  if (parts.length === 3) {
    // HH:MM:SS
    const hours = parseInt(parts[0], 10) || 0
    const minutes = parseInt(parts[1], 10) || 0
    const seconds = parseInt(parts[2], 10) || 0
    return hours * 60 + minutes + seconds / 60
  } else if (parts.length === 2) {
    // MM:SS
    const minutes = parseInt(parts[0], 10) || 0
    const seconds = parseInt(parts[1], 10) || 0
    return minutes + seconds / 60
  }
  
  // Try to parse as seconds with 's' suffix
  const secondsMatch = str.match(/^(\d+(?:\.\d+)?)s?$/i)
  if (secondsMatch) {
    return parseFloat(secondsMatch[1]) / 60
  }
  
  // Try to parse as minutes with 'm' suffix
  const minutesMatch = str.match(/^(\d+(?:\.\d+)?)m$/i)
  if (minutesMatch) {
    return parseFloat(minutesMatch[1])
  }
  
  return 0
}

// Helper function to parse size string to GB
const parseSizeToGB = (sizeStr) => {
  if (!sizeStr) return 0
  
  // Convert to string if it's a number
  const str = String(sizeStr)
  
  // Handle formats like "1.5 GB", "500 MB", "1500000 KB", etc.
  const match = str.match(/^(\d+(?:\.\d+)?)\s*(GB|MB|KB|B)?$/i)
  if (!match) return 0
  
  const value = parseFloat(match[1])
  const unit = (match[2] || 'B').toUpperCase()
  
  switch (unit) {
    case 'GB':
      return value
    case 'MB':
      return value / 1024
    case 'KB':
      return value / (1024 * 1024)
    case 'B':
      return value / (1024 * 1024 * 1024)
    default:
      return 0
  }
}

function VideoUnderstandingForm({ video, onSuccess }) {
  const [selectedModel, setSelectedModel] = useState('')
  const [taskName, setTaskName] = useState('')
  const [inputPrompt, setInputPrompt] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(10000)
  const [topP, setTopP] = useState(0.9)
  const [useToolConfig, setUseToolConfig] = useState(true)
  const [toolConfigExpanded, setToolConfigExpanded] = useState(false)
  const [inferenceConfigExpanded, setInferenceConfigExpanded] = useState(false)
  const [editableToolConfig, setEditableToolConfig] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Gemini API key state
  const [hasGeminiKey, setHasGeminiKey] = useState(false)
  const [checkingGeminiKey, setCheckingGeminiKey] = useState(false)
  
  // Video Understanding Tasks state
  const [videoUnderstandingTasks, setVideoUnderstandingTasks] = useState([])
  const [loadingVUTasks, setLoadingVUTasks] = useState(false)
  const [vuTasksError, setVuTasksError] = useState(null)
  const [expandedVUTaskId, setExpandedVUTaskId] = useState(null)
  const [reviewTask, setReviewTask] = useState(null)
  const [taskNameFilter, setTaskNameFilter] = useState('')
  const [activeTab, setActiveTab] = useState('formatted') // 'formatted' or 'raw'
  
  const tasksSectionRef = useRef(null)
  const reviewVideoRef = useRef(null)

  // Get Video Understanding models from modelConfig
  const videoUnderstandingGroup = modelGroups.find(
    group => group.groupName === 'Video Understanding'
  )
  const models = videoUnderstandingGroup?.models || []

  // Get selected model config
  const selectedModelConfig = models.find(m => m.modelId === selectedModel)
  
  // Check if video exceeds model limits
  const checkVideoExceedsLimits = () => {
    if (!selectedModelConfig || !video) return false
    
    const maxDurationMinutes = selectedModelConfig.maxDurationMinutes
    const maxSizeGB = selectedModelConfig.maxSizeGB
    
    if (maxDurationMinutes) {
      const videoDurationMinutes = parseDurationToMinutes(video.Duration || video.duration)
      if (videoDurationMinutes > maxDurationMinutes) {
        return true
      }
    }
    
    if (maxSizeGB) {
      const videoSizeGB = parseSizeToGB(video.Size || video.size)
      if (videoSizeGB > maxSizeGB) {
        return true
      }
    }
    
    return false
  }
  
  const videoExceedsLimits = checkVideoExceedsLimits()
  
  // Helper function to get model display name
  const getModelDisplayName = (modelId) => {
    const model = models.find(m => m.modelId === modelId)
    return model?.displayName || modelId
  }
  
  // Helper function to calculate cost for a task
  const calculateTaskCost = (task) => {
      if (!task || task.Status !== 'completed' || !task.Result) return null

      const modelConfig = models.find(m => m.modelId === task.ModelId)
      if (!modelConfig || !modelConfig.pricing) return null

      const pricing = modelConfig.pricing
      const metadata = task.Result.ResponseMetadata || task.Result.Metadata || {}

      let totalCost = 0
      let costBreakdown = []

      // Calculate token-based costs (for Nova and other Bedrock models)
      if (pricing.inputTokensPer1M && metadata.inputTokens) {
        const inputCost = (metadata.inputTokens / 1000000) * pricing.inputTokensPer1M
        totalCost += inputCost
        costBreakdown.push(`Input: ${inputCost.toFixed(2)} (${metadata.inputTokens.toLocaleString()} tokens @ ${pricing.inputTokensPer1M.toFixed(2)}/1M)`)
      }

      if (pricing.outputTokensPer1M) {
        let outputTokens = metadata.outputTokens

        // If output tokens not in metadata, estimate from response size
        if (!outputTokens && task.Result.Response) {
          const responseStr = typeof task.Result.Response === 'string' 
            ? task.Result.Response 
            : JSON.stringify(task.Result.Response)
          // Rough estimate: 1 token ≈ 4 characters for English text
          outputTokens = Math.ceil(responseStr.length / 4)
        }

        if (outputTokens) {
          const outputCost = (outputTokens / 1000000) * pricing.outputTokensPer1M
          totalCost += outputCost
          const tokenLabel = metadata.outputTokens ? 'tokens' : 'tokens (estimated)'
          costBreakdown.push(`Output: ${outputCost.toFixed(2)} (${outputTokens.toLocaleString()} ${tokenLabel} @ ${pricing.outputTokensPer1M.toFixed(2)}/1M)`)
        }
      }

      // Calculate video duration-based costs (for TwelveLabs Pegasus)
      if (pricing.perSecondVideo && video) {
        const videoDurationMinutes = parseDurationToMinutes(video.Duration || video.duration)
        const videoDurationSeconds = videoDurationMinutes * 60
        const videoCost = videoDurationSeconds * pricing.perSecondVideo
        totalCost += videoCost
        costBreakdown.push(`Video: ${videoCost.toFixed(2)} (${videoDurationSeconds.toFixed(0)}s @ ${pricing.perSecondVideo.toFixed(5)}/sec)`)
      }

      if (totalCost === 0) return null

      return {
        total: totalCost,
        breakdown: costBreakdown
      }
    }

  // Set default model if not selected
  useEffect(() => {
    if (!selectedModel && models.length > 0) {
      setSelectedModel(models[0].modelId)
    }
  }, [selectedModel, models])
  
  // Check for Gemini API key on mount
  useEffect(() => {
    checkGeminiApiKey()
  }, [])
  
  const checkGeminiApiKey = async () => {
    setCheckingGeminiKey(true)
    try {
      const data = await FetchPost('/utils/manage-api-key', {
        operation: 'check'
      }, 'EvalService')
      
      setHasGeminiKey(data.hasKey || false)
    } catch (err) {
      console.error('Error checking Gemini API key:', err)
      setHasGeminiKey(false)
    } finally {
      setCheckingGeminiKey(false)
    }
  }
  
  // Generate default task name based on model
  const generateDefaultTaskName = () => {
    if (selectedModel) {
      return `video-understanding-${selectedModel}`
    }
    return ''
  }
  
  // Set default task name when model changes
  useEffect(() => {
    if (selectedModel) {
      setTaskName(generateDefaultTaskName())
      
      // Update editable tool config when model changes
      if (selectedModelConfig) {
        let toolConfig = null
        
        // Check for different config types
        if (selectedModelConfig.toolConfig) {
          toolConfig = selectedModelConfig.toolConfig
        } else if (selectedModelConfig.responseSchema) {
          toolConfig = selectedModelConfig.responseSchema
        } else if (selectedModelConfig.responseFormat) {
          toolConfig = selectedModelConfig.responseFormat
        }
        
        if (toolConfig) {
          setEditableToolConfig(JSON.stringify(toolConfig, null, 2))
          console.log('Tool config available for model:', selectedModel, toolConfig)
        } else {
          setEditableToolConfig('')
          console.log('No tool config for model:', selectedModel, 'selectedModelConfig:', selectedModelConfig)
        }
      }
    }
  }, [selectedModel, selectedModelConfig])
  
  // Load video understanding tasks on mount
  useEffect(() => {
    if (video && (video.Id || video.id)) {
      loadVideoUnderstandingTasks()
    }
  }, [video])
  
  const loadVideoUnderstandingTasks = async () => {
    const videoId = video.Id || video.id
    
    if (!videoId) {
      console.error('No video ID available')
      return
    }
    
    setLoadingVUTasks(true)
    setVuTasksError(null)
    try {
      const data = await FetchPost('/analyze/get-analyze-tasks', { VideoId: videoId }, 'EvalService')
      
      let responseBody
      if (data.statusCode) {
        if (data.statusCode === 200) {
          responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        } else {
          const errorMessage = typeof data.body === 'object' && data.body.error 
            ? data.body.error 
            : (typeof data.body === 'string' ? JSON.parse(data.body).error : data.body)
          setVuTasksError(errorMessage || 'Failed to load video understanding tasks')
          return
        }
      } else {
        responseBody = data
      }
      
      const allTasks = responseBody.Tasks || []
      const vuTasks = allTasks.filter(t => t.Type === 'video-understanding')
      setVideoUnderstandingTasks(vuTasks)
    } catch (err) {
      console.error('Error loading video understanding tasks:', err)
      setVuTasksError('Failed to load video understanding tasks')
    } finally {
      setLoadingVUTasks(false)
    }
  }
  
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    
    // Handle both ISO 8601 strings and Unix timestamps
    let date
    if (typeof timestamp === 'string') {
      // ISO 8601 string
      date = new Date(timestamp)
    } else {
      // Unix timestamp (seconds)
      date = new Date(timestamp * 1000)
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid Date'
    }
    
    return date.toLocaleString()
  }
  
  const handleDeleteVUTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return
    }
    
    try {
      const data = await FetchPost('/analyze/delete-analyze-task', { TaskId: taskId }, 'EvalService')
      
      if (data.statusCode === 200 || data.message === 'Task deleted successfully') {
        await loadVideoUnderstandingTasks()
      } else {
        alert('Failed to delete task')
      }
    } catch (err) {
      console.error('Error deleting task:', err)
      alert('Failed to delete task: ' + err.message)
    }
  }
  
  // Parse timestamp to seconds
  const parseTimeToSeconds = (timeStr) => {
    if (typeof timeStr === 'number') return timeStr
    
    if (typeof timeStr !== 'string') return 0
    
    // Handle decimal string format like "0.000", "5.100", "27.89"
    const decimalMatch = timeStr.match(/^(\d+\.?\d*)$/)
    if (decimalMatch) {
      return parseFloat(decimalMatch[1])
    }
    
    // Handle formats like "00:00", "01:30", "02:15:30"
    const parts = timeStr.split(':').map(p => parseInt(p, 10))
    
    if (parts.length === 2) {
      // MM:SS
      return parts[0] * 60 + parts[1]
    } else if (parts.length === 3) {
      // HH:MM:SS
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }
    
    // Try to parse as number with 's' suffix
    const numMatch = timeStr.match(/^(\d+\.?\d*)s$/)
    if (numMatch) {
      return parseFloat(numMatch[1])
    }
    
    return 0
  }
  
  // Handle scene/moment click to play video segment
  const handleSceneClick = (startTime, endTime) => {
    if (!reviewVideoRef.current) return
    
    const video = reviewVideoRef.current
    const startSeconds = parseTimeToSeconds(startTime)
    const endSeconds = parseTimeToSeconds(endTime)
    
    // Remove any existing listeners
    const oldTimeUpdateListener = video._sceneTimeUpdateListener
    const oldSeekedListener = video._sceneSeekedListener
    if (oldTimeUpdateListener) {
      video.removeEventListener('timeupdate', oldTimeUpdateListener)
    }
    if (oldSeekedListener) {
      video.removeEventListener('seeked', oldSeekedListener)
    }
    
    // Pause the video first
    video.pause()
    
    // Set up listener to pause at end time
    const handleTimeUpdate = () => {
      if (video.currentTime >= endSeconds) {
        video.pause()
        video.removeEventListener('timeupdate', handleTimeUpdate)
        video._sceneTimeUpdateListener = null
      }
    }
    
    // Set up listener to play after seek completes
    const handleSeeked = () => {
      video.removeEventListener('seeked', handleSeeked)
      video._sceneSeekedListener = null
      
      video.play().catch(err => {
        console.error('Play error:', err)
      })
    }
    
    video.addEventListener('timeupdate', handleTimeUpdate)
    video._sceneTimeUpdateListener = handleTimeUpdate
    
    video.addEventListener('seeked', handleSeeked)
    video._sceneSeekedListener = handleSeeked
    
    // Set the current time to trigger seek
    video.currentTime = startSeconds
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!inputPrompt.trim()) {
      setError('Please enter a prompt')
      return
    }

    if (!selectedModel) {
      setError('Please select a model')
      return
    }
    
    if (!taskName.trim()) {
      setError('Please enter a task name')
      return
    }
    
    // Check if Gemini API key is required
    if (selectedModelConfig && selectedModelConfig.apiType === 'gemini' && !hasGeminiKey) {
      setError('Gemini API key is required for this model. Please go to Settings to add your Gemini API key.')
      return
    }
    
    // Validate video duration and size against model limits
    if (selectedModelConfig) {
      const maxDurationMinutes = selectedModelConfig.maxDurationMinutes
      const maxSizeGB = selectedModelConfig.maxSizeGB
      
      if (maxDurationMinutes) {
        const videoDurationMinutes = parseDurationToMinutes(video.Duration || video.duration)
        if (videoDurationMinutes > maxDurationMinutes) {
          setError(`Video duration (${Math.round(videoDurationMinutes)} minutes) exceeds the model limit of ${maxDurationMinutes} minutes. Please select a shorter video or a different model.`)
          return
        }
      }
      
      if (maxSizeGB) {
        const videoSizeGB = parseSizeToGB(video.Size || video.size)
        if (videoSizeGB > maxSizeGB) {
          setError(`Video size (${videoSizeGB.toFixed(2)} GB) exceeds the model limit of ${maxSizeGB} GB. Please select a smaller video or a different model.`)
          return
        }
      }
    }

    setLoading(true)
    setError(null)

    try {
      const selectedModelConfig = models.find(m => m.modelId === selectedModel)
      
      if (!selectedModelConfig) {
        setError('Selected model configuration not found')
        setLoading(false)
        return
      }

      // Build the payload for the unified start-video-understanding endpoint
      const payload = {
        VideoId: video.Id || video.id,
        ModelId: selectedModel,
        Description: taskName,
        Request: {
          ApiType: selectedModelConfig.apiType,
          Prompt: inputPrompt,
          InferenceConfig: {
            temperature: temperature,
            maxTokens: maxTokens,
            topP: topP
          },
          RequestedBy: 'web-ui'
        }
      }
      
      // Add tool config for Bedrock Converse if toggle is on
      if (selectedModelConfig.apiType === 'bedrock_converse' && useToolConfig && editableToolConfig) {
        try {
          payload.Request.ToolConfig = JSON.parse(editableToolConfig)
        } catch (e) {
          setError('Invalid JSON in Tool Configuration. Please check the syntax.')
          setLoading(false)
          return
        }
      }
      
      // Add response schema for Gemini if toggle is on
      if (selectedModelConfig.apiType === 'gemini' && useToolConfig && editableToolConfig) {
        try {
          const parsedConfig = JSON.parse(editableToolConfig)
          // Extract responseSchema if it's wrapped in toolConfig
          payload.Request.ResponseSchema = parsedConfig.responseSchema || parsedConfig
        } catch (e) {
          setError('Invalid JSON in Tool Configuration. Please check the syntax.')
          setLoading(false)
          return
        }
      }
      
      // Add tool config (with responseFormat) for TwelveLabs Pegasus if toggle is on
      if (selectedModelConfig.apiType === 'tlabs_pegasus' && useToolConfig && editableToolConfig) {
        try {
          payload.Request.ToolConfig = JSON.parse(editableToolConfig)
        } catch (e) {
          setError('Invalid JSON in Tool Configuration. Please check the syntax.')
          setLoading(false)
          return
        }
      }
      
      // Note: For Gemini, the API key is automatically retrieved from Secrets Manager by the Lambda
      // No need to send it from the UI

      // Use the API endpoint from model config
      const apiEndpoint = selectedModelConfig.api
      
      console.log(`Calling ${apiEndpoint} with model ${selectedModel}`)
      console.log('Payload:', payload)
      
      const data = await FetchPost(apiEndpoint, payload, 'EvalService')
      
      console.log('API Response:', data)
      
      // Handle Lambda proxy response format
      // The new endpoint returns 202 Accepted for async processing
      if (data.statusCode !== undefined) {
        if (data.statusCode === 200 || data.statusCode === 202) {
          const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
          // Task submitted successfully - don't show response, user should refresh task list
          setError(null)
          
          // Reload tasks and scroll to top
          await loadVideoUnderstandingTasks()
          if (tasksSectionRef.current) {
            tasksSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          
          if (onSuccess) {
            onSuccess(responseBody)
          }
        } else {
          const errorBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
          setError(errorBody.error || errorBody.message || 'Failed to process video understanding request')
        }
      } else if (data.message && (data.message.toLowerCase().includes('timed out') || data.message.toLowerCase().includes('timeout'))) {
        setError('Request timed out. The video analysis is taking longer than expected. Please try with a shorter video or simpler prompt.')
      } else if (data.error) {
        setError(data.error || 'Failed to process video understanding request')
      } else if (data.message) {
        if (data.message.toLowerCase().includes('error') || data.message.toLowerCase().includes('failed')) {
          setError(data.message)
        } else {
          // Don't show response section
          setError(null)
          
          // Reload tasks and scroll to top
          await loadVideoUnderstandingTasks()
          if (tasksSectionRef.current) {
            tasksSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          
          if (onSuccess) {
            onSuccess(data)
          }
        }
      } else {
        // Don't show response section
        setError(null)
        
        // Reload tasks and scroll to top
        await loadVideoUnderstandingTasks()
        if (tasksSectionRef.current) {
          tasksSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        
        if (onSuccess) {
          onSuccess(data)
        }
      }
    } catch (err) {
      console.error('Error processing video understanding:', err)
      setError('Failed to process request: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setError(null)
    setTaskName(generateDefaultTaskName())
  }

  return (
    <div className="video-understanding-form">
      {/* Video Understanding Tasks Section */}
      <div className="tasks-section" ref={tasksSectionRef}>
        <div className="tasks-header">
          <h3 className="tasks-title">Video Understanding Tasks</h3>
          <button 
            className="btn-refresh" 
            onClick={loadVideoUnderstandingTasks}
            disabled={loadingVUTasks}
            title="Refresh task list"
          >
            <img src={refreshIcon} alt="Refresh" />
          </button>
        </div>
        
        {vuTasksError && (
          <div className="alert alert-error">{vuTasksError}</div>
        )}
        
        {videoUnderstandingTasks.length > 0 && (
          <div className="task-list__filter">
            <input
              type="text"
              className="task-list__filter-input"
              placeholder="Filter by task name, model, or API type..."
              value={taskNameFilter}
              onChange={(e) => setTaskNameFilter(e.target.value)}
            />
            {taskNameFilter && (
              <button
                className="task-list__filter-clear"
                onClick={() => setTaskNameFilter('')}
                title="Clear filter"
              >
                ✕
              </button>
            )}
          </div>
        )}
        
        {loadingVUTasks ? (
          <div className="tasks-loading">Loading tasks...</div>
        ) : videoUnderstandingTasks.length > 0 ? (
          <div className="tasks-list">
            {videoUnderstandingTasks
              .filter(task => {
                if (!taskNameFilter) return true
                const filter = taskNameFilter.toLowerCase()
                return (
                  (task.Description || task.TaskName || '').toLowerCase().includes(filter) ||
                  (task.ModelId || '').toLowerCase().includes(filter) ||
                  (task.Request?.ApiType || '').toLowerCase().includes(filter)
                )
              })
              .map((task) => {
                const isExpanded = expandedVUTaskId === task.Id
                
                return (
                  <div key={task.Id} className="task-item">
                    <div className="task-item-header">
                      <div className="task-item-info">
                        <span className={`task-status task-status--${task.Status}`}>{task.Status}</span>
                        <span className="task-item-detail" title={task.Status === 'failed' && (task.Result?.ErrorMessage || task.Result?.Error) ? (task.Result.ErrorMessage || task.Result.Error) : ''}>
                          {task.Description || task.TaskName || task.ModelId || 'N/A'}
                          {task.Status === 'completed' && task.CompletedTs && (() => {
                            const startDate = new Date(task.StartedTs)
                            const endDate = new Date(task.CompletedTs)
                            const diffMs = endDate - startDate
                            
                            if (isNaN(diffMs) || diffMs < 0) return null
                            
                            const diffSeconds = Math.floor(diffMs / 1000)
                            const hours = Math.floor(diffSeconds / 3600)
                            const minutes = Math.floor((diffSeconds % 3600) / 60)
                            const seconds = diffSeconds % 60
                            
                            const parts = []
                            if (hours > 0) parts.push(`${hours}h`)
                            if (minutes > 0) parts.push(`${minutes}m`)
                            if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)
                            
                            const costInfo = calculateTaskCost(task)
                            const costStr = costInfo ? `, $${costInfo.total.toFixed(2)}` : ''
                            
                            return ` (${parts.join(' ')}${costStr})`
                          })()}
                          {task.Status === 'failed' && (task.Result?.ErrorMessage || task.Result?.Error) && (
                            <span className="task-error-indicator" title={task.Result.ErrorMessage || task.Result.Error}>⚠️</span>
                          )}
                        </span>
                      </div>
                      <div className="task-item-actions">
                        {task.Status === 'completed' && (
                          <button 
                            className="btn-review"
                            onClick={() => setReviewTask(task)}
                            title="Review result"
                          >
                            Review
                          </button>
                        )}
                        <button 
                          className="btn-delete"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteVUTask(task.Id)
                          }}
                          title="Delete task"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button 
                          className="btn-expand"
                          onClick={() => setExpandedVUTaskId(isExpanded ? null : task.Id)}
                          title={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          <svg 
                            width="16" 
                            height="16" 
                            viewBox="0 0 16 16" 
                            fill="none" 
                            xmlns="http://www.w3.org/2000/svg"
                            className={`svg-rotate ${isExpanded ? 'svg-rotate--expanded' : ''}`}
                          >
                            <path 
                              d="M4 6L8 10L12 6" 
                              stroke="currentColor" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="task-details">
                        <div className="task-details-grid">
                          <div className="task-detail-row">
                            <span className="task-detail-label">Task ID:</span>
                            <span className="task-detail-value">{task.Id}</span>
                          </div>
                          <div className="task-detail-row">
                            <span className="task-detail-label">Name:</span>
                            <span className="task-detail-value">{task.Description || task.TaskName || 'N/A'}</span>
                          </div>
                          <div className="task-detail-row">
                            <span className="task-detail-label">Model:</span>
                            <span className="task-detail-value">{getModelDisplayName(task.ModelId)}</span>
                          </div>
                          <div className="task-detail-row">
                            <span className="task-detail-label">Created:</span>
                            <span className="task-detail-value">{formatDate(task.StartedTs)}</span>
                          </div>
                          {task.CompletedTs && (
                            <div className="task-detail-row">
                              <span className="task-detail-label">Completed:</span>
                              <span className="task-detail-value">{formatDate(task.CompletedTs)}</span>
                            </div>
                          )}
                          {task.Status === 'failed' && (task.Result?.ErrorMessage || task.Result?.Error) && (
                            <div className="task-detail-row task-detail-row--full task-detail-row--error">
                              <span className="task-detail-label">Error:</span>
                              <span className="task-detail-value task-detail-value--error">{task.Result.ErrorMessage || task.Result.Error}</span>
                            </div>
                          )}
                          <div className="task-detail-row task-detail-row--full">
                            <span className="task-detail-label">Prompt:</span>
                            <span className="task-detail-value">{task.Request?.Prompt || task.Request?.InputPrompt || 'N/A'}</span>
                          </div>
                          {task.CompletedTs && (
                            <div className="task-detail-row">
                              <span className="task-detail-label">Processing Time:</span>
                              <span className="task-detail-value">
                                {(() => {
                                  const startDate = new Date(task.StartedTs)
                                  const endDate = new Date(task.CompletedTs)
                                  const diffMs = endDate - startDate
                                  
                                  if (isNaN(diffMs) || diffMs < 0) return 'N/A'
                                  
                                  const diffSeconds = Math.floor(diffMs / 1000)
                                  const hours = Math.floor(diffSeconds / 3600)
                                  const minutes = Math.floor((diffSeconds % 3600) / 60)
                                  const seconds = diffSeconds % 60
                                  
                                  const parts = []
                                  if (hours > 0) parts.push(`${hours}h`)
                                  if (minutes > 0) parts.push(`${minutes}m`)
                                  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)
                                  
                                  return parts.join(' ')
                                })()}
                              </span>
                            </div>
                          )}
                          {(() => {
                            const costInfo = calculateTaskCost(task)
                            if (!costInfo) return null
                            
                            return (
                              <div className="task-detail-row">
                                <span className="task-detail-label">Estimated Cost:</span>
                                <span className="task-detail-value task-detail-value--cost" title={costInfo.breakdown.join('\n')}>
                                  ${costInfo.total.toFixed(2)}
                                </span>
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        ) : (
          <div className="tasks-empty">
            No video understanding tasks found for this video.
          </div>
        )}
      </div>
      
      {/* Create New Task Form */}
      <div className="form-section">
        <h3>
          Create New Video Understanding Task
          {selectedModelConfig?.pricing && (
            <div className="pricing-tooltip-container">
              <button 
                type="button"
                className="btn-pricing-info"
                title="View model information"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 7.5V11.5M8 5V5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Model Information
              </button>
              <div className="pricing-tooltip">
                <div className="pricing-tooltip-header">
                  {selectedModelConfig.displayName}
                </div>
                <div className="pricing-tooltip-body">
                  {(selectedModelConfig.maxDurationMinutes || selectedModelConfig.maxSizeGB || selectedModelConfig.maxPromptTokens || selectedModelConfig.maxOutputTokens) && (
                    <>
                      <div className="pricing-tooltip-section-title">Model Limits</div>
                      {selectedModelConfig.maxDurationMinutes && (
                        <div className="pricing-tooltip-row">
                          <span className="pricing-tooltip-label">Max Duration:</span>
                          <span className="pricing-tooltip-value">
                            {selectedModelConfig.maxDurationMinutes} min
                            {video && (video.Duration || video.duration) && (
                              <span className={`pricing-tooltip-video-stat ${parseDurationToMinutes(video.Duration || video.duration) > selectedModelConfig.maxDurationMinutes ? 'pricing-tooltip-video-stat--warning' : ''}`}>
                                {' '}(Video: {Math.round(parseDurationToMinutes(video.Duration || video.duration))} min)
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                      {selectedModelConfig.maxSizeGB && (
                        <div className="pricing-tooltip-row">
                          <span className="pricing-tooltip-label">Max Size:</span>
                          <span className="pricing-tooltip-value">
                            {selectedModelConfig.maxSizeGB} GB
                            {video && (video.Size || video.size) && (
                              <span className={`pricing-tooltip-video-stat ${parseSizeToGB(video.Size || video.size) > selectedModelConfig.maxSizeGB ? 'pricing-tooltip-video-stat--warning' : ''}`}>
                                {' '}(Video: {parseSizeToGB(video.Size || video.size).toFixed(2)} GB)
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                      {selectedModelConfig.maxPromptTokens && (
                        <div className="pricing-tooltip-row">
                          <span className="pricing-tooltip-label">Max Prompt:</span>
                          <span className="pricing-tooltip-value">{selectedModelConfig.maxPromptTokens.toLocaleString()} tokens</span>
                        </div>
                      )}
                      {selectedModelConfig.maxOutputTokens && (
                        <div className="pricing-tooltip-row">
                          <span className="pricing-tooltip-label">Max Output:</span>
                          <span className="pricing-tooltip-value">{selectedModelConfig.maxOutputTokens.toLocaleString()} tokens</span>
                        </div>
                      )}
                      <div className="pricing-tooltip-divider"></div>
                    </>
                  )}
                  
                  <div className="pricing-tooltip-section-title">
                    Pricing
                    {selectedModelConfig.pricing.url && (
                      <a 
                        href={selectedModelConfig.pricing.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="pricing-tooltip-link"
                        title="View pricing documentation"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M8.5 1.5H3.5C2.94772 1.5 2.5 1.94772 2.5 2.5V13.5C2.5 14.0523 2.94772 14.5 3.5 14.5H12.5C13.0523 14.5 13.5 14.0523 13.5 13.5V6.5M10.5 1.5H14.5M14.5 1.5V5.5M14.5 1.5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </a>
                    )}
                  </div>
                  {selectedModelConfig.pricing.inputTokensPer1M && (
                    <div className="pricing-tooltip-row">
                      <span className="pricing-tooltip-label">Input:</span>
                      <span className="pricing-tooltip-value">${selectedModelConfig.pricing.inputTokensPer1M.toFixed(2)}/1M tokens</span>
                    </div>
                  )}
                  {selectedModelConfig.pricing.inputTokensPer1MAudio && (
                    <div className="pricing-tooltip-row">
                      <span className="pricing-tooltip-label">Input (Audio):</span>
                      <span className="pricing-tooltip-value">${selectedModelConfig.pricing.inputTokensPer1MAudio.toFixed(2)}/1M tokens</span>
                    </div>
                  )}
                  {selectedModelConfig.pricing.outputTokensPer1M && (
                    <div className="pricing-tooltip-row">
                      <span className="pricing-tooltip-label">Output:</span>
                      <span className="pricing-tooltip-value">${selectedModelConfig.pricing.outputTokensPer1M.toFixed(2)}/1M tokens</span>
                    </div>
                  )}
                  {selectedModelConfig.pricing.perSecondVideo && (
                    <div className="pricing-tooltip-row">
                      <span className="pricing-tooltip-label">Video:</span>
                      <span className="pricing-tooltip-value">${selectedModelConfig.pricing.perSecondVideo.toFixed(5)}/sec</span>
                    </div>
                  )}
                  
                  {selectedModelConfig.pricing.notes && (
                    <div className="pricing-tooltip-notes">
                      {selectedModelConfig.pricing.notes}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="model-select">Model</label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={loading}
              className="model-dropdown"
            >
              {models.map((model) => (
                <option key={model.modelId || model.displayName} value={model.modelId}>
                  {model.displayName} ({model.modelId})
                </option>
              ))}
            </select>
            
            
            {/* Show warning if Gemini model is selected but no API key is configured */}
            {selectedModelConfig && selectedModelConfig.apiType === 'gemini' && !hasGeminiKey && (
              <div className="alert alert-warning">
                <strong>⚠️ Gemini API Key Required</strong>
                <p>
                  This model requires a Gemini API key. Please go to <a href="/settings">Settings</a> to add your API key before creating a task.
                </p>
              </div>
            )}
          </div>
          
          <div className="form-group">
            <label htmlFor="task-name">Task Name</label>
            <input
              id="task-name"
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="video-understanding-model-id"
              disabled={loading}
              className="task-name-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="input-prompt">Input Prompt</label>
            <textarea
              id="input-prompt"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Tell me about this video..."
              disabled={loading}
              rows={4}
              className="prompt-input"
            />
          </div>
          
          <div className="form-group">
            <div className="toggle-container">
              <span className="toggle-text">Use Structured Output (JSON Schema)</span>
              <button
                type="button"
                className={`toggle-button ${useToolConfig ? 'toggle-button--active' : ''}`}
                onClick={() => {
                  setUseToolConfig(!useToolConfig)
                  console.log('Toggle changed:', !useToolConfig, 'Model config:', selectedModelConfig)
                }}
                disabled={loading}
                aria-label="Toggle structured output"
              >
                <span className="toggle-slider"></span>
              </button>
            </div>
            {useToolConfig && !(selectedModelConfig?.toolConfig || selectedModelConfig?.responseSchema || selectedModelConfig?.responseFormat) && (
              <div className="alert alert-info">
                The selected model ({selectedModel}) does not have a predefined tool configuration schema.
              </div>
            )}

            {(() => {
              const hasToolConfig = selectedModelConfig?.toolConfig || selectedModelConfig?.responseSchema || selectedModelConfig?.responseFormat
              console.log('Rendering tool config section:', {
                useToolConfig,
                hasToolConfig,
                selectedModel,
                selectedModelConfig
              })
              return useToolConfig && hasToolConfig
            })() && (
              <div className="tool-config-section">
                <div className="tool-config-header" onClick={() => setToolConfigExpanded(!toolConfigExpanded)}>
                  <label>Tool Configuration (JSON Schema)</label>
                  <button 
                    type="button"
                    className="tool-config-toggle"
                    aria-label={toolConfigExpanded ? 'Collapse' : 'Expand'}
                  >
                    <svg 
                      width="16" 
                      height="16" 
                      viewBox="0 0 16 16" 
                      fill="none" 
                      xmlns="http://www.w3.org/2000/svg"
                      className={`svg-rotate ${toolConfigExpanded ? 'svg-rotate--expanded' : ''}`}
                    >
                      <path 
                        d="M4 6L8 10L12 6" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
                {toolConfigExpanded && (
                  <textarea
                    className="tool-config-textarea"
                    value={editableToolConfig}
                    onChange={(e) => setEditableToolConfig(e.target.value)}
                    disabled={loading}
                    rows={15}
                    placeholder="Enter JSON schema..."
                  />
                )}
              </div>
            )}          </div>


          
          <div className="inference-config-section">
            <div className="inference-config-header" onClick={() => setInferenceConfigExpanded(!inferenceConfigExpanded)}>
              <label>Inference Configuration</label>
              <button 
                type="button"
                className="inference-config-toggle"
                aria-label={inferenceConfigExpanded ? 'Collapse' : 'Expand'}
              >
                <svg 
                  width="16" 
                  height="16" 
                  viewBox="0 0 16 16" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                  className={`svg-rotate ${inferenceConfigExpanded ? 'svg-rotate--expanded' : ''}`}
                >
                  <path 
                    d="M4 6L8 10L12 6" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            {inferenceConfigExpanded && (
              <div className="inference-config-content">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="temperature">Temperature</label>
                    <input
                      id="temperature"
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      disabled={loading}
                      className="param-input"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="max-tokens">Max Tokens</label>
                    <input
                      id="max-tokens"
                      type="number"
                      min="1"
                      max="8192"
                      step="1"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                      disabled={loading}
                      className="param-input"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="top-p">Top P</label>
                    <input
                      id="top-p"
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={topP}
                      onChange={(e) => setTopP(parseFloat(e.target.value))}
                      disabled={loading}
                      className="param-input"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="form-actions">
            <button
              type="submit"
              disabled={
                loading || 
                !inputPrompt.trim() || 
                !taskName.trim() || 
                videoExceedsLimits ||
                (selectedModelConfig?.apiType === 'gemini' && !hasGeminiKey)
              }
              className="btn-submit"
              title={
                videoExceedsLimits 
                  ? 'Video exceeds model limits' 
                  : (selectedModelConfig?.apiType === 'gemini' && !hasGeminiKey)
                    ? 'Gemini API key required - go to Settings to add your key'
                    : ''
              }
            >
              {loading ? 'Processing...' : 'Start Task'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={loading}
              className="btn-clear"
            >
              Clear
            </button>
          </div>
        </form>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}
      </div>
      
      {/* Review Modal */}
      {reviewTask && (
        <div className="review-modal-overlay" onClick={() => setReviewTask(null)}>
          <div className="review-modal" onClick={(e) => e.stopPropagation()}>
            <div className="review-modal-header">
              <h3>Analysis Result</h3>
              <button className="btn-close" onClick={() => setReviewTask(null)}>✕</button>
            </div>
            <div className="review-modal-body">
              {/* Left: Video Player (60%) */}
              <div className="review-video-section">
                <video
                  ref={reviewVideoRef}
                  controls
                  muted
                  className="review-video-player"
                  src={video.video_url || `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`}
                  poster={video.ThumbnailUri || video.thumbnailUri}
                >
                  Your browser does not support the video tag.
                </video>
                
                {/* All Metadata - Compact Format */}
                <div className="review-metadata-compact">
                  <div className="metadata-row">
                    <div className="metadata-compact-item">
                      <span className="metadata-compact-label">Video:</span>
                      <span className="metadata-compact-value">{video.Name || video.name || 'N/A'}</span>
                    </div>
                    <div className="metadata-compact-item">
                      <span className="metadata-compact-label">Duration:</span>
                      <span className="metadata-compact-value">{video.Duration || video.duration || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="metadata-row">
                    <div className="metadata-compact-item">
                      <span className="metadata-compact-label">Task:</span>
                      <span className="metadata-compact-value">{reviewTask.TaskName || reviewTask.Description || 'N/A'}</span>
                    </div>
                    <div className="metadata-compact-item">
                      <span className="metadata-compact-label">Model:</span>
                      <span className="metadata-compact-value">{reviewTask.ModelId || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="metadata-row metadata-row--full">
                    <div className="metadata-compact-item metadata-compact-item--full">
                      <span className="metadata-compact-label">Prompt:</span>
                      <span className="metadata-compact-value metadata-compact-value--prompt">{reviewTask.Request?.Prompt || reviewTask.Request?.InputPrompt || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Right: Analysis Result (40%) */}
              <div className="review-result-section">
                {/* Tabs */}
                <div className="review-tabs">
                  <button
                    className={`review-tab ${activeTab === 'formatted' ? 'review-tab--active' : ''}`}
                    onClick={() => setActiveTab('formatted')}
                  >
                    Formatted Result
                    {(() => {
                      // Calculate total count for formatted results
                      let content = reviewTask.Result?.Response?.content || reviewTask.Result?.Response?.message || reviewTask.Result?.Response || reviewTask.Result?.message
                      if (typeof content === 'string') {
                        try {
                          const parsed = JSON.parse(content)
                          let count = 0
                          
                          // Direct array
                          if (Array.isArray(parsed)) {
                            count = parsed.length
                          }
                          // TwelveLabs Pegasus format
                          else if (parsed.name === 'video_analysis' && parsed.scenes) {
                            count = parsed.scenes.length
                          }
                          // Gemini format
                          else if (parsed.scenes && Array.isArray(parsed.scenes)) {
                            count = parsed.scenes.length
                          }
                          // Nova format
                          else if (parsed.key_moments && Array.isArray(parsed.key_moments)) {
                            count = parsed.key_moments.length
                          }
                          
                          if (count > 0) {
                            return <span className="result-count"> ({count})</span>
                          }
                        } catch (e) {
                          // Ignore parse errors
                        }
                      }
                      return null
                    })()}
                  </button>
                  <button
                    className={`review-tab ${activeTab === 'raw' ? 'review-tab--active' : ''}`}
                    onClick={() => setActiveTab('raw')}
                  >
                    Raw Response
                  </button>
                </div>
                
                {/* Tab Content */}
                <div className="review-tab-content">
                  {activeTab === 'formatted' ? (
                    <div className="review-formatted">
                      {(() => {
                        let content = reviewTask.Result?.Response?.content || reviewTask.Result?.Response?.message || reviewTask.Result?.Response || reviewTask.Result?.message || 'No content available'
                        
                        // If content is a string, try to parse it
                        if (typeof content === 'string') {
                          try {
                            // Check if content is wrapped in ```json``` code blocks
                            let jsonContent = content
                            const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
                            if (jsonBlockMatch) {
                              jsonContent = jsonBlockMatch[1].trim()
                            }
                            
                            const parsed = JSON.parse(jsonContent)
                            
                            // Check for different response formats
                            
                            // Format 0: Direct array of items (list-style JSON)
                            if (Array.isArray(parsed)) {
                              // Check if array items have timestamp fields
                              const hasTimestamps = parsed.length > 0 && parsed[0].start_time && parsed[0].end_time
                              
                              if (hasTimestamps) {
                                return (
                                  <div className="scenes-list">
                                    {parsed.map((item, index) => (
                                      <div 
                                        key={index} 
                                        className="scene-item scene-item--clickable"
                                        onClick={() => handleSceneClick(item.start_time, item.end_time)}
                                        title="Click to play this segment"
                                      >
                                        <div className="scene-header">
                                          <span className="scene-number">Item {index + 1}</span>
                                          <span className="scene-time">
                                            {item.start_time} - {item.end_time}
                                          </span>
                                        </div>
                                        <div className="scene-description">
                                          {item.description || item.text || JSON.stringify(item)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )
                              } else {
                                // Array without timestamps - display as list
                                return (
                                  <div className="scenes-list">
                                    {parsed.map((item, index) => (
                                      <div key={index} className="scene-item">
                                        <div className="scene-header">
                                          <span className="scene-number">Item {index + 1}</span>
                                        </div>
                                        <div className="scene-description">
                                          {typeof item === 'string' ? item : (item.description || item.text || JSON.stringify(item, null, 2))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )
                              }
                            }
                            
                            // Format 1: { name: "video_analysis", scenes: [...] } - TwelveLabs Pegasus
                            if (parsed.name === 'video_analysis' && parsed.scenes && Array.isArray(parsed.scenes)) {
                              return (
                                <div className="scenes-list">
                                  {parsed.scenes.map((scene, index) => (
                                    <div 
                                      key={index} 
                                      className="scene-item scene-item--clickable"
                                      onClick={() => handleSceneClick(scene.start_time, scene.end_time)}
                                      title="Click to play this segment"
                                    >
                                      <div className="scene-header">
                                        <span className="scene-number">Scene {index + 1}</span>
                                        <span className="scene-time">
                                          {scene.start_time} - {scene.end_time}
                                        </span>
                                      </div>
                                      <div className="scene-description">
                                        {scene.description}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )
                            }
                            
                            // Format 2: { summary: "...", scenes: [...] } - Gemini
                            if (parsed.summary || (parsed.scenes && Array.isArray(parsed.scenes))) {
                              return (
                                <div>
                                  {parsed.summary && (
                                    <div className="review-description">
                                      <h4>Summary</h4>
                                      <p>{parsed.summary}</p>
                                    </div>
                                  )}
                                  
                                  {parsed.scenes && Array.isArray(parsed.scenes) && (
                                    <div>
                                      {parsed.summary && <h4>Scenes</h4>}
                                      <div className="scenes-list">
                                        {parsed.scenes.map((scene, index) => (
                                          <div 
                                            key={index} 
                                            className="scene-item scene-item--clickable"
                                            onClick={() => handleSceneClick(scene.start_time, scene.end_time)}
                                            title="Click to play this segment"
                                          >
                                            <div className="scene-header">
                                              <span className="scene-number">Scene {index + 1}</span>
                                              <span className="scene-time">
                                                {scene.start_time} - {scene.end_time}
                                              </span>
                                            </div>
                                            <div className="scene-description">
                                              {scene.description}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            }
                            
                            // Format 3: { description: "...", key_moments: [...] } - Nova with tool
                            if (parsed.description || (parsed.key_moments && Array.isArray(parsed.key_moments))) {
                              return (
                                <div>
                                  {parsed.description && (
                                    <div className="review-description">
                                      <h4>Description</h4>
                                      <p>{parsed.description}</p>
                                    </div>
                                  )}
                                  
                                  {parsed.key_moments && Array.isArray(parsed.key_moments) && (
                                    <div>
                                      {parsed.description && <h4>Key Moments</h4>}
                                      <div className="scenes-list">
                                        {parsed.key_moments.map((moment, index) => (
                                          <div 
                                            key={index} 
                                            className="scene-item scene-item--clickable"
                                            onClick={() => handleSceneClick(moment.start_time, moment.end_time)}
                                            title="Click to play this segment"
                                          >
                                            <div className="scene-header">
                                              <span className="scene-number">Moment {index + 1}</span>
                                              <span className="scene-time">
                                                {moment.start_time}s - {moment.end_time}s
                                              </span>
                                            </div>
                                            <div className="scene-description">
                                              {moment.description}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            }
                            
                            // No recognized format - show message
                            return (
                              <div className="review-no-format">
                                <p>Response is not in expected JSON format. Switch to "Raw Response" tab to view the content.</p>
                              </div>
                            )
                          } catch (e) {
                            // Not JSON - check if it's plain text with useful content
                            if (content.length > 50) {
                              return (
                                <div className="review-description">
                                  <h4>Response</h4>
                                  <p className="text-pre-wrap">{content}</p>
                                </div>
                              )
                            }
                            return (
                              <div className="review-no-format">
                                <p>Response is not in JSON format. Switch to "Raw Response" tab to view the content.</p>
                              </div>
                            )
                          }
                        }
                        
                        // Content is already an object
                        if (typeof content === 'object' && content !== null) {
                          // Check if content is a direct array
                          if (Array.isArray(content)) {
                            const hasTimestamps = content.length > 0 && content[0].start_time && content[0].end_time
                            
                            if (hasTimestamps) {
                              return (
                                <div className="scenes-list">
                                  {content.map((item, index) => (
                                    <div 
                                      key={index} 
                                      className="scene-item scene-item--clickable"
                                      onClick={() => handleSceneClick(item.start_time, item.end_time)}
                                      title="Click to play this segment"
                                    >
                                      <div className="scene-header">
                                        <span className="scene-number">Item {index + 1}</span>
                                        <span className="scene-time">
                                          {item.start_time} - {item.end_time}
                                        </span>
                                      </div>
                                      <div className="scene-description">
                                        {item.description || item.text || JSON.stringify(item)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )
                            } else {
                              return (
                                <div className="scenes-list">
                                  {content.map((item, index) => (
                                    <div key={index} className="scene-item">
                                      <div className="scene-header">
                                        <span className="scene-number">Item {index + 1}</span>
                                      </div>
                                      <div className="scene-description">
                                        {typeof item === 'string' ? item : (item.description || item.text || JSON.stringify(item, null, 2))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )
                            }
                          }
                          
                          // Check for different response formats
                          if (content.name === 'video_analysis' && content.scenes && Array.isArray(content.scenes)) {
                            return (
                              <div className="scenes-list">
                                {content.scenes.map((scene, index) => (
                                  <div 
                                    key={index} 
                                    className="scene-item scene-item--clickable"
                                    onClick={() => handleSceneClick(scene.start_time, scene.end_time)}
                                    title="Click to play this segment"
                                  >
                                    <div className="scene-header">
                                      <span className="scene-number">Scene {index + 1}</span>
                                      <span className="scene-time">
                                        {scene.start_time} - {scene.end_time}
                                      </span>
                                    </div>
                                    <div className="scene-description">
                                      {scene.description}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          }
                          
                          if (content.summary || (content.scenes && Array.isArray(content.scenes))) {
                            return (
                              <div>
                                {content.summary && (
                                  <div className="review-description">
                                    <h4>Summary</h4>
                                    <p>{content.summary}</p>
                                  </div>
                                )}
                                
                                {content.scenes && Array.isArray(content.scenes) && (
                                  <div>
                                    {content.summary && <h4>Scenes</h4>}
                                    <div className="scenes-list">
                                      {content.scenes.map((scene, index) => (
                                        <div 
                                          key={index} 
                                          className="scene-item scene-item--clickable"
                                          onClick={() => handleSceneClick(scene.start_time, scene.end_time)}
                                          title="Click to play this segment"
                                        >
                                          <div className="scene-header">
                                            <span className="scene-number">Scene {index + 1}</span>
                                            <span className="scene-time">
                                              {scene.start_time} - {scene.end_time}
                                            </span>
                                          </div>
                                          <div className="scene-description">
                                            {scene.description}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          }
                        }
                        
                        return (
                          <div className="review-no-format">
                            <p>Response is not in expected format. Switch to "Raw Response" tab to view the content.</p>
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <div className="review-raw">
                      <pre className="response-text">
                        {(() => {
                          let content = reviewTask.Result?.Response?.content || reviewTask.Result?.Response?.message || reviewTask.Result?.Response || reviewTask.Result?.message || 'No content available'
                          
                          if (typeof content === 'string') {
                            try {
                              const parsed = JSON.parse(content)
                              return JSON.stringify(parsed, null, 2)
                            } catch (e) {
                              return content
                            }
                          }
                          
                          return JSON.stringify(content, null, 2)
                        })()}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoUnderstandingForm
