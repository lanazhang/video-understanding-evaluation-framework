// Embedding models declare their own task parameters in backend/models.yaml (`parameters`), e.g. Qwen3-VL takes a
// segment length, frame rate and resolution while Omni-Embed takes a segment length and an audio switch.
// These helpers read that declaration so the forms and task views follow the model instead of hardcoding it.
import { modelGroups } from '../static/modelConfig'
import { embeddingLabel } from './embeddingTasks'

const embeddingModels = () => modelGroups.find(g => g.groupName === 'Multimodal Embedding')?.models || []

// Used for tasks whose model is no longer in the registry
const FALLBACK_PARAMETERS = [{ key: 'DurationS', label: 'Segment Duration', type: 'number', unit: 's' }]

export const modelParameters = (model) => model?.parameters || []

// A parameter can be shown only for some choices of another one: showIf {key, minSelected} (enough options of a multiselect
// ticked) or showIf {key, equals} (another field has this value, e.g. the shot settings only when segmenting by shot).
export function paramVisible(param, values) {
  const cond = param.showIf
  if (!cond) return true
  const other = values?.[cond.key]
  if (cond.equals !== undefined) return other === cond.equals
  return (other || []).length >= (cond.minSelected || 1)
}

// A parameter's label can depend on another field: labelIf {key, equals, label}. DurationS reads "Segment Duration" for fixed
// segments and "Longest segment" when segmenting by shot, where it is the maximum.
export const paramLabel = (param, values) =>
  param.labelIf && values?.[param.labelIf.key] === param.labelIf.equals ? param.labelIf.label : param.label

// Select options are plain values or {value, label}
export const optionValue = (o) => (o !== null && typeof o === 'object' ? o.value : o)

// A short plain-language explanation of what "By shot" will do with the numbers currently entered, with a worked example
// of the splitting rule. Null when segmenting by fixed length.
const oneDecimal = (n) => String(Math.round(n * 10) / 10)
export function segmentingNote(values) {
  if (values?.SegmentMode !== 'shots') return null
  const max = Number(values.DurationS) > 0 ? Number(values.DurationS) : 5
  const min = Number(values.MinShotS) > 0 ? Number(values.MinShotS) : 1
  const example = Math.round(max * 2.6 * 10) / 10        // a shot long enough to need three pieces
  const pieces = Math.ceil(example / max - 1e-9)
  return `The video is cut where the picture changes. A shot longer than ${oneDecimal(max)} s is divided evenly into pieces of at ` +
    `most ${oneDecimal(max)} s (a ${oneDecimal(example)} s shot becomes ${pieces} pieces of ${oneDecimal(example / pieces)} s). ` +
    `A shot shorter than ${oneDecimal(min)} s is joined with the next shot.`
}

// Numbers about the segments of an index, for the summary line above the timeline.
//   segments: [{StartSec, EndSec, ShotIndex}] from /model/embedding-segments (ShotIndex is null unless it was cut by shot)
export function segmentStats(segments) {
  const list = segments || []
  const lengths = list.map(s => s.EndSec - s.StartSec).sort((a, b) => a - b)
  const stat = { count: list.length, shots: null, dividedShots: null, minS: null, maxS: null, medianS: null }
  if (!list.length) return stat
  stat.minS = lengths[0]
  stat.maxS = lengths[lengths.length - 1]
  stat.medianS = lengths.length % 2 ? lengths[(lengths.length - 1) / 2] : (lengths[lengths.length / 2 - 1] + lengths[lengths.length / 2]) / 2
  if (list.every(s => s.ShotIndex !== null && s.ShotIndex !== undefined)) {
    const perShot = {}
    list.forEach(s => { perShot[s.ShotIndex] = (perShot[s.ShotIndex] || 0) + 1 })
    stat.shots = Object.keys(perShot).length
    stat.dividedShots = Object.values(perShot).filter(n => n > 1).length
  }
  return stat
}

// "0:05", "1:02:30": a time on the axis
export function clock(seconds) {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

// How a task's video was cut, in a few words: "5s" for fixed segments, "by shot (max 5s)" for shot segments
export function segmentSummary(request) {
  const r = request || {}
  if (r.SegmentMode === 'shots') return `by shot (max ${r.DurationS ?? '?'}s)`
  return `${r.DurationS ?? 'N/A'}s`
}

// The segment part of a default task name: "5s", or "shots-max5s" (plus the sensitivity and shortest segment when they are
// not the defaults). Same pattern as the backend's default name.
export function segmentNamePart(request) {
  const r = request || {}
  if (r.SegmentMode !== 'shots') return `${r.DurationS ?? '?'}s`
  let part = `shots-max${r.DurationS ?? '?'}s`
  if (r.ShotThreshold !== undefined && Number(r.ShotThreshold) !== 0.3) part += `-th${Number(r.ShotThreshold)}`
  if (r.MinShotS !== undefined && Number(r.MinShotS) !== 1) part += `-min${Number(r.MinShotS)}s`
  return part
}

export function defaultParams(model) {
  return Object.fromEntries(modelParameters(model).map(p => [p.key, Array.isArray(p.default) ? [...p.default] : p.default]))
}

const optionLabel = (param, value) => param.options?.find(o => optionValue(o) === value)?.label || value

export function formatParamValue(param, value) {
  if (value === undefined || value === null || value === '') return 'N/A'
  if (param.type === 'boolean') return value ? 'Yes' : 'No'
  if (param.type === 'multiselect') return (Array.isArray(value) ? value : [value]).map(v => optionLabel(param, v)).join(', ')
  if (param.type === 'select' && param.options?.some(o => o !== null && typeof o === 'object')) return String(optionLabel(param, value))
  const n = Number(value)
  const shown = Number.isNaN(n) ? value : n
  if (!param.unit) return String(shown)
  return param.unit === 's' ? `${shown}s` : `${shown} ${param.unit}`
}

// Tasks from earlier builds stored their input choice differently; express them in today's terms
function normalizedRequest(request) {
  const r = { ...(request || {}) }
  if (r.SegmentMode === undefined) r.SegmentMode = 'fixed'   // tasks from before shot segmenting were all fixed-length
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
  const parts = [short, segmentNamePart(request), inputs.join('+')]
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
    .filter(p => paramVisible(p, request))
    .map(p => ({ label: paramLabel(p, request), value: formatParamValue(p, request[p.key]) }))
  if (!params.some(p => p.key === 'EmbeddingDim')) rows.push({ label: 'Dimension', value: request.EmbeddingDim || 'N/A' })
  if (task?.Result?.SegmentCount) rows.push({ label: 'Segments', value: task.Result.SegmentCount })
  if (task?.Result?.SegmentMode === 'shots' && task.Result.ShotCount) {
    rows.push({ label: 'Shots found', value: task.Result.ShotCount })
    if (task.Result.SegmentMinS !== undefined && task.Result.SegmentMaxS !== undefined) {
      rows.push({ label: 'Segment length', value: `${Number(task.Result.SegmentMinS).toFixed(1)}s to ${Number(task.Result.SegmentMaxS).toFixed(1)}s` })
    }
  }
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
