import { useRef, useState, type FormEvent } from 'react'

export interface CardValues {
  front: string
  back: string
  notes: string
  reverse: boolean
}

export function CardEditor({
  initial,
  submitLabel,
  allowReverse = false,
  focusNotes = false,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<CardValues>
  submitLabel: string
  allowReverse?: boolean
  /** Open with the notes field visible and focused (e.g. to add an example while studying). */
  focusNotes?: boolean
  onSubmit: (v: CardValues) => void | Promise<void>
  onCancel?: () => void
}) {
  const [front, setFront] = useState(initial?.front ?? '')
  const [back, setBack] = useState(initial?.back ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [showNotes, setShowNotes] = useState(focusNotes || Boolean(initial?.notes))
  const [reverse, setReverse] = useState(false)
  const frontRef = useRef<HTMLTextAreaElement>(null)

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!front.trim() || !back.trim()) return
    await onSubmit({ front: front.trim(), back: back.trim(), notes: notes.trim(), reverse })
    if (!initial) {
      setFront('')
      setBack('')
      setNotes('')
      frontRef.current?.focus()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
    if (e.key === 'Escape') onCancel?.()
  }

  return (
    <form className="form card-editor" onSubmit={submit} onKeyDown={onKeyDown}>
      <label className="field">
        <span>Anverso</span>
        <textarea ref={frontRef} autoFocus={!!initial && !focusNotes} rows={2} value={front} onChange={(e) => setFront(e.target.value)} placeholder="der Apfel" />
      </label>
      <label className="field">
        <span>Reverso</span>
        <textarea rows={2} value={back} onChange={(e) => setBack(e.target.value)} placeholder="la manzana" />
      </label>
      {showNotes ? (
        <label className="field">
          <span>Notas</span>
          <textarea autoFocus={focusNotes} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ejemplo: Ich esse einen Apfel." />
        </label>
      ) : (
        <button type="button" className="linklike" onClick={() => setShowNotes(true)}>+ Añadir notas o ejemplo</button>
      )}
      <div className="row row--between">
        {allowReverse ? (
          <label className="check">
            <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />
            Crear también la tarjeta inversa
          </label>
        ) : <span />}
        <div className="row">
          {onCancel && <button className="btn btn--ghost" type="button" onClick={onCancel}>Cancelar</button>}
          <button className="btn btn--primary" type="submit" disabled={!front.trim() || !back.trim()}>{submitLabel}</button>
        </div>
      </div>
    </form>
  )
}
