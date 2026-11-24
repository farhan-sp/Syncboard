const assert = require('assert');
const {
  getActivityPriority,
  insertActivityPriority,
  INITIAL_ISLAND_CONTEXT,
  islandReducer,
} = require('../src/renderer/src/island/reducer');

console.log('=============================================');
console.log('      SyncBoard Dynamic Island Unit Tests    ');
console.log('=============================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    failed++;
  }
}

// 1. Initial State
test('Initial state is collapsed and inactive', () => {
  assert.strictEqual(INITIAL_ISLAND_CONTEXT.state, 'collapsed');
  assert.strictEqual(INITIAL_ISLAND_CONTEXT.currentActivity, null);
  assert.strictEqual(INITIAL_ISLAND_CONTEXT.activityQueue.length, 0);
  assert.strictEqual(INITIAL_ISLAND_CONTEXT.hasUnreadInExpanded, false);
});

// 2. Priority Levels
test('Activity priority rankings (4 > 3 > 2 > 1)', () => {
  assert.strictEqual(getActivityPriority('file_offer'), 4);
  assert.strictEqual(getActivityPriority('transfer_progress'), 3);
  assert.strictEqual(getActivityPriority('link_received'), 2);
  assert.strictEqual(getActivityPriority('text_received'), 2);
  assert.strictEqual(getActivityPriority('connection_change'), 1);
});

// 3. Activity Preemption & Queue Ordering
test('Higher priority activity preempts current and puts current into queue', () => {
  let s = { ...INITIAL_ISLAND_CONTEXT };

  // 1. Text arrives (priority 2)
  const textAct = {
    id: 'text-1',
    type: 'text_received',
    title: 'Halo dari ponsel',
    createdAt: 1000,
  };
  s = islandReducer(s, { type: 'ACTIVITY', payload: textAct });
  assert.strictEqual(s.state, 'activity');
  assert.strictEqual(s.currentActivity?.id, 'text-1');
  assert.strictEqual(s.activityQueue.length, 0);

  // 2. Transfer Progress arrives (priority 3) -> should preempt text
  const progressAct = {
    id: 'prog-1',
    type: 'transfer_progress',
    title: 'video.mp4',
    progress: 10,
    createdAt: 2000,
  };
  s = islandReducer(s, { type: 'ACTIVITY', payload: progressAct });
  assert.strictEqual(s.state, 'activity');
  assert.strictEqual(s.currentActivity?.id, 'prog-1');
  assert.strictEqual(s.activityQueue.length, 1);
  assert.strictEqual(s.activityQueue[0].id, 'text-1');

  // 3. File Offer arrives (priority 4) -> should preempt progress
  const offerAct = {
    id: 'offer-1',
    type: 'file_offer',
    title: 'dokumen.zip',
    createdAt: 3000,
  };
  s = islandReducer(s, { type: 'ACTIVITY', payload: offerAct });
  assert.strictEqual(s.currentActivity?.id, 'offer-1');
  assert.strictEqual(s.activityQueue.length, 2);
  assert.strictEqual(s.activityQueue[0].id, 'prog-1');
  assert.strictEqual(s.activityQueue[1].id, 'text-1');

  // 4. Another text arrives (priority 2) -> goes into queue at end
  const textAct2 = {
    id: 'text-2',
    type: 'text_received',
    title: 'Pesan kedua',
    createdAt: 4000,
  };
  s = islandReducer(s, { type: 'ACTIVITY', payload: textAct2 });
  assert.strictEqual(s.currentActivity?.id, 'offer-1');
  assert.strictEqual(s.activityQueue.length, 3);
  assert.strictEqual(s.activityQueue[0].id, 'prog-1');
  assert.strictEqual(s.activityQueue[1].id, 'text-1');
  assert.strictEqual(s.activityQueue[2].id, 'text-2');
});

