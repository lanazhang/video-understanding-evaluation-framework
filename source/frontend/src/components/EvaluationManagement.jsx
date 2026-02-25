import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import './EvaluationManagement.css'
import { evalAPI } from '../utils/api'
import refreshIcon from '../assets/icons/refresh.svg'
import trashIcon from '../assets/icons/trash.svg'
import EvaluationDetail from './EvaluationDetail'
import CreateEvaluationInline from './CreateEvaluationInline'

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
    navigate(`/evaluation/${task.id}`)
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
                <th>Ground Truth</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>F1 Score</th>
                <th>Mean IoU</th>
                <th onClick={() => handleSort('createdAt')} style={{ cursor: 'pointer' }}>
                  Created Date {getSortIcon('createdAt')}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedAndFilteredTasks.length === 0 ? (
                <tr>
                  <td colSpan="9" className="no-results-cell">
                    {searchQuery ? `No evaluations found matching "${searchQuery}"` : 'No evaluations created yet'}
                  </td>
                </tr>
              ) : (
                sortedAndFilteredTasks.map(task => {
                  // Get metrics directly from the task (new schema)
                  const metrics = task.EvaluationMetrics || task.analyzeTasks?.[0]?.EvaluationMetrics
                  
                  return (
                    <tr 
                      key={task.id} 
                      className="evaluation-row"
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
                      <td>{task.groundTruth?.Name || 'N/A'}</td>
                      <td className="metric-cell">
                        {metrics?.Precision !== undefined ? `${(metrics.Precision * 100).toFixed(1)}%` : 'N/A'}
                      </td>
                      <td className="metric-cell">
                        {metrics?.Recall !== undefined ? `${(metrics.Recall * 100).toFixed(1)}%` : 'N/A'}
                      </td>
                      <td className="metric-cell">
                        {metrics?.F1Score !== undefined ? `${(metrics.F1Score * 100).toFixed(1)}%` : 'N/A'}
                      </td>
                      <td className="metric-cell">
                        {metrics?.MeanIoU !== undefined ? `${(metrics.MeanIoU * 100).toFixed(1)}%` : 'N/A'}
                      </td>
                      <td>{task.createdDate}</td>
                      <td>
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
