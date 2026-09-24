import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db, deleteDeck, newCard, newReverseCard, swapCard } from '../lib/db'
import { deckCounts, formatInterval, State } from '../lib/srs'
import { htmlToSpeech } from '../lib/tts'
import { CardEditor } from '../components/CardEditor'
import { DeckForm } from '../components/DeckForm'
import { Counts } from '../components/Counts'

const PAGE = 100

export function DeckPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  const deck = useLiveQuery(() => db.decks.get(id), [id])
  const counts = useLiveQuery(async () => (deck ? deckCounts(deck) : undefined), [deck])
  const cards = useLiveQuery(() => db.cards.where('deckId').equals(id).reverse().sortBy('createdAt'), [id])

  const filtered = useMemo(() => {
    if (!cards) return []
    const q = query.trim().toLowerCase()
    if (!q) return cards
    return cards.filter((c) => htmlToSpeech(`${c.front} ${c.back} ${c.notes ?? ''}`).toLowerCase().includes(q))
  }, [cards, query])

  if (deck === undefined || !cards) return null
  if (deck === null) return <div className="page"><p>Este mazo ya no existe. <Link to="/">Volver a mazos</Link></p></div>

  const pending = counts ? counts.newCount + counts.learnCount + counts.reviewCount : 0
  const now = Date.now()

  return (
    <div className="page">
      <Link to="/" className="back">‹ Mazos</Link>
      <section className="deck-head">
        <h1>{deck.name}</h1>
        <div className="deck-head__row">
          {counts && <Counts counts={counts} />}
          <button className="btn btn--ghost btn--sm" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
            Ajustes del mazo
          </button>
          {pending > 0 ? (
            <Link to={`/study/${deck.id}`} className="btn btn--primary">Estudiar {pending}</Link>
          ) : (
            <span className="muted">{cards.length ? 'Al día por hoy' : ''}</span>
          )}
        </div>
      </section>

      {showSettings && (
        <div className="panel">
          <DeckForm
            initial={deck}
            submitLabel="Guardar cambios"
            onCancel={() => setShowSettings(false)}
            onSubmit={async (v) => {
              await db.decks.update(deck.id, v)
              setShowSettings(false)
            }}
          />
          <hr />
          <button
            className="btn btn--danger btn--sm"
            onClick={async () => {
              if (!confirm(`¿Borrar el mazo «${deck.name}» y sus ${cards.length} tarjetas? No se puede deshacer.`)) return
              await deleteDeck(deck.id)
              navigate('/')
            }}
          >
            Borrar mazo
          </button>
        </div>
      )}

      <div className="panel">
        <h2>Añadir tarjeta</h2>
        <CardEditor
          submitLabel="Añadir"
          allowReverse
          onSubmit={async (v) => {
            const list = [newCard(deck.id, v.front, v.back, v.notes)]
            if (v.reverse) list.push(newReverseCard(deck.id, v.front, v.back, v.notes))
            await db.cards.bulkAdd(list)
          }}
        />
        <p className="hint">Atajo: Ctrl + Enter para añadir.</p>
      </div>

      {cards.length > 0 && (
        <section>
          <div className="list-head">
            <h2>{cards.length} {cards.length === 1 ? 'tarjeta' : 'tarjetas'}</h2>
            <input className="search" type="search" placeholder="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <ul className="card-list">
            {filtered.slice(0, limit).map((c) =>
              editing === c.id ? (
                <li key={c.id} className="card-row card-row--editing">
                  <CardEditor
                    initial={{ front: c.front, back: c.back, notes: c.notes ?? '' }}
                    submitLabel="Guardar"
                    onCancel={() => setEditing(null)}
                    onSubmit={async (v) => {
                      await db.cards.update(c.id, { front: v.front, back: v.back, notes: v.notes || undefined })
                      setEditing(null)
                    }}
                  />
                  <div className="row">
                    <button className="btn btn--danger btn--sm" onClick={() => db.cards.delete(c.id)}>Borrar tarjeta</button>
                    <button className="btn btn--ghost btn--sm" onClick={async () => { await swapCard(c); setEditing(null) }}>Invertir</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => db.cards.update(c.id, { suspended: c.suspended ? 0 : 1 })}>
                      {c.suspended ? 'Reactivar' : 'Suspender'}
                    </button>
                  </div>
                </li>
              ) : (
                <li key={c.id} className={c.suspended ? 'card-row card-row--suspended' : 'card-row'}>
                  <button className="card-row__btn" onClick={() => setEditing(c.id)}>
                    <span className="card-row__front">{htmlToSpeech(c.front) || '(imagen)'}</span>
                    <span className="card-row__back">{htmlToSpeech(c.back) || '(imagen)'}</span>
                    <span className="card-row__due">
                      {c.suspended ? 'Suspendida' : c.state === State.New ? 'Nueva' : c.due <= now ? 'Pendiente' : `en ${formatInterval(c.due - now)}`}
                    </span>
                  </button>
                </li>
              ),
            )}
          </ul>
          {filtered.length > limit && (
            <button className="btn btn--ghost" onClick={() => setLimit((l) => l + PAGE)}>Mostrar más</button>
          )}
          {filtered.length === 0 && <p className="muted">Ninguna tarjeta coincide con «{query}».</p>}
        </section>
      )}
    </div>
  )
}
