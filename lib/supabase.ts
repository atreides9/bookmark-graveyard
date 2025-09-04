import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

// 클라이언트용
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 서버용 (Admin 권한)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// 데이터베이스 타입 정의
export interface User {
  id: string
  email: string
  created_at: string
}

export interface Bookmark {
  id: string
  user_id: string
  chrome_id: string
  title: string
  url: string
  favicon?: string
  moved_to_graveyard?: string
  resurrected_at?: string
  last_visited?: string
  visit_count: number
  created_at: string
  updated_at: string
}

export interface Summary {
  id: string
  user_id: string
  content: string
  bookmark_ids: string[]
  email_sent: boolean
  created_at: string
}