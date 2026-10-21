import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './EvaluationDetail.css'
import { evalAPI } from '../utils/api'
import arrowLeftIcon from '../assets/icons/arrow-left.svg'
import SegmentDetailModal from './CreateEvaluation/SegmentDetailModal'
import VideoComparisonModal from './CreateEvaluation/VideoComparisonModal'
import { calculateEvaluationMetrics, matchOptionsForTask, isLegacyEvaluation, RANKING_METRICS, describeMatching, describeThreshold, counterpartSummary } from './CreateEvaluation/evaluationUtils'
import { efficiencyRows, EFFICIENCY_DEFINITIONS } from '../utils/evaluationEfficiency'
import MatchOptionsControls from './CreateEvaluation/MatchOptionsControls'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { embeddingLabel } from '../utils/embeddingTasks'

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
  // Re-scoring with different matching settings (shown only, never saved); null = as saved with the evaluation
  const [matchOverride, setMatchOverride] = useState(null)
  const [liveMetrics, setLiveMetrics] = useState(null)
  const activeMatchOptions = matchOverride || matchOptionsForTask(task)
  const [groundTruth, setGroundTruth] = useState(null)
  const [exporting, setExporting] = useState(false)

  const metricExplanations = {
    ...Object.fromEntries(Object.entries(EFFICIENCY_DEFINITIONS).map(([label, d]) => [`efficiency:${label}`, { title: d.title, formula: d.formula, description: d.details, interpretation: d.interpretation }])),
    Precision: {
      title: "Precision",
      formula: "TP / (TP + FP)",
      description: "The proportion of returned clips that match a ground-truth moment (overlap reaching the IoU threshold).",
      interpretation: "Higher precision means fewer false alarms - the model is more conservative and only predicts when confident."
    },
    Recall: {
      title: "Recall (Sensitivity)",
      formula: "Moments found / moments in ground truth",
      description: "The proportion of ground-truth moments that at least one returned clip matched. A moment counts once, however many clips land on it.",
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
      formula: "Found / (found + wrong clips + missed moments)",
      description: "Temporal segments have no true negatives, so this is found moments divided by everything that was found, wrong or missed.",
      interpretation: "A strict single number; read it with precision and recall rather than on its own."
    },
    MeanIoU: {
      title: "Mean IoU (Intersection over Union)",
      formula: "Average of (Overlap Duration / Union Duration) for all TP matches",
      description: "Measures the temporal overlap quality between predicted and ground truth segments. IoU = (intersection duration) / (union duration) for each matched pair.",
      interpretation: "Higher IoU means better temporal alignment. An IoU of 1.0 indicates perfect overlap, while 0.0 means no overlap."
    },
    MeanAveragePrecision: {
      title: "Mean Average Precision (mAP)",
      formula: "Mean over queries of: sum of precision at each hit rank / ground-truth moments",
      description: "Rewards finding the right moments near the top of the ranked results, at the chosen IoU threshold. Hits are counted one-to-one.",
      interpretation: "Higher means correct moments are ranked higher and few are missed."
    },
    RecallAt1: { title: "Recall@1", formula: "Moments found by the best-ranked clip / moments", description: "How much of the ground truth the single top result already finds.", interpretation: "Matters when users only look at the first result." },
    RecallAt5: { title: "Recall@5", formula: "Moments found in the top 5 clips / moments", description: "How much of the ground truth the first five results find.", interpretation: "A practical measure of 'is it on the first page'." },
    RecallAt10: { title: "Recall@10", formula: "Moments found in the top 10 clips / moments", description: "How much of the ground truth the first ten results find.", interpretation: "Shows whether a larger result list recovers what Recall@5 misses." },
    MRR: { title: "Mean Reciprocal Rank", formula: "Mean over queries of 1 / rank of the first matching clip", description: "How early the first correct clip appears: 1 if it is first, 0.5 if second, 0 if no clip matches.", interpretation: "Good for 'find me at least one right moment' searches." },
    NDCG10: { title: "NDCG@10", formula: "DCG@10 / ideal DCG@10, DCG = sum of 1 / log2(rank + 1) over hit clips in the top 10", description: "Rewards hits near the top of the first ten results. A clip scores 1 only if it finds a moment no better-ranked clip found; misses and duplicates score 0.", interpretation: "1 means every moment is found at the very top; lower means hits are ranked lower or missed." },
    MeanAveragePrecisionIoU30: { title: "mAP at IoU 0.3", formula: "mAP with a 0.3 IoU match threshold", description: "mAP when a clip only needs to overlap loosely.", interpretation: "Tolerant of imprecise boundaries." },
    MeanAveragePrecisionIoU50: { title: "mAP at IoU 0.5", formula: "mAP with a 0.5 IoU match threshold", description: "mAP at the most commonly reported overlap threshold.", interpretation: "The usual headline number for temporal localization." },
    MeanAveragePrecisionIoU70: { title: "mAP at IoU 0.7", formula: "mAP with a 0.7 IoU match threshold", description: "mAP when clips must line up closely with the moment.", interpretation: "A drop from IoU 0.3 to 0.7 means the model finds moments but with loose boundaries." }
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

      // Use the stored buffer time from the evaluation task
      const bufferTime = task.BufferTime !== undefined ? task.BufferTime : 0

      const result = calculateEvaluationMetrics(
        groundTruth.Labels || [],
        searchResults,
        '',
        [],
        bufferTime,
        activeMatchOptions
      )
      setLiveMetrics(matchOverride ? result.metrics : null)
      
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
  }, [groundTruth, task, matchOverride])

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

  const metrics = liveMetrics || task.EvaluationMetrics
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
                {embeddingLabel(task.analyzeTask)} - {task.analyzeTask?.ModelId || 'N/A'}
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
            {task.BufferTime !== undefined && task.BufferTime !== null && (
              <div className="summary-item">
                <span className="summary-label">Buffer Time:</span>
                <span className="summary-value">{task.BufferTime.toFixed(2)}s</span>
              </div>
            )}
            <div className="summary-item">
              <span className="summary-label">Matching:</span>
              <span className="summary-value">
                {matchOverride
                  ? `${describeMatching(matchOverride, task.BufferTime)} (re-scored, not saved)`
                  : isLegacyEvaluation(task) ? 'Earlier method (any overlap, duplicate hits allowed)' : describeMatching(matchOptionsForTask(task), task.BufferTime)}
              </span>
            </div>
          </div>

          {metrics && (
            <div className="metrics-section">
              <h3>Evaluation Metrics</h3>
              <details className="rescore-section" open={Boolean(matchOverride)} style={{ marginBottom: 12 }}>
                <summary style={{ cursor: 'pointer' }}>Re-score with different matching</summary>
                <div style={{ marginTop: 8 }}>
                  <MatchOptionsControls options={activeMatchOptions} onChange={setMatchOverride} />
                  {matchOverride && (
                    <div className="alert alert-warning" role="note" style={{ marginTop: 8 }}>
                      These metrics and tables are recalculated here from the stored clips and ground truth. Nothing is saved.
                      {' '}<button type="button" className="btn-link" onClick={() => setMatchOverride(null)}>Back to the saved scoring</button>
                    </div>
                  )}
                </div>
              </details>
              {isLegacyEvaluation(task) && !matchOverride && (
                <div className="alert alert-warning" role="note" style={{ marginBottom: 12 }}>
                  This evaluation was saved with the earlier matching method: any overlap counted as a hit and every
                  overlapping clip was a true positive, and recall divided clip counts by clip + moment counts. Recall,
                  F1 and Accuracy are overstated when several clips land on one moment. The numbers below are the ones
                  stored with it; create a new evaluation for corrected metrics and the ranking metrics.
                </div>
              )}
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
                  <div className="metric-description">Hit clips / clips returned</div>
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
                  <div className="metric-description">Moments found / moments in ground truth</div>
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

              {RANKING_METRICS.some(m => metrics[m.key] !== undefined) && (
                <>
                  <h4 style={{ marginTop: 16 }}>Ranking quality</h4>
                  <div className="metrics-grid">
                    {RANKING_METRICS.map(m => (
                      <div className="metric-card" key={m.key}>
                        <div className="metric-header">
                          <div className="metric-label">{m.label}</div>
                          <button
                            className="metric-info-btn"
                            onMouseEnter={(e) => {
                              setActiveTooltip(m.key)
                              const rect = e.currentTarget.getBoundingClientRect()
                              setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
                            }}
                            onMouseLeave={() => setActiveTooltip(null)}
                          >
                            <InfoIcon />
                          </button>
                        </div>
                        <div className="metric-value">
                          {metrics[m.key] !== undefined ? `${(metrics[m.key] * 100).toFixed(2)}%` : 'N/A'}
                        </div>
                        <div className="metric-description">{m.description}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              
              {efficiencyRows(task).length > 0 && (
                <>
                  <h4 style={{ marginTop: 16 }}>Efficiency</h4>
                  <div className="metrics-grid">
                    {efficiencyRows(task).map(row => (
                      <div className="metric-card" key={row.label} title={row.title}>
                        <div className="metric-header">
                          <div className="metric-label">{row.label}</div>
                          <button
                            className="metric-info-btn"
                            onMouseEnter={(e) => {
                              setActiveTooltip(`efficiency:${row.label}`)
                              const rect = e.currentTarget.getBoundingClientRect()
                              setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 8 })
                            }}
                            onMouseLeave={() => setActiveTooltip(null)}
                          >
                            <InfoIcon />
                          </button>
                        </div>
                        <div className="metric-value">{row.value}</div>
                        <div className="metric-description">{row.description}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

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
                {isLegacyEvaluation(task) && !matchOverride
                  ? 'This evaluation used the earlier rule: any temporal overlap counts as a hit.'
                  : `A clip is a hit when it reaches ${describeThreshold(activeMatchOptions)}. With one-to-one matching, a second clip on an already-found moment is a hit only if it covers a new part of that moment; otherwise it is a duplicate (false positive). IoU is shown for reference.`}
              </p>
              
              <div className="overlap-tables">
                <div className="overlap-table-container">
                  <h4>Ground Truth Segments ({matchingDetails.gtMatches.length})</h4>
                  <div className="overlap-table">
                    <div className="overlap-table-header with-label">
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
                        className={`overlap-table-row with-label status-${match.status.toLowerCase()} clickable`}
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
                          {(() => {
                          const s = counterpartSummary(match, 'gt', activeMatchOptions)
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
                          {(() => {
                            const s = counterpartSummary(match, 'pred', activeMatchOptions)
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
          matchingDetails={matchingDetails}
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
