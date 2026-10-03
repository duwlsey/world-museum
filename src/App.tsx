import { createBookPageSource, type CreatedBook } from './createdBookPages'
import { preloadBookPreview, preloadBookReader, type BookPageSource } from './bookSources'
import { useBackgroundMusic } from './backgroundMusic'
import { loadYouTubeApi, setVideoPlaying } from './videoPlayback'
import InlineBook from './InlineBook'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import { useAuth, type Role } from './auth'
import { supabase, guestbookClient } from './supabase'

const floors = [
  { floor: '4F', title: 'FROM YOU', to: '/4f', text: '나도 작가 아틀리에' },
  { floor: '3F', title: 'FROM JANGHEUNG, KOREA', to: '/3f', text: '학생 작가 재창작 작품전' },
  { floor: '2F', title: 'FROM RWANDA', to: '/2f', text: '프로젝트 원책 소개' },
  { floor: '1F', title: 'WORLD DOCENT', to: '/1f', text: '프로젝트 소개' },
]
const roleLabel: Record<Role, string> = { teacher: 'TEACHER', author: '✏️ AUTHOR', student: 'STUDENT' }
type MuseumNote = { id: string; floor: '3f' | '4f'; artist_index: number | null; book_id: string | null; owner_id: string; owner_username: string; owner_role: Role | 'guest'; body: string; created_at: string }
type CmsArtist = { name: string; title: string; scope: string; pdf?: string; video?: string }
type FooterContent = { copyright: string; projectLabel: string; teacherLabel: string; email: string }
const defaultFooter: FooterContent = { copyright: "© 2026 Jangheung Glocal Educational Center", projectLabel: "World Docent", teacherLabel: "교사 김여진", email: "teach4stu@gmail.com" }
type MusicContent = { url: string; name: string }
type CmsState = { music?: MusicContent; footer?: FooterContent; about: string; framework: string[]; spotlight: string; rwanda: string[]; artists: CmsArtist[]; activityImages: string[] }
const coverColors = [
  { name: 'Ivory', value: '#eee9dc' }, { name: 'Sand', value: '#dfd3bd' }, { name: 'Honey', value: '#decba0' }, { name: 'Clay', value: '#d9b9a7' }, { name: 'Rosewood', value: '#bb958b' },
  { name: 'Blush', value: '#e8d4cf' }, { name: 'Petal', value: '#dfbdc5' }, { name: 'Mauve', value: '#c5a8b8' }, { name: 'Lilac', value: '#d9d1e2' }, { name: 'Heather', value: '#b4abc9' },
  { name: 'Mist', value: '#dce3e3' }, { name: 'Sky', value: '#cad9e5' }, { name: 'Blue Haze', value: '#aebfcf' }, { name: 'Slate', value: '#8f9fad' }, { name: 'Charcoal', value: '#b9b9b6' },
  { name: 'Sage', value: '#cbd4c4' }, { name: 'Fern', value: '#b3c4b3' }, { name: 'Olive', value: '#b7bda0' }, { name: 'Eucalyptus', value: '#98afa5' }, { name: 'Forest', value: '#7f9688' },
]

function BookCover({ book, className = '' }: { book: CreatedBook; className?: string }) {
  const image = book.coverImage || book.reference
  return <div key={`${book.coverColor || ''}:${image || ''}`} className={`book-cover ${className}`} style={{ background: image ? `center / cover no-repeat url("${image.replaceAll('"', '%22')}")` : (book.coverColor || '#dce3e3') }}>
    <div className="book-cover-title"><strong>{book.title || 'Untitled Book'}</strong><small>by {book.author || 'Author'}</small></div>
  </div>
}

function Header({ visible, openAuth }: { visible: boolean; openAuth: (mode: 'login' | 'signup') => void }) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  return <header className={`site-header ${pathname === '/' ? 'home-header' : ''} ${visible ? 'is-visible' : ''}`}><div className="header-left"><Link translate="no" className="brand notranslate" to="/" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>WORLD MUSEUM</Link></div><div className="header-right"><nav aria-label="Museum floors">{user?.id === 'admin1' ? <NavLink className="basement-link" to="/admin">[ B1 ]</NavLink> : <span className="basement-placeholder" aria-hidden="true" />}{[...floors].reverse().map(({ floor, to }) => <NavLink key={floor} to={to}>[ {floor} ]</NavLink>)}</nav>{user ? <div className="user-menu"><span><span className="header-account-name" title={user.nickname}>{user.nickname}</span><em>{roleLabel[user.role]}</em></span><button onClick={logout}>Log Out</button></div> : <div className="auth-links"><button onClick={() => openAuth('signup')}>Sign Up</button><button onClick={() => openAuth('login')}>Log In</button></div>}</div></header>
}

function Footer({ sound, toggleSound, content }: { sound: boolean; toggleSound: () => void; content: FooterContent }) {
  const [copyStatus, setCopyStatus] = useState('')
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])
  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(content.email); setCopyStatus('copied') }
    catch { setCopyStatus('Could not copy email. Please try again.') }
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopyStatus(''), 1000)
  }
  return <footer className="museum-footer"><div><span>{content.copyright}</span><a href="/1f">{content.projectLabel}</a><button className="footer-email" type="button" onClick={() => void copyEmail()} title={content.email}>{content.teacherLabel}<span className="footer-copy-status" role="status" aria-live="polite">{copyStatus}</span></button></div><button className="sound" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? '배경음악 끄기' : '배경음악 켜기'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z" />{sound ? <><path d="M15 8a6 6 0 0 1 0 8" /><path d="M18 5a10 10 0 0 1 0 14" /></> : <path d="m16 9 5 6m0-6-5 6" />}</svg></button></footer>
}

function Entrance({ activateHeader }: { activateHeader: () => void }) {
  return <main className="entrance monochrome-entrance"><div className="landing-sequence"><section className="gallery-prologue"><div className="prologue-copy"><p className="prologue-kicker">WORLD DOCENT</p><h1 aria-label="WORLD MUSEUM" translate="no" className="notranslate">W<span className="rwanda-o" aria-hidden="true">O</span>RLD MUSEUM</h1><p className="prologue-sub">An Archive of Children's Voices &amp; Global Citizenship</p></div><p className="scroll-indicator"><i aria-hidden="true" /><span>SCROLL TO ENTER</span></p></section></div><section className="directory gallery-directory" onMouseEnter={activateHeader}><motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="directory-heading"><p>FLOOR DIRECTORY</p><h2>Explore the collection</h2></motion.div><div className="floor-list">{[...floors].reverse().map((item, index) => <motion.div key={item.floor} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .25 }} transition={{ duration: .45, delay: index * .07 }}><Link className="floor-card" to={item.to}><span className="floor-no">{item.floor}</span><div><h3>{item.title}</h3><p>{item.text}</p></div><b>↗</b></Link></motion.div>)}</div></section></main>
}

function GalleryPage({ item }: { item: typeof floors[number] }) {
  return <main className="gallery-page"><p className="eyebrow">{item.floor} · WORLD MUSEUM</p><h1>{item.title}</h1><div className="gallery-line" /><p className="gallery-description">{item.text}</p><Link className="back-link" to="/">← Museum entrance</Link></main>
}

function FloorMarker({ floor, title }: { floor: string; title: string }) {
  return <div className="floor-marker"><p className="eyebrow">{floor} <span>·</span> {title}</p></div>
}

const framework = [
  { code: 'READ THE WORLD', title: '읽기 (Read)', text: '1001 Library에 축적된 제3세계(Global South) 아이들의 이야기를 읽으며 그들의 문화와 역사, 기후 등을 깊이 있게 탐구하고 공감하며, 궁극적으로 문화적 감수성을 키우는 것을 목적으로 합니다.' },
  { code: 'WRITE THE WORLD', title: '재창작하기 (Re-creation)', text: "읽은 이야기에 기반하여 자신만의 신념이나 강조하고 싶은 삶의 가치를 담아 이야기를 재구성하는 활동입니다. 단순한 결과물의 완성도보다는 '잘 만들어보려는 마음가짐'을 기르고, 학생 스스로가 능동적인 콘텐츠 생산자로 성장하도록 돕는 데 목적이 있습니다." },
  { code: 'LEAD THE WORLD', title: '나누기 (Global Sharing)', text: '학생들이 재창작한 결과물(디지털 콘텐츠, 오디오북 등)을 글로벌 웹사이트 및 1001 stories 플랫폼에 게재하여 전 세계 다양한 국가의 사람들과 공유합니다. 국경을 넘어 실질적으로 소통하는 경험을 통해 인간의 보편적 가치를 되새기고, 세계시민으로서의 역량을 함양하고 실천하는 것을 목적으로 합니다.' },
]
const defaultActivitySources = Array.from({ length: 10 }, (_, index) => `/images/1f/act${index + 1}.jpg`)
const canonicalBookTitles = ['Sports Day', 'My New Foreign Neighbor', 'Those Who Give Kindness Back'] as const

function ActivityPhoto({ source, alt }: { source: string; alt: string }) {
  const [shownSource, setShownSource] = useState(source)
  const [incomingSource, setIncomingSource] = useState('')
  const [incomingReady, setIncomingReady] = useState(false)

  useEffect(() => {
    if (source !== shownSource) {
      setIncomingSource(source)
      setIncomingReady(false)
    }
  }, [source, shownSource])

  const finishFade = () => {
    if (!incomingReady || !incomingSource) return
    setShownSource(incomingSource)
    setIncomingSource('')
    setIncomingReady(false)
  }

  return <>
    <img src={shownSource} alt={alt} loading="eager" decoding="async" />
    {incomingSource && <img className={`activity-photo-incoming${incomingReady ? ' is-ready' : ''}`} src={incomingSource} alt={alt} loading="eager" decoding="async" onLoad={() => setIncomingReady(true)} onTransitionEnd={finishFade} />}
  </>
}

