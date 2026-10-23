import './CreateEmbeddingForm.css'
import { modelGroups } from '../../static/modelConfig'
import EmbeddingParamFields from '../EmbeddingParamFields'
import { defaultParams } from '../../utils/embeddingParams'

function CreateEmbeddingForm({ 
  createParams, 
  setCreateParams, 
  selectedModel, 
  creating, 
  createError, 
  onCreateEmbedding 
}) {
  return (
    <div className="create-embedding-section">
      <h3>
        Create New Embedding Index
        {selectedModel?.pricing && (
          <div className="pricing-tooltip-container">
            <button 
              className="btn-pricing-info"
              title="View model information"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 7.5V11.5M8 5V5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Model Information
            </button>
            <div className="pricing-tooltip">
              <div className="pricing-tooltip-header">
                {selectedModel.displayName}
              </div>
              <div className="pricing-tooltip-body">
                {(selectedModel.maxContextTokens || selectedModel.supportedLanguages || selectedModel.maxDurationMinutes || selectedModel.maxSizeGB || selectedModel.maxTextTokens || selectedModel.maxImageSize || selectedModel.maxVideoSeconds || selectedModel.maxAudioSeconds || selectedModel.maxVideoSizeGB || selectedModel.maxAudioSizeGB) && (
                  <>
                    <div className="pricing-tooltip-section-title">Model Limits</div>
                    {selectedModel.maxDurationMinutes && (
                      <div className="pricing-tooltip-row">
                        <span className="pricing-tooltip-label">Max Duration:</span>
                        <span className="pricing-tooltip-value">{selectedModel.maxDurationMinutes >= 60 ? `${selectedModel.maxDurationMinutes / 60} hours` : `${selectedModel.maxDurationMinutes} min`}</span>
                      </div>
                    )}
                    {selectedModel.maxVideoSeconds && (
                      <div className="pricing-tooltip-row">
                        <span className="pricing-tooltip-label">Max Video:</span>
                        <span className="pricing-tooltip-value">{selectedModel.maxVideoSeconds}s</span>
                      </div>
                    )}
                    {selectedModel.maxAudioSeconds && (
                      <div className="pricing-tooltip-row">
                        <span className="pricing-tooltip-label">Max Audio:</span>
                        <span className="pricing-tooltip-value">{selectedModel.maxAudioSeconds}s</span>
                      </div>
                    )}
                    {selectedModel.maxSizeGB && (
                      <div className="pricing-tooltip-row">
                        <span className="pricing-tooltip-label">Max Size:</span>
                        <span className="pricing-tooltip-value">{selectedModel.maxSizeGB} GB</span>
                      </div>
                    )}
                    {selectedModel.maxVideoSizeGB && (
                      <div className="pricing-tooltip-row">
                        <span className="pricing-tooltip-label">Max Video Size:</span>
                        <span className="pricing-tooltip-value">{selectedModel.maxVideoSizeGB} GB</span>
                      </div>
                    )}
                    {selectedModel.maxAudioSizeGB && (
                      <div className="pricing-tooltip-row">
                        <span className="pricing-tooltip-label">Max Audio Size:</span>
                        <span className="pricing-tooltip-value">{selectedModel.maxAudioSizeGB} GB</span>
                      </div>
                    )}
                    {selectedModel.maxContextTokens && (
                      <div className="pricing-tooltip-row">
                        <span className="pricing-tooltip-label">Max Context:</span>
                        <span className="pricing-tooltip-value">{selectedModel.maxContextTokens.toLocaleString()} tokens</span>
                      </div>
                    )}
                    {selectedModel.maxTextTokens && (
                      <div className="pricing-tooltip-row">
                        <span className="pricing-tooltip-label">Max Text:</span>
                        <span className="pricing-tooltip-value">{selectedModel.maxTextTokens.toLocaleString()} tokens</span>
                      </div>
                    )}
                    {selectedModel.maxImageSize && (
                      <div className="pricing-tooltip-row">
                        <span className="pricing-tooltip-label">Max Image:</span>
                        <span className="pricing-tooltip-value">{selectedModel.maxImageSize} MB</span>
                      </div>
                    )}
                    {selectedModel.supportedLanguages && (
                      <div className="pricing-tooltip-row">
                        <span className="pricing-tooltip-label">Languages:</span>
                        <span className="pricing-tooltip-value">{selectedModel.supportedLanguages}+ supported</span>
                      </div>
                    )}
                    <div className="pricing-tooltip-divider"></div>
                  </>
                )}
                
                <div className="pricing-tooltip-section-title">
                  Pricing
                  {selectedModel.pricing.url && (
                    <a 
                      href={selectedModel.pricing.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="pricing-tooltip-link"
                      title="View pricing documentation"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8.5 1.5H3.5C2.94772 1.5 2.5 1.94772 2.5 2.5V13.5C2.5 14.0523 2.94772 14.5 3.5 14.5H12.5C13.0523 14.5 13.5 14.0523 13.5 13.5V6.5M10.5 1.5H14.5M14.5 1.5V5.5M14.5 1.5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </a>
                  )}
                </div>
                {selectedModel.pricing.perMinuteVideo && (
                  <div className="pricing-tooltip-row">
                    <span className="pricing-tooltip-label">Video:</span>
                    <span className="pricing-tooltip-value">${selectedModel.pricing.perMinuteVideo.toFixed(5)}/min</span>
                  </div>
                )}
                {selectedModel.pricing.perSecondVideo && (
                  <div className="pricing-tooltip-row">
                    <span className="pricing-tooltip-label">Video:</span>
                    <span className="pricing-tooltip-value">${selectedModel.pricing.perSecondVideo.toFixed(5)}/sec</span>
                  </div>
                )}
                {selectedModel.pricing.perImage && (
                  <div className="pricing-tooltip-row">
                    <span className="pricing-tooltip-label">Image:</span>
                    <span className="pricing-tooltip-value">${selectedModel.pricing.perImage.toFixed(5)}/img</span>
                  </div>
                )}
                {selectedModel.pricing.perTextQuery && (
                  <div className="pricing-tooltip-row">
                    <span className="pricing-tooltip-label">Text:</span>
                    <span className="pricing-tooltip-value">${selectedModel.pricing.perTextQuery.toFixed(5)}/query</span>
                  </div>
                )}
                {selectedModel.pricing.notes && (
                  <div className="pricing-tooltip-notes">
                    {selectedModel.pricing.notes}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </h3>
      
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
            {selectedModel?.links?.length > 0 && (
              <div className="model-links">
                Model page:
                {selectedModel.links.map(link => (
                  <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label || link.url}</a>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedModel?.parameterType === 'openai-embed' && (
          <>
            <div className="form-row">
              <div className="form-group" style={{ flex: '1 1 100%' }}>
                <label htmlFor="taskName">Task Name</label>
                <input
                  type="text"
                  id="taskName"
                  value={createParams.taskName}
                  onChange={(e) => setCreateParams(prev => ({ ...prev, taskName: e.target.value }))}
                  placeholder="Task name..."
                />
              </div>
            </div>

            <div className="form-row">
              {/* The parameters this model declares in models.yaml */}
              <EmbeddingParamFields
                model={selectedModel}
                values={{ ...defaultParams(selectedModel), ...createParams.embedParams?.[selectedModel.modelId] }}
                onChange={(key, value) => setCreateParams(prev => ({
                  ...prev,
                  embedParams: {
                    ...prev.embedParams,
                    [selectedModel.modelId]: { ...defaultParams(selectedModel), ...prev.embedParams?.[selectedModel.modelId], [key]: value }
                  }
                }))}
              />

              {!selectedModel.parameters?.some(p => p.key === 'EmbeddingDim') && (
                <div className="form-group">
                  <label htmlFor="embeddingDimFixed">Dimension</label>
                  <input type="text" id="embeddingDimFixed" value={selectedModel.dims?.[0] || ''} disabled />
                  <small style={{ display: 'block', marginTop: 4, opacity: 0.75 }}>
                    Fixed size: this model offers no other dimensions. If it should, restart the backend so it
                    sends the model's Dimension options.
                  </small>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="description">Description (Optional)</label>
                <input
                  type="text"
                  id="description"
                  value={createParams.description}
                  onChange={(e) => setCreateParams(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Additional notes..."
                />
              </div>

              <div className="form-group form-group-button">
                <label>&nbsp;</label>
                <button
                  className="btn-create-embedding"
                  onClick={onCreateEmbedding}
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Create Embedding'}
                </button>
              </div>
            </div>
          </>
        )}

        {selectedModel?.parameterType === 'nova-mme' && (
          <>
            <div className="form-row">
              <div className="form-group" style={{ flex: '1 1 100%' }}>
                <label htmlFor="taskName">Task Name</label>
                <input
                  type="text"
                  id="taskName"
                  value={createParams.taskName}
                  onChange={(e) => setCreateParams(prev => ({ ...prev, taskName: e.target.value }))}
                  placeholder="Task name..."
                />
              </div>
            </div>
            
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
                  size="2"
                  value={createParams.embedMode}
                  onChange={(e) => setCreateParams(prev => ({ ...prev, embedMode: e.target.value }))}
                >
                  <option value="AUDIO_VIDEO_COMBINED">Audio + Video Combined</option>
                  <option value="AUDIO_VIDEO_SEPARATE">Audio + Video Separate</option>
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
                  placeholder="Additional notes..."
                />
              </div>

              <div className="form-group form-group-button">
                <label>&nbsp;</label>
                <button 
                  className="btn-create-embedding"
                  onClick={onCreateEmbedding}
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Create Embedding'}
                </button>
              </div>
            </div>
          </>
        )}

        {selectedModel?.parameterType === 'twelvelabs' && (
          <>
            <div className="form-row">
              <div className="form-group" style={{ flex: '1 1 100%' }}>
                <label htmlFor="taskName">Task Name</label>
                <input
                  type="text"
                  id="taskName"
                  value={createParams.taskName}
                  onChange={(e) => setCreateParams(prev => ({ ...prev, taskName: e.target.value }))}
                  placeholder="Task name..."
                />
              </div>
            </div>
            
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
                  value={createParams.embeddingScope}
                  onChange={(e) => setCreateParams(prev => ({ ...prev, embeddingScope: e.target.value }))}
                >
                  <option value="clip">Clip</option>
                  <option value="asset">Asset</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="embeddingOption">Embedding Options (Multi-select)</label>
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
                  placeholder="Additional notes..."
                />
              </div>

              <div className="form-group form-group-button">
                <label>&nbsp;</label>
                <button 
                  className="btn-create-embedding"
                  onClick={onCreateEmbedding}
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Create Embedding'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default CreateEmbeddingForm
