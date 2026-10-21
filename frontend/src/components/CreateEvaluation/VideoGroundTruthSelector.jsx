import { embeddingLabel } from '../../utils/embeddingTasks'

function VideoGroundTruthSelector({
  videos,
  groundTruths,
  selectedVideo,
  selectedGroundTruth,
  loadingVideos,
  loadingGroundTruths,
  onVideoSelect,
  onGroundTruthSelect,
  onCancel,
  onNext
}) {
  return (
    <div className="step-content">
      <div className="selection-section">
        <h2>Select Video</h2>
        {loadingVideos ? (
          <p>Loading videos...</p>
        ) : (
          <div className="selection-grid">
            {videos.map(video => (
              <div
                key={video.Id}
                className={`selection-card ${selectedVideo?.Id === video.Id ? 'selected' : ''}`}
                onClick={() => onVideoSelect(video)}
              >
                {video.thumbnail_url ? (
                  <img src={video.thumbnail_url} alt={video.Name} className="selection-thumbnail" />
                ) : (
                  <div className="selection-thumbnail-placeholder">No thumbnail</div>
                )}
                <div className="selection-info">
                  <div className="selection-name">{video.Name}</div>
                  <div className="selection-meta">{video.Duration ? `${Math.floor(video.Duration / 60)}:${(video.Duration % 60).toFixed(0).padStart(2, '0')}` : 'N/A'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedVideo && (
        <div className="selection-section">
          <h2>Select Ground Truth</h2>
          {loadingGroundTruths ? (
            <p>Loading ground truths...</p>
          ) : groundTruths.length === 0 ? (
            <p className="no-data">No ground truths available for this video. Please create one first.</p>
          ) : (
            <div className="selection-list">
              {groundTruths.map(gt => (
                <div
                  key={gt.Id}
                  className={`selection-list-item ${selectedGroundTruth?.Id === gt.Id ? 'selected' : ''}`}
                  onClick={() => onGroundTruthSelect(gt)}
                >
                  <div className="selection-list-info">
                    <div className="selection-list-name">{gt.Name}</div>
                    <div className="selection-list-meta">
                      {gt.Labels?.length || 0} labels • Created {new Date(gt.CreatedAt).toLocaleDateString()}
                    </div>
                    {gt.Description && (
                      <div className="selection-list-description">{gt.Description}</div>
                    )}
                    {gt.analyzeTasks && gt.analyzeTasks.length > 0 && (
                      <div className="selection-list-tasks">
                        <span className="tasks-label">Source Models:</span>
                        {gt.analyzeTasks.map((task, idx) => (
                          <span key={task.Id || idx} className="task-badge">
                            {embeddingLabel(task)} - {task.ModelId}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedGroundTruth?.Id === gt.Id && (
                    <div className="selection-checkmark">✓</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="step-actions">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button 
          className="btn-primary" 
          onClick={onNext}
          disabled={!selectedVideo || !selectedGroundTruth}
        >
          Next: Select Analysis
        </button>
      </div>
    </div>
  )
}

export default VideoGroundTruthSelector
