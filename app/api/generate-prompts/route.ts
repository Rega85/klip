import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  return NextResponse.json({
    keyExists: !!apiKey,
    keyPrefix: apiKey?.substring(0, 15) ?? 'MISSING'
  })
}
