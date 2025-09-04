import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '북마크 묘지 구조대',
  description: '잊혀진 북마크를 AI가 정리하고 요약해드립니다',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-700 to-purple-900">
          {children}
        </div>
      </body>
    </html>
  )
}