import { useState, useEffect } from 'react'
import './App.css'
import CreateGroundTruthTask from './components/CreateGroundTruthTask'
import CreateEvaluationTask from './components/CreateEvaluationTask'
import VideoManagement from './components/VideoManagement'
import GroundTruthTaskDetail from './components/GroundTruthTaskDetail'
import EvaluationTaskDetail from './components/EvaluationTaskDetail'
import groundTruthTasksData from './static/groundTruthTasks.json'
import evaluationTasksData from './static/evaluationTasks.json'

function App() {
  const [activeMenu, setActiveMenu] = useState('ground-truth')
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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

  const handleLogout = () => {
    // TODO: Implement logout logic
    console.log('Logging out...')
  }

  const handleMenuClick = (menu) => {
    setActiveMenu(menu)
    setSelectedTask(null) // Reset selected task when changing menu
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
    setSidebarCollapsed(true) // Auto-collapse sidebar when viewing task detail
  }

  const handleBackToList = () => {
    setSelectedTask(null)
    setSidebarCollapsed(false) // Expand sidebar when returning to list
  }

  return (
    <div className="App">
      <header className="top-bar">
        <h1 className="app-title">Video Understanding Evaluation Framework</h1>
        <div className="user-profile">
          <button 
            className="profile-button"
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            <span className="user-avatar">U</span>
            <span className="user-name">User</span>
          </button>
          {showUserMenu && (
            <div className="user-menu">
              <button onClick={handleLogout}>Logout</button>
            </div>
          )}
        </div>
      </header>
      <div className="main-content">
        <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-header">
            <h2>Menu</h2>
            <button 
              className="btn-collapse"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? '»' : '«'}
            </button>
          </div>
          <nav>
            <button 
              className={activeMenu === 'ground-truth' ? 'active' : ''}
              onClick={() => handleMenuClick('ground-truth')}
              title="Ground Truth"
            >
              <span className="menu-icon">📋</span>
              <span className="menu-text">Ground Truth</span>
            </button>
            <button 
              className={activeMenu === 'evaluation' ? 'active' : ''}
              onClick={() => handleMenuClick('evaluation')}
              title="Evaluation"
            >
              <span className="menu-icon">📊</span>
              <span className="menu-text">Evaluation</span>
            </button>
            <button 
              className={activeMenu === 'videos' ? 'active' : ''}
              onClick={() => handleMenuClick('videos')}
              title="Video Management"
            >
              <span className="menu-icon">🎥</span>
              <span className="menu-text">Video Management</span>
            </button>
          </nav>
        </div>
        <div className="content">
          {activeMenu === 'videos' ? (
            <VideoManagement />
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
              {loading ? (
                <p>Loading tasks...</p>
              ) : (
                <div className="task-list">
                  {tasks.map(task => (
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
                  ))}
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
  )
}

export default App
