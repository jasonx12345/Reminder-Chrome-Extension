// background.js — schedule per-reminder alarms for exact on-time notifications
const STORAGE_KEY = 'reminders';

// OPTIONAL: fire slightly early to counter OS wake-up jitter (default 0ms).

const SCHEDULE_EARLY_MS = 0;

// Helpers
const getAll  = async () => (await chrome.storage.local.get({ [STORAGE_KEY]: [] }))[STORAGE_KEY];
const saveAll = async (list) => chrome.storage.local.set({ [STORAGE_KEY]: list });
const fmt     = (ts) => new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/* ---------- Scheduling ---------- */
function alarmName(id) { return `due:${id}`; }

async function scheduleAlarmFor(r) {
  if (r.done) return;
  const now = Date.now();
  let when = r.dueAt - SCHEDULE_EARLY_MS;
  if (when <= now) return; // if already due, we'll notify in rescheduleAll()
  await chrome.alarms.create(alarmName(r.id), { when });
}

async function clearAlarmFor(id) {
  await chrome.alarms.clear(alarmName(id));
}

async function rescheduleAll() {
  const list = await getAll();
  const now = Date.now();

  // Clear all existing per-reminder alarms first
  const existing = await chrome.alarms.getAll();
  await Promise.all(
    existing
      .filter(a => a.name.startsWith('due:'))
      .map(a => chrome.alarms.clear(a.name))
  );

  // Recreate alarms for active future reminders; notify any missed ones now
  let dueCount = 0;
  for (const r of list) {
    if (r.done) continue;
    if (r.dueAt <= now && !r.notifiedAt) {
      // missed while SW was asleep—notify immediately
      await createNotification(r);
      r.notifiedAt = now;
      dueCount++; // still due until user marks done
    } else if (r.dueAt > now) {
      await scheduleAlarmFor(r);
    }
  }
  await saveAll(list);
  updateBadge();
}

/* ---------- Notifications ---------- */
async function createNotification(r) {
  const nid = alarmName(r.id);
  await chrome.notifications.create(nid, {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: r.title || 'Reminder',
    message: `Due: ${fmt(r.dueAt)}`,
    requireInteraction: true, // stays until user acts
    priority: 2,
    buttons: [{ title: 'Mark Done' }]
  });
}

async function updateBadge() {
  const now = Date.now();
  const list = await getAll();
  const count = list.filter(r => !r.done && r.dueAt <= now && !r.archived).length;
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  if (count > 0) await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
}

/* ---------- Events ---------- */
// On install/startup: rebuild alarms from storage so we’re aligned to times
chrome.runtime.onInstalled.addListener(rescheduleAll);
chrome.runtime.onStartup.addListener(rescheduleAll);

// When alarms fire: show the notification, mark as "notified"
chrome.alarms.onAlarm.addListener(async (a) => {
  if (!a.name.startsWith('due:')) return;
  const id = a.name.split(':')[1];
  const list = await getAll();
  const i = list.findIndex(r => r.id === id);
  if (i === -1) return;

  const r = list[i];
  if (r.done) { updateBadge(); return; }

  await createNotification(r);
  r.notifiedAt = Date.now();
  await saveAll(list);
  updateBadge();
});

// When storage changes (added/edited/deleted): re-schedule alarms to stay accurate
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && STORAGE_KEY in changes) {
    rescheduleAll();
  }
});

// Clicking the notification body: open the popup as a full tab
chrome.notifications.onClicked.addListener((nid) => {
  if (!nid.startsWith('due:')) return;
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
});

// Button[0] = “Mark Done”
chrome.notifications.onButtonClicked.addListener(async (nid, idx) => {
  if (!nid.startsWith('due:') || idx !== 0) return;
  const id = nid.split(':')[1];
  const list = await getAll();
  const i = list.findIndex(r => r.id === id);
  if (i === -1) return;
  list[i].done = true;
  list[i].updatedAt = Date.now();
  await saveAll(list);
  chrome.notifications.clear(nid);
  clearAlarmFor(id);
  updateBadge();
});
