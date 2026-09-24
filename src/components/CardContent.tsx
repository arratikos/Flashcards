import DOMPurify from 'dompurify'
import { useEffect, useMemo, useRef } from 'react'
import { db } from '../lib/db'

const SOUND_RE = /\[sound:([^\]]+)\]/g

/** Renders card HTML (from Anki or typed by the user) with local images and audio resolved from IndexedDB. */
export function CardContent({ html, className, autoplay = false }: { html: string; className?: string; autoplay?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const clean = useMemo(() => {
    const withSounds = html.replace(SOUND_RE, (_, name) => `<button type="button" class="sound" data-sound="${encodeURIComponent(name)}" aria-label="Reproducir audio">▶</button>`)
    // Plain text typed by the user keeps its line breaks.
    const withBreaks = /<[a-z][\s\S]*>/i.test(withSounds) ? withSounds : withSounds.replace(/\n/g, '<br>')
    return DOMPurify.sanitize(withBreaks, { ADD_ATTR: ['data-sound'] })
  }, [html])

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const urls: string[] = []
    let cancelled = false
    const audios: HTMLAudioElement[] = []

    const resolve = async (name: string) => {
      const m = await db.media.get(name)
      if (!m || cancelled) return null
      const url = URL.createObjectURL(m.blob)
      urls.push(url)
      return url
    }

    root.querySelectorAll<HTMLImageElement>('img').forEach(async (img) => {
      const src = img.getAttribute('src')
      if (!src || /^(https?:|data:|blob:)/.test(src)) return
      const url = await resolve(decodeURIComponent(src))
      if (url) img.src = url
    })

    const buttons = [...root.querySelectorAll<HTMLButtonElement>('button.sound')]
    buttons.forEach(async (btn, i) => {
      const url = await resolve(decodeURIComponent(btn.dataset.sound ?? ''))
      if (!url) {
        btn.hidden = true
        return
      }
      const audio = new Audio(url)
      audios.push(audio)
      btn.onclick = (e) => {
        e.stopPropagation()
        audio.currentTime = 0
        audio.play()
      }
      if (autoplay && i === 0) audio.play().catch(() => {})
    })

    return () => {
      cancelled = true
      audios.forEach((a) => a.pause())
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [clean, autoplay])

  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: clean }} />
}

export function hasSound(html: string) {
  return /\[sound:/.test(html)
}
