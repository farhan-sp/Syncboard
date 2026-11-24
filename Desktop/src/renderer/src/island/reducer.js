function getActivityPriority(type) {
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

function insertActivityPriority(queue, item) {
  const next = [...queue];
  let idx = 0;
  while (idx < next.length && next[idx].priority >= item.priority) {
    idx++;
  }
  next.splice(idx, 0, item);
  return next;
}

const INITIAL_ISLAND_CONTEXT = {
  state: 'collapsed',
  activeTab: 'kirim',
  currentActivity: null,
  activityQueue: [],
  hasUnreadInExpanded: false,
  isDraggingFile: false,
  isHovered: false,
};

function islandReducer(state, event) {
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
        if (incoming.priority > state.currentActivity.priority) {
          return {
            ...state,
            currentActivity: incoming,
            activityQueue: insertActivityPriority(state.activityQueue, state.currentActivity),
          };
        } else {
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
      if (state.currentActivity && state.currentActivity.id === event.payload.id) {
        return {
          ...state,
          currentActivity: {
            ...state.currentActivity,
            ...event.payload,
          },
        };
      }

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
      if (event.type === 'TIMEOUT' && event.activityId && state.currentActivity?.id !== event.activityId) {
        return state;
      }

      if (state.activityQueue.length > 0) {
        const [nextActivity, ...remainingQueue] = state.activityQueue;
        return {
          ...state,
          state: state.state === 'expanded' ? 'expanded' : 'activity',
          currentActivity: nextActivity,
          activityQueue: remainingQueue,
        };
      }

      if (state.state === 'expanded') {
        return {
          ...state,
          currentActivity: null,
        };
      }

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

module.exports = {
  getActivityPriority,
  insertActivityPriority,
  INITIAL_ISLAND_CONTEXT,
  islandReducer,
};
