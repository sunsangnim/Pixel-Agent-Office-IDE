import { useEffect, useRef, useState } from 'react'
import type { OfficeDoorState } from '@shared/types'

const TRANSITION_MS = 360

export function useDoorState(requestOpen: boolean): OfficeDoorState {
  const [state, setState] = useState<OfficeDoorState>(requestOpen ? 'open' : 'closed')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    setState(requestOpen ? 'opening' : 'closing')
    timer.current = setTimeout(() => {
      setState(requestOpen ? 'open' : 'closed')
      timer.current = null
    }, TRANSITION_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [requestOpen])

  return state
}
