import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db, newDeck } from '../lib/db'
import { importApkg, importRows, parseCsv, type ParsedRow } from '../lib/importers'
import { htmlToSpeech } from '../lib/tts'

const HEADER_RE = /^(front|anverso|pregunta|question|term|t[ée]rmino|word|palabra|english|ingl[ée]s|spanish|espa[ñn]ol)$/i

type Status = { kind: 'idle' } | { kind: 'busy'; msg: string } | { kind: 'done'; msg: string } | { kind: 'error'; msg: string }

export function ImportPage() {
  const decks = useLiveQuery(() => db.decks.orderBy('name').toArray())
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  // CSV state
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [hasHeader, setHasHeader] = useState(false)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [target, setTarget] = useState('__new')
  const [newName, setNewName] = useState('')
  const [reverse, setReverse] = useState(false)
  const [swapCols, setSwapCols] = useState(false)

  const loadCsv = async (file: File, header?: boolean) => {
    setCsvFile(file)
    setNewName(file.name.replace(/\.(csv|tsv|txt)$/i, ''))
    try {
      let parsed = await parseCsv(file, false)
      // First load of a file: detect a title row such as "Front,Back" or "Anverso;Reverso".
      const useHeader = header ?? (parsed.length > 0 && HEADER_RE.test(htmlToSpeech(parsed[0].front)))
      if (useHeader) parsed = parsed.slice(1)
      setHasHeader(useHeader)
      setRows(parsed)
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', msg: `No se pudo leer el archivo: ${(e as Error).message}` })
    }
  }

  const cardRows = swapCols ? rows.map((r) => ({ ...r, front: r.back, back: r.front })) : rows

  const doCsvImport = async () => {
    setStatus({ kind: 'busy', msg: 'Importando…' })
    try {
      let deck = decks?.find((d) => d.id === target)
      if (!deck) {
        deck = newDeck(newName.trim() || 'Importado')
        await db.decks.add(deck)
      }
      const n = await importRows(deck, cardRows, reverse)
      setStatus({ kind: 'done', msg: `Añadidas ${n} tarjetas a «${deck.name}».` })
      setCsvFile(null)
      setRows([])
    } catch (e) {
      setStatus({ kind: 'error', msg: (e as Error).message })
    }
  }

  const doApkg = async (file: File) => {
    setStatus({ kind: 'busy', msg: 'Abriendo archivo…' })
    try {
      const r = await importApkg(file, (msg) => setStatus({ kind: 'busy', msg }))
      setStatus({
        kind: 'done',
        msg: `Importadas ${r.cards} tarjetas en ${r.decks} ${r.decks === 1 ? 'mazo' : 'mazos'}${r.media ? `, con ${r.media} archivos de imagen o audio` : ''}.`,
      })
    } catch (e) {
      setStatus({ kind: 'error', msg: `No se pudo importar: ${(e as Error).message}` })
    }
  }

  const busy = status.kind === 'busy'

  return (
    <div className="page">
      <h1>Importar tarjetas</h1>

      {status.kind !== 'idle' && (
        <p className={`notice notice--${status.kind}`} role="status">
          {status.msg} {status.kind === 'done' && <Link to="/">Ver mazos</Link>}
        </p>
      )}

      <div className="panel">
        <h2>Desde Anki</h2>
        <p className="muted">
          Elige un archivo <code>.apkg</code> (en Anki: Archivo › Exportar › Paquete de mazo). Se importan el texto, las imágenes y el audio; el progreso empieza de cero.
        </p>
        <label className={busy ? 'file-drop is-disabled' : 'file-drop'}>
          <input type="file" accept=".apkg,.colpkg" disabled={busy} onChange={(e) => e.target.files?.[0] && doApkg(e.target.files[0])} />
          Elegir archivo de Anki
        </label>
      </div>

      <div className="panel">
        <h2>Desde CSV o una hoja de cálculo</h2>
        <p className="muted">
          Una tarjeta por fila: primera columna el anverso, segunda el reverso, y opcionalmente una tercera con notas. Sirve un CSV exportado de Excel o Google Sheets, separado por comas, punto y coma o tabuladores.
        </p>
        <label className={busy ? 'file-drop is-disabled' : 'file-drop'}>
          <input type="file" accept=".csv,.tsv,.txt,text/csv" disabled={busy} onChange={(e) => e.target.files?.[0] && loadCsv(e.target.files[0])} />
          {csvFile ? csvFile.name : 'Elegir archivo CSV'}
        </label>

        {csvFile && (
          <div className="form">
            <label className="check">
              <input type="checkbox" checked={hasHeader} onChange={(e) => { setHasHeader(e.target.checked); loadCsv(csvFile, e.target.checked) }} />
              La primera fila son títulos de columna
            </label>

            {rows.length > 0 ? (
              <>
                <table className="preview">
                  <thead><tr><th>Anverso</th><th>Reverso</th></tr></thead>
                  <tbody>
                    {cardRows.slice(0, 5).map((r, i) => (
                      <tr key={i}><td>{htmlToSpeech(r.front)}</td><td>{htmlToSpeech(r.back)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted">{rows.length} filas{rows.length > 5 ? ', se muestran las 5 primeras' : ''}.</p>
                <label className="check">
                  <input type="checkbox" checked={swapCols} onChange={(e) => setSwapCols(e.target.checked)} />
                  Intercambiar anverso y reverso (usar la segunda columna como pregunta)
                </label>

                <div className="field-row">
                  <label className="field">
                    <span>Añadir a</span>
                    <select value={target} onChange={(e) => setTarget(e.target.value)}>
                      <option value="__new">Un mazo nuevo</option>
                      {decks?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                  {target === '__new' && (
                    <label className="field">
                      <span>Nombre del mazo</span>
                      <input value={newName} onChange={(e) => setNewName(e.target.value)} />
                    </label>
                  )}
                </div>
                <label className="check">
                  <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />
                  Crear también las tarjetas inversas
                </label>
                <div className="row">
                  <button className="btn btn--primary" disabled={busy} onClick={doCsvImport}>
                    Importar {rows.length * (reverse ? 2 : 1)} tarjetas
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">No se encontraron filas con al menos dos columnas.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
