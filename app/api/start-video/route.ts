import { NextRequest, NextResponse } from 'next/server'

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN!
// Default model: minimax/video-01 (text-to-video)
// Override via REPLICATE_VIDEO_MODEL env var
// Other options: 'wavespeedai/wan-2.1-i2v-480p'
const VIDEO_MODEL = process.env.REPLICATE_VIDEO_MODEL || 'minimax/video-01'

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { prompt, duration } = await req.json()

    console.log('Received prompt:', prompt?.substring(0, 100))

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })
    }

    // Build model-specific input (text-to-video)
    let input: Record<string, unknown>
    if (VIDEO_MODEL.includes('minimax/video-01')) {
      input = {
        prompt_text: prompt,
        prompt_optimizer: true,
      }
    } else if (VIDEO_MODEL.includes('wan')) {
      input = {
        prompt: prompt,
        negative_prompt: 'static, blurry, low quality, watermark, text',
        num_frames: 81,
      }
      console.log('Wan input:', JSON.stringify(input))
    } else {
      // Generic fallback
      input = {
        prompt,
        duration: Math.min(Math.round(duration || 8), 10),
      }
    }

    console.log('Replicate request:', JSON.stringify({ model: VIDEO_MODEL, input }, null, 2))
    console.log('Sending to Replicate, input:', JSON.stringify(input))

    const res = await fetch(`https://api.replicate.com/v1/models/${VIDEO_MODEL}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'respond-async',
      },
      body: JSON.stringify({ input }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Replicate error:', err)
      return NextResponse.json({ error: err }, { status: res.status })
    }

    const prediction = await res.json()
    return NextResponse.json({ predictionId: prediction.id })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to start video generation' }, { status: 500 })
  }
}
