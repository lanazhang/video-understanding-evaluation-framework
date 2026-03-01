import { useState } from 'react'
import './GroundTruthReview.css'
import { FetchPost } from '../../utils/apiHelper'

function GroundTruthReview({ video, allSearches, allResults, onPrevious, onSave, currentUser, existingGroundTruth = null }) {
  const [groundTruthName, setGroundTruthName] = useState(existingGroundTruth?.Name || existingGroundTruth?.taskName || '')
  const [groundTruthDescription, setGroundTruthDescription] = useState(existingGroundTruth?.Description || existingGroundTruth?.description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)



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
      let labels = allResults.map(result => ({
        StartTs: parseFloat(parseFloat(result.StartSec || 0).toFixed(3)),
        EndTs: parseFloat(parseFloat(result.EndSec || 0).toFixed(3)),
        Score: parseFloat(result.Distance || 0),
        Label: result.query,
        ReviewResult: result.reviewStatus || 'unreviewed'
      }))

      // Merge overlapping time ranges
      labels = mergeOverlappingLabels(labels)

      // Get unique task IDs and model IDs from all searches
      const searchQueries = allSearches.map(s => s.query).join(', ')
      const uniqueModels = [...new Set(allSearches.map(s => s.taskName))].join(', ')
      const uniqueModelIds = [...new Set(allSearches.map(s => s.modelId).filter(Boolean))].join(', ')

      const username = currentUser?.username || currentUser?.signInDetails?.loginId || 'user'
      
      // Build description with model IDs
      let defaultDescription = `Generated from ${allSearches.length} search ${allSearches.length === 1 ? 'query' : 'queries'}: ${searchQueries}. `
      defaultDescription += `Models: ${uniqueModels}. `
      if (uniqueModelIds) {
        defaultDescription += `Model IDs: ${uniqueModelIds}. `
      }
      defaultDescription += `Total ${labels.length} segments found.`
      
      const payload = {
        Id: groundTruthId,
        Name: groundTruthName,
        Description: groundTruthDescription || defaultDescription,
        CreatedBy: existingGroundTruth?.CreatedBy || existingGroundTruth?.createdBy || username,
        VideoId: video.Id || video.id,
        Labels: labels
      }

      const data = await FetchPost('/gt/upsert-ground-truth', payload, 'EvalService')

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

  // Function to merge overlapping time ranges
  const mergeOverlappingLabels = (labels) => {
    if (labels.length === 0) return labels

    // Sort labels by start time
    const sorted = [...labels].sort((a, b) => a.StartTs - b.StartTs)
    const merged = []

    let current = { ...sorted[0] }

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i]

      // Check if current and next overlap
      if (next.StartTs <= current.EndTs) {
        // Merge: extend current to cover next
        current.EndTs = Math.max(current.EndTs, next.EndTs)
        
        // Combine labels
        if (current.Label && next.Label && current.Label !== next.Label) {
          current.Label = `${current.Label}, ${next.Label}`
        } else if (!current.Label && next.Label) {
          current.Label = next.Label
        }
        
        // Take the better score (lower distance is better)
        current.Score = Math.min(current.Score, next.Score)
        
        // If any segment is reviewed as true_positive, keep that status
        if (next.ReviewResult === 'true_positive' || current.ReviewResult === 'true_positive') {
          current.ReviewResult = 'true_positive'
        } else if (next.ReviewResult === 'reviewed' || current.ReviewResult === 'reviewed') {
          current.ReviewResult = 'reviewed'
        }
      } else {
        // No overlap, push current and start new
        merged.push(current)
        current = { ...next }
      }
    }

    // Push the last segment
    merged.push(current)

    return merged
  }

  return (
    <div className="ground-truth-review-simple">
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
            rows="4"
          />
        </div>

        <div className="summary-section">
          <h4>Summary</h4>
          <div className="summary-stats">
            <div className="stat-item">
              <span className="stat-label">Video:</span>
              <span className="stat-value">{video.Name}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Labels:</span>
              <span className="stat-value">{allResults.length}</span>
            </div>
            {allSearches.length > 0 && (
              <div className="stat-item">
                <span className="stat-label">Searches Performed:</span>
                <span className="stat-value">{allSearches.length}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">{error}</div>
      )}

      <div className="review-actions">
        <button 
          className="btn-previous"
          onClick={onPrevious}
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

export default GroundTruthReview
