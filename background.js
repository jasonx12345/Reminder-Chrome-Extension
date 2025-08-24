'use strict';


const STORAGE_KEY = 'reminders';


async function getAll(){ const o = await chrome.storage.local.get({ [STORAGE_KEY]: [] }); return o[STORAGE_KEY]; }
async function saveAll(list){ await chrome.storage.local.set({ [STORAGE_KEY]: list }); }


async function updateBadge(){
const list = await getAll();
const now = Date.now();
const overdue = list.filter(r => !r.done && r.dueAt <= now).length;
await chrome.action.setBadgeBackgroundColor({ color: overdue ? '#f59e0b' : '#666' });
await chrome.action.setBadgeText({ text: overdue ? String(overdue) : '' });
}


async function rescheduleAll(){
const list = await getAll();
const now = Date.now();
await chrome.alarms.clearAll();
for(const r of list){ if(!r.done && r.dueAt > now){ chrome.alarms.create(r.id, { when: r.dueAt }); } }
}


function buildNotification(r){
return {
type: 'basic', iconUrl: 'icon128.png', title: 'Reminder',
message: r.title || "It's time", buttons: [{ title: 'Snooze 1h' }, { title: 'Done' }], priority: 0
};
}


chrome.runtime.onInstalled.addListener(async () => { await rescheduleAll(); await updateBadge(); });
chrome.runtime.onStartup.addListener(async () => { await rescheduleAll(); await updateBadge(); });


chrome.alarms.onAlarm.addListener(async (alarm) => {
const list = await getAll();
const r = list.find(x => x.id === alarm.name); if(!r || r.done) return;
chrome.notifications.create(`rem-${r.id}`, buildNotification(r));
updateBadge();
});


chrome.notifications.onButtonClicked.addListener(async (notifId, btnIndex) => {
if(!notifId.startsWith('rem-')) return; const id = notifId.slice(4);
const list = await getAll(); const i = list.findIndex(x => x.id === id); if(i===-1) return;
if(btnIndex === 0){ const newTs = Date.now() + 60*60*1000; list[i].dueAt = newTs; list[i].done = false; await saveAll(list); await chrome.alarms.clear(id); chrome.alarms.create(id, { when: newTs }); }
if(btnIndex === 1){ list[i].done = true; await saveAll(list); await chrome.alarms.clear(id); }
updateBadge();
});


chrome.notifications.onClicked.addListener(async (notifId) => {
if(!notifId.startsWith('rem-')) return; const id = notifId.slice(4);
const list = await getAll(); const i = list.findIndex(x => x.id === id); if(i===-1) return;
list[i].done = true; await saveAll(list); await chrome.alarms.clear(id); updateBadge();
});


chrome.runtime.onMessage.addListener((msg) => { if(msg?.type === 'updateBadge') updateBadge(); });