// 공통 유틸리티 함수들
const BookmarkUtils = {
  // 개선된 북마크 자동 분류 (도메인 + 키워드 + 패턴 분석)
  categorizeBookmark(bookmark) {
    const title = (bookmark.title || '').toLowerCase()
    const url = (bookmark.url || '').toLowerCase()
    const text = `${title} ${url}`
    
    // 도메인 추출
    let domain = ''
    try {
      domain = new URL(bookmark.url).hostname.toLowerCase()
    } catch (e) {
      domain = ''
    }

    // 1. 개발/기술 (Development/Tech)
    if (/github|gitlab|bitbucket|stackoverflow|codepen|jsfiddle|repl\.it|codesandbox/.test(domain) ||
        /vscode|vs code|visual studio|intellij|webstorm|phpstorm|android studio|xcode/.test(text) ||
        /javascript|python|java|react|vue|angular|node\.js|typescript|css|html|php|ruby|go|rust|kotlin|swift/.test(text) ||
        /개발|프로그래밍|코딩|알고리즘|api|sdk|라이브러리|프레임워크|데이터베이스|서버|클라우드/.test(text)) {
      return 'development'
    }

    // 2. 업무/생산성 (Work/Productivity)
    if (/notion|slack|discord|teams|zoom|meet|webex|asana|trello|jira|monday|clickup/.test(domain) ||
        /office|excel|word|powerpoint|sheets|docs|drive|dropbox|onedrive|box\.com/.test(text) ||
        /업무|회사|비즈니스|프로젝트|관리|협업|미팅|회의|문서|스프레드시트|프레젠테이션/.test(text)) {
      return 'work'
    }
    
    // 3. 학습/교육 (Learning/Education) 
    if (/coursera|udemy|edx|khan|pluralsight|skillshare|masterclass|lynda|linkedin.*learning/.test(domain) ||
        /university|college|edu$/.test(domain) ||
        /tutorial|course|lesson|learn|study|education|training|certification|exam|test/.test(text) ||
        /학습|교육|강의|수업|튜토리얼|자격증|시험|공부|대학|학교|학원/.test(text)) {
      return 'learning'
    }

    // 4. 디자인/크리에이티브 (Design/Creative)
    if (/behance|dribbble|pinterest|unsplash|pixabay|figma|sketch|canva|adobe/.test(domain) ||
        /photoshop|illustrator|indesign|after effects|premiere|lightroom/.test(text) ||
        /design|ui|ux|graphic|icon|font|color|palette|template|mockup|wireframe/.test(text) ||
        /디자인|그래픽|아이콘|폰트|색상|팔레트|템플릿|목업|와이어프레임|로고|브랜딩/.test(text)) {
      return 'design'
    }

    // 5. 뉴스/정보 (News/Information)
    if (/news|naver\.com|daum\.net|joins\.com|chosun\.com|donga\.com|hani\.co\.kr|mk\.co\.kr|hankyung\.com/.test(domain) ||
        /cnn|bbc|reuters|bloomberg|techcrunch|wired|ars-technica|the verge/.test(domain) ||
        /news|article|뉴스|기사|신문|언론|매체|방송|정보|트렌드|이슈/.test(text)) {
      return 'news'
    }

    // 6. 쇼핑/이커머스 (Shopping/E-commerce)
    if (/amazon|ebay|aliexpress|coupang|gmarket|auction|11st|wemakeprice|tmon|musinsa|29cm/.test(domain) ||
        /shop|store|mall|market|buy|purchase|order|cart|product|price|deal|discount/.test(text) ||
        /쇼핑|구매|주문|장바구니|상품|가격|할인|특가|세일|마켓|몰/.test(text)) {
      return 'shopping'
    }

    // 7. 엔터테인먼트/미디어 (Entertainment/Media)
    if (/youtube|netflix|disney|hulu|spotify|apple music|soundcloud|twitch|steam/.test(domain) ||
        /movie|film|music|game|gaming|streaming|video|audio|entertainment/.test(text) ||
        /영화|드라마|음악|게임|스트리밍|비디오|오디오|엔터테인먼트|웹툰|만화/.test(text)) {
      return 'entertainment'
    }

    // 8. 소셜/커뮤니티 (Social/Community)
    if (/facebook|twitter|instagram|linkedin|reddit|discord|telegram|whatsapp|kakao/.test(domain) ||
        /cafe\.naver|cafe\.daum|clien|ruliweb|dcinside|inven|ilbe|todayhumor|bobaedream/.test(domain) ||
        /social|community|forum|chat|message|sns|소셜|커뮤니티|포럼|채팅|메신저/.test(text)) {
      return 'social'
    }

    // 9. 참고자료/도구 (Reference/Tools)
    if (/wikipedia|wikimedia|mdn|w3schools|docs\.|documentation|reference|manual/.test(domain) ||
        /calculator|converter|generator|validator|checker|translator/.test(text) ||
        /백과사전|사전|매뉴얼|가이드|참고|도구|계산기|변환|번역|검증/.test(text)) {
      return 'reference'
    }

    // 10. 금융/투자 (Finance/Investment)
    if (/bank|finance|investing|trading|stock|crypto|bitcoin|ethereum/.test(text) ||
        /은행|금융|투자|주식|코인|비트코인|이더리움|거래소|증권|펀드/.test(text)) {
      return 'finance'
    }

    // 도메인 기반 fallback 분류
    if (domain) {
      // 정부/공공기관
      if (/\.go\.kr$|\.gov$/.test(domain)) return 'government'
      
      // 교육기관
      if (/\.edu$|\.ac\.kr$/.test(domain)) return 'learning'
      
      // 기술 블로그/미디어
      if (/blog|medium|tistory|naver.*blog|wordpress/.test(domain)) return 'news'
      
      // 포털 사이트 서비스
      if (/naver\.com|daum\.net|google\.com/.test(domain)) {
        if (/maps|지도/.test(text)) return 'reference'
        if (/mail|메일/.test(text)) return 'work'
        if (/cafe|카페/.test(text)) return 'social'
      }
    }
    
    return 'other'
  },

  // 카테고리 아이콘 반환
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
      development: '💻',
      finance: '💰',
      government: '🏛️',
      other: '🔖'
    }
    return icons[category] || '🔖'
  },

  // 카테고리 이름 반환
  getCategoryName(category) {
    const names = {
      work: '업무',
      reference: '참고자료',
      design: '디자인',
      news: '뉴스',
      entertainment: '엔터테인먼트',
      shopping: '쇼핑',
      learning: '공부',
      social: '소셜',
      development: '개발',
      finance: '금융',
      government: '공공',
      other: '기타'
    }
    return names[category] || '기타'
  }
}

// background.js와 popup.js에서 모두 사용할 수 있도록 export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BookmarkUtils
} else {
  window.BookmarkUtils = BookmarkUtils
}