import { useState, useEffect, useRef } from 'react'
import './VideoManagement.css'
import VideoUpload from './VideoUpload'
import { FetchPost } from '../utils/apiHelper'
import { evalAPI } from '../utils/api'
import refreshIcon from '../assets/icons/refresh.svg'
import arrowLeftIcon from '../assets/icons/arrow-left.svg'
import { modelGroups } from '../static/modelConfig'

function VideoManagement({ currentUser }) {
  const [videos, setVideos] = useState([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showAnalyze, setShowAnalyze] = useState(false)
  const [analyzeVideo, setAnalyzeVideo] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sortField, setSortField] = useState('uploaded_ts')
  const [sortDirection, setSortDirection] = useState('desc')
  
  // Task expansion state
  const [expandedTaskId, setExpandedTaskId] = useState(null)
  
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
    const name = video.Name?.toLowerCase() || ''
    const description = video.Description?.toLowerCase() || ''
    const uploadedBy = video.UploadedBy?.toLowerCase() || ''
    
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
    return `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`
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
            <img src={refreshIcon} alt="Refresh" />
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
                  <tr key={video.Id || video.id}>
                    <td>
                      <img 
                        src={getThumbnailUrl(video) || placeholderThumbnail} 
                        alt={video.Name}
                        className="video-thumbnail"
                        onError={(e) => {
                          e.target.src = placeholderThumbnail
                        }}
                      />
                    </td>
                    <td>
                      <span className="video-link">
                        {video.Name}
                      </span>
                    </td>
                    <td>{formatDate(video.UploadedTs)}</td>
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
    </div>
  )
}

