import './SearchBar.css'
import refreshIcon from '../../assets/icons/refresh.svg'

function SearchBar({ searchQuery, onSearchChange, onRefresh, loading }) {
  return (
    <div className="search-bar-container">
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search videos..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="search-input"
        />
        {searchQuery && (
          <button 
            className="btn-clear-search"
            onClick={() => onSearchChange('')}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>
      <button 
        className="btn-refresh" 
        onClick={onRefresh}
        disabled={loading}
        title="Refresh video list"
      >
        <img src={refreshIcon} alt="Refresh" />
      </button>
    </div>
  )
}

export default SearchBar
