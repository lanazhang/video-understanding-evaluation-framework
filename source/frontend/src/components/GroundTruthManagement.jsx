import { useState, useEffect, useRef } from 'react'
import './GroundTruthManagement.css'
import { FetchPost } from '../utils/apiHelper'
import refreshIcon from '../assets/icons/refresh.svg'
import trashIcon from '../assets/icons/trash.svg'
import arrowLeftIcon from '../assets/icons/arrow-left.svg'
import GroundTruthTaskDetail from './GroundTruthTaskDetail'
import CreateGroundTruthInline from './CreateGroundTruthInline'

function GroundTruthManagement({ currentUser }) {
  const [groundTruths, setGroundTruths] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTask, setSelectedTask] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDirection, setSortDirection] = useState('desc')
  
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (!hasFetchedRef.current && currentUser) {
      hasFetchedRef.current = true
      fetchGroundTruths()
    }
  }, [currentUser])

  const fetchGroundTruths = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const username = currentUser?.username || currentUser?.signInDetails?.loginId || ''
      console.log('Fetching ground truths for user:', username)
      
      const payload = username ? { createdBy: username } : {}
      console.log('Request payload:', payload)
      
      const data = await FetchPost('/video/get-ground-truths', payload, 'EvalService')
      console.log('API response:', data)
      console.log('Response statusCode:', data?.statusCode)
      console.log('Response body type:', typeof data?.body)
      
      // Handle different response formats
      let responseBody
      let statusCode = data?.statusCode
      
      // Check if response has statusCode wrapper
      if (statusCode === 200) {
        responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
      } else if (data?.groundTruths) {
        // Direct response without statusCode wrapper
        responseBody = data
        statusCode = 200
      } else {
        // Unknown format
        console.error('Unexpected response format:', data)
        setError('Unexpected response format from server')
        return
      }
      
      const groundTruths = responseBody.groundTruths || []
      console.log('Ground truths received:', groundTruths.length)
      console.log('First ground truth:', groundTruths[0])
        
      const transformedTasks = groundTruths.map(gt => {
        try {
          return {
            id: gt.Id,
            Id: gt.Id,
            taskName: gt.Name,
            Name: gt.Name,
            description: gt.Description || '',
            Description: gt.Description || '',
            createdBy: gt.CreatedBy,
            CreatedBy: gt.CreatedBy,
            createdDate: gt.CreatedAt ? new Date(gt.CreatedAt).toLocaleDateString() : 'N/A',
            createdAt: gt.CreatedAt,
            CreatedAt: gt.CreatedAt,
            videoId: gt.VideoId,
            VideoId: gt.VideoId,
            videoAnalyzeTaskIds: gt.VideoAnalyzeTaskIds || [],
            VideoAnalyzeTaskIds: gt.VideoAnalyzeTaskIds || [],
            labels: gt.Labels || [],
            Labels: gt.Labels || [],
            video: gt.video || null,
            analyzeTasks: gt.analyzeTasks || []
          }
        } catch (err) {
          console.error('Error transforming ground truth:', gt, err)
          throw err
        }
      })
        
      setGroundTruths(transformedTasks)
      console.log('Successfully loaded', transformedTasks.length, 'ground truths')
    } catch (err) {
      console.error('Error in fetchGroundTruths:', err)
      console.error('Error stack:', err.stack)
      setError(err.message || 'Failed to fetch ground truths')
    } finally {
      setLoading(false)
    }
  }

  const handleTaskClick = (task) => {
    setSelectedTask(task)
    setShowCreateForm(false)
  }

  const handleBackToList = () => {
    setSelectedTask(null)
    fetchGroundTruths()
  }

  const handleCreateNew = () => {
    setShowCreateForm(true)
    setSelectedTask(null)
  }

  const handleCancelCreate = () => {
    setShowCreateForm(false)
  }

  const handleCreateSuccess = () => {
    setShowCreateForm(false)
    fetchGroundTruths()
  }

  const handleDelete = async (e, task) => {
    e.stopPropagation() // Prevent task click when clicking delete
    
    if (!window.confirm(`Are you sure you want to delete "${task.taskName}"? This action cannot be undone.`)) {
      return
    }

    try {
      const data = await FetchPost('/video/delete-ground-truth', { Id: task.id }, 'EvalService')
      
      if (data.statusCode === 200) {
        console.log('Ground truth deleted successfully:', task.id)
      } else {
        const errorMessage = typeof data.body === 'object' && data.body.error 
          ? data.body.error 
          : data.body
        console.error('Failed to delete ground truth:', errorMessage)
      }
    } catch (err) {
      console.error('Error deleting ground truth:', err)
    } finally {
      // Always refresh the list regardless of success or failure
      fetchGroundTruths()
    }
  }

  const handleSort = (field) => {
    if (sortField === field) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // Set new field with default descending order
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const getSortedGroundTruths = (groundTruthsToSort) => {
    const sorted = [...groundTruthsToSort].sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      // Special handling for labels count
      if (sortField === 'labels') {
        aVal = a.labels?.length || 0
        bVal = b.labels?.length || 0
      }

      // Handle null/undefined values
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      // Convert to lowercase for string comparison
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

  const filteredTasks = groundTruths.filter(task => {
    const query = searchQuery.toLowerCase()
    const taskName = task.taskName?.toLowerCase() || ''
    const videoName = task.video?.Name?.toLowerCase() || ''
    
    return taskName.includes(query) || videoName.includes(query)
  })

  // Apply sorting to filtered tasks
  const sortedAndFilteredTasks = getSortedGroundTruths(filteredTasks)

  // If viewing a specific task
  if (selectedTask) {
    return <GroundTruthTaskDetail task={selectedTask} onBack={handleBackToList} currentUser={currentUser} />
  }

  // If creating new task
  if (showCreateForm) {
    return (
      <CreateGroundTruthInline 
        currentUser={currentUser}
        onCancel={handleCancelCreate}
        onSuccess={handleCreateSuccess}
      />
    )
  }

  // List view
  return (
    <div className="ground-truth-management">
      <div className="content-header">
        <h1>Ground Truth</h1>
        <div className="header-actions">
          <button 
            className="btn-refresh" 
            onClick={fetchGroundTruths}
            disabled={loading}
            title="Refresh list"
          >
            <img src={refreshIcon} alt="Refresh" />
          </button>
          <button className="btn-create" onClick={handleCreateNew}>
            + Create Ground Truth
          </button>
        </div>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search ground truths..."
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

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-message">Loading ground truths...</div>
      ) : (
        <div className="ground-truth-table">
          <table>
            <thead>
              <tr>
                <th></th>
                <th onClick={() => handleSort('taskName')} style={{ cursor: 'pointer' }}>
                  Name {getSortIcon('taskName')}
                </th>
                <th onClick={() => handleSort('createdAt')} style={{ cursor: 'pointer' }}>
                  Created Date {getSortIcon('createdAt')}
                </th>
                <th onClick={() => handleSort('labels')} style={{ cursor: 'pointer' }}>
                  Labels {getSortIcon('labels')}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedAndFilteredTasks.length === 0 ? (
                <tr>
                  <td colSpan="5" className="no-results-cell">
                    {searchQuery ? `No ground truths found matching "${searchQuery}"` : 'No ground truths created yet'}
                  </td>
                </tr>
              ) : (
                sortedAndFilteredTasks.map(task => (
                  <tr 
                    key={task.id} 
                    className="ground-truth-row"
                    onClick={() => handleTaskClick(task)}
                  >
                    <td>
                      {task.video?.thumbnail_url ? (
                        <img 
                          src={task.video.thumbnail_url} 
                          alt={task.video.Name}
                          className="ground-truth-thumbnail"
                        />
                      ) : (
                        <div className="thumbnail-placeholder">No thumbnail</div>
                      )}
                    </td>
                    <td className="ground-truth-name">{task.taskName}</td>
                    <td>{task.createdDate}</td>
                    <td>{task.labels?.length || 0}</td>
                    <td>
                      <button 
                        className="btn-delete-icon"
                        onClick={(e) => handleDelete(e, task)}
                        title="Delete ground truth"
                      >
                        <img src={trashIcon} alt="Delete" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default GroundTruthManagement
