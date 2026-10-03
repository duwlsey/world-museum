import { useEffect, useRef, useState } from 'react'
import { isVideoPlaying } from './videoPlayback'

// The buffer loops continuously; gain automation fades each pass to silence.
export function scheduleMusicPass(gain: AudioParam, start: number, duration: number, volume = 0.25) {
  const fade = Math.min(3, duration / 3)
  gain.setValueAtTime(0, start)
  gain.linearRampToValueAtTime(volume, start + fade)
  gain.setValueAtTime(volume, start + duration - fade)
  gain.linearRampToValueAtTime(0, start + duration)
}

export function useBackgroundMusic(url?: string) {
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const requestRef = useRef(0)
  const contextRef = useRef<AudioContext | null>(null)
  const [videoPlaying, setVideoPlaying] = useState(isVideoPlaying)
  useEffect(() => {
    const update = () => {
      const paused = isVideoPlaying()
      setVideoPlaying(paused)
      const context = contextRef.current
      if (context && context.state !== 'closed') {
        if (paused) void context.suspend().catch(() => {})
        else void context.resume().catch(() => {})
      }
    }
    window.addEventListener('museum-video-playback', update)
    return () => window.removeEventListener('museum-video-playback', update)
  }, [])
  const stop = () => { requestRef.current++; stopRef.current?.(); stopRef.current = null; setPlaying(false); setLoading(false) }
  const enabledRef = useRef(true)
  useEffect(() => {
    const shouldPlay = enabledRef.current
    stop()
    if (url && shouldPlay) void toggle(true)
    return () => { requestRef.current++; stopRef.current?.() }
  }, [url])
  const toggle = async (automatic = false) => {
    if (!automatic && (playing || loading)) { enabledRef.current = false; stop(); return }
    if (!url) { window.alert('Background music has not been added yet.'); return }
    enabledRef.current = true
    const request = ++requestRef.current
    const context = new AudioContext()
    contextRef.current = context
    const controller = new AbortController()
    let source: AudioBufferSourceNode | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    const unlock = () => { if (!isVideoPlaying() && context.state === 'suspended') void context.resume().catch(() => {}) }
    const removeUnlock = () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    stopRef.current = () => { contextRef.current = null; removeUnlock(); controller.abort(); if (timer) clearInterval(timer); source?.stop(); void context.close() }
    setLoading(true)
    try {
      // Autoplay where allowed; the first interaction unlocks restricted browsers.
      await context.resume()
      removeUnlock()
      if (request !== requestRef.current) return
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error('Music could not be loaded.')
      const buffer = await context.decodeAudioData(await response.arrayBuffer())
      if (request !== requestRef.current) return
      if (buffer.duration <= 0) throw new Error('Empty audio file.')
      source = context.createBufferSource(); source.buffer = buffer; source.loop = true
      const gain = context.createGain(); gain.gain.value = 0
      source.connect(gain).connect(context.destination)
      const start = context.currentTime + 0.05
      let next = start
      const schedule = () => {
        // Queue well ahead so background-tab timer throttling cannot interrupt fades.
        while (next < context.currentTime + 3600) { scheduleMusicPass(gain.gain, next, buffer.duration); next += buffer.duration }
      }
      schedule(); source.start(start); timer = setInterval(schedule, 10000)
      if (isVideoPlaying()) await context.suspend()
      setLoading(false); setPlaying(true)
    } catch (error) {
      if (request !== requestRef.current) return
      stop()
      window.alert(error instanceof Error ? error.message : 'Could not play background music.')
    }
  }
  return { playing: (playing || loading) && !videoPlaying, loading, toggle: () => void toggle() }
}
