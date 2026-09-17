import { useEffect, useState } from 'react'
import type { AgentRuntimeState, AgentStatePayload, DeskStatus } from '@shared/types'

export interface PtyStatusSnapshot {
  deskStatuses: Record<string, DeskStatus>
  runtimeStates: Record<string, AgentStatePayload>
}

function toDeskStatus(state: AgentRuntimeState): DeskStatus {
  if (state === 'error') return 'error'
  if (state === 'starting' || state === 'working') return 'running'
  return 'idle'
}

export function usePtyStatuses(): PtyStatusSnapshot {
  const [runtimeStates, setRuntimeStates] = useState<Record<string, AgentStatePayload>>({})

  useEffect(() => {
    let active = true
    window.api.pty.getStates?.().then((states) => {
      if (active) setRuntimeStates((prev) => ({ ...Object.fromEntries(states.map((state) => [state.ptyId, state])), ...prev }))
    }).catch(() => {})
    const unsubscribeState = window.api.pty.onState((payload) => {
      setRuntimeStates((prev) => ({ ...prev, [payload.ptyId]: {
        ...payload,
        // Redrawing one permission prompt is one request. A new wait after
        // resuming gets a new identity so a dismissed panel can open again.
        timestamp: payload.state === 'waiting' && prev[payload.ptyId]?.state === 'waiting'
          ? prev[payload.ptyId].timestamp : payload.timestamp
      } }))
    })
    const unsubscribeExit = window.api.pty.onExit(({ ptyId, exitCode }) => {
      setRuntimeStates((prev) => {
        if (prev[ptyId]?.state === 'error') return prev
        return {
          ...prev,
          [ptyId]: {
            ptyId,
            adapterId: prev[ptyId]?.adapterId ?? 'generic',
            state: exitCode === 0 ? 'exited' : 'error',
            reason: exitCode === 0 ? 'CLI 프로세스 종료' : `CLI 종료 코드 ${exitCode}`,
            timestamp: Date.now()
          }
        }
      })
    })
    return () => { active = false; unsubscribeState(); unsubscribeExit() }
  }, [])

  const deskStatuses = Object.fromEntries(
    Object.entries(runtimeStates).map(([ptyId, payload]) => [ptyId, toDeskStatus(payload.state)])
  )
  return { deskStatuses, runtimeStates }
}
