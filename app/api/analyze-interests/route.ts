import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

interface BookmarkForAnalysis {
  title: string
  url: string
  visitCount?: number
  daysSinceAdded?: number
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ 
        error: 'OpenAI API key not configured' 
      }, { status: 500 })
    }

    const { bookmarks }: { bookmarks: BookmarkForAnalysis[] } = await request.json()

    if (!bookmarks || bookmarks.length === 0) {
      return NextResponse.json({ 
        interests: [],
        priorities: []
      })
    }

    // 사용자의 북마크 패턴을 분석하여 관심사 파악
    const bookmarkSample = bookmarks.slice(0, 20) // 최근 20개만 분석
    const bookmarkText = bookmarkSample.map(b => 
      `${b.title} (${new URL(b.url).hostname})`
    ).join('\n')

    const analysisPrompt = `
다음은 사용자의 북마크 목록입니다. 이를 분석해서 사용자의 주요 관심사와 우선순위를 파악해주세요.

북마크 목록:
${bookmarkText}

다음 카테고리 중에서 사용자가 가장 관심있어하는 순서대로 3개를 선택해주세요:
- work (업무, 비즈니스, 생산성 도구)
- study (학습, 교육, 개발, 문서)
- news (뉴스, 시사, 정보)
- shopping (쇼핑, 이커머스)
- entertainment (엔터테인먼트, 게임, 음악, 영상)
- reference (참고자료, 위키, 사전)
- other (기타)

응답은 반드시 다음 JSON 형식으로만 해주세요:
{
  "interests": ["카테고리1", "카테고리2", "카테고리3"],
  "reasoning": "분석 근거"
}
`

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "당신은 사용자의 브라우징 패턴을 분석하는 전문가입니다. 북마크를 보고 사용자의 관심사를 정확하게 파악해주세요."
        },
        {
          role: "user",
          content: analysisPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 300
    })

    const result = completion.choices[0]?.message?.content
    if (!result) {
      throw new Error('No response from OpenAI')
    }

    try {
      const analysis = JSON.parse(result)
      
      // 결과 검증
      if (!Array.isArray(analysis.interests) || analysis.interests.length === 0) {
        throw new Error('Invalid interests format')
      }

      const validCategories = ['work', 'study', 'news', 'shopping', 'entertainment', 'reference', 'other']
      const validInterests = analysis.interests.filter(interest => validCategories.includes(interest))

      if (validInterests.length === 0) {
        // 기본값으로 폴백
        return NextResponse.json({
          interests: ['work', 'study', 'other'],
          reasoning: 'Default interests due to analysis failure',
          source: 'fallback'
        })
      }

      return NextResponse.json({
        interests: validInterests.slice(0, 3), // 최대 3개
        reasoning: analysis.reasoning || 'AI 분석 완료',
        source: 'openai'
      })

    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError)
      
      // 파싱 실패시 기본값 반환
      return NextResponse.json({
        interests: ['work', 'study', 'other'],
        reasoning: 'AI 분석 중 오류 발생, 기본 우선순위 적용',
        source: 'fallback'
      })
    }

  } catch (error) {
    console.error('Error analyzing interests:', error)
    
    // 오류 발생시 기본 우선순위 반환
    return NextResponse.json({
      interests: ['work', 'study', 'other'],
      reasoning: 'API 오류로 인한 기본 우선순위 적용',
      source: 'fallback'
    })
  }
}