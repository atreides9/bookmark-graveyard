'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { ExternalLink, Search, Sparkles, Filter, Calendar, Tag } from 'lucide-react'
import WordCloud from '@/components/WordCloud'

interface Bookmark {
  id: string
  title: string
  url: string
  favicon?: string
  movedToGraveyard: string
  lastVisited?: string
  visitCount: number
  category?: string
  keywords?: string[]
}

interface WordData {
  text: string
  weight: number
  category?: string
}

type TimePeriod = '1day' | '7days' | '14days' | '21days' | '1month' | '6months' | '1year' | '3years' | '5years'

const TIME_PERIODS = [
  { key: '1day', label: '하루', days: 1 },
  { key: '7days', label: '7일', days: 7 },
  { key: '14days', label: '2주', days: 14 },
  { key: '21days', label: '3주', days: 21 },
  { key: '1month', label: '한달', days: 30 },
  { key: '6months', label: '6개월', days: 180 },
  { key: '1year', label: '1년', days: 365 },
  { key: '3years', label: '3년', days: 1095 },
  { key: '5years', label: '5년', days: 1825 },
] as const

const CATEGORIES = [
  { key: 'all', label: '전체', color: '#7c3aed' },
  { key: 'work', label: '업무', color: '#ef4444' },
  { key: 'study', label: '공부', color: '#22c55e' },
  { key: 'news', label: '뉴스', color: '#3b82f6' },
  { key: 'shopping', label: '쇼핑', color: '#f59e0b' },
  { key: 'entertainment', label: '엔터테인먼트', color: '#ec4899' },
  { key: 'reference', label: '참고자료', color: '#06b6d4' },
  { key: 'other', label: '기타', color: '#8b5cf6' },
]

// 검색엔진 도메인 목록
const SEARCH_ENGINE_DOMAINS = [
  'google.com', 'google.co.kr', 'bing.com', 'yahoo.com',
  'naver.com', 'daum.net', 'duckduckgo.com', 'baidu.com',
  'yandex.com', 'search.yahoo.co.jp'
]

