// background.js - 코드 최적화 버전

const GRAVEYARD_FOLDER = '📋 보관된 북마크'

// 검색엔진 도메인 목록
const SEARCH_ENGINE_DOMAINS = [
  'google.com', 'google.co.kr', 'bing.com', 'yahoo.com',
  'naver.com', 'daum.net', 'duckduckgo.com', 'baidu.com',
  'yandex.com', 'search.yahoo.co.jp'
]

// 기간별 설정 (기본값: 1일 활성화)
const DEFAULT_SETTINGS = {
  week1: { enabled: true, days: 7, label: '1주' },
  week2: { enabled: false, days: 14, label: '2주' },
  month1: { enabled: false, days: 30, label: '1개월' },
  month6: { enabled: false, days: 180, label: '6개월' },
  year1: { enabled: false, days: 365, label: '1년' },
  year2: { enabled: false, days: 730, label: '2년 이상' }
}

// 초기화
if (chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    console.log('북마크 청소부 설치 완료!')
    createGraveyardFolder()
    initializeSettings()
    setupPeriodicFolderCheck()
  })
}

// 확장 프로그램 시작시 폴더 확인
if (chrome.runtime && chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    console.log('Extension startup - verifying graveyard folder')
    verifyAndRecoverGraveyardFolder()
  })
}

// 주기적 폴더 확인 설정 (매 30분마다)
function setupPeriodicFolderCheck() {
  chrome.alarms.create('checkGraveyardFolder', {
    delayInMinutes: 30,
    periodInMinutes: 30
  })
}

// 알람 리스너 - 폴더 확인
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkGraveyardFolder') {
    console.log('Periodic graveyard folder check')
    verifyAndRecoverGraveyardFolder()
  }
})

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

// 묘지 폴더 생성 및 복구
async function createGraveyardFolder() {
  try {
    const bookmarks = await chrome.bookmarks.getTree()
    const bookmarkBar = bookmarks[0].children[0]
    
    const existing = bookmarkBar.children.find(
      child => child.title === GRAVEYARD_FOLDER
    )
    
    if (!existing) {
      console.log('Creating graveyard folder:', GRAVEYARD_FOLDER)
      const graveyard = await chrome.bookmarks.create({
        parentId: bookmarkBar.id,
        title: GRAVEYARD_FOLDER
      })
      await chrome.storage.local.set({ 
        graveyardId: graveyard.id,
        folderRecreatedAt: Date.now()
      })
      
      // 사용자에게 폴더 생성 알림
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Bookmark Graveyard',
        message: `"${GRAVEYARD_FOLDER}" 폴더가 생성되었습니다.`
      })
    } else {
      await chrome.storage.local.set({ graveyardId: existing.id })
    }
  } catch (error) {
    console.error('Error creating graveyard folder:', error)
  }
}

// 폴더 존재 여부 확인 및 복구
async function verifyAndRecoverGraveyardFolder() {
  try {
    const { graveyardId } = await chrome.storage.local.get(['graveyardId'])
    
    if (!graveyardId) {
      console.log('No graveyard folder ID found, creating new folder')
      await createGraveyardFolder()
      return true
    }
    
    // 저장된 ID로 폴더가 실제로 존재하는지 확인
    try {
      const folder = await chrome.bookmarks.get(graveyardId)
      if (folder && folder[0] && folder[0].title === GRAVEYARD_FOLDER) {
        return true // 폴더가 정상적으로 존재
      }
    } catch (error) {
      console.log('Stored folder ID is invalid, folder may have been deleted')
    }
    
    // 폴더가 삭제되었을 경우 다시 찾아보기
    const bookmarks = await chrome.bookmarks.getTree()
    const bookmarkBar = bookmarks[0].children[0]
    const existing = bookmarkBar.children.find(
      child => child.title === GRAVEYARD_FOLDER
    )
    
    if (existing) {
      // 폴더는 존재하지만 ID가 달라진 경우 (복구된 경우)
      await chrome.storage.local.set({ graveyardId: existing.id })
      console.log('Found existing graveyard folder with different ID, updated')
      return true
    } else {
      // 완전히 삭제된 경우 새로 생성
      console.log('Graveyard folder was deleted, recreating...')
      await createGraveyardFolder()
      
      // 사용자에게 복구 알림
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Bookmark Graveyard - 폴더 복구됨',
        message: `삭제된 "${GRAVEYARD_FOLDER}" 폴더가 자동으로 복구되었습니다.`
      })
      return true
    }
  } catch (error) {
    console.error('Error verifying graveyard folder:', error)
    return false
  }
}

