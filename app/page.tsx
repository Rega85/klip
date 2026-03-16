'use client'

import { useState, useCallback } from 'react'
import { parseLyrics, assignTimestamps, buildClipList } from '@/lib/parse-lyrics'
import type { LyricsSection, VideoClip } from '@/lib/types'

type Step = 1 | 3 | 4

const BADGE: Record<string, string> = {
  chorus: 'badge-chorus',
  verse: 'badge-verse',
  bridge: 'badge-bridge',
  intro: 'badge-intro',
  outro: 'badge-outro',
  'pre-chorus': 'badge-other',
  other: 'badge-other',
}

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

async function pollAllClips(
  clips: VideoClip[],
  onLog: (m: string) => void,
  onUpdate: (fn: (prev: VideoClip[]) => VideoClip[]) => void
): Promise<VideoClip[]> {
  const state = clips.map(c => ({ ...c }))
  const pending = () => state.filter(c => c.predictionId && c.status !== 'succeeded' && c.status !== 'failed')

  while (pending().length > 0) {
    await new Promise(r => setTimeout(r, 5000))
    const toCheck = pending()

    await Promise.all(toCheck.map(async (clip) => {
      try {
        const res = await fetch(`/api/poll?id=${clip.predictionId}`)
        const data = await res.json()
        const idx = state.findIndex(c => c.id === clip.id)
        if (idx === -1) return

        state[idx].status = data.status === 'succeeded' ? 'succeeded'
          : data.status === 'failed' || data.status === 'canceled' ? 'failed'
          : 'processing'

        if (data.outputUrl) state[idx].outputUrl = data.outputUrl
        if (data.error) state[idx].error = data.error

        if (state[idx].status === 'succeeded') {
          onLog(`✅ Klip "${clip.sectionLabel}" #${clip.clipIndex + 1} — hotov`)
        } else if (state[idx].status === 'failed') {
          onLog(`❌ Klip "${clip.sectionLabel}" #${clip.clipIndex + 1} — selhalo: ${data.error || 'neznámá chyba'}`)
        }
      } catch (_) {}
    }))

    onUpdate(() => [...state])
  }

  return state
}

