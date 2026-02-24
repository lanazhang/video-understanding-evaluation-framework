import { useState, useRef } from 'react'
import './CompareModal.css'
import { FetchPost } from '../../utils/apiHelper'

function CompareModal({ video, selectedTasks, onClose, onGroundTruthSaved, isGroundTruthMode = false, currentUser }) {
  const [compareSearchText, setCompareSearchText] = useState('')
  const [compareTopK, setCompareTopK] = useState(10)
  const [compareResults, setCompareResults] = useState({})
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState(null)
  
  const modalVideoPlayerRef = useRef(null)

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
    if (modalVideoPlayerRef.current) {
      const videoEl = modalVideoPlayerRef.current
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
      return
    }

    try {
      const groundTruthId = crypto.randomUUID()

      const labels = results.map(result => ({
        StartTs: parseFloat(parseFloat(result.StartSec || 0).toFixed(3)),
        EndTs: parseFloat(parseFloat(result.EndSec || 0).toFixed(3)),
        Score: parseFloat(result.Distance || 0),
        Label: compareSearchText,
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

      const data = await FetchPost('/video/upsert-ground-truth', payload, 'EvalService')

      if (data.statusCode === 200) {
        console.log(`Ground truth "${groundTruthName}" saved successfully with ${labels.length} labels`)
      } else {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        const errorMessage = responseBody?.error || data.body || 'Failed to save ground truth'
        console.error('Failed to save ground truth:', errorMessage)
      }
    } catch (err) {
      console.error('Error saving ground truth:', err)
    } finally {
      // Always trigger callback and close, regardless of success or failure
      if (onGroundTruthSaved) {
        onGroundTruthSaved()
      }
      if (isGroundTruthMode) {
        onClose()
      }
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

  const formatFps = (fps) => {
    if (!fps) return 'N/A'
    return `${Math.round(fps)} fps`
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content compare-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{selectedTasks.length === 1 ? 'Search Embeddings' : `Compare Embeddings (${selectedTasks.length} tasks)`}</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body-compare">
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
          
          <div className="compare-results-container">
            <div className="compare-results-grid">
              {selectedTasks.map((task) => {
                const hasResults = compareResults[task.Id]
                const resultData = hasResults ? compareResults[task.Id] : null
                
                return (
                  <div key={task.Id} className="compare-result-column">
                    <div className="compare-result-header">
                      <h4>
                        {task.Type === 'nova-mme' ? 'Nova MME' : 'TwelveLabs'}
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
                          <button 
                            className="btn-save-ground-truth"
                            onClick={() => handleSaveAsGroundTruth(task, resultData.results)}
                            title="Save these results as new ground truth"
                          >
                            Save as Ground Truth
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
  )
}

export default CompareModal
