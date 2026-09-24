import type { DeckCounts } from '../lib/srs'

export function Counts({ counts }: { counts: DeckCounts }) {
  return (
    <span className="counts">
      <span className="count count--new" title="Nuevas" data-zero={counts.newCount === 0 || undefined}>{counts.newCount}</span>
      <span className="count count--learn" title="Aprendiendo" data-zero={counts.learnCount === 0 || undefined}>{counts.learnCount}</span>
      <span className="count count--review" title="Para repasar" data-zero={counts.reviewCount === 0 || undefined}>{counts.reviewCount}</span>
    </span>
  )
}
