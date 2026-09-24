import Papa from 'papaparse'
import { db, newCard, newDeck, newReverseCard, uid, type Card, type Deck, type ReviewLog } from './db'

export interface ParsedRow {
  front: string
  back: string
  notes?: string
}

// ---------- CSV / TSV ----------

export async function parseCsv(file: File, hasHeader: boolean): Promise<ParsedRow[]> {
  const text = await file.text()
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' })
  const rows = hasHeader ? result.data.slice(1) : result.data
  return rows
    .filter((r) => r.length >= 2 && (r[0]?.trim() || r[1]?.trim()))
    .map((r) => ({ front: r[0].trim(), back: r[1].trim(), notes: r.slice(2).filter(Boolean).join('<br>') || undefined }))
}

export async function importRows(deck: Deck, rows: ParsedRow[], reverse: boolean) {
  const base = Date.now()
  const cards: Card[] = []
  rows.forEach((r, i) => {
    cards.push(newCard(deck.id, r.front, r.back, r.notes, base + i))
    if (reverse) cards.push(newReverseCard(deck.id, r.front, r.back, r.notes, base + i))
  })
  await db.cards.bulkAdd(cards)
  return cards.length
}

// ---------- Anki .apkg / .colpkg ----------

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
const isZstd = (b: Uint8Array) => ZSTD_MAGIC.every((m, i) => b[i] === m)

async function unzstd(b: Uint8Array) {
  if (!isZstd(b)) return b
  const { decompress } = await import('fzstd')
  return decompress(b)
}

/** Minimal protobuf reader for Anki's MediaEntries message: repeated { string name = 1; ...; uint32 legacy_zip_filename = 255 } */
function parseMediaEntries(buf: Uint8Array): Record<string, string> {
  let pos = 0
  const varint = (b: Uint8Array) => {
    let result = 0
    let shift = 0
    for (;;) {
      const byte = b[pos++]
      result += (byte & 0x7f) * 2 ** shift
      if (byte < 0x80) return result
      shift += 7
    }
  }
  const skip = (b: Uint8Array, wire: number) => {
    if (wire === 0) varint(b)
    else if (wire === 1) pos += 8
    else if (wire === 2) pos += varint(b)
    else if (wire === 5) pos += 4
  }
  const out: Record<string, string> = {}
  let index = 0
  const dec = new TextDecoder()
  while (pos < buf.length) {
    const tag = varint(buf)
    if (tag >>> 3 !== 1 || (tag & 7) !== 2) {
      skip(buf, tag & 7)
      continue
    }
    const len = varint(buf)
    const entry = buf.subarray(pos, pos + len)
    const outerPos = pos + len
    pos = 0
    let name = ''
    let zipName: number | undefined
    while (pos < entry.length) {
      const t = varint(entry)
      const field = Math.floor(t / 8)
      if (field === 1 && (t & 7) === 2) {
        const l = varint(entry)
        name = dec.decode(entry.subarray(pos, pos + l))
        pos += l
      } else if (field === 255 && (t & 7) === 0) {
        zipName = varint(entry)
      } else skip(entry, t & 7)
    }
    pos = outerPos
    out[String(zipName ?? index)] = name
    index++
  }
  return out
}

function cloze(text: string, ord: number, reveal: boolean) {
  return text.replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (_, n, answer, hint) => {
    if (Number(n) !== ord + 1) return answer
    if (reveal) return `<span class="cloze">${answer}</span>`
    return `<span class="cloze">[${hint ?? '…'}]</span>`
  })
}

export interface ApkgResult {
  decks: number
  cards: number
  media: number
}

