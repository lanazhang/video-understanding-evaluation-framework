import { useState, useEffect } from 'react'
import { FetchPost } from '../../utils/apiHelper'
import './Settings.css'

function Settings({ currentUser }) {
  // Extract username from currentUser object (Amplify returns an object with username, userId, etc.)
  const username = currentUser?.username || currentUser
  
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [hasStoredKey, setHasStoredKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [messageType, setMessageType] = useState('') // 'success' or 'error'
  const [checkingKey, setCheckingKey] = useState(true)

  useEffect(() => {
    checkStoredKey()
  }, [])

  const checkStoredKey = async () => {
    setCheckingKey(true)
    try {
      console.log('Checking for stored API key...')
      const data = await FetchPost('/utils/manage-api-key', {
        operation: 'check',
        username: username  // Temporary workaround for testing
      }, 'EvalService')

      console.log('Check API key response:', data)

      if (data.statusCode === 200) {
        const body = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        console.log('Parsed response body:', body)
        setHasStoredKey(body.hasKey || false)
        
        if (body.error) {
          console.error('Error from Lambda:', body.error)
        }
      } else if (data.statusCode === 400) {
        const body = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        console.error('Authentication error:', body.message)
        setMessage(body.message || 'Authentication error. Please try logging out and back in.')
        setMessageType('error')
      }
    } catch (error) {
      console.error('Error checking stored key:', error)
      setMessage('Error checking stored key: ' + error.message)
      setMessageType('error')
    } finally {
      setCheckingKey(false)
    }
  }

  const handleSaveKey = async () => {
    if (!geminiApiKey.trim()) {
      setMessage('Please enter an API key')
      setMessageType('error')
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const data = await FetchPost('/utils/manage-api-key', {
        operation: 'save',
        apiKey: geminiApiKey,
        username: username  // Temporary workaround
      }, 'EvalService')

      if (data.statusCode === 200) {
        const body = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        if (body.success) {
          setMessage('API key saved successfully')
          setMessageType('success')
          setHasStoredKey(true)
          setGeminiApiKey('')
        } else {
          setMessage(body.message || 'Failed to save API key')
          setMessageType('error')
        }
      } else {
        setMessage('Failed to save API key')
        setMessageType('error')
      }
    } catch (error) {
      console.error('Error saving API key:', error)
      setMessage('Error saving API key: ' + error.message)
      setMessageType('error')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteKey = async () => {
    if (!window.confirm('Are you sure you want to delete your stored Gemini API key?')) {
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const data = await FetchPost('/utils/manage-api-key', {
        operation: 'delete',
        username: username  // Temporary workaround
      }, 'EvalService')

      if (data.statusCode === 200 || data.statusCode === 404) {
        const body = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        setMessage('API key deleted successfully')
        setMessageType('success')
        setHasStoredKey(false)
        setGeminiApiKey('')
      } else {
        setMessage('Failed to delete API key')
        setMessageType('error')
      }
    } catch (error) {
      console.error('Error deleting API key:', error)
      setMessage('Error deleting API key: ' + error.message)
      setMessageType('error')
    } finally {
      setLoading(false)
    }
  }



  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>Settings</h1>
        <p className="settings-subtitle">Manage your API keys and preferences</p>
        {username && (
          <p className="user-info">Logged in as: <strong>{username}</strong></p>
        )}
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <div className="section-header">
            <h2>Gemini API Key</h2>
            <div className="key-status">
              {checkingKey ? (
                <span className="status-badge status-checking">Checking...</span>
              ) : hasStoredKey ? (
                <span className="status-badge status-stored">Stored</span>
              ) : (
                <span className="status-badge status-not-stored">Not Stored</span>
              )}
            </div>
          </div>
          
          <p className="section-description">
            Store your Gemini API key securely in AWS Secrets Manager. This key will be used for video understanding tasks with Gemini models.
            {username && (
              <span className="secret-path"> 
                Checking for key at: <code>gemini-api-key/{username}</code>
              </span>
            )}
          </p>

          {message && (
            <div className={`message message-${messageType}`}>
              {message}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="gemini-api-key">API Key</label>
            <input
              id="gemini-api-key"
              type="password"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="Enter your Gemini API key"
              disabled={loading}
              className="api-key-input"
            />
            <small className="input-hint">
              Get your API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>
            </small>
          </div>

          <div className="button-group">
            <button
              onClick={handleSaveKey}
              disabled={loading || !geminiApiKey.trim()}
              className="btn btn-primary"
            >
              {loading ? 'Saving...' : 'Save API Key'}
            </button>

            {hasStoredKey && (
              <button
                onClick={handleDeleteKey}
                disabled={loading}
                className="btn btn-danger"
              >
                {loading ? 'Deleting...' : 'Delete Key'}
              </button>
            )}
          </div>

          <div className="info-box">
            <h3>About API Key Storage</h3>
            <ul>
              <li>Your API key is encrypted and stored in AWS Secrets Manager</li>
              <li>Only you can access your stored API key</li>
              <li>The key is automatically used when running Gemini video understanding tasks</li>
              <li>You can update or delete your key at any time</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
