import { db } from './db'

/*
 * Mobile browsers can drop the IndexedDB connection while the app sits in the background
 * (iOS Safari: "Connection to Indexed Database server lost"), and a new version of the app
 * opened in another tab closes ours. Live queries don't recover from that, so the screen
 * goes blank and buttons stop working. We detect it and reload, which reconnects cleanly.
 */

const RELOAD_KEY = 'repaso:dbReloadAt'
const DB_ERROR_RE = /DatabaseClosed|UnknownError|InvalidState|TransactionInactive|Connection to Indexed Database server lost|database connection is closing/i

export function isDbError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as { name?: string; message?: string; inner?: unknown }
  return DB_ERROR_RE.test(`${err.name ?? ''} ${err.message ?? ''}`) || (err.inner !== undefined && isDbError(err.inner))
}

/** Reloads the page, at most once every 15 s so a persistent failure can't loop. Returns false if it didn't reload. */
export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Date.now() - last < 15000) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    /* storage unavailable: reload anyway */
  }
  location.reload()
  return true
}

async function dbHealthy() {
  try {
    await db.decks.limit(1).count()
    return true
  } catch {
    return false
  }
}

let checking = false
export async function recoverIfBroken() {
  if (checking) return
  checking = true
  try {
    if (!(await dbHealthy())) reloadOnce()
  } finally {
    checking = false
  }
}

export function installDbWatchdog() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recoverIfBroken()
  })
  // Restored from the back/forward cache with a stale connection.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) recoverIfBroken()
  })
  window.addEventListener('unhandledrejection', (e) => {
    if (isDbError(e.reason)) recoverIfBroken()
  })
  // Live queries swallow their errors (the screen just stays empty), so also check on navigation and periodically.
  window.addEventListener('hashchange', () => recoverIfBroken())
  setInterval(() => {
    if (document.visibilityState === 'visible') recoverIfBroken()
  }, 30000)
  // The browser closed the connection underneath us.
  db.on('close', () => recoverIfBroken())
  // A newer version of the app (with a newer schema) was opened elsewhere: step aside and reload into it.
  db.on('versionchange', () => {
    db.close()
    reloadOnce()
    return false
  })
}