export async function importApkg(file: File, onProgress?: (msg: string) => void): Promise<ApkgResult> {
  onProgress?.('Abriendo archivo…')
  const [{ default: JSZip }, { default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('jszip'),
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
  ])
  const zip = await JSZip.loadAsync(file)
  const colFile = zip.file('collection.anki21b') ?? zip.file('collection.anki21') ?? zip.file('collection.anki2')
  if (!colFile) throw new Error('El archivo no contiene una colección de Anki.')
  const colBytes = await unzstd(await colFile.async('uint8array'))

  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const sqlite = new SQL.Database(colBytes)
  const rows = (sql: string) => {
    const res = sqlite.exec(sql)
    return res.length ? res[0].values : []
  }

  // Deck names: newer collections have a `decks` table, older ones keep JSON in `col.decks`.
  const deckNames = new Map<number, string>()
  const hasDeckTable = rows("SELECT name FROM sqlite_master WHERE type='table' AND name='decks'").length > 0
  if (hasDeckTable) {
    for (const [id, name] of rows('SELECT id, name FROM decks')) deckNames.set(Number(id), String(name).split('\x1f').join(' › '))
  } else {
    const json = rows('SELECT decks FROM col')[0]?.[0]
    if (json) for (const d of Object.values(JSON.parse(String(json))) as { id: number; name: string }[]) deckNames.set(Number(d.id), d.name.split('::').join(' › '))
  }

  onProgress?.('Leyendo tarjetas…')
  const noteFields = new Map<number, string[]>()
  for (const [id, flds] of rows('SELECT id, flds FROM notes')) noteFields.set(Number(id), String(flds).split('\x1f'))

  const cardRows = rows('SELECT nid, did, ord, id FROM cards ORDER BY due, id')
  sqlite.close()

  const createdDecks = new Map<number, Deck>()
  const cards: Card[] = []
  const base = Date.now()
  const legacyNotice = /please update to the latest anki version/i

  for (const [nidRaw, didRaw, ordRaw] of cardRows) {
    const fields = noteFields.get(Number(nidRaw))
    if (!fields) continue
    const did = Number(didRaw)
    const ord = Number(ordRaw)
    let front: string
    let back: string
    let notes: string | undefined
    const clozeField = fields.findIndex((f) => /\{\{c\d+::/.test(f))
    if (clozeField >= 0) {
      front = cloze(fields[clozeField], ord, false)
      back = cloze(fields[clozeField], ord, true)
      notes = fields.filter((f, i) => i !== clozeField && f.trim()).join('<br>') || undefined
    } else {
      const [a = '', b = '', ...rest] = fields
      ;[front, back] = ord === 1 ? [b, a] : [a, b]
      notes = rest.filter((f) => f.trim()).join('<br>') || undefined
    }
    if (!front.trim() && !back.trim()) continue
    if (legacyNotice.test(front)) continue

    let deck = createdDecks.get(did)
    if (!deck) {
      deck = newDeck(deckNames.get(did) ?? file.name.replace(/\.(apkg|colpkg)$/i, ''))
      createdDecks.set(did, deck)
    }
    cards.push(newCard(deck.id, front, back, notes, base + cards.length))
  }

  if (!cards.length) throw new Error('No se encontraron tarjetas en el mazo.')

  onProgress?.('Copiando imágenes y audio…')
  let mediaCount = 0
  const mediaFile = zip.file('media')
  if (mediaFile) {
    const raw = await unzstd(await mediaFile.async('uint8array'))
    let map: Record<string, string>
    try {
      map = JSON.parse(new TextDecoder().decode(raw))
    } catch {
      map = parseMediaEntries(raw)
    }
    const referenced = cards.map((c) => c.front + c.back + (c.notes ?? '')).join('\n')
    for (const [zipName, name] of Object.entries(map)) {
      if (!referenced.includes(name)) continue
      const entry = zip.file(zipName)
      if (!entry) continue
      const data = await unzstd(await entry.async('uint8array'))
      await db.media.put({ name, blob: new Blob([data as BlobPart], { type: mimeFor(name) }) })
      mediaCount++
    }
  }

  onProgress?.('Guardando…')
  await db.transaction('rw', db.decks, db.cards, async () => {
    await db.decks.bulkAdd([...createdDecks.values()])
    await db.cards.bulkAdd(cards)
  })
  return { decks: createdDecks.size, cards: cards.length, media: mediaCount }
}

function mimeFor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  const types: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', opus: 'audio/ogg', webm: 'audio/webm',
  }
  return types[ext ?? ''] ?? 'application/octet-stream'
}

// ---------- Backup ----------

export async function exportBackup() {
  const [decks, cards, reviews] = await Promise.all([db.decks.toArray(), db.cards.toArray(), db.reviewLog.toArray()])
  const data = { app: 'repaso', version: 1, exportedAt: new Date().toISOString(), decks, cards, reviews }
  return new Blob([JSON.stringify(data)], { type: 'application/json' })
}

export async function restoreBackup(file: File) {
  const data = JSON.parse(await file.text())
  if (data?.app !== 'repaso') throw new Error('Este archivo no es una copia de seguridad de Repaso.')
  const cards: Card[] = data.cards.map((c: Card) => ({
    ...c,
    srs: { ...c.srs, due: new Date(c.srs.due), last_review: c.srs.last_review ? new Date(c.srs.last_review) : undefined },
  }))
  // Older backups have numeric review ids; give them UUIDs so they can sync.
  const reviews: ReviewLog[] = data.reviews.map((r: ReviewLog) => (typeof r.id === 'string' ? r : { ...r, id: uid() }))
  await db.transaction('rw', db.decks, db.cards, db.reviewLog, async () => {
    await db.decks.bulkPut(data.decks)
    await db.cards.bulkPut(cards)
    await db.reviewLog.bulkPut(reviews)
  })
  return { decks: data.decks.length as number, cards: cards.length }
}
