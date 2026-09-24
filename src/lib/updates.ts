import { registerSW } from 'virtual:pwa-register'

/*
 * A new version is applied (which reloads the page) only when it can't interrupt a study
 * session: right away outside the study screen, otherwise when leaving it or when the app
 * goes to the background.
 */
export function installUpdates() {
  let pending = false
  const studying = () => location.hash.startsWith('#/study/')

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true
      if (!studying()) apply()
    },
    onRegisteredSW(_url, registration) {
      // An installed app can stay open for days; look for new versions whenever it comes back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration?.update().catch(() => {})
      })
    },
  })

  function apply() {
    if (!pending) return
    pending = false
    updateSW(true)
  }

  window.addEventListener('hashchange', () => {
    if (!studying()) apply()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') apply()
  })
}
