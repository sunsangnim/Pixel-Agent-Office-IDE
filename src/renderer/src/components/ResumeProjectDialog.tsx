import { useEffect, useRef } from 'react'
import type { TrackedTask } from '@shared/types'

export default function ResumeProjectDialog({ tasks, onSelect, onClose }: {
  tasks: TrackedTask[]; onSelect: (project: string) => void; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  const unfinished = tasks.filter(task => !['completed', 'cancelled'].includes(task.stage))
  const projects = [...new Set(unfinished.map(task => task.projectPath))]
  return <dialog className="resume-project-dialog" ref={dialog} onCancel={onClose} aria-labelledby="resume-project-title">
    <header><h2 id="resume-project-title">어떤 프로젝트를 이어갈까요?</h2><button onClick={onClose}>닫기</button></header>
    <p>선택한 프로젝트의 SRS·개발 기록·커밋을 확인한 뒤 이어갑니다.</p>
    {projects.length === 0 && <p>이어갈 미완료 작업이 없습니다.</p>}
    {projects.map(project => <button className="resume-project-option" key={project} onClick={() => onSelect(project)}>
      <strong>{project.split(/[\\/]/).pop()}</strong>
      <small>{project}</small>
      <span>{unfinished.filter(task => task.projectPath === project).map(task => task.title).join(' · ')}</span>
    </button>)}
  </dialog>
}
