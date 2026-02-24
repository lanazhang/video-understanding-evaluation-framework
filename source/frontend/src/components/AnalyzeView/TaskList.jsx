import { useState } from 'react'
import TaskItem from './TaskItem'
import './TaskList.css'
import refreshIcon from '../../assets/icons/refresh.svg'

function TaskList({ 
  tasks, 
  loading, 
  error, 
  selectedTasks,
  onToggleTaskSelection,
  onOpenSearchModal,
  onDeleteTask,
  onRefresh,
  onCompare,
  isGroundTruthMode = false
}) {
  const [expandedTaskId, setExpandedTaskId] = useState(null)

  const completedTasks = tasks.filter(t => t.Status === 'completed' && t.Result && t.Result.S3VectorIndex)

  const handleSelectAll = (checked) => {
    if (checked) {
      completedTasks.forEach(task => {
        if (!selectedTasks.some(t => t.Id === task.Id)) {
          onToggleTaskSelection(task)
        }
      })
    } else {
      selectedTasks.forEach(task => onToggleTaskSelection(task))
    }
  }

  return (
    <div className="tasks-display-section">
      <div className="section-header-with-action">
        <h3>Multimodal Embedding Tasks</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isGroundTruthMode && selectedTasks.length > 0 && (
            <button 
              className="btn-compare"
              onClick={onCompare}
              title="Compare selected embeddings"
            >
              Compare ({selectedTasks.length})
            </button>
          )}
          <button 
            className="btn-refresh" 
            onClick={onRefresh}
            disabled={loading}
            title="Refresh task list"
          >
            <img src={refreshIcon} alt="Refresh" />
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">{error}</div>
      )}
      
      {loading ? (
        <div className="loading-message">Loading tasks...</div>
      ) : tasks.length > 0 ? (
        <div className="analyze-tasks-list">
          {!isGroundTruthMode && completedTasks.length > 0 && (
            <div className="select-all-row">
              <label className="select-all-checkbox">
                <input
                  type="checkbox"
                  checked={selectedTasks.length > 0 && selectedTasks.length === completedTasks.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  title="Select all completed tasks"
                />
                <span>Select All</span>
              </label>
            </div>
          )}
          {tasks.map((task) => (
            <TaskItem
              key={task.Id}
              task={task}
              isExpanded={expandedTaskId === task.Id}
              isSelected={selectedTasks.some(t => t.Id === task.Id)}
              onToggleExpand={() => setExpandedTaskId(expandedTaskId === task.Id ? null : task.Id)}
              onToggleSelection={() => onToggleTaskSelection(task)}
              onOpenSearch={() => onOpenSearchModal(task.Id, task.Result.S3VectorIndex, task)}
              onDelete={() => onDeleteTask(task.Id)}
              isGroundTruthMode={isGroundTruthMode}
            />
          ))}
        </div>
      ) : (
        <div className="no-tasks-message">
          No multimodal embedding tasks found for this video.
        </div>
      )}
    </div>
  )
}

export default TaskList