// 4. Queue Unwinding on Timeout / Dismiss
test('Dismissing activity unwinds queue in priority order until collapsed', () => {
  let s = { ...INITIAL_ISLAND_CONTEXT };
  s = islandReducer(s, {
    type: 'ACTIVITY',
    payload: { id: 'text-1', type: 'text_received', title: 'T1' },
  });
  s = islandReducer(s, {
    type: 'ACTIVITY',
    payload: { id: 'prog-1', type: 'transfer_progress', title: 'P1' },
  });
  s = islandReducer(s, {
    type: 'ACTIVITY',
    payload: { id: 'offer-1', type: 'file_offer', title: 'O1' },
  });

  // Current is offer-1
  assert.strictEqual(s.currentActivity?.id, 'offer-1');

  // Dismiss offer-1 -> next should be prog-1
  s = islandReducer(s, { type: 'DISMISS_CURRENT' });
  assert.strictEqual(s.state, 'activity');
  assert.strictEqual(s.currentActivity?.id, 'prog-1');

  // Dismiss prog-1 -> next should be text-1
  s = islandReducer(s, { type: 'TIMEOUT', activityId: 'prog-1' });
  assert.strictEqual(s.state, 'activity');
  assert.strictEqual(s.currentActivity?.id, 'text-1');

  // Dismiss text-1 -> returns to collapsed
  s = islandReducer(s, { type: 'TIMEOUT', activityId: 'text-1' });
  assert.strictEqual(s.state, 'collapsed');
  assert.strictEqual(s.currentActivity, null);
  assert.strictEqual(s.activityQueue.length, 0);
});

// 5. Expanded Protection Rule
test('While expanded, incoming activities do not interrupt or collapse the panel', () => {
  let s = { ...INITIAL_ISLAND_CONTEXT };
  // User expands island
  s = islandReducer(s, { type: 'CLICK_PILL' });
  assert.strictEqual(s.state, 'expanded');

  // Activity arrives while expanded
  const offer = { id: 'offer-exp', type: 'file_offer', title: 'foto.jpg' };
  s = islandReducer(s, { type: 'ACTIVITY', payload: offer });

  // State MUST remain expanded
  assert.strictEqual(s.state, 'expanded');
  assert.strictEqual(s.hasUnreadInExpanded, true);
  assert.strictEqual(s.activityQueue.length, 1);
  assert.strictEqual(s.activityQueue[0].id, 'offer-exp');

  // Closing expanded panel transitions to the queued activity
  s = islandReducer(s, { type: 'CLICK_PILL' });
  assert.strictEqual(s.state, 'activity');
  assert.strictEqual(s.currentActivity?.id, 'offer-exp');
});

// 6. Blur & Dragging
test('BLUR collapses expanded panel unless a file is actively being dragged', () => {
  let s = { ...INITIAL_ISLAND_CONTEXT };
  s = islandReducer(s, { type: 'CLICK_PILL' });
  assert.strictEqual(s.state, 'expanded');

  // Normal blur collapses
  s = islandReducer(s, { type: 'BLUR' });
  assert.strictEqual(s.state, 'collapsed');

  // Re-expand
  s = islandReducer(s, { type: 'CLICK_PILL' });
  assert.strictEqual(s.state, 'expanded');

  // Dragging file active -> blur should NOT collapse
  s = islandReducer(s, { type: 'SET_DRAGGING', dragging: true });
  s = islandReducer(s, { type: 'BLUR' });
  assert.strictEqual(s.state, 'expanded');

  // End drag -> blur collapses
  s = islandReducer(s, { type: 'SET_DRAGGING', dragging: false });
  s = islandReducer(s, { type: 'BLUR' });
  assert.strictEqual(s.state, 'collapsed');
});

// 7. Activity Updates (e.g. progress percentage)
test('ACTIVITY_UPDATE mutates progress and status of active activity', () => {
  let s = { ...INITIAL_ISLAND_CONTEXT };
  s = islandReducer(s, {
    type: 'ACTIVITY',
    payload: { id: 'transfer-99', type: 'transfer_progress', title: 'arsip.zip', progress: 5 },
  });

  assert.strictEqual(s.currentActivity?.progress, 5);

  s = islandReducer(s, {
    type: 'ACTIVITY_UPDATE',
    payload: { id: 'transfer-99', progress: 65 },
  });
  assert.strictEqual(s.currentActivity?.progress, 65);

  s = islandReducer(s, {
    type: 'ACTIVITY_UPDATE',
    payload: { id: 'transfer-99', progress: 100, status: 'done' },
  });
  assert.strictEqual(s.currentActivity?.progress, 100);
  assert.strictEqual(s.currentActivity?.status, 'done');
});

console.log('\n=============================================');
console.log(`Island Reducer Results: ${passed} PASSED, ${failed} FAILED`);
console.log('=============================================\n');

if (failed > 0) process.exit(1);
