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
  startOutgoingCall: (call: Omit<CallSessionState, 'direction' | 'status'>) => void
  receiveIncomingCall: (call: Omit<CallSessionState, 'direction' | 'status'>) => void
  answerCall: () => void
  endCall: () => void
  markActive: () => void
  minimizeCall: () => void
  restoreCall: () => void
  toggleMinimize: () => void
}

export const useCallStore = create<CallStore>((set) => ({
  activeCall: null,
  isMinimized: false,
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
  endCall: () => set({ activeCall: null, isMinimized: false }),
  minimizeCall: () => set({ isMinimized: true }),
  restoreCall: () => set({ isMinimized: false }),
  toggleMinimize: () => set((s) => ({ isMinimized: !s.isMinimized })),
}))
