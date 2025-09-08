// Google-grade Performance & Apple Design Philosophy
class BookmarkManager {
  constructor() {
    this.state = {
      bookmarks: [],
      processed: new Set(),
      selected: new Set(),
      displayCount: 5,
      settings: null,
      sortBy: 'daysSinceVisit', // 기본 정렬 (오래된순)
      sortOrder: 'desc', // 'asc' or 'desc'
      viewMode: 'list', // 'list' 또는 'categories'
      isLoading: false,
      loadingMessage: ''
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
    
    try {
      await this.loadData()
      console.log('Data loaded, bookmarks:', this.state.bookmarks.length)
      
      this.cacheElements()
      console.log('Elements cached')
      
      this.bindEvents()
      console.log('Events bound')
      
      await this.render()
      console.log('Initial render complete')
      
      this.isInitialized = true
      console.log('BookmarkManager initialized successfully')
    } catch (error) {
      console.error('Error during initialization:', error)
      throw error
    }
  }


  setLoadingState(isLoading, message = '') {
    this.state.isLoading = isLoading
    this.state.loadingMessage = message
    
    if (isLoading) {
      this.showLoadingOverlay(message)
    } else {
      this.hideLoadingOverlay()
    }
  }

  showLoadingOverlay(message) {
    const existing = document.getElementById('loadingOverlay')
    if (existing) return
    
    const overlay = document.createElement('div')
    overlay.id = 'loadingOverlay'
    overlay.className = 'loading-overlay'
    overlay.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <div class="loading-message">${message}</div>
      </div>
    `
    document.body.appendChild(overlay)
  }

  hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay')
    if (overlay) {
      overlay.remove()
    }
  }

  getCategoryInfo(category) {
    if (typeof BookmarkUtils !== 'undefined') {
      const icon = BookmarkUtils.getCategoryIcon(category)
      const name = BookmarkUtils.getCategoryName(category)
      return `${icon} ${name}`
    }
    // Fallback if BookmarkUtils is not available
    const fallbackCategories = {
      work: '💼 업무',
      reference: '📖 참고자료',
      design: '🎨 디자인',
      news: '📰 뉴스',
      entertainment: '🎬 엔터테인먼트',
      shopping: '🛒 쇼핑',
      learning: '📚 공부',
      social: '💬 소셜',
      development: '💻 개발',
      finance: '💰 금융',
      government: '🏛️ 공공',
      other: '🔖 기타'
    }
    return fallbackCategories[category] || '🔖 기타'
  }

  cacheElements() {
    this.elements = {
      content: document.getElementById('content'),
      actionBar: null // Will be set after render
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
      try {
        chrome.runtime.sendMessage({ action: 'getStats' }, response => {
          if (chrome.runtime.lastError) {
            console.error('Stats API 오류:', chrome.runtime.lastError.message)
            this.showToast('통계 정보를 가져올 수 없습니다')
            resolve({ graveyardCount: 0 })
            return
          }
          this.cache.stats = response || { graveyardCount: 0 }
          this.cache.statsTime = now
          resolve(this.cache.stats)
        })
      } catch (error) {
        console.error('통계 정보 오류:', error)
        this.showToast('통계 정보를 가져올 수 없습니다')
        resolve({ graveyardCount: 0 })
      }
    })
  }

  async getProcessedBookmarks() {
    try {
      const result = await chrome.storage.local.get('processedBookmarks')
      return result.processedBookmarks || []
    } catch (error) {
      console.error('처리된 북마크 로드 오류:', error)
      this.showToast('북마크 데이터를 불러올 수 없습니다')
      return []
    }
  }

  async getPendingBookmarks() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get('pendingBookmarks', result => {
          if (chrome.runtime.lastError) {
            console.error('미사용 북마크 로드 오류:', chrome.runtime.lastError.message)
            this.showToast('북마크 데이터를 불러올 수 없습니다')
            resolve([])
            return
          }
          resolve(result.pendingBookmarks || [])
        })
      } catch (error) {
        console.error('미사용 북마크 오류:', error)
        this.showToast('북마크 데이터를 불러올 수 없습니다')
        resolve([])
      }
    })
  }

  async getSettings() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'getSettings' }, response => {
        resolve(response?.settings || {})
      })
    })
  }

  async render(forceFullRender = false) {
    try {
      console.log('Rendering, viewMode:', this.state.viewMode, 'bookmarks:', this.state.bookmarks.length, 'forceFullRender:', forceFullRender)
      const stats = await this.getStats()

      // 20의 배수 달성 시 축하 팝업 표시
      await this.checkMilestoneAchievement(stats.graveyardCount)

      if (!this.elements.content) {
        console.error('Content element not found!')
        return
      }

      // 부분 업데이트가 가능한 경우에만 사용
      if (!forceFullRender && this.canPartialUpdate()) {
        this.updateContentOnly(stats)
        return
      }

      this.elements.content.innerHTML = `
      <!-- Header -->
      <div class="header">
        <div class="header-left">
          <h1 class="app-title">🧹 북마크 청소부</h1>
        </div>
        <div class="header-center">
          <div class="stats" role="region" aria-label="북마크 통계">
            <div class="stat">
              <div class="number" aria-label="청소된 북마크 ${this.formatCount(stats.graveyardCount)}개">${this.formatCount(stats.graveyardCount)}</div>
              <div class="label">청소됨</div>
            </div>
            <div class="stat">
              <div class="number" aria-label="정리 대상 북마크 ${this.state.bookmarks.length > 10 ? '10개 이상' : this.state.bookmarks.length + '개'}">${this.state.bookmarks.length > 10 ? '10+' : this.state.bookmarks.length}</div>
              <div class="label">정리 대상</div>
            </div>
          </div>
        </div>
        <div class="header-right">
          <button class="settings-btn" id="settingsBtn" aria-label="설정 열기" title="설정">⚙️</button>
        </div>
      </div>

      <!-- Main Interface -->
      ${this.state.bookmarks.length ? this.renderMainInterface() : this.renderEmptyState()}

      <!-- Action Bar -->
      <div class="action-bar ${this.state.selected.size ? 'show' : ''}" id="actionBar">
        <span>${this.state.selected.size}개 선택</span>
        <div class="actions">
          <button class="action keep" id="keepBtn" ${!this.state.selected.size ? 'disabled' : ''}>청소함</button>
          <button class="action delete" id="deleteBtn" ${!this.state.selected.size ? 'disabled' : ''}>삭제</button>
        </div>
      </div>
    `

      // Cache new elements
      this.elements.actionBar = document.getElementById('actionBar')
      
      // 마지막 viewMode 저장 (전체 렌더링 후)
      this._lastViewMode = this.state.viewMode
      
      console.log('Render completed')
    } catch (error) {
      console.error('Render error:', error)
      this.elements.content.innerHTML = '<div style="padding: 20px; color: red;">렌더링 오류가 발생했습니다.</div>'
    }
  }

  bindEvents() {
    // Single delegation for all clicks
    document.addEventListener('click', this.handleClick.bind(this))
    
    // 키보드 네비게이션 이벤트
    document.addEventListener('keydown', this.handleKeyDown.bind(this))
    
    // 툴팁 이벤트
    document.addEventListener('mouseover', this.handleMouseOver.bind(this))
    document.addEventListener('mouseout', this.handleMouseOut.bind(this))
    
    // 정렬은 항상 오래된 순으로 고정
  }

  handleMouseOver(e) {
    const bookmark = e.target.closest('.bookmark')
    if (bookmark && bookmark.dataset.tooltip) {
      this.showTooltip(e, bookmark.dataset.tooltip)
    }
  }

  handleMouseOut(e) {
    const bookmark = e.target.closest('.bookmark')
    if (bookmark) {
      this.hideTooltip()
    }
  }

  showTooltip(e, text) {
    this.hideTooltip() // Remove existing tooltip
    
    const tooltip = document.createElement('div')
    tooltip.id = 'hover-tooltip'
    tooltip.className = 'tooltip'
    tooltip.innerHTML = text.replace(/\\n/g, '<br>')
    
    document.body.appendChild(tooltip)
    
    // Position tooltip
    const rect = e.target.closest('.bookmark').getBoundingClientRect()
    const tooltipRect = tooltip.getBoundingClientRect()
    
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2
    let top = rect.top - tooltipRect.height - 8
    
    // Adjust if tooltip goes off-screen
    if (left < 8) left = 8
    if (left + tooltipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tooltipRect.width - 8
    }
    if (top < 8) {
      top = rect.bottom + 8
    }
    
    tooltip.style.left = `${left}px`
    tooltip.style.top = `${top}px`
    tooltip.classList.add('show')
  }

  hideTooltip() {
    const tooltip = document.getElementById('hover-tooltip')
    if (tooltip) {
      tooltip.remove()
    }
  }

  handleKeyDown(e) {
    const focusedElement = document.activeElement
    
    // 스페이스바나 엔터키로 체크박스 토글
    if ((e.key === ' ' || e.key === 'Enter') && focusedElement.classList.contains('checkbox')) {
      e.preventDefault()
      const bookmark = focusedElement.closest('.bookmark')
      if (bookmark) {
        focusedElement.classList.add('checkbox-clicked')
        setTimeout(() => focusedElement.classList.remove('checkbox-clicked'), 150)
        this.toggleSelect(bookmark.dataset.id)
      }
      return
    }
    
    // 스페이스바로 북마크 선택/해제
    if (e.key === ' ' && focusedElement.classList.contains('bookmark')) {
      e.preventDefault()
      this.toggleSelect(focusedElement.dataset.id)
      return
    }

    // 엔터키로 북마크 방문
    if (e.key === 'Enter' && focusedElement.classList.contains('bookmark')) {
      e.preventDefault()
      const url = focusedElement.querySelector('.visit-btn').dataset.url
      if (url) {
        chrome.tabs.create({ url })
      }
      return
    }

    // 화살표 키로 북마크 간 네비게이션
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && focusedElement.classList.contains('bookmark')) {
      e.preventDefault()
      const bookmarks = Array.from(document.querySelectorAll('.bookmark'))
      const currentIndex = bookmarks.indexOf(focusedElement)
      
      let nextIndex
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex + 1 < bookmarks.length ? currentIndex + 1 : 0
      } else {
        nextIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : bookmarks.length - 1
      }
      
      bookmarks[nextIndex].focus()
      return
    }

    // ESC 키로 선택 해제
    if (e.key === 'Escape') {
      this.state.selected.clear()
      this.updateUI()
      return
    }

    // Ctrl+A로 전체 선택
    if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      this.toggleSelectAll()
      return
    }
  }

  async handleClick(e) {
    const { target } = e
    
    if (target.id === 'settingsBtn') {
      this.showSettings()
    } else if (target.id === 'loadMore') {
      await this.loadMore()
    } else if (target.id === 'keepBtn') {
      await this.confirmAndExecute('keep')
    } else if (target.id === 'deleteBtn') {
      await this.confirmAndExecute('delete')
    } else if (target.classList.contains('visit-btn') || target.classList.contains('item-action-btn')) {
      const url = target.dataset.url || target.getAttribute('data-url')
      if (url) {
        chrome.tabs.create({ url: url })
      }
    } else if (target.classList.contains('category-tile') || target.closest('.category-tile')) {
      const tile = target.classList.contains('category-tile') ? target : target.closest('.category-tile')
      await this.selectCategory(tile.dataset.category)
    } else if (target.id === 'backBtn') {
      await this.goBackToCategories()
    } else if (target.id === 'sortToggleBtn') {
      this.toggleSort()
    } else if (target.id === 'selectAllBtn') {
      this.toggleSelectAll()
    } else if (target.classList.contains('sort-toggle')) {
      // 정렬 순서 토글 처리
      console.log('Sort toggle clicked, current sortBy:', this.state.sortBy, 'current sortOrder:', this.state.sortOrder)
      if (this.state.sortBy !== 'category') {
        this.state.sortOrder = this.state.sortOrder === 'desc' ? 'asc' : 'desc'
        console.log('New sortOrder:', this.state.sortOrder)
        this.sortBookmarks()
        await this.render()
      }
    } else if (target.id === 'listViewTab' || target.dataset.view === 'list') {
      await this.switchToListView()
    } else if (target.id === 'categoriesViewTab' || target.dataset.view === 'categories') {
      await this.switchToCategoriesView()
    } else if (target.classList.contains('view-tab')) {
      // Handle view tab clicks
      const view = target.dataset.view
      if (view === 'list') {
        await this.switchToListView()
      } else if (view === 'categories') {
        await this.switchToCategoriesView()
      }
    } else if (target.classList.contains('category-card') || target.closest('.category-card')) {
      const card = target.classList.contains('category-card') ? target : target.closest('.category-card')
      await this.selectCategory(card.dataset.category)
    } else if (target.dataset.action === 'back-to-categories') {
      await this.goBackToCategories()
    } else if (target.classList.contains('checkbox-wrapper') || target.classList.contains('custom-checkbox') || target.closest('.bookmark-item')) {
      const bookmarkItem = target.closest('.bookmark-item') || target.closest('.bookmark')
      if (bookmarkItem && !target.classList.contains('visit-btn') && !target.classList.contains('item-action-btn')) {
        // Add visual feedback for checkbox clicks
        const checkbox = bookmarkItem.querySelector('.custom-checkbox')
        if (checkbox) {
          checkbox.classList.add('checkbox-clicked')
          setTimeout(() => checkbox.classList.remove('checkbox-clicked'), 150)
        }
        this.toggleSelect(bookmarkItem.dataset.id)
      }
    }
  }

  toggleSelect(id) {
    const wasSelected = this.state.selected.has(id)
    
    if (wasSelected) {
      this.state.selected.delete(id)
    } else {
      this.state.selected.add(id)
    }
    
    this.updateUI()
    
    // Provide subtle feedback for selection changes
    const totalSelected = this.state.selected.size
    if (totalSelected > 0 && !wasSelected) {
      // Show brief toast for first selection or milestone selections
      if (totalSelected === 1) {
        this.showToast('북마크 선택됨', 'info', 1500)
      } else if (totalSelected % 10 === 0) {
        this.showToast(`${totalSelected}개 선택됨`, 'info', 1500)
      }
    }
  }

  async switchToListView() {
    // Show loading state for view transition
    const hideLoading = this.showLoadingState('목록으로 전환 중...')
    
    try {
      this.state.viewMode = 'list'
      this.state.selectedCategory = null
      this.state.displayCount = 5
      this.state.selected.clear()
      await this.render(true)
      
      this.showToast('목록 보기로 전환했습니다', 'info', 2000)
    } finally {
      hideLoading()
    }
  }

  async switchToCategoriesView() {
    // Show loading state for view transition  
    const hideLoading = this.showLoadingState('카테고리 보기로 전환 중...')
    
    try {
      this.state.viewMode = 'categories'
      this.state.selectedCategory = null
      this.state.displayCount = 5
      this.state.selected.clear()
      await this.render(true)
      
      this.showToast('카테고리 보기로 전환했습니다', 'info', 2000)
    } finally {
      hideLoading()
    }
  }

  toggleSort() {
    const oldOrder = this.state.sortOrder
    this.state.sortOrder = this.state.sortOrder === 'desc' ? 'asc' : 'desc'
    const newOrderText = this.state.sortOrder === 'desc' ? '오래된 순' : '최신 순'
    
    this.sortBookmarks()
    this.render()
    
    // Provide feedback for sort change
    this.showToast(`${newOrderText}으로 정렬했습니다`, 'info', 2000)
  }

  toggleSelectAll() {
    const displayBookmarks = this.getCurrentDisplayBookmarks()
    const allSelected = this.isAllDisplayedSelected()
    
    if (allSelected) {
      // 전체 해제
      displayBookmarks.forEach(bookmark => {
        this.state.selected.delete(bookmark.id)
      })
      this.showToast('전체 선택 해제했습니다', 'info', 2000)
    } else {
      // 전체 선택
      displayBookmarks.forEach(bookmark => {
        this.state.selected.add(bookmark.id)
      })
      this.showToast(`${displayBookmarks.length}개 북마크를 모두 선택했습니다`, 'success', 2500)
    }
    
    this.updateUI()
  }

  updateUI() {
    // Update only changed elements - no full re-render
    const selectedCount = this.state.selected.size
    
    // Update bookmarks selection state for both old and new structures
    document.querySelectorAll('.bookmark, .bookmark-item').forEach(el => {
      const isSelected = this.state.selected.has(el.dataset.id)
      el.classList.toggle('selected', isSelected)
      
      // Update checkbox visual state
      const checkbox = el.querySelector('.custom-checkbox')
      if (checkbox) {
        checkbox.classList.toggle('checked', isSelected)
        checkbox.textContent = isSelected ? '✓' : ''
      }
      
      // Update aria attributes
      const checkboxWrapper = el.querySelector('.checkbox-wrapper, .checkbox')
      if (checkboxWrapper) {
        checkboxWrapper.setAttribute('aria-checked', isSelected)
      }
    })

    // Update action bar
    if (this.elements.actionBar) {
      this.elements.actionBar.classList.toggle('show', selectedCount > 0)
      const span = this.elements.actionBar.querySelector('span')
      if (span) {
        span.textContent = `${selectedCount}개 선택`
      }
    }
    
    const keepBtn = document.getElementById('keepBtn')
    const deleteBtn = document.getElementById('deleteBtn')
    if (keepBtn) keepBtn.disabled = !selectedCount
    if (deleteBtn) deleteBtn.disabled = !selectedCount

    // Update select all button text
    const selectAllBtn = document.getElementById('selectAllBtn')
    if (selectAllBtn) {
      selectAllBtn.textContent = this.isAllDisplayedSelected() ? '✅ 전체해제' : '☑️ 전체선택'
    }
  }

  canPartialUpdate() {
    // 부분 업데이트가 가능한 조건들
    const hasExistingContent = document.querySelector('.content')
    const hasBookmarksList = document.querySelector('.bookmarks')
    const isSameViewMode = this._lastViewMode === this.state.viewMode
    
    return hasExistingContent && hasBookmarksList && isSameViewMode
  }

  async updateContentOnly(stats) {
    // 헤더 스탯만 업데이트
    const graveyardCountEl = document.querySelector('.header .stat .number')
    const pendingCountEl = document.querySelectorAll('.header .stat .number')[1]
    
    if (graveyardCountEl) {
      graveyardCountEl.textContent = this.formatCount(stats.graveyardCount)
    }
    if (pendingCountEl) {
      pendingCountEl.textContent = this.state.bookmarks.length > 10 ? '10+' : this.state.bookmarks.length
    }

    // 북마크 목록만 업데이트 (viewMode에 따라)
    const bookmarksContainer = document.querySelector('.bookmarks')
    if (bookmarksContainer && (this.state.viewMode === 'list' || this.state.viewMode === 'category-detail')) {
      const displayBookmarks = this.getCurrentDisplayBookmarks()
      if (this.state.viewMode === 'list') {
        bookmarksContainer.innerHTML = this.renderBookmarksList(displayBookmarks)
      } else if (this.state.viewMode === 'category-detail') {
        // 카테고리 상세 뷰용 북마크 렌더링
        bookmarksContainer.innerHTML = displayBookmarks.map(bookmark => {
          let faviconUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="%23999"><rect width="16" height="16" rx="2"/></svg>'
          try {
            faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}`
          } catch (e) {
            // fallback icon
          }
          return `
            <div class="bookmark ${this.state.selected.has(bookmark.id) ? 'selected' : ''}" data-id="${bookmark.id}">
              <div class="checkbox" role="checkbox" 
                   aria-checked="${this.state.selected.has(bookmark.id) ? 'true' : 'false'}" 
                   aria-label="${bookmark.title} 선택" 
                   tabindex="0">
              </div>
              <img src="${faviconUrl}" class="favicon">
              <div class="info">
                <div class="title">${bookmark.title || 'Untitled'}</div>
                <div class="meta">${bookmark.daysSinceAdded || 0}일 전 저장</div>
              </div>
              <button class="visit-btn" data-url="${bookmark.url}">↗</button>
            </div>
          `
        }).join('')
      }
    }

    // 더보기 버튼 업데이트
    const loadMoreBtn = document.getElementById('loadMore')
    const hasMore = this.state.viewMode === 'category-detail' 
      ? this.state.displayCount < this.state.bookmarks.filter(b => (b.category || 'other') === this.state.selectedCategory).length
      : this.state.displayCount < this.state.bookmarks.length
    
    if (loadMoreBtn) {
      loadMoreBtn.style.display = hasMore ? 'block' : 'none'
    }
    
    // 마지막 viewMode 저장
    this._lastViewMode = this.state.viewMode
  }

  renderBookmarksList(bookmarks) {
    return bookmarks.map(bookmark => {
      let faviconUrl = 'data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill=\"%23999\"><rect width=\"16\" height=\"16\" rx=\"2\"/></svg>'
      try {
        faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}`
      } catch (e) {
        // fallback icon
      }
      
      const isSelected = this.state.selected.has(bookmark.id)
      const ariaLabel = `${bookmark.title}, ${bookmark.daysSinceAdded || 0}일 전 저장, ${BookmarkUtils.getCategoryName(bookmark.category || 'other')} 카테고리${isSelected ? ', 선택됨' : ''}`
      
      return `
        <div class=\"bookmark ${isSelected ? 'selected' : ''}\" 
             data-id=\"${bookmark.id}\"
             tabindex=\"0\"
             role=\"option\"
             aria-selected=\"${isSelected}\"
             aria-label=\"${ariaLabel}\">
          <div class=\"checkbox\" aria-hidden=\"true\"></div>
          <img class=\"favicon\" src=\"${faviconUrl}\" alt=\"\" role=\"presentation\">
          <div class=\"info\">
            <div class=\"title\">${bookmark.title}</div>
            <div class=\"meta\">
              <span>${bookmark.daysSinceAdded || 0}일 전 저장</span>
              <span aria-hidden=\"true\">•</span>
              <span>${BookmarkUtils.getCategoryName(bookmark.category || 'other')}</span>
            </div>
          </div>
          <button class=\"visit-btn\" data-url=\"${bookmark.url}\" aria-label=\"${bookmark.title} 방문하기\" title=\"북마크 방문\">↗</button>
        </div>
      `
    }).join('')
  }

  sortBookmarks() {
    const isAsc = this.state.sortOrder === 'asc'
    
    switch (this.state.sortBy) {
      case 'daysSinceVisit':
        this.state.bookmarks.sort((a, b) => {
          const aValue = a.daysSinceVisit || 0
          const bValue = b.daysSinceVisit || 0
          const diff = bValue - aValue
          return isAsc ? -diff : diff
        })
        break
      case 'category':
        this.state.bookmarks.sort((a, b) => {
          const categoryA = a.category || 'other'
          const categoryB = b.category || 'other'
          if (categoryA === categoryB) {
            const aValue = a.daysSinceVisit || 0
            const bValue = b.daysSinceVisit || 0
            return bValue - aValue
          }
          return categoryA.localeCompare(categoryB)
        })
        break
    }
  }

  getCurrentDisplayBookmarks() {
    if (this.state.viewMode === 'category-detail') {
      const categoryBookmarks = this.state.bookmarks.filter(b => 
        (b.category || 'other') === this.state.selectedCategory
      )
      return categoryBookmarks.slice(0, this.state.displayCount)
    }
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
    if (this.state.settings.year1?.enabled) enabledPeriods.push({ min: 181, max: 999999 })
    
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
            보관되었으니 당신에게 많은 도움을 주고 싶어요!
          </p>
          <div class="milestone-count">${count}개 북마크 보관 달성</div>
          <div class="milestone-actions">
            <button class="milestone-btn primary" id="viewRescuedBtn">보관한 북마크 보러가기</button>
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
      // 보관된 북마크 폴더 찾기
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
          bookmark.category = BookmarkUtils.categorizeBookmark(bookmark)
          bookmark.aiEnhanced = false
        }
      })

    } catch (error) {
      console.error('AI 카테고리 분석 실패:', error)
      // fallback: 기존 룰 기반 분류
      this.state.bookmarks.forEach(bookmark => {
        bookmark.category = BookmarkUtils.categorizeBookmark(bookmark)
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



  // Nielsen's Heuristics Applied: Complete UX Redesign
  renderMainInterface() {
    return `
      ${this.renderMainContent()}
    `
  }

  // 1. System Status - Nielsen's Heuristic #1: Visibility of system status
  renderSystemStatus() {
    const totalBookmarks = this.state.bookmarks.length
    const selectedCount = this.state.selected.size
    const categories = Object.keys(this.getCategoryGroups()).length
    
    return `
      <div class="system-status">
        <div class="status-overview">
          <div class="status-primary">
            <span class="status-number">${totalBookmarks}</span>
            <span class="status-label">정리 대상</span>
          </div>
          <div class="status-meta">
            <span class="meta-item">${categories}개 카테고리</span>
            ${selectedCount > 0 ? `<span class="meta-selected">${selectedCount}개 선택됨</span>` : ''}
          </div>
        </div>
      </div>
    `
  }

  // 2. Primary Navigation - Nielsen's Heuristic #4: Consistency and standards
  renderPrimaryNavigation() {
    // 브레드크럼 내비게이션 (Nielsen's Heuristic #3: User control and freedom)
    let breadcrumb = ''
    if (this.state.viewMode === 'category-detail') {
      const categoryName = BookmarkUtils.getCategoryName(this.state.selectedCategory)
      const categoryIcon = BookmarkUtils.getCategoryIcon(this.state.selectedCategory)
      breadcrumb = `
        <div class="breadcrumb">
          <button class="breadcrumb-item clickable" data-action="back-to-categories">
            <span class="breadcrumb-icon">🏠</span>
            <span>카테고리</span>
          </button>
          <span class="breadcrumb-separator">></span>
          <span class="breadcrumb-current">
            <span class="category-icon">${categoryIcon}</span>
            <span>${categoryName}</span>
          </span>
        </div>
      `
    }
    
    return `
      <nav class="primary-nav">
        ${breadcrumb}
        <div class="view-selector">
          <div class="view-tabs" role="tablist">
            <button class="view-tab ${this.state.viewMode === 'list' || this.state.viewMode === 'category-detail' ? 'active' : ''}" 
                    data-view="list" role="tab" aria-selected="${this.state.viewMode === 'list' || this.state.viewMode === 'category-detail'}">
              <span class="tab-icon">📋</span>
              <span class="tab-label">목록</span>
            </button>
            <button class="view-tab ${this.state.viewMode === 'categories' ? 'active' : ''}" 
                    data-view="categories" role="tab" aria-selected="${this.state.viewMode === 'categories'}">
              <span class="tab-icon">🗂️</span>
              <span class="tab-label">카테고리</span>
            </button>
          </div>
        </div>
      </nav>
    `
  }

  // 3. Main Content with proper hierarchy
  renderMainContent() {
    switch (this.state.viewMode) {
      case 'categories':
        return this.renderCategoryOverview()
      case 'category-detail':
        return this.renderCategoryDetailView()
      case 'list':
      default:
        return this.renderBookmarkListView()
    }
  }

  // 4. Category Overview - Nielsen's Heuristic #6: Recognition rather than recall
  renderCategoryOverview() {
    const categories = this.getCategoryGroups()
    
    return `
      <div class="content-area" role="main">
        <div class="content-controls">
          <div class="view-toggle">
            <div class="view-tabs compact" role="tablist">
              <button class="view-tab" data-view="list" role="tab">
                <span class="tab-icon">📋</span>
                <span class="tab-label">목록</span>
              </button>
              <button class="view-tab active" data-view="categories" role="tab">
                <span class="tab-icon">🗂️</span>
                <span class="tab-label">카테고리</span>
              </button>
            </div>
          </div>
          <div class="control-actions">
            <select class="sort-select" id="sortSelect" aria-label="정렬 방식 선택">
              <option value="count">많은 순</option>
              <option value="name">이름순</option>
            </select>
          </div>
        </div>
        
        <div class="categories-grid" role="grid">
          ${Object.entries(categories)
            .sort(([,a], [,b]) => b.length - a.length) // 개수 순 정렬
            .map(([category, bookmarks]) => `
            <div class="category-card" data-category="${category}" role="gridcell" tabindex="0">
              <div class="card-icon">${BookmarkUtils.getCategoryIcon(category)}</div>
              <div class="card-content">
                <h3 class="card-title">${BookmarkUtils.getCategoryName(category)}</h3>
                <div class="card-meta">
                  <span class="bookmark-count">${bookmarks.length}개</span>
                  <span class="avg-age">${this.getAverageAge(bookmarks)} 평균</span>
                </div>
              </div>
              <div class="card-action">
                <button class="card-btn" aria-label="${BookmarkUtils.getCategoryName(category)} 카테고리 보기">→</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `
  }

  // 5. Category Detail View - Nielsen's Heuristic #8: Aesthetic and minimalist design  
  renderCategoryDetailView() {
    const categoryBookmarks = this.state.bookmarks.filter(b => 
      (b.category || 'other') === this.state.selectedCategory
    )
    const displayBookmarks = categoryBookmarks.slice(0, this.state.displayCount)
    const hasMore = this.state.displayCount < categoryBookmarks.length
    const categoryName = BookmarkUtils.getCategoryName(this.state.selectedCategory)
    
    return `
      <div class="content-area" role="main">
        <div class="content-controls">
          <div class="view-toggle">
            <button class="back-btn" data-action="back-to-categories">
              ← ${categoryName}
            </button>
          </div>
          <div class="control-actions">
            <button class="action-btn secondary" id="sortToggleBtn" title="정렬 변경">
              ${this.state.sortOrder === 'desc' ? '📅→🕒' : '🕒→📅'}
            </button>
            <button class="action-btn primary" id="selectAllBtn">
              ${this.isAllDisplayedSelected() ? '✅ 전체해제' : '☑️ 전체선택'}
            </button>
          </div>
        </div>
        
        <div class="bookmarks-list" role="list">
          ${displayBookmarks.map(bookmark => this.renderBookmarkItem(bookmark)).join('')}
        </div>
        
        ${hasMore ? `
          <div class="load-more-section">
            <button class="load-more-btn" id="loadMore">
              ${Math.min(5, categoryBookmarks.length - this.state.displayCount)}개 더 보기
            </button>
          </div>
        ` : ''}
      </div>
    `
  }

  // 6. Bookmark List View - Nielsen's Heuristic #7: Flexibility and efficiency of use
  renderBookmarkListView() {
    const displayBookmarks = this.getCurrentDisplayBookmarks()
    const hasMore = this.state.displayCount < this.state.bookmarks.length
    const totalCount = this.state.bookmarks.length

    return `
      <div class="content-area" role="main">
        <div class="content-controls">
          <div class="view-toggle">
            <div class="view-tabs compact" role="tablist">
              <button class="view-tab active" data-view="list" role="tab">
                <span class="tab-icon">📋</span>
                <span class="tab-label">목록</span>
              </button>
              <button class="view-tab" data-view="categories" role="tab">
                <span class="tab-icon">🗂️</span>
                <span class="tab-label">카테고리</span>
              </button>
            </div>
          </div>
          <div class="control-actions">
            <button class="action-btn secondary" id="sortToggleBtn" title="정렬 변경">
              ${this.state.sortOrder === 'desc' ? '📅→🕒' : '🕒→📅'}
            </button>
            <button class="action-btn primary" id="selectAllBtn">
              ${this.isAllDisplayedSelected() ? '✅ 전체해제' : '☑️ 전체선택'}
            </button>
          </div>
        </div>
        
        <div class="bookmarks-list" role="list">
          ${displayBookmarks.map(bookmark => this.renderBookmarkItem(bookmark)).join('')}
        </div>
        
        ${hasMore ? `
          <div class="load-more-section">
            <button class="load-more-btn" id="loadMore">
              ${Math.min(5, totalCount - this.state.displayCount)}개 더 보기
            </button>
          </div>
        ` : ''}
      </div>
    `
  }

  renderEmptyState() {
    const hasNeverScanned = !this.state.settings || Object.values(this.state.settings).every(s => !s.enabled)
    const hasScannedBefore = this.cache.stats && this.cache.stats.lastScanDate

    if (hasNeverScanned) {
      return `
        <div class="empty">
          <div class="icon">📊</div>
          <div class="title">청소할 북마크 범위를 설정하세요</div>
          <div class="text">오른쪽 상단 설정(⚙️) 버튼을 눌러<br>청소할 북마크 기간을 선택하세요</div>
          <div class="encouragement">
            <div class="tip">🧹 미사용 북마크를 깔끔하게 정리해보세요</div>
          </div>
        </div>
      `
    } else if (hasScannedBefore) {
      return `
        <div class="empty">
          <div class="icon">✨</div>
          <div class="title">청소할 북마크가 없어요!</div>
          <div class="text">선택한 기간에 청소할 북마크가 없습니다.<br>다른 기간으로 설정해보세요.</div>
          <div class="encouragement">
            <div class="stats-summary">
              🧹 총 ${this.cache.stats.graveyardCount || 0}개 북마크 청소됨
            </div>
            <div class="tip">🗓️ 다른 기간으로 설정하거나 나중에 다시 청소해보세요</div>
          </div>
        </div>
      `
    } else {
      return `
        <div class="empty">
          <div class="icon">🎯</div>
          <div class="title">정리할 북마크가 없어요</div>
          <div class="text">훌륭합니다! 모든 북마크를 잘 관리하고 계시네요</div>
          <div class="encouragement">이대로 쭉 유지해보세요 💪</div>
        </div>
      `
    }
  }

  renderCategoriesView() {
    // 카테고리별로 북마크 그룹화
    const categoryGroups = {}
    this.state.bookmarks.forEach(bookmark => {
      const category = bookmark.category || 'other'
      if (!categoryGroups[category]) {
        categoryGroups[category] = []
      }
      categoryGroups[category].push(bookmark)
    })

    const categories = Object.keys(categoryGroups).sort()
    
    if (categories.length === 0) {
      return this.renderEmptyState()
    }

    return `
      <div class="content">
        <div class="categories-grid">
          ${categories.map(category => {
            const count = categoryGroups[category].length
            const icon = this.getCategoryInfo(category).split(' ')[0]
            const name = this.getCategoryInfo(category).split(' ').slice(1).join(' ')
            
            return `
              <div class="category-tile" data-category="${category}">
                <div class="category-icon">${icon}</div>
                <div class="category-name">${name}</div>
                <div class="category-count">${count}개</div>
              </div>
            `
          }).join('')}
        </div>
      </div>
    `
  }

  renderCategoryDetail() {
    const categoryBookmarks = this.state.bookmarks.filter(b => 
      (b.category || 'other') === this.state.selectedCategory
    ).slice(0, this.state.displayCount)

    const categoryInfo = this.getCategoryInfo(this.state.selectedCategory)
    const totalCount = this.state.bookmarks.filter(b => 
      (b.category || 'other') === this.state.selectedCategory
    ).length

    return `
      <div class="content">
        <div class="category-header">
          <button class="back-btn" id="backBtn">← 뒤로</button>
          <div class="category-title">
            <span class="category-info">${categoryInfo}</span>
            <span class="category-total">${totalCount}개</span>
          </div>
        </div>
        <div class="list-controls">
          <button class="select-all-btn" id="selectAllBtn">
            ${this.isAllDisplayedSelected() ? '전체해제' : '전체선택'}
          </button>
        </div>
        <div class="bookmarks">
          ${this.renderBookmarksList(categoryBookmarks)}
        </div>
        ${totalCount > this.state.displayCount ? `
          <div class="load-more">
            <button id="loadMore" class="load-more-btn">더보기 (${Math.min(5, totalCount - this.state.displayCount)}개 더)</button>
          </div>
        ` : ''}
      </div>
    `
  }

  renderBookmarkList() {
    const displayBookmarks = this.getCurrentDisplayBookmarks()
    const hasMore = this.state.displayCount < this.state.bookmarks.length

    return `
      <div class="content">
        <div class="content-header">
          <div class="header-left-controls">
            <div class="list-title">
              ${this.state.sortOrder === 'desc' ? '오래된 순' : '최신 순'}으로 정렬
            </div>
            <button class="sort-toggle-btn" id="sortToggleBtn" title="${this.state.sortOrder === 'desc' ? '최신순으로 변경' : '오래된순으로 변경'}">
              ${this.state.sortOrder === 'desc' ? '🔄' : '🔄'}
            </button>
          </div>
          <button class="select-all-btn" id="selectAllBtn">
            ${this.isAllDisplayedSelected() ? '전체해제' : '전체선택'}
          </button>
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
              <div class="bookmark ${this.state.selected.has(bookmark.id) ? 'selected' : ''}" 
                   data-id="${bookmark.id}"
                   data-tooltip="${this.createBookmarkTooltip(bookmark)}">
                <div class="checkbox" role="checkbox" 
                   aria-checked="${this.state.selected.has(bookmark.id) ? 'true' : 'false'}" 
                   aria-label="${bookmark.title} 선택" 
                   tabindex="0">
              </div>
                <img src="${faviconUrl}" class="favicon">
                <div class="info">
                  <div class="title">${bookmark.title || 'Untitled'}</div>
                  <div class="meta">
                    <span class="category-tag">${this.getCategoryInfo(bookmark.category || 'other')}</span>
                    <span class="separator">•</span>
                    <span>${bookmark.daysSinceAdded || 0}일 전 저장</span>
                  </div>
                </div>
                <button class="visit-btn" data-url="${bookmark.url}">↗</button>
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
          <select class="sort-dropdown" id="sortSelect">
            <option value="daysSinceVisit" ${this.state.sortBy === 'daysSinceVisit' ? 'selected' : ''}>오래된 순</option>
            <option value="category" ${this.state.sortBy === 'category' ? 'selected' : ''}>카테고리별</option>
          </select>
        </div>
        <div class="category-grid">
          ${Object.entries(categories).map(([category, bookmarks]) => `
            <div class="category-tile" data-category="${category}">
              <div class="tile-icon">${BookmarkUtils.getCategoryIcon(category)}</div>
              <div class="tile-title">${BookmarkUtils.getCategoryName(category)}</div>
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
          <h2>${BookmarkUtils.getCategoryName(this.state.selectedCategory)}</h2>
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
              <div class="bookmark ${this.state.selected.has(bookmark.id) ? 'selected' : ''}" 
                   data-id="${bookmark.id}"
                   data-tooltip="${this.createBookmarkTooltip(bookmark)}">
                <div class="checkbox" role="checkbox" 
                   aria-checked="${this.state.selected.has(bookmark.id) ? 'true' : 'false'}" 
                   aria-label="${bookmark.title} 선택" 
                   tabindex="0">
              </div>
                <img src="${faviconUrl}" class="favicon">
                <div class="info">
                  <div class="title">${bookmark.title || 'Untitled'}</div>
                  <div class="meta">
                    <span class="category-tag">${this.getCategoryInfo(bookmark.category || 'other')}</span>
                    <span class="separator">•</span>
                    <span>${bookmark.daysSinceAdded || 0}일 전 저장</span>
                  </div>
                </div>
                <button class="visit-btn" data-url="${bookmark.url}">↗</button>
              </div>
            `
          }).join('')}
        </div>
        ${hasMore ? '<button class="load-more" id="loadMore">더보기</button>' : ''}
      </div>
    `
  }

  // Nielsen's Heuristic #5: Error prevention & #9: Help users recognize, diagnose, and recover from errors
  renderBookmarkItem(bookmark) {
    const isSelected = this.state.selected.has(bookmark.id)
    const categoryInfo = this.getCategoryInfo(bookmark.category || 'other')
    
    let faviconUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="%23999"><rect width="16" height="16" rx="2"/></svg>'
    try {
      faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}`
    } catch (e) {
      // fallback icon
    }

    return `
      <div class="bookmark-item ${isSelected ? 'selected' : ''}" 
           data-id="${bookmark.id}"
           role="listitem"
           tabindex="0"
           aria-selected="${isSelected}">
        
        <div class="item-select">
          <div class="checkbox-wrapper" role="checkbox" 
               aria-checked="${isSelected}" 
               aria-label="${bookmark.title} 선택">
            <div class="custom-checkbox ${isSelected ? 'checked' : ''}">
              ${isSelected ? '✓' : ''}
            </div>
          </div>
        </div>
        
        <div class="item-favicon">
          <img src="${faviconUrl}" alt="" width="16" height="16" loading="lazy">
        </div>
        
        <div class="item-content">
          <div class="item-title" title="${bookmark.title || 'Untitled'}">
            ${bookmark.title || 'Untitled'}
          </div>
          <div class="item-meta">
            <span class="meta-category">${categoryInfo}</span>
            <span class="meta-separator">•</span>
            <span class="meta-age" title="마지막 방문: ${bookmark.daysSinceVisit}일 전">
              ${bookmark.daysSinceVisit}일 전 방문
            </span>
          </div>
        </div>
        
        <div class="item-actions">
          <button class="item-action-btn visit" 
                  data-url="${bookmark.url}" 
                  title="사이트 방문"
                  aria-label="${bookmark.title} 사이트 방문">
            ↗
          </button>
        </div>
      </div>
    `
  }

  // Utility methods for UX enhancements
  getAverageAge(bookmarks) {
    if (!bookmarks.length) return '0일'
    const totalDays = bookmarks.reduce((sum, b) => sum + (b.daysSinceVisit || 0), 0)
    const avgDays = Math.round(totalDays / bookmarks.length)
    return `${avgDays}일`
  }

  getOldestBookmarkAge(bookmarks) {
    if (!bookmarks.length) return '0일 전'
    const maxDays = Math.max(...bookmarks.map(b => b.daysSinceVisit || 0))
    return `${maxDays}일 전`
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


  async selectCategory(category) {
    const categoryName = BookmarkUtils.getCategoryName(category)
    const hideLoading = this.showLoadingState(`${categoryName} 카테고리 로딩 중...`)
    
    try {
      this.state.selectedCategory = category
      this.state.viewMode = 'category-detail'
      this.state.displayCount = 5 // 리셋
      this.state.selected.clear() // 선택 상태도 리셋
      await this.render(true) // 강제 전체 렌더링
      
      const categoryCount = this.state.bookmarks.filter(b => 
        (b.category || 'other') === category
      ).length
      
      this.showToast(`${categoryName} 카테고리 (${categoryCount}개)`, 'info', 2500)
    } finally {
      hideLoading()
    }
  }

  async goBackToCategories() {
    const hideLoading = this.showLoadingState('카테고리 목록으로 이동 중...')
    
    try {
      this.state.viewMode = 'categories'
      this.state.selectedCategory = null
      this.state.selected.clear()
      await this.render(true) // 강제 전체 렌더링
      
      this.showToast('카테고리 목록으로 돌아갔습니다', 'info', 2000)
    } finally {
      hideLoading()
    }
  }

  async loadMore() {
    const button = event?.target
    const hideLoading = button ? this.showLoadingState('로딩 중...', button) : null
    
    try {
      let loadedCount = 0
      
      if (this.state.viewMode === 'category-detail') {
        const categoryBookmarks = this.state.bookmarks.filter(b => 
          (b.category || 'other') === this.state.selectedCategory
        )
        const oldCount = this.state.displayCount
        this.state.displayCount = Math.min(
          this.state.displayCount + 5, 
          categoryBookmarks.length
        )
        loadedCount = this.state.displayCount - oldCount
      } else {
        const oldCount = this.state.displayCount
        this.state.displayCount = Math.min(
          this.state.displayCount + 5, 
          this.state.bookmarks.length
        )
        loadedCount = this.state.displayCount - oldCount
      }
      
      await this.render() // 부분 업데이트 가능
      
      if (loadedCount > 0) {
        this.showToast(`${loadedCount}개 더 불러왔습니다`, 'info', 2000)
      }
    } finally {
      if (hideLoading) hideLoading()
    }
  }


  async confirmAndExecute(action) {
    const selectedIds = Array.from(this.state.selected)
    if (!selectedIds.length) return

    const actionText = action === 'keep' ? '청소함 보관' : '완전 삭제'
    const message = action === 'keep' 
      ? `선택된 ${selectedIds.length}개의 북마크를 청소함에 보관하시겠습니까?\n\n🧹 북마크가 "📋 보관된 북마크" 폴더로 이동되며, 나중에 복구할 수 있습니다.`
      : `선택된 ${selectedIds.length}개의 북마크를 완전히 삭제하시겠습니까?\n\n⚠️ 선택한 북마크가 브라우저의 북마크 바와 폴더에서 영구적으로 삭제됩니다.\n⚠️ 삭제된 북마크는 복구할 수 없습니다.\n\n정말 삭제하시겠습니까?`

    const confirmed = await this.showConfirmDialog(message, actionText)
    if (confirmed) {
      await this.bulkAction(action)
    }
  }

  async showConfirmDialog(message, actionText) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div')
      overlay.className = 'modal'
      overlay.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3>확인</h3>
            <button class="close" id="confirmClose">×</button>
          </div>
          <div class="modal-body">
            <p style="white-space: pre-line; line-height: 1.5;">${message}</p>
          </div>
          <div class="modal-footer">
            <div style="display: flex; gap: 12px;">
              <button class="btn btn-ghost" id="confirmCancel" style="flex: 1;">취소</button>
              <button class="btn btn-primary" id="confirmAction" style="flex: 1;">${actionText}</button>
            </div>
          </div>
        </div>
      `

      document.body.appendChild(overlay)

      // 이벤트 리스너
      const handleClick = (e) => {
        if (e.target.id === 'confirmAction') {
          cleanup()
          resolve(true)
        } else if (e.target.id === 'confirmCancel' || e.target.id === 'confirmClose' || e.target === overlay) {
          cleanup()
          resolve(false)
        }
      }

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          cleanup()
          resolve(false)
        } else if (e.key === 'Enter') {
          cleanup()
          resolve(true)
        }
      }

      const cleanup = () => {
        overlay.removeEventListener('click', handleClick)
        document.removeEventListener('keydown', handleKeyDown)
        overlay.remove()
      }

      overlay.addEventListener('click', handleClick)
      document.addEventListener('keydown', handleKeyDown)
    })
  }

  // Enhanced User Feedback - Nielsen's Heuristic #1: Visibility of system status
  showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.querySelector('.toast-container') || this.createToastContainer()
    
    const toast = document.createElement('div')
    toast.className = `toast toast-${type}`
    
    const icon = {
      'success': '✅',
      'error': '❌', 
      'warning': '⚠️',
      'info': '💡'
    }[type] || '💡'
    
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" aria-label="닫기">×</button>
      </div>
    `
    
    toastContainer.appendChild(toast)
    
    // Animation
    setTimeout(() => toast.classList.add('show'), 10)
    
    // Auto dismiss
    const dismiss = () => {
      toast.classList.add('hide')
      setTimeout(() => toast.remove(), 300)
    }
    
    setTimeout(dismiss, duration)
    toast.querySelector('.toast-close').addEventListener('click', dismiss)
    
    return dismiss
  }
  
  createToastContainer() {
    const container = document.createElement('div')
    container.className = 'toast-container'
    document.body.appendChild(container)
    return container
  }

  // Enhanced Loading States
  showLoadingState(message = '처리 중...', target = null) {
    if (target) {
      target.classList.add('loading')
      target.disabled = true
      const originalText = target.textContent
      target.textContent = message
      return () => {
        target.classList.remove('loading')
        target.disabled = false
        target.textContent = originalText
      }
    } else {
      this.setLoadingState(true, message)
      return () => this.setLoadingState(false)
    }
  }

  async bulkAction(action) {
    const selectedIds = Array.from(this.state.selected)
    if (!selectedIds.length) return

    const selectedBookmarks = this.state.bookmarks.filter(b => selectedIds.includes(b.id))
    const actionText = action === 'keep' ? '청소함 보관' : '완전 삭제'
    
    // Show loading with progress feedback
    const hideLoading = this.showLoadingState(`${actionText} 중... (0/${selectedIds.length})`)
    
    try {
      let processedCount = 0
      
      if (action === 'keep') {
        await new Promise(resolve => {
          chrome.runtime.sendMessage({ 
            action: 'copyToGraveyard', 
            bookmarks: selectedBookmarks 
          }, resolve)
        })
        processedCount = selectedIds.length
      } else if (action === 'delete') {
        // 실제로 북마크를 삭제합니다 with progress feedback
        for (const bookmark of selectedBookmarks) {
          try {
            await chrome.bookmarks.remove(bookmark.id)
            processedCount++
            
            // Update loading message with progress
            this.setLoadingState(true, `${actionText} 중... (${processedCount}/${selectedIds.length})`)
            
            console.log(`북마크 삭제됨: ${bookmark.title}`)
          } catch (error) {
            console.error(`북마크 삭제 실패 ${bookmark.title}:`, error)
            this.showToast(`${bookmark.title} 삭제 실패`, 'error', 2000)
          }
        }
      }

      // Update processed list
      selectedIds.forEach(id => this.state.processed.add(id))
      await chrome.storage.local.set({ 
        processedBookmarks: Array.from(this.state.processed) 
      })

      // Remove from display
      this.state.bookmarks = this.state.bookmarks.filter(b => !selectedIds.includes(b.id))
      this.state.selected.clear()
      
      // Success feedback
      const successMessage = action === 'keep' 
        ? `${processedCount}개 북마크를 청소함에 보관했습니다`
        : `${processedCount}개 북마크를 완전히 삭제했습니다`
      
      this.showToast(successMessage, 'success', 4000)
      
      // 카테고리 상세 뷰인 경우 해당 카테고리의 북마크 수에 맞춰 displayCount 조정
      if (this.state.viewMode === 'category-detail') {
        const categoryBookmarks = this.state.bookmarks.filter(b => 
          (b.category || 'other') === this.state.selectedCategory
        )
        this.state.displayCount = Math.min(this.state.displayCount, categoryBookmarks.length)
        
        // 카테고리에 더 이상 북마크가 없으면 카테고리 뷰로 돌아가기
        if (categoryBookmarks.length === 0) {
          this.state.viewMode = 'categories'
          this.state.selectedCategory = null
          this.state.displayCount = 5
          this.showToast('카테고리가 비어있어서 전체 목록으로 이동했습니다', 'info', 3000)
        }
      } else {
        this.state.displayCount = Math.min(this.state.displayCount, this.state.bookmarks.length)
      }
      
    } catch (error) {
      console.error('Bulk action failed:', error)
      this.showToast(`처리 중 오류가 발생했습니다: ${error.message}`, 'error', 5000)
    } finally {
      hideLoading()
    }
    
    // 전체 렌더링 강제 (카테고리가 변경될 수 있으므로)
    await this.render(true)
  }


  showToast(message, type = 'info', duration = 3000) {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove())
    
    const toast = document.createElement('div')
    toast.className = `toast toast-${type}`
    
    const icon = this.getToastIcon(type)
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
      </div>
    `
    
    document.body.appendChild(toast)
    
    setTimeout(() => toast.classList.add('show'), 10)
    setTimeout(() => {
      toast.classList.add('hide')
      setTimeout(() => toast.remove(), 300)
    }, duration)
  }

  getToastIcon(type) {
    const icons = {
      success: '✅',
      error: '❌', 
      warning: '⚠️',
      info: 'ℹ️',
      loading: '⏳'
    }
    return icons[type] || 'ℹ️'
  }

  createBookmarkTooltip(bookmark) {
    const domain = bookmark.url ? new URL(bookmark.url).hostname : 'Unknown'
    const visitInfo = bookmark.daysSinceVisit 
      ? `${bookmark.daysSinceVisit}일 전 방문` 
      : '방문 기록 없음'
    
    return `📍 ${domain}\\n🕐 ${visitInfo}\\n📅 ${bookmark.daysSinceAdded || 0}일 전 저장\\n🏷️ ${this.getCategoryInfo(bookmark.category || 'other')}`
  }

  async showSettings() {
    const modal = document.createElement('div')
    modal.className = 'modal'
    modal.innerHTML = `
      <div class="modal-content distribution-modal">
        <div class="modal-header">
          <h3>북마크 청소 범위 설정</h3>
          <button class="close" id="closeModal">×</button>
        </div>
        <div class="modal-body">
          <div class="distribution-container">
            <div class="distribution-header">
              <h4>청소 대상 북마크 분포</h4>
              <div class="distribution-legend">
                <span class="legend-item">
                  <span class="legend-color"></span>
                  북마크 개수
                </span>
              </div>
            </div>
            <div class="distribution-chart-container">
              <div class="distribution-loading">북마크 분석중...</div>
              <canvas id="distributionChart" width="350" height="120" style="display: none;"></canvas>
              <div class="range-slider-container">
                <div class="range-slider" id="rangeSlider">
                  <div class="range-track"></div>
                  <div class="range-selection" id="rangeSelection"></div>
                  <div class="range-handle left" id="leftHandle"></div>
                  <div class="range-handle right" id="rightHandle"></div>
                </div>
                <div class="range-labels">
                  <span>0일</span>
                  <span>2년</span>
                </div>
              </div>
            </div>
            <div class="range-info">
              <div class="range-summary">
                <strong>선택된 범위:</strong> 
                <span id="rangeDisplay">0일 ~ 7일</span>
              </div>
              <div class="bookmarks-count">
                <strong>청소할 북마크:</strong>
                <span id="bookmarksCount">0개</span>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="saveSettings" class="save-btn">청소 시작</button>
        </div>
      </div>
    `
    
    document.body.appendChild(modal)
    
    // 초기 범위 설정 (기본값: 0일 ~ 7일)
    this.currentRange = { min: 0, max: 7 }
    this.distributionData = null
    
    // 분포 데이터 로드 및 차트 그리기
    await this.loadAndRenderDistribution(modal)
    
    modal.addEventListener('click', e => {
      if (e.target.id === 'closeModal' || e.target === modal) {
        modal.remove()
      } else if (e.target.id === 'saveSettings') {
        this.saveDistributionSettings(modal)
      }
    })
    
    // 슬라이더 이벤트 리스너
    this.initializeRangeSlider(modal)
  }



  async loadAndRenderDistribution(modal) {
    try {
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'getBookmarkDistribution' }, resolve)
      })
      
      this.distributionData = response.distribution || {}
      
      // 로딩 상태 제거하고 차트 표시
      const loadingElement = modal.querySelector('.distribution-loading')
      const chartCanvas = modal.querySelector('#distributionChart')
      
      if (loadingElement) loadingElement.style.display = 'none'
      if (chartCanvas) chartCanvas.style.display = 'block'
      
      this.renderDistributionChart(chartCanvas, this.distributionData)
      this.updateRangeInfo(modal)
      
    } catch (error) {
      console.error('Error loading distribution data:', error)
      const loadingElement = modal.querySelector('.distribution-loading')
      if (loadingElement) loadingElement.textContent = '데이터 로드 실패'
    }
  }
  
  renderDistributionChart(canvas, data) {
    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    
    ctx.clearRect(0, 0, width, height)
    
    // 데이터 전처리: 7일 단위로 그룹화
    const groupedData = {}
    const maxDays = 730 // 2년
    const groupSize = 7 // 7일 단위
    
    for (let group = 0; group <= Math.floor(maxDays / groupSize); group++) {
      groupedData[group] = 0
    }
    
    Object.entries(data).forEach(([day, count]) => {
      const dayNum = parseInt(day)
      if (dayNum >= 0 && dayNum <= maxDays) {
        const group = Math.floor(dayNum / groupSize)
        groupedData[group] += count
      }
    })
    
    const values = Object.values(groupedData)
    const maxValue = Math.max(...values, 1)
    const groups = Object.keys(groupedData)
    const barWidth = width / groups.length
    
    // 차트 그리기
    groups.forEach((group, index) => {
      const value = groupedData[group]
      const barHeight = (value / maxValue) * (height - 20)
      const x = index * barWidth
      const y = height - barHeight - 10
      
      // 선택된 범위에 속하는지 확인
      const dayStart = parseInt(group) * groupSize
      const dayEnd = dayStart + groupSize - 1
      const isInRange = (dayStart >= this.currentRange.min && dayStart <= this.currentRange.max) ||
                       (dayEnd >= this.currentRange.min && dayEnd <= this.currentRange.max) ||
                       (dayStart <= this.currentRange.min && dayEnd >= this.currentRange.max)
      
      // 바 색상
      ctx.fillStyle = isInRange ? '#007aff' : '#e5e5e7'
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight)
    })
  }
  
  initializeRangeSlider(modal) {
    const slider = modal.querySelector('#rangeSlider')
    const leftHandle = modal.querySelector('#leftHandle')
    const rightHandle = modal.querySelector('#rightHandle')
    const rangeSelection = modal.querySelector('#rangeSelection')
    
    let isDragging = false
    let activeHandle = null
    
    const updateSlider = () => {
      const sliderRect = slider.getBoundingClientRect()
      const sliderWidth = sliderRect.width - 20 // handle width
      
      const leftPercent = (this.currentRange.min / 730) * 100
      const rightPercent = (this.currentRange.max / 730) * 100
      
      leftHandle.style.left = `${leftPercent}%`
      rightHandle.style.left = `${rightPercent}%`
      rangeSelection.style.left = `${leftPercent}%`
      rangeSelection.style.width = `${rightPercent - leftPercent}%`
      
      this.updateRangeInfo(modal)
      
      // 차트 업데이트
      const canvas = modal.querySelector('#distributionChart')
      if (canvas && this.distributionData) {
        this.renderDistributionChart(canvas, this.distributionData)
      }
    }
    
    const handleMouseDown = (e, handle) => {
      isDragging = true
      activeHandle = handle
      e.preventDefault()
    }
    
    const handleMouseMove = (e) => {
      if (!isDragging || !activeHandle) return
      
      const sliderRect = slider.getBoundingClientRect()
      const sliderWidth = sliderRect.width - 20
      const x = e.clientX - sliderRect.left - 10
      const percent = Math.max(0, Math.min(100, (x / sliderWidth) * 100))
      const day = Math.round((percent / 100) * 730)
      
      if (activeHandle === leftHandle) {
        this.currentRange.min = Math.min(day, this.currentRange.max - 1)
      } else {
        this.currentRange.max = Math.max(day, this.currentRange.min + 1)
      }
      
      updateSlider()
    }
    
    const handleMouseUp = () => {
      isDragging = false
      activeHandle = null
    }
    
    leftHandle.addEventListener('mousedown', (e) => handleMouseDown(e, leftHandle))
    rightHandle.addEventListener('mousedown', (e) => handleMouseDown(e, rightHandle))
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    
    // 초기 슬라이더 설정
    updateSlider()
  }
  
  updateRangeInfo(modal) {
    const rangeDisplay = modal.querySelector('#rangeDisplay')
    const bookmarksCount = modal.querySelector('#bookmarksCount')
    
    if (rangeDisplay) {
      rangeDisplay.textContent = `${this.currentRange.min}일 ~ ${this.currentRange.max}일`
    }
    
    if (bookmarksCount && this.distributionData) {
      let count = 0
      for (let day = this.currentRange.min; day <= this.currentRange.max; day++) {
        count += this.distributionData[day] || 0
      }
      bookmarksCount.textContent = `${count}개`
    }
  }
  
  saveDistributionSettings(modal) {
    // 현재 범위를 새로운 설정으로 변환
    const newSettings = {
      custom: { 
        enabled: true, 
        minDays: this.currentRange.min, 
        maxDays: this.currentRange.max,
        label: `${this.currentRange.min}일 ~ ${this.currentRange.max}일`
      }
    }
    
    this.setLoadingState(true, '청소 대상 북마크 검색중...')
    
    chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: newSettings
    }, async (response) => {
      if (response?.success) {
        this.state.settings = newSettings
        this.state.selected.clear()
        this.state.viewMode = 'list'
        this.state.selectedCategory = null
        this.state.displayCount = 5
        this.cache.stats = null
        
        // 새로운 설정으로 북마크 스캔 실행
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: 'scan' }, response => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
              return
            }
            resolve(response)
          })
        })
        
        await this.loadData()
        await this.getStats()
        await this.render()
        this.setLoadingState(false)
        
        const bookmarkCount = this.state.bookmarks.length
        this.showToast(
          bookmarkCount > 0 
            ? `🧹 ${bookmarkCount}개의 북마크를 발견했습니다!` 
            : '선택한 범위에 청소할 북마크가 없습니다',
          bookmarkCount > 0 ? 'success' : 'info'
        )
        modal.remove()
      } else {
        this.setLoadingState(false)
        this.showToast('북마크 검색에 실패했습니다', 'error')
      }
    })
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
      { id: 'year1', label: '1년 이상' }
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


  saveSettings(modal) {
    const periodIds = ['week1', 'week2', 'week3', 'month1', 'month6', 'year1']
    const newSettings = {}
    
    // 모든 기간 설정 처리 (새로운 UI에서 선택된 것들)
    periodIds.forEach(periodId => {
      const periodButton = modal.querySelector(`[data-period="${periodId}"]`)
      newSettings[periodId] = { 
        ...this.state.settings[periodId], 
        enabled: periodButton ? periodButton.classList.contains('selected') : false
      }
    })
    
    
    chrome.runtime.sendMessage({ action: 'updateSettings', settings: newSettings }, async response => {
      if (response?.success) {
        
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

// Initialize - 즉시 실행
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing manager...')
  
  // BookmarkUtils 체크 및 fallback 제공
  if (typeof BookmarkUtils === 'undefined') {
    console.warn('BookmarkUtils not loaded, using fallback')
    window.BookmarkUtils = {
      categorizeBookmark: () => 'other',
      getCategoryIcon: (category) => '🔖',
      getCategoryName: (category) => '기타'
    }
  }
  
  window.bookmarkManager = new BookmarkManager()
  window.bookmarkManager.init().catch(error => {
    console.error('Failed to initialize bookmark manager:', error)
    document.getElementById('content').innerHTML = '<div style="padding: 20px; color: red;">초기화 오류가 발생했습니다: ' + error.message + '</div>'
  })
})