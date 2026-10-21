// Evaluation metrics for temporal segments (predicted clips vs ground-truth moments).
//
// Matching
//   A predicted clip matches a ground-truth moment when the two ranges (each widened by `bufferTime` on both sides)
//   overlap and a measure of that overlap reaches `threshold` (0 = any overlap). Two measures:
//     matchBy 'overlap' : the share of the SHORTER range that is covered. A 5 s clip that fully contains a 0.5 s moment
//                         scores 100%, and so does a short clip lying inside a long moment. Right for retrieval, where
//                         clips are fixed-length windows and moments are of any length.
//     matchBy 'iou'     : intersection over union. Symmetrical and strict: a window much longer than the moment scores low.
//                         Right for judging how tightly the boundaries line up.
//   oneToOne = true  : each ground-truth moment is claimed by at most one prediction, in rank order (best score first);
//                      extra clips on a moment that is already claimed count as false positives.
//   oneToOne = false : every clip that matches a moment is a true positive (relevance-based, duplicates allowed).
//
// Precision = true-positive clips / clips returned            Recall = matched ground-truth moments / ground-truth moments
// Both use consistent units, so a model that returns many clips on one moment and misses the others no longer looks
// good (the earlier version divided prediction counts by prediction + moment counts).
//
// Ranking metrics (Recall@K, MRR, NDCG@10, AP / mAP) are computed per query on the clips ranked by score (lower distance first)
// and averaged over queries. mAP @ IoU 0.3 / 0.5 / 0.7 always use IoU, whatever `matchBy` is.

export const DEFAULT_MATCH_OPTIONS = { matchBy: 'overlap', threshold: 0.5, oneToOne: true }

// The matching used before thresholds existed: any overlap counts, every overlapping clip is a true positive.
export const LEGACY_MATCH_OPTIONS = { matchBy: 'iou', threshold: 0, oneToOne: false }

export const MATCH_BY_CHOICES = [
  { value: 'overlap', label: 'Overlap (share of the shorter range)' },
  { value: 'iou', label: 'IoU (strict boundaries)' },
]
export const THRESHOLD_CHOICES = [0, 0.1, 0.3, 0.5, 0.7, 0.9]
export const MAP_IOU_THRESHOLDS = [0.3, 0.5, 0.7]
export const RECALL_AT_K = [1, 5, 10]

// Evaluations carry the version of the matching rule they were scored with:
//   none : the original rule (any overlap, duplicate hits allowed)         2 : IoU threshold, saved as MatchIouThreshold
//   3    : choice of measure and threshold, saved as MatchBy / MatchThreshold
export const MATCH_VERSION = 3
export const isLegacyEvaluation = (task) => !task || task.MatchVersion === undefined || task.MatchVersion === null

const numberOr = (value, fallback) => (value !== undefined && value !== null ? Number(value) : fallback)

// Older callers pass { iouThreshold }; read that as an IoU threshold
export const normalizeMatchOptions = (options = {}) => {
  if (options.iouThreshold !== undefined && options.threshold === undefined && options.matchBy === undefined) {
    return { ...DEFAULT_MATCH_OPTIONS, matchBy: 'iou', threshold: Number(options.iouThreshold), oneToOne: options.oneToOne ?? DEFAULT_MATCH_OPTIONS.oneToOne }
  }
  return { ...DEFAULT_MATCH_OPTIONS, ...options }
}

export const matchOptionsForTask = (task) => {
  if (isLegacyEvaluation(task)) return LEGACY_MATCH_OPTIONS
  const oneToOne = task.OneToOne !== undefined && task.OneToOne !== null ? Boolean(task.OneToOne) : DEFAULT_MATCH_OPTIONS.oneToOne
  if (Number(task.MatchVersion) < 3) {
    return { matchBy: 'iou', threshold: numberOr(task.MatchIouThreshold, 0.5), oneToOne }
  }
  return { matchBy: task.MatchBy === 'iou' ? 'iou' : 'overlap', threshold: numberOr(task.MatchThreshold, DEFAULT_MATCH_OPTIONS.threshold), oneToOne }
}

