// Utility functions for evaluation calculations

export const calculateEvaluationMetrics = (groundTruthLabels, searchResults, searchQuery) => {
  // Convert search results to predicted labels format
  const predictedLabels = searchResults.map((result, idx) => ({
    id: idx,
    StartTs: parseFloat(result.StartSec || 0),
    EndTs: parseFloat(result.EndSec || 0),
    Score: parseFloat(result.Distance || 0),
    Label: searchQuery
  }))

  // Check if two temporal segments overlap
  const hasOverlap = (gt, pred) => {
    return Math.max(gt.StartTs, pred.StartTs) < Math.min(gt.EndTs, pred.EndTs)
  }

  // Calculate IoU (Intersection over Union) for temporal segments (for display purposes)
  const calculateIoU = (gt, pred) => {
    const intersection = Math.max(0, Math.min(gt.EndTs, pred.EndTs) - Math.max(gt.StartTs, pred.StartTs))
    const union = Math.max(gt.EndTs, pred.EndTs) - Math.min(gt.StartTs, pred.StartTs)
    return union > 0 ? intersection / union : 0
  }

  // Match predictions to ground truth based on overlap
  let truePositives = 0
  let falsePositives = 0
  let falseNegatives = 0
  let totalIoU = 0
  let matchedPredictions = new Set()
  
  // Store detailed matching information
  const gtMatches = []
  const predMatches = []

  // For each ground truth, find best matching prediction (highest IoU among overlapping predictions)
  groundTruthLabels.forEach((gtLabel, gtIdx) => {
    let bestIoU = 0
    let bestPredIdx = -1
    let foundOverlap = false

    predictedLabels.forEach((predLabel, idx) => {
      if (!matchedPredictions.has(idx)) {
        if (hasOverlap(gtLabel, predLabel)) {
          foundOverlap = true
          const iou = calculateIoU(gtLabel, predLabel)
          if (iou > bestIoU) {
            bestIoU = iou
            bestPredIdx = idx
          }
        }
      }
    })

    if (foundOverlap && bestPredIdx !== -1) {
      truePositives++
      totalIoU += bestIoU
      matchedPredictions.add(bestPredIdx)
      gtMatches.push({
        gtIndex: gtIdx,
        gtLabel: gtLabel,
        predIndex: bestPredIdx,
        predLabel: predictedLabels[bestPredIdx],
        iou: bestIoU,
        status: 'TP'
      })
      predMatches[bestPredIdx] = {
        predIndex: bestPredIdx,
        predLabel: predictedLabels[bestPredIdx],
        gtIndex: gtIdx,
        gtLabel: gtLabel,
        iou: bestIoU,
        status: 'TP'
      }
    } else {
      falseNegatives++
      gtMatches.push({
        gtIndex: gtIdx,
        gtLabel: gtLabel,
        predIndex: null,
        predLabel: null,
        iou: 0,
        status: 'FN'
      })
    }
  })

  // Remaining predictions are false positives
  predictedLabels.forEach((predLabel, idx) => {
    if (!matchedPredictions.has(idx)) {
      falsePositives++
      predMatches[idx] = {
        predIndex: idx,
        predLabel: predLabel,
        gtIndex: null,
        gtLabel: null,
        iou: 0,
        status: 'FP'
      }
    }
  })

  // Calculate metrics
  const precision = truePositives + falsePositives > 0 
    ? truePositives / (truePositives + falsePositives) 
    : 0
  const recall = truePositives + falseNegatives > 0 
    ? truePositives / (truePositives + falseNegatives) 
    : 0
  const f1Score = precision + recall > 0 
    ? 2 * (precision * recall) / (precision + recall) 
    : 0
  const meanIoU = truePositives > 0 ? totalIoU / truePositives : 0
  const accuracy = groundTruthLabels.length > 0
    ? truePositives / groundTruthLabels.length
    : 0

  return {
    metrics: {
      Precision: parseFloat(precision.toFixed(4)),
      Recall: parseFloat(recall.toFixed(4)),
      F1Score: parseFloat(f1Score.toFixed(4)),
      Accuracy: parseFloat(accuracy.toFixed(4)),
      TruePositives: truePositives,
      FalsePositives: falsePositives,
      TrueNegatives: 0,
      FalseNegatives: falseNegatives,
      MeanIoU: parseFloat(meanIoU.toFixed(4)),
      MeanAveragePrecision: parseFloat(precision.toFixed(4))
    },
    details: {
      gtMatches,
      predMatches: predMatches.filter(m => m !== undefined)
    }
  }
}
