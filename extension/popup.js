document.addEventListener('DOMContentLoaded', async () => {
      const contentDiv = document.getElementById('content')
      
      // 통계 로드
      chrome.runtime.sendMessage({ action: 'getStats' }, async (stats) => {
        const graveyardBookmarks = await getGraveyardBookmarks()
        
        contentDiv.innerHTML = `
          <div class="stats-card">
            <div class="stat-item">
              <span class="stat-label">묘지의 북마크</span>
              <span class="stat-value">${stats.graveyardCount}개</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">마지막 정리</span>
              <span class="stat-value">${stats.lastMoved || 0}개</span>
            </div>
          </div>

          ${graveyardBookmarks.length > 0 ? `
            <div class="bookmark-list">
              <div style="font-size: 14px; margin-bottom: 10px; opacity: 0.9;">
                최근 묘지로 이동
              </div>
              ${graveyardBookmarks.slice(0, 5).map(b => `
                <div class="bookmark-item" data-id="${b.id}" data-url="${b.url}">
                  <img class="bookmark-icon" src="https://www.google.com/s2/favicons?domain=${new URL(b.url).hostname}" alt="">
                  <div class="bookmark-title">${b.title}</div>
                  <button class="resurrect-btn" data-id="${b.id}">부활</button>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="empty-state">
              <div class="empty-icon">✨</div>
              <div>모든 북마크가 활발히 사용중!</div>
            </div>
          `}

          <div class="action-buttons">
            <button class="btn btn-secondary" id="scanBtn">즉시 스캔</button>
            <button class="btn btn-primary" id="dashboardBtn">대시보드</button>
          </div>
        `

        setupEventListeners()
      })
    })

    function setupEventListeners() {
      // 북마크 클릭
      document.querySelectorAll('.bookmark-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (!e.target.classList.contains('resurrect-btn')) {
            chrome.tabs.create({ url: item.dataset.url })
          }
        })
      })

      // 부활 버튼
      document.querySelectorAll('.resurrect-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          chrome.runtime.sendMessage(
            { action: 'resurrect', bookmarkId: btn.dataset.id },
            () => {
              btn.closest('.bookmark-item').style.display = 'none'
            }
          )
        })
      })

      // 스캔 버튼
      document.getElementById('scanBtn')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'scan' })
        alert('스캔을 시작합니다!')
      })

      // 대시보드 버튼
      document.getElementById('dashboardBtn')?.addEventListener('click', () => {
        chrome.tabs.create({ url: 'http://localhost:3000/dashboard' })
      })
    }

    async function getGraveyardBookmarks() {
      return new Promise((resolve) => {
        chrome.storage.local.get('graveyardId', async (result) => {
          if (result.graveyardId) {
            const graveyard = await chrome.bookmarks.getSubTree(result.graveyardId)
            resolve(graveyard[0].children || [])
          } else {
            resolve([])
          }
        })
      })
    }