import { useLiveQuery, useObservable } from 'dexie-react-hooks'
import { useState } from 'react'
import { cloudUrl, db } from '../lib/db'
import { exportBackup, restoreBackup } from '../lib/importers'

const SYNC_LABELS: Record<string, string> = {
  connecting: 'Conectando…',
  connected: 'Sincronizado',
  disconnected: 'Sin conexión: se sincronizará al volver',
  offline: 'Sin conexión: se sincronizará al volver',
  error: 'Error al sincronizar',
}

function SyncPanel() {
  const user = useObservable(db.cloud.currentUser)
  const sync = useObservable(db.cloud.syncState)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <h2>Sincronización</h2>
      {user?.isLoggedIn ? (
        <>
          <p className="muted">
            Conectado como <strong>{user.email ?? user.userId}</strong>.{' '}
            {sync?.phase === 'pushing' || sync?.phase === 'pulling' ? 'Sincronizando…' : (sync && SYNC_LABELS[sync.status]) ?? ''}
            {sync?.error && ` (${sync.error.message})`}
          </p>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => run(() => db.cloud.sync({ purpose: 'push', wait: true }))}>Sincronizar ahora</button>
            <button className="btn btn--ghost" disabled={busy} onClick={() => run(() => db.cloud.logout())}>Cerrar sesión</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Inicia sesión con tu email para tener los mismos mazos y el mismo progreso en el ordenador y en el móvil. Te enviaremos un código; no hace falta contraseña. Los mazos que ya tienes en este dispositivo se suben a tu cuenta.
          </p>
          <button className="btn btn--primary" disabled={busy} onClick={() => run(() => db.cloud.login())}>Iniciar sesión para sincronizar</button>
        </>
      )}
    </div>
  )
}

export function SettingsPage() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const stats = useLiveQuery(async () => ({
    decks: await db.decks.count(),
    cards: await db.cards.count(),
    reviews: await db.reviewLog.count(),
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

      {cloudUrl && <SyncPanel />}

      <div className="panel">
        <h2>Tus datos</h2>
        <p className="muted">
          {cloudUrl ? 'Todo se guarda en este dispositivo y, si inicias sesión, se sincroniza con tus otros dispositivos.' : 'Todo se guarda en este dispositivo, sin cuenta ni servidor.'}
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