// The fields to store on an evaluation so it can be shown and recomputed the same way later
export const matchFieldsToSave = (options) => {
  const o = normalizeMatchOptions(options)
  return {
    MatchVersion: MATCH_VERSION,
    MatchBy: o.matchBy,
    MatchThreshold: o.threshold,
    OneToOne: o.oneToOne,
    ...(o.matchBy === 'iou' ? { MatchIouThreshold: o.threshold } : {}),
  }
}

// "overlap of at least 50% of the shorter range" / "IoU \u2265 0.5" / "any overlap"
export const describeThreshold = (options) => {
  const o = normalizeMatchOptions(options)
  if (!o.threshold) return 'any overlap'
  return o.matchBy === 'iou' ? `IoU \u2265 ${o.threshold}` : `overlap \u2265 ${Math.round(o.threshold * 100)}% of the shorter range`
}

// The ranking metrics shown on every evaluation screen
export const RANKING_METRICS = [
  { key: 'RecallAt1', label: 'Recall@1', description: 'Moments found by the top-ranked clip' },
  { key: 'RecallAt5', label: 'Recall@5', description: 'Moments found in the top 5 clips' },
  { key: 'RecallAt10', label: 'Recall@10', description: 'Moments found in the top 10 clips' },
  { key: 'MRR', label: 'MRR', description: 'Reciprocal rank of the first hit' },
  { key: 'NDCG10', label: 'NDCG@10', description: 'Hits in the top 10, weighted by how high they rank' },
  { key: 'MeanAveragePrecisionIoU30', label: 'mAP @ IoU 0.3', description: 'Average precision, loose overlap' },
  { key: 'MeanAveragePrecisionIoU50', label: 'mAP @ IoU 0.5', description: 'Average precision, standard overlap' },
  { key: 'MeanAveragePrecisionIoU70', label: 'mAP @ IoU 0.7', description: 'Average precision, strict overlap' },
]

// "0.00 s - 10.00 s"
export const formatRange = (label) => `${parseFloat(label.StartTs || 0).toFixed(2)} s \u2013 ${parseFloat(label.EndTs || 0).toFixed(2)} s`

// "starts 9.50 s late, ends 10.00 s late" / "starts 0.50 s early, ends on time"
export const describeOffsets = (startOffset, endOffset) => {
  const part = (verb, offset, late, early) => {
    if (Math.abs(offset) < 0.005) return `${verb} on time`
    return `${verb} ${Math.abs(offset).toFixed(2)} s ${offset > 0 ? late : early}`
  }
  return `${part('starts', startOffset, 'late', 'early')}, ${part('ends', endOffset, 'late', 'early')}`
}

// One line comparing a clip with a ground-truth range it touches
export const describeOverlap = (info) => {
  if (info.overlapSec <= 0) return `${info.gapSec.toFixed(2)} s apart (within buffer) \u00b7 ${describeOffsets(info.startOffset, info.endOffset)}`
  return `overlap ${info.overlapSec.toFixed(2)} s \u00b7 covers ${Math.round(info.gtCoverage * 100)}% of the GT range \u00b7 IoU ${(info.iou * 100).toFixed(1)}% \u00b7 ${describeOffsets(info.startOffset, info.endOffset)}`
}

