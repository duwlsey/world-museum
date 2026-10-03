import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { bookSpreads, getBookSource, bookPreviewUrl, readerPageWidth, type BookPageSource } from './bookSources'
import './inline-gallery.css'
import './inline-book-reader.css'

let pageTurnAudioContext: AudioContext | null = null

function preparePageTurnAudio() {
  try {
    pageTurnAudioContext ??= new window.AudioContext()
    void pageTurnAudioContext.resume().catch(() => undefined)
    return pageTurnAudioContext
  } catch {
    return null
  }
}

function playPageTurnSound(context: AudioContext | null) {
  if (!context) return
  try {
    const duration = 0.22
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i += 1) {
      const progress = i / samples.length
      samples[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * progress) * (1 - progress) ** 1.4
    }
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const volume = context.createGain()
    const now = context.currentTime
    source.buffer = buffer
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(2200, now)
    filter.frequency.exponentialRampToValueAtTime(700, now + duration)
    filter.Q.value = 0.65
    volume.gain.setValueAtTime(0.0001, now)
    volume.gain.exponentialRampToValueAtTime(0.045, now + 0.025)
    volume.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    source.connect(filter).connect(volume).connect(context.destination)
    source.start(now)
    source.stop(now + duration)
  } catch {
    // Audio is an enhancement; page turning must still work if audio is unavailable.
  }
}


function CanvasFace({ canvas, className = '' }: { canvas: HTMLCanvasElement; className?: string }) {
  const target = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const node = target.current
    if (!node) return
    node.width = canvas.width; node.height = canvas.height
    node.getContext('2d')!.drawImage(canvas, 0, 0)
  }, [canvas])
  return <canvas ref={target} className={className} />
}

