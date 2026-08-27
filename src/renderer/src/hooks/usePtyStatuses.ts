import { useEffect, useRef, useState } from 'react'
import type { DeskStatus } from '@shared/types'

const IDLE_TIMEOUT_MS = 1500

export function usePtyStatuses(): Record<string, DeskStatus> {
  const [statuses, setStatuses] = useState<Record<string, DeskStatus>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const unsubscribeData = window.api.pty.onData(({ ptyId }) => {
      setStatuses((prev) => (prev[ptyId] === 'running' ? prev : { ...prev, [ptyId]: 'running' }))
      clearTimeout(timers.current[ptyId])
      timers.current[ptyId] = setTimeout(() => {
        setStatuses((prev) => ({ ...prev, [ptyId]: 'idle' }))
      }, IDLE_TIMEOUT_MS)
    })

    const unsubscribeExit = window.api.pty.onExit(({ ptyId, exitCode }) => {
      clearTimeout(timers.current[ptyId])
      setStatuses((prev) => ({ ...prev, [ptyId]: exitCode === 0 ? 'idle' : 'error' }))
    })

    return () => {
      unsubscribeData()
      unsubscribeExit()
      Object.values(timers.current).forEach(clearTimeout)
    }
  }, [])

  return statuses
}
