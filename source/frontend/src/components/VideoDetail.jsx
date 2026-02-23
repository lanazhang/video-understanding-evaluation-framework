import { useEffect, useState, useCallback } from 'react'
import './VideoDetail.css'
import { evalAPI } from '../utils/api'

function VideoDetail({ video, onClose }) {
  const [activeTab, setActiveTab] = useState('embedding')
  const [startingAnalysis, setStartingAnalysis] = useState(false)
  const [error, setError] = useState(null)
  
  const [novaMmeConfig, setNovaMmeConfig] = useState({
    durationS: 5,
    embedMode: 'AUDIO_VIDEO_COMBINED'
  })

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleStartNovaMme = async () => {
    setStartingAnalysis(true)
    setError(null)
    try {
      const payload = {
        VideoId: video.Id || video.id,
        ModelId: 'amazon.nova-reel-v1:0',
        Description: 'User-initiated Nova MME analysis',
        Request: {
          DurationS: novaMmeConfig.durationS,
          EmbedMode: novaMmeConfig.embedMode,
          EmbeddingDim: 1024,
          RequestedBy: video.UploadedBy || 'user'
        }
      }
      
      await evalAPI.startNovaMme(payload)
      alert('Nova MME analysis started successfully!')
    } catch (err) {
      console.error('Error starting Nova MME:', err)
      setError('Failed to start Nova MME analysis')
    } finally {
      setStartingAnalysis(false)
    }
  }

  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A'
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    const parts = []
    if (hours > 0) parts.push(`${hours}h`)
    if (mins > 0) parts.push(`${mins}m`)
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)
    
    return parts.join(' ')
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    return new Date(timestamp).toLocaleString()
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`
  }

  const formatResolution = (resolution) => {
    if (!resolution) return 'N/A'
    if (Array.isArray(resolution)) {
      return `${resolution[0]} × ${resolution[1]}`
    }
    return resolution
  }

  const formatFps = (fps) => {
    if (!fps) return 'N/A'
    return `${Math.round(fps)} fps`
  }

  const getVideoUrl = () => {
    if (video.video_url) return video.video_url
    return `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`
  }

  return (
    <div className="video-detail-modal" onClick={onClose}>
      <div className="video-detail-content" onClick={(e) => e.stopPropagation()}>
        <div className="video-detail-header">
          <h2>{video.Name || 'Video Details'}</h2>
          <button className="btn-close" onClick={onClose} title="Close (Esc)">
            ×
          </button>
        </div>

        <div className="video-detail-tabs">
          <button 
            className={`tab-button ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Details
          </button>
          <button 
            className={`tab-button ${activeTab === 'embedding' ? 'active' : ''}`}
            onClick={() => setActiveTab('embedding')}
          >
            Multimodal Embedding
          </button>
        </div>

        <div className="video-detail-body">
          {activeTab === 'details' && (
            <>
              <div className="video-player-section">
                <div className="video-player-container">
                  <video controls muted>
                    <source src={getVideoUrl()} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>
                
                <div className="basic-info">
                  {video.Description && (
                    <div className="info-row">
                      <span className="info-label">Description</span>
                      <span className="info-value">{video.Description}</span>
                    </div>
                  )}
                  <div className="info-row-inline">
                    <span className="info-label">ID</span>
                    <span className="info-value video-id">{video.Id || video.id || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="video-metadata-section">
                <div className="metadata-grid">
                  <div className="meta-item">
                    <div className="meta-label">Duration</div>
                    <div className="meta-value">{formatDuration(video.Duration)}</div>
                  </div>
                  <div className="meta-item">
                    <div className="meta-label">Resolution</div>
                    <div className="meta-value">{formatResolution(video.Resolution)}</div>
                  </div>
                  <div className="meta-item">
                    <div className="meta-label">Frame Rate</div>
                    <div className="meta-value">{formatFps(video.Fps)}</div>
                  </div>
                  <div className="meta-item">
                    <div className="meta-label">File Size</div>
                    <div className="meta-value">{formatFileSize(video.Size)}</div>
                  </div>
                  <div className="meta-item">
                    <div className="meta-label">Uploaded By</div>
                    <div className="meta-value">{video.UploadedBy || 'N/A'}</div>
                  </div>
                  <div className="meta-item">
                    <div className="meta-label">Upload Date</div>
                    <div className="meta-value">{formatDate(video.UploadedTs)}</div>
                  </div>
                </div>

                <div className="storage-info">
                  <div className="storage-label">Storage Location</div>
                  <div className="storage-path">
                    s3://{video.S3Bucket}/{video.S3KeyVideo || 'N/A'}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'embedding' && (
            <div className="embedding-section">
              {error && (
                <div className="error-message">{error}</div>
              )}
              
              <div className="no-tasks-section">
                <div className="start-analysis-form">
                  <h3>Create Nova MME Embedding</h3>
                  <div className="form-group">
                    <label htmlFor="durationS">Segment Duration (seconds)</label>
                    <input
                      type="number"
                      id="durationS"
                      min="1"
                      max="600"
                      value={novaMmeConfig.durationS}
                      onChange={(e) => setNovaMmeConfig(prev => ({
                        ...prev,
                        durationS: parseInt(e.target.value) || 5
                      }))}
                    />
                    <p className="help-text">Duration of each video segment (1-600 seconds)</p>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="embedMode">Embedding Mode</label>
                    <select
                      id="embedMode"
                      value={novaMmeConfig.embedMode}
                      onChange={(e) => setNovaMmeConfig(prev => ({
                        ...prev,
                        embedMode: e.target.value
                      }))}
                    >
                      <option value="AUDIO_VIDEO_COMBINED">Audio + Video Combined</option>
                      <option value="AUDIO_VIDEO_SEPARATE">Audio + Video Separate</option>
                      <option value="VIDEO_ONLY">Video Only</option>
                      <option value="AUDIO_ONLY">Audio Only</option>
                    </select>
                    <p className="help-text">How to process audio and video streams</p>
                  </div>

                  <button 
                    className="btn-start-analysis"
                    onClick={handleStartNovaMme}
                    disabled={startingAnalysis}
                  >
                    {startingAnalysis ? 'Creating Embedding...' : 'Create Embedding'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default VideoDetail
