export const LANGUAGES: { code: string; label: string }[] = [
  { code: '', label: 'Sin voz' },
  { code: 'es-ES', label: 'Español' },
  { code: 'en-US', label: 'Inglés (EE. UU.)' },
  { code: 'en-GB', label: 'Inglés (Reino Unido)' },
  { code: 'fr-FR', label: 'Francés' },
  { code: 'de-DE', label: 'Alemán' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'pt-PT', label: 'Portugués' },
  { code: 'pt-BR', label: 'Portugués (Brasil)' },
  { code: 'nl-NL', label: 'Neerlandés' },
  { code: 'ca-ES', label: 'Catalán' },
  { code: 'eu-ES', label: 'Euskera' },
  { code: 'gl-ES', label: 'Gallego' },
  { code: 'ru-RU', label: 'Ruso' },
  { code: 'pl-PL', label: 'Polaco' },
  { code: 'sv-SE', label: 'Sueco' },
  { code: 'el-GR', label: 'Griego' },
  { code: 'tr-TR', label: 'Turco' },
  { code: 'ar-SA', label: 'Árabe' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ja-JP', label: 'Japonés' },
  { code: 'ko-KR', label: 'Coreano' },
  { code: 'zh-CN', label: 'Chino (mandarín)' },
]

export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

function pickVoice(lang: string) {
  const voices = speechSynthesis.getVoices()
  const exact = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
  const base = lang.split('-')[0].toLowerCase()
  const similar = voices.filter((v) => v.lang.toLowerCase().startsWith(base))
  const pool = exact.length ? exact : similar
  // Prefer higher-quality voices when the platform exposes them.
  return pool.find((v) => /natural|neural|premium|enhanced|google/i.test(v.name)) ?? pool[0]
}

export function htmlToSpeech(html: string) {
  const doc = new DOMParser().parseFromString(html.replace(/\[sound:[^\]]+\]/g, ''), 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function speak(html: string, lang: string) {
  if (!ttsSupported || !lang) return
  const text = htmlToSpeech(html)
  if (!text) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang
  const voice = pickVoice(lang)
  if (voice) u.voice = voice
  u.rate = 0.95
  speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (ttsSupported) speechSynthesis.cancel()
}

// Voices load asynchronously in Chrome; touching the list early makes them available sooner.
if (ttsSupported) speechSynthesis.getVoices()
