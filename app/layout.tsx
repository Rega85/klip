import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'KLIP — AI Music Video Generator',
  description: 'Generate full music video clips from your Suno tracks',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  )
}
