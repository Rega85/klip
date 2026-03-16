import { LyricsSection, SectionType } from './types'

function genId(): string {
  return Math.random().toString(36).substr(2, 9)
}

function getSectionType(label: string): SectionType {
  const l = label.toLowerCase()
  if (l.includes('chorus') || l.includes('ref') || l.includes('refrén')) return 'chorus'
  if (l.includes('bridge') || l.includes('přechod')) return 'bridge'
  if (l.includes('intro')) return 'intro'
  if (l.includes('outro')) return 'outro'
  if (l.includes('pre-chorus') || l.includes('pre chorus')) return 'pre-chorus'
  if (l.includes('verse') || l.includes('sloka') || l.includes('verš')) return 'verse'
  return 'other'
}

export function parseLyrics(text: string): Omit<LyricsSection, 'startTime' | 'endTime'>[] {
  const lines = text.split('\n')
  const sections: Omit<LyricsSection, 'startTime' | 'endTime'>[] = []
  const sectionRegex = /^\[(.+?)\]/

  let currentLabel: string | null = null
  let currentLines: string[] = []

  const flush = () => {
    if (currentLabel && currentLines.join('').trim()) {
      sections.push({
        id: genId(),
        type: getSectionType(currentLabel),
        label: currentLabel,
        lyrics: currentLines.join('\n').trim(),
      })
    }
  }

  for (const line of lines) {
    const match = line.match(sectionRegex)
    if (match) {
      flush()
      currentLabel = match[1].trim()
      currentLines = []
    } else if (currentLabel !== null) {
      currentLines.push(line)
    }
  }
  flush()

  return sections
}

export function assignTimestamps(
  sections: Omit<LyricsSection, 'startTime' | 'endTime'>[],
  audioDuration: number
): LyricsSection[] {
  const totalChars = sections.reduce((sum, s) => sum + s.lyrics.length, 0) || 1
  let current = 0

  return sections.map((s) => {
    const ratio = s.lyrics.length / totalChars
    const duration = ratio * audioDuration
    const start = current
    current += duration
    return { ...s, startTime: start, endTime: current }
  })
}

export function buildClipList(
  sections: LyricsSection[],
  maxClipDuration = 8
) {
  const clips = []
  for (const section of sections) {
    const sectionDuration = section.endTime - section.startTime
    const numClips = Math.ceil(sectionDuration / maxClipDuration)
    for (let i = 0; i < numClips; i++) {
      const clipStart = section.startTime + i * maxClipDuration
      const clipEnd = Math.min(clipStart + maxClipDuration, section.endTime)
      clips.push({
        id: genId(),
        sectionId: section.id,
        sectionLabel: section.label,
        clipIndex: i,
        startTime: clipStart,
        endTime: clipEnd,
        duration: clipEnd - clipStart,
        status: 'pending' as const,
      })
    }
  }
  return clips
}
