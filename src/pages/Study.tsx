import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { cardLangs, db, swapCard, type Card } from '../lib/db'
import { answer, deckCounts, formatInterval, nextCard, previewIntervals, Rating, undoLast, type Grade } from '../lib/srs'
import { speak, stopSpeaking, ttsSupported } from '../lib/tts'
import { CardContent, hasSound } from '../components/CardContent'
import { Counts } from '../components/Counts'
import { CardEditor } from '../components/CardEditor'
import { CloseIcon, EditIcon, SpeakerIcon, SwapIcon, UndoIcon } from '../components/Icons'
import { isDbError, recoverIfBroken } from '../lib/health'

const GRADES: { grade: Grade; label: string; key: string; cls: string }[] = [
  { grade: Rating.Again, label: 'Otra vez', key: '1', cls: 'again' },
  { grade: Rating.Hard, label: 'Difícil', key: '2', cls: 'hard' },
  { grade: Rating.Good, label: 'Bien', key: '3', cls: 'good' },
  { grade: Rating.Easy, label: 'Fácil', key: '4', cls: 'easy' },
]

const AUTO_KEY = 'repaso:autoSpeak'
function readAuto() {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0'
  } catch {
    return true
  }
}

export function Study() {
  const { id = '' } = useParams()
  const deck = useLiveQuery(() => db.decks.get(id), [id])
  const [card, setCard] = useState<Card | null | undefined>(undefined)
  const [revealed, setRevealed] = useState(false)
  const [history, setHistory] = useState<Card[]>([])
  const [studied, setStudied] = useState(0)
  const [autoSpeak, setAutoSpeak] = useState(readAuto)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  // Sync and edits re-emit the deck object; keep the latest in a ref so that doesn't restart the current card.
  const deckRef = useRef(deck)
  deckRef.current = deck
  const deckId = deck?.id

  const fail = useCallback((e: unknown, what: string) => {
    console.error(e)
    setError(what)
    if (isDbError(e)) recoverIfBroken()
  }, [])

  const counts = useLiveQuery(async () => (deck ? deckCounts(deck).catch(() => undefined) : undefined), [deck, card])

  const load = useCallback(async () => {
    const d = deckRef.current
    if (!d) return
    setRevealed(false)
    setCard(await nextCard(d))
  }, [])

  useEffect(() => {
    if (deckId) load().catch((e) => fail(e, 'No se pudo cargar la siguiente tarjeta.'))
  }, [deckId, load, fail])

  // Speak the front when a card appears, and the back when it is revealed.
  useEffect(() => {
    if (!card || !deck || !autoSpeak) return
    const side = revealed ? card.back : card.front
    const langs = cardLangs(card, deck)
    const lang = revealed ? langs.back : langs.front
    if (!hasSound(side)) speak(side, lang)
  }, [card, revealed, deck, autoSpeak])

  useEffect(() => stopSpeaking, [])

  const reveal = useCallback(() => setRevealed(true), [])

  const grade = useCallback(
    async (g: Grade) => {
      if (!card || busy.current) return
      busy.current = true
      setError(null)
      try {
        await answer(card, g)
        setHistory((h) => [...h.slice(-19), card])
        setStudied((n) => n + 1)
        await load()
      } catch (e) {
        fail(e, 'No se pudo guardar la respuesta.')
      } finally {
        busy.current = false
      }
    },
    [card, load, fail],
  )

  const undo = useCallback(async () => {
    const prev = history[history.length - 1]
    if (!prev || busy.current) return
    busy.current = true
    try {
      await undoLast(prev)
      setHistory((h) => h.slice(0, -1))
      setStudied((n) => Math.max(0, n - 1))
      setCard(prev)
      setRevealed(true)
    } catch (e) {
      fail(e, 'No se pudo deshacer.')
    } finally {
      busy.current = false
    }
  }, [history, fail])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'z' && (e.ctrlKey || e.metaKey)) || e.key === 'u') {
        e.preventDefault()
        undo()
        return
      }
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        reveal()
        return
      }
      if (revealed) {
        const g = GRADES.find((x) => x.key === e.key)
        if (g) grade(g.grade)
        else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          grade(Rating.Good)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, reveal, grade, undo, editing])

  if (deck === null) return <div className="page"><p>Este mazo ya no existe. <Link to="/">Volver a mazos</Link></p></div>
  if (!deck || card === undefined) {
    return (
      <div className="study">
        <header className="study__bar">
          <Link to="/" className="icon-btn" aria-label="Salir del estudio"><CloseIcon /></Link>
          <span className="study__title muted">{error ?? 'Cargando…'}</span>
        </header>
        {error && (
          <div className="row">
            <button className="btn btn--primary" onClick={() => location.reload()}>Recargar</button>
          </div>
        )}
      </div>
    )
  }

  const toggleAuto = () => {
    const v = !autoSpeak
    setAutoSpeak(v)
    try {
      localStorage.setItem(AUTO_KEY, v ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (!v) stopSpeaking()
  }

  const swap = async () => {
    if (!card) return
    try {
      setCard(await swapCard(card))
      setRevealed(false)
    } catch (e) {
      fail(e, 'No se pudo invertir la tarjeta.')
    }
  }

  const intervals = card && revealed ? previewIntervals(card) : null
  const canSpeak = ttsSupported && (deck.frontLang || deck.backLang)
  const langs = card ? cardLangs(card, deck) : { front: '', back: '' }

  return (
    <div className="study">
      <header className="study__bar">
        <Link to={`/deck/${deck.id}`} className="icon-btn" aria-label="Salir del estudio"><CloseIcon /></Link>
        <span className="study__title">{deck.name}</span>
        {counts && <Counts counts={counts} />}
        <div className="study__tools">
          {canSpeak && (
            <button className="icon-btn" onClick={toggleAuto} aria-pressed={autoSpeak} title={autoSpeak ? 'Lectura automática activada' : 'Lectura automática desactivada'}>
              <SpeakerIcon muted={!autoSpeak} />
            </button>
          )}
          {card && (
            <button className="icon-btn" onClick={() => setEditing(true)} disabled={editing} title="Editar tarjeta o añadir un ejemplo" aria-label="Editar tarjeta"><EditIcon /></button>
          )}
          {card && (
            <button className="icon-btn" onClick={swap} disabled={editing} title="Invertir esta tarjeta (anverso ↔ reverso)" aria-label="Invertir esta tarjeta"><SwapIcon /></button>
          )}
          <button className="icon-btn" onClick={undo} disabled={!history.length} title="Deshacer (U)" aria-label="Deshacer última respuesta"><UndoIcon /></button>
        </div>
      </header>

      {error && (
        <p className="notice notice--error study__error" role="alert">
          {error}{' '}
          <button className="linklike" onClick={() => location.reload()}>Recargar</button>
        </p>
      )}

      {card === null ? (
        <div className="finished">
          <div className="index-card index-card--done">
            <h1>¡Listo por ahora!</h1>
            <p>
              {studied > 0
                ? `Has repasado ${studied} ${studied === 1 ? 'tarjeta' : 'tarjetas'} en esta sesión.`
                : 'No quedan tarjetas pendientes en este mazo.'}
            </p>
            <div className="row row--center">
              <Link className="btn btn--primary" to="/">Volver a mazos</Link>
              <Link className="btn" to={`/deck/${deck.id}`}>Añadir tarjetas</Link>
            </div>
          </div>
        </div>
      ) : editing ? (
        <div className="study__stage">
          <div className="panel study__editor">
            <CardEditor
              key={card.id}
              initial={{ front: card.front, back: card.back, notes: card.notes ?? '' }}
              submitLabel="Guardar"
              focusNotes
              onCancel={() => setEditing(false)}
              onSubmit={async (v) => {
                const changes = { front: v.front, back: v.back, notes: v.notes || undefined }
                await db.cards.update(card.id, changes)
                setCard({ ...card, ...changes })
                setEditing(false)
                setRevealed(true)
              }}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="study__stage">
            <article
              key={card.id}
              className={revealed ? 'index-card is-revealed' : 'index-card'}
              onClick={revealed ? undefined : reveal}
              aria-live="polite"
            >
              <div className="index-card__side index-card__front">
                <CardContent html={card.front} className="card-html" autoplay={autoSpeak} />
                {ttsSupported && langs.front && !hasSound(card.front) && (
                  <button className="speak" onClick={(e) => { e.stopPropagation(); speak(card.front, langs.front) }} aria-label="Escuchar anverso"><SpeakerIcon /></button>
                )}
              </div>
              {revealed && (
                <div className="index-card__side index-card__back">
                  <CardContent html={card.back} className="card-html" autoplay={autoSpeak} />
                  {ttsSupported && langs.back && !hasSound(card.back) && (
                    <button className="speak" onClick={() => speak(card.back, langs.back)} aria-label="Escuchar reverso"><SpeakerIcon /></button>
                  )}
                  {card.notes && <CardContent html={card.notes} className="card-notes" />}
                </div>
              )}
            </article>
          </div>

          <footer className="study__actions">
            {revealed && intervals ? (
              <div className="grades">
                {GRADES.map((g) => (
                  <button key={g.grade} className={`grade grade--${g.cls}`} onClick={() => grade(g.grade)}>
                    <span className="grade__label">{g.label}</span>
                    <span className="grade__ivl">{formatInterval(intervals[g.grade])}</span>
                  </button>
                ))}
              </div>
            ) : (
              <button className="btn btn--primary btn--block reveal" onClick={reveal}>
                Mostrar respuesta
              </button>
            )}
          </footer>
        </>
      )}
    </div>
  )
}
