function PaginationControls({ 
  currentPage, 
  pageSize, 
  totalCount, 
  hasMore, 
  loading, 
  onPrevious, 
  onNext 
}) {
  const getTotalPages = () => {
    return Math.ceil(totalCount / pageSize)
  }

  if (totalCount === 0) return null

  return (
    <div className="pagination-container">
      <div className="pagination-info">
        Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} videos
      </div>
      <div className="pagination-controls">
        <button 
          className="btn-page" 
          onClick={onPrevious}
          disabled={currentPage === 1 || loading}
        >
          Previous
        </button>
        <span className="page-indicator">
          Page {currentPage} of {getTotalPages()}
        </span>
        <button 
          className="btn-page" 
          onClick={onNext}
          disabled={!hasMore || loading}
        >
          Next
        </button>
      </div>
    </div>
  )
}

export default PaginationControls
