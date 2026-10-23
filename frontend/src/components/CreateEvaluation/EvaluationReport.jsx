import { useState } from 'react'
import VideoComparisonModal from './VideoComparisonModal'
import { embeddingLabel, isEmbeddingTask } from '../../utils/embeddingTasks'
import { RANKING_METRICS, describeMatching, counterpartSummary } from './evaluationUtils'
import MatchOptionsControls from './MatchOptionsControls'
import { efficiencyRows } from '../../utils/evaluationEfficiency'

function EvaluationReport({
  evaluationName,
  evaluationDescription,
  bufferTime,
  onBufferTimeChange,
  matchOptions,
  onMatchOptionsChange,
  selectedVideo,
  selectedGroundTruth,
  selectedAnalyzeTask,
  allSearches,
  searchResults,
  evaluationMetrics,
  matchingDetails,
  loading,
  onNameChange,
  onDescriptionChange,
  onSegmentClick,
  onPrevious,
  onSave,
  onRecalculate
}) {
  const [showVideoModal, setShowVideoModal] = useState(false)

  // Convert search results to evaluation labels format
  const evaluationLabels = searchResults.map(result => ({
    StartTs: parseFloat(result.StartSec || 0),
    EndTs: parseFloat(result.EndSec || 0),
    Label: result.query || 'Search Result',
    Score: result.Distance !== undefined ? parseFloat(result.Distance) : undefined
  }))

  return (
    <div className="step-content">
      <div className="form-section">
        <h2>Evaluation Details</h2>
        
        <div className="form-group">
          <label>Evaluation Name *</label>
          <input
            type="text"
            value={evaluationName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Enter evaluation name"
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={evaluationDescription}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Enter evaluation description (optional)"
            className="form-textarea"
            rows={4}
          />
        </div>

        <div className="summary-section">
          <h3>Summary</h3>
          <div className="summary-item">
            <span className="summary-label">Video:</span>
            <span className="summary-value">{selectedVideo?.Name}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Ground Truth:</span>
            <span className="summary-value">{selectedGroundTruth?.Name}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Analyze Task:</span>
            <span className="summary-value">
              {isEmbeddingTask(selectedAnalyzeTask) ? embeddingLabel(selectedAnalyzeTask) : 'Video Understanding'} - {selectedAnalyzeTask?.ModelId}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Search Queries:</span>
            <span className="summary-value">{allSearches.map(s => `"${s.query}"`).join(', ')}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Search Results:</span>
            <span className="summary-value">{searchResults.length} segments found</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Ground Truth Labels:</span>
            <span className="summary-value">{selectedGroundTruth?.Labels?.length || 0} labels</span>
          </div>
        </div>

        <div className="form-group form-group-inline">
          <label>Buffer Time (seconds):</label>
          <div className="inline-input-wrapper">
            <input
              type="number"
              value={bufferTime}
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 0
                onBufferTimeChange(parseFloat(value.toFixed(2)))
              }}
              onBlur={() => {
                if (onRecalculate) {
                  onRecalculate()
                }
              }}
              step="0.01"
              min="0"
              max="10"
              placeholder="1.00"
              className="form-input"
              style={{ maxWidth: '120px' }}
            />
            <small className="form-help-inline">
              Buffer added before/after each range for overlap comparison
            </small>
          </div>
        </div>

        <MatchOptionsControls
          options={matchOptions}
          onChange={(next) => {
            onMatchOptionsChange(next)
            if (onRecalculate) onRecalculate(next)
          }}
        />

        {evaluationMetrics && (
          <div className="metrics-section">
            <h3>Evaluation Metrics</h3>
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">Precision</div>
                <div className="metric-value">{(evaluationMetrics.Precision * 100).toFixed(2)}%</div>
                <div className="metric-description">Hit clips / clips returned</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Recall</div>
                <div className="metric-value">{(evaluationMetrics.Recall * 100).toFixed(2)}%</div>
                <div className="metric-description">Moments found / moments in ground truth</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">F1 Score</div>
                <div className="metric-value">{(evaluationMetrics.F1Score * 100).toFixed(2)}%</div>
                <div className="metric-description">Harmonic mean</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Accuracy</div>
                <div className="metric-value">{(evaluationMetrics.Accuracy * 100).toFixed(2)}%</div>
                <div className="metric-description">Found / (found + wrong + missed)</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Mean IoU</div>
                <div className="metric-value">{(evaluationMetrics.MeanIoU * 100).toFixed(2)}%</div>
                <div className="metric-description">Temporal overlap</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">mAP</div>
                <div className="metric-value">{(evaluationMetrics.MeanAveragePrecision * 100).toFixed(2)}%</div>
                <div className="metric-description">Mean Avg Precision at the chosen IoU</div>
              </div>
            </div>

            <h4 style={{ marginTop: 16 }}>Ranking quality</h4>
            <div className="metrics-grid">
              {RANKING_METRICS.map(m => (
                <div className="metric-card" key={m.key}>
                  <div className="metric-label">{m.label}</div>
                  <div className="metric-value">
                    {evaluationMetrics[m.key] !== undefined ? `${(evaluationMetrics[m.key] * 100).toFixed(2)}%` : 'N/A'}
                  </div>
                  <div className="metric-description">{m.description}</div>
                </div>
              ))}
            </div>
            {(() => {
              const rows = efficiencyRows({ analyzeTask: selectedAnalyzeTask, video: selectedVideo })
              return rows.length > 0 && (
                <>
                  <h4 style={{ marginTop: 16 }}>Efficiency</h4>
                  <div className="metrics-grid">
                    {rows.map(row => (
                      <div className="metric-card" key={row.label} title={row.title}>
                        <div className="metric-label">{row.label}</div>
                        <div className="metric-value">{row.value}</div>
                        <div className="metric-description">{row.description}</div>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
            <small style={{ display: 'block', marginTop: 8, opacity: 0.75 }}>
              Matching: {describeMatching(matchOptions, bufferTime)}
            </small>
            
            <div className="confusion-matrix">
              <h4>Confusion Matrix</h4>
              <div className="confusion-grid">
                <div className="confusion-item tp">
                  <div className="confusion-label">True Positives</div>
                  <div className="confusion-value">{evaluationMetrics.TruePositives}</div>
                </div>
                <div className="confusion-item fp">
                  <div className="confusion-label">False Positives</div>
                  <div className="confusion-value">{evaluationMetrics.FalsePositives}</div>
                </div>
                <div className="confusion-item fn">
                  <div className="confusion-label">False Negatives</div>
                  <div className="confusion-value">{evaluationMetrics.FalseNegatives}</div>
                </div>
                <div className="confusion-item tn">
                  <div className="confusion-label">True Negatives</div>
                  <div className="confusion-value">{evaluationMetrics.TrueNegatives}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {matchingDetails && (
          <div className="overlap-section">
            <h3>Segment Matching Details</h3>
            <button 
              className="btn-open-video-comparison"
              onClick={() => setShowVideoModal(true)}
            >
              Compare on Video Timeline
            </button>
            <p className="overlap-description">
              A returned clip is matched to a ground-truth range when their overlap reaches the minimum chosen above. Each row
              shows the range it was matched to, how much the two overlap, and how far the start and end are off.
            </p>
            
            <div className="overlap-tables">
              <div className="overlap-table-container">
                <h4>Ground Truth Segments ({matchingDetails.gtMatches.filter(m => m.gtLabel.ReviewResult === 'true_positive' || m.gtLabel.ReviewResult === 'reviewed').length})</h4>
                <div className="overlap-table">
                  <div className="overlap-table-header">
                    <div className="overlap-col-index">#</div>
                    <div className="overlap-col-time">Time Range</div>
                    <div className="overlap-col-status">Status</div>
                    <div className="overlap-col-iou">IoU</div>
                    <div className="overlap-col-match">Matched To</div>
                  </div>
                  {[...matchingDetails.gtMatches]
                    .filter(match => match.gtLabel.ReviewResult === 'true_positive' || match.gtLabel.ReviewResult === 'reviewed')
                    .sort((a, b) => {
                      const aStart = typeof a.gtLabel.StartTs === 'number' ? a.gtLabel.StartTs : parseFloat(a.gtLabel.StartTs || 0)
                      const bStart = typeof b.gtLabel.StartTs === 'number' ? b.gtLabel.StartTs : parseFloat(b.gtLabel.StartTs || 0)
                      return aStart - bStart
                    })
                    .map((match, idx) => (
                    <div 
                      key={idx} 
                      className={`overlap-table-row status-${match.status.toLowerCase()} clickable`}
                      onClick={() => onSegmentClick(match, 'gt')}
                      title="Click to view segment details"
                    >
                      <div className="overlap-col-index">{idx + 1}</div>
                      <div className="overlap-col-time">
                        {typeof match.gtLabel.StartTs === 'number' ? match.gtLabel.StartTs.toFixed(2) : parseFloat(match.gtLabel.StartTs || 0).toFixed(2)}s - {typeof match.gtLabel.EndTs === 'number' ? match.gtLabel.EndTs.toFixed(2) : parseFloat(match.gtLabel.EndTs || 0).toFixed(2)}s
                      </div>
                      <div className="overlap-col-status">
                        <span className={`status-badge ${match.status.toLowerCase()}`}>
                          {match.status}
                        </span>
                      </div>
                      <div className="overlap-col-iou">
                        {match.status === 'TP' ? `${(match.iou * 100).toFixed(1)}%` : '-'}
                      </div>
                      <div className="overlap-col-match">
                        {(() => {
                          const s = counterpartSummary(match, 'gt', matchOptions)
                          return (<><div>{s.headline}</div><div className="overlap-detail-line">{s.detail}</div></>)
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overlap-table-container">
                <h4>Search Result Segments ({matchingDetails.predMatches.length})</h4>
                <div className="overlap-table">
                  <div className="overlap-table-header">
                    <div className="overlap-col-index">#</div>
                    <div className="overlap-col-time">Time Range</div>
                    <div className="overlap-col-status">Status</div>
                    <div className="overlap-col-iou">IoU</div>
                    <div className="overlap-col-match">Matched To</div>
                  </div>
                  {[...matchingDetails.predMatches]
                    .sort((a, b) => {
                      const aStart = typeof a.predLabel.StartTs === 'number' ? a.predLabel.StartTs : parseFloat(a.predLabel.StartTs || 0)
                      const bStart = typeof b.predLabel.StartTs === 'number' ? b.predLabel.StartTs : parseFloat(b.predLabel.StartTs || 0)
                      return aStart - bStart
                    })
                    .map((match, idx) => (
                    <div 
                      key={idx} 
                      className={`overlap-table-row status-${match.status.toLowerCase()} clickable`}
                      onClick={() => onSegmentClick(match, 'pred')}
                      title="Click to view segment details"
                    >
                      <div className="overlap-col-index">{match.predIndex + 1}</div>
                      <div className="overlap-col-time">
                        {typeof match.predLabel.StartTs === 'number' ? match.predLabel.StartTs.toFixed(2) : parseFloat(match.predLabel.StartTs || 0).toFixed(2)}s - {typeof match.predLabel.EndTs === 'number' ? match.predLabel.EndTs.toFixed(2) : parseFloat(match.predLabel.EndTs || 0).toFixed(2)}s
                      </div>
                      <div className="overlap-col-status">
                        <span className={`status-badge ${match.status.toLowerCase()}`}>
                          {match.status}
                        </span>
                      </div>
                      <div className="overlap-col-iou">
                        {match.status === 'TP' ? `${(match.iou * 100).toFixed(1)}%` : '-'}
                      </div>
                      <div className="overlap-col-match">
                        {(() => {
                          const s = counterpartSummary(match, 'pred', matchOptions)
                          return (<><div>{s.headline}</div><div className="overlap-detail-line">{s.detail}</div></>)
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="step-actions">
        <button className="btn-secondary" onClick={onPrevious}>Back</button>
        <button 
          className="btn-primary" 
          onClick={onSave}
          disabled={loading || !evaluationName.trim()}
        >
          {loading ? 'Saving...' : 'Save Evaluation'}
        </button>
      </div>

      {showVideoModal && (
        <VideoComparisonModal
          video={selectedVideo}
          groundTruthLabels={selectedGroundTruth?.Labels || []}
          evaluationLabels={evaluationLabels}
          matchingDetails={matchingDetails}
          onClose={() => setShowVideoModal(false)}
        />
      )}
    </div>
  )
}

export default EvaluationReport
