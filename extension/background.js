// background.js - 오류 수정 완료 버전
const API_URL = 'http://localhost:3000/api'
const GRAVEYARD_FOLDER = '🪦 북마크 묘지'

// 검색엔진 도메인 목록
const SEARCH_ENGINE_DOMAINS = [
  'google.com', 'google.co.kr', 'bing.com', 'yahoo.com',
  'naver.com', 'daum.net', 'duckduckgo.com', 'baidu.com',
  'yandex.com', 'search.yahoo.co.jp'
]

// 기간별 설정 (기본값: 모두 비활성화)
const DEFAULT_SETTINGS = {
  week1: { enabled: false, days: 7, label: '1주일' },
  week2: { enabled: false, days: 14, label: '2주일' }, 
  week3: { enabled: false, days: 21, label: '3주일' },
  week4: { enabled: false, days: 28, label: '4주일' },
  emailNotifications: false,
  userEmail: ''
}

// 초기화
if (chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    console.log('북마크 묘지 구조대 설치 완료!')
    createGraveyardFolder()
    initializeSettings()
  })
}

// 알람 리스너 비활성화
// const dailyCheckAlarmListener = (alarm) => {
//   if (alarm.name === 'dailyCheck') {
//     scanBookmarks()
//   }
// }

// if (chrome.alarms && chrome.alarms.onAlarm) {
//   chrome.alarms.onAlarm.addListener(dailyCheckAlarmListener)
// }

// 설정 초기화
async function initializeSettings() {
  try {
    const { cleanupSettings } = await chrome.storage.local.get('cleanupSettings')
    if (!cleanupSettings) {
      await chrome.storage.local.set({ cleanupSettings: DEFAULT_SETTINGS })
    }
  } catch (error) {
    console.error('Error initializing settings:', error)
  }
}

// 묘지 폴더 생성
async function createGraveyardFolder() {
  try {
    const bookmarks = await chrome.bookmarks.getTree()
    const bookmarkBar = bookmarks[0].children[0]
    
    const existing = bookmarkBar.children.find(
      child => child.title === GRAVEYARD_FOLDER
    )
    
    if (!existing) {
      const graveyard = await chrome.bookmarks.create({
        parentId: bookmarkBar.id,
        title: GRAVEYARD_FOLDER
      })
      await chrome.storage.local.set({ graveyardId: graveyard.id })
    } else {
      await chrome.storage.local.set({ graveyardId: existing.id })
    }
  } catch (error) {
    console.error('Error creating graveyard folder:', error)
  }
}