// For a row of a matching table: the range it was matched to, with the overlap numbers, or why a touching range did
// not count. kind 'gt': the row is a ground-truth range (its counterparts are clips); kind 'pred': the row is a clip
// (its counterparts are ground-truth ranges).
export const counterpartSummary = (match, kind, options = {}) => {
  const list = (kind === 'gt' ? match.clips : match.overlaps) || []
  const claimed = list.find(x => x.claimed)
  const best = claimed || list[0]
  const name = (x) => (kind === 'gt' ? `Prediction #${x.predIndex + 1}` : `GT #${x.gtIndex + 1}`)
  const range = (x) => formatRange(kind === 'gt' ? x.predLabel : x.gtLabel)
  if (!best) return { headline: 'None', detail: kind === 'gt' ? 'No returned clip touches this range' : 'No overlap with any ground-truth range' }
  if (claimed) return { headline: `${name(best)} \u00b7 ${range(best)}`, detail: describeOverlap(best), matched: true }
  const why = best.meetsThreshold ? 'that moment is already found by a better-ranked clip' : `does not reach ${describeThreshold(options)}`
  return { headline: 'None', detail: `closest: ${name(best)} \u00b7 ${range(best)} \u2014 ${describeOverlap(best)} (${why})`, matched: false }
}

export const describeMatching = (options, bufferTime) => {
  const o = normalizeMatchOptions(options)
  const parts = [describeThreshold(o), o.oneToOne ? 'one-to-one' : 'duplicate hits allowed']
  if (parseFloat(bufferTime)) parts.push(`${parseFloat(bufferTime).toFixed(2)} s buffer`)
  return parts.join(', ')
}

const round4 = (value) => parseFloat(Math.min(1, Math.max(0, value)).toFixed(4))
const percentKey = (threshold) => String(Math.round(threshold * 100))

