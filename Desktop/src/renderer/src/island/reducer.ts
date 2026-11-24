export type IslandState = 'hidden' | 'collapsed' | 'activity' | 'expanded';
export type IslandTab = 'kirim' | 'riwayat' | 'perangkat' | 'pengaturan';

export type ActivityType =
  | 'file_offer'
  | 'transfer_progress'
  | 'text_received'
  | 'link_received'
  | 'connection_change';

export interface IslandActivity {
  id: string;
  type: ActivityType;
  priority: number; // 4: file_offer, 3: transfer_progress, 2: text/link, 1: connection_change
  title: string;
  subtitle?: string;
  deviceName?: string;
  progress?: number; // 0..100
  status?: 'active' | 'done' | 'failed' | 'cancelled';
  url?: string;
  text?: string;
  requestId?: string; // for file offer
  fileSize?: string;
  timeoutMs?: number; // e.g. 5000 for text, 3000 for done, 6000 for failed
  createdAt: number;
}

export interface IslandContext {
  state: IslandState;
  activeTab: IslandTab;
  currentActivity: IslandActivity | null;
  activityQueue: IslandActivity[];
  hasUnreadInExpanded: boolean;
  isDraggingFile: boolean;
  isHovered: boolean;
}

export type IslandEvent =
  | { type: 'ACTIVITY'; payload: IslandActivity }
  | { type: 'ACTIVITY_UPDATE'; payload: Partial<IslandActivity> & { id: string } }
  | { type: 'TIMEOUT'; activityId?: string }
  | { type: 'CLICK_PILL' }
  | { type: 'COLLAPSE' }
  | { type: 'SELECT_TAB'; tab: IslandTab }
  | { type: 'BLUR' }
  | { type: 'SHOW' }
  | { type: 'HIDE' }
  | { type: 'DISMISS_CURRENT' }
  | { type: 'SET_HOVER'; hovered: boolean }
  | { type: 'SET_DRAGGING'; dragging: boolean };

export function getActivityPriority(type: ActivityType): number {
  switch (type) {
    case 'file_offer':
      return 4;
    case 'transfer_progress':
      return 3;
    case 'link_received':
    case 'text_received':
      return 2;
    case 'connection_change':
      return 1;
    default:
      return 0;
  }
}

export function insertActivityPriority(queue: IslandActivity[], item: IslandActivity): IslandActivity[] {
  const next = [...queue];
  // Insert such that higher priority comes first; stable FIFO for same priority
  let idx = 0;
  while (idx < next.length && next[idx].priority >= item.priority) {
    idx++;
  }
  next.splice(idx, 0, item);
  return next;
}

export const INITIAL_ISLAND_CONTEXT: IslandContext = {
  state: 'collapsed',
  activeTab: 'kirim',
  currentActivity: null,
  activityQueue: [],
  hasUnreadInExpanded: false,
  isDraggingFile: false,
  isHovered: false,
};