function FirstFloorPage({ cms }: { cms: CmsState }) {
  const { user } = useAuth()
  const [current, setCurrent] = useState(1)
  const [photoOverrides, setPhotoOverrides] = useState<Record<string, string>>({})
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [lightbox, setLightbox] = useState<{ src: string; index: number } | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transitionLock = useRef(false)
  const preparedPhotos = useRef(new Map<string, Promise<string | null>>())
  const activitySources = cms.activityImages.length ? cms.activityImages : defaultActivitySources
  const preparePhoto = (index: number) => {
    const source = activitySources[(index + activitySources.length) % activitySources.length]
    let prepared = preparedPhotos.current.get(source)
    if (!prepared) {
      const loadAndDecode = (src: string) => new Promise<boolean>((resolve) => {
        const image = new Image()
        let settled = false
        const finish = (success: boolean) => {
          if (settled) return
          settled = true
          resolve(success)
        }
        const finishLoaded = () => {
          if (typeof image.decode === 'function') image.decode().then(() => finish(true)).catch(() => finish(true))
          else finish(true)
        }
        image.onload = finishLoaded
        image.onerror = () => finish(false)
        image.src = src
        if (image.complete) {
          if (image.naturalWidth > 0) finishLoaded()
          else finish(false)
        }
      })
      prepared = (async () => {
        if (await loadAndDecode(source)) return source
        const fallback = defaultActivitySources[index % defaultActivitySources.length]
        return await loadAndDecode(fallback) ? fallback : null
      })()
      preparedPhotos.current.set(source, prepared)
    }
    return prepared.then((resolved) => {
      if (resolved && resolved !== source) setPhotoOverrides((previous) => ({ ...previous, [source]: resolved }))
      return resolved
    })
  }
  useEffect(() => {
    const visibleAndNext = [current - 1, current, current + 1, current - 2, current + 2]
    visibleAndNext.forEach((index) => { void preparePhoto(index) })
  }, [current, activitySources])
  useEffect(() => {
    if (!lightbox) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { clearHoldTimer(); setLightbox(null) } }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape); clearHoldTimer() }
  }, [lightbox])
  const moveGallery = async (direction: number) => {
    if (transitionLock.current || activitySources.length < 2) return
    transitionLock.current = true
    setIsTransitioning(true)
    const nextCenter = (current + direction + activitySources.length) % activitySources.length
    const incoming = (nextCenter + direction + activitySources.length) % activitySources.length
    const ready = await preparePhoto(incoming)
    if (ready) setCurrent(nextCenter)
    window.setTimeout(() => {
      transitionLock.current = false
      setIsTransitioning(false)
    }, 300)
  }
  const clearHoldTimer = () => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null }
  const downloadPhoto = async (src: string, index: number) => {
    try {
      const response = await fetch(src)
      if (!response.ok) throw new Error('Image download failed')
      const imageUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = imageUrl
      link.download = `world-docent-activity-${String(index + 1).padStart(2, '0')}.jpg`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000)
    } catch {
      const link = document.createElement('a')
      link.href = src
      link.download = `world-docent-activity-${String(index + 1).padStart(2, '0')}.jpg`
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.click()
    }
  }
  return <main className="first-floor"><FloorMarker floor="1F" title="WORLD DOCENT" /><section className="about-room"><div><p className="eyebrow">INTRODUCTION · THE PROJECT</p><h1>World Docent</h1><p className="about-copy">{cms.about.replaceAll('광주전남통합특별시교육청', '전남광주통합특별시교육청')}</p></div></section>
    <section className="framework-room"><motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .25 }}><p className="eyebrow">WORLD DOCENT PROJECT</p><h2>Read beyond<br /><i>Make meaning together</i></h2></motion.div><div className="process-line" /> <div className="process-grid">{framework.map((item, index) => <motion.article key={item.code} initial={{ opacity: 0, y: 25 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .35 }} transition={{ delay: index * .14 }}><span>0{index + 1}</span><small>{item.code}</small><h3>{item.title}</h3><p>{cms.framework[index]}</p></motion.article>)}</div></section>
    <section className="spotlight-room"><motion.div initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .3 }}><p className="eyebrow">PROJECT SPOTLIGHT</p><h2>Speaking with<br /><i>Rwanda</i></h2><div className="spotlight-copy">{cms.spotlight.replaceAll('광주전남통합특별시교육청 장흥교육지원청', '광주전남통합특별시장흥교육지원청').replaceAll('광주전남통합특별시교육청', '전남광주통합특별시교육청').replaceAll('Rwanda', '르완다').split('\n\n').map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></motion.div></section>
    {user && <section className="activity-room"><div className="activity-room-inner"><motion.div className="activity-heading-reveal" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }} transition={{ duration: .7, ease: [0.22, 1, 0.36, 1] }}><div><p className="eyebrow">PROJECT PHOTOS</p><h2>Moments of becoming</h2></div></motion.div><motion.div className="activity-carousel-reveal" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }} transition={{ duration: .8, delay: .08, ease: [0.22, 1, 0.36, 1] }}><div className="activity-carousel"><button className="photo-arrow previous" disabled={isTransitioning} onClick={() => void moveGallery(-1)} aria-label="Previous photos">‹</button><div className="activity-grid" aria-label="Project photo carousel">{[-1, 0, 1].map((offset) => { const index = (current + offset + activitySources.length) % activitySources.length; const position = offset === 0 ? 'center' : offset < 0 ? 'left' : 'right'; const source = photoOverrides[activitySources[index]] || activitySources[index]; return <button type="button" className={`activity-card photo-${position}`} key={position} onClick={() => setLightbox({ src: source, index })} aria-label={`Enlarge project photograph ${index + 1}`}><ActivityPhoto source={source} alt={`Project activity ${index + 1}`} /></button>})}</div><button className="photo-arrow next" disabled={isTransitioning} onClick={() => void moveGallery(1)} aria-label="Next photos">›</button></div></motion.div></div></section>}
    <AnimatePresence>{lightbox && <motion.div className="activity-photo-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setLightbox(null) }}><div className="activity-photo-controls"><button className="activity-download-icon" onClick={() => void downloadPhoto(lightbox.src, lightbox.index)} aria-label="Download photograph" title="Download photograph"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3" /></svg></button><button className="activity-close" onClick={() => setLightbox(null)} aria-label="Close photograph">×</button></div><motion.img className="activity-photo-large" src={lightbox.src} alt={`Project activity photograph ${lightbox.index + 1}`} draggable={false} onContextMenu={(event) => event.preventDefault()} onPointerDown={() => { clearHoldTimer(); holdTimer.current = setTimeout(() => { void downloadPhoto(lightbox.src, lightbox.index); holdTimer.current = null }, 650) }} onPointerUp={clearHoldTimer} onPointerLeave={clearHoldTimer} onPointerCancel={clearHoldTimer} initial={{ scale: .985 }} animate={{ scale: 1 }} exit={{ scale: .985 }} /></motion.div>}</AnimatePresence>
  </main>
}

const rwandaParagraphs = [
  'Once upon a time, there was a shoemaker named Kakama who made colorful shoes for children. Kakama loved children and it filled him with great happiness when children loved his shoes. One day, Kakama was going to the city with twenty brand new beautiful shoes he made. When Kakama was on his way, he ran into a group of robbers. The robbers beat up Kakama and took all that Kakama had with him. Kakama was hurt very badly, but his heart hurt the most. Many children were waiting to wear Kakama’s new shoes.',
  'Tadaho, a rich and powerful man, was passing by Kakama and saw him lying on the ground. Tadaho asked Kakama, “Goodness gracious! Are you alright?” Kakama said painfully, “I was robbed and beat up.” “You need to go to the hospital right away!” Tadaho replied. “Can you please take me?” Kakama cried out in pain. “ If I carry you, the fancy suit that I’m wearing will be ruined. I also have an important meeting to go to. Here is ten dollars. Many people pass by this road. Someone else will come to help you.” Tadaho felt bad, but he did not want to be late. “I will take you to the hospital if you are still here when I come back,” said Tadaho as he left for his meeting.',
  'Five minutes later, Pakeo walked by and saw Kakama on the ground. Pakeo was well known in the city because he was very smart. Kakama cried to Pakeo, “Please! Help me!” “What happened?” Pakeo asked. “I am bleeding and in pain. Thank goodness you are here, Pakeo. Please take me to the hospital.” “I am not strong enough to carry you, and I have to give a speech,” said Pakeo, “I will go find someone else who can help you, Kakama.” Pakeo left. He wanted to help, but he did not want to wait all day long in the hospital with Kakama and miss his speech.',
  'Kakama was very close to dying from losing too much blood. At that moment, Sarama crossed Kakama’s path. Sarama was a poor woman with an only child who was very sick. Sarama was on her way to the city to pick up medicine for her ill daughter. Sarama saw Kakama and ran to him. She asked him, “Are you OK? You are hurt and bleeding!” Kakama looked up Sarama. “Please help me. If you don’t help me now, I will die here.” Sarama took off her scarf and tied Kakama’s leg above his cut to stop the bleeding. “Can you lean on me? I am going to try to lift you and walk with you.” Sarama did all she could to lift Kakama and carry him. Sarama had trouble holding Kakama, but she prayed to God for help. With the help of Sarama, Kakama would get to the hospital safely.',
  'Seven days later, Sarama and her daughter visited Kakama to see how he was doing. Kakama was much better and he was waiting to see Sarama and her daughter, Jomopira. Kakama gave Jomopira a gift of colorful shoes. Jomopira was so happy, and Kakama and Sarama’s hearts were full of joy.',
]
const defaultCms: CmsState = { about: 'World Docent는 독서인문 교육과 세계시민교육의 융합으로 제3세계(Global South)의 이야기를 읽고 재창작하며 학생들의 문화적 감수성과 세계시민 역량을 키우기 위한 전남광주통합특별시교육청 소속 초중등 교원 연구회입니다.', framework: framework.map((item) => item.text), spotlight: '광주전남통합특별시장흥교육지원청 글로컬교육센터에서 ESL 기반으로 World Docent 프로젝트를 진행했습니다. 본 프로젝트는 장흥초등학교 김유나 학생, 장흥남초등학교 안효주 학생, 회진초등학교 김진서 학생이 참여했습니다.\n\n세 학생은 Rwanda 아동, HABIMANA NAHAYO가 만든 그림책 "WHO IS REAL HERO"를 읽었습니다. 이 책을 통해 르완다의 현실을 들여다보고 깊이 이해하며 이야기 속 세계시민의 가치인 EMPATHY와 ACTION을 찾아냈습니다. 나, 우리, 세계의 확장된 범위에서 실천되는 이 가치를 담아 각 학생이 자신만의 이야기를 만들었습니다. 그리고 그 이야기를 이렇게 여러분들과 나누려고 합니다.', rwanda: rwandaParagraphs, artists: [{ name: 'An Hyoju', title: 'Sports Day', scope: 'Around Me', pdf: '/ebooks/ebook1.pdf', video: 'https://youtu.be/QDjUVG9cWek?si=W9UbdQT-qUwxB0OS' }, { name: 'Kim Yuna', title: 'Around Us', scope: 'Around Us', pdf: '/ebooks/ebook2.pdf', video: 'https://youtu.be/zX_ukvCto5g?si=6k4B_Ej6SJwwR-Ax' }, { name: 'Kim Jinseo', title: 'Around the World', scope: 'Around the World', pdf: '/ebooks/ebook3.pdf', video: 'https://www.youtube.com/watch?v=V4_ckQqO9NI' }], activityImages: [] }
const normalizeCmsCopy = (content: CmsState): CmsState => ({
  ...content,
  about: content.about.replaceAll('광주전남통합특별시교육청', '전남광주통합특별시교육청'),
  spotlight: content.spotlight.replaceAll('광주전남통합특별시교육청 장흥교육지원청', '광주전남통합특별시장흥교육지원청').replaceAll('광주전남통합특별시교육청', '전남광주통합특별시교육청'),
})

