import { useState, useEffect } from 'react'
import './EvaluationDetail.css'
import { evalAPI } from '../utils/api'
import { FetchPost } from '../utils/apiHelper'
import arrowLeftIcon from '../assets/icons/arrow-left.svg'
import SegmentDetailModal from './CreateEvaluation/SegmentDetailModal'
import { calculateEvaluationMetrics } from './CreateEvaluation/evaluationUtils'

function EvaluationDetail({ task, onBack }) {
  const [selectedSegment, setSelectedSegment] = useState(null)
  const [showSegmentModal, setShowSegmentModal] = useState(false)
  const [matchingDetails, setMatchingDetails] = useState(null)
  const [groundTruth, setGroundTruth] = useState(null)
  const [searchGroundTruth, setSearchGroundTruth] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEvaluationData()
  }, [task])

  const fetchEvaluationData = async () => {
    setLoading(true)
    try {
      // Fetch the original ground truth
      if (task.GroundTruthId) {
        const gtResponse = await evalAPI.getGroundTruths(task.VideoId)
        const gtBody = typeof gtResponse.body === 'string' ? JSON.parse(gtResponse.body) : gtResponse.body || gtResponse
        const groundTruths = gtBody.groundTruths || []
        const foundGT = groundTruths.find(gt => gt.Id === task.GroundTruthId)
        if (foundGT) {
          setGroundTruth(foundGT)
        }
      }

      // Fetch the search ground truth (model predictions)
      if (task.AnalyzeTasks && task.AnalyzeTasks.length > 0) {
        const analyzeTask = task.AnalyzeTasks[0]
        if (analyzeTask.SearchGroundTruthId) {
          const searchGTResponse = await evalAPI.getGroundTruths(task.VideoId)
          const searchGTBody = typeof searchGTResponse.body === 'string' ? JSON.parse(searchGTResponse.body) : searchGTResponse.body || searchGTResponse
          const allGTs = searchGTBody.groundTruths || []
          const foundSearchGT = allGTs.find(gt => gt.Id === analyzeTask.SearchGroundTruthId)
          if (foundSearchGT) {
            setSearchGroundTruth(foundSearchGT)
          }
        }
      }
    } catch (err) {
      console.error('Error fetching evaluation data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Recalculate matching details when we have both ground truths
    if (groundTruth && searchGroundTruth && task.AnalyzeTasks && task.AnalyzeTasks.length > 0) {
      const analyzeTask = task.AnalyzeTasks[0]
      const searchQuery = analyzeTask.SearchQuery || ''
      
      // Convert search ground truth labels to search results format
      const searchResults = searchGroundTruth.Labels.map((label, idx) => ({
        StartSec: label.StartTs,
        EndSec: label.EndTs,
        Distance: label.Score || 0
      }))

      const result = calculateEvaluationMetrics(
        groundTruth.Labels || [],
        searchResults,
        searchQuery
      )
      
      setMatchingDetails(result.details)
    }
  }, [groundTruth, searchGroundTruth, task])

  const handleSegmentClick = (match, type) => {
    setSelectedSegment({ ...match, type })
    setShowSegmentModal(true)
  }

  const handleCloseSegmentModal = () => {
    setShowSegmentModal(false)
    setSelectedSegment(null)
  }

  if (!task.AnalyzeTasks || task.AnalyzeTasks.length === 0) {
    return (
      <div className="evaluation-detail">
        <div className="evaluation-detail-header">
          <button className="btn-back" onClick={onBack}>
            <img src={arrowLeftIcon} alt="Back" />
            Back to List
          </button>
          <h1>Evaluation Details</h1>
        </div>
        <div className="alert alert-error">
          No evaluation data available for this task.
        </div>
      </div>
    )
  }

  const analyzeTask = task.AnalyzeTasks[0]
  const metrics = analyzeTask.EvaluationMetrics
  const searchQueries = analyzeTask.SearchQueries || [analyzeTask.SearchQuery]

  return (
    <div className="evaluation-detail">
      <div className="evaluation-detail-header">
        <button className="btn-back" onClick={onBack}>
          <img src={arrowLeftIcon} alt="Back" />
          Back to List
        </button>
        <h1>{task.Name}</h1>
      </div>

      <div className="evaluation-detail-content">
        <div className="form-section">
          <h2>Evaluation Details</h2>
          
          {task.Description && (
            <div className="description-section">
              <p>{task.Description}</p>
            </div>
          )}

          <div className="summary-section">
            <h3>Summary</h3>
            <div className="summary-item">
              <span className="summary-label">Video:</span>
              <span className="summary-value">{task.video?.Name || 'N/A'}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Ground Truth:</span>
              <span className="summary-value">{task.groundTruth?.Name || 'N/A'}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Model:</span>
              <span className="summary-value">
                {analyzeTask.VideoAnalyzeTask?.Type === 'nova-mme' ? 'Nova MME' : 'TwelveLabs'} - {analyzeTask.VideoAnalyzeTask?.ModelId || 'N/A'}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Search Queries:</span>
              <span className="summary-value">{searchQueries.map(q => `"${q}"`).join(', ')}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Created:</span>
              <span className="summary-value">{new Date(task.CreatedAt).toLocaleString()}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Status:</span>
              <span className={`status-badge ${task.Status}`}>{task.Status}</span>
            </div>
          </div>

          {metrics && (
            <div className="metrics-section">
              <h3>Evaluation Metrics</h3>
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">Precision</div>
                  <div className="metric-value">{(metrics.Precision * 100).toFixed(2)}%</div>
                  <div className="metric-description">TP / (TP + FP)</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Recall</div>
                  <div className="metric-value">{(metrics.Recall * 100).toFixed(2)}%</div>
                  <div className="metric-description">TP / (TP + FN)</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">F1 Score</div>
                  <div className="metric-value">{(metrics.F1Score * 100).toFixed(2)}%</div>
                  <div className="metric-description">Harmonic mean</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Accuracy</div>
                  <div className="metric-value">{(metrics.Accuracy * 100).toFixed(2)}%</div>
                  <div className="metric-description">Overall accuracy</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Mean IoU</div>
                  <div className="metric-value">{(metrics.MeanIoU * 100).toFixed(2)}%</div>
                  <div className="metric-description">Temporal overlap</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">mAP</div>
                  <div className="metric-value">{(metrics.MeanAveragePrecision * 100).toFixed(2)}%</div>
                  <div className="metric-description">Mean Avg Precision</div>
                </div>
              </div>
              
              <div className="confusion-matrix">
                <h4>Confusion Matrix</h4>
                <div className="confusion-grid">
                  <div className="confusion-item tp">
                    <div className="confusion-label">True Positives</div>
                    <div className="confusion-value">{metrics.TruePositives}</div>
                  </div>
                  <div className="confusion-item fp">
                    <div className="confusion-label">False Positives</div>
                    <div className="confusion-value">{metrics.FalsePositives}</div>
                  </div>
                  <div className="confusion-item fn">
                    <div className="confusion-label">False Negatives</div>
                    <div className="confusion-value">{metrics.FalseNegatives}</div>
                  </div>
                  <div className="confusion-item tn">
                    <div className="confusion-label">True Negatives</div>
                    <div className="confusion-value">{metrics.TrueNegatives}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {matchingDetails && matchingDetails.gtMatches && matchingDetails.predMatches && (
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
                        onClick={() => handleSegmentClick(match, 'gt')}
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
                        onClick={() => handleSegmentClick(match, 'pred')}
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
      </div>

      {showSegmentModal && task.video && (
        <SegmentDetailModal
          segment={selectedSegment}
          selectedVideo={task.video}
          onClose={handleCloseSegmentModal}
        />
      )}
    </div>
  )
}

export default EvaluationDetail
