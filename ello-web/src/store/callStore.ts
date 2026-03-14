import { create } from 'zustand'
import type { CallType } from '@/types/call'
import type { User } from '@/types'

type CallDirection = 'incoming' | 'outgoing'
type CallStatus = 'ringing' | 'active'

export interface CallSessionState {
  callId: number
  callType: CallType
  user: User
  direction: CallDirection
  status: CallStatus
}

interface CallStore {
  activeCall: CallSessionState | null
  isMinimized: boolean
  autoAnswerCallId: number | null
  startOutgoingCall: (call: Omit<CallSessionState, 'direction' | 'status'>) => void
  receiveIncomingCall: (call: Omit<CallSessionState, 'direction' | 'status'>) => void
  answerCall: () => void
  endCall: () => void
  markActive: () => void
  requestAutoAnswer: (callId: number) => void
  consumeAutoAnswer: (callId?: number) => void
  minimizeCall: () => void
  restoreCall: () => void
  toggleMinimize: () => void
}

export const useCallStore = create<CallStore>((set) => ({
  activeCall: null,
  isMinimized: false,
  autoAnswerCallId: null,
  startOutgoingCall: (call) =>
    set({
      activeCall: {
        ...call,
        direction: 'outgoing',
        status: 'ringing',
      },
      isMinimized: false,
    }),
  receiveIncomingCall: (call) =>
    set({
      activeCall: {
        ...call,
        direction: 'incoming',
        status: 'ringing',
      },
      isMinimized: false,
    }),
  answerCall: () =>
    set((state) => ({
      activeCall:
        state.activeCall && state.activeCall.direction === 'incoming'
          ? { ...state.activeCall, status: 'active' }
          : state.activeCall,
      isMinimized: state.isMinimized,
    })),
  markActive: () =>
    set((state) => ({
      activeCall:
        state.activeCall && state.activeCall.status !== 'active'
          ? { ...state.activeCall, status: 'active' }
          : state.activeCall,
      isMinimized: state.isMinimized,
    })),
  requestAutoAnswer: (callId) =>
    set({
      autoAnswerCallId: Number.isFinite(callId) ? callId : null,
    }),
  consumeAutoAnswer: (callId) =>
    set((state) => {
      if (typeof callId === 'number' && state.autoAnswerCallId !== callId) {
        return {}
      }
      return {
        autoAnswerCallId: null,
      }
    }),
  endCall: () => set({ activeCall: null, isMinimized: false, autoAnswerCallId: null }),
  minimizeCall: () => set({ isMinimized: true }),
  restoreCall: () => set({ isMinimized: false }),
  toggleMinimize: () => set((s) => ({ isMinimized: !s.isMinimized })),
}))
