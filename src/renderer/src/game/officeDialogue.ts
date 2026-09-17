export interface OfficeDialogue {
  id: string
  profileId: string
  displayName: string
  text: string
  portraitUrl: string
}

export interface OfficeRequest {
  id: string
  profileId: string
  kind: 'permission' | 'planning' | 'approval'
  text: string
  ptyId?: string
  specText?: string
  onCancel?: () => void
  onApprove?: () => void
  onReject?: (feedback: string) => void
}
