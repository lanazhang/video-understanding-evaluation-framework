import './SearchBar.css'

function SearchBar({ searchQuery, onSearchChange, onClear }) {
  return (
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
          onClick={onClear}
          title="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  )
}

export default SearchBar