export function islandReducer(state: IslandContext, event: IslandEvent): IslandContext {
  switch (event.type) {
    case 'ACTIVITY': {
      const incoming = {
        ...event.payload,
        priority: event.payload.priority || getActivityPriority(event.payload.type),
      };

      // Rule: While expanded, new activity does NOT collapse or change state
      if (state.state === 'expanded') {
        return {
          ...state,
          hasUnreadInExpanded: true,
          activityQueue: insertActivityPriority(state.activityQueue, incoming),
        };
      }

      // If hidden, become active
      if (state.state === 'hidden') {
        return {
          ...state,
          state: 'activity',
          currentActivity: incoming,
        };
      }

      // If collapsed, immediately show this activity
      if (state.state === 'collapsed') {
        return {
          ...state,
          state: 'activity',
          currentActivity: incoming,
        };
      }

      // If already in activity state, compare priorities
      if (state.state === 'activity' && state.currentActivity) {
        // If incoming has strictly higher priority, preempt current
        if (incoming.priority > state.currentActivity.priority) {
          return {
            ...state,
            currentActivity: incoming,
            activityQueue: insertActivityPriority(state.activityQueue, state.currentActivity),
          };
        } else {
          // Put incoming into queue
          return {
            ...state,
            activityQueue: insertActivityPriority(state.activityQueue, incoming),
          };
        }
      }

      return {
        ...state,
        state: 'activity',
        currentActivity: incoming,
      };
    }

    case 'ACTIVITY_UPDATE': {
      // Update in currentActivity if matches
      if (state.currentActivity && state.currentActivity.id === event.payload.id) {
        return {
          ...state,
          currentActivity: {
            ...state.currentActivity,
            ...event.payload,
          },
        };
      }

      // Otherwise update in queue
      const nextQueue = state.activityQueue.map((item) =>
        item.id === event.payload.id ? { ...item, ...event.payload } : item
      );
      return {
        ...state,
        activityQueue: nextQueue,
      };
    }

    case 'TIMEOUT':
    case 'DISMISS_CURRENT': {
      // Only process timeout if activityId matches or not specified
      if (event.type === 'TIMEOUT' && event.activityId && state.currentActivity?.id !== event.activityId) {
        return state;
      }

      // If queue has next items, take the next highest priority item
      if (state.activityQueue.length > 0) {
        const [nextActivity, ...remainingQueue] = state.activityQueue;
        return {
          ...state,
          state: state.state === 'expanded' ? 'expanded' : 'activity',
          currentActivity: nextActivity,
          activityQueue: remainingQueue,
        };
      }

      // If queue is empty:
      // If expanded, keep expanded
      if (state.state === 'expanded') {
        return {
          ...state,
          currentActivity: null,
        };
      }

      // Otherwise, return to collapsed
      return {
        ...state,
        state: 'collapsed',
        currentActivity: null,
      };
    }

    case 'CLICK_PILL': {
      if (state.state === 'collapsed' || state.state === 'activity') {
        return {
          ...state,
          state: 'expanded',
          hasUnreadInExpanded: false,
        };
      }
      if (state.state === 'expanded') {
        if (state.currentActivity) {
          return {
            ...state,
            state: 'activity',
            hasUnreadInExpanded: false,
          };
        }
        if (state.activityQueue.length > 0) {
          const [nextAct, ...remaining] = state.activityQueue;
          return {
            ...state,
            state: 'activity',
            currentActivity: nextAct,
            activityQueue: remaining,
            hasUnreadInExpanded: false,
          };
        }
        return {
          ...state,
          state: 'collapsed',
          hasUnreadInExpanded: false,
        };
      }
      return state;
    }

    case 'COLLAPSE': {
      if (state.currentActivity) {
        return {
          ...state,
          state: 'activity',
          hasUnreadInExpanded: false,
        };
      }
      if (state.activityQueue.length > 0) {
        const [nextAct, ...remaining] = state.activityQueue;
        return {
          ...state,
          state: 'activity',
          currentActivity: nextAct,
          activityQueue: remaining,
          hasUnreadInExpanded: false,
        };
      }
      return {
        ...state,
        state: 'collapsed',
        currentActivity: null,
        hasUnreadInExpanded: false,
      };
    }

    case 'SELECT_TAB': {
      return {
        ...state,
        activeTab: event.tab,
      };
    }

    case 'BLUR': {
      // Blur closes expanded panel unless file is being dragged
      if (state.state === 'expanded' && !state.isDraggingFile) {
        return {
          ...state,
          state: state.currentActivity ? 'activity' : 'collapsed',
          hasUnreadInExpanded: false,
        };
      }
      return state;
    }

    case 'SHOW': {
      return {
        ...state,
        state: state.currentActivity ? 'activity' : 'collapsed',
      };
    }

    case 'HIDE': {
      return {
        ...state,
        state: 'hidden',
      };
    }

    case 'SET_HOVER': {
      return {
        ...state,
        isHovered: event.hovered,
      };
    }

    case 'SET_DRAGGING': {
      return {
        ...state,
        isDraggingFile: event.dragging,
      };
    }

    default:
      return state;
  }
}