function SecondFloorPage({ cms }: { cms: CmsState }) {
  return <main className="reading-room"><FloorMarker floor="2F" title="FROM RWANDA" /><header className="reading-head"><div><p className="eyebrow">ARCHIVE · ORIGINAL STORY</p><h1>Who is Real Hero</h1><p className="byline">by Habimana Nahayo <span>(Rwanda)</span></p><blockquote>“In the heart of a bustling town, there lived a kind shoemaker named Kakama, who brought joy to children with his colorful creations. One fateful day, Kakama faced a terrible challenge when robbers attacked him and stole all the beautiful shoes.”</blockquote></div></header><article className="story-column">{cms.rwanda.map((paragraph) => <motion.p key={paragraph.slice(0, 18)} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .18 }} transition={{ duration: .55 }}>{paragraph}</motion.p>)}<motion.aside className="source-card" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}><p>This original story is curated from the Seeds of Empowerment '1001 Stories' platform.</p><a href="https://1001stories.seedsofempowerment.org/" target="_blank" rel="noopener noreferrer">Explore 1001 Stories Platform ↗</a></motion.aside></article></main>
}

const plotStages = [
  { name: 'Exposition', description: 'Introduce the characters and the setting.' },
  { name: 'Rising Action', description: 'Introduce a problem and build the conflict.' },
  { name: 'Climax', description: 'Bring the story to its turning point and reveal its theme.' },
  { name: 'Falling Action', description: 'Show how the main character works to resolve the problem.' },
  { name: 'Resolution', description: 'Show what has changed in the characters or their world.' },
]
function FourthFloorPage({ books, publish, updateBook, notes, addNote, updateNote, deleteNote, openLogin, deleteBook }: { deleteBook: (id: string) => Promise<void>; openLogin: () => void; books: CreatedBook[]; publish: (book: CreatedBook) => Promise<boolean>; updateBook: (book: CreatedBook) => void; notes: MuseumNote[]; addNote: (floor: '3f' | '4f', artistIndex: number | null, bookId: string | null, body: string) => Promise<void>; updateNote: (id: string, body: string) => Promise<void>; deleteNote: (id: string) => Promise<void> }) {
  const { user } = useAuth()
  const [editingBook, setEditingBook] = useState<CreatedBook | null>(null)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setOwnerId(null)
    if (user) void supabase.auth.getUser().then(({ data }) => { if (active) setOwnerId(data.user?.id ?? null) })
    return () => { active = false }
  }, [user])
  const [wizard, setWizard] = useState(false), [openBook, setOpenBook] = useState<CreatedBook | null>(null)
  return <main className="atelier"><FloorMarker floor="4F" title="FROM YOU" /><section className="atelier-head"><p className="eyebrow">ATELIER · MAKE A BOOK</p><h1>Create your own book</h1></section><section className="corridor" aria-label="Published bookshelves">{Array.from({ length: Math.ceil((books.length + 1) / 3) }, (_, row) => <div className="bookshelf-row" key={row}>{row === 0 && <button className="create-frame" onClick={() => { if (user) setWizard(true); else openLogin() }}><span>+</span><strong>Create Your Book</strong><small>BEGIN A NEW BOOK</small></button>}{books.slice(row === 0 ? 0 : row * 3 - 1, row * 3 + 2).map((book) => <div className="shelf-book" key={book.id}>{user && (user.id === 'admin1' || (ownerId && book.owner_id === ownerId)) && <div className="shelf-book-actions"><button onClick={() => setEditingBook(book)}>Edit</button>{user.id === 'admin1' && <button onClick={() => void deleteBook(book.id)}>Delete</button>}</div>}<button className="published-frame" onPointerEnter={() => { void createBookPageSource(book).then((source) => source.render(1, 960)).catch(() => undefined) }} onFocus={() => { void createBookPageSource(book).then((source) => source.render(1, 960)).catch(() => undefined) }} onClick={() => setOpenBook(book)} aria-label={`Read ${book.title}`}><BookCover book={book} /></button></div>)}</div>)}</section><AnimatePresence>{editingBook && <BookWizard key={editingBook.id} initialBook={editingBook} close={() => setEditingBook(null)} publish={publish} />}{wizard && <BookWizard close={() => setWizard(false)} publish={publish} />}{openBook && <PublishedBook book={openBook} updateBook={updateBook} notes={notes.filter((note) => note.floor === '4f' && note.book_id === openBook.id)} addNote={addNote} updateNote={updateNote} deleteNote={deleteNote} close={() => setOpenBook(null)} />}</AnimatePresence></main>
}

