// Utility functions for evaluation calculations

export const calculateEvaluationMetrics = (groundTruthLabels, searchResults, searchQuery, allSearches = []) => {
  // Filter ground truth labels to only include those marked as true_positive or reviewed
  // Other labels (false_positive, unreviewed, etc.) should not be used for metrics calculation
  const validGTLabels = groundTruthLabels.filter(
    label => label.ReviewResult === 'true_positive' || label.ReviewResult === 'reviewed'
  )

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
  // Mark ALL overlapping predictions as TP (not just best match)
  let truePositives = 0
  let falsePositives = 0
  let falseNegatives = 0
  let totalIoU = 0
  let matchedPredictions = new Set()
  
  // Store detailed matching information
  const gtMatches = []
  const predMatches = []

  // For each prediction, check if it overlaps with ANY ground truth
  predictedLabels.forEach((predLabel, predIdx) => {
    let foundMatch = false
    let bestIoU = 0
    let bestGtIdx = -1

    validGTLabels.forEach((gtLabel, validIdx) => {
      const gtIdx = groundTruthLabels.indexOf(gtLabel)
      
      if (hasOverlap(gtLabel, predLabel)) {
        foundMatch = true
        const iou = calculateIoU(gtLabel, predLabel)
        if (iou > bestIoU) {
          bestIoU = iou
          bestGtIdx = gtIdx
        }
      }
    })

    if (foundMatch) {
      truePositives++
      totalIoU += bestIoU
      matchedPredictions.add(predIdx)
      predMatches[predIdx] = {
        predIndex: predIdx,
        predLabel: predLabel,
        gtIndex: bestGtIdx,
        gtLabel: groundTruthLabels[bestGtIdx],
        iou: bestIoU,
        status: 'TP'
      }
    } else {
      falsePositives++
      predMatches[predIdx] = {
        predIndex: predIdx,
        predLabel: predLabel,
        gtIndex: null,
        gtLabel: null,
        iou: 0,
        status: 'FP'
      }
    }
  })

  // For each ground truth, check if it has at least one matching prediction
  validGTLabels.forEach((gtLabel, validIdx) => {
    const gtIdx = groundTruthLabels.indexOf(gtLabel)
    
    let foundMatch = false
    let bestIoU = 0
    let bestPredIdx = -1

    predictedLabels.forEach((predLabel, predIdx) => {
      if (hasOverlap(gtLabel, predLabel)) {
        foundMatch = true
        const iou = calculateIoU(gtLabel, predLabel)
        if (iou > bestIoU) {
          bestIoU = iou
          bestPredIdx = predIdx
        }
      }
    })

    if (foundMatch) {
      gtMatches.push({
        gtIndex: gtIdx,
        gtLabel: gtLabel,
        predIndex: bestPredIdx,
        predLabel: predictedLabels[bestPredIdx],
        iou: bestIoU,
        status: 'TP'
      })
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

  // Calculate basic metrics
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
  const accuracy = validGTLabels.length > 0
    ? truePositives / validGTLabels.length
    : 0

  // Calculate proper mAP (Mean Average Precision)
  let meanAveragePrecision = precision // fallback to simple precision
  
  if (allSearches && allSearches.length > 0) {
    // Calculate AP for each query separately
    const averagePrecisions = allSearches.map(search => {
      const queryResults = search.results || []
      
      // Sort predictions by confidence (lower distance = higher confidence)
      const sortedPredictions = queryResults
        .map((result, idx) => ({
          StartTs: parseFloat(result.StartSec || 0),
          EndTs: parseFloat(result.EndSec || 0),
          Score: parseFloat(result.Distance || 0),
          originalIndex: idx
        }))
        .sort((a, b) => a.Score - b.Score) // Lower distance is better
      
      if (sortedPredictions.length === 0) return 0
      
      // Calculate precision at each position where we have a true positive
      let numCorrect = 0
      let sumPrecisions = 0
      let numRelevant = 0
      
      sortedPredictions.forEach((pred, rank) => {
        // Check if this prediction matches any ground truth
        const matchesGT = validGTLabels.some(gt => hasOverlap(gt, pred))
        
        if (matchesGT) {
          numCorrect++
          const precisionAtK = numCorrect / (rank + 1)
          sumPrecisions += precisionAtK
        }
      })
      
      // Count how many ground truth segments are relevant to this query
      // For simplicity, we consider all valid GT labels as relevant
      numRelevant = validGTLabels.length
      
      // Average Precision = sum of precisions at relevant positions / number of relevant items
      return numRelevant > 0 ? sumPrecisions / numRelevant : 0
    })
    
    // mAP is the mean of all Average Precisions
    meanAveragePrecision = averagePrecisions.length > 0
      ? averagePrecisions.reduce((sum, ap) => sum + ap, 0) / averagePrecisions.length
      : precision
  }

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
      MeanAveragePrecision: parseFloat(meanAveragePrecision.toFixed(4))
    },
    details: {
      gtMatches,
      predMatches: predMatches.filter(m => m !== undefined)
    }
  }
}
