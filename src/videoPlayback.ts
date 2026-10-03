const activeVideos = new Set<object>()

export function setVideoPlaying(video: object, playing: boolean) {
  if (playing) activeVideos.add(video)
  else activeVideos.delete(video)
  window.dispatchEvent(new Event('museum-video-playback'))
}

export function isVideoPlaying() { return activeVideos.size > 0 }

type Player = { destroy: () => void }
type YouTubeApi = { Player: new (element: HTMLIFrameElement, options: { events: { onStateChange: (event: { data: number }) => void } }) => Player }
declare global {
  interface Window { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void }
}

let apiReady: Promise<YouTubeApi> | undefined
export function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  apiReady ??= new Promise<YouTubeApi>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT!) }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
  return apiReady
}
