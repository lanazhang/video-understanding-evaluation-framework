import { useState, useEffect } from 'react'
import './VideoManagement.css'
import videosData from '../static/videos.json'

function VideoManagement() {
  const [videos, setVideos] = useState([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadForm, setUploadForm] = useState({
    files: [],
    name: '',
    label: '',
    group: '',
  })

  useEffect(() => {
    fetchVideos()
  }, [])

  const fetchVideos = async () => {
    // TODO: Replace with actual API call
    // const response = await fetch('/api/videos')
    // const data = await response.json()
    // setVideos(data)
    
    // Load from JSON file
    setVideos(videosData)
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    setUploadForm(prev => ({ ...prev, files }))
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setUploadForm(prev => ({ ...prev, [name]: value }))
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    // TODO: Implement API call to upload videos
    console.log('Uploading videos:', uploadForm)
    
    // Mock upload
    const newVideos = uploadForm.files.map((file, index) => ({
      id: Date.now() + index,
      name: uploadForm.name || file.name,
      label: uploadForm.label,
      group: uploadForm.group,
      uploadDate: new Date().toISOString().split('T')[0],
    }))
    
    setVideos(prev => [...prev, ...newVideos])
    setShowUploadModal(false)
    setUploadForm({ files: [], name: '', label: '', group: '' })
  }

  const handleDelete = async (id) => {
    // TODO: Implement API call to delete video
    console.log('Deleting video:', id)
    setVideos(prev => prev.filter(v => v.id !== id))
  }

  // Filter videos based on search query
  const filteredVideos = videos.filter(video => {
    const query = searchQuery.toLowerCase()
    const name = video.name?.toLowerCase() || ''
    const label = video.label?.toLowerCase() || ''
    const group = video.group?.toLowerCase() || ''
    
    return name.includes(query) || 
           label.includes(query) || 
           group.includes(query)
  })

  return (
    <div className="video-management">
      <div className="content-header">
        <h1>Video Inventory</h1>
        <button className="btn-create" onClick={() => setShowUploadModal(true)}>
          + Upload Videos
        </button>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search videos..."
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

      <div className="video-table">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Duration</th>
              <th>Label</th>
              <th>Group</th>
              <th>Upload Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredVideos.length === 0 ? (
              <tr>
                <td colSpan="6" className="no-results-cell">
                  {searchQuery ? `No videos found matching "${searchQuery}"` : 'No videos uploaded yet'}
                </td>
              </tr>
            ) : (
              filteredVideos.map(video => (
              <tr key={video.id}>
                <td>{video.name}</td>
                <td>{video.duration}</td>
                <td>{video.label}</td>
                <td>{video.group}</td>
                <td>{video.uploadDate}</td>
                <td>
                  <button className="btn-delete" onClick={() => handleDelete(video.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))
            )}
          </tbody>
        </table>
      </div>

      {showUploadModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Upload Videos</h2>
              <button className="close-button" onClick={() => setShowUploadModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleUpload}>
              <div className="form-group">
                <label htmlFor="files">Select Videos *</label>
                <input
                  type="file"
                  id="files"
                  accept="video/*"
                  multiple
                  onChange={handleFileSelect}
                  required
                />
                {uploadForm.files.length > 0 && (
                  <p className="file-count">{uploadForm.files.length} file(s) selected</p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={uploadForm.name}
                  onChange={handleInputChange}
                  placeholder="Optional: Override filename"
                />
              </div>

              <div className="form-group">
                <label htmlFor="label">Label</label>
                <input
                  type="text"
                  id="label"
                  name="label"
                  value={uploadForm.label}
                  onChange={handleInputChange}
                  placeholder="e.g., Action, Scene, etc."
                />
              </div>

              <div className="form-group">
                <label htmlFor="group">Group</label>
                <input
                  type="text"
                  id="group"
                  name="group"
                  value={uploadForm.group}
                  onChange={handleInputChange}
                  placeholder="e.g., Group A, Training Set, etc."
                />
              </div>

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowUploadModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoManagement
