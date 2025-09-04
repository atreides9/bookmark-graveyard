import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY!)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

export async function GET(request: NextRequest) {
  try {
    // Vercel Cron 보안 체크
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 모든 사용자 조회 (실제로는 구독한 사용자만)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')

    if (usersError) throw usersError
    if (!users || users.length === 0) {
      return NextResponse.json({ message: 'No users found' })
    }

    for (const user of users) {
      // 지난 주 묘지로 간 북마크들 조회
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

      const { data: bookmarks, error: bookmarksError } = await supabase
        .from('bookmarks')
        .select('*')
        .eq('user_id', user.id)
        .gte('moved_to_graveyard', oneWeekAgo.toISOString())
        .is('resurrected_at', null)

      if (bookmarksError) throw bookmarksError
      if (!bookmarks || bookmarks.length === 0) continue

      // AI 요약 생성
      const bookmarkList = bookmarks.map(b => `- ${b.title}: ${b.url}`).join('\n')
      
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "당신은 북마크를 정리하고 요약하는 전문가입니다. 이메일로 보낼 친근하고 유용한 요약을 작성해주세요."
          },
          {
            role: "user",
            content: `다음 북마크들을 카테고리별로 분류하고 왜 유용한지 설명해주세요:\n\n${bookmarkList}`
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })

      const summary = completion.choices[0].message.content

      // 이메일 HTML 생성
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
            .bookmark-count { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; }
            .summary { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .cta { text-align: center; margin: 30px 0; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🪦 북마크 묘지 주간 리포트</h1>
              <p>지난 주 동안 ${bookmarks.length}개의 북마크가 묘지로 이동했습니다</p>
            </div>
            <div class="content">
              <div class="bookmark-count">
                <h2>📊 이번 주 통계</h2>
                <p>묘지로 간 북마크: ${bookmarks.length}개</p>
              </div>
              <div class="summary">
                <h2>📝 AI 요약</h2>
                <div>${summary?.replace(/\n/g, '<br>')}</div>
              </div>
              <div class="cta">
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" class="button">
                  대시보드에서 확인하기
                </a>
              </div>
              <div class="footer">
                <p>북마크를 부활시키려면 대시보드를 방문하세요</p>
                <p>© 2024 북마크 묘지 구조대</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `

      // 이메일 발송
      await resend.emails.send({
        from: 'noreply@bookmarkgraveyard.com',
        to: user.email,
        subject: `🪦 주간 북마크 묘지 리포트 - ${bookmarks.length}개의 잊혀진 북마크`,
        html: emailHtml
      })

      // 요약 저장
      await supabase
        .from('summaries')
        .insert({
          user_id: user.id,
          content: summary,
          bookmark_ids: bookmarks.map(b => b.id),
          email_sent: true
        })
    }

    return NextResponse.json({ 
      success: true, 
      message: `Emails sent to ${users.length} users` 
    })
  } catch (error) {
    console.error('Error sending weekly emails:', error)
    return NextResponse.json({ error: 'Failed to send emails' }, { status: 500 })
  }
}