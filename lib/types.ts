export type SectionType = 'verse' | 'chorus' | 'bridge' | 'intro' | 'outro' | 'pre-chorus' | 'other'

export interface LyricsSection {
  id: string
  type: SectionType
  label: string
  lyrics: string
  startTime: number
  endTime: number
  imageDataUrl?: string
  videoPrompt?: string
}

export interface VideoClip {
  id: string
  sectionId: string
  sectionLabel: string
  clipIndex: number
  startTime: number
  endTime: number
  duration: number
  predictionId?: string
  status: 'pending' | 'starting' | 'processing' | 'succeeded' | 'failed'
  outputUrl?: string
  error?: string
}
