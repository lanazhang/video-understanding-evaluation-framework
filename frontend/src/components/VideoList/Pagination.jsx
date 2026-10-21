import './Pagination.css'

function Pagination({ 
  currentPage, 
  pageSize, 
  totalCount, 
  hasMore, 
  loading, 
  onPreviousPage, 
  onNextPage,
  getTotalPages
}) {
  return (
    <div className="pagination-container">
      <div className="pagination-info">
        Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} videos
      </div>
      <div className="pagination-controls">
        <button 
          className="btn-page" 
          onClick={onPreviousPage}
          disabled={currentPage === 1 || loading}
        >
          Previous
        </button>
        <span className="page-indicator">
          Page {currentPage} of {getTotalPages()}
        </span>
        <button 
          className="btn-page" 
          onClick={onNextPage}
          disabled={!hasMore || loading}
        >
          Next
        </button>
      </div>
    </div>
  )
}

export default Pagination
