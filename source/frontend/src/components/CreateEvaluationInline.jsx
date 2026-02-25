import { useState, useEffect, useRef } from 'react'
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
  
  const videoPlayerRef = useRef(null)

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
      if (data.statusCode === 200) {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        setVideos(responseBody.videos || [])
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
      const data = await FetchPost('/video/get-analyze-tasks', { VideoId: videoId }, 'EvalService')
      if (data.statusCode === 200) {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        const tasks = responseBody.Tasks || []
        setAnalyzeTasks(tasks)
      }
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
    if (results.length === 0) {
      setError('Please run a search and get valid results before proceeding')
      return
    }
    setError(null)
    setSearchResults(results)
    setAllSearches(searches)
    
    // Set default evaluation name
    setEvaluationName(`${selectedVideo.Name} Evaluation`)
    
    // Calculate metrics immediately when entering step 3
    const result = calculateEvaluationMetrics(
      selectedGroundTruth.Labels || [],
      results,
      searches.map(s => s.query).join(', ')
    )
    setEvaluationMetrics(result.metrics)
    setMatchingDetails(result.details)
    setStep(3)
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
      
      // Step 1: Create a new ground truth with the search results as labels
      const searchGroundTruthId = crypto.randomUUID()
      const combinedQuery = allSearches.map(s => s.query).join(', ')
      const newLabels = searchResults.map(result => ({
        StartTs: parseFloat(parseFloat(result.StartSec || 0).toFixed(3)),
        EndTs: parseFloat(parseFloat(result.EndSec || 0).toFixed(3)),
        Score: parseFloat(result.Distance || 0),
        Label: combinedQuery,
        Source: 'model_generated',
        ReviewResult: 'unreviewed'
      }))

      const searchGTPayload = {
        Id: searchGroundTruthId,
        Name: `Search Results - ${combinedQuery}`,
        Description: `Generated from ${allSearches.length} search ${allSearches.length === 1 ? 'query' : 'queries'}: ${allSearches.map(s => `"${s.query}"`).join(', ')} on ${selectedAnalyzeTask.Type} model ${selectedAnalyzeTask.ModelId}`,
        CreatedBy: username,
        VideoId: selectedVideo.Id,
        VideoAnalyzeTaskIds: [selectedAnalyzeTask.Id],
        Labels: newLabels
      }

      await FetchPost('/video/upsert-ground-truth', searchGTPayload, 'EvalService')

      // Step 2: Create evaluation task with pre-calculated metrics
      const evaluationId = crypto.randomUUID()
      const payload = {
        Id: evaluationId,
        Name: evaluationName,
        Description: evaluationDescription || `Evaluation comparing "${selectedGroundTruth.Name}" with search results for ${allSearches.length} ${allSearches.length === 1 ? 'query' : 'queries'}: ${allSearches.map(s => `"${s.query}"`).join(', ')}`,
        VideoId: selectedVideo.Id,
        GroundTruthId: selectedGroundTruth.Id,
        CreatedBy: username,
        Status: 'completed',
        CompletedAt: new Date().toISOString(),
        AnalyzeTasks: [{
          VideoAnalyzeTaskId: selectedAnalyzeTask.Id,
          SearchGroundTruthId: searchGroundTruthId,
          SearchQuery: combinedQuery,
          SearchQueries: allSearches.map(s => s.query),
          EvaluationMetrics: evaluationMetrics
        }]
      }

      await evalAPI.upsertEvaluationTask(payload)
      
      if (onSuccess) {
        onSuccess()
      }
    } catch (err) {
      console.error('Error creating evaluation:', err)
      setError('Failed to create evaluation: ' + err.message)
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
          videoPlayerRef={videoPlayerRef}
        />
      )}

      {step === 3 && (
        <EvaluationReport
          evaluationName={evaluationName}
          evaluationDescription={evaluationDescription}
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
