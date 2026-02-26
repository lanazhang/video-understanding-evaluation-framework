import { useState } from 'react'
import { modelGroups } from '../../static/modelConfig'
import './VideoUnderstandingForm.css'

function VideoUnderstandingForm({ video, onSuccess }) {
  const [selectedModel, setSelectedModel] = useState('')
  const [inputPrompt, setInputPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [response, setResponse] = useState(null)

  // Get Video Understanding models from modelConfig
  const videoUnderstandingGroup = modelGroups.find(
    group => group.groupName === 'Video Understanding'
  )
  const models = videoUnderstandingGroup?.models || []

  // Set default model if not selected
  if (!selectedModel && models.length > 0) {
    setSelectedModel(models[0].modelId)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!inputPrompt.trim()) {
      setError('Please enter a prompt')
      return
    }

    if (!selectedModel) {
      setError('Please select a model')
      return
    }

    setLoading(true)
    setError(null)
    setResponse(null)

    try {
      const selectedModelConfig = models.find(m => m.modelId === selectedModel)
      
      if (!selectedModelConfig) {
        setError('Selected model configuration not found')
        setLoading(false)
        return
      }

      const payload = {
        VideoId: video.Id || video.id,
        InputPrompt: inputPrompt,
        ModelId: selectedModel
      }

      // Use the API endpoint from model config
      const apiEndpoint = selectedModelConfig.api
      
      console.log(`Calling ${apiEndpoint} with model ${selectedModel}`)
      
      // Import FetchPost dynamically
      const { FetchPost } = await import('../../utils/apiHelper')
      
      const data = await FetchPost(apiEndpoint, payload, 'EvalService')
      
      console.log('API Response:', data)
      
      // Handle Lambda proxy response format
      if (data.statusCode !== undefined) {
        if (data.statusCode === 200) {
          const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
          setResponse(responseBody)
          setError(null)
          
          if (onSuccess) {
            onSuccess(responseBody)
          }
        } else {
          const errorBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
          setError(errorBody.error || errorBody.message || 'Failed to process video understanding request')
        }
      } else if (data.message && (data.message.toLowerCase().includes('timed out') || data.message.toLowerCase().includes('timeout'))) {
        // Handle timeout error - check for both "timed out" and "timeout"
        setError('Request timed out. The video analysis is taking longer than expected. Please try with a shorter video or simpler prompt.')
      } else if (data.error) {
        // Handle direct error response
        setError(data.error || 'Failed to process video understanding request')
      } else if (data.message) {
        // Check if message indicates an error
        if (data.message.toLowerCase().includes('error') || data.message.toLowerCase().includes('failed')) {
          setError(data.message)
        } else {
          // Handle direct success response (no statusCode wrapper)
          setResponse(data)
          setError(null)
          
          if (onSuccess) {
            onSuccess(data)
          }
        }
      } else {
        // Handle direct success response (no statusCode wrapper)
        setResponse(data)
        setError(null)
        
        if (onSuccess) {
          onSuccess(data)
        }
      }
    } catch (err) {
      console.error('Error processing video understanding:', err)
      setError('Failed to process request: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setInputPrompt('')
    setResponse(null)
    setError(null)
  }

  return (
    <div className="video-understanding-form">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="model-select">Model</label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={loading}
            className="model-dropdown"
          >
            {models.map((model) => (
              <option key={model.modelId || model.displayName} value={model.modelId}>
                {model.displayName}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="input-prompt">Input Prompt</label>
          <textarea
            id="input-prompt"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder="Tell me about this video..."
            disabled={loading}
            rows={4}
            className="prompt-input"
          />
        </div>

        <div className="form-actions">
          <button
            type="submit"
            disabled={loading || !inputPrompt.trim()}
            className="btn-submit"
          >
            {loading ? 'Processing...' : 'Analyze Video'}
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={loading}
            className="btn-clear"
          >
            Clear
          </button>
        </div>
      </form>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {response && (
        <div className="response-section">
          <h3>Response</h3>
          <div className="response-content">
            {(() => {
              // Try to parse structured response from both TwelveLabs and Bedrock
              let content = response.response?.content || response.response?.message || response.message || 'No content available'
              
              // If it's a string, try to parse it as JSON
              if (typeof content === 'string') {
                try {
                  const parsed = JSON.parse(content)
                  
                  // Check if it has scenes array (structured response from both TwelveLabs and Bedrock)
                  if (parsed.scenes && Array.isArray(parsed.scenes)) {
                    return (
                      <div className="scenes-list">
                        {parsed.scenes.map((scene, index) => (
                          <div key={index} className="scene-item">
                            <div className="scene-header">
                              <span className="scene-number">Scene {index + 1}</span>
                              <span className="scene-time">
                                {scene.start_time} - {scene.end_time}
                              </span>
                            </div>
                            <div className="scene-description">
                              {scene.description}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  }
                  
                  // Check if parsed result is a string (double-encoded JSON from TwelveLabs)
                  // TwelveLabs returns: {"message": "{\"scenes\": [...]}"}
                  if (typeof parsed === 'string') {
                    try {
                      const doubleParsed = JSON.parse(parsed)
                      if (doubleParsed.scenes && Array.isArray(doubleParsed.scenes)) {
                        return (
                          <div className="scenes-list">
                            {doubleParsed.scenes.map((scene, index) => (
                              <div key={index} className="scene-item">
                                <div className="scene-header">
                                  <span className="scene-number">Scene {index + 1}</span>
                                  <span className="scene-time">
                                    {scene.start_time} - {scene.end_time}
                                  </span>
                                </div>
                                <div className="scene-description">
                                  {scene.description}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      }
                    } catch (e2) {
                      // Not double-encoded JSON
                    }
                  }
                  
                  // If parsed but no scenes, display as formatted JSON
                  return <pre className="response-text">{JSON.stringify(parsed, null, 2)}</pre>
                } catch (e) {
                  // Not JSON, display as plain text
                  return <div className="response-text">{content}</div>
                }
              }
              
              // If it's already an object
              return <div className="response-text">{JSON.stringify(content, null, 2)}</div>
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoUnderstandingForm
