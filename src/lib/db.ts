import Dexie, { type EntityTable } from 'dexie'
import { createEmptyCard, type Card as SrsCard } from 'ts-fsrs'

export interface Deck {
  id: string
  name: string
  /** BCP-47 language of the front side, used for text-to-speech (e.g. "en-US"). Empty = no TTS. */
  frontLang: string
  backLang: string
  newPerDay: number
  createdAt: number
}

export interface Card {
  id: string
  deckId: string
  front: string
  back: string
  /** Free-form extra info shown under the answer (examples, notes). */
  notes?: string
  srs: SrsCard
  /** Mirrors srs.due as a timestamp so it can be indexed. */
  due: number
  /** 0 = New, see ts-fsrs State. Mirrored for indexing. */
  state: number
  suspended?: 0 | 1
  /** 1 = reverse card (front/back swapped), so the deck's TTS languages are swapped too. */
  reversed?: 1
  createdAt: number
}

export interface ReviewLog {
  id?: number
  cardId: string
  deckId: string
  rating: number
  state: number
  reviewedAt: number
}

export interface Media {
  /** File name as referenced from card HTML (e.g. "perro.jpg"). */
  name: string
  blob: Blob
}

export const db = new Dexie('repaso') as Dexie & {
  decks: EntityTable<Deck, 'id'>
  cards: EntityTable<Card, 'id'>
  reviews: EntityTable<ReviewLog, 'id'>
  media: EntityTable<Media, 'name'>
}

db.version(1).stores({
  decks: 'id, name, createdAt',
  cards: 'id, deckId, [deckId+due], [deckId+state], createdAt',
  reviews: '++id, cardId, deckId, reviewedAt, [deckId+reviewedAt]',
  media: 'name',
})

export const uid = () => crypto.randomUUID()

export function newCard(deckId: string, front: string, back: string, notes?: string, createdAt = Date.now()): Card {
  const srs = createEmptyCard(new Date(createdAt))
  return {
    id: uid(),
    deckId,
    front,
    back,
    notes: notes || undefined,
    srs,
    due: srs.due.getTime(),
    state: srs.state,
    createdAt,
  }
}

export function newReverseCard(deckId: string, front: string, back: string, notes?: string, createdAt = Date.now()): Card {
  return { ...newCard(deckId, back, front, notes, createdAt), reversed: 1 }
}

/** Swaps front and back of a card, keeping its review history. Returns the updated card. */
export async function swapCard(card: Card): Promise<Card> {
  const swapped: Card = { ...card, front: card.back, back: card.front, reversed: card.reversed ? undefined : 1 }
  await db.cards.update(card.id, { front: swapped.front, back: swapped.back, reversed: swapped.reversed })
  return swapped
}

/** TTS languages for each side of a card, taking reverse cards into account. */
export function cardLangs(card: Card, deck: Deck) {
  return card.reversed
    ? { front: deck.backLang, back: deck.frontLang }
    : { front: deck.frontLang, back: deck.backLang }
}

export function newDeck(name: string, frontLang = '', backLang = ''): Deck {
  return { id: uid(), name, frontLang, backLang, newPerDay: 20, createdAt: Date.now() }
}

export async function deleteDeck(deckId: string) {
  await db.transaction('rw', db.decks, db.cards, db.reviews, async () => {
    await db.cards.where('deckId').equals(deckId).delete()
    await db.reviews.where('deckId').equals(deckId).delete()
    await db.decks.delete(deckId)
  })
}

export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