type Turn = { front: HTMLCanvasElement; back: HTMLCanvasElement; underlay?: HTMLCanvasElement; target: number; direction: 'forward' | 'backward'; id: number }
export default function InlineBook({ src, source: providedSource, title, preview = false, onVisitGuestbook }: { src?: string; source?: BookPageSource; title: string; preview?: boolean; onVisitGuestbook?: () => void }) {
  const [source, setSource] = useState<BookPageSource | null>(providedSource ?? null)
  const [spread, setSpread] = useState(0)
  const [width, setWidth] = useState(preview ? 480 : 960)
  const [pages, setPages] = useState<Record<number, HTMLCanvasElement>>({})
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [pageTurn, setPageTurn] = useState<Turn | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [preparationMs, setPreparationMs] = useState<number | null>(null)
  const bookRoot = useRef<HTMLElement>(null)
  const touch = useRef<number | null>(null)
  const turning = useRef(false)
  const epoch = useRef(0)
  const turnId = useRef(0)
  const [previewFailed, setPreviewFailed] = useState(false)
  const previewUrl = source?.previewUrl || (src ? bookPreviewUrl(src) : undefined)

  useEffect(() => {
    const revision = ++epoch.current
    setSource(providedSource ?? null); setSpread(0); setPages({}); setError(''); setPageTurn(null); setPreparing(false); setPreviewFailed(false); turning.current = false
    if (!providedSource && src) void getBookSource(src).then((book) => {
      if (epoch.current === revision) setSource(book)
    }).catch(() => { if (epoch.current === revision) setError('The book could not be loaded. Please retry.') })
    return () => { epoch.current = revision + 1 }
  }, [src, providedSource, attempt])

  useLayoutEffect(() => {
    if (preview) { setWidth(480); return }
    const root = bookRoot.current
    if (!root) return
    const resize = () => {
      const measured = root.getBoundingClientRect().width
      if (measured > 0) setWidth(readerPageWidth(measured))
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(root)
    return () => observer.disconnect()
  }, [preview])

  const spreads = bookSpreads(source?.numPages ?? 1)
  const last = spreads.length - 1
  const numbers = spreads[preview ? 0 : spread] ?? [1]
  const coverSide = numbers.length === 1 ? numbers[0] === 1 ? 'front-cover' : numbers[0] === source?.numPages ? 'back-cover' : 'single-page' : ''

  useEffect(() => {
    if (!source || (preview && previewUrl && !previewFailed)) return
    let active = true
    const current = bookSpreads(source.numPages)
    const index = preview ? 0 : spread
    const keep = new Set([...(current[index] ?? []), ...(current[index + 1] ?? []), ...(current[index + 2] ?? []), ...(current[index - 1] ?? [])])
    setPages((old) => Object.fromEntries(Object.entries(old).filter(([number]) => keep.has(Number(number)))))
    const prepare = async () => {
      // Visible pages first; then the next two spreads and the previous one.
      for (const position of preview ? [0] : [index, index + 1, index + 2, index - 1]) {
        if (!active) return
        await Promise.all((current[position] ?? []).map(async (number) => {
          try {
            const canvas = await source.render(number, width)
            if (active) setPages((old) => old[number] === canvas ? old : { ...old, [number]: canvas })
          } catch { if (active && position === index) setError('This page could not be loaded. Please retry.') }
        }))
      }
    }
    void prepare()
    return () => { active = false }
  }, [source, width, spread, preview, previewUrl, previewFailed, attempt])

  const turn = async (delta: number) => {
    if (!source || preview || turning.current || pageTurn || !numbers.every((number) => pages[number])) return
    const target = Math.max(0, Math.min(last, spread + delta))
    if (target === spread) return
    const revision = epoch.current
    const started = performance.now()
    const audio = preparePageTurnAudio()
    turning.current = true
    setError('')
    const next = spreads[target]
    if (!next.every((number) => pages[number])) setPreparing(true)
    try {
      const canvases = await Promise.all(next.map((number) => source.render(number, width)))
      if (epoch.current !== revision || !bookRoot.current) return
      setPages((old) => ({ ...old, ...Object.fromEntries(next.map((number, index) => [number, canvases[index]])) }))
      setPageTurn({ front: pages[delta > 0 ? numbers[numbers.length - 1] : numbers[0]], back: canvases[delta > 0 ? 0 : canvases.length - 1], underlay: next.length > 1 ? canvases[delta > 0 ? canvases.length - 1 : 0] : undefined, target, direction: delta > 0 ? 'forward' : 'backward', id: ++turnId.current })
      setPreparing(false)
      setPreparationMs(Math.round((performance.now() - started) * 10) / 10)
      playPageTurnSound(audio)
    } catch {
      if (epoch.current === revision) { turning.current = false; setPreparing(false); setError('The next pages could not be loaded. Please try turning again.') }
    }
  }
  const finishTurn = useCallback(() => {
    if (pageTurn) setSpread(pageTurn.target)
    setPageTurn(null); turning.current = false; setPreparing(false)
  }, [pageTurn])
  useEffect(() => {
    if (!pageTurn) return
    const timer = setTimeout(finishTurn, 400)
    return () => clearTimeout(timer)
  }, [pageTurn, finishTurn])
  useEffect(() => {
    if (preview) return
    const handleKey = (event: KeyboardEvent) => {
      const root = bookRoot.current
      if (!root || root.getClientRects().length === 0 || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable], [role="textbox"]')) return
      const dialog = root.closest('[role="dialog"]')
      const dialogs = Array.from(window.document.querySelectorAll('[role="dialog"]')).filter((element) => element.getClientRects().length > 0)
      if (dialog && dialogs[dialogs.length - 1] !== dialog) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); void turn(event.key === 'ArrowRight' ? 1 : -1) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })
  const ready = numbers.every((number) => pages[number])
  return <section ref={bookRoot} className="inline-book" aria-label={title + ' picture book'} tabIndex={preview ? undefined : 0} data-spread={spread} data-page-width={width} data-turn-preparation-ms={preparationMs} data-next-ready={(spreads[spread + 1] ?? []).every((number) => pages[number])} aria-busy={preparing || (!ready && !previewUrl)} onTouchStart={(event) => { touch.current = event.touches[0].clientX }} onTouchEnd={(event) => { if (!preview && touch.current !== null) { const delta = touch.current - event.changedTouches[0].clientX; if (Math.abs(delta) > 45) void turn(delta > 0 ? 1 : -1) } touch.current = null }}>
    <div className="book-stage"><div className={'real-spread ' + (numbers.length === 1 ? 'cover-only ' : '') + coverSide}>
      {numbers.map((number) => <div className="pdf-leaf" key={number} aria-label={'Page ' + number}>{pages[number] ? <CanvasFace canvas={pages[number]} /> : number === 1 && previewUrl && !previewFailed ? <img className="reader-page-image" src={previewUrl} alt={title + ' cover'} onError={() => setPreviewFailed(true)} /> : <div className="reader-page-placeholder"><span>{title}</span><small role="status">Preparing page {number}…</small></div>}</div>)}
      {pageTurn?.underlay && <div className={'page-turn-underlay ' + pageTurn.direction}><CanvasFace canvas={pageTurn.underlay} className="pdf-leaf" /></div>}
      {pageTurn && <div key={pageTurn.id} className={'page-turn-overlay ' + pageTurn.direction} onAnimationEnd={(event) => { if (event.target === event.currentTarget) finishTurn() }}><CanvasFace canvas={pageTurn.front} className="page-turn-face page-turn-front" /><CanvasFace canvas={pageTurn.back} className="page-turn-face page-turn-back" /></div>}
      {!preview && coverSide === 'back-cover' && !pageTurn && onVisitGuestbook && <button className="book-guestbook-cover" onClick={onVisitGuestbook}><span>Visit the Guestbook</span><small>Share your thoughts or leave a question about this book.</small></button>}
      {!preview && <div className="page-hit-areas"><button disabled={spread === 0 || preparing || !!pageTurn || !ready} aria-label="Previous pages" onClick={() => void turn(-1)} /><button disabled={spread === last || preparing || !!pageTurn || !ready} aria-label="Next pages" onClick={() => void turn(1)} /></div>}
    </div></div>
    {!preview && (preparing || error || !ready) && <div className="reader-status" role="status">{error || (preparing ? 'Preparing the next pages…' : 'Preparing your book…')}{error && <button onClick={() => setAttempt((value) => value + 1)}>Retry</button>}</div>}
  </section>
}
