/* ===========================================================
   core.js — ค่าคงที่ ตัวช่วย สถานะแอป GPS และตัวควบคุมหน้าจอ
   =========================================================== */
'use strict';

/* ======================= ค่าคงที่ ======================= */

const ST = {
  pending:  { label: 'รอจัดงาน',        cls: 'st-pending'  },
  assigned: { label: 'มอบหมายแล้ว',     cls: 'st-assigned' },
  enroute:  { label: 'กำลังเดินทาง',    cls: 'st-enroute'  },
  arrived:  { label: 'ถึงร้าน',          cls: 'st-arrived'  },
  done:     { label: 'ปิดงานสำเร็จ',     cls: 'st-done'     },
  failed:   { label: 'ปิดงานไม่สำเร็จ',  cls: 'st-failed'   }
};

const TY = {
  deliver: { label: 'ส่งสินค้า', short: 'ส่ง',  cls: 'ty-deliver', pin: 'pin-deliver', ico: '📦' },
  bill:    { label: 'วางบิล',    short: 'บิล',  cls: 'ty-bill',    pin: 'pin-bill',    ico: '📄' },
  cheque:  { label: 'รับเช็ค',   short: 'เช็ค', cls: 'ty-cheque',  pin: 'pin-cheque',  ico: '💰' }
};

const FAIL_REASONS = [
  'ร้านปิด',
  'ไม่มีคนรับของ',
  'ลูกค้าปฏิเสธรับ',
  'ของไม่ครบ / ชำรุด',
  'ยังไม่ถึงรอบวางบิล',
  'ไม่มีผู้มีอำนาจเซ็น',
  'เช็คไม่พร้อม',
  'ลูกค้าขอเลื่อน',
  'หาที่อยู่ไม่พบ',
  'รถเสีย / ส่งไม่ทันเวลา',
  'อื่น ๆ'
];

const PAY = {
  cheque:   { label: 'เช็ค'   },
  cash:     { label: 'เงินสด' },
  transfer: { label: 'โอน'    }
};

const UNITS = ['ชิ้น', 'ลัง', 'กล่อง', 'แพ็ค', 'ถุง', 'ขวด', 'กระสอบ', 'โหล', 'ชุด', 'กิโลกรัม'];

/* ชั้นแผนที่: ถนน กับ ภาพถ่ายดาวเทียม
   ดาวเทียมช่วยให้ปักหมุดตรงหน้าร้านได้แม่นกว่ามาก เพราะเห็นตัวอาคารจริง
   ส่วนแผนที่ถนนในไทยหลายพื้นที่ยังไม่มีรายละเอียดอาคาร */
const BASEMAPS = {
  road: {
    label: 'ถนน',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  },
  sat: {
    label: 'ดาวเทียม',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attr: 'ภาพถ่ายทางอากาศ &copy; Esri'
  }
};

function baseLayer(kind) {
  const b = BASEMAPS[kind] || BASEMAPS.road;
  return L.tileLayer(b.url, { maxZoom: b.maxZoom, attribution: b.attr });
}

function layerToggleHtml(cur, act) {
  return '<div class="maplayers">' +
    Object.keys(BASEMAPS).map((k) =>
      '<button type="button" class="' + (cur === k ? 'on' : '') + '" data-act="' + act + '" data-k="' + k + '">' +
      BASEMAPS[k].label + '</button>').join('') +
    '</div>';
}

const WDAY_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const WDAY_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const EOM = 32;   // รหัสแทน "สิ้นเดือน" ในรอบวางบิลรายเดือน

const CLOSED = { done: 1, failed: 1 };

