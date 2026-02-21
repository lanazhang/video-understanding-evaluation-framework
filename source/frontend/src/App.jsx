import { useState, useEffect } from 'react'
import './App.css'
import '@aws-amplify/ui-react/styles.css'
import { Authenticator } from '@aws-amplify/ui-react'
import { signOut } from 'aws-amplify/auth'
import CreateGroundTruthTask from './components/CreateGroundTruthTask'
import CreateEvaluationTask from './components/CreateEvaluationTask'
import VideoManagement from './components/VideoManagement'
import GroundTruthTaskDetail from './components/GroundTruthTaskDetail'
import EvaluationTaskDetail from './components/EvaluationTaskDetail'
import groundTruthTasksData from './static/groundTruthTasks.json'
import evaluationTasksData from './static/evaluationTasks.json'

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

  useEffect(() => {
    fetchTasks(activeMenu)
  }, [activeMenu])

  const fetchTasks = async (menuType) => {
    setLoading(true)
    try {
      // TODO: Replace with actual API endpoints
      // const endpoint = menuType === 'ground-truth' 
      //   ? '/api/ground-truth/tasks'
      //   : '/api/evaluation/tasks'
      // const response = await fetch(endpoint)
      // const data = await response.json()
      // setTasks(data)
      
      // Load from JSON files
      const data = menuType === 'ground-truth' ? groundTruthTasksData : evaluationTasksData
      setTasks(data)
    } catch (error) {
      console.error('Error fetching tasks:', error)
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
    }
  }

  const handleCreateTask = (formData) => {
    // TODO: Implement API call to create task
    console.log('Task created:', formData)
    setShowCreateTask(false)
    fetchTasks(activeMenu)
  }

  const handleCreateEvaluationTask = async (formData) => {
    // TODO: Implement API call to create evaluation task and start processing
    console.log('Evaluation task created:', formData)
    
    // Simulate API call to process video
    // In real implementation, this would call the backend API
    // which would invoke the model and compare against ground truth
    
    setShowCreateTask(false)
    fetchTasks(activeMenu)
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
      {({ signOut, user }) => (
        <div className="App">
          <header className="top-bar">
            <h1 className="app-title">Video Understanding Evaluation Framework</h1>
            <div className="user-profile">
              <button 
                className="profile-button"
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <span className="user-avatar">{user?.username?.charAt(0).toUpperCase() || 'U'}</span>
                <span className="user-name">{user?.username || 'User'}</span>
              </button>
              {showUserMenu && (
                <div className="user-menu">
                  <div className="user-info">
                    <p className="user-email">{user?.signInDetails?.loginId || user?.username}</p>
                  </div>
                  <button onClick={handleLogout}>Logout</button>
                </div>
              )}
            </div>
          </header>
      <div className="main-content">
        <div className={`sidebar ${sidebarExpanded ? 'expanded' : ''}`}>
          <div className="sidebar-header">
            <h2>Menu</h2>
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
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                </svg>
              </span>
              <span className="menu-text">Videos</span>
            </button>
            <button 
              className={activeMenu === 'ground-truth' ? 'active' : ''}
              onClick={() => handleMenuClick('ground-truth')}
              title="Ground Truth"
            >
              <span className="menu-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </span>
              <span className="menu-text">Ground Truth</span>
            </button>
            <button 
              className={activeMenu === 'evaluation' ? 'active' : ''}
              onClick={() => handleMenuClick('evaluation')}
              title="Evaluation"
            >
              <span className="menu-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4"></path>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
              </span>
              <span className="menu-text">Evaluation</span>
            </button>
          </nav>
        </div>
        <div className="content">
          {activeMenu === 'videos' ? (
            <VideoManagement key={videoKey} />
          ) : selectedTask ? (
            activeMenu === 'ground-truth' ? (
              <GroundTruthTaskDetail task={selectedTask} onBack={handleBackToList} />
            ) : (
              <EvaluationTaskDetail task={selectedTask} onBack={handleBackToList} />
            )
          ) : (
            <>
              <div className="content-header">
                <h1>{activeMenu === 'ground-truth' ? 'Ground Truth' : 'Evaluation'}</h1>
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
                      <div className="task-item-header">
                        <h3>{task.taskName}</h3>
                        <span className={`status ${task.status}`}>{task.status}</span>
                      </div>
                      {activeMenu === 'evaluation' && (
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
                      )}
                      {activeMenu === 'ground-truth' && (
                        <div className="task-item-details">
                          <div className="task-detail-row">
                            <span className="detail-label">Base Model:</span>
                            <span className="detail-value">{task.baseModel}</span>
                          </div>
                          <div className="task-detail-row">
                            <span className="detail-label">Videos:</span>
                            <span className="detail-value">{task.selectedVideos?.length || 0}</span>
                          </div>
                          <div className="task-detail-row">
                            <span className="detail-label">Created:</span>
                            <span className="detail-value">{task.createdDate}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {showCreateTask && activeMenu === 'ground-truth' && (
        <CreateGroundTruthTask 
          onClose={() => setShowCreateTask(false)}
          onSubmit={handleCreateTask}
        />
      )}
      {showCreateTask && activeMenu === 'evaluation' && (
        <CreateEvaluationTask 
          onClose={() => setShowCreateTask(false)}
          onSubmit={handleCreateEvaluationTask}
        />
      )}
        </div>
      )}
    </Authenticator>
  )
}

export default App
