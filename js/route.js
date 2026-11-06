/* ===========================================================
   route.js — คำนวณเส้นทางจริงบนถนน ระยะทาง และเวลาเดินทาง
   ใช้ OSRM ซึ่งเป็นบริการเปิดฟรี ไม่ต้องใช้คีย์
   ถ้าเรียกไม่ได้ จะถอยไปใช้ระยะเส้นตรงแทนเพื่อให้แอปยังทำงานต่อได้
   =========================================================== */
(function (global) {
  'use strict';

  const BASE = 'https://router.project-osrm.org';
  const TTL = 1000 * 60 * 60 * 24 * 14;   // เก็บผลไว้ 14 วัน เส้นทางไม่ได้เปลี่ยนบ่อย
  const CACHE_KEY = 'delivery:routecache';

  let mem = null;
  let lastCall = 0;

  /* ---------- แคช ---------- */

  function loadCache() {
    if (mem) return mem;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      mem = raw ? JSON.parse(raw) : {};
    } catch (e) { mem = {}; }
    const now = Date.now();
    Object.keys(mem).forEach((k) => { if (!mem[k].t || now - mem[k].t > TTL) delete mem[k]; });
    return mem;
  }

  function saveCache() {
    try {
      const keys = Object.keys(mem);
      // กันไม่ให้แคชบวมจนเต็มพื้นที่
      if (keys.length > 300) {
        keys.sort((a, b) => (mem[a].t || 0) - (mem[b].t || 0));
        keys.slice(0, keys.length - 300).forEach((k) => delete mem[k]);
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(mem));
    } catch (e) { /* เต็มก็ช่างมัน ไม่ใช่เรื่องคอขาดบาดตาย */ }
  }

  function keyOf(pts, kind) {
    return kind + ':' + pts.map((p) => p.lat.toFixed(4) + ',' + p.lng.toFixed(4)).join('|');
  }

  /* ---------- ตัวช่วย ---------- */

  function coordStr(pts) {
    return pts.map((p) => p.lng.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
  }

  /** หน่วงไม่ให้ยิงถี่เกินไป เป็นมารยาทต่อบริการฟรี */
  async function throttle() {
    const gap = Date.now() - lastCall;
    if (gap < 400) await new Promise((r) => setTimeout(r, 400 - gap));
    lastCall = Date.now();
  }

  async function call(url, ms) {
    await throttle();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms || 9000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (j.code !== 'Ok') throw new Error(j.code || 'ไม่สำเร็จ');
      return j;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  /** ประมาณการสำรองเมื่อเรียกเซิร์ฟเวอร์ไม่ได้
   *  คูณ 1.35 เพราะถนนจริงอ้อมกว่าเส้นตรงเสมอ ความเร็วเฉลี่ย 28 กม./ชม. แบบในเมือง */
  function estimate(a, b) {
    const km = distKm(a, b) || 0;
    const road = km * 1.35;
    return { distance: road * 1000, duration: (road / 28) * 3600, estimated: true };
  }

  /* ---------- เส้นทางผ่านหลายจุด ---------- */

  /**
   * วางแผนเส้นทางตามลำดับจุดที่ให้มา
   * คืน { legs:[{distance,duration}], geometry:[[lat,lng]..], total:{distance,duration}, estimated }
   * ยิงครั้งเดียวได้ข้อมูลทุกช่วงพร้อมเส้นสำหรับวาดบนแผนที่
   */
  async function plan(pts) {
    if (!pts || pts.length < 2) return null;
    const cache = loadCache();
    const k = keyOf(pts, 'plan');
    if (cache[k]) return cache[k].v;

    try {
      const j = await call(BASE + '/route/v1/driving/' + coordStr(pts) +
        '?overview=full&geometries=geojson&steps=false');
      const r = j.routes[0];
      const out = {
        legs: (r.legs || []).map((l) => ({ distance: l.distance, duration: l.duration })),
        geometry: ((r.geometry && r.geometry.coordinates) || []).map((c) => [c[1], c[0]]),
        total: { distance: r.distance, duration: r.duration },
        estimated: false
      };
      cache[k] = { t: Date.now(), v: out };
      saveCache();
      return out;
    } catch (e) {
      // ถอยไปใช้ค่าประมาณ ยังได้ตัวเลขคร่าว ๆ ให้คนขับวางแผน
      const legs = [];
      let d = 0, s = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const est = estimate(pts[i], pts[i + 1]);
        legs.push(est);
        d += est.distance; s += est.duration;
      }
      return {
        legs: legs,
        geometry: pts.map((p) => [p.lat, p.lng]),
        total: { distance: d, duration: s },
        estimated: true
      };
    }
  }

  /** ช่วงเดียว จากจุดหนึ่งไปอีกจุด */
  async function leg(from, to) {
    if (!from || !to) return null;
    const p = await plan([from, to]);
    if (!p) return null;
    return {
      distance: p.total.distance,
      duration: p.total.duration,
      geometry: p.geometry,
      estimated: p.estimated
    };
  }

  /**
   * จัดลำดับจุดแวะให้สั้นที่สุดโดยคิดจากระยะทางถนนจริง
   * เริ่มจากจุดแรกเสมอ (ตำแหน่งปัจจุบัน) และไม่ต้องวนกลับ
   * คืนลำดับดัชนีของจุดที่ 2 เป็นต้นไป
   */
  async function optimize(pts) {
    if (!pts || pts.length < 3) return null;
    if (pts.length > 12) return null;        // เกินนี้บริการฟรีจะช้ามาก
    try {
      const j = await call(BASE + '/trip/v1/driving/' + coordStr(pts) +
        '?source=first&roundtrip=false&overview=false', 14000);
      const order = j.waypoints
        .map((w, i) => ({ i: i, pos: w.waypoint_index }))
        .sort((a, b) => a.pos - b.pos)
        .map((x) => x.i);
      return {
        order: order,
        total: { distance: j.trips[0].distance, duration: j.trips[0].duration },
        estimated: false
      };
    } catch (e) {
      return null;
    }
  }

  /* ---------- แสดงผล ---------- */

  function km(m) {
    if (m === null || m === undefined) return '';
    if (m < 1000) return Math.round(m) + ' ม.';
    const k = m / 1000;
    return (k < 10 ? k.toFixed(1) : Math.round(k)) + ' กม.';
  }

  function mins(s) {
    if (s === null || s === undefined) return '';
    const m = Math.round(s / 60);
    if (m < 1) return 'ไม่ถึงนาที';
    if (m < 60) return m + ' นาที';
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return h + ' ชม.' + (rest ? ' ' + rest + ' นาที' : '');
  }

  /** เวลาที่จะไปถึง ถ้าออกเดี๋ยวนี้ */
  function eta(s) {
    const d = new Date(Date.now() + (s || 0) * 1000);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function clearCache() {
    mem = {};
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
  }

  global.Route = {
    plan: plan, leg: leg, optimize: optimize,
    km: km, mins: mins, eta: eta,
    clearCache: clearCache
  };
})(window);
