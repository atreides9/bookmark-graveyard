'use client'

import { motion } from 'framer-motion'
import { Bookmark, Clock, Mail, Sparkles } from 'lucide-react'
import { ReactNode } from 'react'
import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-16 text-white">
      {/* Hero Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <div className="text-8xl mb-6">🪦</div>
        <h1 className="text-5xl font-bold mb-4">북마크 묘지 구조대</h1>
        <p className="text-xl opacity-90 mb-8">
          브라우저 북마크의 90%는 다시 열리지 않습니다<br />
          AI가 정리하고 요약해드릴게요
        </p>
        <div className="flex gap-4 justify-center">
          <Link 
            href="/dashboard"
            className="px-8 py-3 bg-white text-purple-700 rounded-lg font-semibold hover:shadow-lg transition"
          >
            대시보드 보기
          </Link>
          <a 
            href="#install"
            className="px-8 py-3 bg-purple-500 text-white rounded-lg font-semibold hover:bg-purple-400 transition"
          >
            설치하기
          </a>
        </div>
      </motion.div>

      {/* Features */}
      <div className="grid md:grid-cols-4 gap-6 mb-16">
        <FeatureCard
          icon={<Clock className="w-8 h-8" />}
          title="자동 모니터링"
          description="30일 이상 미방문 북마크 자동 감지"
        />
        <FeatureCard
          icon={<Bookmark className="w-8 h-8" />}
          title="스마트 정리"
          description="묘지 폴더로 자동 이동 및 관리"
        />
        <FeatureCard
          icon={<Sparkles className="w-8 h-8" />}
          title="AI 요약"
          description="GPT가 북마크 내용을 요약 정리"
        />
        <FeatureCard
          icon={<Mail className="w-8 h-8" />}
          title="주간 리포트"
          description="매주 월요일 이메일로 요약 전송"
        />
      </div>

      {/* Installation */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="bg-white/10 backdrop-blur rounded-2xl p-8"
        id="install"
      >
        <h2 className="text-3xl font-bold mb-6 text-center">간단한 설치</h2>
        <div className="max-w-2xl mx-auto space-y-4">
          <Step number="1" title="Chrome Extension 다운로드" />
          <Step number="2" title="Chrome에서 확장 프로그램 설치" />
          <Step number="3" title="자동으로 북마크 모니터링 시작!" />
        </div>
        <div className="text-center mt-8">
          <button className="px-8 py-3 bg-white text-purple-700 rounded-lg font-semibold hover:shadow-lg transition">
            Extension 다운로드 (.zip)
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="bg-white/10 backdrop-blur rounded-xl p-6 text-center"
    >
      <div className="text-purple-300 mb-4 flex justify-center">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm opacity-80">{description}</p>
    </motion.div>
  )
}

function Step({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center font-bold">
        {number}
      </div>
      <div className="text-lg">{title}</div>
    </div>
  )
}