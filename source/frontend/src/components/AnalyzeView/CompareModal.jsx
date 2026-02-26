import './CompareModal.css'

function CompareModal({
  show,
  onClose,
  video,
  selectedTasks,
  compareSearchText,
  setCompareSearchText,
  compareTopK,
  setCompareTopK,
  compareLoading,
  compareError,
  compareResults,
  onSearch,
  modalVideoPlayerRef,
  onTimeRangeClick,
  formatDuration,
  formatResolution,
  formatFps,
  formatFileSize
}) {
  if (!show) return null

  return (
    <div className="compare-modal-wrapper">
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content compare-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
          <h2>{selectedTasks.length === 1 ? 'Search Embeddings' : `Compare Embeddings (${selectedTasks.length} tasks)`}</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
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
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
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
              onClick={onSearch}
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
                                onClick={() => onTimeRangeClick(result.StartSec, result.EndSec)}
                                title="Click to navigate video to this timestamp"
                              >
                                {parseFloat(result.StartSec || 0).toFixed(2)}s-{parseFloat(result.EndSec || 0).toFixed(2)}s
                              </button>
                              <span className="result-distance">Dist: {result.Distance?.toFixed(4) || 'N/A'}</span>
                            </div>
                          ))}
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
    </div>
  )
}

export default CompareModal
