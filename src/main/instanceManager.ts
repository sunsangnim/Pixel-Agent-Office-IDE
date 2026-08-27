import { randomUUID } from 'crypto'
import type { WebContents } from 'electron'
import { ptyManager } from './ptyManager'
import { agentTemplateStore } from './agentStore'
import type { AgentInstance } from '../shared/types'

class InstanceManager {
  private instances = new Map<string, AgentInstance>()

  list(): AgentInstance[] {
    return Array.from(this.instances.values())
  }

  create(templateId: string, cwd: string, sender: WebContents): AgentInstance[] {
    const template = agentTemplateStore.list().find((t) => t.id === templateId)
    if (!template) {
      throw new Error(`Unknown agent template: ${templateId}`)
    }

    const ptyId = ptyManager.spawn(
      { command: template.command, args: template.args, cwd },
      sender
    )

    const instance: AgentInstance = {
      instanceId: randomUUID(),
      templateId,
      cwd,
      ptyId
    }
    this.instances.set(instance.instanceId, instance)
    return this.list()
  }

  remove(instanceId: string): AgentInstance[] {
    const instance = this.instances.get(instanceId)
    if (instance) {
      ptyManager.kill(instance.ptyId)
      this.instances.delete(instanceId)
    }
    return this.list()
  }
}

export const instanceManager = new InstanceManager()
