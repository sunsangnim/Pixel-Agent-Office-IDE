export function taskFeatureBranch(taskId: string): string {
  const slug = taskId.normalize('NFKC').replace(/[^a-zA-Z0-9가-힣_-]/g, '-').replace(/-+/g, '-').slice(0, 100)
  return `feature/${slug || 'task'}`
}

export function taskGitPolicy(taskId: string, branch = taskFeatureBranch(taskId), coordinator = 'claude-code:lead'): string {
  return `[Git 작업수칙 — 이전 지시의 Git 승인 대기·브랜치 규칙보다 우선]
작업 브랜치: ${branch}
Git 담당: ${coordinator}
1. 팀장과 사원은 이 작업의 공용 작업본과 feature 브랜치 하나를 사용합니다. IDE 저장소나 다른 작업 저장소에서 작업하지 마세요.
2. 파일별 담당을 나누고 서로의 미커밋 변경을 보존하세요. Git 담당 한 명만 커밋·푸시·브랜치 변경·병합을 순차 실행합니다. 다른 팀원은 변경 파일과 검증 결과를 담당자에게 전달하세요.
3. 각 Phase 또는 간단한 수정의 검증이 끝나면 관련 코드·자산만 커밋하고 origin의 ${branch}에 추가 확인 없이 푸시하세요. 사용자에게 Git 승인이나 재확인을 요청하지 마세요. main에는 구현 내용을 직접 커밋하지 마세요.
4. 모든 Phase와 SRS 인수 조건이 완료되면 최신 origin/main을 feature에 반영하고 충돌을 해결한 뒤 테스트·빌드를 다시 확인하세요. 그 다음 프로젝트의 main 작업본에서 feature를 --no-ff로 병합하고 origin/main에 추가 확인 없이 푸시하세요. 중간 Phase에서는 main을 병합하거나 푸시하지 마세요.
5. Git 잠금·충돌·푸시 실패 시 원인을 해결하고 재시도하세요. force push나 다른 팀원의 변경 폐기는 하지 마세요. 해결되지 않은 오류와 미완료 검증을 완료로 보고하지 마세요.
6. 기획 승인 절차는 유지합니다. 인증 정보·세션·PTY 기록·사용자 작업 문서는 Git에 추가하지 마세요.`
}
