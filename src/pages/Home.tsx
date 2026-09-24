import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db, newDeck } from '../lib/db'
import { deckCounts } from '../lib/srs'
import { DeckForm } from '../components/DeckForm'
import { Counts } from '../components/Counts'

export function Home() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const data = useLiveQuery(async () => {
    const decks = await db.decks.orderBy('name').toArray()
    const counts = await Promise.all(decks.map((d) => deckCounts(d)))
    return decks.map((deck, i) => ({ deck, counts: counts[i] }))
  })

  if (!data) return null

  const due = data.reduce((n, { counts: c }) => n + c.newCount + c.learnCount + c.reviewCount, 0)

  return (
    <div className="page">
      <section className="today">
        {data.length === 0 ? (
          <>
            <h1>Empieza tu primer mazo</h1>
            <p className="lede">Crea un mazo y añade tarjetas, o trae las que ya tienes desde Anki o una hoja de cálculo.</p>
            <div className="row">
              <button className="btn btn--primary" onClick={() => setCreating(true)}>Crear mazo</button>
              <Link className="btn" to="/import">Importar tarjetas</Link>
            </div>
          </>
        ) : due > 0 ? (
          <>
            <h1>
              Hoy te {due === 1 ? 'toca' : 'tocan'} <span className="today__n">{due}</span> {due === 1 ? 'tarjeta' : 'tarjetas'}
            </h1>
            <p className="lede">Elige un mazo para empezar.</p>
          </>
        ) : (
          <>
            <h1>Todo repasado por hoy</h1>
            <p className="lede">Vuelve mañana o añade tarjetas nuevas.</p>
          </>
        )}
      </section>

      {data.length > 0 && (
        <ul className="decks">
          {data.map(({ deck, counts }) => {
            const pending = counts.newCount + counts.learnCount + counts.reviewCount
            return (
              <li key={deck.id} className="deck">
                <Link to={`/deck/${deck.id}`} className="deck__link">
                  <span className="deck__name">{deck.name}</span>
                  <span className="deck__meta">{counts.total} {counts.total === 1 ? 'tarjeta' : 'tarjetas'}</span>
                </Link>
                <Counts counts={counts} />
                {pending > 0 ? (
                  <Link to={`/study/${deck.id}`} className="btn btn--primary btn--sm">Estudiar</Link>
                ) : (
                  <span className="deck__done" aria-label="Al día">✓</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {data.length > 0 && !creating && (
        <button className="btn btn--ghost add-deck" onClick={() => setCreating(true)}>+ Nuevo mazo</button>
      )}

      {creating && (
        <div className="panel">
          <h2>Nuevo mazo</h2>
          <DeckForm
            submitLabel="Crear mazo"
            onCancel={() => setCreating(false)}
            onSubmit={async (v) => {
              const d = { ...newDeck(v.name, v.frontLang, v.backLang), newPerDay: v.newPerDay }
              await db.decks.add(d)
              navigate(`/deck/${d.id}`)
            }}
          />
        </div>
      )}
    </div>
  )
}
