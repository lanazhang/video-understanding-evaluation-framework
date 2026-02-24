import { useState, useEffect } from 'react'
import './App.css'
import '@aws-amplify/ui-react/styles.css'
import { Authenticator } from '@aws-amplify/ui-react'
import { signOut } from 'aws-amplify/auth'
import CreateGroundTruthTask from './components/CreateGroundTruthTask'
import CreateEvaluationTask from './components/CreateEvaluationTask'
import VideoManagement from './components/VideoManagement'
import GroundTruthManagement from './components/GroundTruthManagement'
import GroundTruthTaskDetail from './components/GroundTruthTaskDetail'
import EvaluationTaskDetail from './components/EvaluationTaskDetail'
import { FetchPost } from './utils/apiHelper'
import logoIcon from './assets/icons/logo.svg'
import videoIcon from './assets/icons/video.svg'
import documentIcon from './assets/icons/document.svg'
import checkIcon from './assets/icons/check.svg'

function App() {
  const [activeMenu, setActiveMenu] = useState('videos')
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [videoKey, setVideoKey] = useState(0) // Key to force VideoManagement remount
  const [groundTruthKey, setGroundTruthKey] = useState(0) // Key to force GroundTruthManagement remount
  const [currentUser, setCurrentUser] = useState(null)

  useEffect(() => {
    if (currentUser) {
      fetchTasks(activeMenu, currentUser)
    }
  }, [activeMenu, currentUser])

  const fetchTasks = async (menuType, user) => {
    setLoading(true)
    try {
      if (menuType === 'ground-truth') {
        // Call the API to get ground truths filtered by current user
        const username = user?.username || user?.signInDetails?.loginId || ''
        const data = await FetchPost('/video/get-ground-truths', {
          createdBy: username
        }, 'EvalService')
        
        console.log('Ground truth API response:', data)
        
        // Handle both direct response and wrapped response
        let groundTruths = []
        
        if (data.statusCode === 200) {
          // Response has statusCode wrapper
          const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
          groundTruths = responseBody.groundTruths || []
        } else if (data.groundTruths) {
          // Direct response without statusCode wrapper
          groundTruths = data.groundTruths || []
        } else {
          console.error('Unexpected response format:', data)
          setTasks([])
          return
        }
        
        // Transform API response to match the expected format
        const transformedTasks = groundTruths.map(gt => {
          // Extract model info from Description field as fallback
          let modelId = null
          let taskType = null
          
          if (gt.Description) {
            // Try to extract model and type from description
            // Example: "Generated from tlabs-mme task with model twelvelabs.marengo-embed-3-0-v1:0"
            const modelMatch = gt.Description.match(/from\s+(\S+)\s+task\s+with\s+model\s+(\S+)/i)
            if (modelMatch) {
              taskType = modelMatch[1] // e.g., "tlabs-mme" or "nova-mme"
              modelId = modelMatch[2] // e.g., "twelvelabs.marengo-embed-3-0-v1:0"
            }
          }
          
          // If analyzeTasks are available, use them instead
          if (gt.analyzeTasks && gt.analyzeTasks.length > 0) {
            const task = gt.analyzeTasks[0]
            modelId = task.ModelId
            taskType = task.Type
          }
          
          return {
            id: gt.Id,
            taskName: gt.Name,
            description: gt.Description || '',
            createdBy: gt.CreatedBy,
            createdDate: gt.CreatedAt ? new Date(gt.CreatedAt).toLocaleDateString() : 'N/A',
            createdAt: gt.CreatedAt,
            videoId: gt.VideoId,
            videoAnalyzeTaskIds: gt.VideoAnalyzeTaskIds || [],
            labels: gt.Labels || [],
            status: gt.Status || 'created',
            // Enriched data from API
            video: gt.video || null,
            analyzeTasks: gt.analyzeTasks || [],
            // UI-specific fields
            modelId: modelId || 'Manual',
            taskType: taskType,
            videoName: gt.video?.Name || 'N/A',
            baseModel: gt.VideoAnalyzeTaskIds && gt.VideoAnalyzeTaskIds.length > 0 
              ? `${gt.VideoAnalyzeTaskIds.length} task(s)` 
              : 'Manual',
            selectedVideos: [gt.VideoId],
            eventTypes: gt.Labels && gt.Labels.length > 0
              ? [...new Set(gt.Labels.map(l => l.Label).filter(Boolean))].join(', ')
              : 'N/A'
          }
        })
        
        console.log('Transformed tasks:', transformedTasks)
        setTasks(transformedTasks)
      } else {
        // Evaluation tasks not yet implemented - show empty list
        setTasks([])
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await signOut()
      setShowUserMenu(false)
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const handleMenuClick = (menu) => {
    setActiveMenu(menu)
    setSelectedTask(null) // Reset selected task when changing menu
    setSearchQuery('') // Reset search when changing menu
    if (menu === 'videos') {
      setVideoKey(prev => prev + 1) // Force VideoManagement to remount
    } else if (menu === 'ground-truth') {
      setGroundTruthKey(prev => prev + 1) // Force GroundTruthManagement to remount
    }
  }

  const handleCreateTask = (formData) => {
    // TODO: Implement API call to create task
    console.log('Task created:', formData)
    setShowCreateTask(false)
    fetchTasks(activeMenu, currentUser)
  }

  const handleCreateEvaluationTask = async (formData) => {
    // TODO: Implement API call to create evaluation task and start processing
    console.log('Evaluation task created:', formData)
    
    // Simulate API call to process video
    // In real implementation, this would call the backend API
    // which would invoke the model and compare against ground truth
    
    setShowCreateTask(false)
    fetchTasks(activeMenu, currentUser)
  }

  const handleTaskClick = (task) => {
    setSelectedTask(task)
  }

  const handleBackToList = () => {
    setSelectedTask(null)
  }

  // Filter tasks based on search query
  const filteredTasks = tasks.filter(task => {
    const query = searchQuery.toLowerCase()
    const taskName = task.taskName?.toLowerCase() || ''
    const status = task.status?.toLowerCase() || ''
    const model = task.model?.toLowerCase() || ''
    const baseModel = task.baseModel?.toLowerCase() || ''
    
    return taskName.includes(query) || 
           status.includes(query) || 
           model.includes(query) || 
           baseModel.includes(query)
  })

  return (
    <Authenticator>
      {({ signOut, user }) => {
        // Set current user when authenticated
        if (user && !currentUser) {
          setCurrentUser(user)
        }
        
        return (
        <div className="App">
      <div className="main-content">
        <div className={`sidebar ${sidebarExpanded ? 'expanded' : ''}`}>
          <div className="sidebar-logo">
            <img src={logoIcon} alt="VUEF Logo" className="app-logo" />
            <span className="app-logo-text">Video Understanding Evaluation Framework</span>
          </div>
          <div className="sidebar-header">
            <button 
              className="btn-toggle"
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
              title={sidebarExpanded ? 'Collapse menu' : 'Expand menu'}
            >
              {sidebarExpanded ? '«' : '»'}
            </button>
          </div>
          <nav>
            <button 
              className={activeMenu === 'videos' ? 'active' : ''}
              onClick={() => handleMenuClick('videos')}
              title="Videos"
            >
              <span className="menu-icon">
                <img src={videoIcon} alt="Videos" />
              </span>
              <span className="menu-text">Videos</span>
            </button>
            <button 
              className={activeMenu === 'ground-truth' ? 'active' : ''}
              onClick={() => handleMenuClick('ground-truth')}
              title="Ground Truth"
            >
              <span className="menu-icon">
                <img src={documentIcon} alt="Ground Truth" />
              </span>
              <span className="menu-text">Ground Truth</span>
            </button>
            <button 
              className={activeMenu === 'evaluation' ? 'active' : ''}
              onClick={() => handleMenuClick('evaluation')}
              title="Evaluation"
            >
              <span className="menu-icon">
                <img src={checkIcon} alt="Evaluation" />
              </span>
              <span className="menu-text">Evaluation</span>
            </button>
          </nav>
          
          <div className="sidebar-footer">
            <div className="user-profile">
              <button 
                className="profile-button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                title={user?.username || 'User'}
              >
                <span className="user-avatar">{user?.username?.charAt(0).toUpperCase() || 'U'}</span>
                <span className="menu-text user-name-sidebar">{user?.username || 'User'}</span>
              </button>
              {showUserMenu && (
                <div className="user-menu">
                  <div className="username">{user?.username || 'User'}</div>
                  <button onClick={handleLogout}>Logout</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="content">
          {activeMenu === 'videos' ? (
            <VideoManagement key={videoKey} currentUser={currentUser} />
          ) : activeMenu === 'ground-truth' ? (
            <GroundTruthManagement key={groundTruthKey} currentUser={currentUser} />
          ) : selectedTask ? (
            <EvaluationTaskDetail task={selectedTask} onBack={handleBackToList} />
          ) : (
            <>
              <div className="content-header">
                <h1>Evaluation</h1>
                <button className="btn-create" onClick={() => setShowCreateTask(true)}>
                  + Create Task
                </button>
              </div>
              <div className="search-bar">
                <input
                  type="text"
                  placeholder="Search tasks..."
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
              {loading ? (
                <p>Loading tasks...</p>
              ) : (
                <div className="task-list">
                  {filteredTasks.length === 0 ? (
                    <p className="no-results">No tasks found matching "{searchQuery}"</p>
                  ) : (
                    filteredTasks.map(task => (
                    <div 
                      key={task.id} 
                      className="task-item"
                      onClick={() => handleTaskClick(task)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="task-item-content">
                        <div className="task-item-header">
                          <h3>{task.taskName}</h3>
                          <span className={`status ${task.status}`}>{task.status}</span>
                        </div>
                        <div className="task-item-details">
                          <div className="task-detail-row">
                            <span className="detail-label">Model:</span>
                            <span className="detail-value">{task.model}</span>
                          </div>
                          <div className="task-detail-row">
                            <span className="detail-label">Created:</span>
                            <span className="detail-value">{task.createdDate}</span>
                          </div>
                          {task.results && (
                            <div className="task-metrics-preview">
                              <span className="metric-preview">
                                <strong>Precision:</strong> {(task.results.precision * 100).toFixed(1)}%
                              </span>
                              <span className="metric-preview">
                                <strong>Recall:</strong> {(task.results.recall * 100).toFixed(1)}%
                              </span>
                              <span className="metric-preview">
                                <strong>F1:</strong> {(task.results.f1Score * 100).toFixed(1)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {showCreateTask && activeMenu === 'evaluation' && (
        <CreateEvaluationTask 
          onClose={() => setShowCreateTask(false)}
          onSubmit={handleCreateEvaluationTask}
        />
      )}
        </div>
        )
      }}
    </Authenticator>
  )
}

export default App
