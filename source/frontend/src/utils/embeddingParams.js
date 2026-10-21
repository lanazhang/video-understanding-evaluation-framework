// Embedding models declare their own task parameters in local/models.yaml (`parameters`), e.g. Qwen3-VL takes a
// segment length, frame rate and resolution while Omni-Embed takes a segment length and an audio switch.
// These helpers read that declaration so the forms and task views follow the model instead of hardcoding it.
import { modelGroups } from '../static/modelConfig'
import { embeddingLabel } from './embeddingTasks'

const embeddingModels = () => modelGroups.find(g => g.groupName === 'Multimodal Embedding')?.models || []

// Used for tasks whose model is no longer in the registry
const FALLBACK_PARAMETERS = [{ key: 'DurationS', label: 'Segment Duration', type: 'number', unit: 's' }]

export const modelParameters = (model) => model?.parameters || []

export function defaultParams(model) {
  return Object.fromEntries(modelParameters(model).map(p => [p.key, Array.isArray(p.default) ? [...p.default] : p.default]))
}

const optionLabel = (param, value) => param.options?.find(o => o.value === value)?.label || value

export function formatParamValue(param, value) {
  if (value === undefined || value === null || value === '') return 'N/A'
  if (param.type === 'boolean') return value ? 'Yes' : 'No'
  if (param.type === 'multiselect') return (Array.isArray(value) ? value : [value]).map(v => optionLabel(param, v)).join(', ')
  const n = Number(value)
  const shown = Number.isNaN(n) ? value : n
  if (!param.unit) return String(shown)
  return param.unit === 's' ? `${shown}s` : `${shown} ${param.unit}`
}

// Tasks from earlier builds stored their input choice differently; express them in today's terms
function normalizedRequest(request) {
  const r = { ...(request || {}) }
  if (r.Inputs !== undefined) return r
  if (r.Modalities !== undefined) {
    // visual / audio / audio_visual (one pooled vector)
    const inputs = new Set()
    r.Modalities.forEach(m => (m === 'audio_visual' ? ['video', 'audio'] : [m === 'visual' ? 'video' : m]).forEach(i => inputs.add(i)))
    r.Inputs = ['video', 'audio', 'image'].filter(i => inputs.has(i))
    r.Combine = r.Modalities.length === 1 && r.Modalities[0] === 'audio_visual'
  } else if (r.IncludeAudio !== undefined) {
    // an "include audio" switch: audio and picture pooled into one vector
    r.Inputs = r.IncludeAudio ? ['video', 'audio'] : ['video']
    r.Combine = true
  }
  return r
}

// A readable title for an embedding task: its name; else a name built from its own settings, in the same pattern as the
// default name in the Create Embedding form (e.g. "omni-embed-nemotron-3b-5s-video+audio-separate-1024d").
// Never the bare model-type label, which is the same for every task.
export function embeddingTaskTitle(task) {
  if (task?.Name) return task.Name
  if (task?.Description && !/^Auto-generated/i.test(task.Description)) return task.Description
  if (task?.Type !== 'embedding') return embeddingLabel(task)

  const model = embeddingModels().find(m => m.modelId === task.ModelId)
  const short = (model?.displayName || task.ModelId || 'embedding')
    .replace(/\s*\(.*\)\s*$/, '').split('/').pop().replace(/\s+/g, '-').toLowerCase()
  const request = normalizedRequest(task.Request)
  const inputs = request.Inputs?.length ? request.Inputs : ['video']
  const parts = [short, `${request.DurationS ?? '?'}s`, inputs.join('+')]
  if (inputs.length > 1 && request.Combine === false) parts.push('separate')
  if (request.EmbeddingDim && model?.dims?.[0] && Number(request.EmbeddingDim) !== model.dims[0]) parts.push(`${request.EmbeddingDim}d`)
  return parts.join('-')
}

// Label/value rows describing an embedding task, built from ITS model's parameter declaration
export function embeddingTaskParamRows(task) {
  const model = embeddingModels().find(m => m.modelId === task?.ModelId)
  const declared = modelParameters(model)
  const params = declared.length ? declared : FALLBACK_PARAMETERS
  const request = normalizedRequest(task?.Request)
  const rows = params
    .filter(p => !p.showIf || (request[p.showIf.key] || []).length >= (p.showIf.minSelected || 1))
    .map(p => ({ label: p.label, value: formatParamValue(p, request[p.key]) }))
  if (!params.some(p => p.key === 'EmbeddingDim')) rows.push({ label: 'Dimension', value: request.EmbeddingDim || 'N/A' })
  if (task?.Result?.SegmentCount) rows.push({ label: 'Segments', value: task.Result.SegmentCount })
  const skipped = task?.Result?.SkippedInputs || []
  if (skipped.length) {
    const inputs = params.find(p => p.key === 'Inputs')
    rows.push({ label: 'Skipped (no audio track)', value: skipped.map(v => (inputs ? optionLabel(inputs, v) : v)).join(', ') })
  }
  if (request.Provider) rows.push({ label: 'Provider', value: request.Provider })
  if (task?.Result?.InputTokens > 0) {
    rows.push({ label: 'Input Tokens', value: Number(task.Result.InputTokens).toLocaleString() })
  }
  return rows
}
