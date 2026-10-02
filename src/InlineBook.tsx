import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './inline-gallery.css'
import './inline-book-reader.css'

GlobalWorkerOptions.workerSrc = workerUrl

const pdfDocuments = new Map<string, Promise<PDFDocumentProxy>>()
const coverPreviews = new Map<string, Promise<HTMLCanvasElement>>()
const renderedPages = new Map<string, Promise<HTMLCanvasElement>>()
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

function canvasToImageUrl(canvas: HTMLCanvasElement) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not prepare the page image.'))
        return
      }
      const url = URL.createObjectURL(blob)
      const image = new Image()
      image.onload = () => resolve(url)
      image.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Could not decode the page image.'))
      }
      image.src = url
    }, 'image/jpeg', 0.94)
  })
}

function getPdfDocument(src: string) {
  const cached = pdfDocuments.get(src)
  if (cached) return cached
  const task = getDocument({ url: src, disableAutoFetch: true, disableStream: true, rangeChunkSize: 262144 })
  const pending = task.promise.catch((error) => {
    if (pdfDocuments.get(src) === pending) pdfDocuments.delete(src)
    throw error
  })
  pdfDocuments.set(src, pending)
  return pending
}

function renderPageToCanvas(pdf: PDFDocumentProxy, src: string, number: number, targetWidth = 1800) {
  const key = `${src}:${number}:${targetWidth}`
  const cached = renderedPages.get(key)
  if (cached) return cached
  const pending = pdf.getPage(number).then(async (page) => {
    const viewport = page.getViewport({ scale: 1 })
    const scaled = page.getViewport({ scale: targetWidth / viewport.width })
    const canvas = window.document.createElement('canvas')
    canvas.width = scaled.width
    canvas.height = scaled.height
    await page.render({ canvas, viewport: scaled }).promise
    return canvas
  }).catch((error) => {
    if (renderedPages.get(key) === pending) renderedPages.delete(key)
    throw error
  })
  renderedPages.set(key, pending)
  return pending
}

export function preloadBookPreview(src: string) {
  const cached = coverPreviews.get(src)
  if (cached) return cached
  const pending = getPdfDocument(src).then((pdf) => renderPageToCanvas(pdf, src, 1, 900)).catch((error) => {
    if (coverPreviews.get(src) === pending) coverPreviews.delete(src)
    throw error
  })
  coverPreviews.set(src, pending)
  return pending
}

