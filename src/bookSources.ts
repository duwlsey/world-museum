import assets from './bookAssets.json'

export type BookPageSource = {
  key: string
  numPages: number
  previewUrl?: string
  render: (number: number, width: number) => Promise<HTMLCanvasElement>
}

// Keep a small moving window rather than every high-resolution page in memory.
export function cachePageSource(source: BookPageSource): BookPageSource {
  const pages = new Map<string, Promise<HTMLCanvasElement>>()
  return { ...source, render(number, width) {
    const key = `${number}:${width}`
    let page = pages.get(key)
    if (page) { pages.delete(key); pages.set(key, page); return page }
    page = source.render(number, width).catch((error) => { if (pages.get(key) === page) pages.delete(key); throw error })
    pages.set(key, page)
    while (pages.size > 12) pages.delete(pages.keys().next().value!)
    return page
  } }
}

export function loadPageImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const timer = setTimeout(() => { image.src = ''; reject(new Error('The page took too long to load. Please retry.')) }, 20000)
    image.onload = () => { clearTimeout(timer); resolve(image) }
    image.onerror = () => { clearTimeout(timer); reject(new Error('The page could not be loaded. Please retry.')) }
    image.src = url
  })
}

const sources = new Map<string, Promise<BookPageSource>>()
type Pdf = import('pdfjs-dist').PDFDocumentProxy
let pdfApi: Promise<typeof import('pdfjs-dist')> | undefined
async function openPdf(src: string) {
  pdfApi ??= import('pdfjs-dist').then(async (api) => {
    api.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    return api
  })
  const api = await pdfApi
  return api.getDocument({ url: src, disableAutoFetch: true, disableStream: true, rangeChunkSize: 1048576 }).promise
}
async function renderPdf(pdf: Pdf, number: number, width: number) {
  const page = await pdf.getPage(number)
  const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
  await page.render({ canvas, viewport }).promise
  return canvas
}

export function bookPreviewUrl(src: string) {
  const asset = (assets as Record<string, { base: string }>)[src]
  return asset ? asset.base + '/cover.webp' : undefined
}

export function getBookSource(src: string): Promise<BookPageSource> {
  const existing = sources.get(src)
  if (existing) return existing
  const local = (assets as Record<string, { base: string; numPages: number }>)[src]
  const promise = (async () => {
    if (local) {
      let fallback: Promise<Pdf> | undefined
      return cachePageSource({ key: src + local.base, numPages: local.numPages, previewUrl: local.base + '/cover.webp', render: async (number, width) => {
        try {
          const image = await loadPageImage(`${local.base}/${number}.webp`)
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = Math.round(width * image.naturalHeight / image.naturalWidth)
          canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
          return canvas
        } catch {
          fallback ??= openPdf(src).catch((error) => { fallback = undefined; throw error })
          return renderPdf(await fallback, number, width)
        }
      } })
    }
    const pdf = await openPdf(src)
    return cachePageSource({ key: src, numPages: pdf.numPages, render: (number, width) => renderPdf(pdf, number, width) })
  })().catch((error) => { sources.delete(src); throw error })
  sources.set(src, promise)
  return promise
}

export async function preloadBookPreview(src: string) {
  const source = await getBookSource(src)
  if (source.previewUrl) await loadPageImage(source.previewUrl)
  else await source.render(1, 480)
}

export function readerPageWidth(displayWidth: number) {
  return Math.min(1800, Math.max(640, Math.ceil(displayWidth / 2 * Math.min(window.devicePixelRatio || 1, 1.5) / 160) * 160))
}

export async function preloadBookReader(src: string) {
  const source = await getBookSource(src)
  const mobile = window.innerWidth <= 650
  const displayWidth = Math.min(window.innerWidth - (mobile ? 24 : 46), (window.innerHeight - (mobile ? 68 : 71)) * 2)
  const width = readerPageWidth(displayWidth)
  await source.render(1, width)
  await Promise.all(bookSpreads(source.numPages).slice(1, 3).flat().map((number) => source.render(number, width)))
}

export function bookSpreads(count: number): number[][] {
  if (count < 1) return []
  const spreads = [[1]]
  for (let number = 2; number < count; number += 2) spreads.push(number + 1 < count ? [number, number + 1] : [number])
  if (count > 1) spreads.push([count])
  return spreads
}
