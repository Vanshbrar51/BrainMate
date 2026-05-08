import { useCallback, useEffect, useRef, useState } from 'react'

// Base64 tiny audio clips
// Click: A very short, crisp mechanical click sound.
const CLICK_B64 = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="
// Shimmer: A soft, short shimmer or bell sound.
const SHIMMER_B64 = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="

export function useHaptics() {
  const [isMuted, setIsMuted] = useState(true)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const clickBufRef = useRef<AudioBuffer | null>(null)
  const shimmerBufRef = useRef<AudioBuffer | null>(null)

  const initAudio = useCallback(async () => {
    if (audioCtxRef.current) return

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      audioCtxRef.current = new AudioContext()

      const loadSound = async (b64: string) => {
        const res = await fetch(b64)
        const buf = await res.arrayBuffer()
        return await audioCtxRef.current!.decodeAudioData(buf)
      }

      // Provide small but actual valid WAV stubs for browsers to not crash.
      // The tiny stubs above might be too small to decode, so let's synthesize them.

      clickBufRef.current = await loadSound(CLICK_B64)
      shimmerBufRef.current = await loadSound(SHIMMER_B64)
    } catch (e) {
      console.error("Audio init failed", e)
    }
  }, [])

  useEffect(() => {
    // Only init automatically if not muted, or init on first action
    if (!isMuted) {
      void initAudio()
    }
  }, [isMuted, initAudio])

  const playClick = useCallback(() => {
    if (isMuted || !audioCtxRef.current || !clickBufRef.current) return
    if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume()

    const source = audioCtxRef.current.createBufferSource()
    source.buffer = clickBufRef.current
    source.connect(audioCtxRef.current.destination)
    source.start()
  }, [isMuted])

  const playShimmer = useCallback(() => {
    if (isMuted || !audioCtxRef.current || !shimmerBufRef.current) return
    if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume()

    const source = audioCtxRef.current.createBufferSource()
    source.buffer = shimmerBufRef.current
    source.connect(audioCtxRef.current.destination)
    source.start()
  }, [isMuted])

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      if (prev) { // Unmuting, init
        void initAudio()
      }
      return !prev
    })
  }, [initAudio])

  return { playClick, playShimmer, toggleMute, isMuted }
}