function BookWizard({ close, publish, initialBook }: { close: () => void; publish: (book: CreatedBook) => Promise<boolean>; initialBook?: CreatedBook }) {
  const [step, setStep] = useState(initialBook ? 4 : 1)
  const wizardRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { if (wizardRef.current) wizardRef.current.scrollTop = 0 }, [step])
  const [book, setBook] = useState<CreatedBook>(() => initialBook ? {
    ...initialBook,
    pages: plotStages.flatMap((stage, stageIndex) => {
      const pages = initialBook.pages.filter((page, index) => page.plot ? page.plot === stage.name : Math.min(index, 4) === stageIndex)
      return pages.length ? pages.map((page) => ({ ...page, plot: stage.name })) : [{ text: '', plot: stage.name }]
    }),
  } : { id: crypto.randomUUID(), title: '', author: '', synopsis: '', coverColor: coverColors[0].value, pages: plotStages.map((stage) => ({ text: '', plot: stage.name })) })
  const [publishing, setPublishing] = useState(false)
  const [coverMode, setCoverMode] = useState<'color' | 'search' | 'upload'>('color')
  const [query, setQuery] = useState(''), [results, setResults] = useState<Array<{ title: string; image: string; source: string; credit: string; license: string }>>([])
  const [searching, setSearching] = useState(false), [searchError, setSearchError] = useState(''), [uploading, setUploading] = useState(false)
  const update = (key: keyof CreatedBook, value: string) => setBook((old) => ({ ...old, [key]: value }))
  const searchImages = async () => {
    const term = query.trim()
    if (!term) return
    setSearching(true); setSearchError('')
    try {
      const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: `${term} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '18', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '800', format: 'json', origin: '*' })
      const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
      if (!response.ok) throw new Error('The image search service is unavailable. Please try again.')
      const data = await response.json() as { query?: { pages?: Record<string, { title: string; imageinfo?: Array<{ thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }> }> } }
      const images = Object.values(data.query?.pages ?? {}).flatMap((item) => {
        const info = item.imageinfo?.[0]
        if (!info || !(info.thumburl || info.url)) return []
        const clean = (value?: string) => value?.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() ?? ''
        return [{ title: item.title.replace(/^File:/, ''), image: info.thumburl || info.url!, source: info.descriptionurl || info.url || '', credit: clean(info.extmetadata?.Artist?.value) || 'Artist not listed', license: clean(info.extmetadata?.LicenseShortName?.value) || 'Check source page' }]
      })
      setResults(images)
      if (!images.length) setSearchError('No matching images found. Try a different search phrase.')
    } catch (error) { setSearchError(error instanceof Error ? error.message : 'Could not search images.') }
    finally { setSearching(false) }
  }
  const chooseUpload = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { window.alert('Please choose an image file.'); return }
    if (file.size > 8 * 1024 * 1024) { window.alert('Please choose an image smaller than 8 MB.'); return }
    setUploading(true)
    const extension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'jpg'
    const path = `book-covers/${book.id}-${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage.from('museum-assets').upload(path, file, { contentType: file.type, upsert: false })
    setUploading(false)
    if (error) { window.alert(`Could not upload cover image: ${error.message}`); return }
    setBook((old) => ({ ...old, coverImage: supabase.storage.from('museum-assets').getPublicUrl(path).data.publicUrl, coverCredit: '', coverLicense: '', coverSource: '' }))
  }
  const selectSearchImage = (result: typeof results[number]) => setBook((old) => ({ ...old, coverImage: result.image, coverCredit: result.credit, coverLicense: result.license, coverSource: result.source }))
  const setPage = (index: number, text: string) => setBook((old) => ({ ...old, pages: old.pages.map((page, i) => i === index ? { ...page, text } : page) }))
  const next = () => setStep((current) => Math.min(4, current + 1))
  const valid = step === 1 ? Boolean(book.title.trim() && book.author.trim() && book.synopsis.trim()) : step === 4 ? plotStages.every((stage) => book.pages.some((page) => page.plot === stage.name && page.text.trim())) && book.pages.every((page) => page.text.trim()) : true
  const selectedImage = book.coverImage
  return <ExhibitOverlay close={close}><div className="wizard" ref={wizardRef}><div className="wizard-top"><div><p>4F ATELIER · BOOK MAKER</p><h2>{['Story basics', 'Choose a cover', 'Plot structure', 'Write your story'][step - 1]}</h2></div><span>STEP {step} / 4</span></div><div className="wizard-progress">{[1,2,3,4].map((number) => <i className={number <= step ? 'done' : ''} key={number} />)}</div>
    {step === 1 && <div className="wizard-fields"><label>Title<input value={book.title} onChange={(e) => update('title', e.target.value)} placeholder="Your book title" maxLength={100} /></label><label>Author Name<input value={book.author} onChange={(e) => update('author', e.target.value)} placeholder="Your name" maxLength={60} /></label><label>Story Theme<textarea value={book.synopsis} onChange={(e) => update('synopsis', e.target.value)} placeholder="What idea or message will your story explore?" maxLength={500} /></label></div>}
    {step === 2 && <div className="cover-maker"><div className="cover-options">{([['color', 'Choose a color'], ['search', 'Search online'], ['upload', 'Upload a photo']] as const).map(([mode, label]) => <button type="button" className={coverMode === mode ? 'active' : ''} key={mode} onClick={() => setCoverMode(mode)}>{label}</button>)}</div>{coverMode === 'color' && <div className="cover-colors" aria-label="Cover color choices">{coverColors.map((color) => <button type="button" key={color.value} className={book.coverColor === color.value && !selectedImage ? 'picked' : ''} style={{ background: color.value }} aria-label={color.name} title={color.name} onClick={() => setBook((old) => ({ ...old, coverColor: color.value, coverImage: undefined, coverCredit: undefined, coverLicense: undefined, coverSource: undefined }))} />)}</div>}{coverMode === 'search' && <div className="cover-search"><p>Search free-to-use photos on Wikimedia Commons. Please keep the photographer and license credit shown with your selected image.</p><div><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void searchImages() } }} placeholder="For example: forest, ocean, Jangheung" /><button type="button" disabled={searching || !query.trim()} onClick={() => void searchImages()}>{searching ? 'Searching…' : 'Search'}</button></div>{searchError && <small role="status">{searchError}</small>}{results.length > 0 && <div className="cover-results">{results.map((result) => <button type="button" className={book.coverImage === result.image ? 'picked' : ''} key={`${result.source}-${result.image}`} onClick={() => selectSearchImage(result)}><img src={result.image} alt={result.title} loading="lazy" /><span>{result.title}</span><small>{result.credit} · {result.license}</small></button>)}</div>}</div>}{coverMode === 'upload' && <label className="cover-upload"><span className="cover-upload-title">{uploading ? 'Uploading cover…' : 'Choose a photo from your device'}</span><span className="cover-upload-action">Select an image</span><input type="file" accept="image/*" disabled={uploading} onChange={(e) => void chooseUpload(e.target.files?.[0])} /><small>JPG, PNG, or WebP · up to 8 MB</small></label>}<div className="cover-preview"><BookCover book={book} className="wizard-cover-preview" />{book.coverCredit && <small>Image: {book.coverCredit} · {book.coverLicense} · <a href={book.coverSource} target="_blank" rel="noreferrer">Source ↗</a></small>}</div><p className="cover-title-note">The title is always printed in black on a light panel so it stays readable.</p></div>}
    {step === 3 && <section className="plot-guide"><p className="eyebrow">A SHAPE FOR YOUR STORY</p><ol>{plotStages.map((stage) => <li key={stage.name}><strong>{stage.name}</strong><p>{stage.description}</p></li>)}</ol></section>}
    {step === 4 && <div className="pages-maker">{plotStages.map((stage) => <section className="plot-writing-section" key={stage.name}><h3>{stage.name}</h3><p>{stage.description}</p>{book.pages.map((page, index) => page.plot === stage.name && <article key={index}><label>{stage.name} · Page {index + 1}<textarea value={page.text} onChange={(event) => setPage(index, event.target.value)} placeholder={stage.description} maxLength={700} /><small className="page-count">{page.text.length} / 700 characters</small></label>{book.pages.filter((item) => item.plot === stage.name).length > 1 && <button className="delete-page" onClick={() => setBook((old) => ({ ...old, pages: old.pages.filter((_, i) => i !== index) }))}>Remove page</button>}<button className="add-stage-page" onClick={() => setBook((old) => ({ ...old, pages: [...old.pages.slice(0, index + 1), { text: '', plot: stage.name }, ...old.pages.slice(index + 1)] }))}>+ Add a {stage.name} page</button></article>)}</section>)}</div>}
    <div className="wizard-footer"><button onClick={() => step === 1 ? close() : setStep(step - 1)}>← {step === 1 ? 'Cancel' : 'Back'}</button>{step < 4 ? <button className="next-button" disabled={!valid || uploading} onClick={next}>Continue →</button> : <button className="next-button" disabled={!valid || publishing} onClick={async () => { setPublishing(true); try { if (await publish(book)) close() } finally { setPublishing(false) } }}>{publishing ? 'Publishing…' : initialBook ? 'Republish Your Book' : 'Publish Your Book'}</button>}</div></div></ExhibitOverlay>
}

async function getBookOwnerUsername(book: CreatedBook) {
  if (book.ownerUsername) return book.ownerUsername
  if (!book.owner_id) return undefined
  const { data } = await supabase.from('profiles').select('username').eq('id', book.owner_id).maybeSingle()
  return data?.username as string | undefined
}

async function buildCreatedBookPdf(book: CreatedBook) {
  const source = await createBookPageSource(book)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [150, 200] })
  for (let number = 1; number <= source.numPages; number++) {
    const canvas = await source.render(number, 1200)
    if (number > 1) pdf.addPage([150, 200], 'portrait')
    pdf.addImage(canvas.toDataURL('image/jpeg', .92), 'JPEG', 0, 0, 150, 200)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  return pdf
}
async function downloadCreatedBook(book: CreatedBook) {
  try { const pdf = await buildCreatedBookPdf(book); pdf.save((book.title || 'world-museum-book').replace(/[<>:"/\\|?*]/g, '-') + '.pdf') }
  catch (error) { window.alert(error instanceof Error ? error.message : 'Could not download this book.') }
}

function PublishedBook({ book, close, notes, addNote, updateNote, deleteNote }: { book: CreatedBook; close: () => void; updateBook?: (book: CreatedBook) => void; notes: MuseumNote[]; addNote: (floor: '3f' | '4f', artistIndex: number | null, bookId: string | null, body: string) => Promise<void>; updateNote: (id: string, body: string) => Promise<void>; deleteNote: (id: string) => Promise<void> }) {
  const [showGuestbook, setShowGuestbook] = useState(false)
  const [source, setSource] = useState<BookPageSource | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setSource(null); setError('')
    void createBookPageSource(book).then((pages) => { if (active) setSource(pages) })
      .catch((error) => { if (active) setError(error instanceof Error ? error.message : 'Could not open this book.') })
    return () => { active = false }
  }, [book, attempt])
  return <ExhibitOverlay close={close} actions={!showGuestbook && <button className="exhibit-download" onClick={() => void downloadCreatedBook(book)} aria-label="Download book as PDF" title="Download book as PDF"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3" /></svg></button>}>
    <div className="three-floor-book-reader-dialog four-floor-book-reader-dialog" style={{ display: showGuestbook ? 'none' : undefined }}>
      {source ? <InlineBook source={source} title={book.title} onVisitGuestbook={() => setShowGuestbook(true)} /> : <div className="four-reader-loading" role="status"><BookCover book={book} className="reader-loading-cover" /><span>{error || 'Preparing your book…'}</span>{error && <button onClick={() => setAttempt((value) => value + 1)}>Retry</button>}</div>}
    </div>
    {showGuestbook && <section className="book-notes-dashboard four-guestbook-dialog"><p className="eyebrow">GUESTBOOK</p><h2>{book.title}</h2><div className="three-showcase"><InlineGuestbook notes={notes} artistIndex={0} floor="4f" bookId={book.id} addNote={addNote} updateNote={updateNote} deleteNote={deleteNote} /></div><button className="return-to-book" onClick={() => setShowGuestbook(false)}>← Return to the book</button></section>}
  </ExhibitOverlay>
}

const artists = [
  { name: 'An Hyoju', subtitle: 'Around Me', cover: 'THE LITTLE THINGS\nAROUND ME', quote: '“내 주변의 작은 장면들이 하나의 세계가 되었다.”', notes: ['창문 너머의 빛', '나의 책상 위', '오늘의 발견'] },
  { name: 'Kim Yuna', subtitle: 'Around Us', cover: 'THE STORIES\nAROUND US', quote: '“우리가 함께 바라본 풍경을 책 속에 남겼어요.”', notes: ['우리 반의 목소리', '함께 걷는 길', '서로의 색'] },
  { name: 'Kim Jinseo', subtitle: 'Around the World', cover: 'A WORLD\nIN MY HANDS', quote: '“먼 곳의 이야기도 마음으로는 아주 가까워요.”', notes: ['르완다의 친구', '같은 하늘 아래', '세계로 가는 지도'] },
]

function ThreeFPage({ notes, addNote, updateNote, deleteNote, cms }: { notes: MuseumNote[]; addNote: (floor: '3f' | '4f', artistIndex: number | null, bookId: string | null, body: string) => Promise<void>; updateNote: (id: string, body: string) => Promise<void>; deleteNote: (id: string) => Promise<void>; cms: CmsState }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [showBook, setShowBook] = useState(false)
  useEffect(() => {
    defaultCms.artists.forEach((fallback, index) => {
      const source = cms.artists[index]?.pdf?.trim() || fallback.pdf
      if (source) void preloadBookPreview(source).catch(() => undefined)
    })
  }, [cms.artists])
  const activeIndex = selected ?? 0
  const saved = cms.artists[activeIndex]
  const fallback = defaultCms.artists[activeIndex]
  const artist = { ...artists[activeIndex], name: saved?.name || fallback.name, subtitle: saved?.scope || fallback.scope }
  const bookTitle = saved?.title?.trim() && saved.title !== fallback.title ? saved.title : canonicalBookTitles[activeIndex]
  const pdf = saved?.pdf?.trim() || fallback.pdf!
  const video = saved?.video?.trim() || fallback.video!
  const selectedNotes = selected === null ? [] : notes.filter((note) => note.floor === '3f' && note.artist_index === selected)
  const scopes = [<>Around <em>Me</em></>, <>Around <em>Us</em></>, <>Around <em>the Wo<span className="world-r-star">r<svg aria-hidden="true" viewBox="0 0 100 100" focusable="false">{Array.from({ length: 24 }, (_, ray) => <path key={ray} d="M50 2 L52 27 L48 27 Z" transform={`rotate(${ray * 15} 50 50)`} />)}<circle cx="50" cy="50" r="18" /></svg></span>ld</em></>]
  return <main className="three-floor"><FloorMarker floor="3F" title="FROM JANGHEUNG, KOREA" /><section className="three-head">
    <div className="three-scope-picker"><p className="eyebrow">STUDENT AUTHORS · RE-CREATIONS</p><div className="artist-tabs scope-tabs" role="tablist" aria-label="Choose the scope of the story">{defaultCms.artists.map((_, index) => <button key={index} type="button" role="tab" aria-label={['Around Me', 'Around Us', 'Around the World'][index]} aria-selected={selected === index} onClick={() => { setSelected(index); setShowBook(false) }} className={`scope-${['me', 'us', 'world'][index]}${selected === index ? ' active' : ''}`}>{scopes[index]}</button>)}</div>{selected === null && <p className="scope-instruction" aria-live="polite">Choose a story to explore</p>}</div>
  </section>{selected !== null && <AnimatePresence mode="wait"><motion.div className="selected-story" key={selected} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .01 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .75, ease: [0.22, 1, 0.36, 1] }}><header className="three-story-heading"><h1>{bookTitle}<span className="book-author">{artist.name}</span></h1></header><section className="three-gallery inline-exhibition three-showcase" aria-label="Story exhibition">
    <div className="showcase-column showcase-book-column"><p className="showcase-label">THE BOOK</p><button className="showcase-cover-button" onPointerEnter={() => { void preloadBookReader(pdf).catch(() => undefined) }} onFocus={() => { void preloadBookReader(pdf).catch(() => undefined) }} onClick={() => setShowBook(true)} aria-label={`Read ${bookTitle}`}><InlineBook key={pdf} src={pdf} title={bookTitle} preview /></button></div>
    <div className="showcase-column showcase-film-column"><p className="showcase-label">DOCENT FILM</p><InlineVideo key={video} source={video} /></div>
    <div className="showcase-column showcase-guestbook"><div className="showcase-guestbook-heading"><p className="showcase-label">GUESTBOOK</p></div><InlineGuestbook notes={selectedNotes} artistIndex={selected} addNote={addNote} updateNote={updateNote} deleteNote={deleteNote} /></div>
  </section></motion.div></AnimatePresence>}<AnimatePresence>{selected !== null && showBook && <BookReadingModal src={pdf} title={bookTitle} close={() => setShowBook(false)} />}</AnimatePresence></main>
}

function BookReadingModal({ src, title, close }: { src: string; title: string; close: () => void }) {
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const body = document.body
    const root = document.documentElement
    const scrollY = window.scrollY
    const previousOverflow = body.style.overflow
    const previousRootOverflow = root.style.overflow
    document.body.style.overflow = 'hidden'
    root.style.overflow = 'hidden'
    dialog.current?.focus({ preventScroll: true })
    return () => {
      body.style.overflow = previousOverflow
      root.style.overflow = previousRootOverflow
      if (window.scrollY !== scrollY) window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' })
      previous?.focus({ preventScroll: true })
    }
  }, [])
  return <motion.div className="three-floor-book-reader-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
    <div className="three-floor-book-reader-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
      if (e.key === 'Escape') close()
      if (e.key === 'Tab') {
        const focusable = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'))
        const first = focusable[0], last = focusable[focusable.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }}><button className="three-floor-book-reader-close" aria-label="Close book" onClick={close}>×</button><InlineBook src={src} title={title} /></div>
  </motion.div>
}

