import { useState, useEffect } from 'react'
import './CreateEvaluationInline.css'
import { FetchPost } from '../utils/apiHelper'
import { evalAPI } from '../utils/api'
import arrowLeftIcon from '../assets/icons/arrow-left.svg'
import StepIndicator from './CreateEvaluation/StepIndicator'
import VideoGroundTruthSelector from './CreateEvaluation/VideoGroundTruthSelector'
import AnalysisTaskSelector from './CreateEvaluation/AnalysisTaskSelector'
import EvaluationReport from './CreateEvaluation/EvaluationReport'
import SegmentDetailModal from './CreateEvaluation/SegmentDetailModal'
import { calculateEvaluationMetrics } from './CreateEvaluation/evaluationUtils'

function CreateEvaluationInline({ currentUser, onCancel, onSuccess }) {
  const [step, setStep] = useState(1)
  const [videos, setVideos] = useState([])
  const [groundTruths, setGroundTruths] = useState([])
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [selectedGroundTruth, setSelectedGroundTruth] = useState(null)
  const [analyzeTasks, setAnalyzeTasks] = useState([])
  const [selectedAnalyzeTask, setSelectedAnalyzeTask] = useState(null)
  const [evaluationName, setEvaluationName] = useState('')
  const [evaluationDescription, setEvaluationDescription] = useState('')
  const [bufferTime, setBufferTime] = useState(1.00) // Buffer time in seconds with 2 decimal places
  const [evaluationMetrics, setEvaluationMetrics] = useState(null)
  const [matchingDetails, setMatchingDetails] = useState(null)
  const [selectedSegment, setSelectedSegment] = useState(null)
  const [showSegmentModal, setShowSegmentModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [loadingVideos, setLoadingVideos] = useState(false)
  const [loadingGroundTruths, setLoadingGroundTruths] = useState(false)
  const [loadingAnalyzeTasks, setLoadingAnalyzeTasks] = useState(false)
  const [tasksError, setTasksError] = useState(null)
  
  // Search state - managed in step 2
  const [searchResults, setSearchResults] = useState([])
  const [allSearches, setAllSearches] = useState([])

  useEffect(() => {
    fetchVideos()
  }, [])

  useEffect(() => {
    if (selectedVideo) {
      fetchGroundTruths(selectedVideo.Id)
      fetchAnalyzeTasks(selectedVideo.Id)
    }
  }, [selectedVideo])

  const fetchVideos = async () => {
    setLoadingVideos(true)
    try {
      const data = await FetchPost('/video/get-videos', {}, 'EvalService')
      // FetchPost returns parsed JSON directly, check for videos array
      if (data.videos !== undefined) {
        setVideos(data.videos || [])
      } else if (data.error) {
        console.error('Error fetching videos:', data.error)
      }
    } catch (err) {
      console.error('Error fetching videos:', err)
    } finally {
      setLoadingVideos(false)
    }
  }

  const fetchGroundTruths = async (videoId) => {
    setLoadingGroundTruths(true)
    try {
      const response = await evalAPI.getGroundTruths(videoId)
      const responseBody = typeof response.body === 'string' ? JSON.parse(response.body) : response.body || response
      setGroundTruths(responseBody.groundTruths || [])
    } catch (err) {
      console.error('Error fetching ground truths:', err)
      setGroundTruths([])
    } finally {
      setLoadingGroundTruths(false)
    }
  }

  const fetchAnalyzeTasks = async (videoId) => {
    setLoadingAnalyzeTasks(true)
    setTasksError(null)
    try {
      const data = await FetchPost('/analyze/get-analyze-tasks', { VideoId: videoId }, 'EvalService')
      
      // Handle response - check if it's wrapped in statusCode/body or direct
      let responseBody
      if (data.statusCode) {
        // Lambda response format
        if (data.statusCode === 200) {
          responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        } else {
          const errorMessage = typeof data.body === 'object' && data.body.error 
            ? data.body.error 
            : (typeof data.body === 'string' ? JSON.parse(data.body).error : data.body)
          setTasksError(errorMessage || 'Failed to load analyze tasks')
          setAnalyzeTasks([])
          return
        }
      } else {
        // Direct response format
        responseBody = data
      }
      
      const tasks = responseBody.Tasks || []
      setAnalyzeTasks(tasks)
    } catch (err) {
      console.error('Error fetching analyze tasks:', err)
      setTasksError('Failed to load analyze tasks')
      setAnalyzeTasks([])
    } finally {
      setLoadingAnalyzeTasks(false)
    }
  }

  const handleVideoSelect = (video) => {
    setSelectedVideo(video)
    setSelectedGroundTruth(null)
    setSelectedAnalyzeTask(null)
    setSearchResults([])
    setAllSearches([])
  }

  const handleGroundTruthSelect = (gt) => {
    setSelectedGroundTruth(gt)
  }

  const handleAnalyzeTaskSelect = (task) => {
    setSelectedAnalyzeTask(task)
  }

  const handleStep1Next = () => {
    if (!selectedVideo) {
      setError('Please select a video')
      return
    }
    if (!selectedGroundTruth) {
      setError('Please select a ground truth')
      return
    }
    setError(null)
    setStep(2)
  }

  const handleStep2Next = (results, searches) => {
    if (!selectedAnalyzeTask) {
      setError('Please select an analyze task')
      return
    }
    
    // For video understanding tasks, extract labels from the task result
    let finalResults = results
    let finalSearches = searches
    
    if (selectedAnalyzeTask.Type === 'video-understanding') {
      // Parse labels from video understanding task
      const parsedLabels = parseVideoUnderstandingLabels(selectedAnalyzeTask)
      if (parsedLabels.length > 0) {
        finalResults = parsedLabels
        finalSearches = [{
          taskId: selectedAnalyzeTask.Id,
          taskName: selectedAnalyzeTask.Name || selectedAnalyzeTask.Description || selectedAnalyzeTask.ModelId,
          taskType: 'video-understanding',
          query: selectedAnalyzeTask.Request?.Prompt || selectedAnalyzeTask.Request?.InputPrompt || 'Video Understanding',
          topK: parsedLabels.length,
          results: parsedLabels
        }]
      }
    }
    
    // For embedding tasks, require search results
    if ((selectedAnalyzeTask.Type === 'nova-mme' || selectedAnalyzeTask.Type === 'tlabs-mme') && finalResults.length === 0) {
      setError('Please run a search and get valid results before proceeding')
      return
    }
    
    setError(null)
    setSearchResults(finalResults)
    setAllSearches(finalSearches)
    
    // Generate comprehensive default description
    const modelType = selectedAnalyzeTask.Type === 'nova-mme' ? 'Nova MME' : 
                      selectedAnalyzeTask.Type === 'tlabs-mme' ? 'TwelveLabs' : 
                      'Video Understanding'
    const modelId = selectedAnalyzeTask.ModelId
    
    // Set default evaluation name: video name + model name
    setEvaluationName(`${selectedVideo.Name} - ${modelId}`)
    const searchQueries = finalSearches.map(s => `"${s.query}"`).join(', ')
    const numResults = finalResults.length
    const gtDescription = selectedGroundTruth.Description ? `\n\nGround Truth: ${selectedGroundTruth.Description}` : ''
    
    const defaultDescription = `Evaluation of ${modelType} model (${modelId}) performance against ground truth "${selectedGroundTruth.Name}".\n\nSearch queries: ${searchQueries}\nTotal results found: ${numResults} segments${gtDescription}`
    
    setEvaluationDescription(defaultDescription)
    
    // Calculate metrics immediately when entering step 3
    const result = calculateEvaluationMetrics(
      selectedGroundTruth.Labels || [],
      finalResults,
      finalSearches.map(s => s.query).join(', '),
      finalSearches,
      bufferTime // Pass buffer time to calculation
    )
    setEvaluationMetrics(result.metrics)
    setMatchingDetails(result.details)
    setStep(3)
  }

  // Helper function to parse video understanding task labels
  const parseVideoUnderstandingLabels = (task) => {
    if (!task.Result || !task.Result.Response) return []
    
    try {
      let content = task.Result.Response.content || task.Result.Response.message || task.Result.Response
      
      if (typeof content === 'string') {
        try {
          content = JSON.parse(content)
        } catch {
          return []
        }
      }
      
      const labels = []
      
      // Try to parse as array of items with timestamps
      if (Array.isArray(content)) {
        for (const [index, item] of content.entries()) {
          if (item.start_time !== undefined && item.end_time !== undefined) {
            labels.push({
              StartSec: parseFloat(item.start_time),
              EndSec: parseFloat(item.end_time),
              Distance: 0,
              query: item.description || item.text || `Item ${index + 1}`,
              source: 'video-understanding'
            })
          }
        }
      }
      // Try to parse as object with scenes array
      else if (content.scenes && Array.isArray(content.scenes)) {
        content.scenes.forEach((scene, index) => {
          if (scene.start_time !== undefined && scene.end_time !== undefined) {
            labels.push({
              StartSec: parseFloat(scene.start_time),
              EndSec: parseFloat(scene.end_time),
              Distance: 0,
              query: scene.description || `Scene ${index + 1}`,
              source: 'video-understanding'
            })
          }
        })
      }
      // Try to parse as object with moments array
      else if (content.moments && Array.isArray(content.moments)) {
        content.moments.forEach((moment, index) => {
          if (moment.start_time !== undefined && moment.end_time !== undefined) {
            labels.push({
              StartSec: parseFloat(moment.start_time),
              EndSec: parseFloat(moment.end_time),
              Distance: 0,
              query: moment.description || `Moment ${index + 1}`,
              source: 'video-understanding'
            })
          }
        })
      }
      
      return labels
    } catch (error) {
      console.error('Error parsing video understanding labels:', error)
      return []
    }
  }

  const handlePreviousStep = () => {
    setError(null)
    setStep(prev => prev - 1)
  }

  const handleSegmentClick = (match, type) => {
    setSelectedSegment({ ...match, type })
    setShowSegmentModal(true)
  }

  const handleCloseSegmentModal = () => {
    setShowSegmentModal(false)
    setSelectedSegment(null)
  }

  const handleGenerateReport = async () => {
    if (!evaluationName.trim()) {
      setError('Please enter an evaluation name')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const username = currentUser?.username || currentUser?.signInDetails?.loginId || 'user'
      
      // Prepare labels from search results
      const combinedQuery = allSearches.map(s => s.query).join(', ')
      const labels = searchResults.map(result => ({
        StartTs: parseFloat(parseFloat(result.StartSec || 0).toFixed(3)),
        EndTs: parseFloat(parseFloat(result.EndSec || 0).toFixed(3)),
        Score: parseFloat(result.Distance || 0),
        Label: combinedQuery,
        ReviewResult: 'unreviewed'
      }))

      // Create evaluation task with labels and metrics
      const evaluationId = crypto.randomUUID()
      const payload = {
        Id: evaluationId,
        Name: evaluationName,
        Description: evaluationDescription || `Evaluation comparing "${selectedGroundTruth.Name}" with search results for ${allSearches.length} ${allSearches.length === 1 ? 'query' : 'queries'}: ${allSearches.map(s => `"${s.query}"`).join(', ')}`,
        VideoId: selectedVideo.Id,
        VideoAnalyzeTaskId: selectedAnalyzeTask.Id,
        GroundTruthId: selectedGroundTruth.Id,
        CreatedBy: username,
        Status: 'completed',
        CompletedAt: new Date().toISOString(),
        Labels: labels,
        EvaluationMetrics: evaluationMetrics,
        BufferTime: parseFloat(bufferTime.toFixed(2))
      }

      await evalAPI.upsertEvaluationTask(payload)
      
      if (onSuccess) {
        onSuccess()
      }
    } catch (err) {
      console.error('Error creating evaluation:', err)
      // Check if the error response contains a specific error message
      let errorMessage = 'Failed to create evaluation'
      if (err.response?.body) {
        try {
          const errorBody = typeof err.response.body === 'string' 
            ? JSON.parse(err.response.body) 
            : err.response.body
          errorMessage = errorBody.error || errorMessage
        } catch (parseErr) {
          // If parsing fails, use the original error message
        }
      } else if (err.message) {
        errorMessage = err.message
      }
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="create-evaluation-inline">
      <div className="create-evaluation-header">
        <button className="btn-back" onClick={onCancel}>
          <img src={arrowLeftIcon} alt="Back" />
          Back to List
        </button>
        <h1>Create Evaluation</h1>
      </div>

      <StepIndicator currentStep={step} />

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {step === 1 && (
        <VideoGroundTruthSelector
          videos={videos}
          groundTruths={groundTruths}
          selectedVideo={selectedVideo}
          selectedGroundTruth={selectedGroundTruth}
          loadingVideos={loadingVideos}
          loadingGroundTruths={loadingGroundTruths}
          onVideoSelect={handleVideoSelect}
          onGroundTruthSelect={handleGroundTruthSelect}
          onCancel={onCancel}
          onNext={handleStep1Next}
        />
      )}

      {step === 2 && (
        <AnalysisTaskSelector
          selectedVideo={selectedVideo}
          analyzeTasks={analyzeTasks}
          selectedAnalyzeTask={selectedAnalyzeTask}
          loadingAnalyzeTasks={loadingAnalyzeTasks}
          tasksError={tasksError}
          onAnalyzeTaskSelect={handleAnalyzeTaskSelect}
          onPrevious={handlePreviousStep}
          onNext={handleStep2Next}
          initialSearchResults={searchResults}
          initialAllSearches={allSearches}
        />
      )}

      {step === 3 && (
        <EvaluationReport
          evaluationName={evaluationName}
          evaluationDescription={evaluationDescription}
          bufferTime={bufferTime}
          onBufferTimeChange={setBufferTime}
          selectedVideo={selectedVideo}
          selectedGroundTruth={selectedGroundTruth}
          selectedAnalyzeTask={selectedAnalyzeTask}
          allSearches={allSearches}
          searchResults={searchResults}
          evaluationMetrics={evaluationMetrics}
          matchingDetails={matchingDetails}
          loading={loading}
          onNameChange={setEvaluationName}
          onDescriptionChange={setEvaluationDescription}
          onSegmentClick={handleSegmentClick}
          onPrevious={handlePreviousStep}
          onSave={handleGenerateReport}
          onRecalculate={() => {
            const result = calculateEvaluationMetrics(
              selectedGroundTruth.Labels || [],
              searchResults,
              allSearches.map(s => s.query).join(', '),
              allSearches,
              bufferTime
            )
            setEvaluationMetrics(result.metrics)
            setMatchingDetails(result.details)
          }}
        />
      )}

      {showSegmentModal && (
        <SegmentDetailModal
          segment={selectedSegment}
          selectedVideo={selectedVideo}
          onClose={handleCloseSegmentModal}
        />
      )}
    </div>
  )
}

export default CreateEvaluationInline
