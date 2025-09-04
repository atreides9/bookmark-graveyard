'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { ExternalLink, Search, Sparkles } from 'lucide-react'

interface Bookmark {
  id: string
  title: string
  url: string
  favicon?: string
  movedToGraveyard: string
  lastVisited?: string
  visitCount: number
}

export default function DashboardPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchBookmarks()
  }, [])

  const fetchBookmarks = async () => {
    try {
      const res = await fetch('/api/bookmarks')
      const data = await res.json()
      setBookmarks(data)
    } catch (error) {
      console.error('Failed to fetch bookmarks:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleResurrect = async (id: string) => {
    try {
      await fetch(`/api/bookmarks/${id}/resurrect`, { method: 'POST' })
      setBookmarks(prev => prev.filter(b => b.id !== id))
    } catch (error) {
      console.error('Failed to resurrect bookmark:', error)
    }
  }

  const filteredBookmarks = bookmarks.filter(b =>
    b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.url.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="container mx-auto px-4 py-8 text-white">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">북마크 묘지</h1>
        <p className="opacity-90">총 {bookmarks.length}개의 잊혀진 북마크</p>
      </div>

      {/* Search Bar */}
      <div className="bg-white/10 backdrop-blur rounded-lg p-4 mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 opacity-60" />
          <input
            type="text"
            placeholder="북마크 검색..."
            className="w-full pl-10 pr-4 py-2 bg-white/10 rounded-lg outline-none focus:bg-white/20 transition"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Bookmarks Grid */}
      {loading ? (
        <div className="text-center py-20">
          <div className="animate-spin w-12 h-12 border-4 border-white/30 border-t-white rounded-full mx-auto"></div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBookmarks.map((bookmark, index) => (
            <motion.div
              key={bookmark.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white/10 backdrop-blur rounded-lg p-4 hover:bg-white/15 transition"
            >
              <div className="flex items-start gap-3 mb-3">
                {bookmark.favicon && (
                  <Image src={bookmark.favicon} alt="favicon" width={20} height={20} className="mt-1" />
                )}
                <div className="flex-1">
                  <h3 className="font-semibold line-clamp-2 mb-1">{bookmark.title}</h3>
                  <p className="text-xs opacity-70 line-clamp-1">{bookmark.url}</p>
                </div>
              </div>
              
              <div className="text-sm opacity-80 mb-3">
                <div>묘지 이동: {new Date(bookmark.movedToGraveyard).toLocaleDateString('ko-KR')}</div>
                <div>방문 횟수: {bookmark.visitCount}회</div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleResurrect(bookmark.id)}
                  className="flex-1 py-2 bg-green-500/20 hover:bg-green-500/30 rounded flex items-center justify-center gap-2 text-sm transition"
                >
                  <Sparkles className="w-4 h-4" />
                  부활
                </button>
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-3 bg-white/10 hover:bg-white/20 rounded transition"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {filteredBookmarks.length === 0 && !loading && (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">✨</div>
          <p className="text-xl">검색 결과가 없습니다</p>
        </div>
      )}
    </div>
  )
}