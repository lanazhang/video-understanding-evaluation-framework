import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom'
import './App.css'
import { LOCAL_USER } from './utils/auth'
import VideoManagement from './components/VideoManagement'
import GroundTruthManagement from './components/GroundTruthManagement'
import EvaluationManagement from './components/EvaluationManagement'
import EvaluationDetail from './components/EvaluationDetail'
import AnalyzeView from './components/AnalyzeView/AnalyzeView'
import Introduction from './components/Introduction/Introduction'
import Settings from './components/Settings/Settings'
import ChatBot from './components/ChatBot/ChatBot'
import { evalAPI } from './utils/api'
import { FetchPost } from './utils/apiHelper'
import logoIcon from './assets/icons/logo.svg'
import videoIcon from './assets/icons/video.svg'
import documentIcon from './assets/icons/document.svg'
import checkIcon from './assets/icons/check.svg'
import infoIcon from './assets/icons/info.svg'
import settingsIcon from './assets/icons/settings.svg'
import chatIcon from './assets/icons/chat.svg'

// The AI Assistant needs the optional Strands package and AWS Bedrock access (see backend/requirements.txt), which the
// default local setup does not have, so it is hidden. Set VITE_ENABLE_CHATBOT=true in frontend/.env to show it.
const SHOW_CHATBOT = import.meta.env.VITE_ENABLE_CHATBOT === 'true'

// Wrapper component for video analyze route
function VideoAnalyzeRoute({ currentUser }) {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const [video, setVideo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchVideo = async () => {
      try {
        const data = await FetchPost('/video/get-videos', {}, 'EvalService')
        
        // Handle Lambda proxy response format
        if (data.videos !== undefined) {
          const videos = data.videos || []
          const foundVideo = videos.find(v => v.Id === videoId)
          
          if (foundVideo) {
            setVideo(foundVideo)
          } else {
            setError('Video not found')
          }
        } else if (data.statusCode !== undefined) {
          if (data.statusCode === 200) {
            const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
            const videos = responseBody.videos || []
            const foundVideo = videos.find(v => v.Id === videoId)
            
            if (foundVideo) {
              setVideo(foundVideo)
            } else {
              setError('Video not found')
            }
          } else {
            setError('Failed to fetch video')
          }
        } else {
          setError('Unexpected response format')
        }
      } catch (err) {
        console.error('Error fetching video:', err)
        setError(err.message || 'Failed to load video')
      } finally {
        setLoading(false)
      }
    }

    if (videoId && currentUser) {
      fetchVideo()
    }
  }, [videoId, currentUser])

  const handleBack = () => {
    navigate('/')
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        Loading video...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: '#c33' }}>{error}</p>
        <button onClick={handleBack} style={{ marginTop: '20px', padding: '10px 20px' }}>
          Back to Videos
        </button>
      </div>
    )
  }

  if (!video) {
    return null
  }

  return <AnalyzeView video={video} onBack={handleBack} />
}

// Wrapper component for evaluation detail route
function EvaluationDetailRoute({ currentUser }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchTask = async () => {
      try {
        const username = currentUser?.username || currentUser?.signInDetails?.loginId || ''
        const response = await evalAPI.getEvaluationTasks(null, null, username)
        
        let responseBody
        if (response?.statusCode === 200) {
          responseBody = typeof response.body === 'string' ? JSON.parse(response.body) : response.body
        } else if (response?.evaluationTasks) {
          responseBody = response
        } else {
          throw new Error('Failed to fetch evaluation task')
        }
        
        const evaluationTasks = responseBody.evaluationTasks || []
        const foundTask = evaluationTasks.find(t => t.Id === id)
        
        if (foundTask) {
          setTask({
            ...foundTask,
            id: foundTask.Id,
            taskName: foundTask.Name,
            Name: foundTask.Name
          })
        } else {
          setError('Evaluation task not found')
        }
      } catch (err) {
        console.error('Error fetching task:', err)
        setError(err.message || 'Failed to load evaluation task')
      } finally {
        setLoading(false)
      }
    }

    if (id && currentUser) {
      fetchTask()
    }
  }, [id, currentUser])

  const handleBack = () => {
    navigate('/evaluation')
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        Loading evaluation task...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: '#c33' }}>{error}</p>
        <button onClick={handleBack} style={{ marginTop: '20px', padding: '10px 20px' }}>
          Back to Evaluations
        </button>
      </div>
    )
  }

  if (!task) {
    return null
  }

  return <EvaluationDetail task={task} onBack={handleBack} />
}

