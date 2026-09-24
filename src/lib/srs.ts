import { fsrs, generatorParameters, Rating, State, type Grade } from 'ts-fsrs'
import { db, startOfToday, uid, type Card, type Deck } from './db'

export { Rating, State }
export type { Grade }

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9 }))

/** Learning cards due within this window are shown early when nothing else is left (like Anki's "learn ahead"). */
const LEARN_AHEAD_MS = 20 * 60 * 1000

export interface DeckCounts {
  newCount: number
  learnCount: number
  reviewCount: number
  total: number
}

async function newIntroducedToday(deckId: string) {
  return db.reviewLog
    .where('[deckId+reviewedAt]')
    .between([deckId, startOfToday()], [deckId, Infinity])
    .filter((r) => r.state === State.New)
    .count()
}

export async function deckCounts(deck: Deck, now = Date.now()): Promise<DeckCounts> {
  const [dueCards, newTotal, total, introduced] = await Promise.all([
    db.cards.where('[deckId+due]').between([deck.id, -Infinity], [deck.id, now], true, true).toArray(),
    db.cards.where('[deckId+state]').equals([deck.id, State.New]).filter((c) => !c.suspended).count(),
    db.cards.where('deckId').equals(deck.id).count(),
    newIntroducedToday(deck.id),
  ])
  let learnCount = 0
  let reviewCount = 0
  for (const c of dueCards) {
    if (c.suspended || c.state === State.New) continue
    if (c.state === State.Review) reviewCount++
    else learnCount++
  }
  const newCount = Math.max(0, Math.min(newTotal, deck.newPerDay - introduced))
  return { newCount, learnCount, reviewCount, total }
}

/** Picks the next card to study, or null when the deck is done for now. */
export async function nextCard(deck: Deck, skip: Set<string> = new Set()): Promise<Card | null> {
  const now = Date.now()
  const due = await db.cards
    .where('[deckId+due]')
    .between([deck.id, -Infinity], [deck.id, now + LEARN_AHEAD_MS], true, true)
    .filter((c) => !c.suspended && c.state !== State.New && !skip.has(c.id))
    .sortBy('due')

  const learningNow = due.find((c) => c.state !== State.Review && c.due <= now)
  if (learningNow) return learningNow

  const reviews = due.filter((c) => c.state === State.Review && c.due <= now)
  const introduced = await newIntroducedToday(deck.id)
  const newQuota = deck.newPerDay - introduced
  let fresh: Card | undefined
  if (newQuota > 0) {
    fresh = await db.cards
      .where('[deckId+state]')
      .equals([deck.id, State.New])
      .filter((c) => !c.suspended && !skip.has(c.id))
      .sortBy('createdAt')
      .then((l) => l[0])
  }

  // Interleave: roughly one new card for every few reviews so new material is spread through the session.
  if (fresh && reviews.length) {
    const ratio = newQuota / (newQuota + reviews.length)
    return Math.random() < ratio ? fresh : reviews[0]
  }
  if (reviews.length) return reviews[0]
  if (fresh) return fresh

  return due.find((c) => c.state !== State.Review) ?? null
}

export function previewIntervals(card: Card, now = new Date()): Record<Grade, number> {
  const preview = scheduler.repeat(card.srs, now)
  const out = {} as Record<Grade, number>
  for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) {
    out[g] = preview[g].card.due.getTime() - now.getTime()
  }
  return out
}

export async function answer(card: Card, grade: Grade) {
  const now = new Date()
  const { card: srs } = scheduler.next(card.srs, now, grade)
  await db.transaction('rw', db.cards, db.reviewLog, async () => {
    await db.cards.update(card.id, { srs, due: srs.due.getTime(), state: srs.state })
    await db.reviewLog.add({ id: uid(), cardId: card.id, deckId: card.deckId, rating: grade, state: card.state, reviewedAt: now.getTime() })
  })
}

export async function undoLast(card: Card) {
  await db.transaction('rw', db.cards, db.reviewLog, async () => {
    await db.cards.put(card)
    // UUID keys carry no order, so find the latest log by time.
    const logs = await db.reviewLog.where('cardId').equals(card.id).sortBy('reviewedAt')
    const last = logs[logs.length - 1]
    if (last) await db.reviewLog.delete(last.id)
  })
}

export function formatInterval(ms: number) {
  const min = ms / 60000
  if (min < 1) return '<1 min'
  if (min < 60) return `${Math.round(min)} min`
  const h = min / 60
  if (h < 24) return `${Math.round(h)} h`
  const d = h / 24
  if (d < 30) return `${Math.round(d)} d`
  const mo = d / 30.4
  if (mo < 12) return `${mo < 10 ? mo.toFixed(1).replace('.0', '') : Math.round(mo)} mes`
  const y = d / 365
  return `${y.toFixed(1).replace('.0', '')} años`
}
