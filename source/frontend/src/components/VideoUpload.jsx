import { useState, useRef } from 'react'
import './VideoUpload.css'
import { FetchPost } from '../utils/apiHelper'
import { fetchUserAttributes } from 'aws-amplify/auth'
import { modelGroups } from '../static/modelConfig'

function VideoUpload({ onSuccess, onCancel }) {
  const [uploadFiles, setUploadFiles] = useState([])
  const [taskName, setTaskName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedEmbeddings, setSelectedEmbeddings] = useState([])
  const [alert, setAlert] = useState(null)
  const [status, setStatus] = useState(null) // null, generateurl, uploading, loading
  const [numChunks, setNumChunks] = useState(null)
  const [uploadedChunks, setUploadedChunks] = useState(0)
  const [currentUploadingFileName, setCurrentUploadingFileName] = useState(null)
  const fileInputRef = useRef(null)

  const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB chunks

  // Get only Multimodal Embedding models
  const embeddingModels = modelGroups.find(g => g.groupName === 'Multimodal Embedding')?.models || []

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
    setSelectedEmbeddings([])
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

      if (data.statusCode !== 200) {
        setStatus(null)
        setAlert(data.body || 'Failed to generate presigned URLs')
        setCurrentUploadingFileName(null)
        return
      }

      if (data.body) {
        await uploadFile({
          taskId: data.body.TaskId,
          uploadS3Url: data.body.UploadUrl,
          uploadedS3Bucket: data.body.S3Bucket,
          uploadedS3KeyVideo: data.body.S3Key,
          uploadId: data.body.UploadId,
          uploadPartUrls: data.body.UploadPartUrls,
          numChunks: chunks
        }, file)
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

      if (completeData.statusCode !== 200) {
        setAlert(completeData.body || 'Failed to complete upload')
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

    const payload = {
      id: urlResp.taskId,
      name: taskName,
      description: description,
      s3_bucket: urlResp.uploadedS3Bucket,
      s3_key_video: urlResp.uploadedS3KeyVideo,
      uploaded_by: uploadedBy
    }

    try {
      const data = await FetchPost('/video/add-video', payload, 'EvalService')

      if (data.statusCode !== 200) {
        const errorMessage = typeof data.body === 'object' && data.body.error 
          ? data.body.error 
          : data.body
        setStatus(null)
        setAlert(errorMessage)
        setCurrentUploadingFileName(null)
      } else {
        // Trigger embedding generation if any models are selected
        if (selectedEmbeddings.length > 0) {
          await triggerEmbeddingGeneration(urlResp.taskId, uploadedBy)
        }
        
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

  const triggerEmbeddingGeneration = async (videoId, uploadedBy) => {
    console.log(`Triggering embedding generation for video: ${videoId}`)
    
    for (const model of selectedEmbeddings) {
      if (!model.api) {
        console.warn(`No API endpoint configured for ${model.displayName}`)
        continue
      }

      try {
        const payload = {
          video_id: videoId,
          model_id: model.modelId,
          requested_by: uploadedBy
        }

        console.log(`Calling ${model.api} for ${model.displayName}`)
        const data = await FetchPost(model.api, payload, 'EvalService')
        
        if (data.statusCode === 200) {
          console.log(`Successfully started embedding generation: ${model.displayName}`)
        } else {
          console.error(`Failed to start embedding for ${model.displayName}:`, data.body)
        }
      } catch (err) {
        console.error(`Error starting embedding for ${model.displayName}:`, err)
      }
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
