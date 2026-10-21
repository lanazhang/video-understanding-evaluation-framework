function GroundTruthStepIndicator({ currentStep }) {
  const steps = [
    { number: 1, label: 'Select Video', description: '' },
    { number: 2, label: 'Generate Labels', description: '' },
    { number: 3, label: 'Review & Label', description: '' },
    { number: 4, label: 'Save', description: '' }
  ]

  const getStepIcon = (stepNumber, isActive) => {
    // Completed step - show checkmark
    if (currentStep > stepNumber) {
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16.6667 5L7.50004 14.1667L3.33337 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    }

    // Active or inactive step - show step-specific icon
    if (isActive || currentStep < stepNumber) {
      switch (stepNumber) {
        case 1: // Select Video - Video/Film icon
          return (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 9L12 11.5L8 14V9Z" fill="currentColor"/>
            </svg>
          )
        case 2: // Generate Labels - AI/Sparkle icon
          return (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 2L11.5 7.5L17 9L11.5 10.5L10 16L8.5 10.5L3 9L8.5 7.5L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" fillOpacity="0.2"/>
              <path d="M15 3L15.75 5.25L18 6L15.75 6.75L15 9L14.25 6.75L12 6L14.25 5.25L15 3Z" fill="currentColor"/>
            </svg>
          )
        case 3: // Review & Label - Edit/Pencil icon
          return (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.5 2.5C14.8978 2.10217 15.4374 1.87868 16 1.87868C16.2786 1.87868 16.5544 1.93355 16.8118 2.04015C17.0692 2.14674 17.303 2.30301 17.5 2.5C17.697 2.69698 17.8533 2.93083 17.9599 3.18819C18.0665 3.44556 18.1213 3.72141 18.1213 4C18.1213 4.27859 18.0665 4.55444 17.9599 4.81181C17.8533 5.06917 17.697 5.30302 17.5 5.5L6.5 16.5L2 18L3.5 13.5L14.5 2.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )
        case 4: // Save - Save/Download icon
          return (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 11V15C16 15.5304 15.7893 16.0391 15.4142 16.4142C15.0391 16.7893 14.5304 17 14 17H6C5.46957 17 4.96086 16.7893 4.58579 16.4142C4.21071 16.0391 4 15.5304 4 15V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 3V13M10 13L7 10M10 13L13 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )
        default:
          return stepNumber
      }
    }

    return stepNumber
  }

  return (
    <div className="step-indicator-container">
      <div className="step-indicator">
        {steps.map((step, index) => (
          <>
            {index > 0 && <div key={`line-${step.number}`} className="step-line"></div>}
            <div key={step.number} className={`step ${currentStep >= step.number ? 'active' : ''} ${currentStep > step.number ? 'completed' : ''}`}>
              <div className="step-number">
                {getStepIcon(step.number, currentStep === step.number)}
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
