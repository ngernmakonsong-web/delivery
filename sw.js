/* ===========================================================
   sw.js — service worker
   แคชไฟล์แอปไว้ให้เปิดเร็วและทนสัญญาณขาดหาย
   ข้อมูลงานทั้งหมดอยู่ใน IndexedDB ไม่เกี่ยวกับแคชนี้
   =========================================================== */

const CACHE = 'delivery-v6';

const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/db.js',
  './js/core.js',
  './js/views.js',
  './js/forms.js',
  './js/map.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // แผนที่และไฟล์จาก CDN: ใช้เน็ตก่อน ถ้าไม่ได้ค่อยใช้แคช
  if (url.origin !== self.location.origin) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200 && url.hostname.indexOf('tile.openstreetmap.org') === -1) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // ไฟล์ของแอปเอง: เอาจากเน็ตก่อนเสมอ เพื่อให้ได้เวอร์ชันล่าสุดทันทีที่มีอัปเดต
  // ถ้าเน็ตไม่มาภายใน 4 วินาที หรือออฟไลน์ ค่อยใช้ของในแคช
  e.respondWith((async () => {
    const cached = await caches.match(req);
    try {
      // cache:'no-cache' = ถามเซิร์ฟเวอร์ทุกครั้งว่าไฟล์เปลี่ยนไหม (ได้ 304 ถ้าเหมือนเดิม จึงเบามาก)
      // จำเป็น เพราะ GitHub Pages สั่งให้เบราว์เซอร์แคชไฟล์ไว้ 10 นาที
      // ถ้าไม่ใส่ ผู้ใช้จะยังได้โค้ดเก่าแม้จะอัปเดตไปแล้ว
      const res = await Promise.race([
        fetch(req, { cache: 'no-cache' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('ช้าเกินไป')), 4000))
      ]);
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  })());
});