// Main app content component
function AppContent({ currentUser, setCurrentUser }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [gtVideoFilter, setGtVideoFilter] = useState(null)
  const [evalGTFilter, setEvalGTFilter] = useState(null)
  const [gtResetKey, setGtResetKey] = useState(0)
  const [videoResetKey, setVideoResetKey] = useState(0)
  const [evalResetKey, setEvalResetKey] = useState(0)

  // Determine active menu from URL
  const getActiveMenu = () => {
    const path = location.pathname
    
    // Handle paths with or without basename
    if (path.includes('/videos') || path.includes('/video/')) return 'videos'
    if (path.includes('/ground-truth')) return 'ground-truth'
    if (path.includes('/evaluation') && !path.includes('/evaluation/')) return 'evaluation'
    if (path.includes('/evaluation/')) return 'evaluation'
    if (path.includes('/chatbot')) return 'chatbot'
    if (path.includes('/settings')) return 'settings'
    if (path.includes('/introduction')) return 'introduction'
    if (path === '/' || path === '/video-eval-mock' || path === '/video-eval-mock/') return 'introduction'
    
    return 'introduction'
  }

  const activeMenu = getActiveMenu()

  useEffect(() => {
    // Listen for navigation events
    const handleNavigateToGT = (event) => {
      const { videoId } = event.detail
      setGtVideoFilter(videoId)
      navigate('/ground-truth')
    }

    const handleNavigateToEval = (event) => {
      const { gtId } = event.detail
      setEvalGTFilter(gtId)
      navigate('/evaluation')
    }

    window.addEventListener('navigateToGT', handleNavigateToGT)
    window.addEventListener('navigateToEval', handleNavigateToEval)
    return () => {
      window.removeEventListener('navigateToGT', handleNavigateToGT)
      window.removeEventListener('navigateToEval', handleNavigateToEval)
    }
  }, [navigate])

  const handleMenuClick = (menu) => {
    setGtVideoFilter(null)
    setEvalGTFilter(null)
    
    if (menu === 'introduction') {
      navigate('/')
    } else if (menu === 'videos') {
      // Increment reset key to force remount of VideoManagement
      setVideoResetKey(prev => prev + 1)
      navigate('/videos')
    } else if (menu === 'ground-truth') {
      // Increment reset key to force remount of GroundTruthManagement
      setGtResetKey(prev => prev + 1)
      navigate('/ground-truth')
    } else if (menu === 'evaluation') {
      // Increment reset key to force remount of EvaluationManagement
      setEvalResetKey(prev => prev + 1)
      navigate('/evaluation')
    } else if (menu === 'chatbot') {
      navigate('/chatbot')
    } else if (menu === 'settings') {
      navigate('/settings')
    }
  }

  return (
    <div className="main-content">
      <div className={`sidebar ${sidebarExpanded ? 'expanded' : ''}`}>
        <div className="sidebar-logo">
          <img src={logoIcon} alt="VUE Logo" className="app-logo" />
          <span className="app-logo-text">Video Understanding Evaluation</span>
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
          {SHOW_CHATBOT && (
            <>
              <button 
                className={activeMenu === 'chatbot' ? 'active' : ''}
                onClick={() => handleMenuClick('chatbot')}
                title="AI Assistant"
              >
                <span className="menu-icon">
                  <img src={chatIcon} alt="AI Assistant" />
                </span>
                <span className="menu-text">AI Assistant</span>
              </button>
              <div className="menu-separator"></div>
            </>
          )}
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
          <button 
            className={activeMenu === 'settings' ? 'active' : ''}
            onClick={() => handleMenuClick('settings')}
            title="Settings"
          >
            <span className="menu-icon">
              <img src={settingsIcon} alt="Settings" />
            </span>
            <span className="menu-text">Settings</span>
          </button>
          <button 
            className={activeMenu === 'introduction' ? 'active' : ''}
            onClick={() => handleMenuClick('introduction')}
            title="Introduction"
          >
            <span className="menu-icon">
              <img src={infoIcon} alt="Introduction" />
            </span>
            <span className="menu-text">Introduction</span>
          </button>
          <div className="user-profile">
            <button 
              className="profile-button"
              onClick={() => setShowUserMenu(!showUserMenu)}
              title={currentUser?.username || 'User'}
            >
              <span className="user-avatar">{currentUser?.username?.charAt(0).toUpperCase() || 'U'}</span>
              <span className="menu-text user-name-sidebar">{currentUser?.username || 'User'}</span>
            </button>
            {showUserMenu && (
              <div className="user-menu">
                <div className="username">{currentUser?.username || 'User'}</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="content">
        <Routes>
          <Route path="/" element={<Introduction />} />
          <Route path="/videos" element={<VideoManagement key={videoResetKey} currentUser={currentUser} />} />
          <Route path="/introduction" element={<Introduction />} />
          <Route path="/video/:videoId/analyze" element={<VideoAnalyzeRoute currentUser={currentUser} />} />
          <Route path="/ground-truth" element={<GroundTruthManagement key={gtResetKey} currentUser={currentUser} initialVideoFilter={gtVideoFilter} />} />
          <Route path="/evaluation" element={<EvaluationManagement key={evalResetKey} currentUser={currentUser} initialGTFilter={evalGTFilter} />} />
          <Route path="/evaluation/:id" element={<EvaluationDetailRoute currentUser={currentUser} />} />
          {SHOW_CHATBOT && <Route path="/chatbot" element={<ChatBot currentUser={currentUser} />} />}
          <Route path="/settings" element={<Settings currentUser={currentUser} />} />
        </Routes>
      </div>
    </div>
  )
}

function App() {
  // Single-user local mode: no sign-in
  const [currentUser, setCurrentUser] = useState(LOCAL_USER)
  // '/' by default; follows vite's `base` when deployed under a subfolder
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

  return (
    <BrowserRouter basename={basename}>
      <div className="App">
        <AppContent currentUser={currentUser} setCurrentUser={setCurrentUser} />
      </div>
    </BrowserRouter>
  )
}

export default App
