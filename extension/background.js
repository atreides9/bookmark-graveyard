// background.js - 오류 수정 완료 버전
const API_URL = 'http://localhost:3000/api'
const GRAVEYARD_FOLDER = '🪦 북마크 묘지'
const DAYS_THRESHOLD = 30

// 초기화
chrome.runtime.onInstalled.addListener(() => {
  console.log('북마크 묘지 구조대 설치 완료!')
  createGraveyardFolder()
  
  // 매일 자정에 체크
  chrome.alarms.create('dailyCheck', {
    periodInMinutes: 1440
  })
  
  // 초기 스캔
  scanBookmarks()
})

// 알람 리스너
const dailyCheckAlarmListener = (alarm) => {
  if (alarm.name === 'dailyCheck') {
    scanBookmarks()
  }
}

chrome.alarms.onAlarm.addListener(dailyCheckAlarmListener)

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

// 북마크 스캔
async function scanBookmarks() {
  try {
    const { graveyardId } = await chrome.storage.local.get('graveyardId')
    
    if (!graveyardId) {
      console.log('Graveyard folder not found, creating...')
      await createGraveyardFolder()
      return
    }
    
    const bookmarks = await chrome.bookmarks.getTree()
    const now = Date.now()
    const threshold = DAYS_THRESHOLD * 24 * 60 * 60 * 1000
    
    const toMove = []
    
    // Promise 기반으로 변경
    async function checkBookmark(node) {
      if (node.url && node.parentId !== graveyardId) {
        const result = await chrome.storage.local.get(`lastVisit_${node.id}`)
        const lastVisit = result[`lastVisit_${node.id}`] || 0
        
        if (now - lastVisit > threshold) {
          toMove.push(node)
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
    
    // 묘지로 이동
    if (toMove.length > 0) {
      for (const bookmark of toMove) {
        try {
          await chrome.bookmarks.move(bookmark.id, { parentId: graveyardId })
          
          // 서버에 전송 (에러 처리 추가)
          fetch(`${API_URL}/bookmarks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: bookmark.id,
              title: bookmark.title,
              url: bookmark.url,
              movedAt: new Date().toISOString()
            })
          }).catch(err => console.log('Server sync failed:', err))
        } catch (error) {
          console.error('Error moving bookmark:', error)
        }
      }
      
      await chrome.storage.local.set({
        lastMoved: toMove.length,
        lastMovedDate: new Date().toISOString()
      })
      
      chrome.action.setBadgeText({ text: toMove.length.toString() })
      chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' })
    }
  } catch (error) {
    console.error('Error scanning bookmarks:', error)
  }
}

// 탭 업데이트 시 방문 기록
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    chrome.bookmarks.search({ url: tab.url }, (results) => {
      if (results.length > 0) {
        chrome.storage.local.set({
          [`lastVisit_${results[0].id}`]: Date.now()
        })
      }
    })
  }
})

// 메시지 리스너
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
  }
})

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