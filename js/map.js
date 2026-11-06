/* ===========================================================
   map.js — แผนที่ (Leaflet + OpenStreetMap)
   =========================================================== */
'use strict';

const MapView = (function () {
  let map = null;
  let layerJobs = null;
  let meMarker = null;
  let meCircle = null;
  let didFit = false;

  const DEFAULT_CENTER = [13.7563, 100.5018]; // กรุงเทพฯ
  const DEFAULT_ZOOM = 11;

  let base = null;

  function shell() {
    return '<div id="mapwrap">' +
      '<div id="map"></div>' +
      layerToggleHtml(S.basemap || 'road', 'map-layer') +
      '<button class="map-fab fit" type="button" data-act="map-fit" aria-label="ดูทุกหมุด">' + ICO.fit + '</button>' +
      '<button class="map-fab locate" type="button" data-act="map-locate" aria-label="ไปที่ตำแหน่งฉัน">' + ICO.locate + '</button>' +
      '<div id="mapCard"></div>' +
      '</div>';
  }

  function jobList() {
    const drvId = S.mode === 'driver' ? S.myDriverId : S.officeDriverId;
    return jobsOfDay(S.date, drvId);
  }

  function pinClass(j) {
    if (j.status === 'done') return 'pin-done';
    if (j.status === 'failed') return 'pin-failed';
    return (TY[j.type] || TY.deliver).pin;
  }

  function drawJobs() {
    if (!map) return;
    if (layerJobs) { layerJobs.clearLayers(); }
    else { layerJobs = L.layerGroup().addTo(map); }

    const list = jobList();
    const pts = [];
    let noPin = 0;

    list.forEach((j) => {
      const st = storeById(j.storeId);
      if (!st || st.lat === undefined || st.lat === null) { noPin++; return; }
      const icon = L.divIcon({
        className: '',
        html: '<div class="pin ' + pinClass(j) + '"><span>' + (j.seq || '•') + '</span></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 26]
      });
      const m = L.marker([st.lat, st.lng], { icon: icon, title: st.name });
      m.on('click', () => showCard(j));
      m.addTo(layerJobs);
      pts.push([st.lat, st.lng]);
    });

    // ร้านอื่น ๆ ที่ไม่มีงานวันนี้ แสดงเป็นหมุดเทาจาง ๆ
    const used = {};
    list.forEach((j) => { used[j.storeId] = 1; });
    S.stores.forEach((st) => {
      if (used[st.id] || st.lat === undefined || st.lat === null) return;
      const icon = L.divIcon({
        className: '',
        html: '<div class="pin pin-store" style="opacity:.55;width:20px;height:20px;border-width:1.5px"><span></span></div>',
        iconSize: [20, 20], iconAnchor: [10, 19]
      });
      const m = L.marker([st.lat, st.lng], { icon: icon, title: st.name });
      m.on('click', () => showStoreCard(st));
      m.addTo(layerJobs);
    });

    const hintOld = document.querySelector('#mapwrap .map-hint');
    if (hintOld) hintOld.remove();
    if (!pts.length) {
      const wrap = document.getElementById('mapwrap');
      if (wrap) {
        const d = document.createElement('div');
        d.className = 'map-hint';
        d.textContent = list.length
          ? 'งานวันนี้ ' + list.length + ' ร้าน แต่ยังไม่ได้ปักหมุดร้านไว้ จึงยังไม่ขึ้นบนแผนที่'
          : 'ยังไม่มีงานในวันนี้';
        wrap.appendChild(d);
      }
    }

    if (!didFit && pts.length) { fit(); didFit = true; }
    return pts;
  }

  function allPoints() {
    const pts = [];
    jobList().forEach((j) => {
      const st = storeById(j.storeId);
      if (st && st.lat !== undefined && st.lat !== null) pts.push([st.lat, st.lng]);
    });
    if (S.pos) pts.push([S.pos.lat, S.pos.lng]);
    return pts;
  }

  function fit() {
    const pts = allPoints();
    if (!map || !pts.length) return;
    if (pts.length === 1) { map.setView(pts[0], 15); return; }
    try { map.fitBounds(L.latLngBounds(pts).pad(0.18)); } catch (e) {}
  }

  function showCard(j) {
    const el = document.getElementById('mapCard');
    if (!el) return;
    const st = storeById(j.storeId);
    const t = TY[j.type] || TY.deliver;
    const lg = legOf(j.id);
    const d = (S.pos && st) ? distKm(S.pos, { lat: st.lat, lng: st.lng }) : null;
    el.className = 'map-card';
    el.innerHTML =
      '<div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:9px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;font-size:15.5px;line-height:1.35">' + esc(j.storeName || (st && st.name) || '-') + '</div>' +
          '<div class="muted" style="font-size:12.5px">' + (j.seq ? 'ลำดับ ' + j.seq + ' · ' : '') + t.label +
          (lg ? ' · ' + Route.km(lg.distance) + ' · ' + Route.mins(lg.duration)
              : (d !== null ? ' · ห่าง ' + distLabel(d) : '')) + '</div>' +
        '</div>' +
        '<button class="sh-close" type="button" data-act="map-card-close" aria-label="ปิด">' + ICO.x + '</button>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' + chipStatus(j.status) +
      (j.cod && j.cod.on ? '<span class="chip ty-bill">เก็บเงิน ' + money(j.cod.expected) + '</span>' : '') + '</div>' +
      '<div class="btn-row">' +
        (st && st.lat !== undefined ? '<a class="btn btn-sm" href="' + esc(navUrl(st.lat, st.lng)) + '" target="_blank" rel="noopener">' + ICO.nav + ' นำทาง</a>' : '') +
        '<button class="btn btn-sm btn-pri" type="button" data-act="job-open" data-id="' + esc(j.id) + '">เปิดงาน</button>' +
      '</div>';
  }

  function showStoreCard(st) {
    const el = document.getElementById('mapCard');
    if (!el) return;
    const d = S.pos ? distKm(S.pos, { lat: st.lat, lng: st.lng }) : null;
    el.className = 'map-card';
    el.innerHTML =
      '<div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:9px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;font-size:15.5px">' + esc(st.name) + '</div>' +
          '<div class="muted" style="font-size:12.5px">ไม่มีงานวันนี้' + (d !== null ? ' · ห่าง ' + distLabel(d) : '') + '</div>' +
        '</div>' +
        '<button class="sh-close" type="button" data-act="map-card-close" aria-label="ปิด">' + ICO.x + '</button>' +
      '</div>' +
      '<div class="btn-row">' +
        '<a class="btn btn-sm" href="' + esc(navUrl(st.lat, st.lng)) + '" target="_blank" rel="noopener">' + ICO.nav + ' นำทาง</a>' +
        '<button class="btn btn-sm btn-pri" type="button" data-act="store-open" data-id="' + esc(st.id) + '">ดูร้าน</button>' +
      '</div>';
  }

  let drvLayer = null;
  let routeLine = null;

  /** หมุดรถคันอื่น ๆ ให้ออฟฟิศเห็นว่าแต่ละคันอยู่ไหนตอนนี้ */
  function drawDrivers() {
    if (!map || !S.cloud || !Cloud.isOffice()) return;
    if (drvLayer) drvLayer.clearLayers();
    else drvLayer = L.layerGroup().addTo(map);

    const meId = S.me ? S.me.id : '';
    (S.positions || []).forEach((p) => {
      if (!p.lat || p.driverId === meId) return;
      const d = driverById(p.driverId);
      if (!d) return;
      const mins = Math.round((Date.now() - new Date(p.at).getTime()) / 60000);
      const stale = mins > 10;
      const m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: '',
          html: '<div class="drv-dot"' + (stale ? ' style="background:var(--ink-4)"' : '') + '>' +
            esc(initials(d.name)) + '</div>',
          iconSize: [30, 26], iconAnchor: [15, 13]
        }),
        zIndexOffset: 900
      });
      m.bindTooltip(d.name + (d.vehicle ? ' · ' + d.vehicle : '') +
        '<br>' + (mins < 1 ? 'เมื่อสักครู่' : mins + ' นาทีที่แล้ว'), { direction: 'top' });
      m.addTo(drvLayer);
    });
  }

  /** เส้นทางจริงบนถนน ตามแผนของวันนี้ */
  function drawRoute() {
    if (!map) return;
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    const p = S.plan;
    if (!p || !p.geometry || p.geometry.length < 2) return;
    routeLine = L.layerGroup([
      L.polyline(p.geometry, { color: '#ffffff', weight: 9, opacity: 0.85, lineJoin: 'round' }),
      L.polyline(p.geometry, {
        color: p.estimated ? '#9ca3af' : '#1a73e8',
        weight: 5, opacity: 0.95, lineJoin: 'round',
        dashArray: p.estimated ? '9 8' : null
      })
    ]).addTo(map);
    routeLine.eachLayer((l) => l.bringToBack());
  }

  function drawMe() {
    if (!map || !S.pos) return;
    const ll = [S.pos.lat, S.pos.lng];
    if (!meMarker) {
      meMarker = L.marker(ll, {
        icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        zIndexOffset: 1000, interactive: false
      }).addTo(map);
      meCircle = L.circle(ll, {
        radius: S.pos.acc || 30, color: '#1a73e8', weight: 1,
        fillColor: '#1a73e8', fillOpacity: 0.1, interactive: false
      }).addTo(map);
    } else {
      meMarker.setLatLng(ll);
      if (meCircle) { meCircle.setLatLng(ll); meCircle.setRadius(S.pos.acc || 30); }
    }
  }

  function mount() {
    const el = document.getElementById('map');
    if (!el || typeof L === 'undefined') {
      if (el) el.innerHTML = '<div class="empty"><div class="eico">🗺️</div><h3>โหลดแผนที่ไม่ได้</h3>' +
        '<p>ตรวจสัญญาณอินเทอร์เน็ตแล้วลองเปิดหน้านี้อีกครั้ง</p></div>';
      return;
    }

    const center = S.pos ? [S.pos.lat, S.pos.lng] : (allPoints()[0] || DEFAULT_CENTER);
    map = L.map(el, { zoomControl: false, attributionControl: true })
      .setView(center, S.pos ? 14 : DEFAULT_ZOOM);

    base = baseLayer(S.basemap || 'road').addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    didFit = false;
    drawRoute();
    drawJobs();
    drawDrivers();
    drawMe();

    map.on('click', () => {
      const c = document.getElementById('mapCard');
      if (c) { c.className = ''; c.innerHTML = ''; }
    });

    setTimeout(() => { if (map) map.invalidateSize(); }, 120);
  }

  function teardown() {
    if (map) { map.remove(); map = null; }
    layerJobs = null; meMarker = null; meCircle = null; base = null;
    drvLayer = null; routeLine = null; didFit = false;
  }

  function setBase(kind) {
    if (!map) return;
    if (base) map.removeLayer(base);
    base = baseLayer(kind).addTo(map);
    base.bringToBack();
  }

  function onPos() {
    if (!map) return;
    drawMe();
  }

  function refresh() {
    if (!map) return;
    drawRoute();
    drawJobs();
    drawDrivers();
    drawMe();
  }

  return {
    shell: shell, mount: mount, teardown: teardown, setBase: setBase,
    onPos: onPos, fit: fit, refresh: refresh,
    center: function () {
      if (!map || !S.pos) return;
      map.setView([S.pos.lat, S.pos.lng], Math.max(map.getZoom(), 15));
    }
  };
})();

ACT['map-fit'] = () => MapView.fit();

ACT['map-layer'] = async (el) => {
  const k = el.dataset.k;
  S.basemap = k;
  await DB.meta.set('basemap', k);
  document.querySelectorAll('#mapwrap .maplayers button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
  MapView.setBase(k);
};

ACT['map-locate'] = async () => {
  toast('กำลังรอสัญญาณให้แม่นที่สุด...', '', 8000);
  const p = await gpsBest(8000, () => { MapView.refresh(); MapView.center(); });
  if (!p) { toast('หาตำแหน่งไม่ได้ ตรวจว่าเปิด GPS ของเครื่องแล้ว', 'bad', 4000); return; }
  MapView.refresh();
  MapView.center();
  toast('ตำแหน่งของคุณ ' + accLabel(p.acc), accIsPoor(p.acc) ? 'bad' : 'ok', 3800);
};
ACT['map-card-close'] = () => {
  const c = document.getElementById('mapCard');
  if (c) { c.className = ''; c.innerHTML = ''; }
};
