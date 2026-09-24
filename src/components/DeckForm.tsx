import { useState, type FormEvent } from 'react'
import { LANGUAGES } from '../lib/tts'
import type { Deck } from '../lib/db'

export type DeckValues = Pick<Deck, 'name' | 'frontLang' | 'backLang' | 'newPerDay'>

export function DeckForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<DeckValues>
  submitLabel: string
  onSubmit: (v: DeckValues) => void | Promise<void>
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [frontLang, setFrontLang] = useState(initial?.frontLang ?? '')
  const [backLang, setBackLang] = useState(initial?.backLang ?? '')
  const [newPerDay, setNewPerDay] = useState(initial?.newPerDay ?? 20)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({ name: name.trim(), frontLang, backLang, newPerDay })
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>Nombre</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Alemán A2, Anatomía, Capitales…" required />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Voz del anverso</span>
          <select value={frontLang} onChange={(e) => setFrontLang(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Voz del reverso</span>
          <select value={backLang} onChange={(e) => setBackLang(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
      </div>
      <label className="field field--narrow">
        <span>Tarjetas nuevas al día</span>
        <input type="number" min={0} max={999} value={newPerDay} onChange={(e) => setNewPerDay(Math.max(0, Number(e.target.value) || 0))} />
      </label>
      <div className="row">
        <button className="btn btn--primary" type="submit">{submitLabel}</button>
        {onCancel && <button className="btn btn--ghost" type="button" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  )
}
