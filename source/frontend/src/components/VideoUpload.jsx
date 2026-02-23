import { useState, useRef } from 'react'
import './VideoUpload.css'
import { FetchPost } from '../utils/apiHelper'
import { fetchUserAttributes } from 'aws-amplify/auth'
import { modelGroups } from '../static/modelConfig'

function VideoUpload({ onSuccess, onCancel }) {
  // Get only Multimodal Embedding models
  const embeddingModels = modelGroups.find(g => g.groupName === 'Multimodal Embedding')?.models || []
  
  const [uploadFiles, setUploadFiles] = useState([])
  const [taskName, setTaskName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedEmbeddings, setSelectedEmbeddings] = useState([]) // Default to none checked
  const [novaMmeConfig, setNovaMmeConfig] = useState({
    durationS: 5,
    embedMode: 'AUDIO_VIDEO_COMBINED',
    embeddingDim: 1024
  })
  const [twelveLabsConfig, setTwelveLabsConfig] = useState({
    Segmentation: {
      Method: 'dynamic',
      Dynamic: {
        MinDurationSec: 4
      }
    },
    EmbeddingScope: ['clip'],
    EmbeddingOption: ['visual', 'audio', 'transcription']
  })
  const [alert, setAlert] = useState(null)
  const [status, setStatus] = useState(null) // null, generateurl, uploading, loading
  const [numChunks, setNumChunks] = useState(null)
  const [uploadedChunks, setUploadedChunks] = useState(0)
  const [currentUploadingFileName, setCurrentUploadingFileName] = useState(null)
  const fileInputRef = useRef(null)

  const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB chunks

  const toggleEmbedding = (model) => {
    setSelectedEmbeddings(prev =>
      prev.some(m => m.displayName === model.displayName)
        ? prev.filter(m => m.displayName !== model.displayName)
        : [...prev, model]
    )
  }

  const resetState = () => {
    setUploadFiles([])
    setTaskName('')
    setDescription('')
    setSelectedEmbeddings([]) // Reset to none checked
    setNovaMmeConfig({
      durationS: 5,
      embedMode: 'AUDIO_VIDEO_COMBINED',
      embeddingDim: 1024
    })
    setTwelveLabsConfig({
      Segmentation: {
        Method: 'dynamic',
        Dynamic: {
          MinDurationSec: 4
        }
      },
      EmbeddingScope: ['clip'],
      EmbeddingOption: ['visual', 'audio', 'transcription']
    })
    setAlert(null)
    setStatus(null)
    setNumChunks(null)
    setUploadedChunks(0)
    setCurrentUploadingFileName(null)
  }

  const handleFileSelect = (e) => {
    const supportedFormats = ['avi', 'mov', 'mp4']
    const files = Array.from(e.target.files)
    const filteredFiles = []
    const invalidFiles = []

    files.forEach(file => {
      const fileExtension = file.name.split('.').pop().toLowerCase()
      if (supportedFormats.includes(fileExtension)) {
        filteredFiles.push(file)
      } else {
        invalidFiles.push(file.name)
      }
    })

    setUploadFiles(filteredFiles)
    setAlert(
      invalidFiles.length === 0
        ? null
        : `File(s) "${invalidFiles.join(', ')}" not in supported format (avi, mov, mp4) and has been removed.`
    )

    if (filteredFiles.length > 0 && !taskName) {
      setTaskName(filteredFiles[0].name)
    }
  }

  const generatePresignedUrls = async (file) => {
    const fileSize = file.size
    const chunks = Math.ceil(fileSize / CHUNK_SIZE)
    setNumChunks(chunks)
    setCurrentUploadingFileName(file.name)
    setStatus('generateurl')

    try {
      const data = await FetchPost(
        '/video/manage-s3-presigned-url',
        {
          FileName: file.name,
          NumParts: chunks,
          Action: 'create'
        },
        'EvalService'
      )

      // Handle response - data might be the body directly or wrapped
      const responseData = data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data
      
      if (data.statusCode && data.statusCode !== 200) {
        setStatus(null)
        setAlert(responseData.error || responseData.message || 'Failed to generate presigned URLs')
        setCurrentUploadingFileName(null)
        return
      }

      if (responseData.UploadPartUrls) {
        await uploadFile({
          taskId: responseData.TaskId,
          uploadS3Url: responseData.UploadUrl,
          uploadedS3Bucket: responseData.S3Bucket,
          uploadedS3KeyVideo: responseData.S3Key,
          uploadId: responseData.UploadId,
          uploadPartUrls: responseData.UploadPartUrls,
          numChunks: chunks
        }, file)
      } else {
        setStatus(null)
        setAlert('No upload URLs received from server')
        setCurrentUploadingFileName(null)
      }
    } catch (err) {
      setStatus(null)
      setAlert(err.message)
      setCurrentUploadingFileName(null)
    }
  }

  const uploadFile = async (urlResp, file) => {
    setStatus('uploading')
    setUploadedChunks(0)

    if (!urlResp.uploadPartUrls || urlResp.uploadPartUrls.length === 0) {
      setAlert('No upload URLs received')
      return
    }

    const parts = []
    const uploadPromises = []

    for (let i = 0; i < urlResp.numChunks; i++) {
      const startByte = i * CHUNK_SIZE
      const endByte = Math.min(startByte + CHUNK_SIZE, file.size)
      const chunk = file.slice(startByte, endByte)

      const uploadPromise = fetch(urlResp.uploadPartUrls[i], {
        method: 'PUT',
        headers: { 'Content-Type': '' },
        body: chunk
      }).then(response => {
        if (response.ok) {
          const etag = response.headers.get('Etag')
          parts.push({ ETag: etag, PartNumber: i + 1 })
          setUploadedChunks(prev => prev + 1)
        } else {
          throw new Error(`Failed to upload part ${i + 1}`)
        }
      })

      uploadPromises.push(uploadPromise)
    }

    try {
      await Promise.all(uploadPromises)

      // Sort parts by PartNumber in ascending order (required by S3)
      parts.sort((a, b) => a.PartNumber - b.PartNumber)

      // Complete multipart upload
      const completeData = await FetchPost(
        '/video/manage-s3-presigned-url',
        {
          TaskId: urlResp.taskId,
          FileName: file.name,
          MultipartUpload: parts,
          UploadId: urlResp.uploadId,
          Action: 'complete'
        },
        'EvalService'
      )

      // Handle response - data might be the body directly or wrapped
      const completeResponseData = completeData.body ? (typeof completeData.body === 'string' ? JSON.parse(completeData.body) : completeData.body) : completeData

      if (completeData.statusCode && completeData.statusCode !== 200) {
        setAlert(completeResponseData.error || completeResponseData.message || 'Failed to complete upload')
        setStatus(null)
        setCurrentUploadingFileName(null)
        return
      }

      // Submit video metadata
      await submitVideoMetadata(urlResp, file)
    } catch (err) {
      setStatus(null)
      setAlert(err.message)
      setCurrentUploadingFileName(null)
    }
  }

  const submitVideoMetadata = async (urlResp, file) => {
    setStatus('loading')

    // Get current Cognito user
    let uploadedBy = 'unknown'
    try {
      const userAttributes = await fetchUserAttributes()
      uploadedBy = userAttributes.email || userAttributes.preferred_username || userAttributes.sub || 'unknown'
    } catch (err) {
      console.error('Failed to fetch user attributes:', err)
    }

    // Build embedding configurations if models are selected
    const embeddingConfigs = selectedEmbeddings.map(model => {
      if (model.displayName.toLowerCase().includes('twelve')) {
        return {
          ModelId: model.modelId,
          ModelName: model.displayName,
          Config: {
            Segmentation: twelveLabsConfig.Segmentation,
            EmbeddingScope: twelveLabsConfig.EmbeddingScope,
            EmbeddingOption: twelveLabsConfig.EmbeddingOption
          }
        }
      } else {
        // Nova MME or other models
        return {
          ModelId: model.modelId,
          ModelName: model.displayName,
          Config: {
            DurationS: novaMmeConfig.durationS,
            EmbedMode: novaMmeConfig.embedMode,
            EmbeddingDim: novaMmeConfig.embeddingDim
          }
        }
      }
    })

    const payload = {
      Id: urlResp.taskId,
      Name: taskName,
      Description: description,
      S3Bucket: urlResp.uploadedS3Bucket,
      S3KeyVideo: urlResp.uploadedS3KeyVideo,
      UploadedBy: uploadedBy,
      EmbeddingConfigs: embeddingConfigs.length > 0 ? embeddingConfigs : undefined
    }

    try {
      const data = await FetchPost('/video/add-video', payload, 'EvalService')

      // Handle response - data might be the body directly or wrapped
      const responseData = data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : data

      if (data.statusCode && data.statusCode !== 200) {
        const errorMessage = responseData.error || responseData.message || 'Failed to add video'
        setStatus(null)
        setAlert(errorMessage)
        setCurrentUploadingFileName(null)
      } else {
        // Video uploaded successfully - embedding tasks are created by add-video Lambda
        setCurrentUploadingFileName(null)
        resetState()
        onSuccess()
      }
    } catch (err) {
      setStatus(null)
      setAlert(err.message)
      setCurrentUploadingFileName(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (uploadFiles.length === 0) {
      setAlert('Please select a video file to upload.')
      return
    }

    // Upload files sequentially
    for (const file of uploadFiles) {
      await generatePresignedUrls(file)
    }
  }

  const getUploadProgress = () => {
    if (!numChunks || !uploadedChunks) return 0
    return (uploadedChunks / numChunks) * 100
  }

  const isUploading = status !== null

  return (
    <div className="modal-overlay">
      <div className="modal-content video-upload-modal">
        <div className="modal-header">
          <h2>Upload Video</h2>
          <button 
            className="close-button" 
            onClick={onCancel}
            disabled={isUploading}
          >
            &times;
          </button>
        </div>

        {alert && (
          <div className="alert alert-warning">
            {alert}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="taskName">Video Name *</label>
            <input
              type="text"
              id="taskName"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="Enter video name"
              required
              disabled={isUploading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the video"
              rows="3"
              disabled={isUploading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="files">Select Video *</label>
            <input
              ref={fileInputRef}
              type="file"
              id="files"
              accept=".mp4,.mov,.avi"
              onChange={handleFileSelect}
              disabled={isUploading}
            />
            <p className="help-text">Supported formats: .mp4, .mov, .avi</p>
            {uploadFiles.length > 0 && (
              <div className="selected-files">
                {uploadFiles.map((file, index) => (
                  <div key={index} className="file-item">
                    <div className="file-info">
                      <span className="file-name">{file.name}</span>
                      <span className="file-size">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                    {currentUploadingFileName === file.name && (
                      <div className="upload-progress">
                        <div className="progress-bar">
                          <div 
                            className="progress-fill" 
                            style={{ width: `${getUploadProgress()}%` }}
                          />
                        </div>
                        <span className="progress-text">
                          {status === 'generateurl' && 'Generating upload URLs...'}
                          {status === 'uploading' && `Uploading: ${Math.round(getUploadProgress())}%`}
                          {status === 'loading' && 'Finalizing...'}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Generate Embeddings (Optional)</label>
            <div className="embedding-options">
              {embeddingModels.map((model, index) => (
                <label key={index} className="embedding-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedEmbeddings.some(m => m.displayName === model.displayName)}
                    onChange={() => toggleEmbedding(model)}
                    disabled={isUploading}
                  />
                  <span>{model.displayName}</span>
                </label>
              ))}
            </div>
            {selectedEmbeddings.length > 0 && (
              <p className="help-text">
                {selectedEmbeddings.length} embedding{selectedEmbeddings.length > 1 ? 's' : ''} will be generated after upload
              </p>
            )}
            
            {/* Nova MME Configuration */}
            {selectedEmbeddings.some(m => m.displayName.includes('Nova')) && (
              <div className="nova-mme-config">
                <h4>Nova MME Configuration</h4>
                <div className="config-row">
                  <div className="config-field">
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
                      disabled={isUploading}
                    />
                    <p className="help-text-small">Duration of each video segment (1-600 seconds)</p>
                  </div>
                  
                  <div className="config-field">
                    <label htmlFor="embedMode">Embedding Mode</label>
                    <select
                      id="embedMode"
                      value={novaMmeConfig.embedMode}
                      onChange={(e) => setNovaMmeConfig(prev => ({
                        ...prev,
                        embedMode: e.target.value
                      }))}
                      disabled={isUploading}
                    >
                      <option value="AUDIO_VIDEO_COMBINED">Audio + Video Combined</option>
                      <option value="AUDIO_VIDEO_SEPARATE">Audio + Video Separate</option>
                      <option value="VIDEO_ONLY">Video Only</option>
                      <option value="AUDIO_ONLY">Audio Only</option>
                    </select>
                    <p className="help-text-small">How to process audio and video streams</p>
                  </div>
                  
                  <div className="config-field">
                    <label htmlFor="embeddingDim">Embedding Dimension</label>
                    <select
                      id="embeddingDim"
                      value={novaMmeConfig.embeddingDim}
                      onChange={(e) => setNovaMmeConfig(prev => ({
                        ...prev,
                        embeddingDim: parseInt(e.target.value)
                      }))}
                      disabled={isUploading}
                    >
                      <option value={3072}>3072</option>
                      <option value={1024}>1024</option>
                      <option value={384}>384</option>
                      <option value={256}>256</option>
                    </select>
                    <p className="help-text-small">Dimension of the embedding vectors</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* TwelveLabs Configuration */}
            {selectedEmbeddings.some(m => m.displayName.toLowerCase().includes('twelve')) && (
              <div className="twelvelabs-config">
                <h4>TwelveLabs Configuration</h4>
                
                <div className="config-section">
                  <label>Segmentation Method</label>
                  <div className="config-row">
                    <div className="config-field">
                      <select
                        value={twelveLabsConfig.Segmentation.Method}
                        onChange={(e) => setTwelveLabsConfig(prev => ({
                          ...prev,
                          Segmentation: {
                            ...prev.Segmentation,
                            Method: e.target.value
                          }
                        }))}
                        disabled={isUploading}
                      >
                        <option value="dynamic">Dynamic</option>
                        <option value="fixed">Fixed</option>
                      </select>
                    </div>
                    
                    {twelveLabsConfig.Segmentation.Method === 'dynamic' && (
                      <div className="config-field">
                        <label htmlFor="minDurationSec">Min Duration (seconds)</label>
                        <input
                          type="number"
                          id="minDurationSec"
                          min="1"
                          max="60"
                          value={twelveLabsConfig.Segmentation.Dynamic.MinDurationSec}
                          onChange={(e) => setTwelveLabsConfig(prev => ({
                            ...prev,
                            Segmentation: {
                              ...prev.Segmentation,
                              Dynamic: {
                                MinDurationSec: parseInt(e.target.value) || 4
                              }
                            }
                          }))}
                          disabled={isUploading}
                        />
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="config-section">
                  <label>Embedding Scope</label>
                  <div className="checkbox-group">
                    {['clip', 'video'].map(scope => (
                      <label key={scope} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={twelveLabsConfig.EmbeddingScope.includes(scope)}
                          onChange={(e) => {
                            setTwelveLabsConfig(prev => ({
                              ...prev,
                              EmbeddingScope: e.target.checked
                                ? [...prev.EmbeddingScope, scope]
                                : prev.EmbeddingScope.filter(s => s !== scope)
                            }))
                          }}
                          disabled={isUploading}
                        />
                        <span>{scope.charAt(0).toUpperCase() + scope.slice(1)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                <div className="config-section">
                  <label>Embedding Options</label>
                  <div className="checkbox-group">
                    {['visual', 'audio', 'transcription'].map(option => (
                      <label key={option} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={twelveLabsConfig.EmbeddingOption.includes(option)}
                          onChange={(e) => {
                            setTwelveLabsConfig(prev => ({
                              ...prev,
                              EmbeddingOption: e.target.checked
                                ? [...prev.EmbeddingOption, option]
                                : prev.EmbeddingOption.filter(o => o !== option)
                            }))
                          }}
                          disabled={isUploading}
                        />
                        <span>{option.charAt(0).toUpperCase() + option.slice(1)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={onCancel}
              disabled={isUploading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary"
              disabled={isUploading || uploadFiles.length === 0}
            >
              {isUploading ? 'Uploading...' : 'Upload Video'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default VideoUpload
