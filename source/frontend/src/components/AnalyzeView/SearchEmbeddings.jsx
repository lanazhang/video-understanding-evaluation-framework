import { useMemo } from 'react'
import './SearchEmbeddings.css'

function SearchEmbeddings({
  video,
  selectedTasks,
  compareSearchText,
  setCompareSearchText,
  compareTopK,
  setCompareTopK,
  compareEmbeddingType,
  setCompareEmbeddingType,
  compareLoading,
  compareError,
  compareResults,
  onSearch,
  onClose,
  videoPlayerRef,
  onTimeRangeClick,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder
}) {
  const isCompareMode = selectedTasks.length > 1

  // Sort results based on sortBy and sortOrder
  const sortResults = (results) => {
    if (!results || results.length === 0) return results
    
    const sorted = [...results]
    sorted.sort((a, b) => {
      let compareValue = 0
      
      if (sortBy === 'distance') {
        compareValue = (a.Distance || 0) - (b.Distance || 0)
      } else if (sortBy === 'timestamp') {
        const aStart = parseFloat(a.StartSec || 0)
        const bStart = parseFloat(b.StartSec || 0)
        compareValue = aStart - bStart
      }
      
      return sortOrder === 'asc' ? compareValue : -compareValue
    })
    
    return sorted
  }

  // Memoize sorted results for each task
  const sortedCompareResults = useMemo(() => {
    const sorted = {}
    Object.keys(compareResults).forEach(taskId => {
      const taskResult = compareResults[taskId]
      if (taskResult && taskResult.results) {
        sorted[taskId] = {
          ...taskResult,
          results: sortResults(taskResult.results)
        }
      } else {
        sorted[taskId] = taskResult
      }
    })
    return sorted
  }, [compareResults, sortBy, sortOrder])

  return (
    <div className="search-embeddings-wrapper">
      <div className="se-modal-overlay" onClick={onClose}>
        <div className={`se-modal-container ${isCompareMode ? 'compare-mode' : 'single-mode'}`} onClick={(e) => e.stopPropagation()}>
        <div className="se-modal-header">
          <h3>
            {isCompareMode ? `Compare Embeddings (${selectedTasks.length} tasks)` : 'Search Embeddings'}
          </h3>
          <button className="se-modal-btn-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        {isCompareMode ? (
          <div className="search-modal-content-compare">
            <div className="search-modal-video-section-compare">
              <video 
                ref={videoPlayerRef}
                src={video.video_url || `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`}
                controls
                muted
                className="search-modal-video-player-compare"
              >
                Your browser does not support the video tag.
              </video>
            </div>

            <div className="search-controls-compare">
              <input
                type="text"
                className="search-text-input"
                placeholder="Enter search query..."
                value={compareSearchText}
                onChange={(e) => setCompareSearchText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                disabled={compareLoading}
              />
              <select
                className="search-topk-input"
                value={compareEmbeddingType}
                onChange={(e) => setCompareEmbeddingType(e.target.value)}
                disabled={compareLoading}
                title="Filter by embedding type"
              >
                <option value="all">All</option>
                <option value="audio-video">Video + Audio</option>
                <option value="video">Video Only</option>
                <option value="audio">Audio Only</option>
              </select>
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
                onClick={onSearch}
                disabled={compareLoading || !compareSearchText.trim()}
              >
                {compareLoading ? 'Searching...' : 'Search All'}
              </button>
              
              <div className="sort-controls">
                <label className="sort-label">Sort by:</label>
                <select 
                  className="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  disabled={compareLoading}
                >
                  <option value="distance">Distance</option>
                  <option value="timestamp">Timestamp</option>
                </select>
                <button 
                  className="sort-order-btn"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  disabled={compareLoading}
                  title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>
            
            {compareError && (
              <div className="alert alert-error">{compareError}</div>
            )}

            <div className="search-results-compare-grid">
              {selectedTasks.map((task) => {
                const hasResults = sortedCompareResults[task.Id]
                const resultData = hasResults ? sortedCompareResults[task.Id] : null
                
                let tooltipContent = ''
                if (task.Type === 'nova-mme') {
                  tooltipContent = `Duration: ${task.Request?.DurationS || 'N/A'}s\nEmbed Mode: ${task.Request?.EmbedMode || 'N/A'}\nDimension: ${task.Request?.EmbeddingDim || 'N/A'}`
                } else if (task.Type === 'tlabs-mme') {
                  const segMethod = task.Request?.Segmentation?.Method || task.Request?.segmentation?.method || 'N/A'
                  const minDur = task.Request?.Segmentation?.Dynamic?.MinDurationSec || 
                                 task.Request?.segmentation?.dynamic?.minDurationSec || 
                                 task.Request?.Segmentation?.Fixed?.DurationSec || 
                                 task.Request?.segmentation?.fixed?.durationSec || 'N/A'
                  const scopeValue = task.Request?.EmbeddingScope || task.Request?.embeddingScope
                  const scope = Array.isArray(scopeValue) ? scopeValue.join(', ') : (scopeValue || 'N/A')
                  const optionsValue = task.Request?.EmbeddingOption || task.Request?.embeddingOption
                  const options = Array.isArray(optionsValue) ? optionsValue.join(', ') : (optionsValue || 'N/A')
                  tooltipContent = `Segmentation: ${segMethod}\nDuration: ${minDur}s\nScope: ${scope}\nOptions: ${options}`
                }
                
                return (
                  <div key={task.Id} className="search-result-compare-column">
                    <div className="search-result-compare-header" title={tooltipContent}>
                      <h4>
                        {task.Name || task.Description || (task.Type === 'nova-mme' ? 'Nova MME' : 'TwelveLabs')}
                        <span className="info-icon" title={tooltipContent}>ⓘ</span>
                      </h4>
                      {resultData && resultData.results.length > 0 && (
                        <span className="search-result-count">{resultData.results.length} results</span>
                      )}
                    </div>
                    
                    {!hasResults ? (
                      <div className="no-results-message">Waiting for search...</div>
                    ) : resultData.error ? (
                      <div className="alert alert-error">{resultData.error}</div>
                    ) : resultData.results.length > 0 ? (
                      <div className="results-list-compare">
                        {resultData.results.map((result, index) => (
                          <div key={index} className="result-item-compare">
                            <span className="result-rank">#{index + 1}</span>
                            <button 
                              className="time-range-link"
                              onClick={() => onTimeRangeClick(result.StartSec, result.EndSec)}
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
        ) : (
          <div className="se-modal-content-single">
            <div className="se-modal-video-left">
              <video 
                ref={videoPlayerRef}
                src={video.video_url || `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`}
                controls
                muted
                className="se-modal-video-player"
              >
                Your browser does not support the video tag.
              </video>
            </div>

            <div className="se-modal-controls-right">
              <div className="se-modal-search-controls">
                <div className="se-modal-controls-row">
                  <input
                    type="text"
                    className="se-modal-text-input"
                    placeholder="Enter search query..."
                    value={compareSearchText}
                    onChange={(e) => setCompareSearchText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                    disabled={compareLoading}
                  />
                  <input
                    type="number"
                    className="se-modal-topk-input"
                    placeholder="Top K"
                    min="1"
                    max="100"
                    value={compareTopK}
                    onChange={(e) => setCompareTopK(e.target.value)}
                    disabled={compareLoading}
                    title="Number of results to return (1-100)"
                  />
                  <button 
                    className="se-modal-btn-search"
                    onClick={onSearch}
                    disabled={compareLoading || !compareSearchText.trim()}
                  >
                    {compareLoading ? 'Searching...' : 'Search'}
                  </button>
                </div>
                
                <div className="se-modal-sort-controls">
                  <select
                    className="se-modal-embedding-type-select"
                    value={compareEmbeddingType}
                    onChange={(e) => setCompareEmbeddingType(e.target.value)}
                    disabled={compareLoading}
                    title="Filter by embedding type"
                  >
                    <option value="all">All</option>
                    <option value="audio-video">Video + Audio</option>
                    <option value="video">Video Only</option>
                    <option value="audio">Audio Only</option>
                  </select>
                  <label className="se-modal-sort-label">Sort by:</label>
                  <select 
                    className="se-modal-sort-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    disabled={compareLoading}
                  >
                    <option value="distance">Distance</option>
                    <option value="timestamp">Timestamp</option>
                  </select>
                  <button 
                    className="se-modal-sort-order-btn"
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    disabled={compareLoading}
                    title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              </div>
              
              {compareError && (
                <div className="se-modal-alert se-modal-alert-error">{compareError}</div>
              )}
              
              <div className="se-modal-results-container">
                {selectedTasks.map((task) => {
                  const hasResults = sortedCompareResults[task.Id]
                  const resultData = hasResults ? sortedCompareResults[task.Id] : null
                  
                  let tooltipContent = ''
                  if (task.Type === 'nova-mme') {
                    tooltipContent = `Duration: ${task.Request?.DurationS || 'N/A'}s\nEmbed Mode: ${task.Request?.EmbedMode || 'N/A'}\nDimension: ${task.Request?.EmbeddingDim || 'N/A'}`
                  } else if (task.Type === 'tlabs-mme') {
                    const segMethod = task.Request?.Segmentation?.Method || task.Request?.segmentation?.method || 'N/A'
                    const minDur = task.Request?.Segmentation?.Dynamic?.MinDurationSec || 
                                   task.Request?.segmentation?.dynamic?.minDurationSec || 
                                   task.Request?.Segmentation?.Fixed?.DurationSec || 
                                   task.Request?.segmentation?.fixed?.durationSec || 'N/A'
                    const scopeValue = task.Request?.EmbeddingScope || task.Request?.embeddingScope
                    const scope = Array.isArray(scopeValue) ? scopeValue.join(', ') : (scopeValue || 'N/A')
                    const optionsValue = task.Request?.EmbeddingOption || task.Request?.embeddingOption
                    const options = Array.isArray(optionsValue) ? optionsValue.join(', ') : (optionsValue || 'N/A')
                    tooltipContent = `Segmentation: ${segMethod}\nDuration: ${minDur}s\nScope: ${scope}\nOptions: ${options}`
                  }
                  
                  return (
                    <div key={task.Id} className="se-modal-result-column">
                      <div className="se-modal-result-header" title={tooltipContent}>
                        <h4>
                          {task.Name || task.Description || (task.Type === 'nova-mme' ? 'Nova MME' : 'TwelveLabs')}
                          <span className="se-modal-info-icon" title={tooltipContent}>ⓘ</span>
                        </h4>
                        {resultData && resultData.results.length > 0 && (
                          <span className="se-modal-result-count">{resultData.results.length} results</span>
                        )}
                      </div>
                      
                      {!hasResults ? (
                        <div className="se-modal-no-results">Waiting for search...</div>
                      ) : resultData.error ? (
                        <div className="se-modal-alert se-modal-alert-error">{resultData.error}</div>
                      ) : resultData.results.length > 0 ? (
                        <div className="se-modal-results-list">
                          {resultData.results.map((result, index) => (
                            <div key={index} className="se-modal-result-item">
                              <span className="se-modal-result-rank">#{index + 1}</span>
                              <button 
                                className="se-modal-time-link"
                                onClick={() => onTimeRangeClick(result.StartSec, result.EndSec)}
                                title="Click to navigate video to this timestamp"
                              >
                                {parseFloat(result.StartSec || 0).toFixed(2)}s-{parseFloat(result.EndSec || 0).toFixed(2)}s
                              </button>
                              <span className="se-modal-result-distance">Dist: {result.Distance?.toFixed(4) || 'N/A'}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="se-modal-no-results">No results found</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

export default SearchEmbeddings
