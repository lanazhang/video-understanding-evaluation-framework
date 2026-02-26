import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './EvaluationDetail.css'
import { evalAPI } from '../utils/api'
import arrowLeftIcon from '../assets/icons/arrow-left.svg'
import SegmentDetailModal from './CreateEvaluation/SegmentDetailModal'
import VideoComparisonModal from './CreateEvaluation/VideoComparisonModal'
import { calculateEvaluationMetrics } from './CreateEvaluation/evaluationUtils'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

function EvaluationDetail({ task, onBack }) {
  const navigate = useNavigate()
  
  const InfoIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 7V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="8" cy="5" r="0.5" fill="currentColor"/>
    </svg>
  )
  const [selectedSegment, setSelectedSegment] = useState(null)
  const [showSegmentModal, setShowSegmentModal] = useState(false)
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [matchingDetails, setMatchingDetails] = useState(null)
  const [groundTruth, setGroundTruth] = useState(null)
  const [exporting, setExporting] = useState(false)

  const metricExplanations = {
    Precision: {
      title: "Precision",
      formula: "TP / (TP + FP)",
      description: "Measures the accuracy of positive predictions. It represents the proportion of predicted segments that actually overlap with ground truth segments.",
      interpretation: "Higher precision means fewer false alarms - the model is more conservative and only predicts when confident."
    },
    Recall: {
      title: "Recall (Sensitivity)",
      formula: "TP / (TP + FN)",
      description: "Measures the completeness of detection. It represents the proportion of ground truth segments that were successfully detected by the model.",
      interpretation: "Higher recall means fewer missed detections - the model catches more of the actual events."
    },
    F1Score: {
      title: "F1 Score",
      formula: "2 × (Precision × Recall) / (Precision + Recall)",
      description: "The harmonic mean of precision and recall, providing a single score that balances both metrics.",
      interpretation: "F1 score is useful when you need a balance between precision and recall. A high F1 score indicates both high precision and high recall."
    },
    Accuracy: {
      title: "Accuracy",
      formula: "(TP + TN) / (TP + TN + FP + FN)",
      description: "The overall correctness of the model across all predictions, including both positive and negative cases.",
      interpretation: "While intuitive, accuracy can be misleading with imbalanced datasets. Use precision, recall, and F1 for better insights."
    },
    MeanIoU: {
      title: "Mean IoU (Intersection over Union)",
      formula: "Average of (Overlap Duration / Union Duration) for all TP matches",
      description: "Measures the temporal overlap quality between predicted and ground truth segments. IoU = (intersection duration) / (union duration) for each matched pair.",
      interpretation: "Higher IoU means better temporal alignment. An IoU of 1.0 indicates perfect overlap, while 0.0 means no overlap."
    },
    MeanAveragePrecision: {
      title: "Mean Average Precision (mAP)",
      formula: "Average precision across all ground truth segments",
      description: "Evaluates both detection accuracy and temporal localization quality. Considers the ranking of predictions by confidence scores.",
      interpretation: "mAP provides a comprehensive measure of detection performance, accounting for both precision and temporal accuracy."
    }
  }

  const [activeTooltip, setActiveTooltip] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    fetchEvaluationData()
  }, [task])

  const fetchEvaluationData = async () => {
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
    } catch (err) {
      console.error('Error fetching evaluation data:', err)
    }
  }

  useEffect(() => {
    // Recalculate matching details when we have ground truth and evaluation labels
    if (groundTruth && task.Labels && task.EvaluationMetrics) {
      // Convert evaluation labels to search results format
      const searchResults = task.Labels.map((label) => ({
        StartSec: label.StartTs,
        EndSec: label.EndTs,
        Distance: label.Score || 0
      }))

      const result = calculateEvaluationMetrics(
        groundTruth.Labels || [],
        searchResults,
        ''
      )
      
      // Add all ground truth labels to gtMatches, marking non-true_positive ones as TN
      const allGTMatches = (groundTruth.Labels || []).map((label, idx) => {
        // Find if this label is already in gtMatches from the calculation
        const existingMatch = result.details.gtMatches.find(m => m.gtIndex === idx)
        
        if (existingMatch) {
          return existingMatch
        } else {
          // This label was not included in evaluation (not true_positive/reviewed)
          // Mark it as TN (True Negative)
          return {
            gtIndex: idx,
            gtLabel: label,
            predIndex: null,
            predLabel: null,
            iou: 0,
            status: 'TN'
          }
        }
      })
      
      setMatchingDetails({
        gtMatches: allGTMatches,
        predMatches: result.details.predMatches
      })
    }
  }, [groundTruth, task])

  const handleSegmentClick = (match, type) => {
    setSelectedSegment({ ...match, type })
    setShowSegmentModal(true)
  }

  const handleCloseSegmentModal = () => {
    setShowSegmentModal(false)
    setSelectedSegment(null)
  }

  const handleExportPDF = async () => {
    setExporting(true)
    try {
      const element = document.querySelector('.evaluation-detail-content')
      if (!element) {
        console.error('Content element not found')
        return
      }

      // Create canvas from the content
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = canvas.width
      const imgHeight = canvas.height
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight)
      const imgX = (pdfWidth - imgWidth * ratio) / 2
      const imgY = 10

      // Add content to PDF
      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio)
      
      // Save PDF
      const fileName = `${task.Name.replace(/[^a-z0-9]/gi, '_')}_evaluation_report.pdf`
      pdf.save(fileName)
    } catch (error) {
      console.error('Error exporting PDF:', error)
      alert('Failed to export PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const handleVideoClick = (e) => {
    e.stopPropagation()
    setShowVideoModal(true)
  }

  const handleVideoNameClick = (e) => {
    e.preventDefault()
    setShowVideoModal(true)
  }

  const handleCloseVideoModal = () => {
    setShowVideoModal(false)
  }

  if (!task.EvaluationMetrics) {
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

  const metrics = task.EvaluationMetrics
  const searchLabels = task.Labels || []

  return (
    <div className="evaluation-detail">
      <div className="evaluation-detail-header">
        <button className="btn-back" onClick={onBack}>
          <img src={arrowLeftIcon} alt="Back" />
          Back to List
        </button>
        <h1>{task.Name}</h1>
        <button 
          className="btn-export-pdf" 
          onClick={handleExportPDF}
          disabled={exporting}
        >
          {exporting ? 'Exporting...' : '📄 Export PDF'}
        </button>
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
              <span className="summary-value">
                {task.video?.Name ? (
                  <button 
                    className="video-link" 
                    onClick={handleVideoNameClick}
                    title="Go to video analyze page"
                  >
                    {task.video.Name}
                  </button>
                ) : 'N/A'}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Ground Truth:</span>
              <span className="summary-value">{task.groundTruth?.Name || 'N/A'}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Model:</span>
              <span className="summary-value">
                {task.analyzeTask?.Type === 'nova-mme' ? 'Nova MME' : 'TwelveLabs'} - {task.analyzeTask?.ModelId || 'N/A'}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Search Results:</span>
              <span className="summary-value">{searchLabels.length} segments</span>
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
                  <div className="metric-header">
                    <div className="metric-label">Precision</div>
                    <button 
                      className="metric-info-btn"
                      onMouseEnter={(e) => {
                        setActiveTooltip('Precision')
                        const rect = e.currentTarget.getBoundingClientRect()
                        setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
                      }}
                      onMouseLeave={() => setActiveTooltip(null)}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M8 7V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="8" cy="5" r="0.5" fill="currentColor"/>
                      </svg>
                    </button>
                  </div>
                  <div className="metric-value">{(metrics.Precision * 100).toFixed(2)}%</div>
                  <div className="metric-description">TP / (TP + FP)</div>
                </div>
                <div className="metric-card">
                  <div className="metric-header">
                    <div className="metric-label">Recall</div>
                    <button 
                      className="metric-info-btn"
                      onMouseEnter={(e) => {
                        setActiveTooltip('Recall')
                        const rect = e.currentTarget.getBoundingClientRect()
                        setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
                      }}
                      onMouseLeave={() => setActiveTooltip(null)}
                    >
                      <InfoIcon />
                    </button>
                  </div>
                  <div className="metric-value">{(metrics.Recall * 100).toFixed(2)}%</div>
                  <div className="metric-description">TP / (TP + FN)</div>
                </div>
                <div className="metric-card">
                  <div className="metric-header">
                    <div className="metric-label">F1 Score</div>
                    <button 
                      className="metric-info-btn"
                      onMouseEnter={(e) => {
                        setActiveTooltip('F1Score')
                        const rect = e.currentTarget.getBoundingClientRect()
                        setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
                      }}
                      onMouseLeave={() => setActiveTooltip(null)}
                    >
                      <InfoIcon />
                    </button>
                  </div>
                  <div className="metric-value">{(metrics.F1Score * 100).toFixed(2)}%</div>
                  <div className="metric-description">Harmonic mean</div>
                </div>
                <div className="metric-card">
                  <div className="metric-header">
                    <div className="metric-label">Accuracy</div>
                    <button 
                      className="metric-info-btn"
                      onMouseEnter={(e) => {
                        setActiveTooltip('Accuracy')
                        const rect = e.currentTarget.getBoundingClientRect()
                        setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
                      }}
                      onMouseLeave={() => setActiveTooltip(null)}
                    >
                      <InfoIcon />
                    </button>
                  </div>
                  <div className="metric-value">{(metrics.Accuracy * 100).toFixed(2)}%</div>
                  <div className="metric-description">Overall accuracy</div>
                </div>
                <div className="metric-card">
                  <div className="metric-header">
                    <div className="metric-label">Mean IoU</div>
                    <button 
                      className="metric-info-btn"
                      onMouseEnter={(e) => {
                        setActiveTooltip('MeanIoU')
                        const rect = e.currentTarget.getBoundingClientRect()
                        setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
                      }}
                      onMouseLeave={() => setActiveTooltip(null)}
                    >
                      <InfoIcon />
                    </button>
                  </div>
                  <div className="metric-value">{(metrics.MeanIoU * 100).toFixed(2)}%</div>
                  <div className="metric-description">Temporal overlap</div>
                </div>
                <div className="metric-card">
                  <div className="metric-header">
                    <div className="metric-label">mAP</div>
                    <button 
                      className="metric-info-btn"
                      onMouseEnter={(e) => {
                        setActiveTooltip('MeanAveragePrecision')
                        const rect = e.currentTarget.getBoundingClientRect()
                        setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
                      }}
                      onMouseLeave={() => setActiveTooltip(null)}
                    >
                      <InfoIcon />
                    </button>
                  </div>
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
              <div className="overlap-section-header">
                <h3>Segment Matching Details</h3>
                <button 
                  className="btn-view-timeline"
                  onClick={handleVideoClick}
                  title="View video with timeline comparison"
                >
                  View Timeline Comparison
                </button>
              </div>
              <p className="overlap-description">
                Segments are matched based on any temporal overlap. IoU (Intersection over Union) is calculated for display purposes.
              </p>
              
              <div className="overlap-tables">
                <div className="overlap-table-container">
                  <h4>Ground Truth Segments ({matchingDetails.gtMatches.length})</h4>
                  <div className="overlap-table">
                    <div className="overlap-table-header">
                      <div className="overlap-col-index">#</div>
                      <div className="overlap-col-time">Time Range</div>
                      <div className="overlap-col-label">Label</div>
                      <div className="overlap-col-status">Status</div>
                      <div className="overlap-col-iou">IoU</div>
                      <div className="overlap-col-match">Matched To</div>
                    </div>
                    {[...matchingDetails.gtMatches]
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
                        <div className="overlap-col-label">
                          {match.gtLabel.Label || 'N/A'}
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

      {showVideoModal && task.video && groundTruth && (
        <VideoComparisonModal
          video={task.video}
          groundTruthLabels={groundTruth.Labels || []}
          evaluationLabels={task.Labels || []}
          onClose={handleCloseVideoModal}
        />
      )}

      {activeTooltip && (
        <div 
          className="metric-tooltip"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`
          }}
        >
          <div className="tooltip-title">{metricExplanations[activeTooltip].title}</div>
          <div className="tooltip-formula">{metricExplanations[activeTooltip].formula}</div>
          <div className="tooltip-description">{metricExplanations[activeTooltip].description}</div>
          <div className="tooltip-interpretation">{metricExplanations[activeTooltip].interpretation}</div>
        </div>
      )}
    </div>
  )
}

export default EvaluationDetail
