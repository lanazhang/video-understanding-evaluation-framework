import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './ChatBot.css'
import { evalAPI } from '../../utils/api'
import { FetchPost } from '../../utils/apiHelper'
import { fetchUserAttributes } from 'aws-amplify/auth'
import GroundTruthTaskDetail from '../GroundTruthTaskDetail'
import EvaluationDetail from '../EvaluationDetail'

function ChatBot({ currentUser }) {
  const navigate = useNavigate()
  
  // Load initial messages from localStorage or use default
  const getInitialMessages = () => {
    try {
      const saved = localStorage.getItem('chatbot-history')
      if (saved) {
        const parsed = JSON.parse(saved)
        // Convert timestamp strings back to Date objects
        return parsed.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }
    } catch (error) {
      console.error('Error loading chat history:', error)
    }
    
    // Default welcome message
    return [
      {
        role: 'assistant',
        content: 'Hello! I can help you manage videos, ground truths, and evaluations. You can also upload videos directly here. What would you like to do?',
        timestamp: new Date()
      }
    ]
  }
  
  const [messages, setMessages] = useState(getInitialMessages)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [videoModal, setVideoModal] = useState(null)
  const [groundTruthModal, setGroundTruthModal] = useState(null)
  const [evaluationModal, setEvaluationModal] = useState(null)
  const [showThinkingTooltip, setShowThinkingTooltip] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB chunks
  
  // Save messages to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('chatbot-history', JSON.stringify(messages))
    } catch (error) {
      console.error('Error saving chat history:', error)
    }
  }, [messages])
  
  // Extract thinking content and clean message
  const extractThinking = (content) => {
    const thinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/i)
    let thinking = null
    let cleanContent = content
    
    if (thinkingMatch) {
      thinking = thinkingMatch[1].trim()
      cleanContent = cleanContent.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim()
    }
    
    // Also remove action tags from the content
    cleanContent = cleanContent.replace(/<action[^>]*>[\s\S]*?<\/action>/gi, '').trim()
    
    return { thinking, content: cleanContent }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Get username from currentUser or fetch from Cognito
      let username = currentUser?.username || 'unknown'
      if (username === 'unknown') {
        try {
          const userAttributes = await fetchUserAttributes()
          username = userAttributes.email || userAttributes.preferred_username || userAttributes.sub || 'unknown'
        } catch (err) {
          console.error('Failed to fetch user attributes:', err)
        }
      }

      // Retry logic for 500 errors
      const maxRetries = 3
      let lastError = null
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`Chatbot API call attempt ${attempt}/${maxRetries}`)
          
          // Call the chatbot API with username
          const response = await evalAPI.chatbotConverse({
            message: userMessage.content,
            username: username,
            conversationHistory: messages.slice(-10) // Send last 10 messages for context
          })

          // Check for 500 error
          if (response?.statusCode === 500) {
            lastError = new Error('Server error (500)')
            console.error(`Attempt ${attempt} failed with 500 error`)
            
            // If not the last attempt, wait before retrying (exponential backoff)
            if (attempt < maxRetries) {
              const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000) // 1s, 2s, 4s (max 5s)
              console.log(`Waiting ${delay}ms before retry...`)
              await new Promise(resolve => setTimeout(resolve, delay))
              continue
            }
          }

          // Success - process the response
          let assistantMessage
          if (response?.statusCode === 200) {
            const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body
            assistantMessage = {
              role: 'assistant',
              content: body.response || 'I processed your request.',
              data: body.data || [],  // Include structured data
              actions: body.actions || [],
              timestamp: new Date()
            }
          } else if (response?.response) {
            assistantMessage = {
              role: 'assistant',
              content: response.response,
              data: response.data || [],  // Include structured data
              actions: response.actions || [],
              timestamp: new Date()
            }
          } else {
            throw new Error('Invalid response format')
          }

          setMessages(prev => [...prev, assistantMessage])
          return // Success, exit the function
          
        } catch (apiError) {
          lastError = apiError
          console.error(`Attempt ${attempt} error:`, apiError)
          
          // If not the last attempt, wait before retrying
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
            console.log(`Waiting ${delay}ms before retry...`)
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }
      }
      
      // All retries failed
      throw lastError || new Error('All retry attempts failed')
      
    } catch (error) {
      console.error('Error sending message after all retries:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
        error: true
      }])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Validate file type
    const supportedFormats = ['avi', 'mov', 'mp4']
    const fileExtension = file.name.split('.').pop().toLowerCase()
    
    if (!supportedFormats.includes(fileExtension)) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, the file format .${fileExtension} is not supported. Please upload a video in .mp4, .mov, or .avi format.`,
        timestamp: new Date(),
        error: true
      }])
      return
    }

    // Add user message about upload
    setMessages(prev => [...prev, {
      role: 'user',
      content: `Upload video: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`,
      timestamp: new Date()
    }])

    setUploadingFile(file)
    setUploadProgress(0)

    try {
      await uploadVideo(file)
    } catch (error) {
      console.error('Upload error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Failed to upload video: ${error.message}`,
        timestamp: new Date(),
        error: true
      }])
    } finally {
      setUploadingFile(null)
      setUploadProgress(0)
    }
  }

  const uploadVideo = async (file) => {
    const fileSize = file.size
    const chunks = Math.ceil(fileSize / CHUNK_SIZE)

    // Step 1: Generate presigned URLs
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Generating upload URLs...',
      timestamp: new Date()
    }])

    const urlResponse = await FetchPost(
      '/utils/manage-s3-presigned-url',
      {
        FileName: file.name,
        NumParts: chunks,
        Action: 'create'
      },
      'EvalService'
    )

    let responseData = urlResponse
    if (urlResponse.statusCode !== undefined) {
      if (urlResponse.statusCode !== 200) {
        throw new Error('Failed to generate upload URLs')
      }
      responseData = typeof urlResponse.body === 'string' ? JSON.parse(urlResponse.body) : urlResponse.body
    }

    // Step 2: Upload chunks
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Uploading video...',
      timestamp: new Date()
    }])

    const parts = []
    const uploadPromises = []

    for (let i = 0; i < chunks; i++) {
      const startByte = i * CHUNK_SIZE
      const endByte = Math.min(startByte + CHUNK_SIZE, file.size)
      const chunk = file.slice(startByte, endByte)

      const uploadPromise = fetch(responseData.UploadPartUrls[i], {
        method: 'PUT',
        headers: { 'Content-Type': '' },
        body: chunk
      }).then(response => {
        if (response.ok) {
          const etag = response.headers.get('Etag')
          parts.push({ ETag: etag, PartNumber: i + 1 })
          setUploadProgress(Math.round(((i + 1) / chunks) * 100))
        } else {
          throw new Error(`Failed to upload part ${i + 1}`)
        }
      })

      uploadPromises.push(uploadPromise)
    }

    await Promise.all(uploadPromises)
    parts.sort((a, b) => a.PartNumber - b.PartNumber)

    // Step 3: Complete multipart upload
    await FetchPost(
      '/utils/manage-s3-presigned-url',
      {
        TaskId: responseData.TaskId,
        FileName: file.name,
        MultipartUpload: parts,
        UploadId: responseData.UploadId,
        Action: 'complete'
      },
      'EvalService'
    )

    // Step 4: Submit video metadata
    let uploadedBy = 'unknown'
    try {
      const userAttributes = await fetchUserAttributes()
      uploadedBy = userAttributes.email || userAttributes.preferred_username || userAttributes.sub || 'unknown'
    } catch (err) {
      console.error('Failed to fetch user attributes:', err)
    }

    const payload = {
      Id: responseData.TaskId,
      Name: file.name,
      Description: `Uploaded via chatbot on ${new Date().toLocaleString()}`,
      S3Bucket: responseData.S3Bucket,
      S3KeyVideo: responseData.S3Key,
      UploadedBy: uploadedBy
    }

    await FetchPost('/video/add-video', payload, 'EvalService')

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Video "${file.name}" uploaded successfully! You can now create ground truths or run analysis on it.`,
      timestamp: new Date(),
      actions: [{
        type: 'success',
        description: 'Video uploaded'
      }]
    }])
  }

  const formatTimestamp = (date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  const renderActions = (actions) => {
    if (!actions || actions.length === 0) return null

    return (
      <div className="message-actions">
        {actions.map((action, idx) => {
          if (action.type === 'navigate') {
            return (
              <button 
                key={idx} 
                className="action-button navigate-button"
                onClick={() => navigate(`/${action.target}`)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                {action.description}
              </button>
            )
          }
          
          return (
            <div key={idx} className="action-item">
              <span className="action-icon">{action.type === 'success' ? '✓' : 'ℹ'}</span>
              <span className="action-text">{action.description}</span>
            </div>
          )
        })}
      </div>
    )
  }

  const openVideoModal = (video) => {
    setVideoModal(video)
  }

  const closeVideoModal = () => {
    setVideoModal(null)
  }

  const openGroundTruthModal = (gt) => {
    setGroundTruthModal(gt)
  }

  const closeGroundTruthModal = () => {
    setGroundTruthModal(null)
  }

  const openEvaluationModal = (evalTask) => {
    setEvaluationModal(evalTask)
  }

  const closeEvaluationModal = () => {
    setEvaluationModal(null)
  }

  const handleNavigateToGroundTruth = (gtId) => {
    // Close the modal
    setGroundTruthModal(null)
    // Navigate to ground truth page
    // We'll use a custom event to trigger navigation with the GT selected
    window.dispatchEvent(new CustomEvent('navigateToGTDetail', { detail: { gtId } }))
    navigate('/ground-truth')
  }

  const handleClearChat = () => {
    const defaultMessages = [
      {
        role: 'assistant',
        content: 'Hello! I can help you manage videos, ground truths, and evaluations. You can also upload videos directly here. What would you like to do?',
        timestamp: new Date()
      }
    ]
    setMessages(defaultMessages)
    // Clear from localStorage
    try {
      localStorage.setItem('chatbot-history', JSON.stringify(defaultMessages))
    } catch (error) {
      console.error('Error clearing chat history:', error)
    }
  }

  const renderStructuredData = (data) => {
    if (!data || data.length === 0) return null

    return (
      <div className="structured-data">
        {data.map((dataGroup, groupIdx) => {
          if (dataGroup.type === 'videos') {
            return (
              <div key={groupIdx} className="data-group videos-group">
                <div className="data-group-header">Videos ({dataGroup.items.length})</div>
                <div className="video-cards">
                  {dataGroup.items.map((video, videoIdx) => (
                    <div key={videoIdx} className="video-card" onClick={() => openVideoModal(video)}>
                      {video.thumbnail_url && (
                        <div className="video-thumbnail">
                          <img src={video.thumbnail_url} alt={video.Name} />
                          <div className="play-overlay">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                          </div>
                        </div>
                      )}
                      <div className="video-info">
                        <div className="video-name" title={video.Name}>{video.Name}</div>
                        <div className="video-meta-compact">
                          <span>{formatDuration(video.Duration)}</span>
                          <span>•</span>
                          <span>{video.Resolution ? `${video.Resolution[0]}x${video.Resolution[1]}` : 'N/A'}</span>
                          <span>•</span>
                          <span>{video.Fps ? `${Math.round(video.Fps)}fps` : 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
          
          if (dataGroup.type === 'ground_truths') {
            return (
              <div key={groupIdx} className="data-group ground-truths-group">
                <div className="data-group-header">Ground Truths ({dataGroup.items.length})</div>
                <div className="ground-truths-list">
                  {dataGroup.items.map((gt, gtIdx) => (
                    <div 
                      key={gtIdx} 
                      className="ground-truth-card clickable"
                      onClick={() => openGroundTruthModal(gt)}
                    >
                      <div className="gt-header">
                        <div className="gt-name">{gt.Name}</div>
                        <div className="gt-meta">
                          {gt.Labels && <span className="gt-label-count">{gt.Labels.length} segments</span>}
                          {gt.CreatedBy && <span className="gt-creator">by {gt.CreatedBy}</span>}
                        </div>
                      </div>
                      
                      {gt.Description && (
                        <div className="gt-description">{gt.Description}</div>
                      )}
                      
                      {gt.Labels && gt.Labels.length > 0 && (
                        <div className="gt-labels-preview">
                          <div className="gt-labels-header">Label Segments:</div>
                          <div className="gt-labels-summary">
                            {(() => {
                              const labelCounts = {}
                              gt.Labels.forEach(label => {
                                labelCounts[label.Label] = (labelCounts[label.Label] || 0) + 1
                              })
                              return Object.entries(labelCounts).map(([label, count]) => (
                                <span key={label} className="label-badge">
                                  {label} ({count})
                                </span>
                              ))
                            })()}
                          </div>
                        </div>
                      )}
                      
                      {gt.eval_count !== undefined && gt.eval_count > 0 && (
                        <div className="gt-eval-count">
                          Used in {gt.eval_count} evaluation{gt.eval_count !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          }
          
          if (dataGroup.type === 'evaluation_tasks') {
            return (
              <div key={groupIdx} className="data-group eval-tasks-group">
                <div className="data-group-header">Evaluation Tasks ({dataGroup.items.length})</div>
                <div className="data-list">
                  {dataGroup.items.map((task, taskIdx) => (
                    <div 
                      key={taskIdx} 
                      className="data-item clickable"
                      onClick={() => openEvaluationModal(task)}
                    >
                      <div className="item-name">{task.Name}</div>
                      <div className="item-meta">Status: {task.Status}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
          
          if (dataGroup.type === 'analyze_tasks') {
            return (
              <div key={groupIdx} className="data-group analyze-tasks-group">
                <div className="data-group-header">Analysis Tasks ({dataGroup.items.length})</div>
                <div className="data-list">
                  {dataGroup.items.map((task, taskIdx) => (
                    <div key={taskIdx} className="data-item">
                      <div className="item-name">{task.Type || 'Analysis'}</div>
                      <div className="item-meta">Status: {task.Status}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
          
          return null
        })}
      </div>
    )
  }

  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    } else {
      return `${secs}s`
    }
  }

  return (
    <div className="chatbot-container">
      {videoModal && (
        <div className="video-modal-overlay" onClick={closeVideoModal}>
          <div className="video-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeVideoModal}>×</button>
            <div className="modal-video-container">
              <video
                src={videoModal.video_url}
                controls
                autoPlay
                muted
                className="modal-video"
              />
            </div>
            <div className="modal-metadata">
              <h3>{videoModal.Name}</h3>
              <div className="metadata-compact">
                <span className="meta-item">
                  <strong>Duration:</strong> {formatDuration(videoModal.Duration)}
                </span>
                <span className="meta-separator">•</span>
                <span className="meta-item">
                  <strong>Resolution:</strong> {videoModal.Resolution ? `${videoModal.Resolution[0]}x${videoModal.Resolution[1]}` : 'N/A'}
                </span>
                <span className="meta-separator">•</span>
                <span className="meta-item">
                  <strong>FPS:</strong> {videoModal.Fps ? Math.round(videoModal.Fps) : 'N/A'}
                </span>
                <span className="meta-separator">•</span>
                <span className="meta-item">
                  <strong>Size:</strong> {videoModal.Size ? `${(videoModal.Size / (1024 * 1024)).toFixed(2)} MB` : 'N/A'}
                </span>
                <span className="meta-separator">•</span>
                <span className="meta-item">
                  <strong>Status:</strong> {videoModal.Status || 'N/A'}
                </span>
                <span className="meta-separator">•</span>
                <span className="meta-item">
                  <strong>Uploaded:</strong> {videoModal.UploadedTs ? new Date(videoModal.UploadedTs).toLocaleDateString() : 'N/A'}
                </span>
                <span className="meta-separator">•</span>
                <span className="meta-item">
                  <strong>By:</strong> {videoModal.UploadedBy || 'N/A'}
                </span>
                {videoModal.gt_count !== undefined && (
                  <>
                    <span className="meta-separator">•</span>
                    <span className="meta-item">
                      <strong>Ground Truths:</strong> {videoModal.gt_count}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {groundTruthModal && (
        <div className="gt-modal-overlay" onClick={closeGroundTruthModal}>
          <div className="gt-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeGroundTruthModal}>×</button>
            <div className="gt-modal-body">
              <GroundTruthTaskDetail 
                task={groundTruthModal} 
                onBack={closeGroundTruthModal}
                onNavigateToEdit={() => handleNavigateToGroundTruth(groundTruthModal.Id || groundTruthModal.id)}
                currentUser={currentUser}
              />
            </div>
          </div>
        </div>
      )}

      {evaluationModal && (
        <div className="eval-modal-overlay" onClick={closeEvaluationModal}>
          <div className="eval-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeEvaluationModal}>×</button>
            <div className="eval-modal-body">
              <EvaluationDetail 
                task={evaluationModal} 
                onBack={closeEvaluationModal}
              />
            </div>
          </div>
        </div>
      )}
      
      <div className="chatbot-header">
        <div className="chatbot-header-content">
          <div className="chatbot-header-text">
            <h2>AI Assistant</h2>
            <p>Under construction... Manage your videos, ground truths, and evaluations with natural language</p>
          </div>
          <button 
            className="btn-clear-chat" 
            onClick={handleClearChat}
            title="Clear chat history"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
              <path d="M21 3v5h-5"></path>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
              <path d="M3 21v-5h5"></path>
            </svg>
            Clear Chat
          </button>
        </div>
      </div>

      <div className="chatbot-messages">
        {messages.map((msg, idx) => {
          const { thinking, content } = extractThinking(msg.content)
          
          return (
            <div key={idx} className={`message ${msg.role} ${msg.error ? 'error' : ''}`}>
              <div className="message-header">
                <div className="message-header-left">
                  <span className="message-role">
                    {msg.role === 'user' ? currentUser?.username || 'You' : 'Assistant'}
                  </span>
                  {thinking && msg.role === 'assistant' && (
                    <div className="thinking-icon-container">
                      <button
                        className="thinking-icon"
                        onMouseEnter={() => setShowThinkingTooltip(idx)}
                        onMouseLeave={() => setShowThinkingTooltip(null)}
                        onClick={() => setShowThinkingTooltip(showThinkingTooltip === idx ? null : idx)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                          <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                      </button>
                      {showThinkingTooltip === idx && (
                        <div className="thinking-tooltip">
                          <div className="thinking-tooltip-header">Agent Reasoning</div>
                          <div className="thinking-tooltip-content">{thinking}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <span className="message-time">{formatTimestamp(msg.timestamp)}</span>
              </div>
              <div className="message-content">{content}</div>
              {renderActions(msg.actions)}
              {renderStructuredData(msg.data)}
            </div>
          )
        })}
        {isLoading && (
          <div className="message assistant loading">
            <div className="message-header">
              <span className="message-role">Assistant</span>
            </div>
            <div className="message-content">
              <span className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chatbot-input-container">
        <div className="chatbot-suggestions">
          <button onClick={() => setInput('List all my videos')}>List videos</button>
          <button onClick={() => setInput('Show my ground truths')}>Show ground truths</button>
          <button onClick={() => setInput('What evaluations do I have?')}>Show evaluations</button>
          <button onClick={() => fileInputRef.current?.click()} disabled={isLoading || uploadingFile}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload Video
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp4,.mov,.avi"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <div className="chatbot-input">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to list videos, create ground truths, run evaluations, or upload a video..."
            rows={1}
            disabled={isLoading || uploadingFile}
          />
          <button 
            onClick={handleSend} 
            disabled={!input.trim() || isLoading || uploadingFile}
            className="send-button"
          >
            Send
          </button>
        </div>
        {uploadingFile && (
          <div className="upload-progress-bar">
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
            <span className="progress-text">{uploadProgress}%</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default ChatBot
