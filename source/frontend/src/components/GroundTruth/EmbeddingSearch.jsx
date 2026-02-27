import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './EmbeddingSearch.css'
import './EmbeddingSearchModal.css'
import './VideoUnderstandingReview.css'
import { FetchPost } from '../../utils/apiHelper'
import ManualLabel from './ManualLabel'

function EmbeddingSearch({ video, onNext, initialSearches = [], initialResults = [] }) {
  const [activeTab, setActiveTab] = useState('embedding')
  const [analyzeTasks, setAnalyzeTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [tasksError, setTasksError] = useState(null)
  
  const [selectedTask, setSelectedTask] = useState(null)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [topK, setTopK] = useState(10)
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  
  // Accumulated searches and results - initialize with passed values
  const [allSearches, setAllSearches] = useState(initialSearches)
  const [allResults, setAllResults] = useState(initialResults)
  
  // Video Understanding review state
  const [reviewTask, setReviewTask] = useState(null)
  const [reviewTab, setReviewTab] = useState('formatted')
  
  const videoPlayerRef = useRef(null)
  const reviewVideoRef = useRef(null)

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
          setTasksError(errorMessage || 'Failed to load tasks')
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
      setTasksError('Failed to load tasks')
    } finally {
      setLoadingTasks(false)
    }
  }

  // Helper function to check if a task result can be parsed as a list
  const canParseAsList = (task) => {
    if (!task.Result || !task.Result.Response) return false
    
    try {
      let content = task.Result.Response.content || task.Result.Response.message || task.Result.Response
      
      if (typeof content === 'string') {
        try {
          content = JSON.parse(content)
        } catch (e) {
          return false
        }
      }
      
      // Check if it's a direct array with timestamps
      if (Array.isArray(content)) {
        return content.length > 0 && content[0].start_time && content[0].end_time
      }
      
      // Check for TwelveLabs Pegasus format
      if (content.name === 'video_analysis' && content.scenes && Array.isArray(content.scenes)) {
        return content.scenes.length > 0 && content.scenes[0].start_time && content.scenes[0].end_time
      }
      
      // Check for Gemini format with scenes
      if (content.scenes && Array.isArray(content.scenes)) {
        return content.scenes.length > 0 && content.scenes[0].start_time && content.scenes[0].end_time
      }
      
      // Check for Nova format with key_moments
      if (content.key_moments && Array.isArray(content.key_moments)) {
        return content.key_moments.length > 0 && content.key_moments[0].start_time && content.key_moments[0].end_time
      }
      
      return false
    } catch (err) {
      console.error('Error checking if task can be parsed as list:', err)
      return false
    }
  }

  const handleSelectTask = (task) => {
    setSelectedTask(task)
    setShowSearchModal(true)
    setSearchResults([])
    setSearchText('')
    setSearchError(null)
  }

  const handleCloseModal = () => {
    setShowSearchModal(false)
  }

  const handleSearch = async () => {
    if (!searchText.trim()) {
      setSearchError('Please enter a search query')
      return
    }

    if (!selectedTask) {
      setSearchError('Please select an embedding index')
      return
    }

    setSearching(true)
    setSearchError(null)

    try {
      const payload = {
        TaskId: selectedTask.Id,
        SearchText: searchText,
        InputType: 'text',
        TopK: parseInt(topK) || 10,
        PageSize: 1000,
        FromIndex: 0,
        IncludeVideoUrl: true,
        EmbeddingOptions: ['audio-video', 'video', 'audio']
      }

      let endpoint = '/model/nova-mme-search-vector'
      if (selectedTask.Type === 'tlabs-mme') {
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
          setSearchError(errorMessage || 'Search failed')
          return
        }
      } else if (Array.isArray(data)) {
        // Direct array response format
        responseBody = data
      } else {
        // Direct object response format
        responseBody = data
      }
      
      const results = responseBody || []
      setSearchResults(results)
    } catch (err) {
      console.error('Error searching embeddings:', err)
      setSearchError('Search failed: ' + err.message)
    } finally {
      setSearching(false)
    }
  }

  const handleAcceptSearchResults = () => {
    if (searchResults.length === 0) {
      setSearchError('No search results to accept')
      return
    }

    // Add to accumulated searches and results
    const searchRecord = {
      id: crypto.randomUUID(),
      taskId: selectedTask.Id,
      taskName: selectedTask.ModelId,
      taskType: selectedTask.Type,
      query: searchText,
      topK: parseInt(topK) || 10,
      resultCount: searchResults.length,
      timestamp: new Date().toISOString()
    }
    
    setAllSearches(prev => [...prev, searchRecord])
    setAllResults(prev => [...prev, ...searchResults.map(r => ({
      ...r,
      searchId: searchRecord.id,
      query: searchText,
      taskId: selectedTask.Id,
      source: 'embedding' // Mark as embedding source
    }))])

    // Close modal and reset search
    setShowSearchModal(false)
    setSearchResults([])
    setSearchText('')
    setSearchError(null)
  }

  // Extract list items from video understanding task result
  const extractListFromTask = (task) => {
    try {
      let content = task.Result?.Response?.content || task.Result?.Response?.message || task.Result?.Response
      
      if (typeof content === 'string') {
        content = JSON.parse(content)
      }
      
      const items = []
      
      // Direct array format
      if (Array.isArray(content)) {
        content.forEach((item, index) => {
          if (item.start_time && item.end_time) {
            items.push({
              StartSec: parseTimeToSeconds(item.start_time),
              EndSec: parseTimeToSeconds(item.end_time),
              query: item.description || item.text || `Item ${index + 1}`,
              Distance: 0,
              source: 'video-understanding'
            })
          }
        })
      }
      // TwelveLabs Pegasus format
      else if (content.name === 'video_analysis' && content.scenes && Array.isArray(content.scenes)) {
        content.scenes.forEach((scene, index) => {
          items.push({
            StartSec: parseTimeToSeconds(scene.start_time),
            EndSec: parseTimeToSeconds(scene.end_time),
            query: scene.description || `Scene ${index + 1}`,
            Distance: 0,
            source: 'video-understanding'
          })
        })
      }
      // Gemini format with scenes
      else if (content.scenes && Array.isArray(content.scenes)) {
        content.scenes.forEach((scene, index) => {
          items.push({
            StartSec: parseTimeToSeconds(scene.start_time),
            EndSec: parseTimeToSeconds(scene.end_time),
            query: scene.description || `Scene ${index + 1}`,
            Distance: 0,
            source: 'video-understanding'
          })
        })
      }
      // Nova format with key_moments
      else if (content.key_moments && Array.isArray(content.key_moments)) {
        content.key_moments.forEach((moment, index) => {
          items.push({
            StartSec: parseTimeToSeconds(moment.start_time),
            EndSec: parseTimeToSeconds(moment.end_time),
            query: moment.description || `Moment ${index + 1}`,
            Distance: 0,
            source: 'video-understanding'
          })
        })
      }
      
      return items
    } catch (err) {
      console.error('Error extracting list from task:', err)
      return []
    }
  }

  // Handle using video understanding results
  const handleUseVideoUnderstandingResults = () => {
    if (!reviewTask) return
    
    const items = extractListFromTask(reviewTask)
    
    if (items.length === 0) {
      alert('No valid items found in the task result')
      return
    }

    // Add to accumulated searches and results
    const searchRecord = {
      id: crypto.randomUUID(),
      taskId: reviewTask.Id,
      taskName: reviewTask.Name || reviewTask.Description || reviewTask.ModelId,
      taskType: 'video-understanding',
      query: reviewTask.Request?.Prompt || reviewTask.Request?.InputPrompt || 'Video Understanding',
      topK: items.length,
      resultCount: items.length,
      timestamp: new Date().toISOString()
    }
    
    setAllSearches(prev => [...prev, searchRecord])
    setAllResults(prev => [...prev, ...items.map(item => ({
      ...item,
      searchId: searchRecord.id,
      taskId: reviewTask.Id
    }))])

    // Close modal
    setReviewTask(null)
  }

  const handleClearAllSearches = () => {
    if (window.confirm('Are you sure you want to clear all labels? This will remove all accumulated results from all tabs.')) {
      setAllSearches([])
      setAllResults([])
      setSearchResults([])
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

  const handleProceedToReview = () => {
    if (!allResults || allResults.length === 0) {
      alert('No results to review. Please perform at least one search.')
      return
    }

    if (onNext) {
      onNext(allSearches, allResults)
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

  // Parse timestamp to seconds for video understanding results
  const parseTimeToSeconds = (timeStr) => {
    if (typeof timeStr === 'number') return timeStr
    
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
    const numMatch = timeStr.match(/^(\d+)s?$/)
    if (numMatch) {
      return parseInt(numMatch[1], 10)
    }
    
    return 0
  }
  
  // Handle scene/moment click to play video segment
  const handleSceneClick = (startTime, endTime) => {
    if (!reviewVideoRef.current) return
    
    const videoEl = reviewVideoRef.current
    const startSeconds = parseTimeToSeconds(startTime)
    const endSeconds = parseTimeToSeconds(endTime)
    
    // Set video to start time and play
    videoEl.currentTime = startSeconds
    videoEl.muted = true
    videoEl.play()
    
    // Set up event listener to stop at end time
    const handleTimeUpdate = () => {
      if (videoEl.currentTime >= endSeconds) {
        videoEl.pause()
        videoEl.removeEventListener('timeupdate', handleTimeUpdate)
      }
    }
    
    videoEl.addEventListener('timeupdate', handleTimeUpdate)
    
    // Cleanup listener if video is paused manually
    const handlePause = () => {
      videoEl.removeEventListener('timeupdate', handleTimeUpdate)
      videoEl.removeEventListener('pause', handlePause)
    }
    
    videoEl.addEventListener('pause', handlePause, { once: true })
  }

  return (
    <div className="embedding-search">
      {/* Unified Label Collection - Shows across all tabs */}
      {allResults.length > 0 && (
        <div className="unified-label-collection">
          <div className="collection-header">
            <h3>Label Collection ({allResults.length} segments)</h3>
            <button 
              className="btn-proceed-review"
              onClick={handleProceedToReview}
            >
              Proceed to Review →
            </button>
          </div>
          <div className="collection-summary">
            <div className="summary-badges">
              {allSearches.filter(s => s.taskType !== 'video-understanding').length > 0 && (
                <span className="badge badge-embedding">
                  {allSearches.filter(s => s.taskType !== 'video-understanding').length} embedding {allSearches.filter(s => s.taskType !== 'video-understanding').length === 1 ? 'search' : 'searches'}
                </span>
              )}
              {allSearches.filter(s => s.taskType === 'video-understanding').length > 0 && (
                <span className="badge badge-video-understanding">
                  {allSearches.filter(s => s.taskType === 'video-understanding').length} video understanding {allSearches.filter(s => s.taskType === 'video-understanding').length === 1 ? 'task' : 'tasks'}
                </span>
              )}
              {allResults.filter(r => r.source === 'manual').length > 0 && (
                <span className="badge badge-manual">
                  {allResults.filter(r => r.source === 'manual').length} manual {allResults.filter(r => r.source === 'manual').length === 1 ? 'label' : 'labels'}
                </span>
              )}
            </div>
            <button 
              className="btn-clear-collection"
              onClick={handleClearAllSearches}
              title="Clear all labels"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      <div className="embedding-search-tabs">
        <button
          className={`tab-button ${activeTab === 'embedding' ? 'active' : ''}`}
          onClick={() => setActiveTab('embedding')}
        >
          Multimodal Embedding
        </button>
        <button
          className={`tab-button ${activeTab === 'understanding' ? 'active' : ''}`}
          onClick={() => setActiveTab('understanding')}
        >
          Video Understanding
        </button>
        <button
          className={`tab-button ${activeTab === 'manual' ? 'active' : ''}`}
          onClick={() => setActiveTab('manual')}
        >
          Manual Label
        </button>
      </div>

      {activeTab === 'embedding' ? (
        <div className="embedding-search-content">
          {/* Index Selection Only */}
          <div className="index-selection-full">
            <h3>Select Embedding Index</h3>
            
            {tasksError && (
              <div className="alert alert-error">{tasksError}</div>
            )}
            
            {loadingTasks ? (
              <div className="loading-message">Loading indexes...</div>
            ) : analyzeTasks.filter(t => t.Status === 'completed' && t.Result && t.Result.S3VectorIndex).length > 0 ? (
              <div className="index-grid">
                {analyzeTasks.filter(t => t.Status === 'completed' && t.Result && t.Result.S3VectorIndex).map((task) => (
                  <div
                    key={task.Id}
                    className="index-card clickable"
                    onClick={() => handleSelectTask(task)}
                  >
                    <div className="index-card-header">
                      <span className="index-model">{task.ModelId}</span>
                      <span className="index-type">{task.Type === 'nova-mme' ? 'Nova MME' : 'TwelveLabs'}</span>
                    </div>
                    <div className="index-card-details">
                      {task.Type === 'nova-mme' ? (
                        <span>{task.Request?.DurationS}s • {task.Request?.EmbedMode}</span>
                      ) : (
                        <span>{task.Request?.segmentation?.method || task.Request?.Segmentation?.Method}</span>
                      )}
                      <span className="index-embedding-count">{task.Result?.EmbeddingCount || 0} embeddings</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-indexes-message">
                No embedding indexes available. Please create an embedding task first.
              </div>
            )}
          </div>

          {/* Search Modal */}
          {showSearchModal && selectedTask && createPortal(
            <div className="gt-emb-search-modal-overlay" onClick={handleCloseModal}>
              <div className="gt-emb-search-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="gt-emb-search-modal-header">
                  <h2>Search: {selectedTask.ModelId}</h2>
                  <button className="btn-close-modal" onClick={handleCloseModal}>
                    ✕
                  </button>
                </div>
                
                <div className="gt-emb-search-modal-body">
                  <div className="gt-emb-search-modal-layout">
                    {/* Left: Video Player */}
                    <div className="gt-emb-modal-video-section">
                      <video 
                        ref={videoPlayerRef}
                        src={video.video_url || `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`}
                        controls
                        muted
                        className="gt-emb-modal-video-player"
                      >
                        Your browser does not support the video tag.
                      </video>
                    </div>

                    {/* Right: Search Controls & Results */}
                    <div className="gt-emb-modal-search-section">
                      <div className="gt-emb-search-controls">
                        <input
                          type="text"
                          className="gt-emb-search-input"
                          placeholder="Enter search query..."
                          value={searchText}
                          onChange={(e) => setSearchText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                          disabled={searching}
                        />
                        <div className="gt-emb-search-controls-row">
                          <input
                            type="number"
                            className="gt-emb-topk-input"
                            placeholder="Top K"
                            min="1"
                            max="100"
                            value={topK}
                            onChange={(e) => setTopK(e.target.value)}
                            disabled={searching}
                            title="Number of results (1-100)"
                          />
                          <button 
                            className="gt-emb-btn-search"
                            onClick={handleSearch}
                            disabled={searching || !searchText.trim()}
                          >
                            {searching ? 'Searching...' : 'Search'}
                          </button>
                        </div>
                      </div>
                      
                      {searchError && (
                        <div className="gt-emb-alert gt-emb-alert-error">{searchError}</div>
                      )}

                      {/* Search Results */}
                      {searchResults.length > 0 && (
                        <div className="gt-emb-modal-results-section">
                          <div className="gt-emb-results-header">
                            <h4>{searchResults.length} Results</h4>
                            <button 
                              className="gt-emb-btn-use-results"
                              onClick={handleAcceptSearchResults}
                              title="Add these results to label collection"
                            >
                              ✓ Use Results
                            </button>
                          </div>
                          
                          <div className="gt-emb-results-list">
                            {searchResults.map((result, index) => (
                              <div key={index} className="gt-emb-result-item">
                                <span className="gt-emb-result-rank">#{index + 1}</span>
                                <button 
                                  className="gt-emb-result-time-link"
                                  onClick={() => handleTimeRangeClick(result.StartSec, result.EndSec)}
                                >
                                  {parseFloat(result.StartSec || 0).toFixed(2)}s - {parseFloat(result.EndSec || 0).toFixed(2)}s
                                </button>
                                <span className="gt-emb-result-duration">
                                  {formatDuration(parseFloat(result.EndSec || 0) - parseFloat(result.StartSec || 0))}
                                </span>
                                <span className="gt-emb-result-distance">
                                  {result.Distance?.toFixed(4) || 'N/A'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      ) : activeTab === 'understanding' ? (
        <div className="embedding-search-content">
          <div className="index-selection-full">
            <h3>Video Understanding Tasks</h3>
            
            {tasksError && (
              <div className="alert alert-error">{tasksError}</div>
            )}
            
            {loadingTasks ? (
              <div className="loading-message">Loading tasks...</div>
            ) : analyzeTasks.filter(t => t.Type === 'video-understanding' && t.Status === 'completed' && canParseAsList(t)).length > 0 ? (
              <div className="index-grid">
                {analyzeTasks.filter(t => t.Type === 'video-understanding' && t.Status === 'completed' && canParseAsList(t)).map((task) => (
                  <div
                    key={task.Id}
                    className="index-card clickable"
                    onClick={() => setReviewTask(task)}
                  >
                    <div className="index-card-header">
                      <span className="index-model">{task.ModelId}</span>
                      <span className={`index-status status-${task.Status}`}>{task.Status}</span>
                    </div>
                    {(task.Name || task.Description) && (
                      <div className="task-name-description">
                        {task.Name || task.Description}
                      </div>
                    )}
                    <div className="index-card-details">
                      <span className="task-timestamp">
                        {new Date(task.StartedTs).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-indexes-message">
                No video understanding tasks with list-format results available. Tasks must be completed and have results in a structured list format (with timestamps).
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'manual' ? (
        <ManualLabel 
          video={video}
          allResults={allResults}
          setAllResults={setAllResults}
        />
      ) : null}
      
      {/* Video Understanding Review Modal */}
      {reviewTask && createPortal(
        <div className="gt-vu-review-modal-overlay" onClick={() => setReviewTask(null)}>
          <div className="gt-vu-review-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gt-vu-review-modal-header">
              <h3>Analysis Result</h3>
              <div className="review-modal-actions">
                <button 
                  className="btn-use-vu-results"
                  onClick={handleUseVideoUnderstandingResults}
                  title="Add all items to ground truth collection"
                >
                  ✓ Use Results
                </button>
                <button className="btn-close" onClick={() => setReviewTask(null)}>✕</button>
              </div>
            </div>
            <div className="gt-vu-review-modal-body">
              {/* Left: Video Player */}
              <div className="gt-vu-review-video-section">
                <video
                  ref={reviewVideoRef}
                  controls
                  className="gt-vu-review-video-player"
                  src={video.video_url || `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`}
                >
                  Your browser does not support the video tag.
                </video>
                
                {/* Metadata */}
                <div className="gt-vu-review-metadata-compact">
                  <div className="gt-vu-metadata-row">
                    <div className="gt-vu-metadata-compact-item">
                      <span className="gt-vu-metadata-compact-label">Task:</span>
                      <span className="gt-vu-metadata-compact-value">{reviewTask.Name || reviewTask.Description || 'N/A'}</span>
                    </div>
                    <div className="gt-vu-metadata-compact-item">
                      <span className="gt-vu-metadata-compact-label">Model:</span>
                      <span className="gt-vu-metadata-compact-value">{reviewTask.ModelId || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="gt-vu-metadata-row gt-vu-metadata-row--full">
                    <div className="gt-vu-metadata-compact-item gt-vu-metadata-compact-item--full">
                      <span className="gt-vu-metadata-compact-label">Prompt:</span>
                      <span className="gt-vu-metadata-compact-value gt-vu-metadata-compact-value--prompt">{reviewTask.Request?.Prompt || reviewTask.Request?.InputPrompt || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Right: Analysis Result */}
              <div className="gt-vu-review-result-section">
                {/* Tabs */}
                <div className="gt-vu-review-tabs">
                  <button
                    className={`gt-vu-review-tab ${reviewTab === 'formatted' ? 'gt-vu-review-tab--active' : ''}`}
                    onClick={() => setReviewTab('formatted')}
                  >
                    Formatted Result
                  </button>
                  <button
                    className={`gt-vu-review-tab ${reviewTab === 'raw' ? 'gt-vu-review-tab--active' : ''}`}
                    onClick={() => setReviewTab('raw')}
                  >
                    Raw Response
                  </button>
                </div>
                
                {/* Tab Content */}
                <div className="gt-vu-review-tab-content">
                  {reviewTab === 'formatted' ? (
                    <div className="gt-vu-review-formatted">
                      {(() => {
                        let content = reviewTask.Result?.Response?.content || reviewTask.Result?.Response?.message || reviewTask.Result?.Response || reviewTask.Result?.message || 'No content available'
                        
                        if (typeof content === 'string') {
                          try {
                            const parsed = JSON.parse(content)
                            
                            // Direct array format
                            if (Array.isArray(parsed)) {
                              const hasTimestamps = parsed.length > 0 && parsed[0].start_time && parsed[0].end_time
                              
                              if (hasTimestamps) {
                                return (
                                  <div className="gt-vu-scenes-list">
                                    {parsed.map((item, index) => (
                                      <div 
                                        key={index} 
                                        className="gt-vu-scene-item gt-vu-scene-item--clickable"
                                        onClick={() => handleSceneClick(item.start_time, item.end_time)}
                                        title="Click to play this segment"
                                      >
                                        <div className="gt-vu-scene-header">
                                          <span className="gt-vu-scene-number">Item {index + 1}</span>
                                          <span className="gt-vu-scene-time">
                                            {item.start_time} - {item.end_time}
                                          </span>
                                        </div>
                                        <div className="gt-vu-scene-description">
                                          {item.description || item.text || JSON.stringify(item)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )
                              }
                            }
                            
                            // TwelveLabs Pegasus format
                            if (parsed.name === 'video_analysis' && parsed.scenes && Array.isArray(parsed.scenes)) {
                              return (
                                <div className="gt-vu-scenes-list">
                                  {parsed.scenes.map((scene, index) => (
                                    <div 
                                      key={index} 
                                      className="gt-vu-scene-item gt-vu-scene-item--clickable"
                                      onClick={() => handleSceneClick(scene.start_time, scene.end_time)}
                                      title="Click to play this segment"
                                    >
                                      <div className="gt-vu-scene-header">
                                        <span className="gt-vu-scene-number">Scene {index + 1}</span>
                                        <span className="gt-vu-scene-time">
                                          {scene.start_time} - {scene.end_time}
                                        </span>
                                      </div>
                                      <div className="gt-vu-scene-description">
                                        {scene.description}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )
                            }
                            
                            // Gemini format with summary and scenes
                            if (parsed.summary || (parsed.scenes && Array.isArray(parsed.scenes))) {
                              return (
                                <div>
                                  {parsed.summary && (
                                    <div className="gt-vu-review-description">
                                      <h4>Summary</h4>
                                      <p>{parsed.summary}</p>
                                    </div>
                                  )}
                                  
                                  {parsed.scenes && Array.isArray(parsed.scenes) && (
                                    <div>
                                      {parsed.summary && <h4>Scenes</h4>}
                                      <div className="gt-vu-scenes-list">
                                        {parsed.scenes.map((scene, index) => (
                                          <div 
                                            key={index} 
                                            className="gt-vu-scene-item gt-vu-scene-item--clickable"
                                            onClick={() => handleSceneClick(scene.start_time, scene.end_time)}
                                            title="Click to play this segment"
                                          >
                                            <div className="gt-vu-scene-header">
                                              <span className="gt-vu-scene-number">Scene {index + 1}</span>
                                              <span className="gt-vu-scene-time">
                                                {scene.start_time} - {scene.end_time}
                                              </span>
                                            </div>
                                            <div className="gt-vu-scene-description">
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
                            
                            // Nova format with key_moments
                            if (parsed.description || (parsed.key_moments && Array.isArray(parsed.key_moments))) {
                              return (
                                <div>
                                  {parsed.description && (
                                    <div className="gt-vu-review-description">
                                      <h4>Description</h4>
                                      <p>{parsed.description}</p>
                                    </div>
                                  )}
                                  
                                  {parsed.key_moments && Array.isArray(parsed.key_moments) && (
                                    <div>
                                      {parsed.description && <h4>Key Moments</h4>}
                                      <div className="gt-vu-scenes-list">
                                        {parsed.key_moments.map((moment, index) => (
                                          <div 
                                            key={index} 
                                            className="gt-vu-scene-item gt-vu-scene-item--clickable"
                                            onClick={() => handleSceneClick(moment.start_time, moment.end_time)}
                                            title="Click to play this segment"
                                          >
                                            <div className="gt-vu-scene-header">
                                              <span className="gt-vu-scene-number">Moment {index + 1}</span>
                                              <span className="gt-vu-scene-time">
                                                {moment.start_time}s - {moment.end_time}s
                                              </span>
                                            </div>
                                            <div className="gt-vu-scene-description">
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
                            
                            return (
                              <div className="gt-vu-review-no-format">
                                <p>Response is not in expected JSON format. Switch to "Raw Response" tab to view the content.</p>
                              </div>
                            )
                          } catch (e) {
                            if (content.length > 50) {
                              return (
                                <div className="gt-vu-review-description">
                                  <h4>Response</h4>
                                  <p style={{ whiteSpace: 'pre-wrap' }}>{content}</p>
                                </div>
                              )
                            }
                            return (
                              <div className="gt-vu-review-no-format">
                                <p>Response is not in JSON format. Switch to "Raw Response" tab to view the content.</p>
                              </div>
                            )
                          }
                        }
                        
                        return (
                          <div className="gt-vu-review-no-format">
                            <p>Response is not in expected format. Switch to "Raw Response" tab to view the content.</p>
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <div className="gt-vu-review-raw">
                      <pre className="gt-vu-response-text">
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
        </div>,
        document.body
      )}
    </div>
  )
}

export default EmbeddingSearch
