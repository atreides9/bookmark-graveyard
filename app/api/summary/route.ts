import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

export async function POST(_request: NextRequest) {
  try {
    // 지난 주 묘지로 간 북마크들 조회
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

    const { data: bookmarks, error } = await supabase
      .from('bookmarks')
      .select('*')
      .gte('moved_to_graveyard', oneWeekAgo.toISOString())
      .is('resurrected_at', null)

    if (error) throw error
    if (!bookmarks || bookmarks.length === 0) {
      return NextResponse.json({ message: 'No bookmarks to summarize' })
    }

    // GPT로 요약 생성
    const bookmarkList = bookmarks.map(b => `- ${b.title}: ${b.url}`).join('\n')
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "당신은 북마크를 정리하고 요약하는 전문가입니다. 사용자가 잊고 있던 북마크들을 카테고리별로 분류하고, 각 북마크가 왜 유용한지 간단히 설명해주세요."
        },
        {
          role: "user",
          content: `다음 북마크들을 카테고리별로 분류하고 요약해주세요:\n\n${bookmarkList}`
        }
      ],
      max_tokens: 1000,
      temperature: 0.7
    })

    const summary = completion.choices[0].message.content

    // 요약 저장
    const { data: _summaryData, error: summaryError } = await supabase
      .from('summaries')
      .insert({
        content: summary,
        bookmark_ids: bookmarks.map(b => b.id),
        user_id: 'default-user' // 실제로는 인증 구현 필요
      })
      .single()

    if (summaryError) throw summaryError

    return NextResponse.json({ 
      success: true, 
      summary: summary,
      bookmarkCount: bookmarks.length 
    })
  } catch (error) {

    console.error('Error creating summary:', error)
    return NextResponse.json({ error: 'Failed to create summary' }, { status: 500 })
  }
}