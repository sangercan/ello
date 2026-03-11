export type CallType = 'voice' | 'video'

export interface CallRecord {
  callId: number
  callType: CallType
}
