import { Fragment, useEffect, useState } from 'react'
import { modelParameters, paramVisible, optionValue, paramLabel, segmentingNote } from '../utils/embeddingParams'

// Renders the inputs for a model's declared task parameters (number / select / boolean).
// variant 'upload' matches the upload panel's grid, 'form' the Create Embedding form.
function EmbeddingParamFields({ model, values, onChange, disabled = false, variant = 'form' }) {
  const fieldClass = variant === 'upload' ? 'config-field' : 'form-group'

  return modelParameters(model).map(param => {
    // showIf: {key, minSelected} hides a field until enough options of another multiselect are ticked; {key, equals} until
    // another field has that value (the shot settings appear when segmenting by shot)
    if (!paramVisible(param, values)) return null
    const id = `${model.modelId}-${param.key}`
    const value = values?.[param.key] ?? param.default

    let input
    if (param.type === 'select') {
      input = (
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const picked = param.options.map(optionValue).find(o => String(o) === e.target.value)
            onChange(param.key, picked)
          }}
          disabled={disabled}
        >
          {param.options.map(o => {
            const v = optionValue(o)
            const text = o !== null && typeof o === 'object' ? o.label : `${o}${param.unit ? ` ${param.unit}` : ''}`
            return <option key={v} value={v}>{text}{v === param.default ? ' (default)' : ''}</option>
          })}
        </select>
      )
    } else if (param.type === 'multiselect') {
      const selected = Array.isArray(value) ? value : []
      const order = param.options.map(o => o.value)
      input = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {param.options.map(o => {
            const checked = selected.includes(o.value)
            return (
              <label
                key={o.value}
                title={o.disabled ? o.hint : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'normal', opacity: o.disabled ? 0.55 : 1 }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  // at least one option must stay selected; some options are not available yet
                  disabled={disabled || o.disabled || (checked && selected.length === 1)}
                  onChange={(e) => {
                    const next = e.target.checked ? order.filter(v => v === o.value || selected.includes(v)) : selected.filter(v => v !== o.value)
                    onChange(param.key, next)
                  }}
                />
                {o.label}{o.disabled && o.hint ? <small> ({o.hint})</small> : null}
              </label>
            )
          })}
        </div>
      )
    } else if (param.type === 'boolean') {
      input = (
        <input
          type="checkbox"
          id={id}
          checked={!!value}
          onChange={(e) => onChange(param.key, e.target.checked)}
          disabled={disabled}
        />
      )
    } else {
      const number = (
        <input
          type="number"
          id={id}
          min={param.min}
          max={param.max}
          step={param.step}
          value={value}
          onChange={(e) => onChange(param.key, e.target.value === '' ? '' : Number(e.target.value))}
          disabled={disabled}
        />
      )
      input = variant === 'upload' && param.unit
        ? <div className="input-with-unit">{number}<span className="unit">{param.unit}</span></div>
        : number
    }

    const unit = param.unit ? ` ${param.unit}` : ''
    let allowed = null
    if (param.type === 'number' && (param.min != null || param.max != null)) {
      allowed = `Allowed: ${param.min ?? '…'} to ${param.max ?? '…'}${unit}`
    } else if (param.type === 'select' && param.options?.length) {
      allowed = param.options.some(o => o !== null && typeof o === 'object') ? null : `Options: ${param.options.join(', ')}${unit}`
    }

    const note = param.explain === 'shots' ? segmentingNote(values) : null
    return (
      <Fragment key={param.key}>
        <ParamField
          className={fieldClass}
          label={`${paramLabel(param, values)}${variant !== 'upload' && param.unit ? ` (${param.unit})` : ''}`}
          htmlFor={param.type === 'multiselect' ? undefined : id}
          allowed={allowed}
          hint={param.hint}
        >
          {input}
        </ParamField>
        {note && (
          <div
            role="note"
            className="segmenting-note"
            style={{ gridColumn: '1 / -1', margin: '2px 0 6px', padding: '8px 10px', fontSize: 12, lineHeight: 1.45, borderRadius: 6, background: 'rgba(128, 128, 128, 0.14)' }}
          >
            {note}
          </div>
        )}
      </Fragment>
    )
  })
}

// One setting: label, the input, the allowed values, and (if the model declares a `hint`) an info icon that shows the
// longer explanation on click instead of printing it under every field.
function ParamField({ className, label, htmlFor, allowed, hint, children }) {
  const [hintOpen, setHintOpen] = useState(false)

  useEffect(() => {
    if (!hintOpen) return undefined
    const closeOnEscape = (e) => { if (e.key === 'Escape') setHintOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [hintOpen])

  return (
    <div className={className}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <label htmlFor={htmlFor}>{label}</label>
        {hint && (
          <button
            type="button"
            aria-label={`About ${label}`}
            aria-expanded={hintOpen}
            title="Click for details"
            onClick={() => setHintOpen(open => !open)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', font: 'inherit', color: 'inherit', opacity: hintOpen ? 1 : 0.7 }}
          >
            ⓘ
          </button>
        )}
      </div>
      {children}
      {allowed && <small style={{ display: 'block', marginTop: 4, opacity: 0.75 }}>{allowed}</small>}
      {hint && hintOpen && (
        <div
          role="note"
          style={{ marginTop: 6, padding: '8px 10px', fontSize: 12, lineHeight: 1.4, borderRadius: 6, background: 'rgba(128, 128, 128, 0.14)' }}
        >
          {hint}
        </div>
      )}
    </div>
  )
}

export default EmbeddingParamFields
