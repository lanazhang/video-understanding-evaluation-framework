import { useState, useEffect, useRef } from 'react'
import SearchIndexModal from './SearchIndexModal'
import '../AnalyzeView/VideoUnderstandingForm.css'

function AnalysisTaskSelector({
  selectedVideo,
  analyzeTasks,
  selectedAnalyzeTask,
  loadingAnalyzeTasks,
  tasksError,
  onAnalyzeTaskSelect,
  onPrevious,
  onNext,
  initialSearchResults = [],
  initialAllSearches = []
}) {
  const [activeTab, setActiveTab] = useState('embedding')
  const [searchResults, setSearchResults] = useState(initialSearchResults)
  const [allSearches, setAllSearches] = useState(initialAllSearches)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [hasOpenedModalOnce, setHasOpenedModalOnce] = useState(initialSearchResults.length > 0)
  const [reviewTask, setReviewTask] = useState(null)
  const [reviewActiveTab, setReviewActiveTab] = useState('formatted')
  const reviewVideoRef = useRef(null)

  // Parse time string (MM:SS or seconds) to seconds
  const parseTimeToSeconds = (timeStr) => {
    if (typeof timeStr === 'number') return timeStr
    if (typeof timeStr !== 'string') return 0
    
    // Check if it's in MM:SS or HH:MM:SS format
    if (timeStr.includes(':')) {
      const parts = timeStr.split(':').map(p => parseInt(p, 10))
      if (parts.length === 2) {
        // MM:SS
        return parts[0] * 60 + parts[1]
      } else if (parts.length === 3) {
        // HH:MM:SS
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
      }
    }
    
    // Try to parse as a number
    return parseFloat(timeStr) || 0
  }

  // Handle scene/item click to play video segment
  const handleSceneClick = (startTime, endTime) => {
    const startSeconds = parseTimeToSeconds(startTime)
    const endSeconds = parseTimeToSeconds(endTime)
    
    console.log('Scene clicked:', { 
      startTime, 
      endTime, 
      startSeconds, 
      endSeconds, 
      hasVideoRef: !!reviewVideoRef.current 
    })
    
    if (!reviewVideoRef.current) {
      console.error('Video ref not available')
      return
    }
    
    const video = reviewVideoRef.current
    
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
        console.log('Reached end time, pausing at', video.currentTime)
        video.pause()
        video.removeEventListener('timeupdate', handleTimeUpdate)
        video._sceneTimeUpdateListener = null
      }
    }
    
    // Set up listener to play after seek completes
    const handleSeeked = () => {
      console.log('Seek completed, current time:', video.currentTime, 'attempting to play')
      video.removeEventListener('seeked', handleSeeked)
      video._sceneSeekedListener = null
      
      video.play()
        .then(() => {
          console.log('Video playing from', video.currentTime, 'to', endSeconds)
        })
        .catch(err => {
          console.error('Play error:', err)
        })
    }
    
    video.addEventListener('timeupdate', handleTimeUpdate)
    video._sceneTimeUpdateListener = handleTimeUpdate
    
    video.addEventListener('seeked', handleSeeked)
    video._sceneSeekedListener = handleSeeked
    
    // Set the current time to trigger seek
    console.log('Setting currentTime to', startSeconds)
    video.currentTime = startSeconds
  }

  // Auto-open modal when an embedding task is selected for the first time
  useEffect(() => {
    if (selectedAnalyzeTask && !hasOpenedModalOnce && searchResults.length === 0) {
      // Only auto-open for embedding tasks
      if (selectedAnalyzeTask.Type === 'nova-mme' || selectedAnalyzeTask.Type === 'tlabs-mme') {
        setShowSearchModal(true)
        setHasOpenedModalOnce(true)
      }
    }
  }, [selectedAnalyzeTask, hasOpenedModalOnce, searchResults.length])

  const handleAnalyzeTaskClick = (task) => {
    onAnalyzeTaskSelect(task)
    // Only open modal for embedding tasks (MME), not for video understanding
    if (task.Type === 'nova-mme' || task.Type === 'tlabs-mme') {
      setShowSearchModal(true)
    } else if (task.Type === 'video-understanding') {
      // Open review modal for video understanding tasks
      setReviewTask(task)
      setReviewActiveTab('formatted')
    }
  }

  const handleOpenSearchModal = () => {
    if (!selectedAnalyzeTask) {
      return
    }
    setShowSearchModal(true)
  }

  const handleSearchComplete = (results, searches) => {
    setSearchResults(results)
    setAllSearches(searches)
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
          ) : (() => {
            // Filter to only show MME tasks (nova-mme and tlabs-mme)
            const mmeTasks = analyzeTasks.filter(task => 
              task.Type === 'nova-mme' || task.Type === 'tlabs-mme'
            )
            
            return mmeTasks.length === 0 ? (
              <p className="no-data">No multimodal embedding tasks available. Please create one from the Analyze view first.</p>
            ) : (
              <>
                <div className="analyze-task-section">
                  <h3>Select Index</h3>
                  <div className="analyze-task-list">
                    {mmeTasks.map(task => (
                      <div
                        key={task.Id}
                        className={`analyze-task-item ${selectedAnalyzeTask?.Id === task.Id ? 'selected' : ''}`}
                        onClick={() => handleAnalyzeTaskClick(task)}
                      >
                        <div className="task-info">
                          <input
                            type="radio"
                            name="analyzeTask"
                            checked={selectedAnalyzeTask?.Id === task.Id}
                            onChange={() => handleAnalyzeTaskClick(task)}
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
              </>
            )
          })()}
        </div>
      )}

      {activeTab === 'understanding' && (
        <div className="tab-content">
          {loadingAnalyzeTasks ? (
            <p>Loading analyze tasks...</p>
          ) : tasksError ? (
            <div className="alert alert-error">{tasksError}</div>
          ) : (() => {
            // Filter to only show Video Understanding tasks
            const vuTasks = analyzeTasks.filter(task => 
              task.Type === 'video-understanding'
            )
            
            return vuTasks.length === 0 ? (
              <p className="no-data">No video understanding tasks available. Please create one from the Analyze view first.</p>
            ) : (
              <div className="analyze-task-section">
                <h3>Select Video Understanding Task</h3>
                <div className="analyze-task-list">
                  {vuTasks.map(task => (
                    <div
                      key={task.Id}
                      className={`analyze-task-item ${selectedAnalyzeTask?.Id === task.Id ? 'selected' : ''}`}
                      onClick={() => {
                        onAnalyzeTaskSelect(task)
                        // Open review modal immediately when clicking
                        setReviewTask(task)
                        setReviewActiveTab('formatted')
                      }}
                    >
                      <div className="task-info">
                        <input
                          type="radio"
                          name="analyzeTask"
                          checked={selectedAnalyzeTask?.Id === task.Id}
                          onChange={() => {
                            onAnalyzeTaskSelect(task)
                            setReviewTask(task)
                            setReviewActiveTab('formatted')
                          }}
                          className="task-radio"
                        />
                        <div className="task-details">
                          <div className="task-name">
                            {task.Description || task.ModelId}
                          </div>
                          <div className="task-meta">
                            Model: {task.ModelId} • Status: {task.Status} • Created {new Date(task.StartedTs || task.CreatedAt).toLocaleDateString()}
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
            )
          })()}
        </div>
      )}

      <div className="step-actions">
        <button className="btn-secondary" onClick={onPrevious}>Back</button>
        <button 
          className="btn-primary" 
          onClick={handleNextStep}
          disabled={
            !selectedAnalyzeTask || 
            (activeTab === 'embedding' && searchResults.length === 0)
          }
        >
          Next: Generate Report
        </button>
      </div>

      {showSearchModal && (
        <SearchIndexModal
          selectedVideo={selectedVideo}
          selectedAnalyzeTask={selectedAnalyzeTask}
          onClose={() => setShowSearchModal(false)}
          onSearchComplete={handleSearchComplete}
          initialSearchResults={searchResults}
          initialAllSearches={allSearches}
        />
      )}

      {reviewTask && (
        <div className="video-understanding-form">
          <div className="review-modal-overlay" onClick={() => setReviewTask(null)}>
            <div className="review-modal" onClick={(e) => e.stopPropagation()}>
              <div className="review-modal-header">
                <h3>Video Understanding Result</h3>
                <button className="btn-close" onClick={() => setReviewTask(null)}>✕</button>
              </div>
              <div className="review-modal-body">
                <div className="review-video-section">
                  <video
                    ref={reviewVideoRef}
                    controls
                    muted
                    className="review-video-player"
                    src={selectedVideo.video_url}
                    poster={selectedVideo.thumbnail_url}
                  />
                  
                  <div className="review-metadata-compact">
                    <div className="metadata-row">
                      <div className="metadata-compact-item">
                        <span className="metadata-compact-label">Model:</span>
                        <span className="metadata-compact-value">{reviewTask.ModelId || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="metadata-row">
                      <div className="metadata-compact-item metadata-compact-item--full">
                        <span className="metadata-compact-label">Prompt:</span>
                        <span className="metadata-compact-value metadata-compact-value--prompt">
                          {reviewTask.Request?.Prompt || reviewTask.Request?.InputPrompt || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="review-result-section">
                  <div className="review-tabs">
                    <button
                      className={`review-tab ${reviewActiveTab === 'formatted' ? 'review-tab--active' : ''}`}
                      onClick={() => setReviewActiveTab('formatted')}
                    >
                      Formatted
                    </button>
                    <button
                      className={`review-tab ${reviewActiveTab === 'raw' ? 'review-tab--active' : ''}`}
                      onClick={() => setReviewActiveTab('raw')}
                    >
                      Raw Response
                    </button>
                  </div>
                  
                  <div className="review-tab-content">
                    {reviewActiveTab === 'formatted' ? (
                      <div className="review-formatted">
                        {(() => {
                          let content = reviewTask.Result?.Response?.content || 
                                       reviewTask.Result?.Response?.message || 
                                       reviewTask.Result?.Response || 
                                       'No content available'
                          
                          if (typeof content === 'string') {
                            try {
                              // Check if content is wrapped in ```json``` code blocks
                              let jsonContent = content
                              const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
                              if (jsonBlockMatch) {
                                jsonContent = jsonBlockMatch[1].trim()
                              }
                              
                              content = JSON.parse(jsonContent)
                            } catch {
                              return (
                                <div className="review-description">
                                  <p style={{ whiteSpace: 'pre-wrap' }}>{content}</p>
                                </div>
                              )
                            }
                          }
                          
                          if (Array.isArray(content)) {
                            return (
                              <div className="review-scenes">
                                {content.map((item, idx) => {
                                  const hasTime = item.start_time !== undefined && item.end_time !== undefined
                                  return (
                                    <div 
                                      key={idx} 
                                      className="review-scene-card"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (hasTime) {
                                          handleSceneClick(item.start_time, item.end_time)
                                        }
                                      }}
                                      style={{ cursor: hasTime ? 'pointer' : 'default' }}
                                    >
                                      <div className="scene-header">
                                        <span className="scene-number">#{idx + 1}</span>
                                        {hasTime && (
                                          <span className="scene-time">
                                            {item.start_time} - {item.end_time}
                                          </span>
                                        )}
                                      </div>
                                      <p className="scene-description">
                                        {item.description || item.text || JSON.stringify(item)}
                                      </p>
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          }
                          
                          if (content.scenes && Array.isArray(content.scenes)) {
                            return (
                              <div className="review-scenes">
                                {content.scenes.map((scene, idx) => {
                                  const hasTime = scene.start_time !== undefined && scene.end_time !== undefined
                                  return (
                                    <div 
                                      key={idx} 
                                      className="review-scene-card"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (hasTime) {
                                          handleSceneClick(scene.start_time, scene.end_time)
                                        }
                                      }}
                                      style={{ cursor: hasTime ? 'pointer' : 'default' }}
                                    >
                                      <div className="scene-header">
                                        <span className="scene-number">Scene {idx + 1}</span>
                                        {hasTime && (
                                          <span className="scene-time">
                                            {scene.start_time} - {scene.end_time}
                                          </span>
                                        )}
                                      </div>
                                      <p className="scene-description">{scene.description}</p>
                                    </div>
                                  )
                                })}
                              </div>
                            )
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
                        <pre>{JSON.stringify(reviewTask.Result?.Response, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AnalysisTaskSelector
