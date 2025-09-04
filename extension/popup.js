document.addEventListener('DOMContentLoaded', async () => {
      const contentDiv = document.getElementById('content')
      
      // 설정과 통계 로드
      chrome.runtime.sendMessage({ action: 'getSettings' }, async (settingsResponse) => {
        chrome.runtime.sendMessage({ action: 'getStats' }, async (stats) => {
          const pendingBookmarks = await getPendingBookmarks()
          const graveyardBookmarks = await getGraveyardBookmarks()
          
          contentDiv.innerHTML = `
            <div class="stats-card">
              <div class="stat-item">
                <span class="stat-label">묘지의 북마크</span>
                <span class="stat-value">${stats.graveyardCount}개</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">검토 대기 중</span>
                <span class="stat-value">${pendingBookmarks.length}개</span>
              </div>
            </div>

            ${pendingBookmarks.length > 0 ? `
              <div class="bookmark-list">
                <div style="font-size: 14px; margin-bottom: 10px; opacity: 0.9; display: flex; justify-content: space-between; align-items: center;">
                  <span>🔍 검토가 필요한 북마크</span>
                  <button class="btn-small" id="copyAllBtn">모두 정리</button>
                </div>
                ${pendingBookmarks.slice(0, 5).map(b => `
                  <div class="bookmark-item" data-id="${b.id}" data-url="${b.url}">
                    <img class="bookmark-icon" src="https://www.google.com/s2/favicons?domain=${new URL(b.url).hostname}" alt="">
                    <div class="bookmark-info">
                      <div class="bookmark-title">${b.title}</div>
                      <div class="bookmark-meta">${b.period} · ${b.daysSinceVisit}일째 미방문</div>
                    </div>
                    <input type="checkbox" class="bookmark-checkbox" data-id="${b.id}" checked>
                  </div>
                `).join('')}
                ${pendingBookmarks.length > 5 ? `<div style="text-align: center; opacity: 0.7; font-size: 12px;">외 ${pendingBookmarks.length - 5}개 더</div>` : ''}
              </div>
            ` : `
              <div class="empty-state">
                <div class="empty-icon">✨</div>
                <div>모든 북마크가 활발히 사용중!</div>
              </div>
            `}

            <div style="margin-bottom: 20px;">
              <button class="btn btn-settings" id="settingsBtn">⚙️ 정리 설정</button>
            </div>

            <div class="action-buttons">
              <button class="btn btn-secondary" id="scanBtn">즉시 스캔</button>
              <button class="btn btn-primary" id="dashboardBtn">대시보드</button>
            </div>
          `

          setupEventListeners(settingsResponse.settings)
        })
      })
    })

    function setupEventListeners(settings) {
      // 북마크 클릭
      document.querySelectorAll('.bookmark-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (!e.target.classList.contains('bookmark-checkbox') && !e.target.classList.contains('resurrect-btn')) {
            chrome.tabs.create({ url: item.dataset.url })
          }
        })
      })

      // 모두 정리 버튼
      document.getElementById('copyAllBtn')?.addEventListener('click', () => {
        const checkedBookmarks = Array.from(document.querySelectorAll('.bookmark-checkbox:checked'))
        if (checkedBookmarks.length === 0) {
          alert('선택된 북마크가 없습니다.')
          return
        }
        
        const selectedIds = checkedBookmarks.map(cb => cb.dataset.id)
        chrome.storage.local.get('pendingBookmarks', (result) => {
          const bookmarksToMove = result.pendingBookmarks.filter(b => selectedIds.includes(b.id))
          
          chrome.runtime.sendMessage(
            { action: 'copyToGraveyard', bookmarks: bookmarksToMove },
            (response) => {
              if (response.success) {
                alert(`${bookmarksToMove.length}개의 북마크를 묘지에 복제했습니다. 원본은 그대로 유지됩니다.`)
                location.reload()
              } else {
                alert('오류가 발생했습니다.')
              }
            }
          )
        })
      })

      // 설정 버튼
      document.getElementById('settingsBtn')?.addEventListener('click', () => {
        showSettingsModal(settings)
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
        chrome.runtime.sendMessage({ action: 'scan' }, (response) => {
          alert('스캔을 완료했습니다!')
          location.reload()
        })
      })

      // 대시보드 버튼
      document.getElementById('dashboardBtn')?.addEventListener('click', () => {
        chrome.tabs.create({ url: 'http://localhost:3000/dashboard' })
      })
    }

    async function getPendingBookmarks() {
      return new Promise((resolve) => {
        chrome.storage.local.get('pendingBookmarks', (result) => {
          resolve(result.pendingBookmarks || [])
        })
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

    function showSettingsModal(currentSettings) {
      const modal = document.createElement('div')
      modal.className = 'modal-overlay'
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3>⚙️ 정리 설정</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="setting-group">
              <h4>정리 기간 설정</h4>
              <p class="setting-desc">선택한 기간이 지난 북마크를 검토 대상으로 표시합니다</p>
              
              <label class="setting-item">
                <input type="checkbox" id="week1" ${currentSettings.week1?.enabled ? 'checked' : ''}>
                <span>1주일 (7일)</span>
              </label>
              
              <label class="setting-item">
                <input type="checkbox" id="week2" ${currentSettings.week2?.enabled ? 'checked' : ''}>
                <span>2주일 (14일)</span>
              </label>
              
              <label class="setting-item">
                <input type="checkbox" id="week3" ${currentSettings.week3?.enabled ? 'checked' : ''}>
                <span>3주일 (21일)</span>
              </label>
              
              <label class="setting-item">
                <input type="checkbox" id="week4" ${currentSettings.week4?.enabled ? 'checked' : ''}>
                <span>4주일 (28일)</span>
              </label>
            </div>

            <div class="setting-group">
              <h4>이메일 알림</h4>
              <p class="setting-desc">부드러운 톤으로 알림을 보내드립니다</p>
              
              <label class="setting-item">
                <input type="checkbox" id="emailNotifications" ${currentSettings.emailNotifications ? 'checked' : ''}>
                <span>이메일 알림 받기</span>
              </label>
              
              <input type="email" id="userEmail" placeholder="이메일 주소" 
                     value="${currentSettings.userEmail || ''}" 
                     style="width: 100%; padding: 8px; margin-top: 10px; border-radius: 4px; border: 1px solid #ccc;">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelSettings">취소</button>
            <button class="btn btn-primary" id="saveSettings">저장</button>
          </div>
        </div>
      `
      
      document.body.appendChild(modal)
      
      // 설정 모달 이벤트 처리
      modal.querySelector('.modal-close').onclick = () => modal.remove()
      modal.querySelector('#cancelSettings').onclick = () => modal.remove()
      modal.onclick = (e) => { if (e.target === modal) modal.remove() }
      
      modal.querySelector('#saveSettings').onclick = () => {
        const newSettings = {
          week1: { ...currentSettings.week1, enabled: document.getElementById('week1').checked },
          week2: { ...currentSettings.week2, enabled: document.getElementById('week2').checked },
          week3: { ...currentSettings.week3, enabled: document.getElementById('week3').checked },
          week4: { ...currentSettings.week4, enabled: document.getElementById('week4').checked },
          emailNotifications: document.getElementById('emailNotifications').checked,
          userEmail: document.getElementById('userEmail').value
        }
        
        chrome.runtime.sendMessage(
          { action: 'updateSettings', settings: newSettings },
          (response) => {
            if (response.success) {
              alert('설정이 저장되었습니다!')
              modal.remove()
              location.reload()
            } else {
              alert('설정 저장에 실패했습니다.')
            }
          }
        )
      }
    }