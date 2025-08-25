'use strict';


const STORAGE_KEY = 'reminders';
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function fmt(ts){ return new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

async function getAll(){ const o = await chrome.storage.local.get({ [STORAGE_KEY]: [] }); return o[STORAGE_KEY]; }
async function saveAll(list){ await chrome.storage.local.set({ [STORAGE_KEY]: list }); }

function flash(msg){
  const n = document.createElement('div');
  n.textContent = msg;
  Object.assign(n.style, {
    position:'fixed', left:'8px', right:'8px', bottom:'8px',
    padding:'10px 12px', borderRadius:'10px', background:'#111827',
    color:'#f8fafc', border:'1px solid #374151', boxShadow:'0 2px 8px rgba(0,0,0,.35)',
    textAlign:'center', zIndex:9999
  });
  document.body.appendChild(n); setTimeout(()=>n.remove(), 1200);
}

/* ---------- BOUNDS ---------- */
const YEARS_AHEAD = 2;
let MIN_DATE, MAX_DATE;
function todayMidnight(){
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
function setupBounds(){
  MIN_DATE = todayMidnight();
  MAX_DATE = new Date(MIN_DATE.getFullYear() + YEARS_AHEAD, MIN_DATE.getMonth(), MIN_DATE.getDate());
}

/* ---------- CUSTOM DATE PICKER (year/month/day) ---------- */
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function daysInMonth(y, m){ return new Date(y, m+1, 0).getDate(); } // m: 0-based

function fillSelect(sel, values, labels = values, selected){
  sel.innerHTML = '';
  values.forEach((v,i) => {
    const opt = document.createElement('option');
    opt.value = String(v);
    opt.textContent = labels[i];
    if (String(v) === String(selected)) opt.selected = true;
    sel.appendChild(opt);
  });
}
function winkButton(btn, className, ms = 220){
  return new Promise((resolve) => {
    try {
      btn.classList.add(className);
      btn.style.pointerEvents = 'none';
      btn.disabled = true;
    } catch {}
    setTimeout(() => {
      try {
        btn.classList.remove(className);
        btn.style.pointerEvents = '';
        btn.disabled = false;
      } catch {}
      resolve();
    }, ms);
  });
}


function buildMainDateControls(defaultDate){
  const ySel = $('#year'), mSel = $('#month'), dSel = $('#day');
  const minY = MIN_DATE.getFullYear(), maxY = MAX_DATE.getFullYear();

  const years = []; for (let y=minY; y<=maxY; y++) years.push(y);
  fillSelect(ySel, years, years.map(String), defaultDate.getFullYear());

  function refreshMonths(selectedYear){
    const isMinY = selectedYear === minY;
    const isMaxY = selectedYear === maxY;
    const startM = isMinY ? MIN_DATE.getMonth() : 0;
    const endM   = isMaxY ? MAX_DATE.getMonth() : 11;
    const months = Array.from({length: endM-startM+1}, (_,i)=> startM+i);
    fillSelect(mSel, months, months.map(m => MONTH_NAMES[m]),
               Math.min(Math.max(defaultDate.getMonth(), startM), endM));
  }
  function refreshDays(selectedYear, selectedMonth){
    const isMin = (selectedYear===minY && selectedMonth===MIN_DATE.getMonth());
    const isMax = (selectedYear===maxY && selectedMonth===MAX_DATE.getMonth());
    const startD = isMin ? MIN_DATE.getDate() : 1;
    const endD   = isMax ? MAX_DATE.getDate() : daysInMonth(selectedYear, selectedMonth);
    const days = Array.from({length: endD-startD+1}, (_,i)=> startD+i);
    let want = defaultDate.getDate();
    if (want < startD) want = startD;
    if (want > endD)   want = endD;
    fillSelect(dSel, days, days.map(String), want);
  }
  refreshMonths(defaultDate.getFullYear());
  refreshDays(defaultDate.getFullYear(), parseInt(mSel.value,10));
  ySel.onchange = () => { refreshMonths(parseInt(ySel.value,10)); refreshDays(parseInt(ySel.value,10), parseInt(mSel.value,10)); };
  mSel.onchange = () => { refreshDays(parseInt(ySel.value,10), parseInt(mSel.value,10)); };
}

function getMainSelectedDate(){
  const y = parseInt($('#year').value, 10);
  const m = parseInt($('#month').value, 10);
  const d = parseInt($('#day').value, 10);
  return new Date(y, m, d);
}

/* ---------- TIME HELPERS ---------- */
function nextMinute(ts = Date.now()){
  const t = new Date(ts); t.setSeconds(0,0); t.setMinutes(t.getMinutes()+1); return t;
}

/* ---------- DEFAULTS ---------- */
function setDefaults(){
  const now = new Date();
  const in2h = new Date(now.getTime() + 2*60*60*1000);
  let dd = new Date(in2h.getFullYear(), in2h.getMonth(), in2h.getDate());
  if (dd < MIN_DATE) dd = MIN_DATE;
  if (dd > MAX_DATE) dd = MAX_DATE;

  buildMainDateControls(dd);
  $('#time').value = String(in2h.getHours()).padStart(2,'0') + ':' + String(in2h.getMinutes()).padStart(2,'0');
  $('#title').value = '';
}

/* ---------- CRUD ---------- */
function toTsFromMain(){
  const d = getMainSelectedDate();
  const [hh, mm] = ($('#time').value || '09:00').split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0).getTime();
}


function clearNotif(id){
  try { chrome.notifications.clear(`reminder:${id}`); } catch {}
}

async function addReminder(){
  const title = $('#title').value.trim();
  if(!title){ flash('Title required'); return; }

  // move past times into the future (next minute)
  let ts = toTsFromMain();
  const minTs = nextMinute().getTime();
  if (ts < minTs) {
    const nd = new Date(minTs);
    buildMainDateControls(new Date(nd.getFullYear(), nd.getMonth(), nd.getDate()));
    $('#time').value = String(nd.getHours()).padStart(2,'0') + ':' + String(nd.getMinutes()).padStart(2,'0');
    flash('Past time not allowed — moved to the next minute');
    ts = minTs;
  }

  const r = { id: uid(), title, dueAt: ts, done:false, createdAt: Date.now(), updatedAt: Date.now(), notifiedAt: null };
  const list = await getAll();
  list.push(r); await saveAll(list);
  flash('Added');
  setDefaults();
  render();
}

async function toggleDone(id){
  const list = await getAll();
  const i = list.findIndex(x => x.id === id); if(i===-1) return;
  list[i].done = !list[i].done;
  list[i].updatedAt = Date.now();
  await saveAll(list);
  clearNotif(id);  // clear if there was a live notification
  render();
}

async function del(id){
  const list = await getAll();
  const i = list.findIndex(x => x.id === id); if(i===-1) return;
  list.splice(i,1);
  await saveAll(list);
  clearNotif(id);  // clear if there was a live notification
  flash('Deleted');
  render();
}

async function startEdit(id){
  const row = document.querySelector(`[data-row="${id}"]`);
  if(!row) return;
  const edit = row.querySelector('.editRow');
  edit.style.display = edit.style.display === 'none' ? 'flex' : 'none';
}

function buildRowDateControls(row, dateObj){
  const ySel = row.querySelector('.editYear');
  const mSel = row.querySelector('.editMonth');
  const dSel = row.querySelector('.editDay');

  const minY = MIN_DATE.getFullYear(), maxY = MAX_DATE.getFullYear();
  const years = []; for(let y=minY;y<=maxY;y++) years.push(y);
  fillSelect(ySel, years, years.map(String), dateObj.getFullYear());

  function refreshMonths(y){
    const startM = (y===minY) ? MIN_DATE.getMonth() : 0;
    const endM   = (y===maxY) ? MAX_DATE.getMonth() : 11;
    const months = Array.from({length:endM-startM+1}, (_,i)=> startM+i);
    fillSelect(mSel, months, months.map(m=>MONTH_NAMES[m]),
               Math.min(Math.max(dateObj.getMonth(), startM), endM));
  }
  function refreshDays(y,m){
    const startD = (y===minY && m===MIN_DATE.getMonth()) ? MIN_DATE.getDate() : 1;
    const endD   = (y===maxY && m===MAX_DATE.getMonth()) ? MAX_DATE.getDate() : daysInMonth(y,m);
    const days = Array.from({length:endD-startD+1}, (_,i)=> startD+i);
    let want = dateObj.getDate();
    if (want < startD) want = startD; if (want > endD) want = endD;
    fillSelect(dSel, days, days.map(String), want);
  }

  refreshMonths(dateObj.getFullYear());
  refreshDays(dateObj.getFullYear(), parseInt(mSel.value,10));

  ySel.onchange = () => { refreshMonths(parseInt(ySel.value,10)); refreshDays(parseInt(ySel.value,10), parseInt(mSel.value,10)); };
  mSel.onchange = () => { refreshDays(parseInt(ySel.value,10), parseInt(mSel.value,10)); };
}

async function saveEdit(id){
  const row = document.querySelector(`[data-row="${id}"]`);
  if(!row) return;
  const title = row.querySelector('.editTitle').value.trim();
  if(!title){ flash('Title required'); return; }

  const y = parseInt(row.querySelector('.editYear').value,10);
  const m = parseInt(row.querySelector('.editMonth').value,10);
  const d = parseInt(row.querySelector('.editDay').value,10);
  const [hh,mm] = (row.querySelector('.editTime').value || '09:00').split(':').map(Number);
  let ts = new Date(y, m, d, hh, mm, 0, 0).getTime();

  const minTs = nextMinute().getTime();
  if (ts < minTs) ts = minTs; // bump future

  const list = await getAll();
  const i = list.findIndex(x => x.id === id); if(i===-1) return;
  list[i].title = title;
  list[i].dueAt = ts;
  list[i].done = false;
  list[i].notifiedAt = null;   // reset so background can notify again at the new time
  list[i].updatedAt = Date.now();
  await saveAll(list);
  clearNotif(id);
  flash('Updated');
  render();
}

/* ---------- Render (unchanged) ---------- */
async function render(){
  const list = (await getAll()).slice().sort((a,b)=>a.dueAt-b.dueAt);
  const now = new Date();
  const overdue  = list.filter(r => !r.done && r.dueAt <  now.getTime());
  const today    = list.filter(r => !r.done && sameDay(new Date(r.dueAt), now));
  const upcoming = list.filter(r => !r.done && r.dueAt >= now.getTime() && !sameDay(new Date(r.dueAt), now));
  const groups = [
    ['overdueGroup','overdueList',overdue],
    ['todayGroup','todayList',today],
    ['upcomingGroup','upcomingList',upcoming]
  ];
  for(const [wrapId,listId,items] of groups){
    const wrap = $('#'+wrapId); const mount = $('#'+listId);
    if (!wrap || !mount) continue;
    wrap.style.display = items.length ? 'block' : 'none';
    mount.innerHTML = '';
    for(const r of items){
      const row = document.createElement('div'); row.className='card'; row.dataset.row = r.id;
      row.innerHTML = `
        <div class="item">
          <div class="meta">
            <div><strong>${r.title}</strong>${r.done ? ' (done)' : ''}</div>
            <div class="small">Due: ${fmt(r.dueAt)}</div>
          </div>
          <div class="actions">
            <button class="btn" data-act="toggleDone" data-id="${r.id}">${r.done ? 'Undone' : 'Done'}</button>
            <button class="btn" data-act="edit" data-id="${r.id}">Edit</button>
            <button class="btn" data-act="del" data-id="${r.id}">Delete</button>
          </div>
        </div>
        <div class="editRow row" style="display:none">
          <input class="editTitle" value="${r.title.replace(/"/g,'&quot;')}" />
          <select class="editYear"></select>
          <select class="editMonth"></select>
          <select class="editDay"></select>
          <input class="editTime" type="time" step="60" />
          <button class="btn primary" data-act="saveEdit" data-id="${r.id}">Save</button>
        </div>
      `;
      const d = new Date(r.dueAt);
      buildRowDateControls(row, new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      row.querySelector('.editTime').value =
        String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      mount.appendChild(row);
    }
  }
}


document.addEventListener('click', async (e) => {
  const t = e.target.closest('#add, #clear, [data-act]');
  if(!t) return;

  if (t.id === 'add') {
   
    await winkButton(t, 'flash-ok', 180);
    return addReminder();
  }

  if (t.id === 'clear') return setDefaults();

  if (t.dataset.act) {
    const id = t.dataset.id;
    if (t.dataset.act === 'toggleDone') {
      await winkButton(t, 'flash-ok');   // green wink
      return toggleDone(id);
    }
    if (t.dataset.act === 'del') {
      await winkButton(t, 'flash-del');  // red wink
      return del(id);
    }
    if (t.dataset.act === 'edit')     return startEdit(id);
    if (t.dataset.act === 'saveEdit') return saveEdit(id);
  }
});


document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && e.target.id === 'title') addReminder();
});

/* ---------- Init ---------- */
(function init(){
  setupBounds();
  setDefaults();
  render();
})();
