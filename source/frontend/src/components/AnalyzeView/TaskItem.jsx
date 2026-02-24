import './TaskItem.css'

function TaskItem({ 
  task, 
  isExpanded, 
  isSelected, 
  onToggleExpand, 
  onToggleSelection, 
  onOpenSearch, 
  onDelete,
  isGroundTruthMode = false
}) {
  const canCompare = task.Status === 'completed' && task.Result && task.Result.S3VectorIndex

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    return new Date(timestamp).toLocaleString()
  }

  return (
    <div className="analyze-task-item compact">
      <div className="task-compact-header">
        <div className="task-compact-info">
          {!isGroundTruthMode && canCompare && (
            <input
              type="checkbox"
              className="task-checkbox"
              checked={isSelected}
              onChange={onToggleSelection}
              title="Select for comparison"
            />
          )}
          <span className={`task-status ${task.Status}`}>{task.Status}</span>
          <span className="task-compact-detail">
            {task.ModelId || 'N/A'}
          </span>
          <span className="task-compact-detail">
            {task.Type}
          </span>
        </div>
        <div className="task-actions">
          {canCompare && (
            <button 
              className="btn-search-icon"
              onClick={onOpenSearch}
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
            className="btn-delete-task"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            title="Delete task"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button 
            className="btn-expand"
            onClick={onToggleExpand}
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
        <div className="task-details">
          <div className="task-detail-grid">
            <div className="task-detail-row">
              <span className="detail-label">Task ID:</span>
              <span className="detail-value">{task.Id}</span>
            </div>
            <div className="task-detail-row">
              <span className="detail-label">Type:</span>
              <span className="detail-value">{task.Type}</span>
            </div>
            <div className="task-detail-row">
              <span className="detail-label">Model:</span>
              <span className="detail-value">{task.ModelId || 'N/A'}</span>
            </div>
            <div className="task-detail-row">
              <span className="detail-label">Created:</span>
              <span className="detail-value">{formatDate(task.StartedTs)}</span>
            </div>
            
            {task.Type === 'tlabs-mme' ? (
              <>
                {(task.Request?.Segmentation || task.Request?.segmentation) && (
                  <>
                    <div className="task-detail-row">
                      <span className="detail-label">Segmentation Method:</span>
                      <span className="detail-value">
                        {task.Request.Segmentation?.Method || task.Request.segmentation?.method || 'N/A'}
                      </span>
                    </div>
                    {(task.Request.Segmentation?.Dynamic || task.Request.segmentation?.dynamic) && (
                      <>
                        {(task.Request.Segmentation?.Dynamic?.MinDurationSec || task.Request.segmentation?.dynamic?.minDurationSec) && (
                          <div className="task-detail-row">
                            <span className="detail-label">Min Duration:</span>
                            <span className="detail-value">
                              {task.Request.Segmentation?.Dynamic?.MinDurationSec || task.Request.segmentation?.dynamic?.minDurationSec}s
                            </span>
                          </div>
                        )}
                        {(task.Request.Segmentation?.Dynamic?.MaxDurationSec || task.Request.segmentation?.dynamic?.maxDurationSec) && (
                          <div className="task-detail-row">
                            <span className="detail-label">Max Duration:</span>
                            <span className="detail-value">
                              {task.Request.Segmentation?.Dynamic?.MaxDurationSec || task.Request.segmentation?.dynamic?.maxDurationSec}s
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {(task.Request.Segmentation?.Fixed?.DurationSec || task.Request.segmentation?.fixed?.durationSec) && (
                      <div className="task-detail-row">
                        <span className="detail-label">Fixed Duration:</span>
                        <span className="detail-value">
                          {task.Request.Segmentation?.Fixed?.DurationSec || task.Request.segmentation?.fixed?.durationSec}s
                        </span>
                      </div>
                    )}
                  </>
                )}
                {(task.Request?.EmbeddingScope || task.Request?.embeddingScope) && (
                  <div className="task-detail-row">
                    <span className="detail-label">Embedding Scope:</span>
                    <span className="detail-value">
                      {(task.Request.EmbeddingScope || task.Request.embeddingScope)?.join(', ') || 'N/A'}
                    </span>
                  </div>
                )}
                {(task.Request?.EmbeddingOption || task.Request?.embeddingOption) && (
                  <div className="task-detail-row">
                    <span className="detail-label">Embedding Options:</span>
                    <span className="detail-value">
                      {(task.Request.EmbeddingOption || task.Request.embeddingOption)?.join(', ') || 'N/A'}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="task-detail-row">
                  <span className="detail-label">Duration:</span>
                  <span className="detail-value">{task.Request?.DurationS || 'N/A'}s</span>
                </div>
                <div className="task-detail-row">
                  <span className="detail-label">Embed Mode:</span>
                  <span className="detail-value">{task.Request?.EmbedMode || 'N/A'}</span>
                </div>
                <div className="task-detail-row">
                  <span className="detail-label">Embedding Dimension:</span>
                  <span className="detail-value">{task.Request?.EmbeddingDim || 'N/A'}</span>
                </div>
              </>
            )}
            
            {task.Status === 'completed' && task.Result && (
              <>
                <div className="task-detail-row">
                  <span className="detail-label">Embeddings:</span>
                  <span className="detail-value">{task.Result.EmbeddingCount || 0}</span>
                </div>
                {task.CompletedTs && (
                  <div className="task-detail-row">
                    <span className="detail-label">Completed:</span>
                    <span className="detail-value">{formatDate(task.CompletedTs)}</span>
                  </div>
                )}
              </>
            )}
          </div>
          
          {task.Status === 'completed' && task.Result && (
            <>
              <div className="task-detail-full-width">
                <div className="task-detail-row">
                  <span className="detail-label">S3 Vector Bucket:</span>
                  <span className="detail-value">{task.Result.S3VectorBucket || 'N/A'}</span>
                </div>
                <div className="task-detail-row">
                  <span className="detail-label">S3 Vector Index:</span>
                  <span className="detail-value">{task.Result.S3VectorIndex || 'N/A'}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default TaskItem
