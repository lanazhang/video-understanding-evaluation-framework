import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import './EvaluationManagement.css'
import { evalAPI } from '../utils/api'
import refreshIcon from '../assets/icons/refresh.svg'
import trashIcon from '../assets/icons/trash.svg'
import EvaluationDetail from './EvaluationDetail'
import CreateEvaluationInline from './CreateEvaluationInline'
import { calculateEvaluationMetrics, matchOptionsForTask, isLegacyEvaluation, RANKING_METRICS, describeMatching, describeThreshold, formatRange, describeOverlap } from './CreateEvaluation/evaluationUtils'
import { efficiencyRows } from '../utils/evaluationEfficiency'
import MultiEvaluationComparisonModal from './CreateEvaluation/MultiEvaluationComparisonModal'

function EvaluationManagement({ currentUser, initialGTFilter = null }) {
  const navigate = useNavigate()
  const [evaluationTasks, setEvaluationTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [gtFilter, setGtFilter] = useState(initialGTFilter)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDirection, setSortDirection] = useState('desc')
  const [selectedEvals, setSelectedEvals] = useState([])
  const [previewVideo, setPreviewVideo] = useState(null)
  const [showComparison, setShowComparison] = useState(false)
  const [showMultiVideoModal, setShowMultiVideoModal] = useState(false)
  
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (!hasFetchedRef.current && currentUser) {
      hasFetchedRef.current = true
      fetchEvaluationTasks()
    }
  }, [currentUser])

  useEffect(() => {
    // Update filter when initialGTFilter changes
    if (initialGTFilter) {
      setGtFilter(initialGTFilter)
    }
  }, [initialGTFilter])

  const fetchEvaluationTasks = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const username = currentUser?.username || currentUser?.signInDetails?.loginId || ''
      console.log('Fetching evaluation tasks for user:', username)
      
      const payload = username ? { createdBy: username } : {}
      console.log('Request payload:', payload)
      
      const response = await evalAPI.getEvaluationTasks(null, null, username)
      console.log('API response:', response)
      
      // Handle different response formats
      let responseBody
      let statusCode = response?.statusCode
      
      if (statusCode === 200) {
        responseBody = typeof response.body === 'string' ? JSON.parse(response.body) : response.body
      } else if (response?.evaluationTasks) {
        responseBody = response
        statusCode = 200
      } else {
        console.error('Unexpected response format:', response)
        setError('Unexpected response format from server')
        return
      }
      
      const evaluationTasks = responseBody.evaluationTasks || []
      console.log('Evaluation tasks received:', evaluationTasks.length)
        
      const transformedTasks = evaluationTasks.map(task => ({
        id: task.Id,
        Id: task.Id,
        taskName: task.Name,
        Name: task.Name,
        description: task.Description || '',
        Description: task.Description || '',
        createdBy: task.CreatedBy,
        CreatedBy: task.CreatedBy,
        createdDate: task.CreatedAt ? new Date(task.CreatedAt).toLocaleDateString() : 'N/A',
        createdAt: task.CreatedAt,
        CreatedAt: task.CreatedAt,
        completedAt: task.CompletedAt,
        CompletedAt: task.CompletedAt,
        videoId: task.VideoId,
        VideoId: task.VideoId,
        videoAnalyzeTaskId: task.VideoAnalyzeTaskId,
        VideoAnalyzeTaskId: task.VideoAnalyzeTaskId,
        groundTruthId: task.GroundTruthId,
        GroundTruthId: task.GroundTruthId,
        labels: task.Labels || [],
        Labels: task.Labels || [],
        evaluationMetrics: task.EvaluationMetrics || {},
        EvaluationMetrics: task.EvaluationMetrics || {},
        analyzeTasks: task.AnalyzeTasks || [],
        AnalyzeTasks: task.AnalyzeTasks || [],
        status: task.Status || 'created',
        Status: task.Status || 'created',
        video: task.video || null,
        groundTruth: task.groundTruth || null,
        analyzeTask: task.analyzeTask || null,
        // list columns (also the sort keys)
        modelId: task.analyzeTask?.ModelId || '',
        groundTruthName: task.groundTruth?.Name || '',
        // Settings the metrics were computed with (missing on evaluations saved by earlier versions)
        BufferTime: task.BufferTime,
        MatchVersion: task.MatchVersion,
        MatchIouThreshold: task.MatchIouThreshold,
        MatchBy: task.MatchBy,
        MatchThreshold: task.MatchThreshold,
        OneToOne: task.OneToOne
      }))
        
      setEvaluationTasks(transformedTasks)
      console.log('Successfully loaded', transformedTasks.length, 'evaluation tasks')
    } catch (err) {
      console.error('Error in fetchEvaluationTasks:', err)
      console.error('Error stack:', err.stack)
      setError(err.message || 'Failed to fetch evaluation tasks')
    } finally {
      setLoading(false)
    }
  }

  const handleTaskClick = (task) => {
    if (selectedEvals.length > 0) {
      // In selection mode, don't navigate
      return
    }
    navigate(`/evaluation/${task.id}`)
  }

  const handleCheckboxChange = (task, checked) => {
    if (checked) {
      // Check if this is the first selection or if it matches the ground truth
      if (selectedEvals.length === 0) {
        setSelectedEvals([task])
      } else {
        const firstGT = selectedEvals[0].groundTruthId
        if (task.groundTruthId === firstGT) {
          setSelectedEvals([...selectedEvals, task])
        } else {
          alert('Please select evaluations with the same ground truth for comparison')
        }
      }
    } else {
      setSelectedEvals(selectedEvals.filter(e => e.id !== task.id))
    }
  }

  // "Select all" picks every listed evaluation that shares a ground truth (the one already selected, else the first row's),
  // because only evaluations of the same ground truth can be compared
  const selectableForAll = () => {
    const gtId = selectedEvals[0]?.groundTruthId ?? sortedAndFilteredTasks[0]?.groundTruthId
    return sortedAndFilteredTasks.filter(t => t.groundTruthId === gtId)
  }

  const handleSelectAll = (checked) => {
    setSelectedEvals(checked ? selectableForAll() : [])
  }

  const handleCompare = () => {
    if (selectedEvals.length < 2) {
      alert('Please select at least 2 evaluations to compare')
      return
    }
    setShowComparison(true)
  }

  const handleClearSelection = () => {
    setSelectedEvals([])
  }

  const handleCloseComparison = () => {
    setShowComparison(false)
    setSelectedEvals([])
  }

  const handleOpenMultiVideoModal = () => {
    setShowMultiVideoModal(true)
  }

  const handleCloseMultiVideoModal = () => {
    setShowMultiVideoModal(false)
  }

  const handleBackToList = () => {
    fetchEvaluationTasks()
  }

  const handleCreateNew = () => {
    setShowCreateForm(true)
  }

  const handleCancelCreate = () => {
    setShowCreateForm(false)
  }

  const handleCreateSuccess = () => {
    setShowCreateForm(false)
    fetchEvaluationTasks()
  }

  const handleDelete = async (e, task) => {
    e.stopPropagation()
    
    if (!window.confirm(`Are you sure you want to delete "${task.taskName}"? This action cannot be undone.`)) {
      return
    }

    try {
      await evalAPI.deleteEvaluationTask(task.id)
      console.log('Evaluation task deleted successfully:', task.id)
    } catch (err) {
      console.error('Error deleting evaluation task:', err)
    } finally {
      fetchEvaluationTasks()
    }
  }

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const getSortedEvaluationTasks = (tasksToSort) => {
    const sorted = [...tasksToSort].sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }

  const getSortIcon = (field) => {
    if (sortField !== field) return '⇅'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  const filteredTasks = evaluationTasks.filter(task => {
    const query = searchQuery.toLowerCase()
    const taskName = task.taskName?.toLowerCase() || ''
    const videoName = task.video?.Name?.toLowerCase() || ''
    const gtName = task.groundTruth?.Name?.toLowerCase() || ''
    
    // Apply GT filter if set
    if (gtFilter && task.groundTruthId !== gtFilter) {
      return false
    }
    
    const modelName = task.modelId?.toLowerCase() || ''
    return taskName.includes(query) || videoName.includes(query) || gtName.includes(query) || modelName.includes(query)
  })

  const sortedAndFilteredTasks = getSortedEvaluationTasks(filteredTasks)

  // If showing comparison view
  if (showComparison) {
    // Get the first task's video thumbnail for display at the top
    const sharedVideo = selectedEvals[0]?.video
    
    return (
      <div className="evaluation-comparison">
        <div className="comparison-header">
          <button className="btn-back" onClick={handleCloseComparison}>
            ← Back to List
          </button>
          <h1>Evaluation Comparison</h1>
          <button 
            className="btn-view-all-timeline"
            onClick={handleOpenMultiVideoModal}
            disabled={!selectedEvals[0]?.video || !selectedEvals[0]?.groundTruth}
            title={!selectedEvals[0]?.video || !selectedEvals[0]?.groundTruth ? "Video or ground truth not available" : "View all evaluations on timeline"}
          >
            View Timeline Comparison
          </button>
        </div>
        
        {sharedVideo?.thumbnail_url && (
          <div className="comparison-shared-thumbnail">
            <img 
              src={sharedVideo.thumbnail_url} 
              alt={sharedVideo.Name}
              className="shared-thumbnail-img"
            />
            <div className="shared-thumbnail-label">{sharedVideo.Name}</div>
          </div>
        )}
        
        <div className="comparison-grid">
          {selectedEvals.map(task => {
            const metrics = task.EvaluationMetrics || task.analyzeTasks?.[0]?.EvaluationMetrics
            
            // Calculate matching details for this task if we have ground truth
            let matchingDetails = null
            if (task.groundTruth && task.Labels) {
              const searchResults = task.Labels.map((label) => ({
                StartSec: label.StartTs,
                EndSec: label.EndTs,
                Distance: label.Score || 0
              }))
              const bufferTime = task.BufferTime !== undefined ? task.BufferTime : 0
              const result = calculateEvaluationMetrics(
                task.groundTruth.Labels || [],
                searchResults,
                '',
                [],
                bufferTime,
                matchOptionsForTask(task)
              )
              matchingDetails = result.details
            }
            
            return (
              <div key={task.id} className="comparison-card">
                <div className="comparison-card-header">
                  <h3>{task.taskName || task.Name}</h3>
                  {task.analyzeTask?.ModelId && (
                    <div className="comparison-model-id">{task.analyzeTask.ModelId}</div>
                  )}
                </div>
                
                <div className="comparison-metrics">
                  <div className="comparison-metric">
                    <div className="metric-label">Precision</div>
                    <div className="metric-value">
                      {metrics?.Precision !== undefined ? `${(metrics.Precision * 100).toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                  <div className="comparison-metric">
                    <div className="metric-label">Recall</div>
                    <div className="metric-value">
                      {metrics?.Recall !== undefined ? `${(metrics.Recall * 100).toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                  <div className="comparison-metric">
                    <div className="metric-label">F1 Score</div>
                    <div className="metric-value">
                      {metrics?.F1Score !== undefined ? `${(metrics.F1Score * 100).toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                  <div className="comparison-metric">
                    <div className="metric-label">Accuracy</div>
                    <div className="metric-value">
                      {metrics?.Accuracy !== undefined ? `${(metrics.Accuracy * 100).toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                  <div className="comparison-metric">
                    <div className="metric-label">Mean IoU</div>
                    <div className="metric-value">
                      {metrics?.MeanIoU !== undefined ? `${(metrics.MeanIoU * 100).toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                  <div className="comparison-metric">
                    <div className="metric-label">mAP</div>
                    <div className="metric-value">
                      {metrics?.MeanAveragePrecision !== undefined ? `${(metrics.MeanAveragePrecision * 100).toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                </div>
                
                <div className="comparison-confusion">
                  <h4>Ranking quality</h4>
                  <div className="comparison-metrics">
                    {RANKING_METRICS.map(m => (
                      <div className="comparison-metric" key={m.key} title={m.description}>
                        <div className="metric-label">{m.label}</div>
                        <div className="metric-value">
                          {metrics?.[m.key] !== undefined ? `${(metrics[m.key] * 100).toFixed(1)}%` : 'N/A'}
                        </div>
                      </div>
                    ))}
                  </div>
                  <small style={{ display: 'block', marginTop: 6, opacity: 0.75 }}>
                    {isLegacyEvaluation(task)
                      ? 'Saved with the earlier matching method (any overlap); ranking metrics need a new evaluation.'
                      : `Matching: ${describeMatching(matchOptionsForTask(task), task.BufferTime)}`}
                  </small>
                </div>

                {efficiencyRows(task).length > 0 && (
                  <div className="comparison-confusion">
                    <h4>Efficiency</h4>
                    <div className="comparison-metrics">
                      {efficiencyRows(task).map(row => (
                        <div className="comparison-metric" key={row.label} title={row.title}>
                          <div className="metric-label">{row.label}</div>
                          <div className="metric-value">{row.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="comparison-confusion">
                  <h4>Confusion Matrix</h4>
                  <div className="confusion-grid-compact">
                    <div className="confusion-item-compact tp">
                      <div className="confusion-label-compact">TP</div>
                      <div className="confusion-value-compact">{metrics?.TruePositives || 0}</div>
                    </div>
                    <div className="confusion-item-compact fp">
                      <div className="confusion-label-compact">FP</div>
                      <div className="confusion-value-compact">{metrics?.FalsePositives || 0}</div>
                    </div>
                    <div className="confusion-item-compact fn">
                      <div className="confusion-label-compact">FN</div>
                      <div className="confusion-value-compact">{metrics?.FalseNegatives || 0}</div>
                    </div>
                    <div className="confusion-item-compact tn">
                      <div className="confusion-label-compact">TN</div>
                      <div className="confusion-value-compact">{metrics?.TrueNegatives || 0}</div>
                    </div>
                  </div>
                </div>
                
                {matchingDetails?.gtMatches && (
                  <div className="comparison-labels">
                    <h4>Ground Truth Ranges ({matchingDetails.gtMatches.length})</h4>
                    <div className="comparison-labels-list">
                      {[...matchingDetails.gtMatches]
                        .sort((a, b) => parseFloat(a.gtLabel.StartTs || 0) - parseFloat(b.gtLabel.StartTs || 0))
                        .map((m) => {
                          const matchSettings = matchOptionsForTask(task)
                          return (
                            <div key={m.gtIndex} className={`comparison-label-item ${m.status.toLowerCase()}`}>
                              <div className="label-time">{formatRange(m.gtLabel)}</div>
                              <div className="label-info comparison-overlap-block">
                                {m.clips.length === 0 ? (
                                  <div className="comparison-overlap-line">No returned clip touches this range</div>
                                ) : m.clips.slice(0, 3).map(c => (
                                  <div className="comparison-overlap-line" key={c.predIndex}>
                                    {c.claimed ? 'Found by' : 'Touched by'} clip {formatRange(c.predLabel)}: {describeOverlap(c)}
                                    {!c.claimed ? (c.meetsThreshold ? ' \u00b7 a better-ranked clip already found it' : ` \u00b7 does not reach ${describeThreshold(matchSettings)}`) : ''}
                                  </div>
                                ))}
                                {m.clips.length > 3 && <div className="comparison-overlap-line">+{m.clips.length - 3} more clips</div>}
                              </div>
                              <div className={`label-result-badge ${m.status.toLowerCase()}`}>{m.status}</div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                <div className="comparison-labels">
                  <h4>Segment Details ({task.Labels?.length || 0} segments)</h4>
                  <div className="comparison-labels-list">
                    {task.Labels && task.Labels.length > 0 ? (
                      task.Labels.map((label, idx) => {
                        // Get the evaluation status from matching details
                        let status = '—'
                        let overlaps = []
                        
                        if (matchingDetails?.predMatches) {
                          const match = matchingDetails.predMatches.find(m => m.predIndex === idx)
                          if (match) {
                            status = match.status
                            overlaps = match.overlaps || []
                          }
                        }
                        const matchSettings = matchOptionsForTask(task)
                        
                        return (
                          <div key={idx} className={`comparison-label-item ${status.toLowerCase()}`}>
                            <div className="label-time">
                              {label.StartTs?.toFixed(2)}s - {label.EndTs?.toFixed(2)}s
                            </div>
                            <div className="label-info comparison-overlap-block">
                              <span className="label-text">{label.Label}</span>
                              {matchingDetails?.predMatches && (overlaps.length === 0 ? (
                                <div className="comparison-overlap-line">No overlap with any ground-truth range</div>
                              ) : overlaps.slice(0, 2).map(o => (
                                <div className="comparison-overlap-line" key={o.gtIndex}>
                                  vs GT {formatRange(o.gtLabel)}: {describeOverlap(o)}
                                  {!o.claimed ? (o.meetsThreshold ? ' \u00b7 duplicate: that range is already found' : ` \u00b7 does not reach ${describeThreshold(matchSettings)}`) : ''}
                                </div>
                              )))}
                              {overlaps.length > 2 && <div className="comparison-overlap-line">+{overlaps.length - 2} more ground-truth ranges</div>}
                            </div>
                            <div className={`label-result-badge ${status.toLowerCase()}`}>
                              {status}
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="no-labels">No segments</div>
                    )}
                  </div>
                </div>
                
                <div className="comparison-actions">
                  <button 
                    className="btn-view-detail"
                    onClick={() => navigate(`/evaluation/${task.id}`)}
                  >
                    View Details
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {showMultiVideoModal && selectedEvals.length > 0 && selectedEvals[0].video && selectedEvals[0].groundTruth && (
          <MultiEvaluationComparisonModal
            video={selectedEvals[0].video}
            groundTruthLabels={selectedEvals[0].groundTruth.Labels || []}
            evaluationTasks={selectedEvals.map(task => ({
              ...task,
              matchingDetails: task.groundTruth && task.Labels
                ? calculateEvaluationMetrics(
                    task.groundTruth.Labels || [],
                    task.Labels.map((label) => ({
                      StartSec: label.StartTs,
                      EndSec: label.EndTs,
                      Distance: label.Score || 0
                    })),
                    '',
                    [],
                    task.BufferTime !== undefined ? task.BufferTime : 0,
                    matchOptionsForTask(task)
                  ).details
                : null
            }))}
            onClose={handleCloseMultiVideoModal}
          />
        )}
      </div>
    )
  }

  // If creating new evaluation
  if (showCreateForm) {
    return (
      <CreateEvaluationInline 
        currentUser={currentUser}
        onCancel={handleCancelCreate}
        onSuccess={handleCreateSuccess}
      />
    )
  }

  // List view
  return (
    <div className="evaluation-management">
      {previewVideo && (
        <div
          className="video-preview-overlay"
          role="dialog"
          aria-label="Video preview"
          onClick={() => setPreviewVideo(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setPreviewVideo(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, padding: 16, maxWidth: '80vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong>{previewVideo.Name}</strong>
              <button type="button" aria-label="Close preview" onClick={() => setPreviewVideo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <video src={previewVideo.video_url} controls autoPlay muted style={{ maxWidth: '100%', maxHeight: '70vh' }} />
          </div>
        </div>
      )}
      <div className="content-header">
        <h1>Evaluation</h1>
        <div className="header-actions">
          {selectedEvals.length > 0 && (
            <>
              <span className="selection-count">{selectedEvals.length} selected</span>
              <button 
                className="btn-compare" 
                onClick={handleCompare}
                disabled={selectedEvals.length < 2}
              >
                Compare Selected
              </button>
              <button 
                className="btn-clear-selection" 
                onClick={handleClearSelection}
              >
                Clear
              </button>
            </>
          )}
          <button 
            className="btn-refresh" 
            onClick={fetchEvaluationTasks}
            disabled={loading}
            title="Refresh list"
          >
            <img src={refreshIcon} alt="Refresh" />
          </button>
          <button className="btn-create" onClick={handleCreateNew}>
            + Create Evaluation
          </button>
        </div>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search evaluations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        {searchQuery && (
          <button 
            className="btn-clear-search"
            onClick={() => setSearchQuery('')}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {gtFilter && (
        <div className="filter-indicator">
          <span>Filtered by ground truth</span>
          <button 
            className="btn-clear-filter"
            onClick={() => setGtFilter(null)}
            title="Clear ground truth filter"
          >
            ✕ Clear Filter
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-message">Loading evaluation tasks...</div>
      ) : (
        <div className="evaluation-table">
          <table>
            <thead>
              <tr>
                <th style={{ width: '30px' }}>
                  <input
                    type="checkbox"
                    className="eval-select-all"
                    title="Select all evaluations with the same ground truth"
                    aria-label="Select all"
                    checked={selectedEvals.length > 0 && selectableForAll().every(t => selectedEvals.some(e => e.id === t.id))}
                    ref={(el) => { if (el) el.indeterminate = selectedEvals.length > 0 && !selectableForAll().every(t => selectedEvals.some(e => e.id === t.id)) }}
                    disabled={sortedAndFilteredTasks.length === 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
                <th onClick={() => handleSort('taskName')} style={{ cursor: 'pointer' }}>
                  Evaluation Name {getSortIcon('taskName')}
                </th>
                <th onClick={() => handleSort('modelId')} style={{ cursor: 'pointer' }}>
                  Model {getSortIcon('modelId')}
                </th>
                <th onClick={() => handleSort('groundTruthName')} style={{ cursor: 'pointer' }}>
                  Ground Truth {getSortIcon('groundTruthName')}
                </th>
                <th>Metrics</th>
                <th onClick={() => handleSort('createdAt')} style={{ cursor: 'pointer' }}>
                  Created Date {getSortIcon('createdAt')}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedAndFilteredTasks.length === 0 ? (
                <tr>
                  <td colSpan="7" className="no-results-cell">
                    {searchQuery ? `No evaluations found matching "${searchQuery}"` : 'No evaluations created yet'}
                  </td>
                </tr>
              ) : (
                sortedAndFilteredTasks.map(task => {
                  // Get metrics directly from the task (new schema)
                  const metrics = task.EvaluationMetrics || task.analyzeTasks?.[0]?.EvaluationMetrics
                  const isSelected = selectedEvals.some(e => e.id === task.id)
                  const isDisabled = selectedEvals.length > 0 && 
                                    selectedEvals[0].groundTruthId !== task.groundTruthId
                  
                  return (
                    <tr 
                      key={task.id} 
                      className={`evaluation-row ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                      onClick={() => handleTaskClick(task)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={(e) => handleCheckboxChange(task, e.target.checked)}
                          className="eval-checkbox"
                        />
                      </td>
                      <td className="eval-name-cell">
                        {task.taskName || task.Name || 'N/A'}
                        {task.video?.video_url && (
                          <div>
                            <button
                              type="button"
                              className="btn-link-preview"
                              onClick={(e) => { e.stopPropagation(); setPreviewVideo(task.video) }}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#2563eb', textDecoration: 'underline', font: 'inherit', fontSize: 12 }}
                            >
                              Preview video{task.video.Name ? `: ${task.video.Name}` : ''}
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="eval-model-cell" title={task.analyzeTask?.Name || task.modelId}>{task.modelId || 'N/A'}</td>
                      <td className="eval-gt-cell" title={task.groundTruthName}>{task.groundTruthName || 'N/A'}</td>
                      <td className="metrics-combined-cell">
                        {metrics ? (
                          <div className="metrics-grid-compact">
                            <div className="metric-item-compact">
                              <span className="metric-label-compact">P:</span>
                              <span className="metric-value-compact">{(metrics.Precision * 100).toFixed(1)}%</span>
                            </div>
                            <div className="metric-item-compact">
                              <span className="metric-label-compact">R:</span>
                              <span className="metric-value-compact">{(metrics.Recall * 100).toFixed(1)}%</span>
                            </div>
                            <div className="metric-item-compact">
                              <span className="metric-label-compact">F1:</span>
                              <span className="metric-value-compact">{(metrics.F1Score * 100).toFixed(1)}%</span>
                            </div>
                            <div className="metric-item-compact">
                              <span className="metric-label-compact">IoU:</span>
                              <span className="metric-value-compact">{(metrics.MeanIoU * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td>{task.createdDate}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button 
                          className="btn-delete-icon"
                          onClick={(e) => handleDelete(e, task)}
                          title="Delete evaluation"
                        >
                          <img src={trashIcon} alt="Delete" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default EvaluationManagement