// 북마크 스캔 (복제 기반)
async function scanBookmarks() {
  try {
    // 폴더 존재 여부 확인 및 필요시 복구
    const folderVerified = await verifyAndRecoverGraveyardFolder()
    if (!folderVerified) {
      console.error('Failed to verify/recover graveyard folder')
      return
    }
    
    const { graveyardId, cleanupSettings } = await chrome.storage.local.get(['graveyardId', 'cleanupSettings'])
    
    if (!cleanupSettings) {
      await initializeSettings()
      return
    }

    const bookmarks = await chrome.bookmarks.getTree()
    const now = Date.now()
    const bookmarksToProcess = []
    
    // 활성화된 기간별로 북마크 분류
    const periods = Object.entries(cleanupSettings).filter(([key, setting]) => 
      (key.startsWith('week') || key.startsWith('month') || key.startsWith('year') || key === 'custom') && setting.enabled
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

    // 간단한 카테고리 분류 함수
    function categorizeBookmark(bookmark) {
      const title = (bookmark.title || '').toLowerCase()
      const url = (bookmark.url || '').toLowerCase()
      const text = `${title} ${url}`
      
      let domain = ''
      try {
        domain = new URL(bookmark.url).hostname.toLowerCase()
      } catch (e) {
        domain = ''
      }

      // 기본 카테고리 분류
      if (/github|stackoverflow|codepen/.test(domain) || /개발|프로그래밍|코딩/.test(text)) {
        return 'development'
      }
      if (/notion|slack|zoom|docs|office/.test(domain) || /업무|회사/.test(text)) {
        return 'work'
      }
      if (/youtube|netflix|spotify/.test(domain) || /영화|음악|게임/.test(text)) {
        return 'entertainment'
      }
      if (/amazon|coupang|shopping/.test(domain) || /쇼핑|구매/.test(text)) {
        return 'shopping'
      }
      
      return 'other'
    }

    async function checkBookmark(node) {
      if (node.url && node.parentId !== graveyardId) {
        // 검색엔진 사이트는 제외
        if (isSearchEngine(node.url)) {
          return
        }

        const result = await chrome.storage.local.get([`lastVisit_${node.id}`])
        const lastVisit = result[`lastVisit_${node.id}`] || node.dateAdded || 0
        
        // 각 기간별로 체크 (마지막 방문일 기준)
        for (const [periodKey, setting] of periods) {
          const daysSinceVisit = (now - lastVisit) / (24 * 60 * 60 * 1000)
          
          let isInRange = false
          
          if (periodKey === 'custom') {
            // 커스텀 범위 체크
            isInRange = daysSinceVisit >= setting.minDays && daysSinceVisit <= setting.maxDays
          } else {
            // 기존 로직: 1주 옵션은 0일부터, 다른 옵션들은 설정된 기간 이상
            const thresholdDays = (periodKey === 'week1') ? 0 : setting.days
            isInRange = daysSinceVisit >= thresholdDays
          }
          
          if (isInRange) {
            bookmarksToProcess.push({
              ...node,
              period: setting.label,
              daysSinceVisit: Math.floor(daysSinceVisit),
              lastVisit: lastVisit,
              category: categorizeBookmark(node)
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
      
      // 처리 대상 목록을 저장 (팝업에서 사용)
      await chrome.storage.local.set({
        pendingBookmarks: bookmarksToProcess,
        lastScanDate: new Date().toISOString()
      })
    }
  } catch (error) {
    console.error('Error scanning bookmarks:', error)
  }
}

// 브라우저 세션 시작시 폴더 확인 (첫 번째 탭 활성화시)
let sessionFolderChecked = false
if (chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(() => {
    if (!sessionFolderChecked) {
      sessionFolderChecked = true
      console.log('First tab activation - checking graveyard folder')
      verifyAndRecoverGraveyardFolder()
    }
  })
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
  } else if (request.action === 'getBookmarkDistribution') {
    getBookmarkDistribution()
      .then(distribution => sendResponse({ distribution }))
      .catch(err => {
        console.error('Error getting bookmark distribution:', err)
        sendResponse({ distribution: {} })
      })
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


// 북마크 분포 데이터 계산
async function getBookmarkDistribution() {
  try {
    const { graveyardId } = await chrome.storage.local.get('graveyardId')
    const bookmarks = await chrome.bookmarks.getTree()
    const now = Date.now()
    const distribution = {}
    
    // 0일부터 730일(2년)까지 1일 단위로 분포 계산
    for (let day = 0; day <= 730; day++) {
      distribution[day] = 0
    }
    
    async function analyzeBookmark(node) {
      if (node.url && node.parentId !== graveyardId) {
        // 검색엔진 사이트는 제외
        if (SEARCH_ENGINE_DOMAINS.some(domain => {
          try {
            return new URL(node.url).hostname.toLowerCase().includes(domain)
          } catch {
            return false
          }
        })) {
          return
        }
        
        const result = await chrome.storage.local.get([`lastVisit_${node.id}`])
        const lastVisit = result[`lastVisit_${node.id}`] || node.dateAdded || 0
        const daysSinceVisit = Math.floor((now - lastVisit) / (24 * 60 * 60 * 1000))
        
        // 2년 이내의 데이터만 포함
        if (daysSinceVisit >= 0 && daysSinceVisit <= 730) {
          distribution[daysSinceVisit]++
        }
      }
      
      if (node.children) {
        for (const child of node.children) {
          await analyzeBookmark(child)
        }
      }
    }
    
    // 북마크 분석
    for (const child of bookmarks[0].children) {
      await analyzeBookmark(child)
    }
    
    return distribution
  } catch (error) {
    console.error('Error calculating bookmark distribution:', error)
    return {}
  }
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