function GroundTruthStepIndicator({ currentStep }) {
  const steps = [
    { number: 1, label: 'Select Video', description: '' },
    { number: 2, label: 'Analyze Video', description: '' },
    { number: 3, label: 'Review & Save', description: '' }
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
                ) : step.number === 1 ? (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="4" y="4" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
                    <path d="M8 10L10 12L12 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : step.number === 2 ? (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="2"/>
                    <path d="M12.5 12.5L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 3.33334V10M10 10V16.6667M10 10H16.6667M10 10H3.33337" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
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
