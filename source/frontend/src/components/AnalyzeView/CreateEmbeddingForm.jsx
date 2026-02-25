import { useState, useEffect } from 'react'
import './CreateEmbeddingForm.css'
import { modelGroups } from '../../static/modelConfig'

function CreateEmbeddingForm({ video, analyzeTasks, onCreate }) {
  const [createParams, setCreateParams] = useState({
    modelId: 'amazon.nova-2-multimodal-embeddings-v1:0',
    durationS: 5,
    embedMode: 'AUDIO_VIDEO_COMBINED',
    embeddingDim: 1024,
    segmentationMethod: 'dynamic',
    minDurationSec: 4,
    embeddingScope: ['clip'],
    embeddingOption: ['visual', 'audio', 'transcription'],
    description: ''
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  const selectedModel = modelGroups
    .find(group => group.groupName === 'Multimodal Embedding')
    ?.models.find(model => model.modelId === createParams.modelId)

  useEffect(() => {
    if (selectedModel?.dims && selectedModel.dims.length > 0) {
      if (!selectedModel.dims.includes(parseInt(createParams.embeddingDim))) {
        setCreateParams(prev => ({ ...prev, embeddingDim: selectedModel.dims[0] }))
      }
    }
  }, [selectedModel, createParams.embeddingDim])

  const handleCreate = async () => {
    setCreating(true)
    setCreateError(null)

    try {
      await onCreate(createParams, selectedModel, analyzeTasks)
      
      // Reset form
      if (selectedModel?.parameterType === 'nova-mme') {
        setCreateParams(prev => ({
          ...prev,
          durationS: 5,
          embedMode: 'AUDIO_VIDEO_COMBINED',
          embeddingDim: 1024,
          description: ''
        }))
      } else if (selectedModel?.parameterType === 'twelvelabs') {
        setCreateParams(prev => ({
          ...prev,
          segmentationMethod: 'dynamic',
          minDurationSec: 4,
          embeddingScope: ['clip'],
          embeddingOption: ['visual', 'audio', 'transcription'],
          description: ''
        }))
      }
      setCreateError(null)
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="create-embedding-section">
      <h3>Create New Embedding Index</h3>
      
      {createError && (
        <div className="alert alert-error">{createError}</div>
      )}
      
      <div className="create-embedding-form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="modelId">Model</label>
            <select
              id="modelId"
              value={createParams.modelId}
              onChange={(e) => setCreateParams(prev => ({ ...prev, modelId: e.target.value }))}
            >
              {modelGroups
                .find(group => group.groupName === 'Multimodal Embedding')
                ?.models.map((model, index) => (
                  <option 
                    key={model.modelId || `model-${index}`} 
                    value={model.modelId}
                    disabled={!model.modelId}
                  >
                    {model.displayName}{model.modelId ? ` (${model.modelId})` : ' (Not Available)'}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {selectedModel?.parameterType === 'nova-mme' && (
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="durationS">Segment Duration (s)</label>
              <input
                type="number"
                id="durationS"
                min="1"
                max="60"
                value={createParams.durationS}
                onChange={(e) => setCreateParams(prev => ({ ...prev, durationS: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label htmlFor="embedMode">Embedding Mode</label>
              <select
                id="embedMode"
                value={createParams.embedMode}
                onChange={(e) => setCreateParams(prev => ({ ...prev, embedMode: e.target.value }))}
              >
                <option value="AUDIO_VIDEO_COMBINED">Audio + Video</option>
                <option value="VIDEO_ONLY">Video Only</option>
                <option value="AUDIO_ONLY">Audio Only</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="embeddingDim">Dimension</label>
              <select
                id="embeddingDim"
                value={createParams.embeddingDim}
                onChange={(e) => setCreateParams(prev => ({ ...prev, embeddingDim: e.target.value }))}
              >
                {selectedModel?.dims?.map(dim => (
                  <option key={dim} value={dim}>{dim}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="description">Description (Optional)</label>
              <input
                type="text"
                id="description"
                value={createParams.description}
                onChange={(e) => setCreateParams(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Task description..."
              />
            </div>

            <div className="form-group form-group-button">
              <label>&nbsp;</label>
              <button 
                className="btn-create-embedding"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Create Embedding'}
              </button>
            </div>
          </div>
        )}

        {selectedModel?.parameterType === 'twelvelabs' && (
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="segmentationMethod">Segmentation Method</label>
              <select
                id="segmentationMethod"
                value={createParams.segmentationMethod}
                onChange={(e) => setCreateParams(prev => ({ ...prev, segmentationMethod: e.target.value }))}
              >
                <option value="dynamic">Dynamic</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="minDurationSec">Min Duration (s)</label>
              <input
                type="number"
                id="minDurationSec"
                min="1"
                max="60"
                value={createParams.minDurationSec}
                onChange={(e) => setCreateParams(prev => ({ ...prev, minDurationSec: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label htmlFor="embeddingScope">Embedding Scope</label>
              <select
                id="embeddingScope"
                multiple
                value={createParams.embeddingScope}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value)
                  setCreateParams(prev => ({ ...prev, embeddingScope: selected }))
                }}
              >
                <option value="clip">Clip</option>
                <option value="asset">Asset</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="embeddingOption">Embedding Options</label>
              <select
                id="embeddingOption"
                multiple
                value={createParams.embeddingOption}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value)
                  setCreateParams(prev => ({ ...prev, embeddingOption: selected }))
                }}
              >
                <option value="visual">Visual</option>
                <option value="audio">Audio</option>
                <option value="transcription">Transcription</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="description">Description (Optional)</label>
              <input
                type="text"
                id="description"
                value={createParams.description}
                onChange={(e) => setCreateParams(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Task description..."
              />
            </div>

            <div className="form-group form-group-button">
              <label>&nbsp;</label>
              <button 
                className="btn-create-embedding"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Create Embedding'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CreateEmbeddingForm
