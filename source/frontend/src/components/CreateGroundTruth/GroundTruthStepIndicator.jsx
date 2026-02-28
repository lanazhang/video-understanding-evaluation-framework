function GroundTruthStepIndicator({ currentStep }) {
  const steps = [
    { number: 1, label: 'Select Video', description: '' },
    { number: 2, label: 'Analyze Video', description: '' },
    { number: 3, label: 'Review Labels', description: '' },
    { number: 4, label: 'Save', description: '' }
  ]

  return (
    <div className="step-indicator-container">
      <div className="step-indicator">
        {steps.map((step, index) => (
          <>
            {index > 0 && <div key={`line-${step.number}`} className="step-line"></div>}
            <div key={step.number} className={`step ${currentStep >= step.number ? 'active' : ''} ${currentStep > step.number ? 'completed' : ''}`}>
              <div className="step-number">
                {currentStep > step.number ? (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16.6667 5L7.50004 14.1667L3.33337 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : currentStep === step.number ? (
                  step.number === 1 ? (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="4" y="4" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
                      <path d="M8 10L10 12L12 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : step.number === 2 ? (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="2"/>
                      <path d="M12.5 12.5L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  ) : step.number === 3 ? (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2 10C2 10 5 4 10 4C15 4 18 10 18 10C18 10 15 16 10 16C5 16 2 10 2 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M15 7L9 13L5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M10 3V7M10 13V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  )
                ) : (
                  step.number
                )}
              </div>
              <div className="step-label">{step.label}</div>
              {currentStep === step.number && step.description && (
                <div className="step-description">{step.description}</div>
              )}
            </div>
          </>
        ))}
      </div>
    </div>
  )
}

export default GroundTruthStepIndicator
