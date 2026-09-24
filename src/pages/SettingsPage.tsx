import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../lib/db'
import { exportBackup, restoreBackup } from '../lib/importers'

export function SettingsPage() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const stats = useLiveQuery(async () => ({
    decks: await db.decks.count(),
    cards: await db.cards.count(),
    reviews: await db.reviews.count(),
  }))

  const download = async () => {
    const blob = await exportBackup()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `repaso-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const restore = async (file: File) => {
    try {
      const r = await restoreBackup(file)
      setMsg({ ok: true, text: `Restaurados ${r.decks} mazos y ${r.cards} tarjetas.` })
    } catch (e) {
      setMsg({ ok: false, text: `No se pudo restaurar: ${(e as Error).message}` })
    }
  }

  return (
    <div className="page">
      <h1>Ajustes</h1>
      {msg && <p className={msg.ok ? 'notice notice--done' : 'notice notice--error'} role="status">{msg.text}</p>}

      <div className="panel">
        <h2>Tus datos</h2>
        <p className="muted">
          Todo se guarda en este dispositivo, sin cuenta ni servidor.
          {stats && ` Ahora mismo: ${stats.decks} mazos, ${stats.cards} tarjetas y ${stats.reviews} repasos.`}
        </p>
        <p className="muted">Para pasar tus tarjetas a otro dispositivo, descarga una copia aquí y restáurala allí. Las imágenes y audios importados de Anki no se incluyen.</p>
        <div className="row">
          <button className="btn btn--primary" onClick={download}>Descargar copia de seguridad</button>
          <label className="btn">
            <input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
            Restaurar copia
          </label>
        </div>
      </div>

      <div className="panel">
        <h2>Cómo funciona el repaso</h2>
        <p className="muted">
          Repaso usa FSRS, el algoritmo de repetición espaciada más preciso disponible: calcula cuándo estás a punto de olvidar cada tarjeta y te la enseña justo antes. Responde con sinceridad: «Otra vez» si no la sabías, «Difícil» si te costó, «Bien» si la recordaste, «Fácil» si fue inmediato.
        </p>
        <p className="muted">Atajos de teclado al estudiar: Espacio para mostrar la respuesta, 1–4 para responder, U para deshacer.</p>
      </div>
    </div>
  )
}
