import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// 검색엔진 도메인 목록
const SEARCH_ENGINE_DOMAINS = [
  'google.com', 'google.co.kr', 'bing.com', 'yahoo.com',
  'naver.com', 'daum.net', 'duckduckgo.com', 'baidu.com',
  'yandex.com', 'search.yahoo.co.jp'
]

// 검색엔진 사이트인지 확인
const isSearchEngine = (url: string): boolean => {
  try {
    const domain = new URL(url).hostname.toLowerCase()
    return SEARCH_ENGINE_DOMAINS.some(searchDomain => domain.includes(searchDomain))
  } catch {
    return false
  }
}

export async function GET(_request: NextRequest) {
  try {
    // 묘지에 있는 북마크만 조회
    const { data, error } = await supabase
      .from('bookmarks')
      .select('*')
      .not('moved_to_graveyard', 'is', null)
      .is('resurrected_at', null)
      .order('moved_to_graveyard', { ascending: false })

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error fetching bookmarks:', error)
    return NextResponse.json({ error: 'Failed to fetch bookmarks' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // 검색엔진 사이트는 저장하지 않음
    if (isSearchEngine(body.url)) {
      return NextResponse.json({ success: true, message: 'Search engine site ignored' })
    }
    
    // Chrome Extension에서 보낸 북마크 저장
    const { data, error } = await supabase
      .from('bookmarks')
      .upsert({
        chrome_id: body.id,
        title: body.title,
        url: body.url,
        favicon: `https://www.google.com/s2/favicons?domain=${new URL(body.url).hostname}`,
        moved_to_graveyard: body.movedAt || new Date().toISOString(),
        visit_count: body.visitCount || 0,
        user_id: body.userId || 'default-user', // 실제로는 인증 구현 필요
        category: body.category || null,
        keywords: body.keywords || null,
      }, {
        onConflict: 'chrome_id'
      })

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error saving bookmark:', error)
    return NextResponse.json({ error: 'Failed to save bookmark' }, { status: 500 })
  }
}