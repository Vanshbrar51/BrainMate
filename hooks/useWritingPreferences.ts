// hooks/useWritingPreferences.ts
// Hook to fetch and manage persistent user preferences across sessions.
// Features debounced Supabase syncing and localStorage fallback caching.

import { useState, useEffect, useRef, useCallback } from 'react'
import type { WritingPreferences, ToneOption, WritingMode, OutputLang } from '@/types/writeright'

const LOCAL_STORAGE_KEY = 'wr_preferences'

const DEFAULT_PREFERENCES: WritingPreferences = {
  preferredTone: "Professional",
  preferredMode: "email",
  preferredIntensity: 1,
  preferredOutputLang: "en",
  favouriteChips: [],
  uiPreferences: {
    sidebarOpen: true,
    analyticsOpen: false,
    coachBarEnabled: true,
    splitViewDefault: false,
    focusModeEnabled: false,
    grammarScanEnabled: false,
  }
}

export function useWritingPreferences() {
  const [preferences, setPreferences] = useState<WritingPreferences>(DEFAULT_PREFERENCES)
  const [loading, setLoading] = useState<boolean>(true)
  const pendingUpdates = useRef<Partial<WritingPreferences>>({})
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 1. Fetch preferences on mount
  useEffect(() => {
    let active = true

    async function loadPreferences() {
      // Try to load cached version from localStorage first for instant response
      try {
        const cached = localStorage.getItem(LOCAL_STORAGE_KEY)
        if (cached && active) {
          setPreferences(JSON.parse(cached))
        }
      } catch {
        // Ignore localStorage read errors
      }

      try {
        const response = await fetch('/api/writeright/preferences')
        if (response.ok) {
          const data = await response.json()
          if (data && data.preferences && active) {
            setPreferences(data.preferences)
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.preferences))
          }
        }
      } catch (err) {
        // Silent failure - will use cached or default preferences
      } finally {
        if (active) setLoading(false)
      }
    }

    loadPreferences()

    return () => {
      active = false
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  // 2. Debounced save to API
  const saveToBackend = useCallback(async (updatedPrefs: WritingPreferences) => {
    try {
      await fetch('/api/writeright/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPrefs)
      })
    } catch (err) {
      // Silent failure - localStorage already updated
    }
  }, [])

  // 3. Update single preference
  const updatePreference = useCallback(<K extends keyof WritingPreferences>(
    key: K,
    value: WritingPreferences[K]
  ) => {
    setPreferences(prev => {
      const next = { ...prev, [key]: value }
      
      // Update localStorage immediately
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Ignore write errors
      }

      // Buffer update for backend sync
      pendingUpdates.current = { ...pendingUpdates.current, [key]: value }

      // Reset debounce timer
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        const fullNext = { ...next, ...pendingUpdates.current }
        saveToBackend(fullNext)
        pendingUpdates.current = {}
      }, 2000)

      return next
    })
  }, [saveToBackend])

  return {
    preferences,
    updatePreference,
    loading
  }
}
