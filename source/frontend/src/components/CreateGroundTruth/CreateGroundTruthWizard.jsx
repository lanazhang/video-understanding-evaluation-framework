import { useState } from 'react'
import './CreateGroundTruthWizard.css'
import arrowLeftIcon from '../../assets/icons/arrow-left.svg'
import GroundTruthStepIndicator from './GroundTruthStepIndicator'
import VideoSelector from './VideoSelector'
import LabelCreator from './LabelCreator'
import ManualLabel from '../GroundTruth/ManualLabel'
import GroundTruthReview from '../GroundTruth/GroundTruthReview'

function CreateGroundTruthWizard({ currentUser, onCancel, onSuccess }) {
  const [step, setStep] = useState(1)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [allSearches, setAllSearches] = useState([])
  const [allResults, setAllResults] = useState([])
  const [activeTab, setActiveTab] = useState('manual')
  const [isMaximized, setIsMaximized] = useState(false)

  const handleVideoSelect = (video) => {
    setSelectedVideo(video)
    setStep(2)
  }

  const handleBackToVideoList = () => {
    setSelectedVideo(null)
    setAllSearches([])
    setAllResults([])
    setStep(1)
  }

  const handleLabelsNext = (searches, results) => {
    setAllSearches(searches)
    setAllResults(results)
    setStep(3)
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
  }

  const handleReviewLabelsNext = () => {
    setStep(4)
  }

  const handleReviewLabelsPrevious = () => {
    setStep(2)
  }

  const handleReviewPrevious = () => {
    setStep(3)
  }

  const handleGroundTruthSaved = () => {
    if (onSuccess) {
      onSuccess()
    }
  }

  const getStepTitle = () => {
    switch (step) {
      case 1:
        return 'Select Video'
      case 2:
        return 'Create Labels'
      case 3:
        return 'Review Labels'
      case 4:
        return 'Save'
      default:
        return 'Create Ground Truth'
    }
  }

  return (
    <div className="create-ground-truth-wizard">
      <div className="wizard-header">
        <button className="btn-back" onClick={step === 1 ? onCancel : handleBackToVideoList}>
          <img src={arrowLeftIcon} alt="Back" />
          {step === 1 ? 'Back to List' : 'Back to Videos'}
        </button>
        <h1>Create Ground Truth - {getStepTitle()}</h1>
      </div>

      <GroundTruthStepIndicator currentStep={step} />

      <div className={`wizard-content ${(step === 2 && activeTab === 'manual') || step === 3 ? 'full-height' : ''}`}>
        {step === 1 && (
          <VideoSelector onVideoSelect={handleVideoSelect} />
        )}

        {step === 2 && selectedVideo && (
          <LabelCreator
            video={selectedVideo}
            currentUser={currentUser}
            initialSearches={allSearches}
            initialResults={allResults}
            onNext={handleLabelsNext}
            onTabChange={handleTabChange}
          />
        )}

        {step === 3 && selectedVideo && (
          <div className={`review-labels-step ${isMaximized ? 'maximized' : ''}`}>
            <div className="review-labels-controls">
              <button 
                className="btn-maximize"
                onClick={() => setIsMaximized(!isMaximized)}
                title={isMaximized ? 'Exit fullscreen' : 'Maximize'}
              >
                {isMaximized ? (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 3H3V8M12 3H17V8M8 17H3V12M12 17H17V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8V3H8M17 8V3H12M3 12V17H8M17 12V17H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                <span>{isMaximized ? 'Exit Fullscreen' : 'Maximize'}</span>
              </button>
            </div>
            <ManualLabel
              video={selectedVideo}
              allResults={allResults}
              setAllResults={setAllResults}
              isMaximized={isMaximized}
              resetTrigger={0}
            />
            {!isMaximized && (
              <div className="review-labels-actions">
                <button className="btn-secondary" onClick={handleReviewLabelsPrevious}>
                  Previous
                </button>
                <button className="btn-primary" onClick={handleReviewLabelsNext}>
                  Next: Save Ground Truth
                </button>
              </div>
            )}
          </div>
        )}

        {step === 4 && selectedVideo && (
          <GroundTruthReview
            video={selectedVideo}
            allSearches={allSearches}
            allResults={allResults}
            onPrevious={handleReviewPrevious}
            onSave={handleGroundTruthSaved}
            currentUser={currentUser}
          />
        )}
      </div>
    </div>
  )
}

export default CreateGroundTruthWizard