/* ======================= ตัวช่วยทั่วไป ======================= */

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isoOf(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}
function todayISO() { return isoOf(new Date()); }
function parseISO(s) {
  if (!s) return null;
  const p = String(s).split('-').map(Number);
  if (p.length < 3) return null;
  return new Date(p[0], p[1] - 1, p[2]);
}
function addDays(iso, n) {
  const d = parseISO(iso) || new Date();
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

function thDate(iso, style) {
  const d = parseISO(iso);
  if (!d) return '-';
  const o = style === 'long'
    ? { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  try { return d.toLocaleDateString('th-TH', o); }
  catch (e) { return iso; }
}

function dateLabel(iso) {
  const t = todayISO();
  if (iso === t) return 'วันนี้ ' + thDate(iso);
  if (iso === addDays(t, -1)) return 'เมื่อวาน ' + thDate(iso);
  if (iso === addDays(t, 1)) return 'พรุ่งนี้ ' + thDate(iso);
  return thDate(iso, 'long');
}

function clockOf(isoDateTime) {
  if (!isoDateTime) return '';
  const d = new Date(isoDateTime);
  if (isNaN(d)) return '';
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function money(n, dec) {
  const v = Number(n);
  if (!isFinite(v)) return '0';
  return v.toLocaleString('th-TH', {
    minimumFractionDigits: dec === undefined ? (Number.isInteger(v) ? 0 : 2) : dec,
    maximumFractionDigits: dec === undefined ? 2 : dec
  });
}

function num(v) {
  const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

function distKm(a, b) {
  if (!a || !b) return null;
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function distLabel(km) {
  if (km === null || km === undefined) return '';
  if (km < 1) return Math.round(km * 1000) + ' ม.';
  return km.toFixed(km < 10 ? 1 : 0) + ' กม.';
}

/** ดึงพิกัดจากข้อความที่คัดลอกมาจาก Google Maps */
function parseLatLng(text) {
  if (!text) return null;
  const m = String(text).match(/(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: lat, lng: lng };
}

function navUrl(lat, lng) {
  if (lat === undefined || lat === null) return null;
  return 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng + '&travelmode=driving';
}

function telUrl(phone) {
  if (!phone) return null;
  return 'tel:' + String(phone).replace(/[^\d+]/g, '');
}

/** ตัวย่อชื่อสำหรับวงกลมรูปโปรไฟล์
 *  ภาษาไทยตัดตามอักษรไม่ได้ เพราะสระกับวรรณยุกต์เกาะอยู่กับพยัญชนะ
 *  จึงตัดเป็นกลุ่มอักขระ (grapheme) แทน */
function initials(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  try {
    const seg = new Intl.Segmenter('th', { granularity: 'grapheme' });
    const g = Array.from(seg.segment(s), (x) => x.segment);
    return g.slice(0, 2).join('');
  } catch (e) {
    return s.slice(0, 2);
  }
}

/** เวลารับของ: รองรับทั้งแบบใหม่ (เลือกเวลา) และแบบเก่าที่เคยพิมพ์ไว้ */
function hoursLabel(s) {
  if (!s) return '';
  if (s.openFrom && s.openTo) return s.openFrom + ' - ' + s.openTo + ' น.';
  if (s.openFrom) return 'ตั้งแต่ ' + s.openFrom + ' น.';
  if (s.openTo) return 'ถึง ' + s.openTo + ' น.';
  return s.openHours || '';
}

/** รอบวางบิล: แปลงที่เลือกไว้เป็นข้อความอ่านง่าย */
function billingLabel(s) {
  if (!s) return '';
  const b = s.billing;
  if (!b || !b.mode || b.mode === 'none') return s.billingCycle || '';
  const days = (b.days || []).slice().sort((x, y) => x - y);
  if (!days.length) return s.billingCycle || '';
  if (b.mode === 'month') {
    return 'ทุกวันที่ ' + days.map((d) => (d === EOM ? 'สิ้นเดือน' : d)).join(', ');
  }
  if (b.mode === 'week') {
    return 'ทุกวัน' + days.map((d) => WDAY_FULL[d] || '').filter(Boolean).join(', ');
  }
  return '';
}

function billingNoteOf(s) {
  return (s && s.billing && s.billing.note) || '';
}

function byteLabel(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

/* ======================= สถานะแอป ======================= */

const S = {
  mode: 'driver',
  screen: 'jobs',
  date: todayISO(),
  myDriverId: null,
  officeDriverId: null,   // null = ทั้งหมด
  pos: null,
  gps: 'off',             // off | getting | on | denied | error
  basemap: 'road',        // แผนที่หลัก: road | sat
  basemapPick: 'sat',     // หน้าปักหมุด: เริ่มที่ดาวเทียม
  keepAwake: false,
  stores: [],
  jobs: [],
  drivers: [],
  search: '',
  ready: false,
  transfers: [],          // คำขอย้ายงานที่ยังค้าง
  cloud: false,           // ต่อเซิร์ฟเวอร์กลางอยู่หรือไม่
  me: null,               // โปรไฟล์ของคนที่ล็อกอิน
  role: 'admin',          // driver | office | admin
  positions: []           // ตำแหน่งล่าสุดของคนขับคนอื่น (โหมดคลาวด์)
};

function activeDriverId() {
  return S.mode === 'driver' ? S.myDriverId : S.officeDriverId;
}

function driverById(id) {
  return S.drivers.find((d) => d.id === id) || null;
}
function storeById(id) {
  return S.stores.find((s) => s.id === id) || null;
}
function jobById(id) {
  return S.jobs.find((j) => j.id === id) || null;
}

/** งานของวันที่เลือก (กรองตามคนขับถ้ามี) เรียงตาม seq */
function jobsOfDay(date, driverId) {
  let list = S.jobs.filter((j) => j.date === date);
  if (driverId) list = list.filter((j) => j.driverId === driverId);
  return list.sort((a, b) => (a.seq || 0) - (b.seq || 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

function progressOf(list) {
  const p = { total: list.length, done: 0, failed: 0, open: 0, active: 0 };
  list.forEach((j) => {
    if (j.status === 'done') p.done++;
    else if (j.status === 'failed') p.failed++;
    else {
      p.open++;
      if (j.status === 'enroute' || j.status === 'arrived') p.active++;
    }
  });
  return p;
}

/* ======================= โหลดข้อมูล ======================= */

async function reload() {
  const [stores, jobs, drivers] = await Promise.all([
    DB.stores.all(), DB.jobs.all(), DB.drivers.all()
  ]);
  S.stores = stores.filter((s) => !s.deleted).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'th'));
  S.jobs = jobs;
  S.drivers = drivers.filter((d) => !d.deleted && d.active !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // ตำแหน่งคนขับคนอื่น ดึงเฉพาะตอนออฟฟิศดูแผนที่
  if (S.cloud && Cloud.isOffice()) {
    try { S.positions = await Cloud.allPositions(); } catch (e) { S.positions = []; }
  }
  if (S.cloud) await reloadTransfers();
}

/** คำขอย้ายงานที่ยังค้าง กฎสิทธิ์กรองมาให้เฉพาะที่เกี่ยวกับเราแล้ว */
async function reloadTransfers() {
  if (!S.cloud || typeof Cloud === 'undefined') { S.transfers = []; return; }
  try { S.transfers = await Cloud.transfers.pending(); }
  catch (e) { S.transfers = []; }
}

/** คำขอที่รอ "เรา" ตัดสินใจ ใช้ขึ้นป้ายแจ้งเตือน */
function transfersForMe() {
  return (S.transfers || []).filter((t) =>
    t.toDriver === S.myDriverId || (canSeeOffice() && t.fromDriver !== S.myDriverId));
}

/* ======================= GPS ======================= */

let _watchId = null;
let _wakeLock = null;

function setGps(state) {
  S.gps = state;
  const el = document.getElementById('btnGps');
  if (!el) return;
  el.classList.toggle('on', state === 'on');
  el.classList.toggle('stale', state === 'getting');
}

function gpsStart() {
  if (!('geolocation' in navigator)) { setGps('error'); return; }
  if (_watchId !== null) return;
  setGps('getting');
  _watchId = navigator.geolocation.watchPosition(
    (p) => {
      S.pos = {
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        acc: p.coords.accuracy,
        at: new Date().toISOString()
      };
      setGps('on');
      if (typeof MapView !== 'undefined' && MapView.onPos) MapView.onPos(S.pos);
      // ส่งตำแหน่งขึ้นเซิร์ฟเวอร์ให้ออฟฟิศเห็น (ตัวเชื่อมจำกัดไว้นาทีละครั้ง)
      if (S.cloud && typeof Cloud !== 'undefined') Cloud.pushPosition(S.pos);
    },
    (e) => {
      setGps(e.code === 1 ? 'denied' : 'error');
      if (e.code === 1) {
        toast('ยังไม่ได้อนุญาตให้ใช้ตำแหน่ง กดไอคอนวงกลมมุมขวาบนเพื่อดูวิธีเปิด', 'bad', 5000);
      }
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 25000 }
  );
}

function gpsStop() {
  if (_watchId !== null) { navigator.geolocation.clearWatch(_watchId); _watchId = null; }
  setGps('off');
}

/** อ่านตำแหน่งครั้งเดียวแบบเร็ว (ยอมรับค่าที่เพิ่งอ่านมา) */
function gpsOnce() {
  return new Promise((res) => {
    if (!('geolocation' in navigator)) return res(null);
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: new Date().toISOString() }),
      () => res(S.pos || null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
  });
}

/** อ่านตำแหน่งให้แม่นที่สุด: เฝ้าดูหลายวินาทีแล้วเก็บค่าที่คลาดเคลื่อนน้อยที่สุด
 *
 *  จำเป็นเพราะเครื่องมักคืนค่าแรกจากเสาสัญญาณหรือ Wi-Fi ซึ่งคลาดเคลื่อนเป็นร้อยเมตร
 *  แล้วค่อยแม่นขึ้นเมื่อจับดาวเทียมได้ ถ้าเอาค่าแรกมาใช้เลยหมุดจะเพี้ยน
 *  maximumAge:0 บังคับให้อ่านใหม่ ไม่เอาค่าเก่าที่เครื่องจำไว้
 *
 *  onProgress จะถูกเรียกทุกครั้งที่ได้ค่าใหม่ เพื่อให้หน้าจอบอกความคืบหน้าได้
 */
function gpsBest(ms, onProgress) {
  ms = ms || 8000;
  return new Promise((res) => {
    if (!('geolocation' in navigator)) return res(null);
    let best = null, id = null, done = false, timer = null;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (id !== null) { try { navigator.geolocation.clearWatch(id); } catch (e) {} }
      res(best);
    };

    id = navigator.geolocation.watchPosition(
      (p) => {
        const c = {
          lat: p.coords.latitude, lng: p.coords.longitude,
          acc: p.coords.accuracy, at: new Date().toISOString()
        };
        if (!best || c.acc < best.acc) {
          best = c;
          S.pos = c;
          setGps('on');
          if (onProgress) onProgress(c);
        }
        if (c.acc <= 12) finish();   // แม่นพอแล้ว ไม่ต้องรอต่อ
      },
      () => { if (!best) finish(); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: ms }
    );

    timer = setTimeout(finish, ms);
  });
}

/** คำอธิบายความแม่นยำแบบอ่านง่าย */
function accLabel(acc) {
  if (acc === undefined || acc === null) return '';
  const m = Math.round(acc);
  if (m <= 15) return '± ' + m + ' ม. (แม่นดี)';
  if (m <= 50) return '± ' + m + ' ม. (พอใช้)';
  return '± ' + m + ' ม. (ไม่แม่น)';
}
function accIsPoor(acc) { return !acc || acc > 50; }

async function toggleKeepAwake(on) {
  S.keepAwake = on;
  if (on) {
    if (!('wakeLock' in navigator)) { toast('เครื่องนี้ไม่รองรับการกันจอดับ', 'bad'); S.keepAwake = false; return false; }
    try {
      _wakeLock = await navigator.wakeLock.request('screen');
      _wakeLock.addEventListener('release', () => { _wakeLock = null; S.keepAwake = false; });
      return true;
    } catch (e) { toast('เปิดโหมดกันจอดับไม่ได้', 'bad'); S.keepAwake = false; return false; }
  }
  if (_wakeLock) { try { await _wakeLock.release(); } catch (e) {} _wakeLock = null; }
  return false;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (S.keepAwake && !_wakeLock) toggleKeepAwake(true);
    if (_watchId === null) gpsStart();
  }
});

/* ======================= Toast ======================= */

let _toastT = null;
function toast(msg, kind, ms) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = kind || '';
  clearTimeout(_toastT);
  _toastT = setTimeout(() => { el.className = 'hidden'; }, ms || 2600);
}

/* ======================= Sheet ======================= */

const _sheetStack = [];

function openSheet(html, onMount) {
  const wrap = document.getElementById('sheetWrap');
  const body = document.getElementById('sheetBody');
  _sheetStack.push({ html: html, onMount: onMount });
  body.innerHTML = html;
  body.scrollTop = 0;
  wrap.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (onMount) onMount(body);
}

function replaceSheet(html, onMount) {
  if (_sheetStack.length) _sheetStack.pop();
  openSheet(html, onMount);
}

function closeSheet(all) {
  const wrap = document.getElementById('sheetWrap');
  const body = document.getElementById('sheetBody');
  _sheetStack.pop();
  if (all) _sheetStack.length = 0;
  if (!_sheetStack.length) {
    wrap.classList.add('hidden');
    body.innerHTML = '';
    document.body.style.overflow = '';
    return;
  }
  const top = _sheetStack[_sheetStack.length - 1];
  body.innerHTML = top.html;
  if (top.onMount) top.onMount(body);
}

function sheetOpen() { return _sheetStack.length > 0; }

function sheetHead(title, sub, backable) {
  return '<div class="sh-h">' +
    '<div class="sh-t"><h2>' + esc(title) + '</h2>' +
    (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
    '<button class="sh-close" type="button" data-act="' + (backable ? 'sheet-back' : 'sheet-close') + '" aria-label="ปิด">' +
    (backable
      ? '<svg viewBox="0 0 20 20" width="18" height="18"><path d="M12 4l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 20 20" width="18" height="18"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>') +
    '</button></div>';
}

/* ======================= ไอคอน ======================= */

const ICO = {
  list:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  map:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3L3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3z"/><path d="M9 3v15M15 6v15"/></svg>',
  shop:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L4.5 4h15L21 9.5M3 9.5h18M3 9.5V20h18V9.5M9 20v-6h6v6"/></svg>',
  chart:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  grid:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  plus:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  chev:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  up:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/></svg>',
  down:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10l6 6 6-6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>',
  phone:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h3.5l2 5-2.5 1.5a12 12 0 006.5 6.5L16 13.5l5 2V19a2 2 0 01-2.2 2A16 16 0 013 5.2A2 2 0 015 3z"/></svg>',
  nav:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>',
  cam:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2 2 0 015 6.5h1.8l1.2-2h8l1.2 2H19a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2V8.5z"/><circle cx="12" cy="13" r="3.4"/></svg>',
  pin:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  locate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></svg>',
  fit:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5.5A1.5 1.5 0 015.5 4H9M15 4h3.5A1.5 1.5 0 0120 5.5V9M20 15v3.5a1.5 1.5 0 01-1.5 1.5H15M9 20H5.5A1.5 1.5 0 014 18.5V15"/></svg>',
  check:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  x:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  truck:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7.5h11v9H2zM13 11h4.5l3 3v2.5H13z"/><circle cx="6" cy="18.5" r="1.8"/><circle cx="17" cy="18.5" r="1.8"/></svg>',
  cog:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v2M12 19.5v2M4.2 7l1.7 1M18.1 16l1.7 1M4.2 17l1.7-1M18.1 8l1.7-1"/></svg>',
  dl:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 10.5L12 15l4.5-4.5M4 20h16"/></svg>',
  clock:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.5 2"/></svg>'
};

/* ======================= Nav ======================= */

const NAV = {
  driver: [
    { k: 'jobs',    t: 'งานวันนี้', i: 'list'  },
    { k: 'map',     t: 'แผนที่',    i: 'map'   },
    { k: 'stores',  t: 'ร้านค้า',   i: 'shop'  },
    { k: 'summary', t: 'สรุป',      i: 'chart' }
  ],
  office: [
    { k: 'assign',  t: 'จัดงาน',    i: 'grid'  },
    { k: 'map',     t: 'แผนที่',    i: 'map'   },
    { k: 'stores',  t: 'ร้านค้า',   i: 'shop'  },
    { k: 'reports', t: 'รายงาน',    i: 'chart' }
  ]
};

function renderNav() {
  const nav = document.getElementById('nav');
  const items = NAV[S.mode];
  if (!items.some((i) => i.k === S.screen)) S.screen = items[0].k;

  const openCount = jobsOfDay(S.date, S.mode === 'driver' ? S.myDriverId : null)
    .filter((j) => !CLOSED[j.status]).length;

  nav.innerHTML = items.map((it) => {
    const badge = (it.k === 'jobs' || it.k === 'assign') && openCount
      ? '<span class="nbadge">' + openCount + '</span>' : '';
    return '<button class="navbtn' + (S.screen === it.k ? ' active' : '') + '" type="button" ' +
      'role="tab" data-act="nav" data-k="' + it.k + '">' +
      ICO[it.i] + badge + '<span>' + it.t + '</span></button>';
  }).join('');
}

function renderTopbar() {
  const btnMode = document.getElementById('btnMode');

  // ไอคอนบัญชีมุมขวาบน กดแล้วเจอปุ่มออกจากระบบ
  const btnUser = document.getElementById('btnUser');
  if (btnUser) {
    if (S.cloud && S.me) {
      btnUser.classList.remove('hidden');
      document.getElementById('userInitials').textContent = initials(S.me.name);
      btnUser.title = S.me.name + ' · แตะเพื่อออกจากระบบ';
    } else {
      btnUser.classList.add('hidden');
    }
  }
  document.getElementById('modeLabel').textContent = S.mode === 'driver' ? 'คนขับ' : 'ออฟฟิศ';
  document.getElementById('dateLabel').textContent = dateLabel(S.date);

  // คนขับสลับไปมุมมองออฟฟิศไม่ได้ ปุ่มกลายเป็นชื่อตัวเองที่กดดูบัญชีได้
  if (!canSeeOffice()) {
    btnMode.dataset.act = 'account-menu';
    document.getElementById('modeLabel').textContent = S.me ? S.me.name : 'คนขับ';
  } else {
    btnMode.dataset.act = 'mode';
  }

  const strip = document.getElementById('driverStrip');
  let html = '';

  const nTr = S.cloud ? transfersForMe().length : 0;
  const trChip = nTr
    ? '<button class="dchip tr" type="button" data-act="transfers-open">' +
      '<span>คำขอย้ายงาน</span><span class="dcount">' + nTr + '</span></button>'
    : '';

  if (S.cloud && S.mode === 'driver') {
    /* คนขับเห็นแค่ของตัวเอง ไม่มีให้สลับคน */
    const list = jobsOfDay(S.date, S.myDriverId);
    const p = progressOf(list);
    html += '<span class="dchip active"><span>' + esc(S.me ? S.me.name : 'ฉัน') + '</span>' +
      '<span class="dcount">' + p.done + '/' + p.total + '</span></span>';
    html += trChip;
    if (S.me && S.me.vehicle) html += '<span class="dchip">' + esc(S.me.vehicle) + '</span>';
    if (canSeeOffice()) html += '<button class="dchip add" type="button" data-act="mode">ไปมุมมองออฟฟิศ</button>';
    strip.innerHTML = html;
    return;
  }

  html += trChip;

  if (S.mode === 'office') {
    const all = jobsOfDay(S.date, null);
    html += '<button class="dchip' + (!S.officeDriverId ? ' active' : '') + '" type="button" ' +
      'data-act="pick-driver" data-id=""><span>ทั้งหมด</span>' +
      '<span class="dcount">' + all.length + '</span></button>';
  }

  S.drivers.forEach((d) => {
    const list = jobsOfDay(S.date, d.id);
    const p = progressOf(list);
    const active = S.mode === 'driver' ? S.myDriverId === d.id : S.officeDriverId === d.id;
    html += '<button class="dchip' + (active ? ' active' : '') + '" type="button" ' +
      'data-act="pick-driver" data-id="' + esc(d.id) + '">' +
      '<span>' + esc(d.name) + '</span>' +
      '<span class="dcount">' + p.done + '/' + p.total + '</span></button>';
  });

  html += S.cloud
    ? (canManageUsers()
        ? '<button class="dchip add" type="button" data-act="user-new">+ เพิ่มบัญชี</button>'
        : '<button class="dchip add" type="button" data-act="users-open">บัญชีผู้ใช้</button>')
    : '<button class="dchip add" type="button" data-act="driver-new">+ เพิ่มคนขับ</button>';
  strip.innerHTML = html;
}

/* ======================= Router ======================= */

let _rendering = false;

async function render() {
  if (_rendering) return;
  _rendering = true;
  try {
    renderTopbar();
    renderNav();
    const el = document.getElementById('screen');
    el.classList.toggle('nopad', S.screen === 'map');

    if (S.screen !== 'map' && typeof MapView !== 'undefined') MapView.teardown();

    switch (S.screen) {
      case 'jobs':    el.innerHTML = Views.jobs();    break;
      case 'assign':  el.innerHTML = Views.assign();  break;
      case 'stores':  el.innerHTML = Views.stores();  break;
      case 'summary': el.innerHTML = Views.summary(); break;
      case 'reports': el.innerHTML = Views.reports(); break;
      case 'map':     el.innerHTML = MapView.shell(); MapView.mount(); break;
      default:        el.innerHTML = '';
    }
  } finally {
    _rendering = false;
  }
}

function go(screen) {
  S.screen = screen;
  render();
}

/* ======================= Event delegation ======================= */

const ACT = {};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-chg]');
  if (!el) return;
  const fn = ACT[el.dataset.chg];
  if (fn) fn(el, e);
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-inp]');
  if (!el) return;
  const fn = ACT[el.dataset.inp];
  if (fn) fn(el, e);
});

/* ปิด sheet ด้วยปุ่มย้อนกลับของเครื่อง */
window.addEventListener('popstate', () => {
  if (sheetOpen()) { closeSheet(); history.pushState(null, '', location.href); }
});

/* ======================= actions: nav / topbar ======================= */

ACT['nav'] = (el) => go(el.dataset.k);
ACT['sheet-close'] = () => closeSheet(true);
ACT['sheet-back'] = () => closeSheet();

ACT['mode'] = async () => {
  if (!canSeeOffice()) {
    toast('บัญชีของคุณเป็นคนขับ จึงเห็นได้เฉพาะงานของตัวเอง', 'bad', 3500);
    return;
  }
  S.mode = S.mode === 'driver' ? 'office' : 'driver';
  await DB.meta.set('mode', S.mode);
  const items = NAV[S.mode];
  if (!items.some((i) => i.k === S.screen)) S.screen = items[0].k;
  render();
};

ACT['date-prev'] = () => { S.date = addDays(S.date, -1); render(); };
ACT['date-next'] = () => { S.date = addDays(S.date, 1); render(); };

ACT['date-pick'] = () => {
  openSheet(
    sheetHead('เลือกวันที่') +
    '<div class="f"><label for="dp">วันที่</label>' +
    '<input type="date" id="dp" value="' + S.date + '"></div>' +
    '<div class="btn-row" style="margin-bottom:10px">' +
    '<button class="btn btn-sm" type="button" data-act="date-set" data-d="' + addDays(todayISO(), -1) + '">เมื่อวาน</button>' +
    '<button class="btn btn-sm" type="button" data-act="date-set" data-d="' + todayISO() + '">วันนี้</button>' +
    '<button class="btn btn-sm" type="button" data-act="date-set" data-d="' + addDays(todayISO(), 1) + '">พรุ่งนี้</button>' +
    '</div>' +
    '<button class="btn btn-pri btn-block" type="button" data-act="date-apply">ตกลง</button>'
  );
};
ACT['date-set'] = (el) => { S.date = el.dataset.d; closeSheet(true); render(); };
ACT['date-apply'] = () => {
  const v = document.getElementById('dp').value;
  if (v) S.date = v;
  closeSheet(true); render();
};

ACT['pick-driver'] = async (el) => {
  const id = el.dataset.id || null;
  if (S.mode === 'driver') {
    if (S.cloud) return;                 // คลาวด์: เป็นตัวเองเสมอ สลับเป็นคนอื่นไม่ได้
    S.myDriverId = id;
    await DB.meta.set('myDriverId', id);
  } else {
    S.officeDriverId = id;
  }
  render();
};

ACT['gps-info'] = () => {
  const map = {
    off:     ['ยังไม่เปิดตำแหน่ง', 'กดปุ่มด้านล่างเพื่อขออนุญาตใช้ตำแหน่ง'],
    getting: ['กำลังหาตำแหน่ง', 'รอสักครู่ ถ้าอยู่ในอาคารอาจใช้เวลาหรือคลาดเคลื่อน'],
    on:      [S.pos && accIsPoor(S.pos.acc) ? 'ตำแหน่งทำงานแต่ไม่แม่น' : 'ตำแหน่งทำงานปกติ',
              S.pos ? accLabel(S.pos.acc) + ' อัปเดตล่าสุด ' + clockOf(S.pos.at) : ''],
    denied:  ['ถูกปฏิเสธสิทธิ์ตำแหน่ง', 'เปิดใหม่ได้ที่ไอคอนรูปกุญแจหรือ (i) ข้างแถบที่อยู่เว็บ แล้วเลือกอนุญาตตำแหน่ง จากนั้นรีโหลดหน้า'],
    error:   ['หาตำแหน่งไม่ได้', 'ตรวจว่าเปิด GPS ของเครื่องไว้แล้ว และเปิดเว็บนี้ผ่าน https']
  };
  const [t, s] = map[S.gps] || map.off;
  openSheet(
    sheetHead(t, s) +
    (S.pos
      ? '<div class="dl">' +
        '<div class="dl-r"><div class="dl-k">พิกัด</div><div class="dl-v mono">' + S.pos.lat.toFixed(6) + ', ' + S.pos.lng.toFixed(6) + '</div></div>' +
        '<div class="dl-r"><div class="dl-k">คลาดเคลื่อน</div><div class="dl-v">' + accLabel(S.pos.acc) + '</div></div>' +
        '<div class="dl-r"><div class="dl-k">อัปเดต</div><div class="dl-v">' + clockOf(S.pos.at) + '</div></div>' +
        '</div>'
      : '') +
    (S.pos && accIsPoor(S.pos.acc)
      ? '<div class="note" style="margin-bottom:11px"><span class="ni">⚠️</span><div>' +
        'ตำแหน่งคลาดเคลื่อนมาก มักเกิดจาก 3 สาเหตุ<br>' +
        '1. เปิดบนคอมพิวเตอร์ ซึ่งไม่มี GPS จริง เดาจากเน็ตที่ใช้ อาจเพี้ยนเป็นกิโลเมตร<br>' +
        '2. อยู่ในอาคารหรือใต้หลังคา สัญญาณดาวเทียมเข้าไม่ถึง<br>' +
        '3. ปิดโหมดความแม่นยำสูงในตั้งค่าตำแหน่งของเครื่อง<br><br>' +
        'ถ้าปักหมุดร้าน ให้ใช้วิธีเลือกจุดบนแผนที่แบบดาวเทียมแทน จะตรงกว่ามาก</div></div>'
      : '') +
    '<label class="check" style="margin-bottom:10px">' +
    '<input type="checkbox" ' + (S.keepAwake ? 'checked' : '') + ' data-chg="keepawake">' +
    '<span>กันจอดับระหว่างวิ่งงาน<br><span class="muted" style="font-size:12px">เปิดไว้เมื่อตั้งมือถือที่แท่นหน้ารถ ตำแหน่งจะส่งต่อเนื่อง</span></span>' +
    '</label>' +
    '<button class="btn btn-pri btn-block" type="button" data-act="gps-retry">ขอตำแหน่งอีกครั้ง</button>'
  );
};
ACT['gps-retry'] = async (el) => {
  el.disabled = true;
  el.innerHTML = '<span class="spin"></span> กำลังรอสัญญาณให้แม่นที่สุด...';
  gpsStop();
  const p = await gpsBest(10000);
  gpsStart();
  el.disabled = false;
  el.innerHTML = 'ขอตำแหน่งอีกครั้ง';
  if (!p) { toast('ยังหาตำแหน่งไม่ได้', 'bad'); return; }
  toast('ได้ตำแหน่งแล้ว ' + accLabel(p.acc), accIsPoor(p.acc) ? 'bad' : 'ok', 3800);
  closeSheet(true);
  ACT['gps-info'](el);
};
ACT['keepawake'] = (el) => { toggleKeepAwake(el.checked); };

/* ======================= Boot ======================= */

async function boot() {
  const screen = document.getElementById('screen');
  screen.innerHTML = '<div class="loadwrap"><div class="spin"></div></div>';

  document.getElementById('btnMode').dataset.act = 'mode';
  document.getElementById('btnDatePrev').dataset.act = 'date-prev';
  document.getElementById('btnDateNext').dataset.act = 'date-next';
  document.getElementById('btnDate').dataset.act = 'date-pick';
  document.getElementById('btnGps').dataset.act = 'gps-info';
  document.getElementById('btnUser').dataset.act = 'account-menu';
  document.getElementById('sheetBackdrop').dataset.act = 'sheet-close';

  history.pushState(null, '', location.href);
  registerSW();

  const cfg = window.APP_CONFIG || {};
  S.cloud = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  if (!S.cloud) {
    /* ---- โหมดเก็บข้อมูลในเครื่อง ไม่มีล็อกอิน ---- */
    window.DB = LocalDB;
    try {
      await DB.open();
    } catch (e) {
      screen.innerHTML = '<div class="empty"><div class="eico">⚠️</div>' +
        '<h3>เปิดฐานข้อมูลไม่ได้</h3><p>ถ้าเปิดในโหมดไม่ระบุตัวตน (Incognito) ให้เปิดในหน้าต่างปกติแทน</p></div>';
      return;
    }
    await startApp();
    return;
  }

  /* ---- โหมดเชื่อมเซิร์ฟเวอร์กลาง ต้องล็อกอิน ---- */
  const ok = await Cloud.init(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  if (!ok) {
    renderAuthError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้',
      'โหลดไลบรารีเชื่อมต่อไม่สำเร็จ ตรวจสัญญาณอินเทอร์เน็ตแล้วลองใหม่');
    return;
  }
  window.DB = Cloud;

  let p = null;
  try { p = await Cloud.loadMe(); } catch (e) { p = null; }

  if (p) {
    if (p.active === false) {
      await Cloud.signOut();
      renderLogin('บัญชีนี้ถูกปิดการใช้งาน ติดต่อผู้ดูแล');
      return;
    }
    await startApp();
    return;
  }

  // ตารางพร้อมหรือยัง ถามจากตาราง profiles โดยตรง เชื่อถือได้กว่าถามฟังก์ชัน
  const tablesOk = await Cloud.tablesReady();
  if (!tablesOk) {
    renderAuthError('ยังตั้งค่าฐานข้อมูลไม่เสร็จ',
      'ยังไม่ได้รันสคริปต์สร้างตารางใน Supabase หรือค่าที่ตั้งไว้ไม่ถูกต้อง<br>' +
      'ให้ผู้ดูแลเปิด Supabase → SQL Editor แล้วรันไฟล์ <b>supabase-setup.sql</b>');
    return;
  }

  // มีผู้ดูแลแล้วหรือยัง ถ้าถามไม่ได้ก็ไม่เป็นไร ขึ้นหน้าล็อกอินพร้อมทางเลือกให้
  const has = await Cloud.hasAnyAdmin();
  if (has === false) renderFirstRun();
  else renderLogin(null, has === null);
}

/** เริ่มแอปหลังผ่านการยืนยันตัวตนแล้ว (หรือในโหมดเก็บข้อมูลในเครื่อง) */
async function startApp() {
  document.body.classList.remove('auth-mode');

  S.mode = await DB.meta.get('mode', 'driver');
  S.basemap = await DB.meta.get('basemap', 'road');
  S.basemapPick = await DB.meta.get('basemapPick', 'sat');

  if (S.cloud) {
    const p = Cloud.current();
    S.me = p;
    S.role = p.role;
    S.myDriverId = p.id;
    if (!Cloud.isOffice()) S.mode = 'driver';     // คนขับเปิดมุมมองออฟฟิศไม่ได้
    Cloud.subscribe();
  } else {
    S.me = null;
    S.role = 'admin';                              // โหมดในเครื่อง เปิดได้ทุกอย่าง
    S.myDriverId = await DB.meta.get('myDriverId', null);
  }

  try {
    await reload();
  } catch (e) {
    renderAuthError('โหลดข้อมูลไม่ได้', esc(e.message || 'ไม่ทราบสาเหตุ'));
    return;
  }

  if (!S.cloud) {
    if (!S.drivers.length) {
      await DB.drivers.put({ name: 'ฉัน', vehicle: '', phone: '', order: 1 });
      await reload();
    }
    if (!S.myDriverId || !driverById(S.myDriverId)) {
      S.myDriverId = S.drivers[0].id;
      await DB.meta.set('myDriverId', S.myDriverId);
    }
  }

  S.ready = true;
  gpsStart();
  await render();

  // รวบการเปลี่ยนแปลงหลายครั้งติด ๆ กันให้วาดใหม่รอบเดียว
  let chgT = null;
  DB.onChange(() => {
    clearTimeout(chgT);
    chgT = setTimeout(async () => {
      try { await reload(); } catch (e) { return; }
      if (!sheetOpen()) render();
      else if (S.screen === 'map' && typeof MapView !== 'undefined') MapView.refresh();
    }, 250);
  });
}

function canSeeOffice() {
  return !S.cloud || (typeof Cloud !== 'undefined' && Cloud.isOffice());
}
function canManageUsers() {
  return S.cloud && typeof Cloud !== 'undefined' && Cloud.isAdmin();
}

/* เมื่อมีเวอร์ชันใหม่ ให้โหลดหน้าใหม่รอบเดียวโดยอัตโนมัติ
   ไม่งั้นผู้ใช้จะติดอยู่กับโค้ดเก่าที่ service worker เก็บไว้ */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('มีเวอร์ชันใหม่ กำลังอัปเดต...', 'ok', 2000);
        }
      });
    });
    // ตรวจหาเวอร์ชันใหม่ทุกครั้งที่กลับมาเปิดแอป
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
}

document.addEventListener('DOMContentLoaded', boot);
