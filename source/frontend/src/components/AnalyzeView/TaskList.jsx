import refreshIcon from '../../assets/icons/refresh.svg'
import SearchEmbeddings from './SearchEmbeddings'
import './TaskList.css'

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
  // Filter to show only MME (Multimodal Embedding) type tasks
  const mmeTasks = analyzeTasks.filter(t => 
    t.Type === 'nova-mme' || t.Type === 'tlabs-mme'
  )
  
  const completedTasks = mmeTasks.filter(t => t.Status === 'completed' && t.Result && t.Result.S3VectorIndex)

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
                        title="Select for comparison"
                      />
                    )}
                    <span className={`task-list__status task-list__status--${task.Status}`}>{task.Status}</span>
                    <span className="task-list__item-detail">
                      {task.ModelId || 'N/A'}
                    </span>
                    <span className="task-list__item-detail">
                      {task.Type}
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
                      
                      {task.Type === 'tlabs-mme' ? (
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
                                {(task.Request.EmbeddingScope || task.Request.embeddingScope)?.join(', ') || 'N/A'}
                              </span>
                            </div>
                          )}
                          {(task.Request?.EmbeddingOption || task.Request?.embeddingOption) && (
                            <div className="task-list__detail-row">
                              <span className="task-list__detail-label">Embedding Options:</span>
                              <span className="task-list__detail-value">
                                {(task.Request.EmbeddingOption || task.Request.embeddingOption)?.join(', ') || 'N/A'}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="task-list__detail-row">
                            <span className="task-list__detail-label">Duration:</span>
                            <span className="task-list__detail-value">{task.Request?.DurationS || 'N/A'}s</span>
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
                          {task.CompletedTs && (
                            <div className="task-list__detail-row">
                              <span className="task-list__detail-label">Completed:</span>
                              <span className="task-list__detail-value">{formatDate(task.CompletedTs)}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    
                    {task.Status === 'completed' && task.Result && (
                      <div className="task-list__details-full">
                        <div className="task-list__detail-row">
                          <span className="task-list__detail-label">S3 Vector Bucket:</span>
                          <span className="task-list__detail-value">{task.Result.S3VectorBucket || 'N/A'}</span>
                        </div>
                        <div className="task-list__detail-row">
                          <span className="task-list__detail-label">S3 Vector Index:</span>
                          <span className="task-list__detail-value">{task.Result.S3VectorIndex || 'N/A'}</span>
                        </div>
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