// 북마크 스캔 (복제 기반)
async function scanBookmarks() {
  try {
    const { graveyardId, cleanupSettings } = await chrome.storage.local.get(['graveyardId', 'cleanupSettings'])
    
    if (!graveyardId) {
      console.log('Graveyard folder not found, creating...')
      await createGraveyardFolder()
      return
    }
    
    if (!cleanupSettings) {
      await initializeSettings()
      return
    }

    const bookmarks = await chrome.bookmarks.getTree()
    const now = Date.now()
    const bookmarksToProcess = []
    
    // 활성화된 기간별로 북마크 분류
    const periods = Object.entries(cleanupSettings).filter(([key, setting]) => 
      key.startsWith('week') && setting.enabled
    )
    
    if (periods.length === 0) {
      console.log('정리 기간이 설정되지 않았습니다.')
      return
    }

    // 검색엔진 사이트인지 확인
    function isSearchEngine(url) {
      try {
        const domain = new URL(url).hostname.toLowerCase()
        return SEARCH_ENGINE_DOMAINS.some(searchDomain => domain.includes(searchDomain))
      } catch {
        return false
      }
    }

    async function checkBookmark(node) {
      if (node.url && node.parentId !== graveyardId) {
        // 검색엔진 사이트는 제외
        if (isSearchEngine(node.url)) {
          return
        }

        const result = await chrome.storage.local.get([`lastVisit_${node.id}`, `dateAdded_${node.id}`])
        const lastVisit = result[`lastVisit_${node.id}`] || node.dateAdded || 0
        const dateAdded = result[`dateAdded_${node.id}`] || node.dateAdded || now
        
        // 각 기간별로 체크
        for (const [periodKey, setting] of periods) {
          const threshold = setting.days * 24 * 60 * 60 * 1000
          const daysSinceAdded = (now - dateAdded) / (24 * 60 * 60 * 1000)
          const daysSinceVisit = (now - lastVisit) / (24 * 60 * 60 * 1000)
          
          if (daysSinceAdded >= setting.days && daysSinceVisit >= setting.days) {
            bookmarksToProcess.push({
              ...node,
              period: setting.label,
              daysSinceAdded: Math.floor(daysSinceAdded),
              daysSinceVisit: Math.floor(daysSinceVisit)
            })
            break
          }
        }
      }
      
      if (node.children) {
        for (const child of node.children) {
          await checkBookmark(child)
        }
      }
    }
    
    // 북마크 체크
    for (const child of bookmarks[0].children) {
      await checkBookmark(child)
    }
    
    // 발견된 북마크 처리
    if (bookmarksToProcess.length > 0) {
      console.log(`발견된 북마크: ${bookmarksToProcess.length}개`)
      
      // 배지 표시
      chrome.action.setBadgeText({ text: bookmarksToProcess.length.toString() })
      chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' })
      
      // 처리 대상 목록을 저장 (팝업에서 사용)
      await chrome.storage.local.set({
        pendingBookmarks: bookmarksToProcess,
        lastScanDate: new Date().toISOString()
      })
      
      // 이메일 알림 (활성화된 경우)
      if (cleanupSettings.emailNotifications && cleanupSettings.userEmail) {
        await sendEmailNotification(bookmarksToProcess, cleanupSettings.userEmail)
      }
    }
  } catch (error) {
    console.error('Error scanning bookmarks:', error)
  }
}

// 탭 업데이트 시 방문 기록
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && chrome.bookmarks) {
      chrome.bookmarks.search({ url: tab.url }, (results) => {
        if (results.length > 0 && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            [`lastVisit_${results[0].id}`]: Date.now()
          })
        }
      })
    }
  })
}

// 메시지 리스너
if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStats') {
    getStats().then(sendResponse).catch(err => {
      console.error('Error getting stats:', err)
      sendResponse({ graveyardCount: 0, lastMoved: 0, lastMovedDate: null })
    })
    return true
  } else if (request.action === 'resurrect') {
    chrome.bookmarks.move(request.bookmarkId, { parentId: '1' })
      .then(() => sendResponse({ success: true }))
      .catch(err => {
        console.error('Error resurrecting bookmark:', err)
        sendResponse({ success: false })
      })
    return true
  } else if (request.action === 'scan') {
    scanBookmarks().then(() => sendResponse({ success: true }))
    return true
  } else if (request.action === 'copyToGraveyard') {
    copyBookmarksToGraveyard(request.bookmarks)
      .then(() => sendResponse({ success: true }))
      .catch(err => {
        console.error('Error copying to graveyard:', err)
        sendResponse({ success: false })
      })
    return true
  } else if (request.action === 'updateSettings') {
    chrome.storage.local.set({ cleanupSettings: request.settings })
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false }))
    return true
  } else if (request.action === 'getSettings') {
    chrome.storage.local.get('cleanupSettings')
      .then(result => sendResponse({ settings: result.cleanupSettings || DEFAULT_SETTINGS }))
      .catch(err => sendResponse({ settings: DEFAULT_SETTINGS }))
    return true
  }
  })
}

// 북마크를 묘지로 복제 (원본 유지)
async function copyBookmarksToGraveyard(bookmarks) {
  try {
    const { graveyardId } = await chrome.storage.local.get('graveyardId')
    
    if (!graveyardId) {
      throw new Error('Graveyard folder not found')
    }
    
    for (const bookmark of bookmarks) {
      try {
        // 묘지에 복제본 생성
        const copied = await chrome.bookmarks.create({
          parentId: graveyardId,
          title: `${bookmark.title} (${bookmark.period})`,
          url: bookmark.url
        })
        
        // 복제 정보 저장
        await chrome.storage.local.set({
          [`copied_${bookmark.id}`]: {
            originalId: bookmark.id,
            copiedId: copied.id,
            copiedAt: new Date().toISOString(),
            period: bookmark.period
          }
        })
        
        console.log(`북마크 복제됨: ${bookmark.title}`)
      } catch (error) {
        console.error(`Error copying bookmark ${bookmark.title}:`, error)
      }
    }
  } catch (error) {
    console.error('Error in copyBookmarksToGraveyard:', error)
    throw error
  }
}