// Analyze View Component (replaces the list)
function AnalyzeView({ video, onBack }) {
  const [activeTab, setActiveTab] = useState('embedding')
  const [analyzeTasks, setAnalyzeTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [tasksError, setTasksError] = useState(null)
  
  // Task expansion and search state
  const [expandedTaskId, setExpandedTaskId] = useState(null)
  const [selectedTasks, setSelectedTasks] = useState([]) // For comparison
  const [showCompareModal, setShowCompareModal] = useState(false)
  const [compareSearchText, setCompareSearchText] = useState('')
  const [compareTopK, setCompareTopK] = useState(10)
  const [compareResults, setCompareResults] = useState({})
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState(null)
  const [groundTruths, setGroundTruths] = useState([])
  const [selectedGroundTruthId, setSelectedGroundTruthId] = useState('')
  const [appendingToGt, setAppendingToGt] = useState(false)
  const [createParams, setCreateParams] = useState({
    modelId: 'amazon.nova-2-multimodal-embeddings-v1:0',
    // Nova MME parameters
    durationS: 5,
    embedMode: 'AUDIO_VIDEO_COMBINED',
    embeddingDim: 1024, // Will be updated based on selected model
    // TwelveLabs parameters
    segmentationMethod: 'dynamic',
    minDurationSec: 4,
    embeddingScope: ['clip'],
    embeddingOption: ['visual', 'audio', 'transcription'],
    description: ''
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  
  // Get selected model info
  const selectedModel = modelGroups
    .find(group => group.groupName === 'Multimodal Embedding')
    ?.models.find(model => model.modelId === createParams.modelId)
  
  // Update embeddingDim when model changes
  useEffect(() => {
    if (selectedModel?.dims && selectedModel.dims.length > 0) {
      // Check if current dim is valid for selected model
      if (!selectedModel.dims.includes(parseInt(createParams.embeddingDim))) {
        setCreateParams(prev => ({ ...prev, embeddingDim: selectedModel.dims[0] }))
      }
    }
  }, [selectedModel, createParams.embeddingDim])
  
  // Video player ref
  const videoPlayerRef = useRef(null)
  const modalVideoPlayerRef = useRef(null)

  // Load analyze tasks when component mounts
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

  const fetchGroundTruths = async () => {
    try {
      console.log('Fetching ground truths for video:', video.Id || video.id)
      const response = await evalAPI.getGroundTruths(video.Id || video.id)
      console.log('Ground truths response:', response)
      setGroundTruths(response.groundTruths || [])
      console.log('Ground truths set:', response.groundTruths || [])
    } catch (err) {
      console.error('Error fetching ground truths:', err)
    }
  }

  const handleOpenSearchModal = (taskId, vectorIndex, task) => {
    // Use the compare modal for single task search
    setSelectedTasks([task])
    setShowCompareModal(true)
    setCompareResults({})
    setCompareSearchText('')
    setCompareError(null)
    setSelectedGroundTruthId('')
    // Fetch ground truths for the video
    fetchGroundTruths()
  }

  const handleAppendToGroundTruth = async (task, results) => {
    if (!selectedGroundTruthId) {
      alert('Please select a ground truth')
      return
    }
    
    if (!results || results.length === 0) {
      alert('No search results to append')
      return
    }
    
    setAppendingToGt(true)
    try {
      // Find the selected ground truth
      const gt = groundTruths.find(g => g.Id === selectedGroundTruthId)
      if (!gt) {
        throw new Error('Ground truth not found')
      }
      
      // Convert search results to labels
      const newLabels = results.map(result => ({
        StartTs: result.StartSec,
        EndTs: result.EndSec,
        Score: result.Distance || 0,
        Label: compareSearchText,
        Source: 'model_generated',
        ReviewResult: 'unreviewed'
      }))
      
      // Merge with existing labels
      const existingLabels = gt.Labels || []
      const allLabels = [...existingLabels, ...newLabels]
      
      // Prepare payload
      const payload = {
        Id: gt.Id,
        Name: gt.Name,
        Description: gt.Description,
        CreatedBy: gt.CreatedBy,
        VideoId: gt.VideoId,
        VideoAnalyzeTaskIds: gt.VideoAnalyzeTaskIds || [],
        Status: gt.Status || 'created',
        Labels: allLabels
      }
      
      await evalAPI.upsertGroundTruth(payload)
      
      alert(`Successfully appended ${newLabels.length} labels to ground truth "${gt.Name}"`)
      
      // Refresh ground truths
      await fetchGroundTruths()
    } catch (err) {
      console.error('Error appending to ground truth:', err)
      alert('Failed to append to ground truth: ' + err.message)
    } finally {
      setAppendingToGt(false)
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

  const handleOpenCompareModal = () => {
    if (selectedTasks.length === 0) {
      alert('Please select at least one task to compare')
      return
    }
    setShowCompareModal(true)
    setCompareResults({})
    setCompareSearchText('')
    setCompareError(null)
    setSelectedGroundTruthId('')
    // Fetch ground truths for the video
    fetchGroundTruths()
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
      // Search each selected task's vector index
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

        // Determine which API to call based on task type
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

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task? This will remove all associated data including embeddings and cannot be undone.')) {
      return
    }

    try {
      const data = await FetchPost('/video/delete-analyze-task', { TaskId: taskId }, 'EvalService')
      
      console.log('Delete task response:', data)
      
      if (data.statusCode === 200) {
        // Parse body if it's a string
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        
        // Remove from local state
        setAnalyzeTasks(prev => prev.filter(t => t.Id !== taskId))
        
        // Check if there were any errors during deletion
        if (responseBody?.errors && responseBody.errors.length > 0) {
          const errorList = responseBody.errors.join('; ')
          alert(`Task deleted, but some cleanup operations failed:\n${errorList}`)
        } else {
          const message = responseBody?.message || 'Task deleted successfully'
          console.log('Task deleted successfully:', taskId)
        }
      } else {
        // Parse error from body
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        const errorMessage = responseBody?.error || data.body || 'Failed to delete task'
        alert(`Failed to delete task: ${errorMessage}`)
      }
    } catch (err) {
      console.error('Error deleting task:', err)
      alert(`Error deleting task: ${err.message}`)
    }
  }

  const handleTimeRangeClick = (startSec, endSec) => {
    if (modalVideoPlayerRef.current) {
      const video = modalVideoPlayerRef.current
      const endTime = parseFloat(endSec || 0)
      
      // Set the start time
      video.currentTime = parseFloat(startSec || 0)
      video.muted = true
      
      // Remove any existing timeupdate listener to avoid duplicates
      const existingListener = video._stopAtEndListener
      if (existingListener) {
        video.removeEventListener('timeupdate', existingListener)
      }
      
      // Create new listener to stop at end time
      const stopAtEndListener = () => {
        if (video.currentTime >= endTime) {
          video.pause()
          video.removeEventListener('timeupdate', stopAtEndListener)
          delete video._stopAtEndListener
        }
      }
      
      // Store reference to listener for cleanup
      video._stopAtEndListener = stopAtEndListener
      video.addEventListener('timeupdate', stopAtEndListener)
      
      // Start playing
      video.play().catch(err => {
        console.log('Auto-play prevented:', err)
      })
    }
  }

  const handleSaveAsGroundTruth = async (task, results) => {
    if (!results || results.length === 0) {
      alert('No results to save')
      return
    }

    const groundTruthName = prompt(
      `Enter a name for this ground truth:\n\nSearch query: "${compareSearchText}"\nModel: ${task.ModelId}\nResults: ${results.length} segments`,
      `Ground Truth - ${compareSearchText.substring(0, 30)}`
    )

    if (!groundTruthName) {
      return // User cancelled
    }

    try {
      // Generate UUID for ground truth
      const groundTruthId = crypto.randomUUID()

      // Convert search results to ground truth labels
      const labels = results.map(result => ({
        StartTs: parseFloat(parseFloat(result.StartSec || 0).toFixed(3)),
        EndTs: parseFloat(parseFloat(result.EndSec || 0).toFixed(3)),
        Score: parseFloat(result.Distance || 0),
        Label: compareSearchText, // Use search text as label
        Source: 'video_analyze_task',
        ReviewResult: 'unreviewed'
      }))

      const username = currentUser?.username || currentUser?.signInDetails?.loginId || 'user'
      const payload = {
        Id: groundTruthId,
        Name: groundTruthName,
        Description: `MME search keyword: "${compareSearchText}". Generated from ${task.Type} task with model ${task.ModelId}.`,
        CreatedBy: username,
        VideoId: video.Id || video.id,
        VideoAnalyzeTaskIds: [task.Id],
        Labels: labels
      }

      console.log('Saving ground truth payload:', payload)
      const data = await FetchPost('/video/upsert-ground-truth', payload, 'EvalService')
      console.log('Ground truth save response:', data)

      if (data.statusCode === 200) {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        console.log(`Ground truth "${groundTruthName}" saved successfully with ${labels.length} labels`)
      } else {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        const errorMessage = responseBody?.error || data.body || 'Failed to save ground truth'
        console.error('Ground truth save failed:', errorMessage)
      }
    } catch (err) {
      console.error('Error saving ground truth:', err)
    }
  }

  const handleCreateEmbedding = async () => {
    setCreating(true)
    setCreateError(null)

    try {
      let payload
      
      if (selectedModel?.parameterType === 'nova-mme') {
        // Check if a task with the same parameters already exists
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
        // TwelveLabs payload
        const segmentationConfig = {
          method: createParams.segmentationMethod
        }
        
        // Add the appropriate config based on method
        if (createParams.segmentationMethod === 'dynamic') {
          segmentationConfig.dynamic = {
            minDurationSec: createParams.minDurationSec.toString()
          }
        } else if (createParams.segmentationMethod === 'fixed') {
          segmentationConfig.fixed = {
            durationSec: createParams.minDurationSec.toString()  // Use durationSec for fixed
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
        // Reset form to defaults based on model type
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
        // Reload tasks
        loadAnalyzeTasks()
        alert('Embedding task started successfully!')
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
          {/* Tabs */}
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

          {/* Tab Content */}
          {activeTab === 'embedding' && (
            <div className="tab-content">
              <div className="tasks-display-section">
                <div className="section-header-with-action">
                  <h3>Multimodal Embedding Tasks</h3>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {selectedTasks.length > 0 && (
                      <button 
                        className="btn-compare"
                        onClick={handleOpenCompareModal}
                        title="Compare selected embeddings"
                      >
                        Compare ({selectedTasks.length})
                      </button>
                    )}
                    <button 
                      className="btn-refresh" 
                      onClick={loadAnalyzeTasks}
                      disabled={loadingTasks}
                      title="Refresh task list"
                    >
                      <img src={refreshIcon} alt="Refresh" />
                    </button>
                  </div>
                </div>
                {tasksError && (
                  <div className="alert alert-error">{tasksError}</div>
                )}
                
                {loadingTasks ? (
                  <div className="loading-message">Loading tasks...</div>
                ) : analyzeTasks.length > 0 ? (
                  <div className="analyze-tasks-list">
                    {analyzeTasks.filter(t => t.Status === 'completed' && t.Result && t.Result.S3VectorIndex).length > 0 && (
                      <div className="select-all-row">
                        <label className="select-all-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedTasks.length > 0 && selectedTasks.length === analyzeTasks.filter(t => t.Status === 'completed' && t.Result && t.Result.S3VectorIndex).length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                // Select all completed tasks
                                const completedTasks = analyzeTasks.filter(t => t.Status === 'completed' && t.Result && t.Result.S3VectorIndex)
                                setSelectedTasks(completedTasks)
                              } else {
                                // Deselect all
                                setSelectedTasks([])
                              }
                            }}
                            title="Select all completed tasks"
                          />
                          <span>Select All</span>
                        </label>
                      </div>
                    )}
                    {analyzeTasks.map((task) => {
                      const isExpanded = expandedTaskId === task.Id
                      const isSelected = selectedTasks.some(t => t.Id === task.Id)
                      const canCompare = task.Status === 'completed' && task.Result && task.Result.S3VectorIndex
                      
                      return (
                        <div key={task.Id} className="analyze-task-item compact">
                          <div className="task-compact-header">
                            <div className="task-compact-info">
                              {canCompare && (
                                <input
                                  type="checkbox"
                                  className="task-checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleTaskSelection(task)}
                                  title="Select for comparison"
                                />
                              )}
                              <span className={`task-status ${task.Status}`}>{task.Status}</span>
                              <span className="task-compact-detail">
                                {task.ModelId || 'N/A'}
                              </span>
                              <span className="task-compact-detail">
                                {task.Type}
                              </span>
                            </div>
                            <div className="task-actions">
                              {task.Status === 'completed' && task.Result && task.Result.S3VectorIndex && (
                                <button 
                                  className="btn-search-icon"
                                  onClick={() => handleOpenSearchModal(task.Id, task.Result.S3VectorIndex, task)}
                                  title="Search embeddings"
                                >
                                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2"/>
                                    <path d="M11 11L14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                  </svg>
                                  <span>Search Embeddings</span>
                                </button>
                              )}
                              <button 
                                className="btn-delete-task"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteTask(task.Id)
                                }}
                                title="Delete task"
                              >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                              <button 
                                className="btn-expand"
                                onClick={() => setExpandedTaskId(isExpanded ? null : task.Id)}
                                title={isExpanded ? 'Collapse' : 'Expand'}
                              >
                                <svg 
                                  width="16" 
                                  height="16" 
                                  viewBox="0 0 16 16" 
                                  fill="none" 
                                  xmlns="http://www.w3.org/2000/svg"
                                  style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
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
                              <div className="task-detail-grid">
                                <div className="task-detail-row">
                                  <span className="detail-label">Task ID:</span>
                                  <span className="detail-value">{task.Id}</span>
                                </div>
                                <div className="task-detail-row">
                                  <span className="detail-label">Type:</span>
                                  <span className="detail-value">{task.Type}</span>
                                </div>
                                <div className="task-detail-row">
                                  <span className="detail-label">Model:</span>
                                  <span className="detail-value">{task.ModelId || 'N/A'}</span>
                                </div>
                                <div className="task-detail-row">
                                  <span className="detail-label">Created:</span>
                                  <span className="detail-value">{formatDate(task.StartedTs)}</span>
                                </div>
                                
                                {task.Type === 'tlabs-mme' ? (
                                  <>
                                    {(task.Request?.Segmentation || task.Request?.segmentation) && (
                                      <>
                                        <div className="task-detail-row">
                                          <span className="detail-label">Segmentation Method:</span>
                                          <span className="detail-value">
                                            {task.Request.Segmentation?.Method || task.Request.segmentation?.method || 'N/A'}
                                          </span>
                                        </div>
                                        {(task.Request.Segmentation?.Dynamic || task.Request.segmentation?.dynamic) && (
                                          <>
                                            {(task.Request.Segmentation?.Dynamic?.MinDurationSec || task.Request.segmentation?.dynamic?.minDurationSec) && (
                                              <div className="task-detail-row">
                                                <span className="detail-label">Min Duration:</span>
                                                <span className="detail-value">
                                                  {task.Request.Segmentation?.Dynamic?.MinDurationSec || task.Request.segmentation?.dynamic?.minDurationSec}s
                                                </span>
                                              </div>
                                            )}
                                            {(task.Request.Segmentation?.Dynamic?.MaxDurationSec || task.Request.segmentation?.dynamic?.maxDurationSec) && (
                                              <div className="task-detail-row">
                                                <span className="detail-label">Max Duration:</span>
                                                <span className="detail-value">
                                                  {task.Request.Segmentation?.Dynamic?.MaxDurationSec || task.Request.segmentation?.dynamic?.maxDurationSec}s
                                                </span>
                                              </div>
                                            )}
                                          </>
                                        )}
                                        {(task.Request.Segmentation?.Fixed?.DurationSec || task.Request.segmentation?.fixed?.durationSec) && (
                                          <div className="task-detail-row">
                                            <span className="detail-label">Fixed Duration:</span>
                                            <span className="detail-value">
                                              {task.Request.Segmentation?.Fixed?.DurationSec || task.Request.segmentation?.fixed?.durationSec}s
                                            </span>
                                          </div>
                                        )}
                                      </>
                                    )}
                                    {(task.Request?.EmbeddingScope || task.Request?.embeddingScope) && (
                                      <div className="task-detail-row">
                                        <span className="detail-label">Embedding Scope:</span>
                                        <span className="detail-value">
                                          {(task.Request.EmbeddingScope || task.Request.embeddingScope)?.join(', ') || 'N/A'}
                                        </span>
                                      </div>
                                    )}
                                    {(task.Request?.EmbeddingOption || task.Request?.embeddingOption) && (
                                      <div className="task-detail-row">
                                        <span className="detail-label">Embedding Options:</span>
                                        <span className="detail-value">
                                          {(task.Request.EmbeddingOption || task.Request.embeddingOption)?.join(', ') || 'N/A'}
                                        </span>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div className="task-detail-row">
                                      <span className="detail-label">Duration:</span>
                                      <span className="detail-value">{task.Request?.DurationS || 'N/A'}s</span>
                                    </div>
                                    <div className="task-detail-row">
                                      <span className="detail-label">Embed Mode:</span>
                                      <span className="detail-value">{task.Request?.EmbedMode || 'N/A'}</span>
                                    </div>
                                    <div className="task-detail-row">
                                      <span className="detail-label">Embedding Dimension:</span>
                                      <span className="detail-value">{task.Request?.EmbeddingDim || 'N/A'}</span>
                                    </div>
                                  </>
                                )}
                                
                                {task.Status === 'completed' && task.Result && (
                                  <>
                                    <div className="task-detail-row">
                                      <span className="detail-label">Embeddings:</span>
                                      <span className="detail-value">{task.Result.EmbeddingCount || 0}</span>
                                    </div>
                                    {task.CompletedTs && (
                                      <div className="task-detail-row">
                                        <span className="detail-label">Completed:</span>
                                        <span className="detail-value">{formatDate(task.CompletedTs)}</span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                              
                              {task.Status === 'completed' && task.Result && (
                                <>
                                  <div className="task-detail-full-width">
                                    <div className="task-detail-row">
                                      <span className="detail-label">S3 Vector Bucket:</span>
                                      <span className="detail-value">{task.Result.S3VectorBucket || 'N/A'}</span>
                                    </div>
                                    <div className="task-detail-row">
                                      <span className="detail-label">S3 Vector Index:</span>
                                      <span className="detail-value">{task.Result.S3VectorIndex || 'N/A'}</span>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="no-tasks-message">
                    No multimodal embedding tasks found for this video.
                  </div>
                )}
              </div>

              {/* Create New Embedding Section */}
              <div className="create-embedding-section">
                <h3>Create New Embedding</h3>
                
                {createError && (
                  <div className="alert alert-error">{createError}</div>
                )}
                
                <div className="create-embedding-form">
                  {/* Model Selection - Always shown first */}
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="modelId">Model</label>
                      <select
                        id="modelId"
                        value={createParams.modelId}
                        onChange={(e) => setCreateParams(prev => ({ ...prev, modelId: e.target.value }))}
                      >
                        {modelGroups
                          .find(group => group.groupName === 'Multimodal Embedding')
                          ?.models.map((model, index) => (
                            <option 
                              key={model.modelId || `model-${index}`} 
                              value={model.modelId}
                              disabled={!model.modelId}
                            >
                              {model.displayName}{model.modelId ? ` (${model.modelId})` : ' (Not Available)'}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {/* Nova MME Parameters */}
                  {selectedModel?.parameterType === 'nova-mme' && (
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="durationS">Segment Duration (s)</label>
                        <input
                          type="number"
                          id="durationS"
                          min="1"
                          max="60"
                          value={createParams.durationS}
                          onChange={(e) => setCreateParams(prev => ({ ...prev, durationS: e.target.value }))}
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="embedMode">Embedding Mode</label>
                        <select
                          id="embedMode"
                          value={createParams.embedMode}
                          onChange={(e) => setCreateParams(prev => ({ ...prev, embedMode: e.target.value }))}
                        >
                          <option value="AUDIO_VIDEO_COMBINED">Audio + Video</option>
                          <option value="VIDEO_ONLY">Video Only</option>
                          <option value="AUDIO_ONLY">Audio Only</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="embeddingDim">Dimension</label>
                        <select
                          id="embeddingDim"
                          value={createParams.embeddingDim}
                          onChange={(e) => setCreateParams(prev => ({ ...prev, embeddingDim: e.target.value }))}
                        >
                          {selectedModel?.dims?.map(dim => (
                            <option key={dim} value={dim}>{dim}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="description">Description (Optional)</label>
                        <input
                          type="text"
                          id="description"
                          value={createParams.description}
                          onChange={(e) => setCreateParams(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Task description..."
                        />
                      </div>

                      <div className="form-group form-group-button">
                        <label>&nbsp;</label>
                        <button 
                          className="btn-create-embedding"
                          onClick={handleCreateEmbedding}
                          disabled={creating}
                        >
                          {creating ? 'Creating...' : 'Create Embedding'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TwelveLabs Parameters */}
                  {selectedModel?.parameterType === 'twelvelabs' && (
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="segmentationMethod">Segmentation Method</label>
                        <select
                          id="segmentationMethod"
                          value={createParams.segmentationMethod}
                          onChange={(e) => setCreateParams(prev => ({ ...prev, segmentationMethod: e.target.value }))}
                        >
                          <option value="dynamic">Dynamic</option>
                          <option value="fixed">Fixed</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="minDurationSec">Min Duration (s)</label>
                        <input
                          type="number"
                          id="minDurationSec"
                          min="1"
                          max="60"
                          value={createParams.minDurationSec}
                          onChange={(e) => setCreateParams(prev => ({ ...prev, minDurationSec: e.target.value }))}
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="embeddingScope">Embedding Scope</label>
                        <select
                          id="embeddingScope"
                          multiple
                          value={createParams.embeddingScope}
                          onChange={(e) => {
                            const selected = Array.from(e.target.selectedOptions, option => option.value)
                            setCreateParams(prev => ({ ...prev, embeddingScope: selected }))
                          }}
                        >
                          <option value="clip">Clip</option>
                          <option value="asset">Asset</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="embeddingOption">Embedding Options</label>
                        <select
                          id="embeddingOption"
                          multiple
                          value={createParams.embeddingOption}
                          onChange={(e) => {
                            const selected = Array.from(e.target.selectedOptions, option => option.value)
                            setCreateParams(prev => ({ ...prev, embeddingOption: selected }))
                          }}
                        >
                          <option value="visual">Visual</option>
                          <option value="audio">Audio</option>
                          <option value="transcription">Transcription</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="description">Description (Optional)</label>
                        <input
                          type="text"
                          id="description"
                          value={createParams.description}
                          onChange={(e) => setCreateParams(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Task description..."
                        />
                      </div>

                      <div className="form-group form-group-button">
                        <label>&nbsp;</label>
                        <button 
                          className="btn-create-embedding"
                          onClick={handleCreateEmbedding}
                          disabled={creating}
                        >
                          {creating ? 'Creating...' : 'Create Embedding'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
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

      {/* Compare Embeddings Modal */}
      {showCompareModal && (
        <div className="modal-overlay" onClick={() => setShowCompareModal(false)}>
          <div className="modal-content compare-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedTasks.length === 1 ? 'Search Embeddings' : `Compare Embeddings (${selectedTasks.length} tasks)`}</h2>
              <button className="close-button" onClick={() => setShowCompareModal(false)}>&times;</button>
            </div>
            <div className="modal-body-compare">
              {/* Top Section: Video and Metadata */}
              <div className="compare-top-section">
                <div className="compare-video-container">
                  <video 
                    ref={modalVideoPlayerRef}
                    src={video.video_url || `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`}
                    controls
                    muted
                    className="compare-video-player"
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
                <div className="compare-metadata-container">
                  <h3>{video.Name}</h3>
                  <p className="video-id-small">ID: {video.Id || video.id}</p>
                  {video.Description && <p className="video-description-small">{video.Description}</p>}
                  <div className="metadata-grid-compact">
                    <div className="metadata-item-compact">
                      <span className="metadata-label-compact">Duration:</span>
                      <span className="metadata-value-compact">{formatDuration(video.Duration)}</span>
                    </div>
                    <div className="metadata-item-compact">
                      <span className="metadata-label-compact">Resolution:</span>
                      <span className="metadata-value-compact">{formatResolution(video.Resolution)}</span>
                    </div>
                    <div className="metadata-item-compact">
                      <span className="metadata-label-compact">Frame Rate:</span>
                      <span className="metadata-value-compact">{formatFps(video.Fps)}</span>
                    </div>
                    <div className="metadata-item-compact">
                      <span className="metadata-label-compact">File Size:</span>
                      <span className="metadata-value-compact">{formatFileSize(video.Size)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Search Controls */}
              <div className="search-controls-compare">
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
              
              {/* Bottom Section: Results in Parallel Columns */}
              <div className="compare-results-container">
                <div className="compare-results-grid">
                  {selectedTasks.map((task) => {
                    const hasResults = compareResults[task.Id]
                    const resultData = hasResults ? compareResults[task.Id] : null
                    
                    // Build tooltip content with task parameters
                    let tooltipContent = ''
                    if (task.Type === 'nova-mme') {
                      tooltipContent = `Duration: ${task.Request?.DurationS || 'N/A'}s\nEmbed Mode: ${task.Request?.EmbedMode || 'N/A'}\nDimension: ${task.Request?.EmbeddingDim || 'N/A'}`
                    } else if (task.Type === 'tlabs-mme') {
                      const segMethod = task.Request?.Segmentation?.Method || task.Request?.segmentation?.method || 'N/A'
                      const minDur = task.Request?.Segmentation?.Dynamic?.MinDurationSec || 
                                     task.Request?.segmentation?.dynamic?.minDurationSec || 
                                     task.Request?.Segmentation?.Fixed?.DurationSec || 
                                     task.Request?.segmentation?.fixed?.durationSec || 'N/A'
                      const scope = (task.Request?.EmbeddingScope || task.Request?.embeddingScope)?.join(', ') || 'N/A'
                      const options = (task.Request?.EmbeddingOption || task.Request?.embeddingOption)?.join(', ') || 'N/A'
                      tooltipContent = `Segmentation: ${segMethod}\nDuration: ${minDur}s\nScope: ${scope}\nOptions: ${options}`
                    }
                    
                    return (
                      <div key={task.Id} className="compare-result-column">
                        <div className="compare-result-header" title={tooltipContent}>
                          <h4>
                            {task.Type === 'nova-mme' ? 'Nova MME' : 'TwelveLabs'}
                            <span className="info-icon" title={tooltipContent}>ⓘ</span>
                          </h4>
                          <div className="compare-model-id">{task.ModelId}</div>
                          {resultData && resultData.results.length > 0 && (
                            <span className="compare-result-count">{resultData.results.length} results</span>
                          )}
                        </div>
                        
                        {!hasResults ? (
                          <div className="no-results-message">Waiting for search...</div>
                        ) : resultData.error ? (
                          <div className="alert alert-error">{resultData.error}</div>
                        ) : resultData.results.length > 0 ? (
                          <>
                            <div className="results-list-modal">
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
                            <div className="compare-result-actions">
                              <div className="append-controls-inline">
                                <select
                                  value={selectedGroundTruthId}
                                  onChange={(e) => {
                                    console.log('Selected ground truth:', e.target.value)
                                    setSelectedGroundTruthId(e.target.value)
                                  }}
                                  className="gt-select-inline"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    console.log('Ground truths available:', groundTruths)
                                  }}
                                >
                                  <option value="">Select ground truth... ({groundTruths.length} available)</option>
                                  {groundTruths.map(gt => (
                                    <option key={gt.Id} value={gt.Id}>
                                      {gt.Name} ({gt.Labels?.length || 0} labels)
                                    </option>
                                  ))}
                                </select>
                                <button 
                                  className="btn-append-inline"
                                  onClick={() => handleAppendToGroundTruth(task, resultData.results)}
                                  disabled={!selectedGroundTruthId || appendingToGt}
                                  title="Append results to selected ground truth"
                                >
                                  {appendingToGt ? 'Appending...' : 'Append'}
                                </button>
                              </div>
                              <button 
                                className="btn-save-ground-truth"
                                onClick={() => handleSaveAsGroundTruth(task, resultData.results)}
                                title="Save these results as new ground truth"
                              >
                                Save as New Ground Truth
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="no-results-message">No results found</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
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
            <div className="video-info-card">
              <img 
                src={video.thumbnail_url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="90"%3E%3Crect fill="%23e0e0e0" width="160" height="90"/%3E%3C/svg%3E'} 
                alt={video.Name}
                className="video-info-thumbnail"
              />
              <div className="video-info-details">
                <strong>{video.Name}</strong>
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
