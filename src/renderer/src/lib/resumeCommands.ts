import type { TrackedTask } from '@shared/types'

export function resolveResumeRequest(text: string, tasks: TrackedTask[]): { kind: 'none' | 'select' | 'project'; projectPath?: string } {
  const compact = (value: string) => value.toLocaleLowerCase().replace(/[\s.!?,“”"']/g, '')
  const input = compact(text)
  const continuing = /이어(?:서|하|가)|계속|재개|하던|이전작업|^\/이어하기$/.test(input)
  const choosing = /(?:하자|합시다|시작하자|작업하자|진행하자)$/.test(input)
  if (!continuing && !choosing) return { kind: 'none' }
  const unfinished = tasks.filter(task => !['completed', 'cancelled'].includes(task.stage))
  const projects = [...new Set(unfinished.map(task => task.projectPath))]
  const matches = projects.filter(project => unfinished.filter(task => task.projectPath === project).some(task =>
    [project.split(/[\\/]/).pop()!, task.title].some(name => compact(name).length >= 2 && input.includes(compact(name)))))
  if (matches.length === 1) return { kind: 'project', projectPath: matches[0] }
  if (matches.length > 1 || continuing || (projects.length > 0 && /^(?:이거|그거|저거|이작업|그작업)(?:하자|합시다)$/.test(input))) return { kind: 'select' }
  return { kind: 'none' }
}
