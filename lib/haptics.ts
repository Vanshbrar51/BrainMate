import { useCallback, useRef, useState } from 'react'

/**
 * useHaptics Hook
 * Provides low-latency, synthesized audio feedback for typing and AI events.
 * Uses Web Audio API to avoid binary asset dependencies.
 */
export function useHaptics() {
  const [isMuted, setIsMuted] = useState(true)
  const audioCtxRef = useRef<AudioContext | null>(null)
  
  // Throttle state to prevent audio "machine-gunning"
  const lastClickTimeRef = useRef(0)

  const initAudio = useCallback(() => {
    if (audioCtxRef.current) return
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtxRef.current = new AudioContextClass()
    } catch (e) {
      console.error("AudioContext init failed", e)
    }
  }, [])

  const playClick = useCallback(() => {
    if (isMuted) return
    initAudio()
    if (!audioCtxRef.current) return

    const now = audioCtxRef.current.currentTime
    // 50ms throttle for typing sounds
    if (Date.now() - lastClickTimeRef.current < 50) return
    lastClickTimeRef.current = Date.now()

    if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume()

    const osc = audioCtxRef.current.createOscillator()
    const gain = audioCtxRef.current.createGain()

    // Crisp mechanical "tock" sound
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, now)
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.04)

    gain.gain.setValueAtTime(0.05, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)

    osc.connect(gain)
    gain.connect(audioCtxRef.current.destination)

    osc.start(now)
    osc.stop(now + 0.04)
  }, [isMuted, initAudio])

  const playShimmer = useCallback(() => {
    if (isMuted) return
    initAudio()
    if (!audioCtxRef.current) return

    const now = audioCtxRef.current.currentTime
    if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume()

    // Create multiple oscillators for a "chord" shimmer effect
    const freqs = [880, 1108.73, 1318.51, 1760] // A5, C#6, E6, A6
    
    freqs.forEach((f, i) => {
      const osc = audioCtxRef.current!.createOscillator()
      const gain = audioCtxRef.current!.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, now + (i * 0.02))
      
      gain.gain.setValueAtTime(0, now + (i * 0.02))
      gain.gain.linearRampToValueAtTime(0.03, now + (i * 0.02) + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, now + (i * 0.02) + 0.5)

      osc.connect(gain)
      gain.connect(audioCtxRef.current!.destination)

      osc.start(now + (i * 0.02))
      osc.stop(now + (i * 0.02) + 0.5)
    })
  }, [isMuted, initAudio])

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      if (prev) initAudio()
      return !prev
    })
  }, [initAudio])

  return { playClick, playShimmer, toggleMute, isMuted }
}
