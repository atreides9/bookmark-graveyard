'use client'

import { useEffect, useRef } from 'react'

interface WordData {
  text: string
  weight: number
  category?: string
}

interface WordCloudProps {
  data: WordData[]
}

const CATEGORY_COLORS: { [key: string]: string } = {
  work: '#ef4444',
  study: '#22c55e',
  news: '#3b82f6',
  shopping: '#f59e0b',
  entertainment: '#ec4899',
  reference: '#06b6d4',
  other: '#8b5cf6'
}

export default function WordCloud({ data }: WordCloudProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Canvas 크기 설정
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    const width = rect.width
    const height = rect.height

    // 배경 초기화
    ctx.clearRect(0, 0, width, height)

    // 워드들을 배치할 위치 정보
    const positions: Array<{
      x: number
      y: number
      width: number
      height: number
      word: WordData
    }> = []

    // 충돌 검사 함수
    const checkCollision = (x: number, y: number, w: number, h: number): boolean => {
      return positions.some(pos => 
        x < pos.x + pos.width && 
        x + w > pos.x && 
        y < pos.y + pos.height && 
        y + h > pos.y
      )
    }

    // 스파이럴 위치 생성
    const getNextPosition = (centerX: number, centerY: number, radius: number, angle: number) => {
      return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      }
    }

    // 워드 렌더링
    data.forEach((word, index) => {
      const fontSize = Math.max(12, Math.min(48, word.weight / 2))
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
      
      const metrics = ctx.measureText(word.text)
      const textWidth = metrics.width
      const textHeight = fontSize

      // 색상 설정
      const color = word.category && CATEGORY_COLORS[word.category] 
        ? CATEGORY_COLORS[word.category] 
        : `hsl(${index * 137.5 % 360}, 70%, 60%)`

      let placed = false
      let attempts = 0
      const maxAttempts = 100

      // 중심에서 시작해서 스파이럴로 확장
      const centerX = width / 2
      const centerY = height / 2
      
      while (!placed && attempts < maxAttempts) {
        let x, y

        if (attempts === 0) {
          // 첫 번째 단어는 중심에 배치
          x = centerX - textWidth / 2
          y = centerY - textHeight / 2
        } else {
          // 스파이럴 패턴으로 위치 찾기
          const radius = Math.sqrt(attempts) * 8
          const angle = attempts * 0.1
          const pos = getNextPosition(centerX, centerY, radius, angle)
          x = pos.x - textWidth / 2
          y = pos.y - textHeight / 2
        }

        // 캔버스 경계 내에 있는지 확인
        if (x >= 0 && y >= 0 && x + textWidth <= width && y + textHeight <= height) {
          if (!checkCollision(x, y, textWidth, textHeight)) {
            // 배치 성공
            positions.push({ x, y, width: textWidth, height: textHeight, word })
            
            // 그림자 효과
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
            ctx.shadowBlur = 2
            ctx.shadowOffsetX = 1
            ctx.shadowOffsetY = 1
            
            // 텍스트 렌더링
            ctx.fillStyle = color
            ctx.fillText(word.text, x, y + fontSize * 0.8)
            
            // 그림자 리셋
            ctx.shadowColor = 'transparent'
            ctx.shadowBlur = 0
            ctx.shadowOffsetX = 0
            ctx.shadowOffsetY = 0
            
            placed = true
          }
        }
        
        attempts++
      }
    })

    // 카테고리 범례 그리기
    const legendY = height - 30
    let legendX = 20
    
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    
    Object.entries(CATEGORY_COLORS).forEach(([category, color]) => {
      const hasCategory = data.some(word => word.category === category)
      if (!hasCategory) return
      
      // 색상 박스
      ctx.fillStyle = color
      ctx.fillRect(legendX, legendY - 10, 12, 12)
      
      // 텍스트
      ctx.fillStyle = 'white'
      const categoryName = {
        work: '업무',
        study: '공부', 
        news: '뉴스',
        shopping: '쇼핑',
        entertainment: '엔터',
        reference: '참고',
        other: '기타'
      }[category] || category
      
      ctx.fillText(categoryName, legendX + 16, legendY)
      legendX += ctx.measureText(categoryName).width + 30
    })

  }, [data])

  if (data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white/60">
        <div className="text-center">
          <div className="text-4xl mb-2">📊</div>
          <p>분석할 키워드가 없습니다</p>
        </div>
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ width: '100%', height: '100%' }}
    />
  )
}