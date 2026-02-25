function EvaluationReport({
  evaluationName,
  evaluationDescription,
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
  onSave
}) {
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
              {selectedAnalyzeTask?.Type === 'nova-mme' ? 'Nova MME' : 'TwelveLabs'} - {selectedAnalyzeTask?.ModelId}
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

        {evaluationMetrics && (
          <div className="metrics-section">
            <h3>Evaluation Metrics</h3>
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">Precision</div>
                <div className="metric-value">{(evaluationMetrics.Precision * 100).toFixed(2)}%</div>
                <div className="metric-description">TP / (TP + FP)</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Recall</div>
                <div className="metric-value">{(evaluationMetrics.Recall * 100).toFixed(2)}%</div>
                <div className="metric-description">TP / (TP + FN)</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">F1 Score</div>
                <div className="metric-value">{(evaluationMetrics.F1Score * 100).toFixed(2)}%</div>
                <div className="metric-description">Harmonic mean</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Accuracy</div>
                <div className="metric-value">{(evaluationMetrics.Accuracy * 100).toFixed(2)}%</div>
                <div className="metric-description">Overall accuracy</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Mean IoU</div>
                <div className="metric-value">{(evaluationMetrics.MeanIoU * 100).toFixed(2)}%</div>
                <div className="metric-description">Temporal overlap</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">mAP</div>
                <div className="metric-value">{(evaluationMetrics.MeanAveragePrecision * 100).toFixed(2)}%</div>
                <div className="metric-description">Mean Avg Precision</div>
              </div>
            </div>
            
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
            <p className="overlap-description">
              Segments are matched based on any temporal overlap. IoU (Intersection over Union) is calculated for display purposes.
            </p>
            
            <div className="overlap-tables">
              <div className="overlap-table-container">
                <h4>Ground Truth Segments ({matchingDetails.gtMatches.filter(m => m.gtLabel.ReviewResult === 'true_positive' && m.status !== 'FN').length})</h4>
                <div className="overlap-table">
                  <div className="overlap-table-header">
                    <div className="overlap-col-index">#</div>
                    <div className="overlap-col-time">Time Range</div>
                    <div className="overlap-col-status">Status</div>
                    <div className="overlap-col-iou">IoU</div>
                    <div className="overlap-col-match">Matched To</div>
                  </div>
                  {[...matchingDetails.gtMatches]
                    .filter(match => match.gtLabel.ReviewResult === 'true_positive' && match.status !== 'FN')
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
                        {match.predIndex !== null ? `Prediction #${match.predIndex + 1}` : 'None'}
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
                        {match.gtIndex !== null ? `GT #${match.gtIndex + 1}` : 'None'}
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
    </div>
  )
}

export default EvaluationReport
