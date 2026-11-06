/* ===========================================================
   db.js — ชั้นเก็บข้อมูล (IndexedDB)
   ออกแบบเป็น adapter: ระยะสองเปลี่ยนไปใช้ฐานข้อมูลบนเน็ตได้
   โดยเขียน adapter ตัวใหม่ที่มีเมธอดชุดเดียวกัน
   =========================================================== */
(function (global) {
  'use strict';

  const DB_NAME = 'delivery-app';
  const DB_VER = 1;

  const TABLES = {
    stores:  { key: 'id', idx: [] },
    jobs:    { key: 'id', idx: ['date', 'storeId', 'driverId', 'parentJobId'] },
    drivers: { key: 'id', idx: [] },
    photos:  { key: 'id', idx: [] },
    meta:    { key: 'k',  idx: [] }
  };

  let _db = null;
  const listeners = new Set();

  /* ---------- helpers ---------- */

  function uid(prefix) {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 8);
    return (prefix ? prefix + '_' : '') + t + r;
  }

  function req(r) {
    return new Promise((res, rej) => {
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }

  function tx(table, mode) {
    if (!_db) throw new Error('ฐานข้อมูลยังไม่พร้อม');
    return _db.transaction(table, mode).objectStore(table);
  }

  function notify(table) {
    listeners.forEach((fn) => {
      try { fn(table); } catch (e) { console.error(e); }
    });
  }

  /* ---------- open ---------- */

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      let r;
      try { r = indexedDB.open(DB_NAME, DB_VER); }
      catch (e) { return rej(e); }

      r.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        Object.keys(TABLES).forEach((name) => {
          const def = TABLES[name];
          let os;
          if (!db.objectStoreNames.contains(name)) {
            os = db.createObjectStore(name, { keyPath: def.key });
          } else {
            os = r.transaction.objectStore(name);
          }
          def.idx.forEach((f) => {
            if (!os.indexNames.contains(f)) os.createIndex(f, f, { unique: false });
          });
        });
      };
      r.onsuccess = () => {
        _db = r.result;
        _db.onversionchange = () => { try { _db.close(); } catch (e) {} _db = null; };
        res(_db);
      };
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('ฐานข้อมูลถูกใช้งานอยู่ในแท็บอื่น'));
    });
  }

  /* ---------- generic table api ---------- */

  function table(name) {
    return {
      async all() {
        await open();
        const out = await req(tx(name, 'readonly').getAll());
        return out || [];
      },
      async get(id) {
        await open();
        if (id === undefined || id === null || id === '') return null;
        return (await req(tx(name, 'readonly').get(id))) || null;
      },
      async where(field, value) {
        await open();
        const os = tx(name, 'readonly');
        if (!os.indexNames.contains(field)) {
          const all = (await req(os.getAll())) || [];
          return all.filter((r) => r[field] === value);
        }
        return (await req(os.index(field).getAll(value))) || [];
      },
      async put(obj) {
        await open();
        const now = new Date().toISOString();
        const rec = Object.assign({}, obj);
        if (!rec[TABLES[name].key]) rec[TABLES[name].key] = uid(name.slice(0, 2));
        if (!rec.createdAt) rec.createdAt = now;
        rec.updatedAt = now;
        await req(tx(name, 'readwrite').put(rec));
        notify(name);
        return rec;
      },
      async putMany(list) {
        await open();
        const os = _db.transaction(name, 'readwrite').objectStore(name);
        const now = new Date().toISOString();
        const out = [];
        list.forEach((obj) => {
          const rec = Object.assign({}, obj);
          if (!rec[TABLES[name].key]) rec[TABLES[name].key] = uid(name.slice(0, 2));
          if (!rec.createdAt) rec.createdAt = now;
          rec.updatedAt = now;
          os.put(rec);
          out.push(rec);
        });
        await new Promise((res, rej) => {
          os.transaction.oncomplete = res;
          os.transaction.onerror = () => rej(os.transaction.error);
        });
        notify(name);
        return out;
      },
      async remove(id) {
        await open();
        await req(tx(name, 'readwrite').delete(id));
        notify(name);
      },
      async clear() {
        await open();
        await req(tx(name, 'readwrite').clear());
        notify(name);
      },
      async count() {
        await open();
        return await req(tx(name, 'readonly').count());
      }
    };
  }

  /* ---------- photos (blob) ---------- */

  const photos = {
    async add(blob, info) {
      await open();
      const rec = Object.assign(
        { id: uid('ph'), blob: blob, size: blob.size, type: blob.type, at: new Date().toISOString() },
        info || {}
      );
      await req(tx('photos', 'readwrite').put(rec));
      notify('photos');
      return rec;
    },
    async get(id) {
      await open();
      return (await req(tx('photos', 'readonly').get(id))) || null;
    },
    async url(id) {
      const r = await photos.get(id);
      if (!r || !r.blob) return null;
      return URL.createObjectURL(r.blob);
    },
    async remove(id) {
      await open();
      await req(tx('photos', 'readwrite').delete(id));
      notify('photos');
    },
    async all() {
      await open();
      return (await req(tx('photos', 'readonly').getAll())) || [];
    },
    async usage() {
      const all = await photos.all();
      return { count: all.length, bytes: all.reduce((s, p) => s + (p.size || 0), 0) };
    }
  };

  /* ---------- meta (settings) ---------- */

  const meta = {
    async get(k, dflt) {
      await open();
      const r = await req(tx('meta', 'readonly').get(k));
      return r ? r.v : dflt;
    },
    async set(k, v) {
      await open();
      await req(tx('meta', 'readwrite').put({ k: k, v: v }));
      notify('meta');
      return v;
    }
  };

  /* ---------- backup ---------- */

  function blobToDataUrl(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(durl) {
    const i = durl.indexOf(',');
    const head = durl.slice(0, i);
    const type = (head.match(/data:([^;]+)/) || [, 'image/jpeg'])[1];
    const bin = atob(durl.slice(i + 1));
    const buf = new Uint8Array(bin.length);
    for (let n = 0; n < bin.length; n++) buf[n] = bin.charCodeAt(n);
    return new Blob([buf], { type: type });
  }

  async function exportAll(includePhotos) {
    const data = {
      app: 'delivery-app',
      version: 1,
      exportedAt: new Date().toISOString(),
      includesPhotos: !!includePhotos,
      stores: await DB.stores.all(),
      jobs: await DB.jobs.all(),
      drivers: await DB.drivers.all(),
      meta: await DB.table('meta').all(),
      photos: []
    };
    if (includePhotos) {
      const ph = await photos.all();
      for (const p of ph) {
        data.photos.push({
          id: p.id, type: p.type, size: p.size, at: p.at,
          jobId: p.jobId, caption: p.caption,
          dataUrl: await blobToDataUrl(p.blob)
        });
      }
    }
    return data;
  }

  async function importAll(data, mode) {
    if (!data || data.app !== 'delivery-app') throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของระบบนี้');
    if (mode === 'replace') {
      await DB.stores.clear();
      await DB.jobs.clear();
      await DB.drivers.clear();
      await DB.table('photos').clear();
    }
    const n = { stores: 0, jobs: 0, drivers: 0, photos: 0 };
    if (data.drivers && data.drivers.length) { await DB.drivers.putMany(data.drivers); n.drivers = data.drivers.length; }
    if (data.stores && data.stores.length)   { await DB.stores.putMany(data.stores);   n.stores  = data.stores.length; }
    if (data.jobs && data.jobs.length)       { await DB.jobs.putMany(data.jobs);       n.jobs    = data.jobs.length; }
    if (data.meta && data.meta.length)       { await DB.table('meta').putMany(data.meta); }
    if (data.photos && data.photos.length) {
      await open();
      for (const p of data.photos) {
        if (!p.dataUrl) continue;
        const blob = dataUrlToBlob(p.dataUrl);
        await req(tx('photos', 'readwrite').put({
          id: p.id, blob: blob, size: blob.size, type: blob.type,
          at: p.at, jobId: p.jobId, caption: p.caption
        }));
        n.photos++;
      }
      notify('photos');
    }
    notify('*');
    return n;
  }

  async function wipe() {
    await DB.stores.clear();
    await DB.jobs.clear();
    await DB.drivers.clear();
    await DB.table('photos').clear();
    notify('*');
  }

  /* ---------- quota ---------- */

  async function quota() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try {
      const q = await navigator.storage.estimate();
      return { used: q.usage || 0, total: q.quota || 0 };
    } catch (e) { return null; }
  }

  /* ---------- export ---------- */

  const DB = {
    uid: uid,
    open: open,
    table: table,
    stores: table('stores'),
    jobs: table('jobs'),
    drivers: table('drivers'),
    photos: photos,
    meta: meta,
    exportAll: exportAll,
    importAll: importAll,
    wipe: wipe,
    quota: quota,
    onChange: function (fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };

  global.DB = DB;
})(window);