// ─── Step 4: Export ───────────────────────────────────────────────────────────
function Step4Export({
  clips,
  audioDataUrl,
  audioDuration,
  songTitle,
}: {
  clips: VideoClip[]
  audioDataUrl: string
  audioDuration: number
  songTitle: string
}) {
  const [isStitching, setIsStitching] = useState(false)
  const [finalUrl, setFinalUrl] = useState<string | null>(null)
  const [zipUrl, setZipUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  const succeeded = clips.filter(c => c.status === 'succeeded')
  const failed = clips.filter(c => c.status === 'failed')

  const stitchVideo = async () => {
    setIsStitching(true)
    setError('')
    try {
      setProgress('Načítám FFmpeg...')
      const { FFmpeg } = await import('@ffmpeg/ffmpeg')
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util')

      const ffmpeg = new FFmpeg()

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      })

      setProgress('Stahuji video clipy...')
      const fileList: string[] = []

      for (let i = 0; i < succeeded.length; i++) {
        const clip = succeeded[i]
        setProgress(`Nahrávám klip ${i + 1}/${succeeded.length}...`)
        const data = await fetchFile(clip.outputUrl!)
        const name = `clip${i.toString().padStart(3, '0')}.mp4`
        await ffmpeg.writeFile(name, data)
        fileList.push(`file '${name}'`)
      }

      // Write concat file
      await ffmpeg.writeFile('list.txt', fileList.join('\n'))

      setProgress('Spojuji video...')
      await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'video_silent.mp4'])

      setProgress('Přidávám audio...')
      const audioData = await fetchFile(audioDataUrl)
      await ffmpeg.writeFile('audio.mp3', audioData)

      await ffmpeg.exec([
        '-i', 'video_silent.mp4',
        '-i', 'audio.mp3',
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        'final.mp4',
      ])

      setProgress('Finalizuji...')
      const out = await ffmpeg.readFile('final.mp4')
      const blob = new Blob([out as unknown as ArrayBuffer], { type: 'video/mp4' })
      setFinalUrl(URL.createObjectURL(blob))
      setProgress('')
    } catch (e: any) {
      console.error('FFmpeg error object:', e)
      console.error('FFmpeg error message:', e?.message)
      console.error('FFmpeg error stack:', e?.stack)
      setError(`FFmpeg chyba: ${e?.message || String(e)}. Zkus stáhnout ZIP clipů níže.`)
    } finally {
      setIsStitching(false)
    }
  }

  const downloadZip = async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    for (let i = 0; i < succeeded.length; i++) {
      const clip = succeeded[i]
      const res = await fetch(clip.outputUrl!)
      const blob = await res.blob()
      const name = `${(i + 1).toString().padStart(3, '0')}_${clip.sectionLabel.replace(/\s+/g, '_')}_${clip.clipIndex + 1}.mp4`
      zip.file(name, blob)
    }

    const content = await zip.generateAsync({ type: 'blob' })
    setZipUrl(URL.createObjectURL(content))
  }

  return (
    <div>
      <h2 className="font-display" style={{ fontSize: 36, marginBottom: 8 }}>
        04 — EXPORT
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 32, fontSize: 14 }}>
        {succeeded.length} clipů úspěšně vygenerováno
        {failed.length > 0 && `, ${failed.length} selhalo`}. Celková délka: {fmt(audioDuration)}.
      </p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
        {[
          { label: 'Celkem clipů', value: clips.length },
          { label: 'Úspěšných', value: succeeded.length, color: 'var(--green)' },
          { label: 'Selhalo', value: failed.length, color: failed.length > 0 ? 'var(--red)' : undefined },
        ].map(item => (
          <div key={item.label} className="card" style={{ padding: '16px 20px' }}>
            <div className="font-display" style={{ fontSize: 36, color: item.color || 'var(--amber)', lineHeight: 1 }}>
              {item.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Stitch button */}
      {!finalUrl && (
        <div className="card" style={{ padding: 24, marginBottom: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
            Spoj všechny clipy + audio do jednoho MP4 souboru (běží v prohlížeči)
          </p>
          {error && (
            <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>
          )}
          {progress && (
            <p className="font-mono animate-pulse-amber" style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 12 }}>
              {progress}
            </p>
          )}
          <button
            className="btn-primary"
            onClick={stitchVideo}
            disabled={isStitching || succeeded.length === 0}
            style={{ fontSize: 15 }}
          >
            {isStitching ? '⏳ Probíhá...' : '🎬 Sestavit finální MP4'}
          </button>
        </div>
      )}

      {/* Final video preview */}
      {finalUrl && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <video
            src={finalUrl}
            controls
            style={{ width: '100%', borderRadius: 6, marginBottom: 16 }}
          />
          <a
            href={finalUrl}
            download={`${songTitle || 'klip'}_final.mp4`}
            className="btn-primary"
            style={{ display: 'inline-block', textDecoration: 'none', fontSize: 15 }}
          >
            ⬇ Stáhnout MP4
          </a>
        </div>
      )}

      {/* ZIP fallback */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {!zipUrl ? (
          <button className="btn-ghost" onClick={downloadZip} style={{ fontSize: 13 }}>
            📦 Stáhnout clipy jako ZIP
          </button>
        ) : (
          <a
            href={zipUrl}
            download={`${songTitle || 'klipy'}.zip`}
            className="btn-ghost"
            style={{ textDecoration: 'none', fontSize: 13 }}
          >
            ⬇ Stáhnout ZIP
          </a>
        )}
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
          (záloha — jednotlivé clipy pro ruční editaci)
        </span>
      </div>

      {/* Clip list */}
      <div style={{ marginTop: 32 }}>
        <p className="font-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12, letterSpacing: '0.05em' }}>
          VYGENEROVANÉ CLIPY
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {clips.map(clip => (
            <div key={clip.id} className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14 }}>
                {clip.status === 'succeeded' ? '✅' : '❌'}
              </span>
              <span style={{ fontSize: 13, flex: 1 }}>
                {clip.sectionLabel} #{clip.clipIndex + 1}
              </span>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {fmt(clip.startTime)}–{fmt(clip.endTime)}
              </span>
              {clip.outputUrl && (
                <a
                  href={clip.outputUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, color: 'var(--amber)', textDecoration: 'none' }}
                >
                  ▶ přehrát
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [step, setStep] = useState<Step>(1)

  // Step 1
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioDataUrl, setAudioDataUrl] = useState('')
  const [lyricsText, setLyricsText] = useState('')
  const [songTitle, setSongTitle] = useState('')
  const [genre, setGenre] = useState('')
  const [sections, setSections] = useState<LyricsSection[]>([])
  const [isDragging, setIsDragging] = useState(false)


  // Step 3
  const [clips, setClips] = useState<VideoClip[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const addLog = useCallback((msg: string) => {
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`])
  }, [])

  const completedClips = clips.filter(c => c.status === 'succeeded').length
  const totalClips = clips.length

  const handleAudioFile = useCallback((file: File) => {
    if (!file.type.startsWith('audio')) return
    setAudioFile(file)
    const url = URL.createObjectURL(file)
    const audio = new Audio(url)
    audio.addEventListener('loadedmetadata', () => {
      setAudioDuration(audio.duration)
    })
    const reader = new FileReader()
    reader.onload = e => setAudioDataUrl(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const handleParseLyrics = () => {
    if (!lyricsText.trim() || !audioDuration) return
    const parsed = parseLyrics(lyricsText)
    const withTimes = assignTimestamps(parsed as LyricsSection[], audioDuration)
    setSections(withTimes)
  }

  const startGeneration = async () => {
    setIsGenerating(true)
    setStep(3)
    setLog([])

    try {
      const clipList = buildClipList(sections)
      const initClips: VideoClip[] = clipList.map(c => ({ ...c }))
      setClips(initClips)

      addLog(`Generuji prompty pro ${sections.length} sekcí...`)

      const promptRes = await fetch('/api/generate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections, songTitle, genre }),
      })
      const promptData = await promptRes.json()

      const promptMap: Record<string, string> = {}
      for (const p of promptData.prompts || []) {
        const section = sections.find(s => s.label === p.label)
        if (section) promptMap[section.id] = p.prompt
      }

      addLog(`✓ Prompty vygenerovány. Spouštím ${clipList.length} clipů postupně (12s mezi každým)...`)

      // Send clips one at a time with 12s delay between each
      const CLIP_DELAY = 15000
      const startedClips: VideoClip[] = [...clipList]

      for (let i = 0; i < clipList.length; i++) {
        if (i > 0) {
          addLog(`⏳ Čekám 12s před dalším klipem...`)
          await new Promise(r => setTimeout(r, CLIP_DELAY))
        }

        const clip = clipList[i]
        const section = sections.find(s => s.id === clip.sectionId)!
        const prompt = promptMap[section.id] || `Cinematic ${section.type} music video shot, atmospheric and emotional`

        addLog(`▸ Spouštím klip ${i + 1}/${clipList.length}: "${section.label}" #${clip.clipIndex + 1}`)

        const res = await fetch('/api/start-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, duration: Math.max(5, Math.round(clip.duration)) }),
        })
        const data = await res.json()

        if (data.predictionId) {
          addLog(`▶ "${section.label}" #${clip.clipIndex + 1} — spuštěn`)
          startedClips[i] = { ...clip, predictionId: data.predictionId, status: 'starting' as const }
        } else {
          addLog(`✗ "${section.label}" #${clip.clipIndex + 1} — chyba spouštění`)
          startedClips[i] = { ...clip, status: 'failed' as const, error: data.error || 'Start failed' }
        }
        setClips([...startedClips])
      }

      setClips(startedClips)
      addLog(`${startedClips.filter(c => c.predictionId).length}/${clipList.length} clipů spuštěno. Čekám...`)

      const finalClips = await pollAllClips(startedClips, addLog, setClips)
      setClips(finalClips)
      addLog(`✓ Generování dokončeno! ${finalClips.filter(c => c.status === 'succeeded').length}/${finalClips.length} úspěšných.`)
      setStep(4)
    } catch (err) {
      addLog(`✗ Chyba: ${String(err)}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const previewClips = buildClipList(sections)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 className="font-display" style={{ fontSize: 32, color: 'var(--amber)', letterSpacing: '0.15em' }}>
              KLIP
            </h1>
            <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
              v0.1 / AI MUSIC VIDEO
            </span>
          </div>
          {/* Step pills */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {(['01 UPLOAD', '02 GENEROVÁNÍ', '03 EXPORT'] as const).map((label, i) => {
              const n = ([1, 3, 4] as Step[])[i]
              const active = step === n
              const done = step > n
              return (
                <div key={n} style={{
                  padding: '5px 12px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  letterSpacing: '0.05em',
                  background: active ? 'var(--amber)' : done ? '#1a1200' : 'transparent',
                  color: active ? '#000' : done ? '#f59e0b99' : 'var(--text-dim)',
                  border: active ? 'none' : '1px solid var(--border)',
                  fontWeight: active ? 600 : 400,
                }}>
                  {label}
                </div>
              )
            })}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <section>
            <h2 className="font-display" style={{ fontSize: 42, marginBottom: 6, letterSpacing: '0.05em' }}>
              NAHRÁT MATERIÁL
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 40, fontSize: 14 }}>
              MP3 ze Suno + lyrics se sekcemi <span className="font-mono" style={{ color: 'var(--amber)', fontSize: 12 }}>[Verse 1]</span>,{' '}
              <span className="font-mono" style={{ color: 'var(--amber)', fontSize: 12 }}>[Chorus]</span>,{' '}
              <span className="font-mono" style={{ color: 'var(--amber)', fontSize: 12 }}>[Bridge]</span> atd.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
              {/* Drop zone */}
              <div>
                <p className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.08em' }}>
                  AUDIO FILE
                </p>
                <div
                  className="card"
                  onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => {
                    e.preventDefault(); setIsDragging(false)
                    const f = e.dataTransfer.files[0]; if (f) handleAudioFile(f)
                  }}
                  onClick={() => document.getElementById('audio-in')?.click()}
                  style={{
                    height: 160,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 10, cursor: 'pointer',
                    borderColor: isDragging ? 'var(--amber)' : audioFile ? '#22c55e55' : 'var(--border)',
                    background: isDragging ? '#110900' : audioFile ? '#061006' : 'var(--bg-card)',
                    transition: 'all 0.15s',
                  }}
                >
                  <input id="audio-in" type="file" accept="audio/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleAudioFile(f) }} />
                  {audioFile ? (
                    <>
                      <div style={{ fontSize: 36 }}>🎵</div>
                      <div style={{ fontSize: 13, color: '#4ade80' }}>{audioFile.name}</div>
                      <div className="font-mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {audioDuration ? fmt(audioDuration) : '⏳ načítám...'}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 36, opacity: 0.2 }}>🎵</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Přetáhni MP3 nebo klikni</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>MP3, WAV, M4A...</div>
                    </>
                  )}
                </div>
              </div>

              {/* Meta */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <p className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.08em' }}>NÁZEV PÍSNĚ</p>
                  <input className="input" placeholder="např. Temná Noc" value={songTitle} onChange={e => setSongTitle(e.target.value)} />
                </div>
                <div>
                  <p className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.08em' }}>ŽÁNR</p>
                  <input className="input" placeholder="např. dark pop, cinematic, indie" value={genre} onChange={e => setGenre(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Lyrics */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                  LYRICS — kopíruj přímo ze Suno (zachovej [sekce])
                </p>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: '5px 14px' }}
                  disabled={!lyricsText.trim() || !audioDuration}
                  onClick={handleParseLyrics}
                >
                  Parsovat →
                </button>
              </div>
              <textarea
                className="input"
                rows={10}
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, lineHeight: 1.7 }}
                placeholder={`[Intro]\n\n[Verse 1]\nPrvní řádek sloky\nDruhý řádek\n\n[Chorus]\nRef ref ref\n\n[Bridge]\nPřechod...`}
                value={lyricsText}
                onChange={e => setLyricsText(e.target.value)}
              />
            </div>

            {sections.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <p className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, letterSpacing: '0.08em' }}>
                  {sections.length} SEKCÍ → {previewClips.length} CLIPŮ (á max 8s)
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {sections.map(s => (
                    <div key={s.id} className="card-elevated" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`section-badge ${BADGE[s.type] || 'badge-other'}`}>{s.type}</span>
                      <span style={{ fontSize: 13 }}>{s.label}</span>
                      <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                        {fmt(s.startTime)}–{fmt(s.endTime)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 36, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn-primary"
                disabled={!audioFile || sections.length === 0}
                onClick={startGeneration}
                style={{ fontSize: 15 }}
              >
                Spustit generování →
              </button>
            </div>
          </section>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <section>
            <h2 className="font-display" style={{ fontSize: 42, marginBottom: 6, letterSpacing: '0.05em' }}>
              GENEROVÁNÍ
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 40, fontSize: 14 }}>
              {isGenerating ? 'Paralelně generuji všechny clipy. Průměr: 5–15 minut celkem.' : 'Hotovo.'}
            </p>

            {/* Overall progress */}
            <div className="card" style={{ padding: 24, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <span className="font-display" style={{ fontSize: 24, letterSpacing: '0.05em' }}>CELKOVÝ PROGRES</span>
                <span className="font-display" style={{ fontSize: 32, color: 'var(--amber)' }}>
                  {completedClips} / {totalClips}
                </span>
              </div>
              <div className="progress-bar" style={{ height: 4 }}>
                <div className="progress-fill" style={{ width: totalClips ? `${(completedClips / totalClips) * 100}%` : '0%' }} />
              </div>
            </div>

            {/* Clips grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, marginBottom: 24 }}>
              {clips.map(clip => (
                <div key={clip.id} className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {clip.sectionLabel} <span style={{ color: 'var(--text-dim)' }}>#{clip.clipIndex + 1}</span>
                    </span>
                    <span>
                      {clip.status === 'pending' && <span style={{ opacity: 0.3 }}>○</span>}
                      {(clip.status === 'starting' || clip.status === 'processing') && (
                        <span className="animate-pulse-amber" style={{ color: 'var(--amber)' }}>◉</span>
                      )}
                      {clip.status === 'succeeded' && <span style={{ color: '#4ade80' }}>●</span>}
                      {clip.status === 'failed' && <span style={{ color: 'var(--red)' }}>✕</span>}
                    </span>
                  </div>
                  <div className="font-mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>
                    {fmt(clip.startTime)} → {fmt(clip.endTime)}
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{
                      width: clip.status === 'succeeded' ? '100%'
                        : clip.status === 'processing' ? '65%'
                        : clip.status === 'starting' ? '20%' : '0%',
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Log terminal */}
            <div className="card" style={{ padding: 16, background: '#040404', maxHeight: 220, overflowY: 'auto' }}>
              <div className="font-mono" style={{ fontSize: 11, color: '#4ade8066', marginBottom: 8, letterSpacing: '0.06em' }}>
                ▸ GENERATION LOG
              </div>
              {log.map((entry, i) => (
                <div key={i} className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
                  {entry}
                </div>
              ))}
              {isGenerating && (
                <div className="font-mono animate-pulse-amber" style={{ fontSize: 11, color: 'var(--amber)' }}>
                  █ probíhá...
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── STEP 4 ── */}
        {step === 4 && (<>
          <div style={{ marginBottom: 32 }}>
            <button className="btn-ghost" onClick={() => { setStep(1); setClips([]); setSections([]); setLyricsText(''); setAudioFile(null); setAudioDataUrl(''); setAudioDuration(0); setSongTitle(''); setGenre(''); setLog([]); }}>
              ← Začít znovu
            </button>
          </div>
          <Step4Export
            clips={clips}
            audioDataUrl={audioDataUrl}
            audioDuration={audioDuration}
            songTitle={songTitle}
          />
        </>)}
      </main>
    </div>
  )
}
