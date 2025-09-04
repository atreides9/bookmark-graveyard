// Google-grade Performance & Apple Design Philosophy
class BookmarkManager {
  constructor() {
    this.state = {
      bookmarks: [],
      processed: new Set(),
      selected: new Set(),
      displayCount: 5,
      settings: null,
      sortBy: 'daysSinceVisit', // 기본 정렬
      sortOrder: 'desc', // 'asc' or 'desc'
      viewMode: 'list', // 'list', 'categories', 'category-detail'
      selectedCategory: null
    }
    this.cache = {
      stats: null,
      statsTime: 0
    }
    this.elements = {}
    this.isInitialized = false
  }

  async init() {
    if (this.isInitialized) return
    
    console.log('BookmarkManager initializing...')
    await this.loadData()
    console.log('Data loaded, bookmarks:', this.state.bookmarks.length)
    this.cacheElements()
    this.bindEvents()
    await this.render()
    this.isInitialized = true
    console.log('BookmarkManager initialized')
  }

  cacheElements() {
    this.elements = {
      content: document.getElementById('content'),
      actionBar: null, // Will be set after render
      scanBtn: null
    }
  }

  async loadData() {
    try {
      const [processed, pending, settings] = await Promise.all([
        this.getProcessedBookmarks(),
        this.getPendingBookmarks(),
        this.getSettings()
      ])
      
      this.state.processed = new Set(processed)
      this.state.settings = settings
      let bookmarks = (pending || [])
        .filter(b => !this.state.processed.has(b.id))
      
      // 설정된 기간에 맞는 북마크만 필터링
      bookmarks = this.filterBookmarksByDateAdded(bookmarks)
      
      this.state.bookmarks = bookmarks
      
      // AI 카테고리 분류 적용
      await this.enhanceBookmarksWithAI()
      
      this.sortBookmarks()
    } catch (error) {
      console.error('Error loading data:', error)
      this.state.bookmarks = []
    }
  }