function InlineVideo({ source }: { source: string }) {
  const iframe = useRef<HTMLIFrameElement>(null)
  const identity = useRef<object>({})
  useEffect(() => {
    let disposed = false
    let player: { destroy: () => void } | undefined
    const token = identity.current
    if (iframe.current) void loadYouTubeApi().then((api) => {
      if (disposed || !iframe.current) return
      player = new api.Player(iframe.current, { events: { onStateChange: ({ data }) => { if (!disposed) setVideoPlaying(token, data === 1 || data === 3) } } })
    })
    return () => { disposed = true; player?.destroy(); setVideoPlaying(token, false) }
  }, [source])
  let videoId = ''
  try {
    const url = new URL(source)
    if (url.hostname === 'youtu.be') videoId = url.pathname.slice(1).split('/')[0]
    else if (['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(url.hostname)) videoId = url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1] || ''
  } catch { /* Non-YouTube file source. */ }
  const validId = /^[\w-]{11}$/.test(videoId)
  return <div className="showcase-video" aria-label="Student story video">
    <div className="video-frame-mat">{validId ? <iframe ref={iframe} src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0&controls=1&origin=${encodeURIComponent(window.location.origin)}`} title="Student story video" loading="eager" referrerPolicy="origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /> : /^(data:video\/|blob:|\/)/.test(source) ? <video src={source} controls playsInline onPlay={() => setVideoPlaying(identity.current, true)} onPause={() => setVideoPlaying(identity.current, false)} onEnded={() => setVideoPlaying(identity.current, false)} onError={() => setVideoPlaying(identity.current, false)} /> : <div className="inline-video-message">Please check the video URL.</div>}</div>
  </div>
}

function InlineGuestbook({ notes, artistIndex, floor = '3f', bookId, addNote, updateNote, deleteNote }: { floor?: '3f' | '4f'; bookId?: string; notes: MuseumNote[]; artistIndex: number; addNote: (floor: '3f' | '4f', artistIndex: number | null, bookId: string | null, body: string) => Promise<void>; updateNote: (id: string, body: string) => Promise<void>; deleteNote: (id: string) => Promise<void> }) {
  const { user } = useAuth()
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const guestKeys = useRef(new Map<string, string>())
  const [guestIds, setGuestIds] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  useEffect(() => {
    const keys = guestKeys.current
    const endSession = () => {
      for (const [id, token] of keys) void guestbookClient.rpc('wm_end_guest_note_session', { p_id: id, p_token: token })
      keys.clear()
    }
    setGuestIds([])
    setEditingId(null)
    window.addEventListener('pagehide', endSession)
    return () => { window.removeEventListener('pagehide', endSession); endSession() }
  }, [floor, artistIndex, bookId, user?.id])
  const notify = (note: MuseumNote | { id: string; deleted: true }) => window.dispatchEvent(new CustomEvent('museum-guest-note', { detail: note }))
  const remove = async (note: MuseumNote) => {
    const token = guestKeys.current.get(note.id)
    if (!token) { await deleteNote(note.id); return }
    setSaving(true); setErrorMessage('')
    try {
      const { error } = await guestbookClient.rpc('wm_delete_guest_note', { p_id: note.id, p_token: token })
      if (error) throw error
      guestKeys.current.delete(note.id); setGuestIds((ids) => ids.filter((id) => id !== note.id)); notify({ id: note.id, deleted: true })
    } catch { setErrorMessage('Could not delete your note. Please try again.') }
    finally { setSaving(false) }
  }
  const colors = ['#f2e5a8', '#e3ebe0', '#efe0d9', '#e7e1ef', '#dce8ec', '#f0e2ca']
  const noteStyle = (id: string) => {
    const hash = Array.from(id).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7)
    return { backgroundColor: colors[hash % colors.length], transform: `rotate(${((hash % 7) - 3) * 0.18}deg)` }
  }
  const canManage = (note: MuseumNote) => Boolean((user && (user.role === 'teacher' || (note.owner_role !== 'guest' && note.owner_username === user.id))) || (note.owner_role === 'guest' && guestIds.includes(note.id)))
  const submitNew = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.trim() || saving) return
    setSaving(true); setErrorMessage('')
    try {
      if (user) await addNote(floor, floor === '3f' ? artistIndex : null, bookId ?? null, draft.trim())
      else {
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => value.toString(16).padStart(2, '0')).join('')
        const { data, error } = await guestbookClient.rpc('wm_add_guest_note', { p_floor: floor, p_artist_index: floor === '3f' ? artistIndex : null, p_book_id: bookId ?? null, p_body: draft.trim(), p_token: token })
        if (error || !data) throw error || new Error('No note returned')
        const note = data as MuseumNote
        guestKeys.current.set(note.id, token); setGuestIds((ids) => [...ids, note.id]); notify(note)
      }
      setDraft('')
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Could not post your note. Please try again.'); }
    finally { setSaving(false) }
  }
  const submitEdit = async (event: FormEvent, id: string) => {
    event.preventDefault()
    if (!editDraft.trim() || saving) return
    setSaving(true); setErrorMessage('')
    try {
      const token = guestKeys.current.get(id)
      if (token) {
        const { data, error } = await guestbookClient.rpc('wm_update_guest_note', { p_id: id, p_body: editDraft.trim(), p_token: token })
        if (error || !data) throw error || new Error('No note returned')
        notify(data as MuseumNote)
      } else await updateNote(id, editDraft.trim())
      setEditingId(null); setEditDraft('')
    } catch { setErrorMessage('Could not update your note. Please try again.') }
    finally { setSaving(false) }
  }
  return <div className="guestbook-list">
    {notes.map((note) => <article className="guestbook-entry" key={note.id} style={noteStyle(note.id)}>
      {canManage(note) && editingId !== note.id && <div className="guestbook-note-actions"><button type="button" onClick={() => { setEditingId(note.id); setEditDraft(note.body) }}>Edit</button><button type="button" disabled={saving} onClick={() => void remove(note)}>Delete</button></div>}
      <small className="guestbook-author">{note.owner_role === 'guest' ? 'GUEST' : note.owner_role.toUpperCase() + ' · ' + note.owner_username.slice(0, 3) + '***'}</small>
      {editingId === note.id ? <form className="guestbook-edit" onSubmit={(event) => void submitEdit(event, note.id)}><textarea aria-label="Edit guestbook note" maxLength={1000} value={editDraft} onChange={(event) => setEditDraft(event.target.value)} /><div><button type="submit" disabled={saving || !editDraft.trim()}>Save</button><button type="button" onClick={() => setEditingId(null)}>Cancel</button></div></form> : <p>{note.body}</p>}
    </article>)}
    <form className="guestbook-compose" onSubmit={(event) => void submitNew(event)}><label htmlFor={`guestbook-note-${artistIndex}`}>Leave a note or question</label><textarea id={`guestbook-note-${artistIndex}`} maxLength={1000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write your note…" /><button type="submit" disabled={saving || !draft.trim()}>{saving ? 'Saving…' : 'Add a note'}</button></form>
    {errorMessage && <p className="guestbook-save-error" role="alert">{errorMessage}</p>}
  </div>
}

function ExhibitOverlay({ children, close, actions }: { children: ReactNode; close: () => void; actions?: ReactNode }) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', escape)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', escape) }
  }, [close])
  return <motion.div className="exhibit-overlay" role="dialog" aria-modal="true" aria-label="Museum exhibit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><motion.div className="exhibit-dialog-shell" onMouseDown={(event) => event.stopPropagation()} initial={{ scale: .96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .96, opacity: 0 }}><div className="exhibit-dialog-toolbar">{actions}<button className="overlay-close" aria-label="Close dialog" onClick={close}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" /></svg></button></div>{children}</motion.div></motion.div>
}

function SupportEmailSetting() {
  const [email, setEmail] = useState(''), [message, setMessage] = useState('Loading contact email…'), [saving, setSaving] = useState(false)
  useEffect(() => {
    void supabase.from('site_settings').select('setting_value').eq('setting_key', 'support_email').maybeSingle().then(({ data, error }) => {
      setEmail(data?.setting_value ?? 'duwlsey@naver.com')
      setMessage(error ? 'Could not load the saved address. Apply the latest database schema.' : '')
    })
  }, [])
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setMessage('')
    const { error } = await supabase.from('site_settings').update({ setting_value: email.trim(), updated_at: new Date().toISOString() }).eq('setting_key', 'support_email')
    setSaving(false); setMessage(error ? `Could not save: ${error.message}` : 'Contact email saved.')
  }
  return <section className="admin-email-panel"><h1 className="admin-view-title">Password Recovery Contact</h1><p className="admin-email-description">Used for student help requests</p><form className="cms-editor" onSubmit={save}><label>Administrator email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="cms-save" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save email'}</button>{message && <small>{message}</small>}</form></section>
}

function AdminPanel() {
  const { user, accounts, setAuthor, resetPassword } = useAuth(); const navigate = useNavigate()
  useEffect(() => { if (user?.role !== 'teacher') navigate('/', { replace: true }) }, [user, navigate])
  if (user?.role !== 'teacher') return null
  return <main className="admin-panel"><h1 className="admin-view-title">Account Management</h1><section><div className="admin-section-head"><h2>Accounts</h2><span>{accounts.length} registered students</span></div><div className="admin-table"><div className="admin-row admin-label"><span>ID</span><span>Role</span><span>Actions</span></div>{accounts.map((account) => <div className="admin-row" key={account.id}><span>{account.id}</span><span>{roleLabel[account.role]}</span><span><button onClick={() => setAuthor(account.id)}>{account.role === 'author' ? 'Remove Author' : 'Make Author ✏️'}</button><button onClick={() => resetPassword(account.id)}>Reset</button></span></div>)}</div></section></main>
}

function CmsDashboard({ cms, saveCms, books, deleteBook, updateBook, notes, addNote, updateNote, deleteNote }: { cms: CmsState; saveCms: (next: CmsState) => void; books: CreatedBook[]; deleteBook: (id: string) => Promise<void>; updateBook: (book: CreatedBook) => Promise<void>; notes: MuseumNote[]; addNote: (floor: '3f' | '4f', artistIndex: number | null, bookId: string | null, body: string) => Promise<void>; updateNote: (id: string, body: string) => Promise<void>; deleteNote: (id: string) => Promise<void> }) {
  const [tab, setTab] = useState<'1f' | '2f' | '3f' | '4f'>('1f'); const [draft, setDraft] = useState(cms); const [openBook, setOpenBook] = useState<CreatedBook | null>(null)
  useEffect(() => setDraft(cms), [cms]); const set = (key: keyof CmsState, value: CmsState[keyof CmsState]) => setDraft({ ...draft, [key]: value }); const updateArtist = (index: number, key: keyof CmsArtist, value: string) => set('artists', draft.artists.map((artist, artistIndex) => artistIndex === index ? { ...artist, [key]: value } : artist)); const fileToUrl = async (file: File, folder: string, apply: (value: string) => void) => { const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_'); const path = `${folder}/${crypto.randomUUID()}-${safeName}`; const { error } = await supabase.storage.from('museum-assets').upload(path, file, { contentType: file.type, upsert: false }); if (error) { window.alert(`Could not upload file: ${error.message}`); return } apply(supabase.storage.from('museum-assets').getPublicUrl(path).data.publicUrl) }
  const download = (book: CreatedBook) => { const pdf = new jsPDF(); pdf.setFontSize(22); pdf.text(book.title, 20, 24); pdf.setFontSize(12); pdf.text(`by ${book.author}`, 20, 34); if (book.synopsis) pdf.text(pdf.splitTextToSize(book.synopsis, 165), 20, 48); book.pages.forEach((page, index) => { pdf.addPage(); pdf.setFontSize(9); pdf.text(`PAGE ${index + 1}`, 20, 18); pdf.setFontSize(12); const lines = pdf.splitTextToSize(page.text || '', 165); pdf.text(lines, 20, 30) }); pdf.save(`${book.title || 'world-museum-book'}.pdf`) }
  return <section className="cms-tabs"><nav>{([['1f','1F DOCENT'],['2f','2F RWANDA'],['3f','3F JANGHEUNG'],['4f','4F FROM YOU']] as const).map(([value,label]) => <button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{label}</button>)}</nav><div className="cms-editor">{tab === '1f' && <><h3>1F DOCENT</h3><label>Section 1 · Introduction<textarea value={draft.about} onChange={(e) => set('about', e.target.value)} /></label>{draft.framework.map((text,index) => <label key={index}>Section 2 · Framework {index + 1}<textarea value={text} onChange={(e) => set('framework', draft.framework.map((item,itemIndex) => itemIndex === index ? e.target.value : item))} /></label>)}<label>Section 3 · Spotlight<textarea value={draft.spotlight} onChange={(e) => set('spotlight', e.target.value)} /></label><label>Activity image upload<input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void fileToUrl(file, 'cms/activity', (url) => set('activityImages', [...draft.activityImages, url])) }} /></label><div className="cms-assets">{draft.activityImages.map((image,index) => <span key={image}><img src={image} alt="Activity" /><button onClick={() => set('activityImages', draft.activityImages.filter((_, itemIndex) => itemIndex !== index))}>Delete</button></span>)}</div><button className="cms-save" onClick={() => saveCms(draft)}>Save 1F</button></>}{tab === '2f' && <><h3>2F RWANDA</h3>{draft.rwanda.map((text,index) => <label key={index}>Paragraph {index + 1}<textarea value={text} onChange={(e) => set('rwanda', draft.rwanda.map((item,itemIndex) => itemIndex === index ? e.target.value : item))} /></label>)}<button className="cms-save" onClick={() => saveCms(draft)}>Save 2F</button></>}{tab === '3f' && <><h3>3F JANGHEUNG</h3>{draft.artists.map((artist,index) => <article className="cms-artist" key={index}><label>Student name<input value={artist.name} onChange={(e) => updateArtist(index,'name',e.target.value)} /></label><label>Book title<input value={artist.title} onChange={(e) => updateArtist(index,'title',e.target.value)} /></label><label>Scope<input value={artist.scope} onChange={(e) => updateArtist(index,'scope',e.target.value)} /></label><label>Book PDF<input type="file" accept="application/pdf" onChange={(e) => { const file=e.target.files?.[0]; if(file) void fileToUrl(file,'cms/ebooks',(url)=>updateArtist(index,'pdf',url)) }} />{artist.pdf && <small>PDF attached</small>}</label><label>Video URL<input value={artist.video ?? ''} onChange={(e) => updateArtist(index,'video',e.target.value)} placeholder="YouTube URL" /></label></article>)}<button className="cms-save" onClick={() => saveCms(draft)}>Save 3F</button></>}{tab === '4f' && <><h3>4F FROM YOU</h3><div className="cms-books">{books.length ? books.map((book) => <article key={book.id}><strong>{book.title}</strong><small>by {book.author}</small><button onClick={() => setOpenBook(book)}>View e-Book</button><button onClick={() => download(book)}>Download PDF</button><button onClick={() => void deleteBook(book.id)}>Delete</button></article>) : <p>No published books yet.</p>}</div></>}</div><AnimatePresence>{openBook && <PublishedBook book={openBook} updateBook={updateBook} notes={notes.filter((note) => note.floor === '4f' && note.book_id === openBook.id)} addNote={addNote} updateNote={updateNote} deleteNote={deleteNote} close={() => setOpenBook(null)} />}</AnimatePresence></section>
}
function FooterSetting({ cms, saveCms }: { cms: CmsState; saveCms: (next: CmsState) => Promise<boolean> }) {
  const [draft, setDraft] = useState<FooterContent>(cms.footer ?? defaultFooter)
  const [saving, setSaving] = useState(false), [message, setMessage] = useState('')
  useEffect(() => { setDraft(cms.footer ?? defaultFooter) }, [cms.footer])
  return <section className="footer-settings"><h1 className="admin-view-title">Footer Management</h1><form className="cms-editor" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setMessage(''); try { if (await saveCms({ ...cms, footer: { ...draft, email: draft.email.trim() } })) setMessage('Footer saved.') } finally { setSaving(false) } }}>{([['copyright', 'Copyright text'], ['projectLabel', 'Project link text'], ['teacherLabel', 'Teacher link text'], ['email', 'Teacher email']] as const).map(([key, label]) => <label key={key}>{label}<input required type={key === 'email' ? 'email' : 'text'} value={draft[key]} onChange={(event) => { setDraft({ ...draft, [key]: event.target.value }); setMessage('') }} /></label>)}<button className="cms-save" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save footer'}</button>{message && <small role="status">{message}</small>}</form></section>
}

function MusicSetting({ cms, saveCms }: { cms: CmsState; saveCms: (next: CmsState) => Promise<boolean> }) {
  const [file, setFile] = useState<File | null>(null), [saving, setSaving] = useState(false), [message, setMessage] = useState('')
  const upload = async (event: FormEvent) => {
    event.preventDefault(); if (!file || saving) return
    setSaving(true); setMessage('')
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('Choose a file smaller than 50 MB.')
      const context = new AudioContext()
      try { const buffer = await context.decodeAudioData(await file.arrayBuffer()); if (buffer.duration < 5) throw new Error('Choose a track at least 5 seconds long.') } finally { await context.close() }
      const path = 'cms/music/' + crypto.randomUUID() + '-' + file.name.replace(/[^A-Za-z0-9._-]/g, '_')
      const extension = file.name.split('.').pop()?.toLowerCase()
      const mime = extension === 'mp3' ? 'audio/mpeg' : extension === 'wav' ? 'audio/wav' : extension === 'm4a' ? 'audio/mp4' : file.type
      const { error } = await supabase.storage.from('museum-assets').upload(path, file, { contentType: mime, upsert: false })
      if (error) throw new Error(error.message)
      const url = supabase.storage.from('museum-assets').getPublicUrl(path).data.publicUrl
      if (await saveCms({ ...cms, music: { url, name: file.name } })) { setMessage('Background music saved.'); setFile(null) }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not upload music.') }
    finally { setSaving(false) }
  }
  return <section className="music-settings"><h1 className="admin-view-title">Music Management</h1><p className="admin-email-description">Each repeat fades in for 3 seconds and fades out for 3 seconds. Music starts automatically when the browser allows it, or after the first click or tap. Visitors can turn it off with the sound button in the footer.</p>{cms.music?.url && <div className="music-current"><small>CURRENT TRACK</small><p>{cms.music.name}</p><audio key={cms.music.url} controls preload="none" src={cms.music.url} /></div>}<form className="cms-editor" onSubmit={upload}><label>Upload background music<input type="file" accept=".mp3,.wav,.m4a,.ogg,audio/*" disabled={saving} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setMessage('') }} /><small>MP3, WAV, M4A or OGG · up to 50 MB · at least 5 seconds</small></label><button className="cms-save" type="submit" disabled={!file || saving}>{saving ? 'Uploading…' : 'Upload & use this track'}</button>{message && <small role="status">{message}</small>}</form></section>
}

function AdminArea({ books, deleteBook, updateBook, notes, deleteNote, addNote, updateNote, cms, saveCms }: { books: CreatedBook[]; deleteBook: (id: string) => Promise<void>; updateBook: (book: CreatedBook) => Promise<void>; notes: MuseumNote[]; deleteNote: (id: string) => Promise<void>; addNote: (floor: '3f' | '4f', artistIndex: number | null, bookId: string | null, body: string) => Promise<void>; updateNote: (id: string, body: string) => Promise<void>; cms: CmsState; saveCms: (next: CmsState) => Promise<boolean> }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [section, setSection] = useState<'accounts' | 'email' | 'pages' | 'footer' | 'music'>('accounts')
  useEffect(() => { if (user?.id !== 'admin1') navigate('/', { replace: true }) }, [user, navigate])
  if (user?.id !== 'admin1') return null
  return <div className="admin-workspace"><nav className="admin-management-tabs" role="tablist" aria-label="Administrator management">{([['accounts', 'Account Management'], ['email', 'Admin Email'], ['pages', 'Page Management'], ['footer', 'Footer Management'], ['music', 'Music Management']] as const).map(([value, label]) => <button id={'admin-tab-' + value} aria-controls={'admin-panel-' + value} role="tab" aria-selected={section === value} tabIndex={section === value ? 0 : -1} className={section === value ? 'active' : ''} key={value} onClick={() => setSection(value)} onKeyDown={(event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const tabs = ['accounts', 'email', 'pages', 'footer', 'music'] as const
      const next = tabs[(tabs.indexOf(value) + (event.key === 'ArrowRight' ? 1 : 4)) % 5]
      setSection(next); document.getElementById('admin-tab-' + next)?.focus()
    }
  }}>{label}</button>)}</nav>
  <div id="admin-panel-accounts" role="tabpanel" aria-labelledby="admin-tab-accounts" hidden={section !== 'accounts'}><AdminPanel /></div>
  <div id="admin-panel-email" role="tabpanel" aria-labelledby="admin-tab-email" hidden={section !== 'email'}><SupportEmailSetting /></div>
  <div id="admin-panel-music" role="tabpanel" aria-labelledby="admin-tab-music" hidden={section !== 'music'}><MusicSetting cms={cms} saveCms={saveCms} /></div><div id="admin-panel-footer" role="tabpanel" aria-labelledby="admin-tab-footer" hidden={section !== 'footer'}><FooterSetting cms={cms} saveCms={saveCms} /></div><div id="admin-panel-pages" role="tabpanel" aria-labelledby="admin-tab-pages" hidden={section !== 'pages'}><CmsDashboard cms={cms} saveCms={saveCms} books={books} deleteBook={deleteBook} updateBook={updateBook} notes={notes} addNote={addNote} updateNote={updateNote} deleteNote={deleteNote} /></div>
  </div>
}

function AuthModal({ mode, close }: { mode: 'login' | 'signup' | null; close: () => void }) {
  const { login, signup, isUsernameAvailable, getSecurityQuestion, resetWithSecurityAnswer, sendRecoveryRequest } = useAuth()
  const [error, setError] = useState(''), [id, setId] = useState(''), [password, setPassword] = useState(''), [confirmPassword, setConfirmPassword] = useState('')
  const [available, setAvailable] = useState<boolean | null>(null), [checkingId, setCheckingId] = useState(false), [submitting, setSubmitting] = useState(false)
  const [recovery, setRecovery] = useState<'none' | 'find-id' | 'password'>('none'), [recoveryQuestion, setRecoveryQuestion] = useState(''), [answer, setAnswer] = useState('')
  const navigate = useNavigate()
  const isPasswordValid = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,32}$/.test(password)
  const passwordsMatch = password === confirmPassword

  useEffect(() => {
    if (mode !== 'signup' || !id) { setAvailable(null); setCheckingId(false); return }
    let cancelled = false
    setAvailable(null); setCheckingId(true)
    const timer = window.setTimeout(() => { void isUsernameAvailable(id).then((result) => { if (!cancelled) { setAvailable(result); setCheckingId(false) } }) }, 300)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [id, mode, isUsernameAvailable])

  if (!mode) return null
  const handle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError('')
    const data = new FormData(event.currentTarget)
    const result = mode === 'login'
      ? await login(id, password)
      : await signup({ id, nickname: id, role: 'student', question: String(data.get('question') ?? '') }, password, String(data.get('answer') ?? ''))
    setSubmitting(false)
    if (result) setError(result)
    else { close(); navigate('/') }
  }
  const findQuestion = async () => {
    setSubmitting(true); setError('')
    const result = await getSecurityQuestion(id)
    setSubmitting(false)
    if (result.error) setError(result.error)
    else setRecoveryQuestion(result.question ?? '')
  }
  const doPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isPasswordValid || !passwordsMatch) { setError('Enter matching passwords with letters and numbers.'); return }
    setSubmitting(true); setError('')
    const result = await resetWithSecurityAnswer(id, answer, password)
    setSubmitting(false)
    if (result) setError(result)
    else { setError('Password changed. You can now log in with your new password.'); setRecovery('none'); setRecoveryQuestion(''); setAnswer(''); setPassword(''); setConfirmPassword('') }
  }
  const sendRequest = async () => {
    setSubmitting(true); const result = await sendRecoveryRequest(id); setSubmitting(false)
    setError(result ?? 'Request sent. The teacher will review it within one hour.')
  }
  const signupReady = Boolean(id && available && isPasswordValid && passwordsMatch && !checkingId)
  return <AnimatePresence><motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={close}><motion.div className="auth-modal" onMouseDown={(event) => event.stopPropagation()} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}><button type="button" className="close" onClick={close}>×</button><p>WORLD MUSEUM ACCOUNT</p>
    {recovery === 'find-id' ? <><h2>Find your ID.</h2><p>For account privacy, ID recovery is handled by the teacher. Please call <a href="tel:0618646604">061-864-6604</a>.</p><button className="submit" onClick={() => { setRecovery('none'); setError('') }}>Back to sign in</button></> : recovery === 'password' ? <><h2>Change your password.</h2><p>Verify your security answer to choose a new password.</p><label>ID<input required value={id} onChange={(event) => { setId(event.target.value.replace(/\s+/g, '').toLowerCase()); setRecoveryQuestion(''); setError('') }} placeholder="Your account ID" /></label>{!recoveryQuestion ? <button className="submit" type="button" disabled={!id || submitting} onClick={() => void findQuestion()}>{submitting ? 'Checking…' : 'Continue'}</button> : <form onSubmit={doPasswordReset}><p className="recovery-question">{recoveryQuestion}</p><label>Answer<input required value={answer} onChange={(event) => setAnswer(event.target.value.replace(/\s+/g, ''))} placeholder="No spaces" /></label><label>New Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 32))} placeholder="6–32 characters, letters and numbers" /></label><label>Confirm New Password<input required type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 32))} placeholder="Repeat your new password" /></label><button className="submit" disabled={submitting || !isPasswordValid || !passwordsMatch}>{submitting ? 'Please wait…' : 'Set New Password'}</button></form>}{error && <small className="form-error">{error}</small>}{recoveryQuestion && error && !error.startsWith('Password changed') && <button type="button" className="submit" disabled={submitting} onClick={() => void sendRequest()}>Email the teacher for help</button>}<button type="button" onClick={() => { setRecovery('none'); setRecoveryQuestion(''); setError('') }}>Back to sign in</button></> : <><h2>{mode === 'login' ? 'Welcome back.' : 'Create your pass.'}</h2><form onSubmit={handle}><label>ID<input required name="id" value={id} onChange={(event) => { setId(event.target.value.replace(/\s+/g, '').toLowerCase()); setError('') }} autoComplete="username" placeholder="Letters and numbers" /></label>{mode === 'signup' && id && <small className={available ? 'form-success' : 'form-error'}>{checkingId ? 'Checking username…' : available ? 'Username is available' : 'Username already taken or invalid'}</small>}{mode === 'signup' && <><label>Security Question<select required name="question" defaultValue=""><option value="" disabled>Select a question</option><option>가장 좋아하는 책은? (What is your favorite book?)</option><option>첫 번째 반려동물의 이름은? (What was the name of your first pet?)</option><option>가장 좋아하는 음식은? (What is your favorite food?)</option><option>태어난 도시는 어디인가요? (In what city were you born?)</option><option>가장 좋아하는 색깔은? (What is your favorite color?)</option></select></label><label>Answer<input required name="answer" onChange={(event) => { event.target.value = event.target.value.replace(/\s+/g, '') }} placeholder="No spaces" /></label></>}<label>Password<input required name="password" value={password} onChange={(event) => { setPassword(event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 32)); setError('') }} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'signup' ? '6–32 characters, letters and numbers' : 'Enter your password'} /></label>{mode === 'signup' && <><label>Confirm Password<input required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 32))} type="password" autoComplete="new-password" placeholder="Repeat your password" /></label>{password && (!isPasswordValid || !passwordsMatch) && <small className="form-error">{!isPasswordValid ? 'Use 6–32 letters and numbers, including at least one of each.' : 'Passwords do not match.'}</small>}</>}{error && <small className="form-error">{error}</small>}<button className="submit" disabled={submitting || (mode === 'signup' && !signupReady)} type="submit">{submitting ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Pass'}</button></form>{mode === 'login' && <div className="auth-recovery-links"><button type="button" onClick={() => { setRecovery('find-id'); setError('') }}>Find ID</button><button type="button" onClick={() => { setRecovery('password'); setRecoveryQuestion(''); setAnswer(''); setPassword(''); setConfirmPassword(''); setError('') }}>Change / Reset Password</button></div>}</>}
    </motion.div></motion.div></AnimatePresence>
}

function ForcedPasswordChange() {
  const { user, changePassword, logout } = useAuth()
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false)
  if (!user?.mustChangePassword) return null
  const valid = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,32}$/.test(password)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!valid || password !== confirm) { setError('Use matching passwords with 6–32 letters and numbers.'); return }
    setSaving(true); setError('')
    const result = await changePassword(password)
    setSaving(false)
    if (result) setError(result)
  }
  return <div className="modal-backdrop"><form className="auth-modal" onSubmit={submit}><p>ACCOUNT SECURITY</p><h2>Choose a new password.</h2><p>Your temporary password must be changed before continuing.</p><label>New Password<input required type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 32))} placeholder="6–32 characters, letters and numbers" /></label><label>Confirm Password<input required type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 32))} placeholder="Repeat your new password" /></label>{error && <small className="form-error">{error}</small>}<button className="submit" disabled={saving || !valid || password !== confirm}>{saving ? 'Saving…' : 'Change Password'}</button><button type="button" onClick={() => void logout()}>Log out</button></form></div>
}
function LoginRoute() { const navigate = useNavigate(); return <AuthModal mode="login" close={() => navigate('/')} /> }

export default function App() {
  const { user: currentAccount } = useAuth()
  const [header, setHeader] = useState(false), [authMode, setAuthMode] = useState<'login' | 'signup' | null>(null)
  const [books, setBooks] = useState<CreatedBook[]>([])
  const [contentNotes, setContentNotes] = useState<MuseumNote[]>([])
  useEffect(() => {
    const receive = (event: Event) => {
      const note = (event as CustomEvent<MuseumNote | { id: string; deleted: true }>).detail
      setContentNotes((previous) => 'deleted' in note ? previous.filter((item) => item.id !== note.id) : previous.some((item) => item.id === note.id) ? previous.map((item) => item.id === note.id ? note : item) : [note, ...previous])
    }
    window.addEventListener('museum-guest-note', receive)
    return () => window.removeEventListener('museum-guest-note', receive)
  }, [])
  const [cms, setCms] = useState<CmsState>(defaultCms)
  const { playing: sound, toggle: toggleSound } = useBackgroundMusic(cms.music?.url); const { pathname } = useLocation()
  useEffect(() => {
    let active = true
    void Promise.all([
      supabase.from('world_museum_site_content').select('payload').eq('id', 1).maybeSingle(),
      supabase.from('world_museum_books').select('payload,owner_id').order('created_at', { ascending: false }),
      supabase.from('world_museum_notes').select('*').order('created_at', { ascending: false }),
    ]).then(([siteResult, booksResult, notesResult]) => {
      if (!active) return
      if (siteResult.error) console.error('Could not load shared museum content:', siteResult.error.message)
      const payload = siteResult.data?.payload as { cms?: Partial<CmsState> } | null
      if (payload?.cms) setCms(normalizeCmsCopy({ ...defaultCms, ...payload.cms, artists: defaultCms.artists.map((artist, index) => ({ ...artist, ...payload.cms?.artists?.[index] })) }))
      if (booksResult.error) console.error('Could not load shared books:', booksResult.error.message)
      else setBooks((booksResult.data ?? []).map((row) => ({ ...(row.payload as CreatedBook), owner_id: row.owner_id as string })))
      if (notesResult.error) console.error('Could not load shared notes:', notesResult.error.message)
      else setContentNotes((notesResult.data ?? []) as MuseumNote[])
    })
    return () => { active = false }
  }, [])
  useEffect(() => { setHeader(true) }, [pathname])
  useLayoutEffect(() => { window.history.scrollRestoration = 'manual' }, [])
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [pathname])
  const saveSitePayload = async (nextCms: CmsState) => {
    const { error } = await supabase.from('world_museum_site_content').update({ payload: { cms: nextCms }, updated_at: new Date().toISOString() }).eq('id', 1)
    if (error) { window.alert(`Could not save shared content: ${error.message}`); return false }
    return true
  }
  const publish = async (book: CreatedBook) => {
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) { window.alert('Please log in before publishing a book.'); setAuthMode('login'); return false }
    const existingBook = books.find((saved) => saved.id === book.id)
    if (existingBook) {
      if (existingBook.owner_id !== authData.user.id && currentAccount?.id !== 'admin1') { window.alert('You can only republish your own books.'); return false }
      const updated = { ...book, owner_id: existingBook.owner_id, ownerUsername: existingBook.ownerUsername || (existingBook.owner_id === authData.user.id ? currentAccount?.id : await getBookOwnerUsername(existingBook)), publishedAt: existingBook.publishedAt }
      const { data, error } = await supabase.from('world_museum_books').update({ payload: updated, updated_at: new Date().toISOString() }).eq('id', book.id).eq('owner_id', existingBook.owner_id).select('id').single()
      if (error || !data) { window.alert('Could not republish book: ' + (error?.message || 'Book not found.')); return false }
      setBooks((current) => current.map((saved) => saved.id === updated.id ? updated : saved))
      return true
    }
    const publishedBook = { ...book, ownerUsername: currentAccount?.id, publishedAt: new Date().toISOString() }
    const ownedBook = { ...publishedBook, owner_id: authData.user.id }
    const { error } = await supabase.from('world_museum_books').insert({ id: book.id, owner_id: authData.user.id, payload: publishedBook })
    if (error) { window.alert(`Could not publish book: ${error.message}`); return false }
    setBooks((current) => [ownedBook, ...current]); return true
  }
  const addNote = async (floor: '3f' | '4f', artistIndex: number | null, bookId: string | null, body: string) => {
    const { data, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw new Error('Could not check your sign-in. Please try again.')
    if (!data.session?.user) { setAuthMode('login'); throw new Error('Your session has expired. Please sign in again. Your note has been kept.') }
    const { data: note, error } = await supabase.from('world_museum_notes').insert({ floor, artist_index: artistIndex, book_id: bookId, owner_id: data.session.user.id, owner_username: '', owner_role: 'student', body }).select('*').single()
    if (error || !note) throw new Error('Could not save your note. Please try again. Your note has been kept.')
    setContentNotes((current) => [note as MuseumNote, ...current])
  }
  const updateNote = async (id: string, body: string) => {
    const { error } = await supabase.from('world_museum_notes').update({ body, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { window.alert(`Could not update note: ${error.message}`); return }
    setContentNotes((current) => current.map((note) => note.id === id ? { ...note, body } : note))
  }
  const deleteNote = async (id: string) => {
    const { error } = await supabase.from('world_museum_notes').delete().eq('id', id)
    if (error) { window.alert(`Could not delete note: ${error.message}`); return }
    setContentNotes((current) => current.filter((note) => note.id !== id))
  }
  const deleteBook = async (id: string) => {
    if (currentAccount?.id !== 'admin1') { window.alert('Only the administrator can delete published books.'); return }
    const { error } = await supabase.from('world_museum_books').delete().eq('id', id)
    if (error) { window.alert(`Could not delete book: ${error.message}`); return }
    setBooks((current) => current.filter((book) => book.id !== id))
  }
  const updateBook = async (updated: CreatedBook) => {
    const { error } = await supabase.from('world_museum_books').update({ payload: updated, updated_at: new Date().toISOString() }).eq('id', updated.id)
    if (error) { window.alert(`Could not update book: ${error.message}`); return }
    setBooks((current) => current.map((book) => book.id === updated.id ? updated : book))
  }
  const saveCms = async (next: CmsState) => {
    const normalized = normalizeCmsCopy(next)
    const saved = await saveSitePayload(normalized)
    if (saved) setCms(normalized)
    return saved
  }
  return <><Header visible={header} openAuth={setAuthMode} /><Routes><Route path="/" element={<Entrance activateHeader={() => setHeader(true)} />} />{floors.map((item) => <Route key={item.to} path={item.to} element={item.floor === '1F' ? <FirstFloorPage cms={cms} /> : item.floor === '2F' ? <SecondFloorPage cms={cms} /> : item.floor === '3F' ? <ThreeFPage notes={contentNotes} addNote={addNote} updateNote={updateNote} deleteNote={deleteNote} cms={cms} /> : item.floor === '4F' ? <FourthFloorPage deleteBook={deleteBook} openLogin={() => setAuthMode('login')} books={books} publish={publish} updateBook={updateBook} notes={contentNotes} addNote={addNote} updateNote={updateNote} deleteNote={deleteNote} /> : <GalleryPage item={item} />} />)}<Route path="/admin" element={<AdminArea books={books} deleteBook={deleteBook} updateBook={updateBook} notes={contentNotes} deleteNote={deleteNote} addNote={addNote} updateNote={updateNote} cms={cms} saveCms={saveCms} />} /><Route path="/login" element={<LoginRoute />} /><Route path="*" element={<GalleryPage item={floors[3]} />} /></Routes><Footer content={cms.footer ?? defaultFooter} sound={sound} toggleSound={toggleSound} /><AuthModal mode={authMode} close={() => setAuthMode(null)} /><ForcedPasswordChange /></>
}
