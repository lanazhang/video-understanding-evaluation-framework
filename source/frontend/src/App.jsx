import { useState, useEffect } from 'react'
import './App.css'
import '@aws-amplify/ui-react/styles.css'
import { Authenticator } from '@aws-amplify/ui-react'
import { signOut } from 'aws-amplify/auth'
import VideoManagement from './components/VideoManagement'
import GroundTruthManagement from './components/GroundTruthManagement'
import EvaluationManagement from './components/EvaluationManagement'
import logoIcon from './assets/icons/logo.svg'
import videoIcon from './assets/icons/video.svg'
import documentIcon from './assets/icons/document.svg'
import checkIcon from './assets/icons/check.svg'

function App() {
  const [activeMenu, setActiveMenu] = useState('videos')
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [videoKey, setVideoKey] = useState(0)
  const [groundTruthKey, setGroundTruthKey] = useState(0)
  const [evaluationKey, setEvaluationKey] = useState(0)
  const [currentUser, setCurrentUser] = useState(null)

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
    if (menu === 'videos') {
      setVideoKey(prev => prev + 1)
    } else if (menu === 'ground-truth') {
      setGroundTruthKey(prev => prev + 1)
    } else if (menu === 'evaluation') {
      setEvaluationKey(prev => prev + 1)
    }
  }

  return (
    <Authenticator>
      {({ user }) => {
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
          ) : (
            <EvaluationManagement key={evaluationKey} currentUser={currentUser} />
          )}
        </div>
      </div>
        </div>
        )
      }}
    </Authenticator>
  )
}

export default App