  async getStats() {
    const now = Date.now()
    if (this.cache.stats && (now - this.cache.statsTime) < 5000) {
      return this.cache.stats
    }
    
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'getStats' }, stats => {
        this.cache.stats = stats || { graveyardCount: 0 }
        this.cache.statsTime = now
        resolve(this.cache.stats)
      })
    })
  }

  async getProcessedBookmarks() {
    const result = await chrome.storage.local.get('processedBookmarks')
    return result.processedBookmarks || []
  }

  async getPendingBookmarks() {
    return new Promise(resolve => {
      chrome.storage.local.get('pendingBookmarks', result => {
        resolve(result.pendingBookmarks || [])
      })
    })
  }

  async getSettings() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'getSettings' }, response => {
        resolve(response?.settings || {})
      })
    })
  }

  async render() {
    try {
      console.log('Rendering, viewMode:', this.state.viewMode, 'bookmarks:', this.state.bookmarks.length)
      const stats = await this.getStats()
      const selectedCount = this.state.selected.size

      // 20의 배수 달성 시 축하 팝업 표시
      await this.checkMilestoneAchievement(stats.graveyardCount)

      if (!this.elements.content) {
        console.error('Content element not found!')
        return
      }

      this.elements.content.innerHTML = `
      <!-- Header -->
      <div class="header">
        <div class="header-left">
          <h1 class="app-title">🚒 북마크 구조대 🧑‍🚒</h1>
        </div>
        <div class="stats">
          <div class="stat">
            <div class="number">${this.formatCount(stats.graveyardCount)}</div>
            <div class="label">구조</div>
          </div>
          <div class="stat">
            <div class="number">${this.state.bookmarks.length > 10 ? '10+' : this.state.bookmarks.length}</div>
            <div class="label">대기</div>
          </div>
        </div>
        <button class="settings-btn" id="settingsBtn">⚙️</button>
      </div>

      <!-- Content -->
      ${this.state.bookmarks.length ? this.renderContent() : `
        <div class="empty">
          <div class="icon">✨</div>
          <div class="title">완벽하네요!</div>
          <div class="text">모든 북마크가 활발히 사용되고 있어요</div>
          <div class="encouragement">이대로 쭉 유지해보세요 💪</div>
        </div>
      `}

      <!-- Action Bar -->
      <div class="action-bar ${selectedCount ? 'show' : ''}" id="actionBar">
        <span>${selectedCount}개 선택</span>
        <div class="actions">
          <button class="action keep" id="keepBtn" ${!selectedCount ? 'disabled' : ''}>구조</button>
          <button class="action delete" id="deleteBtn" ${!selectedCount ? 'disabled' : ''}>삭제</button>
        </div>
      </div>

      <!-- Scan -->
      <button class="scan-btn" id="scanBtn">
        <span id="scanText">구조할 북마크 찾기</span>
      </button>
    `

      // Cache new elements
      this.elements.actionBar = document.getElementById('actionBar')
      this.elements.scanBtn = document.getElementById('scanBtn')
      console.log('Render completed')
    } catch (error) {
      console.error('Render error:', error)
      this.elements.content.innerHTML = '<div style="padding: 20px; color: red;">렌더링 오류가 발생했습니다.</div>'
    }
  }

  bindEvents() {
    // Single delegation for all clicks
    document.addEventListener('click', this.handleClick.bind(this))
    
    // 정렬 드롭다운 이벤트
    document.addEventListener('change', async (e) => {
      if (e.target.id === 'sortSelect') {
        this.state.sortBy = e.target.value
        this.state.viewMode = e.target.value === 'category' ? 'categories' : 'list'
        this.state.selectedCategory = null
        this.state.sortOrder = 'desc' // 기본값으로 리셋
        this.sortBookmarks()
        await this.render()
      }
    })

    // 정렬 순서 토글 이벤트
    document.addEventListener('click', async (e) => {
      if (e.target.classList.contains('sort-toggle')) {
        if (this.state.sortBy !== 'category') {
          this.state.sortOrder = this.state.sortOrder === 'desc' ? 'asc' : 'desc'
          this.sortBookmarks()
          await this.render()
        }
      }
    })
  }

  async handleClick(e) {
    const { target } = e
    
    if (target.id === 'settingsBtn') {
      this.showSettings()
    } else if (target.id === 'loadMore') {
      await this.loadMore()
    } else if (target.id === 'scanBtn') {
      await this.scan()
    } else if (target.id === 'keepBtn') {
      await this.bulkAction('keep')
    } else if (target.id === 'deleteBtn') {
      await this.bulkAction('delete')
    } else if (target.classList.contains('visit-btn')) {
      chrome.tabs.create({ url: target.dataset.url })
    } else if (target.classList.contains('category-tile')) {
      await this.selectCategory(target.dataset.category)
    } else if (target.id === 'backBtn') {
      await this.goBackToCategories()
    } else if (target.id === 'selectAllBtn') {
      this.toggleSelectAll()
    } else if (target.closest('.bookmark')) {
      const bookmark = target.closest('.bookmark')
      if (!target.classList.contains('visit-btn')) {
        this.toggleSelect(bookmark.dataset.id)
      }
    }
  }

  toggleSelect(id) {
    if (this.state.selected.has(id)) {
      this.state.selected.delete(id)
    } else {
      this.state.selected.add(id)
    }
    this.updateUI()
  }

  toggleSelectAll() {
    const displayBookmarks = this.getCurrentDisplayBookmarks()
    const allSelected = this.isAllDisplayedSelected()
    
    if (allSelected) {
      // 전체 해제
      displayBookmarks.forEach(bookmark => {
        this.state.selected.delete(bookmark.id)
      })
    } else {
      // 전체 선택
      displayBookmarks.forEach(bookmark => {
        this.state.selected.add(bookmark.id)
      })
    }
    
    this.updateUI()
  }

  updateUI() {
    // Update only changed elements - no full re-render
    const selectedCount = this.state.selected.size
    
    // Update bookmarks selection state
    document.querySelectorAll('.bookmark').forEach(el => {
      const isSelected = this.state.selected.has(el.dataset.id)
      el.classList.toggle('selected', isSelected)
    })

    // Update action bar
    this.elements.actionBar.classList.toggle('show', selectedCount > 0)
    this.elements.actionBar.querySelector('span').textContent = `${selectedCount}개 선택`
    
    const keepBtn = document.getElementById('keepBtn')
    const deleteBtn = document.getElementById('deleteBtn')
    keepBtn.disabled = deleteBtn.disabled = !selectedCount

    // Update select all button text
    const selectAllBtn = document.getElementById('selectAllBtn')
    if (selectAllBtn) {
      selectAllBtn.textContent = this.isAllDisplayedSelected() ? '전체해제' : '전체선택'
    }
  }

  sortBookmarks() {
    const isAsc = this.state.sortOrder === 'asc'
    
    switch (this.state.sortBy) {
      case 'daysSinceVisit':
        this.state.bookmarks.sort((a, b) => {
          const diff = b.daysSinceVisit - a.daysSinceVisit
          return isAsc ? -diff : diff
        })
        break
      case 'category':
        this.state.bookmarks.sort((a, b) => {
          const categoryA = a.category || 'other'
          const categoryB = b.category || 'other'
          if (categoryA === categoryB) {
            return b.daysSinceVisit - a.daysSinceVisit
          }
          return categoryA.localeCompare(categoryB)
        })
        break
      case 'dateAdded':
        this.state.bookmarks.sort((a, b) => {
          const diff = (b.dateAdded || 0) - (a.dateAdded || 0)
          return isAsc ? -diff : diff
        })
        break
    }
  }

  getCurrentDisplayBookmarks() {
    return this.state.bookmarks.slice(0, this.state.displayCount)
  }

  isAllDisplayedSelected() {
    const displayBookmarks = this.getCurrentDisplayBookmarks()
    if (displayBookmarks.length === 0) return false
    return displayBookmarks.every(bookmark => this.state.selected.has(bookmark.id))
  }

  formatCount(count) {
    if (count === 0) return '0'
    if (count < 10) return count.toString()
    if (count >= 90) return '90+'
    
    // 10의 배수로 내림처리
    const rounded = Math.floor(count / 10) * 10
    return `${rounded}+`
  }

  filterBookmarksByDateAdded(bookmarks) {
    if (!this.state.settings) return bookmarks
    
    const now = Date.now()
    const enabledPeriods = []
    
    // 활성화된 기간 찾기
    if (this.state.settings.week1?.enabled) enabledPeriods.push({ min: 1, max: 7 })
    if (this.state.settings.week2?.enabled) enabledPeriods.push({ min: 8, max: 14 })
    if (this.state.settings.week3?.enabled) enabledPeriods.push({ min: 15, max: 21 })
    if (this.state.settings.month1?.enabled) enabledPeriods.push({ min: 22, max: 30 })
    if (this.state.settings.month6?.enabled) enabledPeriods.push({ min: 31, max: 180 })
    if (this.state.settings.year1?.enabled) enabledPeriods.push({ min: 181, max: 365 })
    if (this.state.settings.year3?.enabled) enabledPeriods.push({ min: 366, max: 1095 })
    if (this.state.settings.year3plus?.enabled) enabledPeriods.push({ min: 1096, max: 999999 })
    
    // 활성화된 기간이 없으면 모든 북마크 반환
    if (enabledPeriods.length === 0) return bookmarks
    
    return bookmarks.filter(bookmark => {
      const dateAdded = bookmark.dateAdded || now
      const daysAgo = Math.floor((now - dateAdded) / (24 * 60 * 60 * 1000))
      
      // 설정된 기간 중 하나라도 해당하면 포함
      return enabledPeriods.some(period => 
        daysAgo >= period.min && daysAgo <= period.max
      )
    })
  }

  async checkMilestoneAchievement(currentCount) {
    try {
      // 20의 배수 체크
      if (currentCount > 0 && currentCount % 20 === 0) {
        const lastCelebrated = await chrome.storage.local.get('lastCelebratedMilestone')
        const lastMilestone = lastCelebrated.lastCelebratedMilestone || 0
        
        // 아직 축하하지 않은 마일스톤인 경우에만 팝업 표시
        if (currentCount > lastMilestone) {
          await chrome.storage.local.set({ lastCelebratedMilestone: currentCount })
          this.showMilestonePopup(currentCount)
        }
      }
    } catch (error) {
      console.error('Error checking milestone:', error)
    }
  }

  showMilestonePopup(count) {
    const overlay = document.createElement('div')
    overlay.className = 'milestone-overlay'
    overlay.innerHTML = `
      <div class="milestone-popup">
        <div class="milestone-content">
          <div class="milestone-icon">🎉</div>
          <h2 class="milestone-title">축하합니다!</h2>
          <p class="milestone-message">
            당신은 우리의 생명의 은인이에요.<br>
            구조되었으니 당신에게 많은 도움을 주고 싶어요!
          </p>
          <div class="milestone-count">${count}개 북마크 구조 달성</div>
          <div class="milestone-actions">
            <button class="milestone-btn primary" id="viewRescuedBtn">구조한 북마크 보러가기</button>
            <button class="milestone-btn secondary" id="closeMilestoneBtn">닫기</button>
          </div>
        </div>
      </div>
    `
    
    document.body.appendChild(overlay)
    
    // 애니메이션을 위한 지연
    setTimeout(() => overlay.classList.add('show'), 10)
    
    // 이벤트 리스너
    overlay.addEventListener('click', (e) => {
      if (e.target.id === 'viewRescuedBtn') {
        this.openRescuedBookmarksTab()
        this.closeMilestonePopup(overlay)
      } else if (e.target.id === 'closeMilestoneBtn' || e.target === overlay) {
        this.closeMilestonePopup(overlay)
      }
    })
  }

  closeMilestonePopup(overlay) {
    overlay.classList.add('hide')
    setTimeout(() => overlay.remove(), 300)
  }

  async openRescuedBookmarksTab() {
    try {
      // 구조된 북마크 폴더 찾기
      const { graveyardId } = await chrome.storage.local.get('graveyardId')
      if (graveyardId) {
        // Chrome 북마크 매니저에서 해당 폴더 열기
        chrome.tabs.create({ 
          url: `chrome://bookmarks/?id=${graveyardId}` 
        })
      }
    } catch (error) {
      console.error('Error opening rescued bookmarks:', error)
    }
  }

  async enhanceBookmarksWithAI() {
    try {
      // 캐시 확인 (7일간 유효)
      const cacheKey = 'aiCategories'
      const cacheExpiry = 7 * 24 * 60 * 60 * 1000 // 7일
      const cached = await chrome.storage.local.get([cacheKey, cacheKey + '_time'])
      const now = Date.now()

      let aiCategories = {}
      if (cached[cacheKey] && cached[cacheKey + '_time'] && 
          (now - cached[cacheKey + '_time']) < cacheExpiry) {
        aiCategories = cached[cacheKey]
        console.log('🎯 AI 카테고리 캐시 사용')
      }

      // 캐시되지 않은 북마크만 분석
      const uncategorizedBookmarks = this.state.bookmarks.filter(b => !aiCategories[b.id])
      
      if (uncategorizedBookmarks.length > 0) {
        console.log('🤖 AI로 카테고리 분석 중...', uncategorizedBookmarks.length, '개')
        const newCategories = await this.analyzeBookmarksWithOpenAI(uncategorizedBookmarks.slice(0, 20)) // 한 번에 20개씩
        
        // 결과 병합
        Object.assign(aiCategories, newCategories)
        
        // 캐시 저장
        await chrome.storage.local.set({
          [cacheKey]: aiCategories,
          [cacheKey + '_time']: now
        })
      }

      // 북마크에 AI 카테고리 적용
      this.state.bookmarks.forEach(bookmark => {
        if (aiCategories[bookmark.id]) {
          bookmark.category = aiCategories[bookmark.id]
          bookmark.aiEnhanced = true
        } else {
          // fallback to rule-based categorization
          bookmark.category = this.categorizeBookmarkFallback(bookmark)
          bookmark.aiEnhanced = false
        }
      })

    } catch (error) {
      console.error('AI 카테고리 분석 실패:', error)
      // fallback: 기존 룰 기반 분류
      this.state.bookmarks.forEach(bookmark => {
        bookmark.category = this.categorizeBookmarkFallback(bookmark)
        bookmark.aiEnhanced = false
      })
    }
  }

  async analyzeBookmarksWithOpenAI(bookmarks) {
    try {
      const bookmarksData = bookmarks.map(b => ({
        id: b.id,
        title: b.title || '',
        url: b.url || '',
        description: b.description || ''
      }))

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getOpenAIKey()}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{
            role: 'system',
            content: `당신은 북마크를 분석하여 개인화된 카테고리로 분류하는 전문가입니다. 
사용자의 관심사와 행동 패턴을 고려하여 다음 카테고리 중 하나로 분류해주세요:
- work: 업무, 비즈니스, 생산성 도구, 프로젝트 관리
- reference: 백과사전, 매뉴얼, 문서, API, 데이터베이스
- design: 디자인 리소스, 아이콘, 폰트, 컬러팔레트, 이미지
- news: 뉴스, 미디어, 블로그, IT 트렌드, 기사
- entertainment: 동영상, 음악, 게임, 웹툰, 영화, 드라마
- shopping: 쇼핑몰, 이커머스, 가격비교, 특가정보
- learning: 온라인강의, 교육, 튜토리얼, 기술블로그, 학습자료
- social: 커뮤니티, 포럼, SNS, 소셜네트워크
- other: 위 카테고리에 해당하지 않는 기타

JSON 형식으로 응답해주세요: {"bookmark_id": "category"}`
          }, {
            role: 'user', 
            content: `다음 북마크들을 분석해서 카테고리를 분류해주세요:\n${JSON.stringify(bookmarksData, null, 2)}`
          }],
          temperature: 0.3,
          max_tokens: 1000
        })
      })

      if (!response.ok) {
        throw new Error(`OpenAI API 오류: ${response.status}`)
      }

      const data = await response.json()
      const categories = JSON.parse(data.choices[0].message.content.trim())
      
      console.log('🎯 AI 분류 완료:', Object.keys(categories).length, '개')
      return categories

    } catch (error) {
      console.error('OpenAI API 호출 실패:', error)
      return {}
    }
  }

  async getOpenAIKey() {
    // 확장 프로그램 설정에서 API 키 가져오기
    const result = await chrome.storage.local.get('openaiApiKey')
    if (!result.openaiApiKey) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다')
    }
    return result.openaiApiKey
  }

  categorizeBookmarkFallback(bookmark) {
    // 8가지 표준 카테고리 기반 분류 (fallback)
    const title = (bookmark.title || '').toLowerCase()
    const url = (bookmark.url || '').toLowerCase()
    const text = `${title} ${url}`

    // 1. Work/업무
    if (/notion|slack|jira|confluence|trello|asana|zoom|teams|office|excel|word|powerpoint|google drive|dropbox|figma|adobe/.test(text)) return 'work'
    
    // 2. Reference/자료
    if (/wikipedia|reference|wiki|docs|documentation|api|guide|manual|how-to|tips|tricks|백과|사전|매뉴얼|데이터베이스/.test(text)) return 'reference'
    
    // 3. Design/디자인
    if (/behance|dribbble|pinterest|unsplash|icon|font|color|palette|photoshop|sketch|figma|디자인|아이콘|폰트|컬러/.test(text)) return 'design'
    
    // 4. News/뉴스·트렌드
    if (/news|뉴스|신문|기사|blog|medium|techcrunch|경제|정치|사회|스포츠|연합뉴스|조선일보|중앙일보|동아일보|한겨레|매일경제|한국경제|cnn|bbc|reuters/.test(text)) return 'news'
    
    // 5. Entertainment/엔터테인먼트
    if (/youtube|netflix|disney|spotify|music|movie|drama|game|entertainment|fun|웹툰|만화|게임|영화|드라마|음악/.test(text)) return 'entertainment'
    
    // 6. Shopping/구매
    if (/amazon|ebay|쿠팡|11번가|g마켓|옥션|위메프|티몬|무신사|29cm|shop|store|buy|purchase|cart|order|product|쇼핑몰|가격비교|특가|중고장터/.test(text)) return 'shopping'
    
    // 7. Learning/교육·튜토리얼
    if (/coursera|udemy|khan academy|edx|codecademy|freecodecamp|tutorial|learn|course|education|university|college|study|온라인강의|학습|튜토리얼|기술블로그/.test(text)) return 'learning'
    
    // 8. Social/커뮤니티·SNS
    if (/facebook|twitter|instagram|reddit|discord|telegram|kakaotalk|naver cafe|clien|ruliweb|dcinside|inven|커뮤니티|포럼|sns|소셜/.test(text)) return 'social'
    
    return 'other'
  }

  renderContent() {
    switch (this.state.viewMode) {
      case 'categories':
        return this.renderCategoryTiles()
      case 'category-detail':
        return this.renderCategoryDetail()
      default:
        return this.renderBookmarkList()
    }
  }

  renderBookmarkList() {
    const displayBookmarks = this.getCurrentDisplayBookmarks()
    const hasMore = this.state.displayCount < this.state.bookmarks.length

    return `
      <div class="content">
        <div class="content-header">
          <button class="select-all-btn" id="selectAllBtn">
            ${this.isAllDisplayedSelected() ? '전체해제' : '전체선택'}
          </button>
          <div class="sort-controls">
            <select class="sort-dropdown" id="sortSelect">
              <option value="daysSinceVisit" ${this.state.sortBy === 'daysSinceVisit' ? 'selected' : ''}>오래된 순</option>
              <option value="category" ${this.state.sortBy === 'category' ? 'selected' : ''}>카테고리별</option>
              <option value="dateAdded" ${this.state.sortBy === 'dateAdded' ? 'selected' : ''}>추가일순</option>
            </select>
            ${this.state.sortBy !== 'category' ? `
              <button class="sort-toggle" title="${this.state.sortOrder === 'desc' ? '내림차순' : '오름차순'}">
                ${this.state.sortOrder === 'desc' ? '↓' : '↑'}
              </button>
            ` : ''}
          </div>
        </div>
        <div class="bookmarks" id="bookmarkList">
          ${displayBookmarks.map(bookmark => {
            let faviconUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="%23999"><rect width="16" height="16" rx="2"/></svg>'
            try {
              faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}`
            } catch (e) {
              // fallback icon
            }
            return `
              <div class="bookmark ${this.state.selected.has(bookmark.id) ? 'selected' : ''}" data-id="${bookmark.id}">
                <div class="checkbox"></div>
                <img src="${faviconUrl}" class="favicon">
                <div class="info">
                  <div class="title">${bookmark.title || 'Untitled'}</div>
                  <div class="meta">${bookmark.daysSinceVisit || 0}일째 미방문</div>
                </div>
                <button class="visit-btn" data-url="${bookmark.url}">→</button>
              </div>
            `
          }).join('')}
        </div>
        ${hasMore ? '<button class="load-more" id="loadMore">더보기</button>' : ''}
      </div>
    `
  }

  renderCategoryTiles() {
    const categories = this.getCategoryGroups()
    
    return `
      <div class="content">
        <div class="content-header">
          <h2>카테고리별 구조</h2>
          <select class="sort-dropdown" id="sortSelect">
            <option value="daysSinceVisit">오래된 순</option>
            <option value="category" selected>카테고리별</option>
            <option value="dateAdded">추가일순</option>
          </select>
        </div>
        <div class="category-grid">
          ${Object.entries(categories).map(([category, bookmarks]) => `
            <div class="category-tile" data-category="${category}">
              <div class="tile-icon">${this.getCategoryIcon(category)}</div>
              <div class="tile-title">${this.getCategoryName(category)}</div>
              <div class="tile-count">${bookmarks.length}개</div>
            </div>
          `).join('')}
        </div>
      </div>
    `
  }

  renderCategoryDetail() {
    const categoryBookmarks = this.state.bookmarks.filter(b => 
      (b.category || 'other') === this.state.selectedCategory
    )
    const displayBookmarks = categoryBookmarks.slice(0, this.state.displayCount)
    const hasMore = this.state.displayCount < categoryBookmarks.length

    return `
      <div class="content">
        <div class="content-header">
          <button class="back-btn" id="backBtn">← 카테고리</button>
          <h2>${this.getCategoryName(this.state.selectedCategory)}</h2>
          <button class="select-all-btn" id="selectAllBtn">
            ${this.isAllDisplayedSelected() ? '전체해제' : '전체선택'}
          </button>
        </div>
        <div class="bookmarks">
          ${displayBookmarks.map(bookmark => {
            let faviconUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="%23999"><rect width="16" height="16" rx="2"/></svg>'
            try {
              faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}`
            } catch (e) {
              // fallback icon
            }
            return `
              <div class="bookmark ${this.state.selected.has(bookmark.id) ? 'selected' : ''}" data-id="${bookmark.id}">
                <div class="checkbox"></div>
                <img src="${faviconUrl}" class="favicon">
                <div class="info">
                  <div class="title">${bookmark.title || 'Untitled'}</div>
                  <div class="meta">${bookmark.daysSinceVisit || 0}일째 미방문</div>
                </div>
                <button class="visit-btn" data-url="${bookmark.url}">→</button>
              </div>
            `
          }).join('')}
        </div>
        ${hasMore ? '<button class="load-more" id="loadMore">더보기</button>' : ''}
      </div>
    `
  }

  getCategoryGroups() {
    const groups = {}
    this.state.bookmarks.forEach(bookmark => {
      const category = bookmark.category || 'other'
      if (!groups[category]) groups[category] = []
      groups[category].push(bookmark)
    })
    return groups
  }

  getCategoryIcon(category) {
    const icons = {
      work: '💼',
      reference: '📖',
      design: '🎨',
      news: '📰',
      entertainment: '🎬',
      shopping: '🛒',
      learning: '📚',
      social: '💬',
      other: '🔖'
    }
    return icons[category] || '🔖'
  }

  getCategoryName(category) {
    const names = {
      work: '업무',
      reference: '자료',
      design: '디자인',
      news: '뉴스·트렌드',
      entertainment: '엔터테인먼트',
      shopping: '구매',
      learning: '교육·튜토리얼',
      social: '커뮤니티·SNS',
      other: '기타'
    }
    return names[category] || '기타'
  }

  async selectCategory(category) {
    this.state.selectedCategory = category
    this.state.viewMode = 'category-detail'
    this.state.displayCount = 5 // 리셋
    await this.render()
  }

  async goBackToCategories() {
    this.state.viewMode = 'categories'
    this.state.selectedCategory = null
    await this.render()
  }

  async loadMore() {
    if (this.state.viewMode === 'category-detail') {
      const categoryBookmarks = this.state.bookmarks.filter(b => 
        (b.category || 'other') === this.state.selectedCategory
      )
      this.state.displayCount = Math.min(
        this.state.displayCount + 5, 
        categoryBookmarks.length
      )
    } else {
      this.state.displayCount = Math.min(
        this.state.displayCount + 5, 
        this.state.bookmarks.length
      )
    }
    await this.render()
  }

  async scan() {
    const btn = this.elements.scanBtn
    const text = document.getElementById('scanText')
    
    btn.disabled = true
    text.textContent = '찾는 중...'
    
    try {
      await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'scan' }, resolve)
      })
      
      // Reset state
      this.state.selected.clear()
      this.state.displayCount = 5
      this.state.viewMode = 'list' // 리스트 뷰로 리셋
      this.state.selectedCategory = null
      this.cache.stats = null // Invalidate cache
      
      await this.loadData()
      await this.getStats() // Refresh stats
      await this.render()
      
      this.showToast(this.state.bookmarks.length > 0 
        ? `${this.state.bookmarks.length}개 발견` 
        : '모든 북마크 활성')
    } finally {
      btn.disabled = false
      text.textContent = '부활시킬 북마크 찾기'
    }
  }

  async bulkAction(action) {
    const selectedIds = Array.from(this.state.selected)
    if (!selectedIds.length) return

    const selectedBookmarks = this.state.bookmarks.filter(b => selectedIds.includes(b.id))
    
    if (action === 'keep') {
      await new Promise(resolve => {
        chrome.runtime.sendMessage({ 
          action: 'copyToGraveyard', 
          bookmarks: selectedBookmarks 
        }, resolve)
      })
    }

    // Update processed list
    selectedIds.forEach(id => this.state.processed.add(id))
    await chrome.storage.local.set({ 
      processedBookmarks: Array.from(this.state.processed) 
    })

    // Remove from display
    this.state.bookmarks = this.state.bookmarks.filter(b => !selectedIds.includes(b.id))
    this.state.selected.clear()
    this.state.displayCount = Math.min(this.state.displayCount, this.state.bookmarks.length)
    
    await this.render()
    this.showToast(`${selectedIds.length}개 ${action === 'keep' ? '구조' : '삭제'}`)
  }


  showToast(message) {
    const toast = document.createElement('div')
    toast.className = 'toast'
    toast.textContent = message
    document.body.appendChild(toast)
    
    setTimeout(() => toast.classList.add('show'), 10)
    setTimeout(() => {
      toast.classList.add('hide')
      setTimeout(() => toast.remove(), 300)
    }, 2000)
  }

  showSettings() {
    const modal = document.createElement('div')
    modal.className = 'modal'
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>설정</h3>
          <button class="close" id="closeModal">×</button>
        </div>
        <div class="modal-body">
          <div class="setting">
            <h4>저장일로부터 흘러간 시간</h4>
            <div class="time-period-selector">
              <div class="period-grid">
                ${[
                  { id: 'week1', label: '1주일', days: '1-7일' },
                  { id: 'week2', label: '2주일', days: '8-14일' },
                  { id: 'week3', label: '3주일', days: '15-21일' },
                  { id: 'month1', label: '1개월', days: '22-30일' },
                  { id: 'month6', label: '6개월', days: '1-6개월' },
                  { id: 'year1', label: '1년', days: '6-12개월' },
                  { id: 'year3', label: '3년', days: '1-3년' },
                  { id: 'year3plus', label: '3년+', days: '3년 이상' }
                ].map(period => `
                  <button type="button" class="period-option ${this.state.settings[period.id]?.enabled ? 'selected' : ''}" 
                          data-period="${period.id}">
                    <div class="period-label">${period.label}</div>
                    <div class="period-range">${period.days}</div>
                  </button>
                `).join('')}
              </div>
              <div class="period-summary">
                ${this.getSelectedPeriodsText()}
              </div>
            </div>
          </div>
          <div class="setting">
            <h4>이메일 알림</h4>
            <label>
              <input type="checkbox" id="emailNotifications" ${this.state.settings.emailNotifications ? 'checked' : ''}>
              알림 받기
            </label>
            <input type="email" id="userEmail" placeholder="이메일" value="${this.state.settings.userEmail || ''}">
            
            <div class="email-days-section ${this.state.settings.emailNotifications ? 'visible' : 'hidden'}">
              <h5>알림 요일</h5>
              <div class="days-selector">
                ${['일', '월', '화', '수', '목', '금', '토'].map((day, index) => `
                  <button type="button" class="day-btn ${(this.state.settings.emailDays || []).includes(index) ? 'selected' : ''}" 
                          data-day="${index}">
                    ${day}
                  </button>
                `).join('')}
              </div>
              
              <div class="time-selector-section">
                <h5>알림 시간</h5>
                <div class="time-selector">
                  <div class="time-presets">
                    ${['09:00', '12:00', '18:00', '21:00'].map(time => `
                      <button type="button" class="time-preset ${this.state.settings.emailTime === time ? 'selected' : ''}" 
                              data-time="${time}">
                        ${this.formatTimeDisplay(time)}
                      </button>
                    `).join('')}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="setting">
            <h4>AI 카테고리 분류</h4>
            <input type="password" id="openaiApiKey" placeholder="OpenAI API 키 (선택사항)" 
                   value="${this.state.settings.openaiApiKey || ''}">
            <div style="font-size: 11px; color: #98989d; margin-top: 4px;">
              더 정확한 개인화된 카테고리 분류를 위해 OpenAI API 키를 입력하세요
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="saveSettings">저장</button>
        </div>
      </div>
    `
    
    document.body.appendChild(modal)
    
    modal.addEventListener('click', e => {
      if (e.target.id === 'closeModal' || e.target === modal) {
        modal.remove()
      } else if (e.target.id === 'saveSettings') {
        this.saveSettings(modal)
      } else if (e.target.classList.contains('day-btn')) {
        this.toggleDaySelection(e.target)
      } else if (e.target.classList.contains('period-option') || e.target.closest('.period-option')) {
        const button = e.target.classList.contains('period-option') ? e.target : e.target.closest('.period-option')
        this.togglePeriodSelection(button, modal)
      } else if (e.target.classList.contains('time-preset')) {
        this.selectTimePreset(e.target, modal)
      }
    })

    // 이메일 알림 체크박스 변경 시 요일 섹션 표시/숨김
    modal.addEventListener('change', e => {
      if (e.target.id === 'emailNotifications') {
        const daysSection = modal.querySelector('.email-days-section')
        if (e.target.checked) {
          daysSection.classList.remove('hidden')
          daysSection.classList.add('visible')
        } else {
          daysSection.classList.remove('visible')
          daysSection.classList.add('hidden')
        }
      }
    })
  }

  toggleDaySelection(button) {
    button.classList.toggle('selected')
  }

  selectTimePreset(button, modal) {
    // Clear other preset selections
    modal.querySelectorAll('.time-preset').forEach(btn => btn.classList.remove('selected'))
    button.classList.add('selected')
  }


  togglePeriodSelection(button, modal) {
    button.classList.toggle('selected')
    
    // Update the summary text
    const summaryElement = modal.querySelector('.period-summary')
    if (summaryElement) {
      // Temporarily update settings state for display
      const periodId = button.dataset.period
      if (!this.tempSettings) this.tempSettings = {...this.state.settings}
      if (!this.tempSettings[periodId]) this.tempSettings[periodId] = {}
      this.tempSettings[periodId].enabled = button.classList.contains('selected')
      
      // Update summary with temp settings
      const originalSettings = this.state.settings
      this.state.settings = this.tempSettings
      summaryElement.textContent = this.getSelectedPeriodsText()
      this.state.settings = originalSettings
    }
  }

  getSelectedPeriodsText() {
    if (!this.state.settings) return '선택된 기간 없음'
    
    const selectedPeriods = []
    const periods = [
      { id: 'week1', label: '1주일' },
      { id: 'week2', label: '2주일' },
      { id: 'week3', label: '3주일' },
      { id: 'month1', label: '1개월' },
      { id: 'month6', label: '6개월' },
      { id: 'year1', label: '1년' },
      { id: 'year3', label: '3년' },
      { id: 'year3plus', label: '3년+' }
    ]

    periods.forEach(period => {
      if (this.state.settings[period.id]?.enabled) {
        selectedPeriods.push(period.label)
      }
    })

    if (selectedPeriods.length === 0) {
      return '선택된 기간 없음'
    } else if (selectedPeriods.length === 1) {
      return `${selectedPeriods[0]} 북마크 표시`
    } else {
      return `${selectedPeriods.length}개 기간 선택됨`
    }
  }

  formatTimeDisplay(time) {
    const [hour, minute] = time.split(':')
    const hourNum = parseInt(hour)
    
    if (hourNum === 9) return '오전 9시'
    if (hourNum === 12) return '정오 12시'
    if (hourNum === 18) return '오후 6시'
    if (hourNum === 21) return '오후 9시'
    
    if (hourNum < 12) {
      return `오전 ${hourNum}시`
    } else if (hourNum === 12) {
      return '정오 12시'
    } else {
      return `오후 ${hourNum - 12}시`
    }
  }

  saveSettings(modal) {
    const periodIds = ['week1', 'week2', 'week3', 'month1', 'month6', 'year1', 'year3', 'year3plus']
    const newSettings = {}
    
    // 모든 기간 설정 처리 (새로운 UI에서 선택된 것들)
    periodIds.forEach(periodId => {
      const periodButton = modal.querySelector(`[data-period="${periodId}"]`)
      newSettings[periodId] = { 
        ...this.state.settings[periodId], 
        enabled: periodButton ? periodButton.classList.contains('selected') : false
      }
    })
    
    // 기타 설정
    newSettings.emailNotifications = document.getElementById('emailNotifications').checked
    newSettings.userEmail = document.getElementById('userEmail').value
    newSettings.openaiApiKey = document.getElementById('openaiApiKey').value
    
    // 선택된 알림 요일 수집
    const selectedDays = Array.from(modal.querySelectorAll('.day-btn.selected')).map(btn => 
      parseInt(btn.dataset.day)
    )
    newSettings.emailDays = selectedDays
    
    // 알림 시간 설정 (선택된 프리셋에서)
    const selectedTimePreset = modal.querySelector('.time-preset.selected')
    newSettings.emailTime = selectedTimePreset ? selectedTimePreset.dataset.time : '09:00'
    
    chrome.runtime.sendMessage({ action: 'updateSettings', settings: newSettings }, async response => {
      if (response?.success) {
        // API 키가 변경된 경우 AI 캐시 초기화
        if (this.state.settings.openaiApiKey !== newSettings.openaiApiKey) {
          await chrome.storage.local.remove(['aiCategories', 'aiCategories_time'])
          console.log('🔄 AI 카테고리 캐시 초기화됨')
        }
        
        this.state.settings = newSettings
        // 설정 변경 후 상태 리셋 및 데이터 새로고침
        this.state.selected.clear() // 선택 상태 초기화
        this.state.viewMode = 'list'
        this.state.selectedCategory = null
        this.state.displayCount = 5
        await this.loadData()
        await this.render()
        this.showToast('설정 저장됨')
        modal.remove()
      } else {
        this.showToast('저장 실패')
      }
    })
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.bookmarkManager = new BookmarkManager()
  window.bookmarkManager.init()
})