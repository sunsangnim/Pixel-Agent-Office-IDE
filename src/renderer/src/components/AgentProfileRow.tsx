import type { AgentInstance, AgentProfile, AgentStatePayload, AgentTemplate, DeskStatus } from '@shared/types'
import AgentProfileCard from './AgentProfileCard'
import CorporateCharacterSprite from './CorporateCharacterSprite'

interface AgentProfileRowProps {
  instances: AgentInstance[]
  profiles: AgentProfile[]
  templates: AgentTemplate[]
  statuses: Record<string, DeskStatus>
  runtimeStates: Record<string, AgentStatePayload>
  tasks: Record<string, string>
  selectedTargetIds: Set<string>
  onToggleTarget: (instanceId: string) => void
  onOpenDiff: (instanceId: string) => void
}

function AgentProfileRow({
  instances,
  profiles,
  templates,
  statuses,
  runtimeStates,
  tasks,
  selectedTargetIds,
  onToggleTarget,
  onOpenDiff
}: AgentProfileRowProps) {
  const teamIds = Array.from(new Set(profiles.map((profile) => profile.templateId)))
  const teamLabels: Record<string, string> = {
    'claude-code': 'Team Claude',
    'codex-cli': 'Team Codex',
    'antigravity-cli': 'Team Antigravity'
  }

  return (
    <div className="profile-row profile-team-list">
      {teamIds.map((teamId) => (
        <section className="profile-team" data-team={teamId} key={teamId}>
          <h3 className="profile-team-title">{teamLabels[teamId] ?? `Team ${teamId}`}</h3>
          <div className="profile-team-cards">
            {profiles.filter((profile) => profile.templateId === teamId).map((profile) => {
              const rosterIndex = profiles.indexOf(profile) + 1
              const instance = instances.find((candidate) => candidate.profileId === profile.profileId)
              const template = templates.find((candidate) => candidate.id === profile.templateId)
              return instance ? (
                <AgentProfileCard
                  key={profile.profileId}
                  instance={instance}
                  template={template}
                  status={statuses[instance.ptyId] ?? 'idle'}
                  runtimeState={runtimeStates[instance.ptyId]}
                  task={tasks[instance.instanceId]}
                  selected={selectedTargetIds.has(instance.instanceId)}
                  onToggle={() => onToggleTarget(instance.instanceId)}
                  onOpenDiff={() => onOpenDiff(instance.instanceId)}
                  displayName={profile.displayName}
                  rosterIndex={rosterIndex}
                />
              ) : (
                <div className="profile-card profile-card-offduty" key={profile.profileId} title="CLI 프로세스 미실행">
                  <CorporateCharacterSprite rosterIndex={rosterIndex} className="profile-character" />
                  <span className="profile-card-name">{profile.displayName}</span>
                  <span className="profile-card-task">미출근</span>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export default AgentProfileRow
