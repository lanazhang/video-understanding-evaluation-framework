import { useMemo, useState } from 'react'
import { segmentStats, clock } from '../../utils/embeddingParams'
import './SegmentTimeline.css'

const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200]
const ZOOMS = [1, 2, 4, 8, 16]
const seconds = (n) => `${Number(n).toFixed(2)} s`
const short = (n) => `${Number(n).toFixed(1)} s`

// Draws how an embedding index cut its video: every segment as a block on a timeline, to scale.
//  - by shot: the blocks of one shot share a colour and shots alternate between two colours, so shot boundaries show; a long
//    shot that was divided shows as several blocks of one colour, separated by thin lines
//  - fixed length: the blocks alternate colours, so each boundary shows
// Clicking a block (or a row of the list) calls onSegmentClick(start, end), which plays that range in the video above.
function SegmentTimeline({ segments, duration, mode = 'fixed', shotCount = null, onSegmentClick }) {
  const [zoom, setZoom] = useState(1)
  const [selected, setSelected] = useState(null)
  const [showList, setShowList] = useState(false)

  const list = useMemo(() => [...(segments || [])].sort((a, b) => a.StartSec - b.StartSec), [segments])
  const total = Math.max(Number(duration) || 0, list.length ? list[list.length - 1].EndSec : 0, 1)
  const stats = useMemo(() => segmentStats(list), [list])
  const byShot = stats.shots !== null

  // piece k of n inside each shot, for the tooltips
  const pieces = useMemo(() => {
    const perShot = {}
    list.forEach(s => { if (s.ShotIndex !== null && s.ShotIndex !== undefined) (perShot[s.ShotIndex] = perShot[s.ShotIndex] || []).push(s.Index) })
    return perShot
  }, [list])
  const describe = (s) => {
    const parts = [`#${s.Index + 1}`, `${seconds(s.StartSec)} to ${seconds(s.EndSec)}`, `${short(s.EndSec - s.StartSec)} long`]
    if (s.ShotIndex !== null && s.ShotIndex !== undefined) {
      const mine = pieces[s.ShotIndex] || []
      parts.push(mine.length > 1 ? `shot ${s.ShotIndex + 1}, piece ${mine.indexOf(s.Index) + 1} of ${mine.length}` : `shot ${s.ShotIndex + 1}`)
    }
    return parts.join(' · ')
  }

  const ticks = useMemo(() => {
    const step = TICK_STEPS.find(t => total / t <= 12 * zoom) || TICK_STEPS[TICK_STEPS.length - 1]
    const out = []
    for (let t = 0; t <= total + 1e-6; t += step) out.push(t)
    return out
  }, [total, zoom])

  const pick = (s) => { setSelected(s.Index); if (onSegmentClick) onSegmentClick(s.StartSec, s.EndSec) }

  if (!list.length) return <p className="segment-timeline__empty">No segments are indexed for this task.</p>

  return (
    <div className="segment-timeline">
      <div className="segment-timeline__summary">
        <strong>{stats.count} segments</strong>
        {byShot && <> from {stats.shots} shots{stats.dividedShots ? ` (${stats.dividedShots} long ${stats.dividedShots === 1 ? 'shot' : 'shots'} divided)` : ''}</>}
        {' · '}length {short(stats.minS)} to {short(stats.maxS)}, median {short(stats.medianS)}
        {mode === 'shots' && shotCount ? ` · ffmpeg found ${shotCount} shots` : ''}
      </div>

      <div className="segment-timeline__toolbar">
        <label>
          Zoom{' '}
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom the timeline">
            {ZOOMS.map(z => <option key={z} value={z}>{z}x</option>)}
          </select>
        </label>
        <span className="segment-timeline__legend">
          {byShot ? 'Colours alternate by shot; thin lines divide a long shot into pieces.' : 'Each block is one segment of the same length.'}
          {' '}Click a block to play it.
        </span>
      </div>

      <div className="segment-timeline__scroll">
        <div className="segment-timeline__inner" style={{ width: `${zoom * 100}%` }}>
          <div className="segment-timeline__axis" aria-hidden="true">
            {ticks.map(t => <span key={t} style={{ left: `${(t / total) * 100}%` }}>{clock(t)}</span>)}
          </div>
          <div className="segment-timeline__bar" role="list" aria-label="Segments of this index">
            {list.map((s, i) => {
              const startsShot = i === 0 || (byShot && s.ShotIndex !== list[i - 1].ShotIndex)
              const tone = byShot ? s.ShotIndex % 2 : i % 2
              return (
                <button
                  key={s.Index}
                  type="button"
                  role="listitem"
                  className={`segment-timeline__block segment-timeline__block--${tone ? 'b' : 'a'}${startsShot && byShot ? ' segment-timeline__block--shot-start' : ''}${selected === s.Index ? ' segment-timeline__block--selected' : ''}`}
                  style={{ left: `${(s.StartSec / total) * 100}%`, width: `${((s.EndSec - s.StartSec) / total) * 100}%` }}
                  title={describe(s)}
                  aria-label={describe(s)}
                  onClick={() => pick(s)}
                />
              )
            })}
          </div>
        </div>
      </div>

      <button type="button" className="segment-timeline__list-toggle" onClick={() => setShowList(v => !v)} aria-expanded={showList}>
        {showList ? 'Hide the list' : 'Show the list'}
      </button>
      {showList && (
        <div className="segment-timeline__table-wrap">
          <table className="segment-timeline__table">
            <thead>
              <tr><th>#</th><th>Start</th><th>End</th><th>Length</th>{byShot && <th>Shot</th>}</tr>
            </thead>
            <tbody>
              {list.map(s => {
                const mine = s.ShotIndex !== null && s.ShotIndex !== undefined ? (pieces[s.ShotIndex] || []) : []
                return (
                  <tr key={s.Index} className={selected === s.Index ? 'is-selected' : ''} onClick={() => pick(s)}>
                    <td>{s.Index + 1}</td>
                    <td>{seconds(s.StartSec)}</td>
                    <td>{seconds(s.EndSec)}</td>
                    <td>{short(s.EndSec - s.StartSec)}</td>
                    {byShot && <td>{s.ShotIndex + 1}{mine.length > 1 ? ` (${mine.indexOf(s.Index) + 1}/${mine.length})` : ''}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default SegmentTimeline
