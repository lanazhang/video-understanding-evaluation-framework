import { useState, useRef } from 'react'
import './GroundTruthReview.css'
import { FetchPost } from '../../utils/apiHelper'

function GroundTruthReview({ video, allSearches, allResults, onPrevious, onUpdate, onSave, currentUser, isReadOnly = false, existingGroundTruth = null }) {
  const [groundTruthName, setGroundTruthName] = useState(existingGroundTruth?.Name || existingGroundTruth?.taskName || '')
  const [groundTruthDescription, setGroundTruthDescription] = useState(existingGroundTruth?.Description || existingGroundTruth?.description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('unreviewed')
  const [editingSegment, setEditingSegment] = useState(null)
  const [selectedSegments, setSelectedSegments] = useState([])
  // Sort results by start time ascending and preserve review status
  const [segments, setSegments] = useState([...allResults].sort((a, b) => 
    parseFloat(a.StartSec || 0) - parseFloat(b.StartSec || 0)
  ).map(seg => ({ ...seg, reviewStatus: seg.reviewStatus || 'unreviewed' })))
  
  const videoPlayerRef = useRef(null)

  const unreviewedSegments = segments.filter(seg => seg.reviewStatus === 'unreviewed')
  const reviewedSegments = segments.filter(seg => seg.reviewStatus === 'reviewed')

  const handleSelectSegment = (segment) => {
    if (selectedSegments.includes(segment)) {
      setSelectedSegments(selectedSegments.filter(s => s !== segment))
    } else {
      setSelectedSegments([...selectedSegments, segment])
    }
  }

  const handleSelectAll = () => {
    const currentList = activeTab === 'unreviewed' ? unreviewedSegments : reviewedSegments
    if (selectedSegments.length === currentList.length) {
      setSelectedSegments([])
    } else {
      setSelectedSegments([...currentList])
    }
  }

  const handleBulkConfirm = () => {
    const updatedSegments = segments.map(seg => 
      selectedSegments.includes(seg) ? { ...seg, reviewStatus: 'reviewed' } : seg
    )
    setSegments(updatedSegments)
    setSelectedSegments([])
    
    // Switch to reviewed tab if all items are now reviewed
    const remainingUnreviewed = updatedSegments.filter(seg => seg.reviewStatus === 'unreviewed')
    if (remainingUnreviewed.length === 0) {
      setActiveTab('reviewed')
    }
  }

  const handleBulkDecline = () => {
    if (window.confirm(`Are you sure you want to remove ${selectedSegments.length} selected segment${selectedSegments.length > 1 ? 's' : ''}?`)) {
      setSegments(segments.filter(seg => !selectedSegments.includes(seg)))
      setSelectedSegments([])
    }
  }

  const handleConfirmSegment = (index) => {
    const actualIndex = segments.findIndex((seg, i) => 
      seg.reviewStatus === 'unreviewed' && 
      unreviewedSegments.indexOf(seg) === index
    )
    
    const updatedSegments = segments.map((seg, i) => 
      i === actualIndex ? { ...seg, reviewStatus: 'reviewed' } : seg
    )
    setSegments(updatedSegments)
    setEditingSegment(null)
    
    // Switch to reviewed tab if all items are now reviewed
    const remainingUnreviewed = updatedSegments.filter(seg => seg.reviewStatus === 'unreviewed')
    if (remainingUnreviewed.length === 0) {
      setActiveTab('reviewed')
    }
  }

  const handleDeclineSegment = (index) => {
    const segmentToRemove = activeTab === 'unreviewed' 
      ? unreviewedSegments[index] 
      : reviewedSegments[index]
    
    setSegments(segments.filter(seg => seg !== segmentToRemove))
    setSelectedSegments(selectedSegments.filter(s => s !== segmentToRemove))
    setEditingSegment(null)
  }

  const handleEditSegment = (segment) => {
    setEditingSegment(segment)
  }

  const handleSaveEdit = (originalSegment, updates) => {
    setSegments(segments.map(seg => 
      seg === originalSegment ? { ...seg, ...updates } : seg
    ))
    setEditingSegment(null)
  }

  const handleCancelEdit = () => {
    setEditingSegment(null)
  }

  const handleTimeRangeClick = (startSec, endSec) => {
    if (videoPlayerRef.current) {
      const videoEl = videoPlayerRef.current
      const endTime = parseFloat(endSec || 0)
      
      videoEl.currentTime = parseFloat(startSec || 0)
      videoEl.muted = true
      
      const existingListener = videoEl._stopAtEndListener
      if (existingListener) {
        videoEl.removeEventListener('timeupdate', existingListener)
      }
      
      const stopAtEndListener = () => {
        if (videoEl.currentTime >= endTime) {
          videoEl.pause()
          videoEl.removeEventListener('timeupdate', stopAtEndListener)
          delete videoEl._stopAtEndListener
        }
      }
      
      videoEl._stopAtEndListener = stopAtEndListener
      videoEl.addEventListener('timeupdate', stopAtEndListener)
      
      videoEl.play().catch(err => {
        console.log('Auto-play prevented:', err)
      })
    }
  }

  const handleSave = async () => {
    if (!groundTruthName.trim()) {
      setError('Please enter a name for the ground truth')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const groundTruthId = existingGroundTruth?.Id || existingGroundTruth?.id || crypto.randomUUID()

      // Combine all results into labels
      const labels = segments.map(result => ({
        StartTs: parseFloat(parseFloat(result.StartSec || 0).toFixed(3)),
        EndTs: parseFloat(parseFloat(result.EndSec || 0).toFixed(3)),
        Score: parseFloat(result.Distance || 0),
        Label: result.query,
        ReviewResult: result.reviewStatus || 'unreviewed'
      }))

      // Get unique task IDs from all searches
      const searchQueries = allSearches.map(s => s.query).join(', ')

      const username = currentUser?.username || currentUser?.signInDetails?.loginId || 'user'
      const payload = {
        Id: groundTruthId,
        Name: groundTruthName,
        Description: groundTruthDescription || `Generated from ${allSearches.length} search ${allSearches.length === 1 ? 'query' : 'queries'}: ${searchQueries}. Total ${labels.length} segments found.`,
        CreatedBy: existingGroundTruth?.CreatedBy || existingGroundTruth?.createdBy || username,
        VideoId: video.Id || video.id,
        Labels: labels
      }

      const data = await FetchPost('/video/upsert-ground-truth', payload, 'EvalService')

      console.log('Ground truth save response:', data)

      if (data.statusCode === 200 || data.message) {
        if (onSave) {
          onSave()
        }
      } else {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        const errorMessage = responseBody?.error || data.error || data.body || 'Failed to save ground truth'
        setError('Failed to save ground truth: ' + errorMessage)
      }
    } catch (err) {
      console.error('Error saving ground truth:', err)
      setError('Error saving ground truth: ' + err.message)
    } finally {
      setSaving(false)
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

  return (
    <div className="ground-truth-review">
      <div className="review-content">
        {/* Left: Video and Form */}
        <div className="review-left">
          <div className="video-section">
            <h3>Video Preview</h3>
            <video 
              ref={videoPlayerRef}
              src={video.video_url || `https://${video.S3Bucket}.s3.us-east-1.amazonaws.com/${video.S3KeyVideo}`}
              controls
              muted
              className="review-video-player"
            >
              Your browser does not support the video tag.
            </video>
            <div className="video-info">
              <p className="video-name">{video.Name}</p>
            </div>
          </div>

          <div className="form-section">
            <h3>Ground Truth Details</h3>
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={groundTruthName}
                onChange={(e) => setGroundTruthName(e.target.value)}
                placeholder="Enter ground truth name..."
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={groundTruthDescription}
                onChange={(e) => setGroundTruthDescription(e.target.value)}
                placeholder="Optional description..."
                className="form-textarea"
                rows="3"
              />
            </div>
          </div>

          <div className="search-summary">
            <h4>Search Summary</h4>
            <div className="summary-stats">
              <div className="stat-item">
                <span className="stat-label">Total Searches:</span>
                <span className="stat-value">{allSearches.length}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total Segments:</span>
                <span className="stat-value">{segments.length}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Unique Models:</span>
                <span className="stat-value">{new Set(allSearches.map(s => s.taskName)).size}</span>
              </div>
            </div>
            <div className="search-list">
              {allSearches.map((search, index) => (
                <div key={search.id} className="search-summary-item">
                  <span className="search-number">#{index + 1}</span>
                  <span className="search-query">"{search.query}"</span>
                  <span className="search-model">{search.taskName}</span>
                  <span className="search-count">{search.resultCount} results</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Results List */}
        <div className="review-right">
          <div className="review-header">
            <h3>All Segments ({segments.length})</h3>
            <div className="review-tabs">
              <button 
                className={`tab-button ${activeTab === 'unreviewed' ? 'active' : ''}`}
                onClick={() => { setActiveTab('unreviewed'); setSelectedSegments([]) }}
              >
                Unreviewed ({unreviewedSegments.length})
              </button>
              <button 
                className={`tab-button ${activeTab === 'reviewed' ? 'active' : ''}`}
                onClick={() => { setActiveTab('reviewed'); setSelectedSegments([]) }}
              >
                Reviewed ({reviewedSegments.length})
              </button>
            </div>
          </div>

          {/* Bulk Actions - Only show for unreviewed tab */}
          {!isReadOnly && activeTab === 'unreviewed' && unreviewedSegments.length > 0 && (
            <div className="bulk-actions-bar">
              <label className="select-all-checkbox">
                <input
                  type="checkbox"
                  checked={selectedSegments.length === unreviewedSegments.length}
                  onChange={handleSelectAll}
                />
                <span>Select All ({selectedSegments.length} selected)</span>
              </label>
              {selectedSegments.length > 0 && (
                <div className="bulk-action-buttons">
                  <button 
                    className="btn-bulk-confirm"
                    onClick={handleBulkConfirm}
                    title="Confirm selected segments"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Confirm ({selectedSegments.length})
                  </button>
                  <button 
                    className="btn-bulk-decline"
                    onClick={handleBulkDecline}
                    title="Remove selected segments"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Remove ({selectedSegments.length})
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="review-results-list">
            {activeTab === 'unreviewed' && unreviewedSegments.map((result, index) => (
              <SegmentItem
                key={`unreviewed-${index}`}
                result={result}
                index={segments.indexOf(result)}
                isEditing={editingSegment === result}
                isSelected={selectedSegments.includes(result)}
                onSelect={() => handleSelectSegment(result)}
                onEdit={() => handleEditSegment(result)}
                onSaveEdit={(updates) => handleSaveEdit(result, updates)}
                onCancelEdit={handleCancelEdit}
                onTimeClick={handleTimeRangeClick}
                onConfirm={() => handleConfirmSegment(index)}
                onDecline={() => handleDeclineSegment(index)}
                formatDuration={formatDuration}
                showConfirm={true}
                isReadOnly={isReadOnly}
                videoPlayerRef={videoPlayerRef}
              />
            ))}

            {activeTab === 'reviewed' && reviewedSegments.map((result, index) => (
              <SegmentItem
                key={`reviewed-${index}`}
                result={result}
                index={segments.indexOf(result)}
                isEditing={false}
                isSelected={false}
                onSelect={() => {}}
                onEdit={() => {}}
                onSaveEdit={() => {}}
                onCancelEdit={() => {}}
                onTimeClick={handleTimeRangeClick}
                onDecline={() => {}}
                formatDuration={formatDuration}
                showConfirm={false}
                isReviewed={true}
                isReadOnly={true}
                videoPlayerRef={videoPlayerRef}
              />
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">{error}</div>
      )}

      <div className="review-actions">
        <button 
          className="btn-previous"
          onClick={() => {
            // Update parent with current segments state before going back
            if (onUpdate) {
              // Convert segments back to allResults format
              const updatedResults = segments.map(seg => ({
                ...seg,
                // Preserve all original properties
              }))
              onUpdate(allSearches, updatedResults)
            }
            if (onPrevious) {
              onPrevious()
            }
          }}
          disabled={saving}
        >
          ← Previous
        </button>
        <button 
          className="btn-save"
          onClick={handleSave}
          disabled={saving || !groundTruthName.trim()}
        >
          {saving ? 'Saving...' : 'Save Ground Truth'}
        </button>
      </div>
    </div>
  )
}

function SegmentItem({ result, index, isEditing, isSelected, onSelect, onEdit, onSaveEdit, onCancelEdit, onTimeClick, onConfirm, onDecline, formatDuration, showConfirm, isReviewed, isReadOnly, videoPlayerRef }) {
  const [editStartSec, setEditStartSec] = useState(parseFloat(result.StartSec || 0).toFixed(2))
  const [editEndSec, setEditEndSec] = useState(parseFloat(result.EndSec || 0).toFixed(2))
  const [editQuery, setEditQuery] = useState(result.query)
  const [capturingField, setCapturingField] = useState(null)

  const handleSave = () => {
    onSaveEdit({
      StartSec: parseFloat(editStartSec),
      EndSec: parseFloat(editEndSec),
      query: editQuery
    })
    setCapturingField(null)
  }

  const handleCaptureStart = () => {
    if (videoPlayerRef.current) {
      const currentTime = videoPlayerRef.current.currentTime
      setEditStartSec(currentTime.toFixed(2))
      setCapturingField(null)
    }
  }

  const handleCaptureEnd = () => {
    if (videoPlayerRef.current) {
      const currentTime = videoPlayerRef.current.currentTime
      setEditEndSec(currentTime.toFixed(2))
      setCapturingField(null)
    }
  }

  const handleCancel = () => {
    setCapturingField(null)
    onCancelEdit()
  }

  if (isEditing) {
    return (
      <div className={`review-result-item editing ${isReviewed ? 'reviewed' : ''}`}>
        <span className="result-rank">#{index + 1}</span>
        <div className="edit-time-inputs">
          <div className="time-input-group">
            <input
              type="number"
              step="0.01"
              value={editStartSec}
              onChange={(e) => setEditStartSec(e.target.value)}
              className={`edit-time-input ${capturingField === 'start' ? 'capturing' : ''}`}
              placeholder="Start"
            />
            <button
              className="btn-capture-time"
              onClick={handleCaptureStart}
              title="Capture current video time"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 1.16667V7L10.5 8.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>
          </div>
          <span>-</span>
          <div className="time-input-group">
            <input
              type="number"
              step="0.01"
              value={editEndSec}
              onChange={(e) => setEditEndSec(e.target.value)}
              className={`edit-time-input ${capturingField === 'end' ? 'capturing' : ''}`}
              placeholder="End"
            />
            <button
              className="btn-capture-time"
              onClick={handleCaptureEnd}
              title="Capture current video time"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 1.16667V7L10.5 8.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>
          </div>
        </div>
        <input
          type="text"
          value={editQuery}
          onChange={(e) => setEditQuery(e.target.value)}
          className="edit-query-input"
          placeholder="Label"
        />
        <span className="result-duration">
          {formatDuration(parseFloat(editEndSec || 0) - parseFloat(editStartSec || 0))}
        </span>
        <span className="result-distance">
          {result.Distance?.toFixed(4) || 'N/A'}
        </span>
        <div className="segment-actions">
          <button 
            className="btn-save-edit"
            onClick={handleSave}
            title="Save changes"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button 
            className="btn-cancel-edit"
            onClick={handleCancel}
            title="Cancel"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`review-result-item ${isReviewed ? 'reviewed' : ''} ${isSelected ? 'selected' : ''}`}>
      {!isReadOnly && !isReviewed && (
        <input
          type="checkbox"
          className="segment-checkbox"
          checked={isSelected}
          onChange={onSelect}
        />
      )}
      <span className="result-rank">#{index + 1}</span>
      <button 
        className="result-time-link"
        onClick={() => onTimeClick(result.StartSec, result.EndSec)}
      >
        {parseFloat(result.StartSec || 0).toFixed(2)}s - {parseFloat(result.EndSec || 0).toFixed(2)}s
      </button>
      <span className="result-query-tag">"{result.query}"</span>
      <span className="result-duration">
        {formatDuration(parseFloat(result.EndSec || 0) - parseFloat(result.StartSec || 0))}
      </span>
      <span className="result-distance">
        {result.Distance?.toFixed(4) || 'N/A'}
      </span>
      {!isReadOnly && !isReviewed && (
        <div className="segment-actions">
          {showConfirm && (
            <button 
              className="btn-confirm-segment"
              onClick={onConfirm}
              title="Confirm segment"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          <button 
            className="btn-decline-segment"
            onClick={onDecline}
            title="Decline segment"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button 
            className="btn-edit-segment"
            onClick={onEdit}
            title="Edit segment"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.3333 2.00004C11.5084 1.82494 11.716 1.68605 11.9441 1.59129C12.1722 1.49653 12.4165 1.44775 12.6633 1.44775C12.9101 1.44775 13.1544 1.49653 13.3825 1.59129C13.6106 1.68605 13.8183 1.82494 13.9933 2.00004C14.1684 2.17513 14.3073 2.38282 14.4021 2.61091C14.4968 2.839 14.5456 3.08334 14.5456 3.33004C14.5456 3.57674 14.4968 3.82107 14.4021 4.04916C14.3073 4.27725 14.1684 4.48494 13.9933 4.66004L5.00001 13.6534L1.33334 14.6667L2.34668 11L11.3333 2.00004Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

export default GroundTruthReview
