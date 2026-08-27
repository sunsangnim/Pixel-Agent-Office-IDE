import { useEffect, useRef, useState } from 'react'

export interface OfficeClockState {
  now: Date
  isWorkingHours: boolean
  isClockInActive: boolean
}

export function isWorkingTime(now: Date): boolean {
  const day = now.getDay()
  const hour = now.getHours()
  return day >= 1 && day <= 5 && hour >= 8 && hour < 17
}

export function useOfficeClock(): OfficeClockState {
  const [now, setNow] = useState(() => new Date())
  const [isClockInActive, setClockInActive] = useState(() => isWorkingTime(new Date()))
  const previousWorking = useRef(isWorkingTime(now))

  useEffect(() => {
    const initialDoorTimer = setTimeout(() => setClockInActive(false), 2400)
    const timer = setInterval(() => {
      const next = new Date()
      const working = isWorkingTime(next)
      setNow(next)
      if (working && !previousWorking.current) {
        setClockInActive(true)
        setTimeout(() => setClockInActive(false), 2400)
      }
      previousWorking.current = working
    }, 1000)
    return () => {
      clearTimeout(initialDoorTimer)
      clearInterval(timer)
    }
  }, [])

  return { now, isWorkingHours: isWorkingTime(now), isClockInActive }
}