// 부드러운 이메일 알림
async function sendEmailNotification(bookmarks, userEmail) {
  try {
    const emailBody = generateEmailContent(bookmarks)
    
    // 서버로 이메일 전송 요청
    const response = await fetch(`${API_URL}/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: userEmail,
        subject: '💭 저장하고 깜빡하신 북마크들이 있어요',
        html: emailBody
      })
    })
    
    if (response.ok) {
      console.log('이메일 알림 전송 완료')
    } else {
      console.error('이메일 전송 실패')
    }
  } catch (error) {
    console.error('Error sending email notification:', error)
  }
}

// 부드러운 이메일 콘텐츠 생성
function generateEmailContent(bookmarks) {
  const groupedByPeriod = bookmarks.reduce((acc, bookmark) => {
    if (!acc[bookmark.period]) acc[bookmark.period] = []
    acc[bookmark.period].push(bookmark)
    return acc
  }, {})
  
  let content = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin-bottom: 10px;">🌙 북마크가 잊혀져가고 있어요</h1>
        <p style="color: #6b7280; font-size: 16px;">소중히 저장해두신 링크들이 혼자 기다리고 있네요</p>
      </div>
  `
  
  for (const [period, periodBookmarks] of Object.entries(groupedByPeriod)) {
    content += `
      <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <h3 style="color: #374151; margin-bottom: 15px; font-size: 18px;">
          ${period} 전에 저장하신 북마크들
        </h3>
    `
    
    periodBookmarks.slice(0, 5).forEach(bookmark => {
      content += `
        <div style="background: white; border-radius: 8px; padding: 15px; margin-bottom: 10px; border-left: 4px solid #7c3aed;">
          <div style="font-weight: 500; margin-bottom: 5px;">${bookmark.title}</div>
          <a href="${bookmark.url}" style="color: #7c3aed; text-decoration: none; font-size: 14px;">${bookmark.url}</a>
          <div style="color: #9ca3af; font-size: 12px; margin-top: 5px;">
            ${bookmark.daysSinceAdded}일 전 저장 · ${bookmark.daysSinceVisit}일째 미방문
          </div>
        </div>
      `
    })
    
    if (periodBookmarks.length > 5) {
      content += `
        <p style="color: #6b7280; font-style: italic; margin-top: 10px;">
          외 ${periodBookmarks.length - 5}개의 북마크가 더 있어요
        </p>
      `
    }
    
    content += `</div>`
  }
  
  content += `
      <div style="text-align: center; margin-top: 30px; padding: 20px; background: #fef3c7; border-radius: 12px;">
        <p style="color: #92400e; margin-bottom: 10px;">💡 이런 북마크들, 한번씩 둘러보는 건 어떨까요?</p>
        <p style="color: #b45309; font-size: 14px;">필요 없다면 정리해서 북마크함을 더 깔끔하게 만들어보세요!</p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #9ca3af;">
        <p>북마크 묘지 구조대가 전해드리는 알림입니다 🌟</p>
        <p>이 메일이 불편하시면 언제든 설정에서 끌 수 있어요</p>
      </div>
    </div>
  `
  
  return content
}

async function getStats() {
  try {
    const { graveyardId } = await chrome.storage.local.get('graveyardId')
    
    if (!graveyardId) {
      return {
        graveyardCount: 0,
        lastMoved: 0,
        lastMovedDate: null
      }
    }
    
    const graveyard = await chrome.bookmarks.getSubTree(graveyardId)
    const { lastMoved, lastMovedDate } = await chrome.storage.local.get(['lastMoved', 'lastMovedDate'])
    
    return {
      graveyardCount: graveyard[0].children.length,
      lastMoved: lastMoved || 0,
      lastMovedDate: lastMovedDate || null
    }
  } catch (error) {
    console.error('Error in getStats:', error)
    return {
      graveyardCount: 0,
      lastMoved: 0,
      lastMovedDate: null
    }
  }
}