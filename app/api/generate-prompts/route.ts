import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { sections, songTitle, genre } = await req.json()

    const sectionsText = sections
      .map((s: { label: string; lyrics: string; type: string }) =>
        `[${s.label}] (${s.type})\n${s.lyrics}`
      )
      .join('\n\n')

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
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
{
  "prompts": [
    {"label": "Section Label", "prompt": "cinematic prompt here"},
    ...
  ]
}`,
        },
      ],
    })

    const raw = (message.content[0] as { text: string }).text
    const data = JSON.parse(raw)

    return NextResponse.json(data)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to generate prompts' }, { status: 500 })
  }
}
