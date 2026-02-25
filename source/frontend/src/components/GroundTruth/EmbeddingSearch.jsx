import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './EmbeddingSearch.css'
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
  
  const videoPlayerRef = useRef(null)

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
          setTasksError(errorMessage || 'Failed to load embedding indexes')
          return
        }
      } else {
        // Direct response format
        responseBody = data
      }
      
      const allTasks = responseBody.Tasks || []
      // Only show completed tasks with vector indexes
      const completedTasks = allTasks.filter(t => t.Status === 'completed' && t.Result && t.Result.S3VectorIndex)
      setAnalyzeTasks(completedTasks)
    } catch (err) {
      console.error('Error loading analyze tasks:', err)
      setTasksError('Failed to load embedding indexes')
    } finally {
      setLoadingTasks(false)
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
              {allSearches.length > 0 && (
                <span className="badge badge-embedding">
                  {allSearches.length} embedding {allSearches.length === 1 ? 'search' : 'searches'}
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
            ) : analyzeTasks.length > 0 ? (
              <div className="index-grid">
                {analyzeTasks.map((task) => (
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
            <div className="search-modal-overlay" onClick={handleCloseModal}>
              <div className="search-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="search-modal-header">
                  <h2>Search: {selectedTask.ModelId}</h2>
                  <button className="btn-close-modal" onClick={handleCloseModal}>
                    ✕
                  </button>
                </div>
                
                <div className="search-modal-body">
                  <div className="search-modal-layout">
                    {/* Left: Video Player */}
                    <div className="modal-video-section">
                      <video 
                        ref={videoPlayerRef}
                        src={video.video_url || `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`}
                        controls
                        muted
                        className="modal-video-player"
                      >
                        Your browser does not support the video tag.
                      </video>
                    </div>

                    {/* Right: Search Controls & Results */}
                    <div className="modal-search-section">
                      <div className="search-controls">
                        <input
                          type="text"
                          className="search-input"
                          placeholder="Enter search query..."
                          value={searchText}
                          onChange={(e) => setSearchText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                          disabled={searching}
                        />
                        <div className="search-controls-row">
                          <input
                            type="number"
                            className="topk-input"
                            placeholder="Top K"
                            min="1"
                            max="100"
                            value={topK}
                            onChange={(e) => setTopK(e.target.value)}
                            disabled={searching}
                            title="Number of results (1-100)"
                          />
                          <button 
                            className="btn-search"
                            onClick={handleSearch}
                            disabled={searching || !searchText.trim()}
                          >
                            {searching ? 'Searching...' : 'Search'}
                          </button>
                        </div>
                      </div>
                      
                      {searchError && (
                        <div className="alert alert-error">{searchError}</div>
                      )}

                      {/* Search Results */}
                      {searchResults.length > 0 && (
                        <div className="modal-results-section">
                          <div className="results-header">
                            <h4>{searchResults.length} Results</h4>
                            <button 
                              className="btn-use-results"
                              onClick={handleAcceptSearchResults}
                              title="Add these results to label collection"
                            >
                              ✓ Use Results
                            </button>
                          </div>
                          
                          <div className="results-list">
                            {searchResults.map((result, index) => (
                              <div key={index} className="result-item">
                                <span className="result-rank">#{index + 1}</span>
                                <button 
                                  className="result-time-link"
                                  onClick={() => handleTimeRangeClick(result.StartSec, result.EndSec)}
                                >
                                  {parseFloat(result.StartSec || 0).toFixed(2)}s - {parseFloat(result.EndSec || 0).toFixed(2)}s
                                </button>
                                <span className="result-duration">
                                  {formatDuration(parseFloat(result.EndSec || 0) - parseFloat(result.StartSec || 0))}
                                </span>
                                <span className="result-distance">
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
        <div className="coming-soon-section">
          <p>Video Understanding features coming soon.</p>
        </div>
      ) : activeTab === 'manual' ? (
        <ManualLabel 
          video={video}
          allResults={allResults}
          setAllResults={setAllResults}
        />
      ) : null}
    </div>
  )
}

export default EmbeddingSearch
