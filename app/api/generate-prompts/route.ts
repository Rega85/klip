import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY is not set')
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const { sections, songTitle, genre } = await req.json()

    const sectionsText = sections
      .map((s: { label: string; lyrics: string; type: string }) =>
        `[${s.label}] (${s.type})\n${s.lyrics}`
      )
      .join('\n\n')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You are a music video director. Generate cinematic video prompts for each section of a song.

Song title: ${songTitle || 'Unknown'}
Genre: ${genre || 'Unknown'}

Lyrics with sections:
${sectionsText}

For each section, generate a cinematic video prompt optimized for AI image-to-video generation.
Rules:
- Each prompt should be 2-3 sentences, highly visual and cinematic
- Match the emotional energy: chorus = more intense/dynamic, verse = narrative/atmospheric, bridge = transitional/abstract
- Describe: shot type, lighting, movement, mood, visual elements
- NO text in video, NO people if possible (use silhouettes, nature, abstract)
- Make each section visually DISTINCT from others

Respond ONLY with valid JSON, no markdown, no preamble:
{"prompts": [{"label": "Section Label", "prompt": "cinematic prompt here"}]}`
        }],
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('Anthropic API error:', res.status, errBody)
      return NextResponse.json({ error: `Anthropic API ${res.status}: ${errBody}` }, { status: 500 })
    }

    const message = await res.json()
    if (!message.content?.[0]?.text) {
      console.error('Unexpected response:', JSON.stringify(message))
      return NextResponse.json({ error: 'No content in response' }, { status: 500 })
    }

    const raw = message.content[0].text
    const clean = raw.replace(/```json|```/g, '').trim()
    const data = JSON.parse(clean)
    return NextResponse.json(data)
  } catch (err) {
    console.error('generate-prompts error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate prompts' },
      { status: 500 }
    )
  }
}
