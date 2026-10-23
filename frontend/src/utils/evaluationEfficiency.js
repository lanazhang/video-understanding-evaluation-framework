// Processing time and token use of the analysis behind an evaluation, to show next to its quality metrics.
// Reads the analyze task that the evaluation was made from (task.analyzeTask) and the video (task.video).
const positive = (value) => (Number(value) > 0 ? Number(value) : null)

export function evaluationEfficiency(task) {
  const analyze = task?.analyzeTask
  if (!analyze) return null

  const result = analyze.Result || {}
  const meta = result.ResponseMetadata || {}
  const seconds = positive(result.ProcessingTimeS)
  const videoSeconds = positive(task?.video?.Duration)
  // Embedding tasks record Result.InputTokens; video-understanding tasks record ResponseMetadata
  const inputTokens = Number(result.InputTokens ?? meta.inputTokens) || 0
  const outputTokens = Number(meta.outputTokens) || 0

  return {
    seconds,
    videoSeconds,
    speed: seconds && videoSeconds ? videoSeconds / seconds : null,   // how many times faster than real time
    inputTokens,
    outputTokens,
  }
}

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return 'N/A'
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} m ${Math.round(seconds - minutes * 60)} s`
}

// What each efficiency figure means: a short line for the cards and the full definition for the info tooltip
export const EFFICIENCY_DEFINITIONS = {
  'Processing time': {
    description: 'Total time the analysis took',
    title: 'Processing time',
    formula: 'Time from the analysis task starting to finishing',
    details: 'The whole job for this video: for an embedding model, cutting the video into segments and embedding every one; for a video-understanding model, the full analysis call. It is not the time of a single search or request.',
    interpretation: 'Lower is cheaper to index. Compare models only when they used the same segment length and inputs.',
  },
  Speed: {
    description: 'Video length / processing time',
    title: 'Speed (× real time)',
    formula: 'video duration / processing time',
    details: 'How many times faster than playback the analysis ran. 28.7× means a 10 minute video was analyzed in about 21 seconds.',
    interpretation: 'Above 1× is faster than real time; below 1× takes longer than the video itself. Higher is better.',
  },
  Tokens: {
    description: 'Input / output tokens used',
    title: 'Tokens',
    formula: 'Sum of the tokens the model reported, input and output',
    details: 'Embedding models report input tokens only. Some servers (for example Omni-Embed) do not report tokens at all, so the figure is then absent.',
    interpretation: 'Not comparable between models that tokenize video differently.',
  },
}

// Rows for a comparison card: [{label, value, title?, description}]
export function efficiencyRows(task) {
  const e = evaluationEfficiency(task)
  if (!e) return []
  const rows = [{ label: 'Processing time', value: formatDuration(e.seconds), title: 'Total time the analysis task took to run (the whole video, not one request)', description: EFFICIENCY_DEFINITIONS['Processing time'].description }]
  if (e.speed) rows.push({ label: 'Speed', value: `${e.speed.toFixed(1)}× real time`, title: 'Video length divided by processing time', description: EFFICIENCY_DEFINITIONS.Speed.description })
  if (e.inputTokens || e.outputTokens) {
    rows.push({ label: 'Tokens', value: `${e.inputTokens.toLocaleString()} in${e.outputTokens ? ` / ${e.outputTokens.toLocaleString()} out` : ''}`, description: EFFICIENCY_DEFINITIONS.Tokens.description })
  }
  return rows
}
