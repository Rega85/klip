import { NextRequest, NextResponse } from 'next/server'

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN!
// Default model: minimax/video-01
// Override via REPLICATE_VIDEO_MODEL env var
// Other options: 'lucataco/kling-v1.6-standard-image-to-video', 'wavespeedai/wan-2.1-i2v-480p'
const VIDEO_MODEL = process.env.REPLICATE_VIDEO_MODEL || 'minimax/video-01'

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { imageDataUrl, prompt, duration } = await req.json()

    console.log('Received prompt:', prompt?.substring(0, 100))
    console.log('Has image:', !!imageDataUrl)

    if (!imageDataUrl || !prompt) {
      return NextResponse.json({ error: 'Missing imageDataUrl or prompt' }, { status: 400 })
    }

    // Build model-specific input
    // minimax/video-01 uses first_frame_image + prompt_text
    // Most other models use image + prompt
    let input: Record<string, unknown>
    if (VIDEO_MODEL.includes('minimax/video-01')) {
      input = {
        prompt: prompt,
        prompt_text: prompt,
        first_frame_image: imageDataUrl,
        prompt_optimizer: true,
      }
    } else {
      // Generic fallback for Kling, Wan, etc.
      input = {
        prompt,
        image: imageDataUrl,
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
