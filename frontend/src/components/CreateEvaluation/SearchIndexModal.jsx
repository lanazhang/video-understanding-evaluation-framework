import { useState, useRef } from 'react'
import { FetchPost } from '../../utils/apiHelper'
import './SearchIndexModal.css'
import { searchEndpoint } from '../../utils/embeddingTasks'
import { embeddingTaskParamRows, segmentSummary } from '../../utils/embeddingParams'

function SearchIndexModal({ 
  selectedVideo,
  selectedAnalyzeTask,
  onClose,
  onSearchComplete,
  initialSearchResults = [],
  initialAllSearches = []
}) {
  const [searchText, setSearchText] = useState('')
  const [searchTopK, setSearchTopK] = useState(10)
  const [searchResults, setSearchResults] = useState(initialSearchResults)
  const [allSearches, setAllSearches] = useState(initialAllSearches)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const videoPlayerRef = useRef(null)

  const handleSearch = async () => {
    if (!searchText.trim()) {
      setSearchError('Please enter a search query')
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

      const endpoint = searchEndpoint(selectedAnalyzeTask)

      const data = await FetchPost(endpoint, payload, 'EvalService')
      
      let results = []
      
      if (Array.isArray(data)) {
        results = data
      } else if (data.statusCode === 200) {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        results = Array.isArray(responseBody) ? responseBody : (responseBody || [])
      } else if (data.statusCode) {
        const errorMessage = typeof data.body === 'object' && data.body.error 
          ? data.body.error 
          : (typeof data.body === 'string' ? data.body : 'Search failed')
        setSearchError(errorMessage)
        return
      } else {
        results = Array.isArray(data) ? data : []
      }
      
      const searchEntry = {
        taskId: selectedAnalyzeTask.Id,
        query: searchText,
        topK: searchTopK,
        results: results,
        timestamp: new Date().toISOString()
      }
      
      setAllSearches(prev => [...prev, searchEntry])
      setSearchResults(prev => [...prev, ...results])
      setSearchText('')
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
    if (videoPlayerRef?.current) {
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

  const handleDone = () => {
    onSearchComplete(searchResults, allSearches)
    onClose()
  }

  return (
    <div className="search-modal-overlay" onClick={onClose}>
      <div className="search-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="search-modal-header">
          <h2>Search Embedding Index</h2>
          <button className="search-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="search-modal-body">
          <div className="video-and-history-column">
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
              <div className="index-metadata-display">
                <span className="metadata-value">{selectedAnalyzeTask?.ModelId || 'N/A'}</span>
                {selectedAnalyzeTask?.Type === 'nova-mme' && (
                  <>
                    <span className="metadata-separator">•</span>
                    <span className="metadata-value">Dim: {selectedAnalyzeTask?.Request?.EmbeddingDim || 'N/A'}</span>
                    <span className="metadata-separator">•</span>
                    <span className="metadata-value">{selectedAnalyzeTask?.Request?.EmbedMode || 'N/A'}</span>
                    <span className="metadata-separator">•</span>
                    <span className="metadata-value">{segmentSummary(selectedAnalyzeTask?.Request)}</span>
                  </>
                )}
                {selectedAnalyzeTask?.Type === 'embedding' && embeddingTaskParamRows(selectedAnalyzeTask).filter(r => r.label !== 'Provider' && r.label !== 'Input Tokens').map(row => (
                  <span key={row.label}>
                    <span className="metadata-separator">•</span>
                    <span className="metadata-value">{row.label}: {row.value}</span>
                  </span>
                ))}
                {selectedAnalyzeTask?.Type === 'tlabs-mme' && (
                  <>
                    <span className="metadata-separator">•</span>
                    <span className="metadata-value">
                      {selectedAnalyzeTask?.Request?.Segmentation?.Method || 
                       selectedAnalyzeTask?.Request?.segmentation?.method || 'N/A'}
                    </span>
                    {(selectedAnalyzeTask?.Request?.EmbeddingScope || selectedAnalyzeTask?.Request?.embeddingScope) && (
                      <>
                        <span className="metadata-separator">•</span>
                        <span className="metadata-value">
                          {(() => {
                            const scope = selectedAnalyzeTask?.Request?.EmbeddingScope || selectedAnalyzeTask?.Request?.embeddingScope;
                            return Array.isArray(scope) ? scope.join(', ') : scope;
                          })()}
                        </span>
                      </>
                    )}
                  </>
                )}
                <span className="metadata-separator">•</span>
                <span className="metadata-value">{selectedAnalyzeTask?.Result?.EmbeddingCount || 0} embeddings</span>
              </div>
            </div>

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
          </div>

          <div className="search-controls-panel">
            <div className="search-controls">
              <div className="search-inputs-row">
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
              </div>
            </div>

            {searchError && (
              <div className="alert alert-error">{searchError}</div>
            )}

            {searchResults.length > 0 && (
              <div className="search-results">
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
        </div>

        <div className="search-modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button 
            className="btn-primary" 
            onClick={handleDone}
            disabled={searchResults.length === 0}
          >
            Done ({searchResults.length} results)
          </button>
        </div>
      </div>
    </div>
  )
}

export default SearchIndexModal
