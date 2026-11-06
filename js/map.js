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
    return jobsOfDay(S.date, drvId);   // ออฟฟิศไม่เลือกใคร = ได้งานทุกคน
  }

  function pinClass(j) {
    if (j.status === 'done') return 'pin-done';
    if (j.status === 'failed') return 'pin-failed';
    return (TY[j.type] || TY.deliver).pin;
  }

  /** สีหมุด: ดูภาพรวมใช้สีประจำคนขับ จะได้รู้ว่าหมุดไหนของใคร */
  function pinStyle(j) {
    if (!isAllDriversView() || CLOSED[j.status]) return '';
    return ' style="background:' + driverColor(j.driverId) + '"';
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
        html: '<div class="pin ' + pinClass(j) + '"' + pinStyle(j) + '><span>' + (j.seq || '•') + '</span></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 26]
      });
      const m = L.marker([st.lat, st.lng], { icon: icon, title: st.name });
      m.on('click', () => showCard(j));

      // ป้ายเวลาเดินทางถึงร้านนี้ ติดไว้ถาวรให้เห็นโดยไม่ต้องกด
      const lg = legOf(j.id);
      if (lg && !CLOSED[j.status] && list.length <= 18) {
        m.bindTooltip(
          '<b>' + Route.mins(lg.duration) + '</b> · ' + Route.km(lg.distance) +
          '<br><span style="opacity:.75">ถึง ' + Route.eta(lg.duration) + ' น.</span>',
          { permanent: true, direction: 'right', offset: [10, -8], className: 'leg-tip' }
        );
      } else {
        m.bindTooltip(esc(st.name), { direction: 'top' });
      }

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
        html: '<div class="pin pin-store"><span>🏪</span></div>',
        iconSize: [26, 26], iconAnchor: [13, 24]
      });
      const m = L.marker([st.lat, st.lng], { icon: icon, title: st.name });
      m.bindTooltip(esc(st.name) + '<br><span style="opacity:.75">ไม่มีงานวันนี้</span>', { direction: 'top' });
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
          html: '<div class="drv-dot" style="background:' + (stale ? '#9ca3af' : driverColor(p.driverId)) + '">' +
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

  /** วาดเส้นทางหนึ่งเส้น ขอบขาวด้านล่างเพื่อให้เห็นชัดบนภาพดาวเทียม */
  function routeLayers(geo, color, estimated) {
    return [
      L.polyline(geo, { color: '#ffffff', weight: 9, opacity: 0.9, lineJoin: 'round' }),
      L.polyline(geo, {
        color: color, weight: 5, opacity: 0.95, lineJoin: 'round',
        dashArray: estimated ? '9 8' : null
      })
    ];
  }

  /** เส้นทางจริงบนถนน
   *  ออฟฟิศดูภาพรวม = วาดทุกคัน แยกสีคนละสี
   *  ดูรายคนหรือมุมมองคนขับ = วาดเส้นเดียว */
  function drawRoute() {
    if (!map) return;
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }

    const layers = [];

    if (isAllDriversView()) {
      const plans = S.plans || {};
      Object.keys(plans).forEach((did) => {
        const p = plans[did];
        if (!p.geometry || p.geometry.length < 2) return;
        routeLayers(p.geometry, p.color, p.estimated).forEach((l) => layers.push(l));
      });
    } else {
      const p = S.plan;
      if (p && p.geometry && p.geometry.length > 1) {
        const color = driverColor(activeDriverId());
        routeLayers(p.geometry, color, p.estimated).forEach((l) => layers.push(l));
      }
    }

    if (!layers.length) return;
    routeLine = L.layerGroup(layers).addTo(map);
    routeLine.eachLayer((l) => l.bringToBack());

    // ป้ายสรุปเวลาและระยะของแต่ละคัน วางไว้กลางเส้น
    if (isAllDriversView()) {
      const plans = S.plans || {};
      Object.keys(plans).forEach((did) => {
        const p = plans[did];
        if (!p.geometry || p.geometry.length < 4) return;
        const mid = p.geometry[Math.floor(p.geometry.length / 2)];
        const d = driverById(did);
        L.marker(mid, {
          interactive: false,
          icon: L.divIcon({
            className: '',
            html: '<div class="route-tag" style="background:' + p.color + '">' +
              esc(d ? d.name : '') + ' · ' + Route.mins(p.total.duration) +
              ' · ' + Route.km(p.total.distance) + '</div>',
            iconSize: [0, 0], iconAnchor: [0, 0]
          })
        }).addTo(routeLine);
      });
    }
  }

  /** ป้ายบอกว่าสีไหนเป็นของใคร */
  function drawLegend() {
    const wrap = document.getElementById('mapwrap');
    if (!wrap) return;
    const old = wrap.querySelector('.maplegend');
    if (old) old.remove();
    if (!isAllDriversView()) return;

    const plans = S.plans || {};
    const ids = Object.keys(plans);
    if (!ids.length) return;

    const el = document.createElement('div');
    el.className = 'maplegend';
    el.innerHTML = ids.map((did) => {
      const d = driverById(did);
      const p = plans[did];
      return '<button class="lg-row" type="button" data-act="pick-driver" data-id="' + esc(did) + '">' +
        '<i style="background:' + p.color + '"></i>' +
        '<span class="lg-n">' + esc(d ? d.name : '-') + '</span>' +
        '<span class="lg-d">' + p.stops + ' ร้าน · ' + Route.km(p.total.distance) +
        ' · ' + Route.mins(p.total.duration) + '</span>' +
        '</button>';
    }).join('');
    wrap.appendChild(el);
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
    drawLegend();
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
    drawLegend();
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
