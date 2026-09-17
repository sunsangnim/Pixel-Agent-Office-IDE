import type { AgentInstance, AgentStatePayload } from '@shared/types'

export function planningStatus(instanceIds: string[], instances: AgentInstance[], states: Record<string, AgentStatePayload>): { text: string; blockedInstanceId?: string } {
  const targets = instanceIds.map((id) => ({ id, state: states[instances.find((instance) => instance.instanceId === id)?.ptyId ?? ''] }))
  const blocked = targets.find(({ state }) => state && ['waiting', 'error', 'exited'].includes(state.state))
  if (blocked) return { text: blocked.state?.reason ?? (blocked.state?.state === 'waiting' ? 'CLI 승인 대기 중' : 'CLI가 중단되었습니다'), blockedInstanceId: blocked.id }
  if (targets.some(({ state }) => !state || state.state === 'starting')) return { text: 'CLI 시작 대기 중 — 준비되면 기획 요청을 전달합니다.' }
  if (targets.some(({ state }) => state?.state === 'working')) return { text: '기획서 작성 중…' }
  return { text: '기획 완료 응답 대기 중…' }
}
