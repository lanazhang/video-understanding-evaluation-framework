import { useState, useEffect } from 'react'
import './CreateGroundTruthInline.css'
import { FetchPost } from '../utils/apiHelper'
import arrowLeftIcon from '../assets/icons/arrow-left.svg'
import GroundTruthStepIndicator from './CreateGroundTruth/GroundTruthStepIndicator'
import EmbeddingSearch from './GroundTruth/EmbeddingSearch'
import GroundTruthReview from './GroundTruth/GroundTruthReview'

function CreateGroundTruthInline({ currentUser, onCancel, onSuccess }) {
  const [step, setStep] = useState(1)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [videos, setVideos] = useState([])
  const [loadingVideos, setLoadingVideos] = useState(false)
  const [videoError, setVideoError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(12)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  
  // Step 2 data
  const [allSearches, setAllSearches] = useState([])
  const [allResults, setAllResults] = useState([])

  useEffect(() => {
    fetchVideos()
  }, [currentPage, searchQuery])

  const fetchVideos = async () => {
    setLoadingVideos(true)
    setVideoError(null)
    
    try {
      const startIndex = (currentPage - 1) * pageSize
      
      const payload = {
        start_index: startIndex,
        page_size: pageSize,
        uploaded_by: '',
        group: ''
      }
      
      const data = await FetchPost('/video/get-videos', payload, 'EvalService')
      
      if (data.statusCode === 200) {
        const responseBody = typeof data.body === 'string' ? JSON.parse(data.body) : data.body
        setVideos(responseBody.videos || [])
        setTotalCount(responseBody.total_count || 0)
        setHasMore(responseBody.has_more || false)
      } else {
        const errorMessage = typeof data.body === 'object' && data.body.error 
          ? data.body.error 
          : data.body
        setVideoError(errorMessage || 'Failed to fetch videos')
      }
    } catch (err) {
      console.error('Error fetching videos:', err)
      setVideoError(err.message || 'Failed to fetch videos')
    } finally {
      setLoadingVideos(false)
    }
  }

  const handleVideoSelect = (video) => {
    setSelectedVideo(video)
    setStep(2)
  }

  const handleBackToVideoList = () => {
    setSelectedVideo(null)
    setStep(1)
  }

  const handleStep2Next = (searches, results) => {
    setAllSearches(searches)
    setAllResults(results)
    setStep(3)
  }

  const handleStep3Previous = () => {
    setStep(2)
  }

  const handleStep3Update = (updatedSearches, updatedResults) => {
    setAllSearches(updatedSearches)
    setAllResults(updatedResults)
  }

  const handleGroundTruthSaved = () => {
    if (onSuccess) {
      onSuccess()
    }
  }

  const getThumbnailUrl = (video) => {
    if (video.thumbnail_url) {
      return video.thumbnail_url
    }
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"%3E%3Crect width="160" height="90" fill="%23e0e0e0"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="%23666"%3ENo Thumbnail%3C/text%3E%3C/svg%3E'
  }

  const filteredVideos = videos.filter(video => {
    const query = searchQuery.toLowerCase()
    const name = video.Name?.toLowerCase() || ''
    return name.includes(query)
  })

  const getTotalPages = () => {
    return Math.ceil(totalCount / pageSize)
  }

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (hasMore) {
      setCurrentPage(currentPage + 1)
    }
  }

  // If no video selected, show video selection (Step 1)
  if (step === 1) {
    return (
      <div className="create-ground-truth-inline">
        <div className="create-ground-truth-header">
          <button className="btn-back" onClick={onCancel}>
            <img src={arrowLeftIcon} alt="Back" />
            Back to List
          </button>
          <h1>Create Ground Truth</h1>
        </div>

        <GroundTruthStepIndicator currentStep={step} />

        <div className="wizard-step-content">
          <div className="video-search">
            <input
              type="text"
              placeholder="Search videos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          {videoError && (
            <div className="alert alert-error">{videoError}</div>
          )}

          {loadingVideos ? (
            <div className="loading-message">Loading videos...</div>
          ) : (
            <>
              <div className="video-grid">
                {filteredVideos.map(video => {
                  const videoId = video.Id || video.id
                  return (
                    <div
                      key={videoId}
                      className="video-card"
                      onClick={() => handleVideoSelect(video)}
                    >
                      <img
                        src={getThumbnailUrl(video)}
                        alt={video.Name}
                        className="video-card-thumbnail"
                        onError={(e) => {
                          e.target.src = getThumbnailUrl({})
                        }}
                      />
                      <div className="video-card-info">
                        <div className="video-card-name">{video.Name}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {totalCount > 0 && (
                <div className="video-pagination">
                  <button
                    type="button"
                    className="btn-page"
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1 || loadingVideos}
                  >
                    Previous
                  </button>
                  <span className="page-info">
                    Page {currentPage} of {getTotalPages()}
                  </span>
                  <button
                    type="button"
                    className="btn-page"
                    onClick={handleNextPage}
                    disabled={!hasMore || loadingVideos}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // Step 2: Video selected, show EmbeddingSearch component
  if (step === 2) {
    return (
      <div className="create-ground-truth-inline">
        <div className="create-ground-truth-header">
          <button className="btn-back" onClick={handleBackToVideoList}>
            <img src={arrowLeftIcon} alt="Back" />
            Back to Videos
          </button>
          <h1>Create Ground Truth</h1>
        </div>

        <GroundTruthStepIndicator currentStep={step} />

        <div className="wizard-step-content">
          <EmbeddingSearch 
            video={selectedVideo} 
            onNext={handleStep2Next}
            currentUser={currentUser}
            initialSearches={allSearches}
            initialResults={allResults}
          />
        </div>
      </div>
    )
  }

  // Step 3: Review and Save
  if (step === 3) {
    return (
      <div className="create-ground-truth-inline">
        <div className="create-ground-truth-header">
          <button className="btn-back" onClick={onCancel}>
            <img src={arrowLeftIcon} alt="Back" />
            Back to List
          </button>
          <h1>Create Ground Truth</h1>
        </div>

        <GroundTruthStepIndicator currentStep={step} />

        <div className="wizard-step-content">
          <GroundTruthReview
            video={selectedVideo}
            allSearches={allSearches}
            allResults={allResults}
            onPrevious={handleStep3Previous}
            onUpdate={handleStep3Update}
            onSave={handleGroundTruthSaved}
            currentUser={currentUser}
          />
        </div>
      </div>
    )
  }

  // Step 1: Video selected, show EmbeddingSearch component
  return (
    <div className="create-ground-truth-inline">
      <div className="create-ground-truth-header">
        <button className="btn-back" onClick={handleBackToVideoList}>
          <img src={arrowLeftIcon} alt="Back" />
          Back to Videos
        </button>
        <h1>Create Ground Truth</h1>
      </div>

      <GroundTruthStepIndicator currentStep={step} />

      <div className="wizard-step-content">
        <div className="step-header">
          <h2>Step 2: Search & Create Ground Truth</h2>
          <p>Select an embedding index and search to generate ground truth labels</p>
        </div>

        <EmbeddingSearch 
          video={selectedVideo} 
          onGroundTruthSaved={handleGroundTruthSaved}
          currentUser={currentUser}
        />
      </div>
    </div>
  )
}

export default CreateGroundTruthInline
