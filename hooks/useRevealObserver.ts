'use client'

import { useEffect } from 'react'

export function useRevealObserver() {
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>('.reveal')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, index) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement
            const delay = target.dataset.revealDelay
              ? parseInt(target.dataset.revealDelay, 10)
              : index * 60
            setTimeout(() => target.classList.add('visible'), delay)
            observer.unobserve(target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

export function RevealObserver() {
  useRevealObserver()
  return null
}
