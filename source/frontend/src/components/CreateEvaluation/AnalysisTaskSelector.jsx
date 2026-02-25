import { useState, useEffect } from 'react'
import SearchIndexModal from './SearchIndexModal'

function AnalysisTaskSelector({
  selectedVideo,
  analyzeTasks,
  selectedAnalyzeTask,
  loadingAnalyzeTasks,
  tasksError,
  onAnalyzeTaskSelect,
  onPrevious,
  onNext,
  initialSearchResults = [],
  initialAllSearches = []
}) {
  const [activeTab, setActiveTab] = useState('embedding')
  const [searchResults, setSearchResults] = useState(initialSearchResults)
  const [allSearches, setAllSearches] = useState(initialAllSearches)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [hasOpenedModalOnce, setHasOpenedModalOnce] = useState(initialSearchResults.length > 0)

  // Auto-open modal when an analyze task is selected for the first time
  useEffect(() => {
    if (selectedAnalyzeTask && !hasOpenedModalOnce && searchResults.length === 0) {
      setShowSearchModal(true)
      setHasOpenedModalOnce(true)
    }
  }, [selectedAnalyzeTask, hasOpenedModalOnce, searchResults.length])

  const handleAnalyzeTaskClick = (task) => {
    onAnalyzeTaskSelect(task)
    // Always open modal when clicking on a task
    setShowSearchModal(true)
  }

  const handleOpenSearchModal = () => {
    if (!selectedAnalyzeTask) {
      return
    }
    setShowSearchModal(true)
  }

  const handleSearchComplete = (results, searches) => {
    setSearchResults(results)
    setAllSearches(searches)
  }

  const handleNextStep = () => {
    onNext(searchResults, allSearches)
  }

  return (
    <div className="step-content">
      <div className="analyze-tabs">
        <button
          type="button"
          className={`tab-button ${activeTab === 'embedding' ? 'active' : ''}`}
          onClick={() => setActiveTab('embedding')}
        >
          Multimodal Embedding
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'understanding' ? 'active' : ''}`}
          onClick={() => setActiveTab('understanding')}
        >
          Video Understanding
        </button>
      </div>

      {activeTab === 'embedding' && (
        <div className="tab-content">
          {loadingAnalyzeTasks ? (
            <p>Loading analyze tasks...</p>
          ) : tasksError ? (
            <div className="alert alert-error">{tasksError}</div>
          ) : analyzeTasks.length === 0 ? (
            <p className="no-data">No analyze tasks available. Please create one from the Analyze view first.</p>
          ) : (
            <>
              <div className="analyze-task-section">
                <h3>Select Index</h3>
                <div className="analyze-task-list">
                  {analyzeTasks.map(task => (
                    <div
                      key={task.Id}
                      className={`analyze-task-item ${selectedAnalyzeTask?.Id === task.Id ? 'selected' : ''}`}
                      onClick={() => handleAnalyzeTaskClick(task)}
                    >
                      <div className="task-info">
                        <input
                          type="radio"
                          name="analyzeTask"
                          checked={selectedAnalyzeTask?.Id === task.Id}
                          onChange={() => handleAnalyzeTaskClick(task)}
                          className="task-radio"
                        />
                        <div className="task-details">
                          <div className="task-name">
                            {task.Type === 'nova-mme' ? 'Nova MME' : 'TwelveLabs'} - {task.ModelId}
                          </div>
                          <div className="task-meta">
                            Status: {task.Status} • Created {new Date(task.CreatedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      {selectedAnalyzeTask?.Id === task.Id && (
                        <div className="selection-checkmark">✓</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {selectedAnalyzeTask && searchResults.length > 0 && (
                <div className="search-section">
                  <div className="search-section-header">
                    <div className="search-section-info">
                      <h3>Search Index</h3>
                      <p className="search-description">
                        Search the selected index to find relevant video segments for evaluation.
                      </p>
                    <button 
                      className="btn-open-search"
                      onClick={handleOpenSearchModal}
                    >
                      Edit Results ({searchResults.length})
                    </button>
                  </div>

                  </div>

                  <div className="search-summary">
                    <div className="summary-stats">
                      <div className="stat-item">
                        <span className="stat-label">Queries:</span>
                        <span className="stat-value">{allSearches.length}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Total Segments:</span>
                        <span className="stat-value">{searchResults.length}</span>
                      </div>
                    </div>
                    <div className="search-queries-list">
                      {allSearches.map((search, idx) => (
                        <div key={idx} className="query-chip">
                          "{search.query}" ({search.results.length})
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'understanding' && (
        <div className="tab-content">
          <div className="coming-soon-section">
            <p>Video Understanding features coming soon.</p>
          </div>
        </div>
      )}

      <div className="step-actions">
        <button className="btn-secondary" onClick={onPrevious}>Back</button>
        <button 
          className="btn-primary" 
          onClick={handleNextStep}
          disabled={!selectedAnalyzeTask || searchResults.length === 0}
        >
          Next: Generate Report
        </button>
      </div>

      {showSearchModal && (
        <SearchIndexModal
          selectedVideo={selectedVideo}
          selectedAnalyzeTask={selectedAnalyzeTask}
          onClose={() => setShowSearchModal(false)}
          onSearchComplete={handleSearchComplete}
          initialSearchResults={searchResults}
          initialAllSearches={allSearches}
        />
      )}
    </div>
  )
}

export default AnalysisTaskSelector