export default function DashboardPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('1month')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [view, setView] = useState<'wordcloud' | 'list'>('wordcloud')

  useEffect(() => {
    fetchBookmarks()
  }, [])

  const fetchBookmarks = async () => {
    try {
      const res = await fetch('/api/bookmarks')
      const data = await res.json()
      
      // 검색엔진 사이트 제외 및 카테고리 분류
      const processedBookmarks = data
        .filter((bookmark: Bookmark) => !isSearchEngine(bookmark.url))
        .map((bookmark: Bookmark) => ({
          ...bookmark,
          category: bookmark.category || categorizeBookmark(bookmark),
          keywords: bookmark.keywords || extractKeywords(bookmark.title, bookmark.url)
        }))
      
      setBookmarks(processedBookmarks)
    } catch (error) {
      console.error('Failed to fetch bookmarks:', error)
    } finally {
      setLoading(false)
    }
  }

  // 검색엔진 사이트인지 확인
  const isSearchEngine = (url: string): boolean => {
    try {
      const domain = new URL(url).hostname.toLowerCase()
      return SEARCH_ENGINE_DOMAINS.some(searchDomain => domain.includes(searchDomain))
    } catch {
      return false
    }
  }

  // 북마크 자동 카테고리 분류
  const categorizeBookmark = (bookmark: Bookmark): string => {
    const title = bookmark.title.toLowerCase()
    const url = bookmark.url.toLowerCase()
    const text = `${title} ${url}`

    // 업무 관련 키워드
    if (/notion|slack|github|jira|confluence|trello|asana|zoom|teams|office|excel|word|powerpoint|google drive|dropbox|figma|adobe|photoshop|sketch/.test(text)) {
      return 'work'
    }
    
    // 공부 관련 키워드
    if (/coursera|udemy|khan academy|edx|codecademy|freecodecamp|tutorial|learn|course|education|university|college|study|docs|documentation|mdn|stackoverflow|w3schools/.test(text)) {
      return 'study'
    }
    
    // 뉴스 관련 키워드
    if (/news|뉴스|신문|기사|경제|정치|사회|스포츠|연합뉴스|조선일보|중앙일보|동아일보|한겨레|매일경제|한국경제|cnn|bbc|reuters/.test(text)) {
      return 'news'
    }
    
    // 쇼핑 관련 키워드
    if (/amazon|ebay|쿠팡|11번가|g마켓|옥션|위메프|티몬|무신사|29cm|shop|store|buy|purchase|cart|order|product/.test(text)) {
      return 'shopping'
    }
    
    // 엔터테인먼트 관련 키워드
    if (/youtube|netflix|disney|spotify|music|movie|drama|game|entertainment|fun|웹툰|만화|게임|영화|드라마|음악/.test(text)) {
      return 'entertainment'
    }
    
    // 참고자료 관련 키워드
    if (/wikipedia|reference|wiki|docs|documentation|api|guide|manual|how-to|tips|tricks/.test(text)) {
      return 'reference'
    }
    
    return 'other'
  }

  // 키워드 추출
  const extractKeywords = (title: string, url: string): string[] => {
    const text = `${title} ${url}`.toLowerCase()
    const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an', 'is', 'are', 'was', 'were', '그', '를', '을', '이', '가', '에', '와', '과', '으로', '로', '에서', '의', '와', '과']
    
    // URL에서 도메인 추출
    try {
      const domain = new URL(url).hostname.replace('www.', '').split('.')[0]
      const words = text
        .replace(/[^\w\s가-힣]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !commonWords.includes(word))
        .concat([domain])
      
      // 빈도수 계산 후 상위 5개 반환
      const wordCount: { [key: string]: number } = {}
      words.forEach(word => {
        wordCount[word] = (wordCount[word] || 0) + 1
      })
      
      return Object.entries(wordCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([word]) => word)
    } catch {
      return []
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

  const handleCategoryUpdate = async (bookmarkId: string, newCategory: string) => {
    try {
      await fetch(`/api/bookmarks/${bookmarkId}/category`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newCategory })
      })
      
      setBookmarks(prev => prev.map(b => 
        b.id === bookmarkId ? { ...b, category: newCategory } : b
      ))
    } catch (error) {
      console.error('Failed to update category:', error)
    }
  }

  // 기간별 필터링
  const getBookmarksForPeriod = (): Bookmark[] => {
    const periodData = TIME_PERIODS.find(p => p.key === selectedPeriod)
    if (!periodData) return bookmarks

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - periodData.days)

    return bookmarks.filter(b => new Date(b.movedToGraveyard) >= cutoffDate)
  }

  const filteredBookmarks = getBookmarksForPeriod()
    .filter(b => selectedCategory === 'all' || b.category === selectedCategory)
    .filter(b =>
      b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.keywords?.some(k => k.toLowerCase().includes(searchTerm.toLowerCase()))
    )

  // 워드 클라우드 데이터 생성
  const generateWordCloudData = (): WordData[] => {
    const wordCount: { [key: string]: { count: number, categories: Set<string> } } = {}
    
    filteredBookmarks.forEach(bookmark => {
      bookmark.keywords?.forEach(keyword => {
        if (!wordCount[keyword]) {
          wordCount[keyword] = { count: 0, categories: new Set() }
        }
        wordCount[keyword].count += 1
        if (bookmark.category) {
          wordCount[keyword].categories.add(bookmark.category)
        }
      })
    })

    return Object.entries(wordCount)
      .map(([text, data]) => ({
        text: `#${text}`,
        weight: Math.min(data.count * 10, 100), // 최대 100으로 제한
        category: Array.from(data.categories)[0] // 첫 번째 카테고리 사용
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 50) // 상위 50개만 표시
  }

  // 카테고리별 통계
  const getCategoryStats = () => {
    const stats: { [key: string]: number } = {}
    filteredBookmarks.forEach(bookmark => {
      const category = bookmark.category || 'other'
      stats[category] = (stats[category] || 0) + 1
    })
    return stats
  }

  return (
    <div className="container mx-auto px-4 py-8 text-white">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">📊 북마크 분석 대시보드</h1>
        <p className="opacity-90">총 {bookmarks.length}개의 북마크 (검색엔진 제외)</p>
      </div>

      {/* Controls */}
      <div className="bg-white/10 backdrop-blur rounded-lg p-6 mb-8">
        <div className="grid md:grid-cols-4 gap-4 mb-4">
          {/* 기간 선택 */}
          <div>
            <label className="block text-sm font-medium mb-2">
              <Calendar className="inline w-4 h-4 mr-2" />
              분석 기간
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as TimePeriod)}
              className="w-full p-2 bg-white/10 rounded-lg outline-none focus:bg-white/20 transition"
            >
              {TIME_PERIODS.map(period => (
                <option key={period.key} value={period.key} className="text-gray-900">
                  {period.label}
                </option>
              ))}
            </select>
          </div>

          {/* 카테고리 선택 */}
          <div>
            <label className="block text-sm font-medium mb-2">
              <Tag className="inline w-4 h-4 mr-2" />
              카테고리
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full p-2 bg-white/10 rounded-lg outline-none focus:bg-white/20 transition"
            >
              {CATEGORIES.map(category => (
                <option key={category.key} value={category.key} className="text-gray-900">
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          {/* 뷰 선택 */}
          <div>
            <label className="block text-sm font-medium mb-2">
              <Filter className="inline w-4 h-4 mr-2" />
              보기 방식
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setView('wordcloud')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm transition ${
                  view === 'wordcloud' ? 'bg-white/20' : 'bg-white/10 hover:bg-white/15'
                }`}
              >
                워드클라우드
              </button>
              <button
                onClick={() => setView('list')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm transition ${
                  view === 'list' ? 'bg-white/20' : 'bg-white/10 hover:bg-white/15'
                }`}
              >
                목록
              </button>
            </div>
          </div>

          {/* 검색 */}
          <div>
            <label className="block text-sm font-medium mb-2">
              <Search className="inline w-4 h-4 mr-2" />
              검색
            </label>
            <input
              type="text"
              placeholder="키워드 검색..."
              className="w-full p-2 bg-white/10 rounded-lg outline-none focus:bg-white/20 transition"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* 통계 */}
        <div className="grid md:grid-cols-6 gap-4">
          <div className="bg-white/10 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-400">{filteredBookmarks.length}</div>
            <div className="text-xs opacity-80">총 북마크</div>
          </div>
          
          {CATEGORIES.slice(1).map(category => {
            const count = getCategoryStats()[category.key] || 0
            return (
              <div key={category.key} className="bg-white/10 rounded-lg p-3 text-center">
                <div className="text-lg font-bold" style={{ color: category.color }}>
                  {count}
                </div>
                <div className="text-xs opacity-80">{category.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-20">
          <div className="animate-spin w-12 h-12 border-4 border-white/30 border-t-white rounded-full mx-auto"></div>
          <p className="mt-4 opacity-80">데이터 분석 중...</p>
        </div>
      ) : view === 'wordcloud' ? (
        <div className="bg-white/10 backdrop-blur rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-4">🏷️ 키워드 워드클라우드</h2>
          <div className="h-96 flex items-center justify-center">
            {generateWordCloudData().length > 0 ? (
              <WordCloud data={generateWordCloudData()} />
            ) : (
              <div className="text-center">
                <div className="text-6xl mb-4">📭</div>
                <p className="text-xl">선택한 조건에 맞는 데이터가 없습니다</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold mb-4">📋 북마크 목록</h2>
          {filteredBookmarks.map((bookmark, index) => (
            <motion.div
              key={bookmark.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              className="bg-white/10 backdrop-blur rounded-lg p-4 hover:bg-white/15 transition"
            >
              <div className="flex items-start gap-4">
                {bookmark.favicon && (
                  <Image src={bookmark.favicon} alt="favicon" width={20} height={20} className="mt-1" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold">{bookmark.title}</h3>
                    <span 
                      className="px-2 py-1 rounded-full text-xs"
                      style={{ backgroundColor: CATEGORIES.find(c => c.key === bookmark.category)?.color + '33' }}
                    >
                      {CATEGORIES.find(c => c.key === bookmark.category)?.label || '기타'}
                    </span>
                  </div>
                  <p className="text-sm opacity-70 mb-2">{bookmark.url}</p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {bookmark.keywords?.slice(0, 5).map(keyword => (
                      <span key={keyword} className="px-2 py-1 bg-white/10 rounded-full text-xs">
                        #{keyword}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs opacity-60">
                    묘지 이동: {new Date(bookmark.movedToGraveyard).toLocaleDateString('ko-KR')} · 
                    방문: {bookmark.visitCount}회
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <select
                    value={bookmark.category}
                    onChange={(e) => handleCategoryUpdate(bookmark.id, e.target.value)}
                    className="p-1 bg-white/10 rounded text-xs outline-none focus:bg-white/20"
                  >
                    {CATEGORIES.slice(1).map(category => (
                      <option key={category.key} value={category.key} className="text-gray-900">
                        {category.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResurrect(bookmark.id)}
                      className="py-1 px-2 bg-green-500/20 hover:bg-green-500/30 rounded text-xs transition"
                    >
                      <Sparkles className="w-3 h-3" />
                    </button>
                    <a
                      href={bookmark.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1 px-2 bg-white/10 hover:bg-white/20 rounded transition"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          
          {filteredBookmarks.length === 0 && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🔍</div>
              <p className="text-xl">선택한 조건에 맞는 북마크가 없습니다</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}