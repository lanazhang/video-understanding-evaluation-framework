import { MATCH_BY_CHOICES, THRESHOLD_CHOICES } from './evaluationUtils'

// How a returned clip is matched to a ground-truth moment: the measure, the minimum, and one-to-one claiming.
// Used when creating an evaluation and when re-scoring a saved one.
function MatchOptionsControls({ options, onChange }) {
  const set = (patch) => onChange({ ...options, ...patch })
  const byIou = options.matchBy === 'iou'

  return (
    <>
      <div className="form-group form-group-inline">
        <label>Match by:</label>
        <div className="inline-input-wrapper">
          <select
            value={options.matchBy}
            onChange={(e) => set({ matchBy: e.target.value })}
            className="form-input"
            style={{ maxWidth: '320px' }}
          >
            {MATCH_BY_CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <small className="form-help-inline">
            Overlap suits fixed-length search windows: a window that fully contains a short moment counts as a hit.
            IoU also penalises a window much longer than the moment, so it judges how tightly the boundaries line up.
          </small>
        </div>
      </div>

      <div className="form-group form-group-inline">
        <label>{byIou ? 'Minimum IoU:' : 'Minimum overlap:'}</label>
        <div className="inline-input-wrapper">
          <select
            value={options.threshold}
            onChange={(e) => set({ threshold: Number(e.target.value) })}
            className="form-input"
            style={{ maxWidth: '240px' }}
          >
            {THRESHOLD_CHOICES.map(t => (
              <option key={t} value={t}>
                {t === 0 ? 'Any overlap' : byIou ? `IoU ≥ ${t}` : `${Math.round(t * 100)}% of the shorter range`}
              </option>
            ))}
          </select>
          <small className="form-help-inline">A clip is a hit when its overlap with a ground-truth moment reaches this</small>
        </div>
      </div>

      <div className="form-group form-group-inline">
        <label>One-to-one matching:</label>
        <div className="inline-input-wrapper">
          <input
            type="checkbox"
            checked={options.oneToOne}
            onChange={(e) => set({ oneToOne: e.target.checked })}
          />
          <small className="form-help-inline">
            Each ground-truth moment is claimed once; extra clips on the same moment count as false positives
          </small>
        </div>
      </div>
    </>
  )
}

export default MatchOptionsControls
