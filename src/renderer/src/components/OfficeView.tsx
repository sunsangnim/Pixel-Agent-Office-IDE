import type { AgentInstance, AgentProfile, AgentStatePayload, AgentTemplate, DeskStatus } from '@shared/types'
import { useOfficePresence } from '../hooks/useOfficePresence'
import { useOfficeClock } from '../hooks/useOfficeClock'
import type { OfficeWorldSnapshot } from '../game/officeWorld'
import PhaserOffice from './PhaserOffice'

interface OfficeViewProps {
  instances: AgentInstance[]
  profiles: AgentProfile[]
  templates: AgentTemplate[]
  statuses: Record<string, DeskStatus>
  runtimeStates: Record<string, AgentStatePayload>
  tasks: Record<string, string>
  selectedInstanceId: string | null
  onSelect: (instanceId: string) => void
  onRemove: (instanceId: string) => void
  meetingActive: boolean
}

function OfficeView(props: OfficeViewProps) {
  const officeClock = useOfficeClock()
  const presenceByProfile = useOfficePresence(
    props.profiles,
    props.instances,
    props.runtimeStates,
    props.tasks,
    officeClock.isWorkingHours,
    officeClock.isClockInActive,
    props.meetingActive
  )
  const teamIds = Array.from(new Set(props.profiles.map((profile) => profile.templateId)))
  const snapshot: OfficeWorldSnapshot = {
    now: officeClock.now.getTime(),
    meetingActive: props.meetingActive,
    elevatorOpen: officeClock.isClockInActive,
    actors: props.profiles.map((profile, rosterIndex) => {
      const instance = props.instances.find((candidate) => candidate.profileId === profile.profileId)
      const template = props.templates.find((candidate) => candidate.id === profile.templateId)
      return {
        profileId: profile.profileId,
        instanceId: instance?.instanceId ?? null,
        displayName: profile.displayName,
        color: template?.color ?? '#66736d',
        rosterIndex: rosterIndex + 1,
        slotIndex: profile.slotIndex,
        teamIndex: Math.max(0, teamIds.indexOf(profile.templateId)),
        presence: presenceByProfile[profile.profileId] ?? 'offDuty'
      }
    })
  }

  const selectActor = (profileId: string): void => {
    const instance = props.instances.find((candidate) => candidate.profileId === profileId)
    if (instance) props.onSelect(instance.instanceId)
  }

  const reportDeskCounts = (counts: number[]): void => {
    const report: Record<string, number> = {}
    teamIds.slice(0, counts.length).forEach((templateId, index) => {
      report[templateId] = counts[index] ?? 0
    })
    window.api.teamCapacity.report(report)
  }

  return (
    <div className="office-room phaser-office-room">
      <PhaserOffice
        snapshot={snapshot}
        teamTemplateIds={teamIds}
        onActorSelect={selectActor}
        onDeskCountsChange={reportDeskCounts}
      />
    </div>
  )
}

export default OfficeView
