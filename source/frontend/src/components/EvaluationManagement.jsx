import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import './EvaluationManagement.css'
import { evalAPI } from '../utils/api'
import refreshIcon from '../assets/icons/refresh.svg'
import trashIcon from '../assets/icons/trash.svg'
import EvaluationDetail from './EvaluationDetail'
import CreateEvaluationInline from './CreateEvaluationInline'
import { calculateEvaluationMetrics } from './CreateEvaluation/evaluationUtils'
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
        analyzeTask: task.analyzeTask || null
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
    
    return taskName.includes(query) || videoName.includes(query) || gtName.includes(query)
  })

  const sortedAndFilteredTasks = getSortedEvaluationTasks(filteredTasks)

  // If showing comparison view
  if (showComparison) {
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
                bufferTime
              )
              matchingDetails = result.details
            }
            
            return (
              <div key={task.id} className="comparison-card">
                <div className="comparison-card-header">
                  <h3>{task.taskName || task.Name}</h3>
                  {task.video?.thumbnail_url && (
                    <div className="comparison-thumbnail-container">
                      <img 
                        src={task.video.thumbnail_url} 
                        alt={task.video.Name}
                        className="comparison-thumbnail"
                      />
                      {task.analyzeTask?.ModelId && (
                        <div className="comparison-model-id">{task.analyzeTask.ModelId}</div>
                      )}
                    </div>
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
                
                <div className="comparison-labels">
                  <h4>Segment Details ({task.Labels?.length || 0} segments)</h4>
                  <div className="comparison-labels-list">
                    {task.Labels && task.Labels.length > 0 ? (
                      task.Labels.map((label, idx) => {
                        // Get the evaluation status from matching details
                        let status = '—'
                        
                        if (matchingDetails?.predMatches) {
                          const match = matchingDetails.predMatches.find(m => m.predIndex === idx)
                          if (match) {
                            status = match.status
                          }
                        }
                        
                        return (
                          <div key={idx} className={`comparison-label-item ${status.toLowerCase()}`}>
                            <div className="label-time">
                              {label.StartTs?.toFixed(2)}s - {label.EndTs?.toFixed(2)}s
                            </div>
                            <div className="label-info">
                              <span className="label-text">{label.Label}</span>
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
                    task.BufferTime !== undefined ? task.BufferTime : 0
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
                <th></th>
                <th style={{ width: '30px' }}></th>
                <th onClick={() => handleSort('taskName')} style={{ cursor: 'pointer' }}>
                  Evaluation Name {getSortIcon('taskName')}
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
                  <td colSpan="6" className="no-results-cell">
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
                      <td>
                        {task.video?.thumbnail_url ? (
                          <img 
                            src={task.video.thumbnail_url} 
                            alt={task.video.Name}
                            className="evaluation-thumbnail"
                          />
                        ) : (
                          <div className="thumbnail-placeholder">No thumbnail</div>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={(e) => handleCheckboxChange(task, e.target.checked)}
                          className="eval-checkbox"
                        />
                      </td>
                      <td className="eval-name-cell">{task.taskName || task.Name || 'N/A'}</td>
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
