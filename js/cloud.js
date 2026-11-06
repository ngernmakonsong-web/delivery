/* ===========================================================
   cloud.js — เชื่อมฐานข้อมูลกลาง (Supabase)
   เปิดเมธอดชุดเดียวกับ db.js เพื่อให้หน้าจอเดิมใช้ได้โดยไม่ต้องแก้
   =========================================================== */
(function (global) {
  'use strict';

  const EMAIL_DOMAIN = '@delivery.local';   // แปลง username เป็นอีเมลให้ระบบยืนยันตัวตน

  let sb = null;             // client หลัก
  let me = null;             // โปรไฟล์ของคนที่ล็อกอินอยู่
  let ready = false;
  const listeners = new Set();

  function notify(what) {
    listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } });
  }

  /* ---------- แปลงชื่อฟิลด์ ฐานข้อมูลใช้ snake_case แอปใช้ camelCase ---------- */

  function storeIn(r) {
    if (!r) return null;
    return {
      id: r.id, code: r.code || '', name: r.name, address: r.address || '',
      phone: r.phone || '', contactName: r.contact_name || '',
      openFrom: r.open_from || '', openTo: r.open_to || '', openHours: r.open_hours || '',
      billing: r.billing || undefined, note: r.note || '',
      lat: r.lat === null ? undefined : r.lat,
      lng: r.lng === null ? undefined : r.lng,
      deleted: !!r.deleted,
      createdAt: r.created_at, updatedAt: r.updated_at
    };
  }
  function storeOut(o) {
    const r = {
      code: o.code || null, name: o.name, address: o.address || null,
      phone: o.phone || null, contact_name: o.contactName || null,
      open_from: o.openFrom || null, open_to: o.openTo || null,
      open_hours: o.openHours || null,
      billing: o.billing || null, note: o.note || null,
      lat: (o.lat === undefined || o.lat === '') ? null : Number(o.lat),
      lng: (o.lng === undefined || o.lng === '') ? null : Number(o.lng),
      deleted: !!o.deleted
    };
    if (o.id) r.id = o.id;
    return r;
  }

  function jobIn(r) {
    if (!r) return null;
    return {
      id: r.id, date: r.date, type: r.type,
      storeId: r.store_id || '', storeName: r.store_name || '',
      driverId: r.driver_id || '', status: r.status, seq: r.seq || 0,
      billNo: r.bill_no || '', amount: r.amount === null ? 0 : Number(r.amount),
      items: r.items || [], cod: r.cod || undefined, bill: r.bill || undefined,
      pay: r.pay || undefined, note: r.note || '', closeNote: r.close_note || '',
      photos: r.photos || [], events: r.events || [], fail: r.fail || undefined,
      rescheduledTo: r.rescheduled_to || undefined,
      parentJobId: r.parent_job_id || undefined,
      childJobId: r.child_job_id || undefined,
      round: r.round || 1,
      arrivedAt: r.arrived_at || undefined, closedAt: r.closed_at || undefined,
      createdAt: r.created_at, updatedAt: r.updated_at
    };
  }
  function jobOut(o) {
    const r = {
      date: o.date, type: o.type,
      store_id: o.storeId || null, store_name: o.storeName || null,
      driver_id: o.driverId || null, status: o.status || 'assigned',
      seq: o.seq || 0,
      bill_no: o.billNo || null,
      amount: (o.amount === undefined || o.amount === '') ? null : Number(o.amount),
      items: o.items || [], cod: o.cod || null, bill: o.bill || null, pay: o.pay || null,
      note: o.note || null, close_note: o.closeNote || null,
      photos: o.photos || [], events: o.events || [], fail: o.fail || null,
      rescheduled_to: o.rescheduledTo || null,
      parent_job_id: o.parentJobId || null,
      child_job_id: o.childJobId || null,
      round: o.round || 1,
      arrived_at: o.arrivedAt || null, closed_at: o.closedAt || null
    };
    if (o.id) r.id = o.id;
    return r;
  }

  function profIn(r) {
    if (!r) return null;
    return {
      id: r.id, username: r.username, name: r.name, role: r.role,
      vehicle: r.vehicle || '', phone: r.phone || '',
      active: r.active !== false, order: r.sort_order || 100
    };
  }

  /* ---------- เริ่มต้น ---------- */

  async function init(url, key) {
    if (!url || !key) return false;
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.error('ยังโหลดไลบรารี supabase ไม่ได้');
      return false;
    }
    sb = supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'delivery-auth' }
    });
    ready = true;
    return true;
  }

  function client() { return sb; }
  function isReady() { return ready; }
  function current() { return me; }
  function isOffice() { return !!me && (me.role === 'office' || me.role === 'admin'); }
  function isAdmin() { return !!me && me.role === 'admin'; }

  /* ---------- ยืนยันตัวตน ---------- */

  function emailOf(username) {
    const u = String(username || '').trim().toLowerCase();
    return u.indexOf('@') > -1 ? u : u + EMAIL_DOMAIN;
  }

  async function loadMe() {
    const { data: s } = await sb.auth.getSession();
    if (!s || !s.session) { me = null; return null; }
    const { data, error } = await sb.from('profiles').select('*').eq('id', s.session.user.id).maybeSingle();
    if (error) { console.error(error); me = null; return null; }
    me = profIn(data);
    return me;
  }

  async function signIn(username, password) {
    const { error } = await sb.auth.signInWithPassword({
      email: emailOf(username), password: password
    });
    if (error) {
      const m = String(error.message || '');
      if (m.indexOf('Invalid login') > -1) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      if (m.indexOf('Email not confirmed') > -1) throw new Error('บัญชียังไม่ได้ยืนยัน ให้ผู้ดูแลปิดการยืนยันอีเมลใน Supabase');
      throw new Error('เข้าระบบไม่ได้: ' + m);
    }
    const p = await loadMe();
    if (!p) {
      await sb.auth.signOut();
      throw new Error('บัญชีนี้ยังไม่มีข้อมูลผู้ใช้ในระบบ ให้ผู้ดูแลสร้างให้ก่อน');
    }
    if (!p.active) {
      await sb.auth.signOut();
      throw new Error('บัญชีนี้ถูกปิดการใช้งาน ติดต่อผู้ดูแล');
    }
    return p;
  }

  async function signOut() {
    unsubscribeAll();
    try { await sb.auth.signOut(); } catch (e) {}
    me = null;
  }

  /** สมัครบัญชีแรกของระบบ (ผู้ดูแล) */
  async function signUpFirst(username, password, name) {
    const { data, error } = await sb.auth.signUp({ email: emailOf(username), password: password });
    if (error) throw new Error(mapSignUpError(error));
    const uid = data.user && data.user.id;
    if (!uid) throw new Error('สร้างบัญชีไม่สำเร็จ');
    if (!data.session) {
      await sb.auth.signInWithPassword({ email: emailOf(username), password: password });
    }
    const { error: e2 } = await sb.from('profiles').insert({
      id: uid, username: String(username).trim().toLowerCase(),
      name: name, role: 'admin', sort_order: 1
    });
    if (e2) throw new Error('บันทึกข้อมูลผู้ใช้ไม่ได้: ' + e2.message);
    return await loadMe();
  }

  /** ผู้ดูแลสร้างบัญชีให้คนอื่น โดยไม่หลุดออกจากบัญชีตัวเอง
   *  ใช้ client ตัวที่สองที่ไม่เก็บ session เพื่อไม่ไปทับ session ปัจจุบัน */
  async function createUser(o) {
    if (!isAdmin()) throw new Error('เฉพาะผู้ดูแลเท่านั้นที่สร้างบัญชีได้');
    const tmp = supabase.createClient(sb.supabaseUrl, sb.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'delivery-tmp' }
    });
    const { data, error } = await tmp.auth.signUp({
      email: emailOf(o.username), password: o.password
    });
    if (error) throw new Error(mapSignUpError(error));
    const uid = data.user && data.user.id;
    if (!uid) throw new Error('สร้างบัญชีไม่สำเร็จ');
    try { await tmp.auth.signOut(); } catch (e) {}

    const { error: e2 } = await sb.from('profiles').insert({
      id: uid,
      username: String(o.username).trim().toLowerCase(),
      name: o.name,
      role: o.role || 'driver',
      vehicle: o.vehicle || null,
      phone: o.phone || null,
      sort_order: o.order || 100
    });
    if (e2) throw new Error('สร้างผู้ใช้ได้แต่บันทึกข้อมูลไม่ได้: ' + e2.message);
    notify('drivers');
    return uid;
  }

  function mapSignUpError(error) {
    const m = String(error.message || '');
    if (m.indexOf('already registered') > -1 || m.indexOf('already been registered') > -1) {
      return 'ชื่อผู้ใช้นี้มีอยู่แล้ว ใช้ชื่ออื่น';
    }
    if (m.indexOf('Password should be') > -1) return 'รหัสผ่านสั้นเกินไป ต้องอย่างน้อย 6 ตัว';
    if (m.indexOf('Signups not allowed') > -1 || m.indexOf('signup is disabled') > -1) {
      return 'Supabase ปิดการสมัครอยู่ ให้เปิด Allow new users to sign up ชั่วคราวเพื่อสร้างบัญชี';
    }
    return 'สร้างบัญชีไม่ได้: ' + m;
  }

  /** ถามเซิร์ฟเวอร์ว่ามีผู้ดูแลแล้วหรือยัง ใช้ได้ตั้งแต่ยังไม่ล็อกอิน
   *  คืน null ถ้าถามไม่ได้ (ยังไม่ได้รัน SQL ตั้งระบบ) */
  async function hasAnyAdmin() {
    try {
      const { data, error } = await sb.rpc('system_initialized');
      if (error) return null;
      return !!data;
    } catch (e) { return null; }
  }

  async function changePassword(newPass) {
    const { error } = await sb.auth.updateUser({ password: newPass });
    if (error) throw new Error('เปลี่ยนรหัสผ่านไม่ได้: ' + error.message);
  }

  /* ---------- ตาราง ---------- */

  function tableApi(name, mapIn, mapOut, order) {
    return {
      async all() {
        let q = sb.from(name).select('*');
        if (order) q = q.order(order.col, { ascending: order.asc !== false });
        const { data, error } = await q;
        if (error) { console.error(name, error); throw new Error(errMsg(name, error)); }
        return (data || []).map(mapIn);
      },
      async get(id) {
        if (!id) return null;
        const { data, error } = await sb.from(name).select('*').eq('id', id).maybeSingle();
        if (error) { console.error(error); return null; }
        return mapIn(data);
      },
      async put(obj) {
        const row = mapOut(obj);
        const { data, error } = await sb.from(name).upsert(row).select().maybeSingle();
        if (error) { console.error(name, error); throw new Error(errMsg(name, error)); }
        notify(name);
        return mapIn(data);
      },
      async putMany(list) {
        if (!list || !list.length) return [];
        const { data, error } = await sb.from(name).upsert(list.map(mapOut)).select();
        if (error) { console.error(name, error); throw new Error(errMsg(name, error)); }
        notify(name);
        return (data || []).map(mapIn);
      },
      async remove(id) {
        const { error } = await sb.from(name).delete().eq('id', id);
        if (error) { console.error(error); throw new Error(errMsg(name, error)); }
        notify(name);
      },
      async clear() { throw new Error('ลบทั้งตารางจากแอปไม่ได้ ทำใน Supabase โดยตรง'); },
      async count() {
        const { count } = await sb.from(name).select('id', { count: 'exact', head: true });
        return count || 0;
      }
    };
  }

  function errMsg(name, error) {
    const m = String(error.message || '');
    if (m.indexOf('row-level security') > -1 || error.code === '42501') {
      return 'ไม่มีสิทธิ์ทำรายการนี้ (' + name + ')';
    }
    if (m.indexOf('Failed to fetch') > -1 || m.indexOf('NetworkError') > -1) {
      return 'ต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสัญญาณอินเทอร์เน็ต';
    }
    return m;
  }

  const stores = tableApi('stores', storeIn, storeOut, { col: 'name' });
  const jobs = tableApi('jobs', jobIn, jobOut, { col: 'seq' });

  /** drivers = profiles  (หน้าจอเดิมเรียก DB.drivers) */
  const drivers = {
    async all() {
      const { data, error } = await sb.from('profiles').select('*')
        .eq('active', true).order('sort_order').order('name');
      if (error) { console.error(error); throw new Error(errMsg('profiles', error)); }
      return (data || []).map(profIn);
    },
    async get(id) {
      const { data } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
      return profIn(data);
    },
    async put(obj) {
      const row = { name: obj.name, vehicle: obj.vehicle || null, phone: obj.phone || null };
      if (obj.order) row.sort_order = obj.order;
      if (obj.role) row.role = obj.role;
      if (obj.active !== undefined) row.active = obj.active;
      if (obj.deleted) row.active = false;
      const { data, error } = await sb.from('profiles').update(row).eq('id', obj.id).select().maybeSingle();
      if (error) throw new Error(errMsg('profiles', error));
      notify('drivers');
      return profIn(data);
    },
    async putMany() { throw new Error('เพิ่มผู้ใช้ทีละหลายคนไม่ได้'); },
    async remove(id) {
      const { error } = await sb.from('profiles').update({ active: false }).eq('id', id);
      if (error) throw new Error(errMsg('profiles', error));
      notify('drivers');
    },
    async clear() { throw new Error('ลบผู้ใช้ทั้งหมดจากแอปไม่ได้'); },
    async count() { return (await drivers.all()).length; }
  };

  /* ---------- ตำแหน่งคนขับ ---------- */

  let _lastPush = 0;
  async function pushPosition(p) {
    if (!me || !p) return;
    const now = Date.now();
    if (now - _lastPush < 60000) return;      // ส่งอย่างมากนาทีละครั้ง ประหยัดโควตา
    _lastPush = now;
    try {
      await sb.from('driver_positions').upsert({
        driver_id: me.id, lat: p.lat, lng: p.lng, acc: Math.round(p.acc || 0), at: new Date().toISOString()
      });
    } catch (e) { /* ส่งตำแหน่งไม่สำเร็จไม่ใช่เรื่องคอขาดบาดตาย */ }
  }

  async function allPositions() {
    const { data, error } = await sb.from('driver_positions').select('*');
    if (error) return [];
    return (data || []).map((r) => ({
      driverId: r.driver_id, lat: r.lat, lng: r.lng, acc: r.acc, at: r.at
    }));
  }

  /* ---------- รูปถ่าย ---------- */

  const photos = {
    async add(blob, info) {
      const name = (me ? me.id : 'x') + '/' + Date.now() + '-' +
        Math.random().toString(36).slice(2, 8) + '.jpg';
      const { error } = await sb.storage.from('photos')
        .upload(name, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
      if (error) throw new Error('อัปโหลดรูปไม่ได้: ' + error.message);
      notify('photos');
      return { id: name, size: blob.size, type: blob.type, at: new Date().toISOString(), jobId: info && info.jobId };
    },
    async get(id) {
      return { id: id, blob: null, size: 0, type: 'image/jpeg' };
    },
    async url(id) {
      if (!id) return null;
      const { data } = sb.storage.from('photos').getPublicUrl(id);
      return (data && data.publicUrl) || null;
    },
    async remove(id) {
      const { error } = await sb.storage.from('photos').remove([id]);
      if (error) console.error(error);
      notify('photos');
    },
    async all() { return []; },
    async usage() { return { count: 0, bytes: 0 }; }
  };

  /* ---------- การตั้งค่าเฉพาะเครื่อง ---------- */

  const meta = {
    async get(k, dflt) {
      try {
        const v = localStorage.getItem('delivery:' + k);
        return v === null ? dflt : JSON.parse(v);
      } catch (e) { return dflt; }
    },
    async set(k, v) {
      try { localStorage.setItem('delivery:' + k, JSON.stringify(v)); } catch (e) {}
      return v;
    }
  };

  /* ---------- ฟังความเปลี่ยนแปลงแบบสด ---------- */

  let channel = null;

  function subscribe() {
    if (!sb || channel) return;
    channel = sb.channel('delivery-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => notify('jobs'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, () => notify('stores'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => notify('drivers'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_positions' }, () => notify('positions'))
      .subscribe();
  }

  function unsubscribeAll() {
    if (channel) { try { sb.removeChannel(channel); } catch (e) {} channel = null; }
  }

  /* ---------- ย้ายข้อมูลเดิมจากเครื่องขึ้นคลาวด์ ---------- */

  async function migrateLocal(onStep) {
    if (typeof LocalDB === 'undefined') return { stores: 0, jobs: 0 };
    const out = { stores: 0, jobs: 0, skipped: 0 };
    const oldStores = await LocalDB.stores.all();
    const oldJobs = await LocalDB.jobs.all();
    if (!oldStores.length && !oldJobs.length) return out;

    const idMap = {};
    for (const s of oldStores) {
      if (s.deleted) continue;
      if (onStep) onStep('ร้านค้า ' + (out.stores + 1) + '/' + oldStores.length);
      const saved = await stores.put(Object.assign({}, s, { id: undefined }));
      idMap[s.id] = saved.id;
      out.stores++;
    }
    for (const j of oldJobs) {
      if (onStep) onStep('งาน ' + (out.jobs + 1) + '/' + oldJobs.length);
      const rec = Object.assign({}, j, {
        id: undefined,
        storeId: idMap[j.storeId] || null,
        driverId: me ? me.id : null,
        photos: [],              // รูปเดิมอยู่ในเครื่อง ย้ายอัตโนมัติไม่ได้
        parentJobId: undefined, childJobId: undefined
      });
      try { await jobs.put(rec); out.jobs++; } catch (e) { out.skipped++; }
    }
    return out;
  }

  global.Cloud = {
    init: init, client: client, isReady: isReady,
    current: current, isOffice: isOffice, isAdmin: isAdmin,
    loadMe: loadMe, signIn: signIn, signOut: signOut,
    signUpFirst: signUpFirst, createUser: createUser,
    hasAnyAdmin: hasAnyAdmin, changePassword: changePassword,
    stores: stores, jobs: jobs, drivers: drivers,
    photos: photos, meta: meta,
    pushPosition: pushPosition, allPositions: allPositions,
    subscribe: subscribe, unsubscribe: unsubscribeAll,
    migrateLocal: migrateLocal,
    uid: function (p) { return (p ? p + '_' : '') + Math.random().toString(36).slice(2, 10); },
    open: async function () { return true; },
    quota: async function () { return null; },
    onChange: function (fn) { listeners.add(fn); return () => listeners.delete(fn); },
    exportAll: async function () {
      return {
        app: 'delivery-app', version: 2, exportedAt: new Date().toISOString(),
        includesPhotos: false,
        stores: await stores.all(), jobs: await jobs.all(),
        drivers: await drivers.all(), meta: [], photos: []
      };
    },
    importAll: async function () { throw new Error('กู้คืนลงฐานข้อมูลกลางต้องทำผ่านผู้ดูแล'); },
    wipe: async function () { throw new Error('ลบข้อมูลทั้งหมดต้องทำใน Supabase โดยตรง'); }
  };
})(window);
