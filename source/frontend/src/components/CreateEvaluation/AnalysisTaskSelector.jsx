import { useState } from 'react'
import { FetchPost } from '../../utils/apiHelper'

function AnalysisTaskSelector({
  selectedVideo,
  analyzeTasks,
  selectedAnalyzeTask,
  loadingAnalyzeTasks,
  tasksError,
  onAnalyzeTaskSelect,
  onPrevious,
  onNext,
  videoPlayerRef
}) {
  const [activeTab, setActiveTab] = useState('embedding')
  const [searchText, setSearchText] = useState('')
  const [searchTopK, setSearchTopK] = useState(10)
  const [searchResults, setSearchResults] = useState([])
  const [allSearches, setAllSearches] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)

  const handleSearch = async () => {
    if (!searchText.trim()) {
      setSearchError('Please enter a search query')
      return
    }

    if (!selectedAnalyzeTask) {
      setSearchError('Please select an analyze task first')
      return
    }

    setSearchLoading(true)
    setSearchError(null)

    try {
      const payload = {
        TaskId: selectedAnalyzeTask.Id,
        SearchText: searchText,
        InputType: 'text',
        TopK: parseInt(searchTopK) || 10,
        PageSize: 1000,
        FromIndex: 0,
        IncludeVideoUrl: true,
        EmbeddingOptions: ['audio-video', 'video', 'audio']
      }

      let endpoint = '/video/nova-mme-search-vector'
      if (selectedAnalyzeTask.Type === 'tlabs-mme') {
        endpoint = '/video/tlabs-mme-search-vector'
      }

      const data = await FetchPost(endpoint, payload, 'EvalService')
      
      if (data.statusCode === 200) {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        const newResults = responseBody || []
        
        const searchEntry = {
          query: searchText,
          topK: searchTopK,
          results: newResults,
          timestamp: new Date().toISOString()
        }
        
        setAllSearches(prev => [...prev, searchEntry])
        setSearchResults(prev => [...prev, ...newResults])
        setSearchText('')
      } else {
        const errorMessage = typeof data.body === 'object' && data.body.error 
          ? data.body.error 
          : data.body
        setSearchError(errorMessage || 'Search failed')
      }
    } catch (err) {
      console.error('Error searching embeddings:', err)
      setSearchError('Search failed: ' + err.message)
    } finally {
      setSearchLoading(false)
    }
  }

  const handleClearSearches = () => {
    setSearchResults([])
    setAllSearches([])
    setSearchText('')
    setSearchError(null)
  }

  const handleRemoveSearch = (index) => {
    const updatedSearches = allSearches.filter((_, idx) => idx !== index)
    setAllSearches(updatedSearches)
    
    const combinedResults = updatedSearches.flatMap(search => search.results)
    setSearchResults(combinedResults)
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

  const handleNextStep = () => {
    onNext(searchResults, allSearches)
  }

  return (
    <div className="step-content">
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
          {loadingAnalyzeTasks ? (
            <p>Loading analyze tasks...</p>
          ) : tasksError ? (
            <div className="alert alert-error">{tasksError}</div>
          ) : analyzeTasks.length === 0 ? (
            <p className="no-data">No analyze tasks available. Please create one from the Analyze view first.</p>
          ) : (
            <>
              <div className="analyze-task-section">
                <h3>Select Index</h3>
                <div className="analyze-task-list">
                  {analyzeTasks.map(task => (
                    <div
                      key={task.Id}
                      className={`analyze-task-item ${selectedAnalyzeTask?.Id === task.Id ? 'selected' : ''}`}
                      onClick={() => onAnalyzeTaskSelect(task)}
                    >
                      <div className="task-info">
                        <input
                          type="radio"
                          name="analyzeTask"
                          checked={selectedAnalyzeTask?.Id === task.Id}
                          onChange={() => onAnalyzeTaskSelect(task)}
                          className="task-radio"
                        />
                        <div className="task-details">
                          <div className="task-name">
                            {task.Type === 'nova-mme' ? 'Nova MME' : 'TwelveLabs'} - {task.ModelId}
                          </div>
                          <div className="task-meta">
                            Status: {task.Status} • Created {new Date(task.CreatedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      {selectedAnalyzeTask?.Id === task.Id && (
                        <div className="selection-checkmark">✓</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {selectedAnalyzeTask && (
                <div className="search-section">
                  <h3>Search Index</h3>
                  
                  <div className="video-preview">
                    <video 
                      ref={videoPlayerRef}
                      src={selectedVideo.video_url || `https://${selectedVideo.S3Bucket}.s3.us-east-1.amazonaws.com/${selectedVideo.S3KeyVideo}`}
                      controls
                      muted
                      className="preview-video-player"
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>

                  <div className="search-controls">
                    <input
                      type="text"
                      className="search-text-input"
                      placeholder="Enter search query..."
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      disabled={searchLoading}
                    />
                    <input
                      type="number"
                      className="search-topk-input"
                      placeholder="Top K"
                      min="1"
                      max="100"
                      value={searchTopK}
                      onChange={(e) => setSearchTopK(e.target.value)}
                      disabled={searchLoading}
                      title="Number of results to return (1-100)"
                    />
                    <button 
                      className="btn-search"
                      onClick={handleSearch}
                      disabled={searchLoading || !searchText.trim()}
                    >
                      {searchLoading ? 'Searching...' : allSearches.length > 0 ? 'Add Search' : 'Search'}
                    </button>
                    {allSearches.length > 0 && (
                      <button 
                        className="btn-clear-searches"
                        onClick={handleClearSearches}
                        title="Clear all searches"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {searchError && (
                    <div className="alert alert-error">{searchError}</div>
                  )}

                  {allSearches.length > 0 && (
                    <div className="search-history">
                      <h4>Search History ({allSearches.length} {allSearches.length === 1 ? 'query' : 'queries'})</h4>
                      <div className="search-history-list">
                        {allSearches.map((search, idx) => (
                          <div key={idx} className="search-history-item">
                            <div className="search-history-info">
                              <span className="search-history-query">"{search.query}"</span>
                              <span className="search-history-meta">
                                {search.results.length} results • Top {search.topK}
                              </span>
                            </div>
                            <button 
                              className="btn-remove-search"
                              onClick={() => handleRemoveSearch(idx)}
                              title="Remove this search"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults.length > 0 && (
                    <div className="search-results">
                      <div className="results-header">
                        <h4>Combined Search Results ({searchResults.length} total segments)</h4>
                      </div>
                      <div className="results-list">
                        {searchResults.map((result, index) => (
                          <div key={index} className="result-item">
                            <span className="result-rank">#{index + 1}</span>
                            <button 
                              className="time-range-link"
                              onClick={() => handleTimeRangeClick(result.StartSec, result.EndSec)}
                              title="Click to navigate video to this timestamp"
                            >
                              {parseFloat(result.StartSec || 0).toFixed(2)}s - {parseFloat(result.EndSec || 0).toFixed(2)}s
                            </button>
                            <span className="result-distance">Distance: {result.Distance?.toFixed(4) || 'N/A'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'understanding' && (
        <div className="tab-content">
          <div className="coming-soon-section">
            <p>Video Understanding features coming soon.</p>
          </div>
        </div>
      )}

      <div className="step-actions">
        <button className="btn-secondary" onClick={onPrevious}>Back</button>
        <button 
          className="btn-primary" 
          onClick={handleNextStep}
          disabled={!selectedAnalyzeTask || searchResults.length === 0}
        >
          Next: Generate Report
        </button>
      </div>
    </div>
  )
}

export default AnalysisTaskSelector