export const calculateEvaluationMetrics = (groundTruthLabels, searchResults, searchQuery, allSearches = [], bufferTime = 0, options = {}) => {
  const { matchBy, threshold, oneToOne } = normalizeMatchOptions(options)
  const buffer = parseFloat(bufferTime) || 0

  // Only reviewed / true-positive ground-truth labels count; false positives, unreviewed etc. do not
  const validGTLabels = groundTruthLabels.filter(
    label => label.ReviewResult === 'true_positive' || label.ReviewResult === 'reviewed'
  )

  const toPredictions = (results) => results.map((result, idx) => ({
    id: idx,
    StartTs: parseFloat(result.StartSec || 0),
    EndTs: parseFloat(result.EndSec || 0),
    Score: parseFloat(result.Distance || 0),
    Label: searchQuery
  }))
  const predictedLabels = toPredictions(searchResults)

  // Overlap and IoU of two ranges, each widened by the buffer
  const compare = (gt, pred) => {
    const gStart = gt.StartTs - buffer, gEnd = gt.EndTs + buffer
    const pStart = pred.StartTs - buffer, pEnd = pred.EndTs + buffer
    const intersection = Math.max(0, Math.min(gEnd, pEnd) - Math.max(gStart, pStart))
    const union = Math.max(gEnd, pEnd) - Math.min(gStart, pStart)
    const shorter = Math.min(gEnd - gStart, pEnd - pStart)
    return {
      overlaps: intersection > 0,
      iou: union > 0 ? intersection / union : 0,
      share: shorter > 0 ? intersection / shorter : 0,   // how much of the shorter range is covered
    }
  }
  const measureOf = (c, by) => (by === 'iou' ? c.iou : c.share)
  // The plain IoU (no buffer), for display and Mean IoU: how well the clip really lines up with the moment
  const plainIoU = (gt, pred) => {
    const intersection = Math.max(0, Math.min(gt.EndTs, pred.EndTs) - Math.max(gt.StartTs, pred.StartTs))
    const union = Math.max(gt.EndTs, pred.EndTs) - Math.min(gt.StartTs, pred.StartTs)
    return union > 0 ? intersection / union : 0
  }

  // How one clip relates to one ground-truth moment, for showing the two ranges side by side. Null when they are
  // apart (a clip within the buffer of the moment still counts as related).
  const pairInfo = (gt, pred) => {
    const raw = Math.min(gt.EndTs, pred.EndTs) - Math.max(gt.StartTs, pred.StartTs)
    const c = compare(gt, pred)
    if (!c.overlaps && raw <= 0) return null
    const gtDuration = gt.EndTs - gt.StartTs
    return {
      overlapSec: Math.max(0, raw),               // seconds the two ranges share
      gapSec: raw < 0 ? -raw : 0,                 // seconds apart, when only the buffer links them
      iou: plainIoU(gt, pred),                    // overlap quality without the buffer
      gtCoverage: gtDuration > 0 ? Math.max(0, raw) / gtDuration : 0,   // share of the ground-truth range the clip covers
      meetsThreshold: c.overlaps && measureOf(c, matchBy) >= threshold,
      startOffset: pred.StartTs - gt.StartTs,     // + = the clip starts after the moment starts
      endOffset: pred.EndTs - gt.EndTs,           // + = the clip ends after the moment ends
    }
  }

  // Match clips to ground-truth moments in rank order. Returns, per clip, the moment it was matched to (or null) and
  // which moments were found.
  // `extend` (report matching only): with one-to-one matching a moment that is already found can still be claimed by
  // another clip when that clip covers a NEW part of it. A long moment covered by several clips therefore counts each
  // of them as a hit, while a second clip on the same short moment (nothing new covered) stays a duplicate.
  const matchRanked = (preds, minimum, exclusive, by = matchBy, extend = false) => {
    const order = preds.map((_, i) => i).sort((a, b) => (preds[a].Score - preds[b].Score) || (a - b))
    const found = new Array(validGTLabels.length).fill(false)
    const covered = validGTLabels.map(() => [])   // intervals of each moment already covered by claiming clips
    const result = new Array(preds.length).fill(null)
    const newCoverage = (gi, lo, hi) => {
      if (hi <= lo) return 0
      let remaining = [[lo, hi]]
      covered[gi].forEach(([cs, ce]) => {
        remaining = remaining.flatMap(([a, b]) => (ce <= a || cs >= b) ? [[a, b]] : [[a, Math.min(cs, b)], [Math.max(ce, a), b]].filter(([x, y]) => y > x))
      })
      return remaining.reduce((sum, [a, b]) => sum + (b - a), 0)
    }
    order.forEach((pi) => {
      let best = -1, bestIoU = 0, bestSpan = null   // best moment this clip could claim (not yet claimed, when exclusive)
      let bestAny = -1, bestAnyIoU = 0     // best moment it overlaps at all, claimed or not
      validGTLabels.forEach((gt, gi) => {
        const c = compare(gt, preds[pi])
        let score = measureOf(c, by)
        if (!c.overlaps || score < minimum) return
        if (score > bestAnyIoU) { bestAnyIoU = score; bestAny = gi }
        // coverage is tracked on the real ranges (the buffer only decides whether a first claim is allowed)
        const lo = Math.max(gt.StartTs, preds[pi].StartTs), hi = Math.min(gt.EndTs, preds[pi].EndTs)
        if (exclusive && found[gi]) {
          if (!extend) return
          // already claimed: the clip must be scored like a first claim (buffer included), scaled by the share of its
          // real overlap with the moment that is NEW (not covered by clips that claimed it before)
          if (hi <= lo) return
          const added = newCoverage(gi, lo, hi)
          if (added <= 0) return
          score = score * (added / (hi - lo))
          if (score < minimum) return
        }
        if (score > bestIoU) { bestIoU = score; best = gi; bestSpan = [lo, hi] }
        if (!exclusive) found[gi] = true   // relevance mode: every moment this clip overlaps is found
      })
      if (best !== -1) {
        if (exclusive) { found[best] = true; if (bestSpan[1] > bestSpan[0]) covered[best].push(bestSpan) }
        result[pi] = { gt: best, iou: bestIoU }
      } else if (exclusive && bestAny !== -1) {
        result[pi] = { gt: null, duplicateOf: bestAny }   // moment already claimed by a better-ranked clip
      }
    })
    return { order, found, result }
  }

  // ---- the matching shown in the report ----
  const main = matchRanked(predictedLabels, threshold, oneToOne, matchBy, true)
  const predMatches = []
  const gtBestPred = new Array(validGTLabels.length).fill(null)  // best clip per moment, for the matching table
  let truePositives = 0, falsePositives = 0, totalIoU = 0

  predictedLabels.forEach((pred, pi) => {
    const m = main.result[pi]
    if (m && m.gt !== null) {
      const gt = validGTLabels[m.gt]
      const iou = plainIoU(gt, pred)
      truePositives++
      totalIoU += iou
      predMatches[pi] = { predIndex: pi, predLabel: pred, gtIndex: groundTruthLabels.indexOf(gt), gtLabel: gt, iou, status: 'TP' }
      if (!gtBestPred[m.gt] || iou > gtBestPred[m.gt].iou) gtBestPred[m.gt] = { pi, iou }
    } else {
      falsePositives++
      predMatches[pi] = {
        predIndex: pi, predLabel: pred, gtIndex: null, gtLabel: null, iou: 0, status: 'FP',
        ...(m && m.duplicateOf !== undefined ? { duplicateOfGtIndex: groundTruthLabels.indexOf(validGTLabels[m.duplicateOf]) } : {})
      }
    }
  })

  // In relevance mode a moment can be overlapped by several clips; show the best one
  if (!oneToOne) {
    predictedLabels.forEach((pred, pi) => {
      validGTLabels.forEach((gt, gi) => {
        const c = compare(gt, pred)
        if (c.overlaps && measureOf(c, matchBy) >= threshold) {
          const plain = plainIoU(gt, pred)
          if (!gtBestPred[gi] || plain > gtBestPred[gi].iou) gtBestPred[gi] = { pi, iou: plain }
        }
      })
    })
  }

  // Every ground-truth range a clip overlaps (best first), whether or not it counted as a hit
  predictedLabels.forEach((pred, pi) => {
    const overlaps = []
    validGTLabels.forEach((gt, gi) => {
      const info = pairInfo(gt, pred)
      if (info) overlaps.push({ ...info, gtIndex: groundTruthLabels.indexOf(gt), gtLabel: gt, claimed: info.meetsThreshold && (!oneToOne || (main.result[pi] && main.result[pi].gt === gi)) })
    })
    overlaps.sort((a, b) => (b.iou - a.iou) || (b.overlapSec - a.overlapSec))
    predMatches[pi].overlaps = overlaps
  })

  const gtMatches = []
  let falseNegatives = 0
  validGTLabels.forEach((gt, gi) => {
    const gtIdx = groundTruthLabels.indexOf(gt)
    // Every clip that overlaps this moment (best first); for a missed moment these show why nothing matched
    const clips = []
    predictedLabels.forEach((pred, pi) => {
      const info = pairInfo(gt, pred)
      if (info) clips.push({ ...info, predIndex: pi, predLabel: pred, claimed: info.meetsThreshold && (!oneToOne || (main.result[pi] && main.result[pi].gt === gi)) })
    })
    clips.sort((a, b) => (b.iou - a.iou) || (b.overlapSec - a.overlapSec))
    if (main.found[gi]) {
      const best = gtBestPred[gi]
      gtMatches.push({
        gtIndex: gtIdx, gtLabel: gt,
        predIndex: best ? best.pi : null, predLabel: best ? predictedLabels[best.pi] : null,
        iou: best ? best.iou : 0, status: 'TP', clips
      })
    } else {
      falseNegatives++
      gtMatches.push({ gtIndex: gtIdx, gtLabel: gt, predIndex: null, predLabel: null, iou: 0, status: 'FN', clips })
    }
  })

  const totalGT = validGTLabels.length
  const matchedGT = totalGT - falseNegatives
  const totalPredictions = predictedLabels.length
  const precision = totalPredictions > 0 ? truePositives / totalPredictions : 0
  const recall = totalGT > 0 ? matchedGT / totalGT : 0
  const f1Score = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0
  const meanIoU = truePositives > 0 ? totalIoU / truePositives : 0
  // No true negatives exist for temporal segments, so this is the critical success index: found / (found + wrong + missed)
  const accuracy = matchedGT + falsePositives + falseNegatives > 0 ? matchedGT / (matchedGT + falsePositives + falseNegatives) : 0

  // ---- ranking metrics, per query ----
  const queries = (allSearches || []).filter(s => s && Array.isArray(s.results) && s.results.length > 0).map(s => toPredictions(s.results))
  if (queries.length === 0) queries.push(predictedLabels)

  // AP is always computed one-to-one (counting duplicate hits would push it above 1)
  const averagePrecisionAt = (preds, minimum, by) => {
    if (preds.length === 0 || totalGT === 0) return 0
    const { order, result } = matchRanked(preds, minimum, true, by)
    let hits = 0, sum = 0
    order.forEach((pi, rank) => {
      if (result[pi] && result[pi].gt !== null) { hits++; sum += hits / (rank + 1) }
    })
    return sum / totalGT
  }
  const mean = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0

  const recallAtK = {}
  RECALL_AT_K.forEach((k) => {
    recallAtK[k] = mean(queries.map((preds) => {
      if (totalGT === 0 || preds.length === 0) return 0
      const { order } = matchRanked(preds, threshold, true)
      const topK = order.slice(0, k).map(i => preds[i])
      const { found } = matchRanked(topK, threshold, false)   // moments found by the first K clips
      return found.filter(Boolean).length / totalGT
    }))
  })

  // Reciprocal rank: 1 / rank of the first clip that matches any moment
  const mrr = mean(queries.map((preds) => {
    const { order, result } = matchRanked(preds, threshold, false)
    const firstHit = order.findIndex(pi => result[pi] && result[pi].gt !== null)
    return firstHit === -1 ? 0 : 1 / (firstHit + 1)
  }))

  // NDCG@10 with binary gain: 1 for a clip that claims a moment (one-to-one, so duplicates and misses give 0),
  // discounted by log2(rank + 1); the ideal ranking puts min(moments, 10) hits first.
  const NDCG_K = 10
  const ndcgAtK = (preds) => {
    if (preds.length === 0 || totalGT === 0) return 0
    const { order, result } = matchRanked(preds, threshold, true)
    let dcg = 0
    order.slice(0, NDCG_K).forEach((pi, rank) => {
      if (result[pi] && result[pi].gt !== null) dcg += 1 / Math.log2(rank + 2)
    })
    let ideal = 0
    for (let rank = 0; rank < Math.min(totalGT, NDCG_K); rank++) ideal += 1 / Math.log2(rank + 2)
    return ideal > 0 ? dcg / ideal : 0
  }
  const ndcg = mean(queries.map(ndcgAtK))

  const mapAt = {}
  MAP_IOU_THRESHOLDS.forEach((t) => { mapAt[t] = mean(queries.map(preds => averagePrecisionAt(preds, t, 'iou'))) })
  const meanAveragePrecision = mean(queries.map(preds => averagePrecisionAt(preds, threshold, matchBy)))

  const metrics = {
    Precision: round4(precision),
    Recall: round4(recall),
    F1Score: round4(f1Score),
    Accuracy: round4(accuracy),
    TruePositives: truePositives,
    FalsePositives: falsePositives,
    TrueNegatives: 0,
    FalseNegatives: falseNegatives,
    MatchedGroundTruth: matchedGT,
    TotalGroundTruth: totalGT,
    MeanIoU: round4(meanIoU),
    MeanAveragePrecision: round4(meanAveragePrecision),
    MRR: round4(mrr),
    NDCG10: round4(ndcg),
  }
  RECALL_AT_K.forEach((k) => { metrics[`RecallAt${k}`] = round4(recallAtK[k]) })
  MAP_IOU_THRESHOLDS.forEach((t) => { metrics[`MeanAveragePrecisionIoU${percentKey(t)}`] = round4(mapAt[t]) })

  return {
    metrics,
    details: {
      gtMatches,
      predMatches: predMatches.filter(m => m !== undefined)
    }
  }
}
