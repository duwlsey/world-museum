import { supabase } from './supabase'
import { cachePageSource, type BookPageSource } from './bookSources'
type StoryPage = { text: string; plot?: string; scene?: string; image?: string; loading?: boolean }
export type CreatedBook = { id: string; owner_id?: string; ownerUsername?: string; title: string; author: string; synopsis: string; coverColor?: string; coverImage?: string; coverCredit?: string; coverLicense?: string; coverSource?: string; publishedAt?: string; style?: string; seed?: number; character?: string; world?: string; reference?: string; pages: StoryPage[] }
async function getBookOwnerUsername(book: CreatedBook) {
  if (book.ownerUsername) return book.ownerUsername
  if (!book.owner_id) return undefined
  const { data } = await supabase.from('profiles').select('username').eq('id', book.owner_id).maybeSingle()
  return data?.username as string | undefined
}


const bookSources = new WeakMap<CreatedBook, Promise<BookPageSource>>()
export function createBookPageSource(book: CreatedBook): Promise<BookPageSource> {
  const cached = bookSources.get(book)
  if (cached) return cached
  const pending = prepareBookPageSource(book).catch((error) => { bookSources.delete(book); throw error })
  bookSources.set(book, pending)
  return pending
}

async function prepareBookPageSource(book: CreatedBook): Promise<BookPageSource> {
    await document.fonts.ready
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1600
    const ctx = canvas.getContext('2d')!
    ctx.textAlign = 'left'
    let ownerUsernamePromise: Promise<string | undefined> | undefined
    let cover: HTMLImageElement | null = null
    const source = book.coverImage || book.reference
    if (source) cover = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      const timer = setTimeout(() => { image.src = ''; reject(new Error('The cover took too long to load. Please retry.')) }, 20000)
      image.onload = () => { clearTimeout(timer); resolve(image) }
      image.onerror = () => { clearTimeout(timer); reject(new Error('The cover image could not be downloaded. Please retry.')) }
      image.src = source
    })
    const linesFor = (text: string, width: number) => {
      const lines: string[] = []
      for (const paragraph of text.split('\n')) {
        let line = ''
        for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
          const candidate = line ? line + ' ' + word : word
          if (ctx.measureText(candidate).width > width) {
            if (line) { lines.push(line); line = '' }
            for (const character of word) {
              if (line && ctx.measureText(line + character).width > width) { lines.push(line); line = '' }
              line += character
            }
          }
          else line = candidate
        }
        lines.push(line)
      }
      return lines
    }
    const wrap = (text: string, x: number, y: number, width: number, lineHeight: number) => {
      linesFor(text, width).forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight))
    }
    const paintCover = (front: boolean) => {
      ctx.fillStyle = book.coverColor || '#dce3e3'; ctx.fillRect(0, 0, 1200, 1600)
      if (cover) { const scale = Math.max(1200 / cover.width, 1600 / cover.height); ctx.drawImage(cover, (1200 - cover.width * scale) / 2, (1600 - cover.height * scale) / 2, cover.width * scale, cover.height * scale) }
      if (front) {
        const panelX = 80, panelWidth = 1040, inset = 48
        let titleSize = 72
        ctx.font = '600 ' + titleSize + 'px Inter, Arial, sans-serif'
        while (titleSize > 32 && (linesFor(book.title, panelWidth - inset * 2).length > 4 || linesFor(book.title, panelWidth - inset * 2).some((line) => ctx.measureText(line).width > panelWidth - inset * 2))) {
          titleSize -= 2; ctx.font = '600 ' + titleSize + 'px Inter, Arial, sans-serif'
        }
        const titleLines = linesFor(book.title, panelWidth - inset * 2)
        const titleLineHeight = titleSize * 1.25
        ctx.font = '36px Inter, Arial, sans-serif'
        const authorLines = linesFor('by ' + book.author, panelWidth - inset * 2)
        const contentHeight = titleLines.length * titleLineHeight + 30 + authorLines.length * 48
        const panelHeight = contentHeight + inset * 2
        const panelY = 1520 - panelHeight
        ctx.fillStyle = '#f7f5eef2'; ctx.fillRect(panelX, panelY, panelWidth, panelHeight)
        ctx.fillStyle = '#222'; ctx.font = '600 ' + titleSize + 'px Inter, Arial, sans-serif'
        const titleY = panelY + (panelHeight - contentHeight) / 2 + titleSize
        titleLines.forEach((line, index) => ctx.fillText(line, panelX + inset, titleY + index * titleLineHeight))
        ctx.fillStyle = '#54584f'; ctx.font = '36px Inter, Arial, sans-serif'
        const authorY = titleY + (titleLines.length - 1) * titleLineHeight + titleSize * .25 + 30 + 36
        authorLines.forEach((line, index) => ctx.fillText(line, panelX + inset, authorY + index * 48))
      }
    }
    const numPages = book.pages.length + 3 + (book.pages.length % 2 === 0 ? 1 : 0)
    const key = 'created:' + book.id
    return cachePageSource({ key, numPages, render: async (number, width) => {
      if (number === 1) paintCover(true)
      else if (number === numPages) paintCover(false)
      else if (number <= book.pages.length + 1) {
      const index = number - 2
      const page = book.pages[index]
      ctx.fillStyle = '#fdfcf9'; ctx.fillRect(0, 0, 1200, 1600); ctx.fillStyle = '#777'; ctx.font = '24px Inter, Arial, sans-serif'; ctx.fillText(page.plot || book.title, 100, 100)
      ctx.fillStyle = '#292d29'
      let bodySize = 72
      ctx.font = bodySize + 'px Inter, Arial, sans-serif'
      while (bodySize > 24 && (linesFor(page.text, 1000).length * bodySize * 1.5 > 1180 || linesFor(page.text, 1000).some((line) => ctx.measureText(line).width > 1000))) { bodySize -= 2; ctx.font = bodySize + 'px Inter, Arial, sans-serif' }
      wrap(page.text, 100, 260, 1000, bodySize * 1.5); ctx.font = '24px Inter, Arial, sans-serif'; ctx.fillText(String(index + 1), 580, 1510)

      } else if (number === book.pages.length + 2) {
    ownerUsernamePromise ??= getBookOwnerUsername(book)
    const ownerUsername = await ownerUsernamePromise
    ctx.fillStyle = '#fdfcf9'; ctx.fillRect(0, 0, 1200, 1600)
    const information = 'Author: ' + book.author + (ownerUsername ? ' (' + ownerUsername + ')' : '') + '\nPublished by World Museum\n' + (book.publishedAt ? new Date(book.publishedAt).toLocaleDateString('en-GB') : '') + (book.coverCredit ? '\nCover image: ' + book.coverCredit + '\n' + (book.coverLicense || '') + '\n' + (book.coverSource || '') : '')
    ctx.fillStyle = '#292d29'
    let size = 30
    const layout = () => {
      ctx.font = size + 'px Inter, Arial, sans-serif'
      const informationLines = linesFor(information, 1000)
      ctx.font = size * 1.6 + 'px Inter, Arial, sans-serif'
      const titleLines = linesFor(book.title, 1000)
      return { informationLines, titleLines, height: titleLines.length * size * 2.16 + 60 + informationLines.length * size * 1.6 }
    }
    let fitted = layout()
    while (fitted.height > 1380 && size > 12) { size--; fitted = layout() }
    const scale = Math.min(1, 1380 / fitted.height)
    const top = 1500 - fitted.height * scale
    ctx.save(); ctx.translate(100, top); ctx.scale(scale, scale)
    ctx.font = size * 1.6 + 'px Inter, Arial, sans-serif'
    fitted.titleLines.forEach((line, index) => ctx.fillText(line, 0, size * 1.6 + index * size * 2.16))
    ctx.font = size + 'px Inter, Arial, sans-serif'
    const informationTop = fitted.titleLines.length * size * 2.16 + 60 + size
    fitted.informationLines.forEach((line, index) => ctx.fillText(line, 0, informationTop + index * size * 1.6))
    ctx.restore()

      } else { ctx.fillStyle = '#fdfcf9'; ctx.fillRect(0, 0, 1200, 1600) }
      const output = document.createElement('canvas')
      output.width = width; output.height = Math.round(width * 4 / 3)
      output.getContext('2d')!.drawImage(canvas, 0, 0, output.width, output.height)
      return output
    } })
}