function BookPage({ document: pdf, number, src, preview }: { document: PDFDocumentProxy; number: number; src: string; preview: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  useLayoutEffect(() => {
    let disposed = false
    setError(false)
    const drawCanvas = (buffer: HTMLCanvasElement) => {
      const target = canvas.current
      if (!target || disposed) return
      target.width = buffer.width
      target.height = buffer.height
      target.getContext('2d')!.drawImage(buffer, 0, 0)
      setReady(true)
    }
    const pageCanvas = preview && number === 1 ? preloadBookPreview(src) : renderPageToCanvas(pdf, src, number)
    pageCanvas.then((buffer) => {
      if (!disposed) {
        drawCanvas(buffer)
      }
    }).catch(() => { if (!disposed) setError(true) })
    return () => { disposed = true }
  }, [pdf, number, src])
  const canvasStyle = { opacity: ready ? 1 : 0 }
  return <div className="pdf-leaf" aria-label={`Page ${number}`}><canvas ref={canvas} style={canvasStyle} />{!ready && <span role="status">{error ? 'Unable to render this page.' : `Loading page ${number}…`}</span>}</div>
}

export default function InlineBook({ src, title, preview = false, onVisitGuestbook }: { src: string; title: string; preview?: boolean; onVisitGuestbook?: () => void }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [spread, setSpread] = useState(0)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [direction, setDirection] = useState('forward')
  const [pageTurn, setPageTurn] = useState<{ frontImage: string; backImage: string; underlayImage?: string; direction: 'forward' | 'backward'; targetSpread: number; id: number } | null>(null)
  const [isPreparingTurn, setIsPreparingTurn] = useState(false)
  const bookRoot = useRef<HTMLElement>(null)
  const touch = useRef<number | null>(null)
  const lastTurn = useRef(0)
  const turning = useRef(false)
  const pageTurnId = useRef(0)
  useEffect(() => {
    let active = true
    setDocument(null); setError(''); setSpread(0)
    getPdfDocument(src).then((pdf) => { if (active) setDocument(pdf) }).catch(() => { if (active) setError('The book could not be loaded. Please try again.') })
    return () => { active = false }
  }, [src, attempt])
  useEffect(() => {
    if (!pageTurn) return
    const { frontImage, backImage, underlayImage } = pageTurn
    return () => {
      URL.revokeObjectURL(frontImage)
      URL.revokeObjectURL(backImage)
      if (underlayImage) URL.revokeObjectURL(underlayImage)
    }
  }, [pageTurn])
  // Keep both covers single, including PDFs with an odd page count.
  const spreads: number[][] = [[1]]
  if (document) {
    for (let n = 2; n < document.numPages; n += 2) spreads.push(n + 1 < document.numPages ? [n, n + 1] : [n])
    if (document.numPages > 1) spreads.push([document.numPages])
  }
  const last = spreads.length - 1
  const numbers = spreads[preview ? 0 : spread] ?? [1]
  const coverSide = numbers.length === 1
    ? numbers[0] === 1 ? 'front-cover' : numbers[0] === document?.numPages ? 'back-cover' : 'single-page'
    : ''
  const turn = async (delta: number) => {
    if (Date.now() - lastTurn.current < 100 || turning.current || pageTurn || !document) return
    const targetSpread = Math.max(0, Math.min(last, spread + delta))
    if (targetSpread === spread) return
    const turnAudio = preparePageTurnAudio()
    turning.current = true
    setIsPreparingTurn(true)
    lastTurn.current = Date.now()
    const oldPage = delta > 0 ? numbers[numbers.length - 1] : numbers[0]
    const oldCanvas = Array.from(bookRoot.current?.querySelectorAll<HTMLCanvasElement>('.real-spread > .pdf-leaf canvas') ?? [])
      .find((canvas) => canvas.parentElement?.getAttribute('aria-label') === `Page ${oldPage}`)
    try {
      const nextPages = spreads[targetSpread] ?? []
      const renderedTargetPages = await Promise.all(nextPages.map((number) => renderPageToCanvas(document, src, number)))
      if (!bookRoot.current) return
      let hasTurnAnimation = false
      if (oldCanvas) {
        try {
          const reversePageIndex = delta > 0 ? 0 : renderedTargetPages.length - 1
          const underlayIndex = nextPages.length > 1 ? (delta > 0 ? nextPages.length - 1 : 0) : -1
          const [turningPageImage, reversePageImage, underlayImage] = await Promise.all([
            canvasToImageUrl(oldCanvas),
            canvasToImageUrl(renderedTargetPages[reversePageIndex]),
            underlayIndex >= 0 ? canvasToImageUrl(renderedTargetPages[underlayIndex]) : Promise.resolve(undefined),
          ])
          if (!bookRoot.current) {
            URL.revokeObjectURL(turningPageImage)
            URL.revokeObjectURL(reversePageImage)
            if (underlayImage) URL.revokeObjectURL(underlayImage)
            return
          }
          setPageTurn({
            frontImage: turningPageImage,
            backImage: reversePageImage,
            underlayImage,
            direction: delta > 0 ? 'forward' : 'backward',
            targetSpread,
            id: ++pageTurnId.current,
          })
          playPageTurnSound(turnAudio)
          hasTurnAnimation = true
        } catch { setPageTurn(null) }
      }
      setDirection(delta > 0 ? 'forward' : 'backward')
      if (!hasTurnAnimation) {
        setSpread(targetSpread)
        turning.current = false
        setIsPreparingTurn(false)
      }
    } catch {
      turning.current = false
      setIsPreparingTurn(false)
    }
  }
  const finishTurn = () => {
    if (pageTurn) setSpread(pageTurn.targetSpread)
    setPageTurn(null)
    turning.current = false
    setIsPreparingTurn(false)
  }
  return <section ref={bookRoot} className="inline-book" aria-label={`${title} picture book`} tabIndex={preview ? undefined : 0} onKeyDown={(e) => { if (!preview && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); turn(e.key === 'ArrowRight' ? 1 : -1) } }} onTouchStart={(e) => { touch.current = e.touches[0].clientX }} onTouchEnd={(e) => { if (!preview && touch.current !== null) { const delta = touch.current - e.changedTouches[0].clientX; if (Math.abs(delta) > 45) turn(delta > 0 ? 1 : -1) }; touch.current = null }}>
    <div className="book-stage">{document ? <div className={`real-spread ${numbers.length === 1 ? 'cover-only' : ''} ${coverSide} ${direction}`}>
      {numbers.map((number) => <BookPage key={number} document={document} number={number} src={src} preview={preview} />)}
      {pageTurn?.underlayImage && <div className={`page-turn-underlay ${pageTurn.direction}`}><img className="pdf-leaf" src={pageTurn.underlayImage} alt="" draggable="false" /></div>}
      {pageTurn && <div key={pageTurn.id} className={`page-turn-overlay ${pageTurn.direction}`} onAnimationEnd={(event) => { if (event.target === event.currentTarget) finishTurn() }}>
        <img className="page-turn-face page-turn-front" src={pageTurn.frontImage} alt="" draggable="false" />
        <img className="page-turn-face page-turn-back" src={pageTurn.backImage} alt="" draggable="false" />
      </div>}
      {!preview && coverSide === 'back-cover' && !pageTurn && onVisitGuestbook && <button className="book-guestbook-cover" onClick={onVisitGuestbook}><span>Visit the Guestbook</span><small>Share your thoughts or leave a question about this book.</small></button>}
      {!preview && <div className="page-hit-areas"><button disabled={spread === 0 || isPreparingTurn} aria-label="Previous pages" onClick={() => void turn(-1)} /><button disabled={spread === last || isPreparingTurn} aria-label="Next pages" onClick={() => void turn(1)} /></div>}
    </div> : <div className="book-loading" role="status">{error || 'Opening your book…'}{error && !preview && <button onClick={() => setAttempt(attempt + 1)}>Retry</button>}</div>}</div>
  </section>
}
