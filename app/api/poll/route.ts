import { NextRequest, NextResponse } from 'next/server'

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN!

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Replicate poll failed' }, { status: res.status })
    }

    const prediction = await res.json()

    // output can be a string URL or an array
    let outputUrl: string | undefined
    if (prediction.output) {
      outputUrl = Array.isArray(prediction.output)
        ? prediction.output[0]
        : prediction.output
    }

    return NextResponse.json({
      status: prediction.status, // starting | processing | succeeded | failed | canceled
      outputUrl,
      error: prediction.error,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Poll failed' }, { status: 500 })
  }
}
