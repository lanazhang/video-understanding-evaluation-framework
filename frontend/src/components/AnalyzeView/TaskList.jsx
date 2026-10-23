import refreshIcon from '../../assets/icons/refresh.svg'
import { useState } from 'react'
import { FetchPost } from '../../utils/apiHelper'
import SearchEmbeddings from './SearchEmbeddings'
import SegmentTimeline from './SegmentTimeline'
import { modelGroups } from '../../static/modelConfig'
import './TaskList.css'
import { isEmbeddingTask } from '../../utils/embeddingTasks'
import { embeddingTaskParamRows, segmentSummary } from '../../utils/embeddingParams'

function TaskList({
  analyzeTasks,
  loadingTasks,
  tasksError,
  selectedTasks,
  expandedTaskId,
  onRefresh,
  onToggleSelection,
  onOpenCompare,
  onOpenSearch,
  onDeleteTask,
  onToggleExpand,
  onSelectAll,
  formatDate,
  // Search props
  showSearch,
  video,
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
  onCloseSearch,
  videoPlayerRef,
  onTimeRangeClick,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder
}) {
  // Segments of an index, loaded when "View segments" is opened: { [taskId]: { open, loading, error, data } }
  const [segmentView, setSegmentView] = useState({})
  const setSegmentState = (taskId, patch) => setSegmentView(prev => ({ ...prev, [taskId]: { ...prev[taskId], ...patch } }))

  const toggleSegments = async (task) => {
    const current = segmentView[task.Id] || {}
    if (current.open) { setSegmentState(task.Id, { open: false }); return }
    setSegmentState(task.Id, { open: true })
    if (current.data) return
    setSegmentState(task.Id, { loading: true, error: null })
    try {
      const data = await FetchPost('/model/embedding-segments', { TaskId: task.Id }, 'EvalService')
      setSegmentState(task.Id, { loading: false, data })
    } catch (err) {
      setSegmentState(task.Id, { loading: false, error: err.message || 'Could not load the segments' })
    }
  }

  // Play the clicked segment in the video player at the top of the page, and bring the player into view
  const playSegment = (start, end) => {
    if (onTimeRangeClick) onTimeRangeClick(start, end)
    const player = videoPlayerRef?.current
    if (player && player.scrollIntoView) player.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Filter to show only MME (Multimodal Embedding) type tasks
  const mmeTasks = analyzeTasks.filter(t => 
    isEmbeddingTask(t)
  )
  
  const completedTasks = mmeTasks.filter(t => t.Status === 'completed' && t.Result && t.Result.S3VectorIndex)

  // Helper function to calculate cost for an embedding task
  const calculateEmbeddingCost = (task) => {
      if (!task || task.Status !== 'completed' || !task.Result) return null

      // Find the model config
      const embeddingGroup = modelGroups.find(g => g.groupName === 'Multimodal Embedding')
      if (!embeddingGroup) return null

      const modelConfig = embeddingGroup.models.find(m => m.modelId === task.ModelId)
      if (!modelConfig || !modelConfig.pricing) return null

      const pricing = modelConfig.pricing
      let totalCost = 0
      let costBreakdown = []

      // For embedding models, use the actual video duration for cost calculation
      // TwelveLabs and Nova MME pricing is based on video duration, not processing time
      let videoDurationSeconds = null

      // Try to get video duration from the video object
      if (video && video.Duration) {
        videoDurationSeconds = video.Duration
      }

      // Calculate video processing cost based on video duration
      if (videoDurationSeconds) {
        if (pricing.perMinuteVideo) {
          const durationMinutes = videoDurationSeconds / 60
          const videoCost = durationMinutes * pricing.perMinuteVideo
          totalCost += videoCost
          costBreakdown.push(`Video: $${videoCost.toFixed(2)} (${videoDurationSeconds.toFixed(1)}s @ $${pricing.perMinuteVideo.toFixed(5)}/min)`)
        } else if (pricing.perSecondVideo) {
          const videoCost = videoDurationSeconds * pricing.perSecondVideo
          totalCost += videoCost
          costBreakdown.push(`Video: $${videoCost.toFixed(2)} (${videoDurationSeconds.toFixed(1)}s @ $${pricing.perSecondVideo.toFixed(5)}/sec)`)
        }
      }

      if (totalCost === 0) return null

      return {
        total: totalCost,
        breakdown: costBreakdown
      }
    }

  return (
    <div className="task-list">
      <div className="task-list__header">
        <h3 className="task-list__title">Multimodal Embedding Indexes</h3>
        <div className="task-list__actions">
          <button 
            className="task-list__btn task-list__btn--compare"
            onClick={onOpenCompare}
            disabled={selectedTasks.length === 0}
            title={selectedTasks.length === 0 ? "Select tasks to compare" : "Compare selected embeddings"}
          >
            Compare ({selectedTasks.length})
          </button>
          <button 
            className="task-list__btn task-list__btn--refresh" 
            onClick={onRefresh}
            disabled={loadingTasks}
            title="Refresh task list"
          >
            <img src={refreshIcon} alt="Refresh" />
          </button>
        </div>
      </div>
      
      {tasksError && (
        <div className="task-list__alert task-list__alert--error">{tasksError}</div>
      )}
      
      {loadingTasks ? (
        <div className="task-list__loading">Loading tasks...</div>
      ) : mmeTasks.length > 0 ? (
        <div className="task-list__items">
          {completedTasks.length > 0 && (
            <div className="task-list__select-all">
              <label className="task-list__select-all-label">
                <input
                  type="checkbox"
                  className="task-list__select-all-checkbox"
                  checked={selectedTasks.length > 0 && selectedTasks.length === completedTasks.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onSelectAll(completedTasks)
                    } else {
                      onSelectAll([])
                    }
                  }}
                  title="Select all completed tasks"
                />
                <span>Select All</span>
              </label>
            </div>
          )}
          {mmeTasks.map((task) => {
            const isExpanded = expandedTaskId === task.Id
            const isSelected = selectedTasks.some(t => t.Id === task.Id)
            const canCompare = task.Status === 'completed' && task.Result && task.Result.S3VectorIndex
            
            return (
              <div key={task.Id} className="task-list__item">
                <div className="task-list__item-header">
                  <div className="task-list__item-info">
                    {canCompare && (
                      <input
                        type="checkbox"
                        className="task-list__item-checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelection(task)}
                        disabled={!isSelected && selectedTasks.length >= 4}
                        title={!isSelected && selectedTasks.length >= 4 ? "Maximum 4 tasks can be selected" : "Select for comparison"}
                      />
                    )}
                    <span className={`task-list__status task-list__status--${task.Status}`}>{task.Status}</span>
                    <span className="task-list__item-detail">
                      {task.ModelId || 'N/A'}
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
                        
                        const costInfo = calculateEmbeddingCost(task)
                        const costStr = costInfo ? `, $${costInfo.total.toFixed(2)}` : ''
                        
                        return ` (${parts.join(' ')}${costStr})`
                      })()}
                    </span>
                  </div>
                  <div className="task-list__item-actions">
                    {task.Status === 'completed' && task.Result && task.Result.S3VectorIndex && (
                      <button 
                        className="task-list__btn task-list__btn--search"
                        onClick={() => onOpenSearch(task.Id, task.Result.S3VectorIndex, task)}
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
                      className="task-list__btn task-list__btn--delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteTask(task.Id)
                      }}
                      title="Delete task"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button 
                      className="task-list__btn task-list__btn--expand"
                      onClick={() => onToggleExpand(isExpanded ? null : task.Id)}
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
                  <div className="task-list__details">
                    <div className="task-list__details-grid">
                      <div className="task-list__detail-row">
                        <span className="task-list__detail-label">Task ID:</span>
                        <span className="task-list__detail-value">{task.Id}</span>
                      </div>
                      <div className="task-list__detail-row">
                        <span className="task-list__detail-label">Type:</span>
                        <span className="task-list__detail-value">{task.Type}</span>
                      </div>
                      <div className="task-list__detail-row">
                        <span className="task-list__detail-label">Model:</span>
                        <span className="task-list__detail-value">{task.ModelId || 'N/A'}</span>
                      </div>
                      <div className="task-list__detail-row">
                        <span className="task-list__detail-label">Created:</span>
                        <span className="task-list__detail-value">{formatDate(task.StartedTs)}</span>
                      </div>
                      {task.CompletedTs && (
                        <div className="task-list__detail-row">
                          <span className="task-list__detail-label">Completed:</span>
                          <span className="task-list__detail-value">{formatDate(task.CompletedTs)}</span>
                        </div>
                      )}
                      
                      {task.Type === 'embedding' ? (
                        <>
                          {embeddingTaskParamRows(task).map(row => (
                            <div className="task-list__detail-row" key={row.label}>
                              <span className="task-list__detail-label">{row.label}:</span>
                              <span className="task-list__detail-value">{row.value}</span>
                            </div>
                          ))}
                          {task.Status === 'failed' && task.Result?.ErrorMessage && (
                            <div className="task-list__detail-row">
                              <span className="task-list__detail-label">Error:</span>
                              <span className="task-list__detail-value">{task.Result.ErrorMessage}</span>
                            </div>
                          )}
                        </>
                      ) : task.Type === 'tlabs-mme' ? (
                        <>
                          {(task.Request?.Segmentation || task.Request?.segmentation) && (
                            <>
                              <div className="task-list__detail-row">
                                <span className="task-list__detail-label">Segmentation Method:</span>
                                <span className="task-list__detail-value">
                                  {task.Request.Segmentation?.Method || task.Request.segmentation?.method || 'N/A'}
                                </span>
                              </div>
                              {(task.Request.Segmentation?.Dynamic || task.Request.segmentation?.dynamic) && (
                                <>
                                  {(task.Request.Segmentation?.Dynamic?.MinDurationSec || task.Request.segmentation?.dynamic?.minDurationSec) && (
                                    <div className="task-list__detail-row">
                                      <span className="task-list__detail-label">Min Duration:</span>
                                      <span className="task-list__detail-value">
                                        {task.Request.Segmentation?.Dynamic?.MinDurationSec || task.Request.segmentation?.dynamic?.minDurationSec}s
                                      </span>
                                    </div>
                                  )}
                                  {(task.Request.Segmentation?.Dynamic?.MaxDurationSec || task.Request.segmentation?.dynamic?.maxDurationSec) && (
                                    <div className="task-list__detail-row">
                                      <span className="task-list__detail-label">Max Duration:</span>
                                      <span className="task-list__detail-value">
                                        {task.Request.Segmentation?.Dynamic?.MaxDurationSec || task.Request.segmentation?.dynamic?.maxDurationSec}s
                                      </span>
                                    </div>
                                  )}
                                </>
                              )}
                              {(task.Request.Segmentation?.Fixed?.DurationSec || task.Request.segmentation?.fixed?.durationSec) && (
                                <div className="task-list__detail-row">
                                  <span className="task-list__detail-label">Fixed Duration:</span>
                                  <span className="task-list__detail-value">
                                    {task.Request.Segmentation?.Fixed?.DurationSec || task.Request.segmentation?.fixed?.durationSec}s
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                          {(task.Request?.EmbeddingScope || task.Request?.embeddingScope) && (
                            <div className="task-list__detail-row">
                              <span className="task-list__detail-label">Embedding Scope:</span>
                              <span className="task-list__detail-value">
                                {(() => {
                                  const scope = task.Request.EmbeddingScope || task.Request.embeddingScope;
                                  return Array.isArray(scope) ? scope.join(', ') : scope;
                                })()}
                              </span>
                            </div>
                          )}
                          {(task.Request?.EmbeddingOption || task.Request?.embeddingOption) && (
                            <div className="task-list__detail-row">
                              <span className="task-list__detail-label">Embedding Options:</span>
                              <span className="task-list__detail-value">
                                {(() => {
                                  const options = task.Request.EmbeddingOption || task.Request.embeddingOption;
                                  return Array.isArray(options) ? options.join(', ') : (options || 'N/A');
                                })()}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="task-list__detail-row">
                            <span className="task-list__detail-label">Duration:</span>
                            <span className="task-list__detail-value">{segmentSummary(task.Request)}</span>
                          </div>
                          <div className="task-list__detail-row">
                            <span className="task-list__detail-label">Embed Mode:</span>
                            <span className="task-list__detail-value">{task.Request?.EmbedMode || 'N/A'}</span>
                          </div>
                          <div className="task-list__detail-row">
                            <span className="task-list__detail-label">Embedding Dimension:</span>
                            <span className="task-list__detail-value">{task.Request?.EmbeddingDim || 'N/A'}</span>
                          </div>
                        </>
                      )}
                      
                      {task.Status === 'completed' && task.Result && (
                        <>
                          <div className="task-list__detail-row">
                            <span className="task-list__detail-label">Embeddings:</span>
                            <span className="task-list__detail-value">{task.Result.EmbeddingCount || 0}</span>
                          </div>
                        </>
                      )}
                      
                      {task.CompletedTs && (
                        <div className="task-list__detail-row">
                          <span className="task-list__detail-label">Processing Time:</span>
                          <span className="task-list__detail-value">
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
                        const costInfo = calculateEmbeddingCost(task)
                        if (!costInfo) return null
                        
                        return (
                          <div className="task-list__detail-row">
                            <span className="task-list__detail-label">Estimated Cost:</span>
                            <span className="task-list__detail-value task-list__detail-value--cost" title={costInfo.breakdown.join('\n')}>
                              ${costInfo.total.toFixed(2)}
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                    
                    {task.Status === 'completed' && task.Result && (
                      <div className="task-list__details-full">
                        {task.Type !== 'embedding' && (
                          <div className="task-list__detail-row">
                            <span className="task-list__detail-label">S3 Vector Bucket:</span>
                            <span className="task-list__detail-value">{task.Result.S3VectorBucket || 'N/A'}</span>
                          </div>
                        )}
                        <div className="task-list__detail-row">
                          <span className="task-list__detail-label">{task.Type === 'embedding' ? 'Vector Index:' : 'S3 Vector Index:'}</span>
                          <span className="task-list__detail-value">{task.Result.S3VectorIndex || 'N/A'}</span>
                        </div>
                      </div>
                    )}

                    {task.Type === 'embedding' && task.Status === 'completed' && (
                      <div className="task-list__segments">
                        <button
                          type="button"
                          className="task-list__segments-button"
                          onClick={() => toggleSegments(task)}
                          aria-expanded={!!segmentView[task.Id]?.open}
                        >
                          {segmentView[task.Id]?.open ? 'Hide segments' : 'View segments'}
                        </button>
                        {segmentView[task.Id]?.open && (
                          segmentView[task.Id].loading ? <p className="segment-timeline__empty">Loading segments...</p>
                          : segmentView[task.Id].error ? <div className="alert alert-error">{segmentView[task.Id].error}</div>
                          : segmentView[task.Id].data && (
                            <SegmentTimeline
                              segments={segmentView[task.Id].data.Segments}
                              duration={video?.Duration}
                              mode={segmentView[task.Id].data.SegmentMode}
                              shotCount={segmentView[task.Id].data.ShotCount}
                              onSegmentClick={playSegment}
                            />
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="task-list__empty">
          No multimodal embedding tasks found for this video.
        </div>
      )}

      {showSearch && selectedTasks.length > 0 && (
        <SearchEmbeddings
          video={video}
          selectedTasks={selectedTasks}
          compareSearchText={compareSearchText}
          setCompareSearchText={setCompareSearchText}
          compareTopK={compareTopK}
          setCompareTopK={setCompareTopK}
          compareEmbeddingType={compareEmbeddingType}
          setCompareEmbeddingType={setCompareEmbeddingType}
          compareLoading={compareLoading}
          compareError={compareError}
          compareResults={compareResults}
          onSearch={onSearch}
          onClose={onCloseSearch}
          videoPlayerRef={videoPlayerRef}
          onTimeRangeClick={onTimeRangeClick}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
        />
      )}
    </div>
  )
}

export default TaskList
