/* ===========================================================
   views.js — หน้าจอต่าง ๆ และรายละเอียดงาน
   =========================================================== */
'use strict';

const Views = {};

/* ======================= ชิ้นส่วนที่ใช้ซ้ำ ======================= */

function chipStatus(st) {
  const s = ST[st] || ST.pending;
  return '<span class="chip ' + s.cls + '"><span class="dot"></span>' + s.label + '</span>';
}
function chipType(ty) {
  const t = TY[ty] || TY.deliver;
  return '<span class="chip ' + t.cls + '">' + t.label + '</span>';
}

function tile(k, v, unit, cls) {
  return '<div class="tile"><div class="tile-k">' + esc(k) + '</div>' +
    '<div class="tile-v ' + (cls || '') + '">' + v +
    (unit ? '<span class="tile-u">' + esc(unit) + '</span>' : '') + '</div></div>';
}

function progressBar(p) {
  if (!p.total) return '';
  const pc = (n) => (n / p.total * 100).toFixed(2) + '%';
  return '<div class="pbar">' +
    '<i class="pb-done" style="width:' + pc(p.done) + '"></i>' +
    '<i class="pb-failed" style="width:' + pc(p.failed) + '"></i>' +
    '<i class="pb-prog" style="width:' + pc(p.active) + '"></i>' +
    '</div>';
}

/** สรุปสั้น ๆ ของงานตามประเภท */
function jobSummaryLine(j) {
  if (j.type === 'deliver') {
    const n = (j.items || []).length;
    const bits = [];
    if (j.billNo) bits.push('บิล ' + j.billNo);
    if (n) bits.push(n + ' รายการ');
    return bits.join(' · ');
  }
  if (j.type === 'bill') {
    const bits = [];
    if (j.bill && j.bill.docNo) bits.push('ใบวางบิล ' + j.bill.docNo);
    const r = (j.bill && j.bill.billRefs) || [];
    if (r.length) bits.push(r.length + ' บิล');
    if (j.bill && j.bill.appointmentDate) bits.push('นัดรับเช็ค ' + thDate(j.bill.appointmentDate));
    return bits.join(' · ');
  }
  if (j.type === 'cheque') {
    const p = j.pay || {};
    const bits = [];
    bits.push((PAY[p.method] || PAY.cheque).label);
    if (p.chequeNo) bits.push('เลขที่ ' + p.chequeNo);
    if (p.bank) bits.push(p.bank);
    if (p.chequeDate) bits.push('ลงวันที่ ' + thDate(p.chequeDate));
    return bits.join(' · ');
  }
  return '';
}

function jobAmount(j) {
  if (j.type === 'cheque') return num(j.pay && j.pay.amount);
  return num(j.amount);
}

/** งานที่ปิดแล้ว คนขับเปิดดูรายละเอียดไม่ได้ ตรวจได้เฉพาะหัวหน้าและผู้ดูแล */
function canOpenJob(j) {
  if (!S.cloud) return true;
  if (canSeeOffice()) return true;
  return !CLOSED[j.status];
}

function jobCard(j, opts) {
  opts = opts || {};
  const t = TY[j.type] || TY.deliver;
  const openable = canOpenJob(j);
  const tap = openable
    ? ' data-act="job-open" data-id="' + esc(j.id) + '"'
    : ' data-act="job-locked"';
  const st = storeById(j.storeId);
  const name = j.storeName || (st && st.name) || 'ไม่ระบุร้าน';
  const sub = jobSummaryLine(j) || (st && st.address) || '';
  const amt = jobAmount(j);
  const lg = legOf(j.id);
  const d = (S.pos && st && st.lat !== undefined && st.lat !== null)
    ? distKm(S.pos, { lat: st.lat, lng: st.lng }) : null;
  const drv = opts.showDriver ? driverById(j.driverId) : null;

  const tint = (typeof isAllDriversView === 'function' && isAllDriversView() && j.driverId)
    ? ' style="box-shadow:inset 4px 0 0 ' + driverColor(j.driverId) + ', var(--shadow)"' : '';

  return '<div class="job' + (j.status === 'done' ? ' is-done' : '') + (j.status === 'failed' ? ' is-failed' : '') +
    (openable ? '' : ' is-locked') + '"' + tint + '>' +
    '<div class="job-seq t-' + j.type + '"' + tap + '>' +
      '<span>' + (j.seq || '–') + '</span><span class="sq-ico">' + t.ico + '</span>' +
    '</div>' +
    '<div class="job-body"' + tap + '>' +
      '<div class="job-top"><div class="job-name">' + esc(name) + '</div></div>' +
      (sub ? '<div class="job-meta">' + esc(sub) + '</div>' : '') +
      '<div class="job-foot">' +
        chipStatus(j.status) +
        (CLOSED[j.status] && !(j.photos || []).length ? '<span class="chip st-failed">ไม่มีรูป</span>' : '') +
        (!openable ? '<span class="chip">🔒 ปิดงานแล้ว</span>' : '') +
        (reviewOf(j) === 'pending' ? '<span class="chip st-enroute">รอตรวจ</span>' : '') +
        (reviewOf(j) === 'rejected' ? '<span class="chip st-failed">ส่งกลับแก้</span>' : '') +
        (reviewOf(j) === 'passed' ? '<span class="chip st-done">ตรวจผ่าน</span>' : '') +
        (j.cod && j.cod.on ? '<span class="job-cod">เก็บเงิน ' + money(j.cod.expected) + '</span>' : '') +
        (drv ? '<span class="chip">' + esc(drv.name) + '</span>' : '') +
        (lg
          ? '<span class="chip ty-cheque">' + Route.km(lg.distance) + ' · ' + Route.mins(lg.duration) +
            (lg.estimated ? ' โดยประมาณ' : '') + '</span>'
          : (d !== null ? '<span class="chip">' + distLabel(d) + '</span>' : '')) +
        (amt ? '<span class="job-amt tnum">' + money(amt) + '</span>' : '') +
      '</div>' +
    '</div>' +
    (opts.reorder
      ? '<div class="job-ord">' +
        '<button type="button" data-act="job-up" data-id="' + esc(j.id) + '" aria-label="เลื่อนขึ้น">' + ICO.up + '</button>' +
        '<button type="button" data-act="job-down" data-id="' + esc(j.id) + '" aria-label="เลื่อนลง">' + ICO.down + '</button>' +
        '</div>'
      : '') +
    '</div>';
}

/** สรุปเส้นทางที่เหลือของวันนี้ ระยะรวมและเวลารวม */
function routeSummary() {
  const p = S.plan;
  const drvId = activeDriverId();
  const open = jobsOfDay(S.date, drvId).filter((j) => !CLOSED[j.status]);
  if (!open.length) return '';

  const noPin = open.filter((j) => !jobPoint(j)).length;

  if (!p || !p.total) {
    return '<div class="sec"><div class="card" style="padding:12px 13px">' +
      '<div style="display:flex;align-items:center;gap:9px">' +
      '<span class="spin" style="border-color:var(--line);border-top-color:var(--brand);width:16px;height:16px"></span>' +
      '<span class="muted" style="font-size:13px">กำลังคำนวณเส้นทาง...</span></div>' +
      (noPin ? '<div class="f-hint" style="color:var(--accent);margin-top:7px">มี ' + noPin +
        ' ร้านยังไม่ได้ปักหมุด จึงคิดเส้นทางให้ไม่ได้</div>' : '') +
      '</div></div>';
  }

  const next = p.firstJobId ? jobById(p.firstJobId) : null;
  const nextLeg = next ? legOf(next.id) : null;

  let h = '<div class="sec"><div class="card" style="padding:13px">';

  if (next && nextLeg) {
    h += '<div class="sec-t" style="margin-bottom:6px">ร้านถัดไป</div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:11px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;font-size:15.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            esc(next.storeName || '') + '</div>' +
          '<div class="muted" style="font-size:12.5px">' +
            Route.km(nextLeg.distance) + ' · ใช้เวลา ' + Route.mins(nextLeg.duration) +
            ' · ถึงประมาณ ' + Route.eta(nextLeg.duration) + ' น.</div>' +
        '</div>' +
        (jobPoint(next)
          ? '<a class="btn btn-sm btn-pri" href="' + esc(navUrl(jobPoint(next).lat, jobPoint(next).lng)) +
            '" target="_blank" rel="noopener">' + ICO.nav + ' นำทาง</a>'
          : '') +
      '</div>';
  }

  h += '<div class="pbar" style="margin-bottom:9px"><i class="pb-done" style="width:100%"></i></div>' +
    '<div style="display:flex;gap:14px;font-size:13px">' +
      '<div><span class="muted">ระยะที่เหลือ</span> <b>' + Route.km(p.total.distance) + '</b></div>' +
      '<div><span class="muted">เวลาขับรวม</span> <b>' + Route.mins(p.total.duration) + '</b></div>' +
    '</div>';

  if (p.estimated) {
    h += '<div class="f-hint" style="margin-top:7px">ตัวเลขนี้เป็นค่าประมาณ เพราะเรียกข้อมูลถนนไม่ได้ชั่วคราว</div>';
  }
  if (noPin) {
    h += '<div class="f-hint" style="color:var(--accent);margin-top:7px">ยังไม่ได้ปักหมุด ' + noPin +
      ' ร้าน จึงไม่ถูกนับในเส้นทาง</div>';
  }
  if (!p.fromMe) {
    h += '<div class="f-hint" style="margin-top:7px">ยังไม่ได้ตำแหน่งปัจจุบัน จึงเริ่มนับจากร้านแรกแทน</div>';
  }

  h += '</div></div>';
  return h;
}

/** ป้ายบอกว่าตอนนี้อยู่ขั้นที่เท่าไรของงาน */
function stepHint(n, text) {
  return '<div class="stephint"><span class="sn">' + n + '/4</span>' + esc(text) + '</div>';
}

function emptyBlock(ico, title, text, btn) {
  return '<div class="empty"><div class="eico">' + ico + '</div>' +
    '<h3>' + esc(title) + '</h3><p>' + text + '</p>' +
    (btn ? '<div style="margin-top:16px">' + btn + '</div>' : '') + '</div>';
}

/* ======================= หน้า: งานวันนี้ (คนขับ) ======================= */

Views.jobs = function () {
  const drv = driverById(S.myDriverId);
  const list = jobsOfDay(S.date, S.myDriverId);
  const open = list.filter((j) => !CLOSED[j.status]);
  const closed = list.filter((j) => CLOSED[j.status]);
  const p = progressOf(list);

  let h = '';

  h += '<div class="sec">' +
    '<div class="card" style="padding:13px">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;font-size:15.5px">' + esc(drv ? drv.name : 'ยังไม่เลือกคนขับ') + '</div>' +
          '<div class="muted" style="font-size:12.5px">' + esc(dateLabel(S.date)) + '</div>' +
        '</div>' +
        '<div class="right"><div style="font-size:21px;font-weight:700;line-height:1.1">' + p.done + '<span class="muted" style="font-size:14px">/' + p.total + '</span></div>' +
        '<div class="muted" style="font-size:11.5px">ปิดงานสำเร็จ</div></div>' +
      '</div>' +
      progressBar(p) +
    '</div></div>';

  if (!list.length) {
    h += emptyBlock('🚚', 'ยังไม่มีงานในวันนี้',
      'กดปุ่มส้มมุมล่างขวาเพื่อเพิ่มงาน<br>หรือสลับไปมุมมองออฟฟิศเพื่อจัดงานหลายรายการ');
  } else {
    h += routeSummary();

    if (open.length) {
      h += '<div class="sec"><div class="sec-h">' +
        '<span class="sec-t">ยังไม่ปิดงาน ' + open.length + ' ร้าน</span>' +
        (open.length > 1 ? '<button class="btn btn-sm" type="button" data-act="route-suggest">' + ICO.nav + ' จัดลำดับแนะนำ</button>' : '') +
        '</div>' +
        open.map((j) => jobCard(j, { reorder: open.length > 1 })).join('') +
        '</div>';
    }
    if (closed.length) {
      h += '<div class="sec"><div class="sec-h"><span class="sec-t">ปิดงานแล้ว ' + closed.length + ' ร้าน</span></div>' +
        closed.map((j) => jobCard(j, {})).join('') + '</div>';
    }
  }

  h += '<button class="fab" type="button" data-act="job-new">' + ICO.plus + ' เพิ่มงาน</button>';
  return h;
};

/* ======================= หน้า: จัดงาน (ออฟฟิศ) ======================= */

Views.assign = function () {
  const all = jobsOfDay(S.date, null);
  const unassigned = all.filter((j) => !j.driverId);
  let h = '';

  if (S.officeDriverId) {
    const drv = driverById(S.officeDriverId);
    const list = jobsOfDay(S.date, S.officeDriverId);
    const open = list.filter((j) => !CLOSED[j.status]);
    const closed = list.filter((j) => CLOSED[j.status]);
    const p = progressOf(list);

    h += '<div class="sec"><div class="card" style="padding:13px">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">' +
        '<div style="flex:1"><div style="font-weight:700;font-size:15.5px">' + esc(drv ? drv.name : '-') + '</div>' +
        '<div class="muted" style="font-size:12.5px">' + (drv && drv.vehicle ? esc(drv.vehicle) + ' · ' : '') + p.total + ' งาน</div></div>' +
        '<button class="btn btn-sm" type="button" data-act="driver-edit" data-id="' + esc(S.officeDriverId) + '">แก้ไข</button>' +
      '</div>' + progressBar(p) + '</div></div>';

    if (!list.length) {
      h += emptyBlock('📋', 'คนขับคนนี้ยังไม่มีงานวันนี้', 'กดปุ่มส้มมุมล่างขวาเพื่อสร้างงาน');
    } else {
      if (open.length) {
        h += '<div class="sec"><div class="sec-h"><span class="sec-t">ยังไม่ปิดงาน ' + open.length + '</span>' +
          (open.length > 1 ? '<button class="btn btn-sm" type="button" data-act="route-suggest">' + ICO.nav + ' จัดลำดับแนะนำ</button>' : '') +
          '</div>' + open.map((j) => jobCard(j, { reorder: open.length > 1 })).join('') + '</div>';
      }
      if (closed.length) {
        h += '<div class="sec"><div class="sec-h"><span class="sec-t">ปิดงานแล้ว ' + closed.length + '</span></div>' +
          closed.map((j) => jobCard(j, {})).join('') + '</div>';
      }
    }
  } else {
    // มุมมองรวมทุกคน
    const pAll = progressOf(all);
    h += '<div class="sec"><div class="tiles tiles-3">' +
      tile('งานทั้งวัน', all.length) +
      tile('สำเร็จ', pAll.done, '', 'ok') +
      tile('ไม่สำเร็จ', pAll.failed, '', pAll.failed ? 'bad' : '') +
      '</div></div>';

    if (unassigned.length) {
      h += '<div class="sec"><div class="sec-h"><span class="sec-t" style="color:var(--accent)">ยังไม่ได้มอบหมาย ' + unassigned.length + '</span></div>' +
        unassigned.map((j) => jobCard(j, {})).join('') + '</div>';
    }

    h += '<div class="sec"><div class="sec-h"><span class="sec-t">แยกตามคนขับ</span></div>';
    if (!S.drivers.length) {
      h += emptyBlock('👤', 'ยังไม่มีคนขับ', 'กด + เพิ่มคนขับ ที่แถบด้านบน');
    } else {
      S.drivers.forEach((d) => {
        const list = jobsOfDay(S.date, d.id);
        const p = progressOf(list);
        const plan = (S.plans || {})[d.id];
        h += '<button class="row" type="button" data-act="pick-driver" data-id="' + esc(d.id) + '">' +
          '<div class="row-ico" style="background:' + driverColor(d.id) + ';color:#fff">' +
          esc(initials(d.name)) + '</div>' +
          '<div class="row-main">' +
            '<div class="row-t">' + esc(d.name) + (d.vehicle ? ' <span class="muted" style="font-weight:400">· ' + esc(d.vehicle) + '</span>' : '') + '</div>' +
            '<div class="row-s">' + (list.length ? p.done + ' สำเร็จ · ' + p.failed + ' ไม่สำเร็จ · เหลือ ' + p.open : 'ไม่มีงานวันนี้') +
              (plan ? ' · ' + Route.km(plan.total.distance) + ' · ' + Route.mins(plan.total.duration) : '') + '</div>' +
            (list.length ? '<div style="margin-top:6px">' + progressBar(p) + '</div>' : '') +
          '</div>' +
          '<div class="row-x">' + ICO.chev + '</div></button>';
      });
    }
    h += '</div>';

    if (!all.length && !unassigned.length) {
      h += emptyBlock('📋', 'ยังไม่มีงานในวันนี้', 'กดปุ่มส้มมุมล่างขวาเพื่อสร้างงานแรก');
    }
  }

  h += '<button class="fab" type="button" data-act="job-new">' + ICO.plus + ' สร้างงาน</button>';
  return h;
};

/* ======================= หน้า: ร้านค้า ======================= */

Views.stores = function () {
  const q = String(S.search || '').trim().toLowerCase();
  let list = S.stores;
  if (q) {
    list = list.filter((s) =>
      String(s.name || '').toLowerCase().includes(q) ||
      String(s.code || '').toLowerCase().includes(q) ||
      String(s.address || '').toLowerCase().includes(q) ||
      String(s.phone || '').includes(q));
  }

  let h = '<div class="searchbar">' + ICO.search +
    '<input type="text" placeholder="ค้นหาชื่อร้าน รหัส ที่อยู่ เบอร์โทร" value="' + esc(S.search) + '" data-inp="store-search">' +
    (q ? '<button type="button" data-act="store-search-clear" aria-label="ล้าง">' + ICO.x + '</button>' : '') +
    '</div>';

  const noPin = S.stores.filter((s) => s.lat === undefined || s.lat === null).length;
  if (noPin && !q) {
    h += '<div class="note" style="margin-bottom:11px"><span class="ni">📍</span>' +
      '<div>มี ' + noPin + ' ร้านที่ยังไม่ได้ปักหมุด ร้านที่ไม่มีหมุดจะไม่ขึ้นบนแผนที่และคิดระยะทางให้ไม่ได้</div></div>';
  }

  if (!S.stores.length) {
    h += emptyBlock('🏪', 'ยังไม่มีร้านค้า',
      'เพิ่มร้านประจำไว้ครั้งเดียว แล้วเวลาสร้างงานจะเลือกจากรายการได้เลย<br>ไม่ต้องพิมพ์ที่อยู่ซ้ำทุกครั้ง');
  } else if (!list.length) {
    h += emptyBlock('🔍', 'ไม่พบร้านที่ค้นหา', 'ลองพิมพ์คำอื่น หรือกดปุ่มส้มเพื่อเพิ่มร้านใหม่');
  } else {
    h += '<div class="sec-h"><span class="sec-t">' + list.length + ' ร้าน</span></div>';
    h += list.map((s) => {
      const hasPin = s.lat !== undefined && s.lat !== null;
      const d = (S.pos && hasPin) ? distKm(S.pos, { lat: s.lat, lng: s.lng }) : null;
      const bits = [];
      if (s.code) bits.push(s.code);
      if (s.address) bits.push(s.address);
      if (!hasPin) bits.push('ยังไม่ปักหมุด');
      return '<button class="row' + (hasPin ? '' : ' row-warn') + '" type="button" data-act="store-open" data-id="' + esc(s.id) + '">' +
        '<div class="row-ico">' + (hasPin ? ICO.pin : '!') + '</div>' +
        '<div class="row-main"><div class="row-t">' + esc(s.name) + '</div>' +
        '<div class="row-s">' + esc(bits.join(' · ')) + '</div></div>' +
        (d !== null ? '<span class="chip nowrap">' + distLabel(d) + '</span>' : '') +
        '<div class="row-x">' + ICO.chev + '</div></button>';
    }).join('');
  }

  h += '<button class="fab" type="button" data-act="store-new">' + ICO.plus + ' เพิ่มร้าน</button>';
  return h;
};

/* ======================= สรุปยอดเงิน ======================= */

function moneySummary(list) {
  const r = { codCash: 0, codTransfer: 0, codCount: 0, cheques: [], cash: 0, transfer: 0 };
  list.forEach((j) => {
    if (j.status !== 'done') return;
    if (j.cod && j.cod.on) {
      const got = num(j.cod.received);
      r.codCount++;
      if ((j.cod.method || 'cash') === 'cash') r.codCash += got; else r.codTransfer += got;
    }
    if (j.type === 'cheque' && j.pay) {
      const m = j.pay.method || 'cheque';
      const a = num(j.pay.amount);
      if (m === 'cheque') r.cheques.push(j);
      else if (m === 'cash') r.cash += a;
      else r.transfer += a;
    }
  });
  return r;
}

/* ======================= หน้า: สรุป (คนขับ) ======================= */

Views.summary = function () {
  const list = jobsOfDay(S.date, S.myDriverId);
  const p = progressOf(list);
  const m = moneySummary(list);
  const failed = list.filter((j) => j.status === 'failed');
  const chequeTotal = m.cheques.reduce((s, j) => s + num(j.pay.amount), 0);

  let h = '<div class="sec"><div class="sec-h"><span class="sec-t">' + esc(dateLabel(S.date)) + '</span></div>' +
    '<div class="tiles">' +
      tile('งานทั้งหมด', p.total, 'ร้าน') +
      tile('ปิดสำเร็จ', p.done, 'ร้าน', 'ok') +
      tile('ไม่สำเร็จ', p.failed, 'ร้าน', p.failed ? 'bad' : '') +
      tile('ยังเหลือ', p.open, 'ร้าน', p.open ? 'warn' : '') +
    '</div></div>';

  h += '<div class="sec"><div class="sec-h"><span class="sec-t">เงินที่ต้องนำส่ง</span></div>' +
    '<div class="tiles">' +
      tile('เงินสดในมือ', money(m.codCash + m.cash), 'บาท', 'money') +
      tile('ยอดโอน', money(m.codTransfer + m.transfer), 'บาท') +
    '</div>' +
    '<div class="note info" style="margin-top:9px"><span class="ni">💵</span>' +
    '<div>เงินสดในมือคือยอดที่เก็บปลายทางและรับเป็นเงินสดรวมกับงานรับชำระที่ลูกค้าจ่ายสด ' +
    'นับจากงานที่ปิดสำเร็จแล้วเท่านั้น</div></div></div>';

  h += '<div class="sec"><div class="sec-h"><span class="sec-t">เช็คที่รับวันนี้</span></div>';
  if (!m.cheques.length) {
    h += '<div class="card" style="padding:15px"><span class="muted">ยังไม่มีเช็ครับเข้าวันนี้</span></div>';
  } else {
    h += '<div class="card" style="padding:13px;margin-bottom:9px">' +
      '<div class="tile-k">รวม ' + m.cheques.length + ' ฉบับ</div>' +
      '<div class="tile-v money">' + money(chequeTotal) + '<span class="tile-u">บาท</span></div></div>';
    h += m.cheques.map((j) => chequeRow(j)).join('');
  }
  h += '</div>';

  if (failed.length) {
    h += '<div class="sec"><div class="sec-h"><span class="sec-t">ปิดงานไม่สำเร็จวันนี้</span></div>' +
      failed.map((j) => failRow(j)).join('') + '</div>';
  }

  h += settingsBlock();
  return h;
};

function chequeRow(j) {
  const p = j.pay || {};
  const st = storeById(j.storeId);
  return '<button class="row" type="button" data-act="job-open" data-id="' + esc(j.id) + '">' +
    '<div class="row-ico" style="background:#ddf3f1;color:var(--t-cheque)">💰</div>' +
    '<div class="row-main"><div class="row-t">' + esc(j.storeName || (st && st.name) || '-') + '</div>' +
    '<div class="row-s">' + esc([p.chequeNo ? 'เลขที่ ' + p.chequeNo : '', p.bank, p.chequeDate ? 'ลง ' + thDate(p.chequeDate) : '']
      .filter(Boolean).join(' · ')) + '</div></div>' +
    '<span class="tnum" style="font-weight:700">' + money(p.amount) + '</span>' +
    '</button>';
}

function failRow(j) {
  const st = storeById(j.storeId);
  const f = j.fail || {};
  return '<button class="row" type="button" data-act="job-open" data-id="' + esc(j.id) + '">' +
    '<div class="row-ico" style="background:#fde8e8;color:var(--s-failed)">!</div>' +
    '<div class="row-main"><div class="row-t">' + esc(j.storeName || (st && st.name) || '-') + '</div>' +
    '<div class="row-s">' + esc(f.reason || 'ไม่ระบุสาเหตุ') +
    (j.rescheduledTo ? ' · เลื่อนไป ' + thDate(j.rescheduledTo) : ' · ไม่ได้นัดใหม่') + '</div></div>' +
    '<div class="row-x">' + ICO.chev + '</div></button>';
}

/* ======================= หน้า: รายงาน (ออฟฟิศ) ======================= */

Views.reports = function () {
  const all = jobsOfDay(S.date, null);
  const p = progressOf(all);
  const m = moneySummary(all);
  const chequeTotal = m.cheques.reduce((s, j) => s + num(j.pay.amount), 0);

  const allFailed = S.jobs.filter((j) => j.status === 'failed')
    .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 40);

  let h = '<div class="sec"><div class="sec-h"><span class="sec-t">ภาพรวม ' + esc(dateLabel(S.date)) + '</span></div>' +
    '<div class="tiles">' +
      tile('งานทั้งวัน', p.total, 'ร้าน') +
      tile('ปิดสำเร็จ', p.done, 'ร้าน', 'ok') +
      tile('ไม่สำเร็จ', p.failed, 'ร้าน', p.failed ? 'bad' : '') +
      tile('ยังเหลือ', p.open, 'ร้าน', p.open ? 'warn' : '') +
    '</div></div>';

  h += '<div class="sec"><div class="sec-h"><span class="sec-t">ผลงานรายคน</span></div>';
  if (!S.drivers.length) {
    h += '<div class="card" style="padding:15px"><span class="muted">ยังไม่มีคนขับ</span></div>';
  } else {
    S.drivers.forEach((d) => {
      const list = jobsOfDay(S.date, d.id);
      const pp = progressOf(list);
      const mm = moneySummary(list);
      h += '<div class="card" style="padding:12px 13px;margin-bottom:9px">' +
        '<div style="display:flex;align-items:center;gap:9px;margin-bottom:7px">' +
          '<div style="flex:1"><span style="font-weight:700">' + esc(d.name) + '</span>' +
          (d.vehicle ? ' <span class="muted" style="font-size:12.5px">' + esc(d.vehicle) + '</span>' : '') + '</div>' +
          '<span class="tnum" style="font-weight:700">' + pp.done + '/' + pp.total + '</span>' +
        '</div>' +
        progressBar(pp) +
        '<div class="muted" style="font-size:12.5px;margin-top:7px">' +
          'เงินสด ' + money(mm.codCash + mm.cash) + ' บาท · เช็ค ' + mm.cheques.length + ' ฉบับ' +
          (pp.failed ? ' · ไม่สำเร็จ ' + pp.failed : '') +
        '</div></div>';
    });
  }
  h += '</div>';

  h += '<div class="sec"><div class="sec-h"><span class="sec-t">การเงินวันนี้ (ทุกคน)</span></div>' +
    '<div class="tiles tiles-3">' +
      tile('เงินสด', money(m.codCash + m.cash), '฿', 'money') +
      tile('โอน', money(m.codTransfer + m.transfer), '฿') +
      tile('เช็ค', money(chequeTotal), '฿') +
    '</div>';
  if (m.cheques.length) {
    h += '<div style="margin-top:9px">' + m.cheques.map((j) => chequeRow(j)).join('') + '</div>';
  }
  h += '</div>';

  h += '<div class="sec"><div class="sec-h"><span class="sec-t">ประวัติปิดงานไม่สำเร็จ</span>' +
    (allFailed.length ? '<button class="btn btn-sm" type="button" data-act="export-failed">' + ICO.dl + ' CSV</button>' : '') +
    '</div>';
  if (!allFailed.length) {
    h += '<div class="card" style="padding:15px"><span class="muted">ยังไม่มีประวัติปิดงานไม่สำเร็จ</span></div>';
  } else {
    h += allFailed.map((j) => {
      const st = storeById(j.storeId);
      const f = j.fail || {};
      const drv = driverById(j.driverId);
      return '<button class="row" type="button" data-act="job-open" data-id="' + esc(j.id) + '">' +
        '<div class="row-ico" style="background:#fde8e8;color:var(--s-failed)">!</div>' +
        '<div class="row-main"><div class="row-t">' + esc(j.storeName || (st && st.name) || '-') +
        (j.round > 1 ? ' <span class="chip">รอบ ' + j.round + '</span>' : '') + '</div>' +
        '<div class="row-s">' + esc(thDate(j.date) + ' · ' + (f.reason || 'ไม่ระบุ') + (drv ? ' · ' + drv.name : '')) + '</div></div>' +
        '<div class="row-x">' + ICO.chev + '</div></button>';
    }).join('');
  }
  h += '</div>';

  h += '<div class="sec"><div class="sec-h"><span class="sec-t">ส่งออกข้อมูล</span></div>' +
    '<div class="btn-row" style="margin-bottom:8px">' +
    '<button class="btn" type="button" data-act="export-jobs">' + ICO.dl + ' งานวันนี้ CSV</button>' +
    '<button class="btn" type="button" data-act="export-cheques">' + ICO.dl + ' เช็ค CSV</button>' +
    '</div></div>';

  h += settingsBlock();
  return h;
};

/* ======================= หน้า: ตรวจงาน (ออฟฟิศ) ======================= */

Views.review = function () {
  const pending = jobsAwaitingReview();
  const recent = S.jobs.filter((j) => reviewOf(j) === 'passed' || j.reviewStatus === 'rejected')
    .sort((a, b) => String(b.reviewedAt || '').localeCompare(String(a.reviewedAt || '')))
    .slice(0, 15);

  let h = '';

  h += '<div class="sec"><div class="tiles tiles-3">' +
    tile('รอตรวจ', pending.length, 'งาน', pending.length ? 'warn' : '') +
    tile('ผ่านแล้ว', S.jobs.filter((j) => reviewOf(j) === 'passed').length, '', 'ok') +
    tile('ส่งกลับแก้', S.jobs.filter((j) => j.reviewStatus === 'rejected').length, '',
      S.jobs.filter((j) => j.reviewStatus === 'rejected').length ? 'bad' : '') +
    '</div></div>';

  h += '<div class="sec"><div class="sec-h"><span class="sec-t">รอตรวจ ' + pending.length + ' งาน</span></div>';
  if (!pending.length) {
    h += emptyBlock('✅', 'ตรวจครบแล้ว',
      'เมื่อคนขับปิดงาน งานจะเข้ามารอตรวจที่นี่อัตโนมัติ<br>กดเข้าไปดูรูปและรายละเอียด แล้วกดผ่านหรือส่งกลับแก้');
  } else {
    h += pending.map((j) => reviewRow(j, true)).join('');
  }
  h += '</div>';

  if (recent.length) {
    h += '<div class="sec"><div class="sec-h"><span class="sec-t">ตรวจไปแล้วล่าสุด</span></div>' +
      recent.map((j) => reviewRow(j, false)).join('') + '</div>';
  }

  return h;
};

function reviewRow(j, isPending) {
  const st = storeById(j.storeId);
  const drv = driverById(j.driverId);
  const t = TY[j.type] || TY.deliver;
  const rv = REV[reviewOf(j)] || REV.none;
  const nPhoto = (j.photos || []).length;
  const by = j.reviewedBy ? driverById(j.reviewedBy) : null;

  return '<button class="row" type="button" data-act="job-open" data-id="' + esc(j.id) + '">' +
    '<div class="row-ico" style="background:var(--line-2)">' + t.ico + '</div>' +
    '<div class="row-main">' +
      '<div class="row-t">' + esc(j.storeName || (st && st.name) || '-') + '</div>' +
      '<div class="row-s">' + esc(thDate(j.date) + ' · ' + (drv ? drv.name : 'ไม่ระบุคนขับ') +
        ' · ' + (ST[j.status] || {}).label) + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px">' +
        (isPending ? '' : '<span class="chip ' + rv.cls + '">' + rv.label + '</span>') +
        (nPhoto ? '<span class="chip">' + nPhoto + ' รูป</span>'
                : '<span class="chip st-failed">ไม่มีรูป</span>') +
        (j.cod && j.cod.on ? '<span class="chip ty-bill">เก็บเงิน ' + money(j.cod.received) + '</span>' : '') +
        (by && !isPending ? '<span class="chip">โดย ' + esc(by.name) + '</span>' : '') +
      '</div>' +
      (j.reviewNote && !isPending ? '<div class="row-s" style="margin-top:4px">"' + esc(j.reviewNote) + '"</div>' : '') +
    '</div>' +
    '<div class="row-x">' + ICO.chev + '</div></button>';
}

/* ======================= บล็อกตั้งค่า / สำรองข้อมูล ======================= */

function settingsBlock() {
  let h = '<div class="divider"></div><div class="sec">';

  if (S.cloud) {
    const role = S.me ? ({ driver: 'คนขับ', office: 'ออฟฟิศ / CS', admin: 'ผู้ดูแล' }[S.me.role] || S.me.role) : '';
    h += '<div class="sec-h"><span class="sec-t">บัญชีและระบบ</span></div>' +
      '<button class="row" type="button" data-act="users-open">' +
        '<div class="row-ico">' + esc(initials(S.me ? S.me.name : '?')) + '</div>' +
        '<div class="row-main"><div class="row-t">' + esc(S.me ? S.me.name : '') + '</div>' +
        '<div class="row-s">' + esc((S.me ? S.me.username : '') + ' · ' + role) + '</div></div>' +
        '<div class="row-x">' + ICO.chev + '</div></button>' +
      '<div class="note info" style="margin-top:9px"><span class="ni">☁️</span>' +
      '<div>ข้อมูลเก็บบนเซิร์ฟเวอร์กลาง สำรองอัตโนมัติ มือถือหายหรือเปลี่ยนเครื่อง ' +
      'ล็อกอินใหม่ก็ได้ข้อมูลครบเหมือนเดิม</div></div>';

    if (typeof LocalDB !== 'undefined') {
      h += '<button class="row" style="margin-top:9px" type="button" data-act="migrate">' +
        '<div class="row-ico">' + ICO.up + '</div>' +
        '<div class="row-main"><div class="row-t">ย้ายข้อมูลเดิมในเครื่องขึ้นเซิร์ฟเวอร์</div>' +
        '<div class="row-s">สำหรับข้อมูลที่คีย์ไว้ก่อนมีระบบล็อกอิน</div></div>' +
        '<div class="row-x">' + ICO.chev + '</div></button>';
    }

    h += '<div class="sec-h" style="margin-top:16px"><span class="sec-t">ส่งออก</span></div>' +
      '<div class="btn-row">' +
      '<button class="btn" type="button" data-act="export-jobs">' + ICO.dl + ' งานวันนี้</button>' +
      '<button class="btn" type="button" data-act="export-jobs-all">' + ICO.dl + ' ทั้งหมด</button>' +
      '</div>';
  } else {
    h += '<div class="sec-h"><span class="sec-t">ข้อมูลและการสำรอง</span></div>' +
      '<button class="row" type="button" data-act="backup-open">' +
        '<div class="row-ico">' + ICO.dl + '</div>' +
        '<div class="row-main"><div class="row-t">สำรองและกู้คืนข้อมูล</div>' +
        '<div class="row-s">บันทึกเป็นไฟล์เดียว เก็บไว้ใน Google Drive ได้</div></div>' +
        '<div class="row-x">' + ICO.chev + '</div></button>' +
      '<button class="row" type="button" data-act="settings-open">' +
        '<div class="row-ico">' + ICO.cog + '</div>' +
        '<div class="row-main"><div class="row-t">ตั้งค่าและคนขับ</div>' +
        '<div class="row-s">' + S.drivers.length + ' คนขับ · ' + S.stores.length + ' ร้าน · ' + S.jobs.length + ' งาน</div></div>' +
        '<div class="row-x">' + ICO.chev + '</div></button>';
  }

  return h + '</div>';
}

/* ======================= รายละเอียดงาน ======================= */

function jobDetailHtml(j) {
  const t = TY[j.type] || TY.deliver;
  const st = storeById(j.storeId);
  const drv = driverById(j.driverId);
  const name = j.storeName || (st && st.name) || 'ไม่ระบุร้าน';
  const hasPin = st && st.lat !== undefined && st.lat !== null;
  const d = (S.pos && hasPin) ? distKm(S.pos, { lat: st.lat, lng: st.lng }) : null;

  let h = sheetHead(name, (j.seq ? 'ลำดับที่ ' + j.seq + ' · ' : '') + t.label + ' · ' + thDate(j.date));

  h += '<div style="display:flex;gap:7px;flex-wrap:wrap;margin:-6px 0 13px">' +
    chipStatus(j.status) + chipType(j.type) +
    (drv ? '<span class="chip">' + esc(drv.name) + '</span>' : '<span class="chip st-pending">ยังไม่มอบหมาย</span>') +
    (j.round > 1 ? '<span class="chip st-failed">รอบที่ ' + j.round + '</span>' : '') +
    '</div>';

  /* ---- ติดต่อ / นำทาง ---- */
  const contactBits = [];
  if (st) {
    if (st.address) contactBits.push('<div class="dl-r"><div class="dl-k">ที่อยู่</div><div class="dl-v">' + esc(st.address) + '</div></div>');
    if (st.contactName) contactBits.push('<div class="dl-r"><div class="dl-k">ผู้ติดต่อ</div><div class="dl-v">' + esc(st.contactName) + '</div></div>');
    if (st.phone) contactBits.push('<div class="dl-r"><div class="dl-k">โทร</div><div class="dl-v">' + esc(st.phone) + '</div></div>');
    const hrs = hoursLabel(st);
    if (hrs) contactBits.push('<div class="dl-r"><div class="dl-k">เวลารับของ</div><div class="dl-v">' + esc(hrs) + '</div></div>');
    if (st.note) contactBits.push('<div class="dl-r"><div class="dl-k">หมายเหตุร้าน</div><div class="dl-v">' + esc(st.note) + '</div></div>');
    if (d !== null) contactBits.push('<div class="dl-r"><div class="dl-k">ห่างจากคุณ</div><div class="dl-v">' + distLabel(d) + '</div></div>');
  }
  if (contactBits.length) h += '<div class="dl">' + contactBits.join('') + '</div>';

  const row = [];
  if (st && st.phone) row.push('<a class="btn" href="' + esc(telUrl(st.phone)) + '">' + ICO.phone + ' โทร</a>');
  if (hasPin) row.push('<a class="btn btn-pri" href="' + esc(navUrl(st.lat, st.lng)) + '" target="_blank" rel="noopener">' + ICO.nav + ' นำทาง</a>');
  if (row.length) h += '<div class="btn-row" style="margin-bottom:13px">' + row.join('') + '</div>';
  if (st) {
    h += '<div class="note' + (hasPin ? ' info' : '') + '" style="margin-bottom:13px"><span class="ni">📍</span><div>' +
      (hasPin ? 'หมุดไม่ตรงหน้าร้าน? แก้ได้เลย' : 'ร้านนี้ยังไม่ได้ปักหมุด จึงนำทางให้ไม่ได้') +
      '<div class="btn-row" style="margin-top:8px">' +
      '<button class="btn btn-sm" type="button" data-act="pin-map-store" data-id="' + esc(st.id) + '" data-back="jobDetail:' + esc(j.id) + '">เลือกบนแผนที่</button>' +
      '<button class="btn btn-sm" type="button" data-act="store-pin-now" data-id="' + esc(st.id) + '">ใช้ตำแหน่งที่ยืนอยู่</button>' +
      '</div></div></div>';
  }

  /* ---- รายละเอียดตามประเภทงาน ---- */
  const editable = !CLOSED[j.status] || canSeeOffice();
  h += '<div class="sec-h"><span class="sec-t">รายละเอียดงาน</span>' +
    (editable ? '<button class="btn btn-sm" type="button" data-act="job-edit" data-id="' + esc(j.id) + '">แก้ไข</button>' : '') +
    '</div>';

  if (j.type === 'deliver') {
    const its = j.items || [];
    h += '<div class="dl">' +
      (j.billNo ? '<div class="dl-r"><div class="dl-k">เลขที่บิล</div><div class="dl-v mono">' + esc(j.billNo) + '</div></div>' : '') +
      (j.amount ? '<div class="dl-r"><div class="dl-k">ยอดบิล</div><div class="dl-v big tnum">' + money(j.amount) + ' ฿</div></div>' : '') +
      (j.cod && j.cod.on
        ? '<div class="dl-r"><div class="dl-k">เก็บเงินปลายทาง</div><div class="dl-v big tnum" style="color:var(--accent)">' + money(j.cod.expected) + ' ฿</div></div>' +
          (j.status === 'done'
            ? '<div class="dl-r"><div class="dl-k">รับจริง</div><div class="dl-v big tnum">' + money(j.cod.received) + ' ฿ <span class="chip">' + (PAY[j.cod.method] || PAY.cash).label + '</span></div></div>' +
              (num(j.cod.received) !== num(j.cod.expected)
                ? '<div class="dl-r"><div class="dl-k">ต่าง</div><div class="dl-v tnum" style="color:var(--s-failed)">' + money(num(j.cod.received) - num(j.cod.expected)) + ' ฿</div></div>' : '')
            : '')
        : '') +
      '</div>';
    if (its.length) {
      h += '<div class="dl">' + its.map((it) =>
        '<div class="dl-r"><div class="dl-k" style="width:auto;flex:1;color:var(--ink);font-size:14px;font-weight:500">' + esc(it.name) + '</div>' +
        '<div class="dl-v" style="flex:none;text-align:right">' + esc(it.qty) + ' ' + esc(it.unit || '') + '</div></div>').join('') + '</div>';
    }
  }

  if (j.type === 'bill') {
    const b = j.bill || {};
    h += '<div class="dl">' +
      (b.docNo ? '<div class="dl-r"><div class="dl-k">เลขที่ใบวางบิล</div><div class="dl-v mono">' + esc(b.docNo) + '</div></div>' : '') +
      ((b.billRefs || []).length ? '<div class="dl-r"><div class="dl-k">บิลที่วาง</div><div class="dl-v">' + esc(b.billRefs.join(', ')) + '</div></div>' : '') +
      (j.amount ? '<div class="dl-r"><div class="dl-k">ยอดรวม</div><div class="dl-v big tnum">' + money(j.amount) + ' ฿</div></div>' : '') +
      (b.appointmentDate ? '<div class="dl-r"><div class="dl-k">นัดรับเช็ค</div><div class="dl-v">' + thDate(b.appointmentDate) + '</div></div>' : '') +
      (billingLabel(st) ? '<div class="dl-r"><div class="dl-k">รอบวางบิล</div><div class="dl-v">' + esc(billingLabel(st)) +
        (billingNoteOf(st) ? '<br><span class="muted" style="font-size:12.5px">' + esc(billingNoteOf(st)) + '</span>' : '') + '</div></div>' : '') +
      '</div>';
    if (b.appointmentDate && j.status === 'done') {
      h += '<button class="btn btn-block" style="margin-bottom:13px" type="button" data-act="job-from-bill" data-id="' + esc(j.id) + '">' +
        ICO.plus + ' สร้างงานรับเช็ค วันที่ ' + thDate(b.appointmentDate) + '</button>';
    }
  }

  if (j.type === 'cheque') {
    const p = j.pay || {};
    h += '<div class="dl">' +
      '<div class="dl-r"><div class="dl-k">รับชำระเป็น</div><div class="dl-v">' + (PAY[p.method] || PAY.cheque).label + '</div></div>' +
      (p.method === 'cheque' || !p.method
        ? (p.chequeNo ? '<div class="dl-r"><div class="dl-k">เลขที่เช็ค</div><div class="dl-v mono">' + esc(p.chequeNo) + '</div></div>' : '') +
          (p.bank ? '<div class="dl-r"><div class="dl-k">ธนาคาร</div><div class="dl-v">' + esc(p.bank) + '</div></div>' : '') +
          (p.chequeDate ? '<div class="dl-r"><div class="dl-k">วันที่ลงเช็ค</div><div class="dl-v">' + thDate(p.chequeDate) + '</div></div>' : '')
        : '') +
      (p.amount ? '<div class="dl-r"><div class="dl-k">ยอดเงิน</div><div class="dl-v big tnum">' + money(p.amount) + ' ฿</div></div>' : '') +
      ((p.billRefs || []).length ? '<div class="dl-r"><div class="dl-k">ตัดบิล</div><div class="dl-v">' + esc(p.billRefs.join(', ')) + '</div></div>' : '') +
      '</div>';
  }

  if (j.note) {
    h += '<div class="note info" style="margin-bottom:13px"><span class="ni">📝</span><div>' + esc(j.note) + '</div></div>';
  }

  const pendTr = (S.transfers || []).find((t) => t.jobId === j.id);
  if (pendTr) {
    const from = driverById(pendTr.fromDriver);
    const to = driverById(pendTr.toDriver);
    const forMe = pendTr.toDriver === S.myDriverId;
    h += '<div class="note" style="margin-bottom:13px"><span class="ni">⏳</span><div>' +
      '<b>มีคำขอย้ายงานค้างอยู่</b><br>' +
      esc(from ? from.name : '?') + ' → ' + esc(to ? to.name : '?') +
      (pendTr.note ? '<br>"' + esc(pendTr.note) + '"' : '') +
      ((forMe || canSeeOffice())
        ? '<div class="btn-row" style="margin-top:9px">' +
          '<button class="btn btn-sm btn-pri" type="button" data-act="tr-approve" data-id="' + esc(pendTr.id) + '">' +
          (forMe ? 'รับงาน' : 'อนุมัติ') + '</button>' +
          '<button class="btn btn-sm btn-danger" type="button" data-act="tr-reject" data-id="' + esc(pendTr.id) + '">ไม่รับ</button>' +
          '</div>'
        : '<br><span class="muted">รออีกฝ่ายกดรับ หรือหัวหน้าอนุมัติ</span>') +
      '</div></div>';
  }

  /* ---- การตรวจงาน ---- */
  const rvState = reviewOf(j);
  if (rvState !== 'none') {
    const rv = REV[rvState] || REV.none;
    const by = j.reviewedBy ? driverById(j.reviewedBy) : null;

    if (rvState === 'pending') {
      if (canSeeOffice()) {
        h += '<div class="card" style="padding:13px;margin-bottom:13px;border:2px solid var(--s-enroute)">' +
          '<div style="font-weight:700;font-size:15px;margin-bottom:3px">งานนี้รอคุณตรวจ</div>' +
          '<div class="muted" style="font-size:13px;margin-bottom:11px">' +
          'ดูรูปและรายละเอียดด้านบน แล้วตัดสินว่าผ่านหรือต้องแก้</div>' +
          '<div class="btn-row">' +
          '<button class="btn btn-pri" type="button" data-act="rev-pass" data-id="' + esc(j.id) + '">' +
          ICO.check + ' ผ่าน</button>' +
          '<button class="btn btn-danger" type="button" data-act="rev-reject" data-id="' + esc(j.id) + '">' +
          ICO.x + ' ส่งกลับแก้</button>' +
          '</div></div>';
      } else {
        h += '<div class="note" style="margin-bottom:13px"><span class="ni">⏳</span>' +
          '<div><b>ส่งงานแล้ว รอหัวหน้าตรวจ</b><br>ถ้าตรวจไม่ผ่าน งานจะกลับมาให้คุณแก้อีกครั้ง</div></div>';
      }
    } else {
      h += '<div class="note' + (rvState === 'passed' ? ' info' : '') + '" style="margin-bottom:13px">' +
        '<span class="ni">' + (rvState === 'passed' ? '✅' : '↩️') + '</span><div>' +
        '<b>' + rv.label + '</b>' + (by ? ' โดย ' + esc(by.name) : '') +
        (j.reviewedAt ? ' · ' + thDate(j.reviewedAt.slice(0, 10)) + ' ' + clockOf(j.reviewedAt) : '') +
        (j.reviewNote ? '<br>"' + esc(j.reviewNote) + '"' : '') +
        '</div></div>';
    }
  }

  if (j.closedWithoutPhoto) {
    h += '<div class="note" style="margin-bottom:13px"><span class="ni">📷</span>' +
      '<div><b>งานนี้ปิดโดยไม่มีรูป</b> ออฟฟิศเป็นผู้อนุมัติให้ข้ามขั้นถ่ายรูป</div></div>';
  }

  /* ---- ปิดงานไม่สำเร็จ ---- */
  if (j.status === 'failed') {
    const f = j.fail || {};
    h += '<div class="note" style="margin-bottom:13px"><span class="ni">⚠️</span><div>' +
      '<b>ปิดงานไม่สำเร็จ</b> · ' + esc(f.reason || 'ไม่ระบุสาเหตุ') +
      (f.note ? '<br>' + esc(f.note) : '') +
      (j.rescheduledTo
        ? '<br>นัดใหม่ ' + thDate(j.rescheduledTo) + (j.childJobId ? ' (สร้างงานรอบใหม่แล้ว)' : '')
        : '<br>ยังไม่ได้นัดวันใหม่') +
      '</div></div>';
    if (j.childJobId && jobById(j.childJobId)) {
      h += '<button class="btn btn-block" style="margin-bottom:13px" type="button" data-act="job-open" data-id="' + esc(j.childJobId) + '">' +
        'ดูงานรอบใหม่ ' + ICO.chev + '</button>';
    }
  }
  if (j.parentJobId && jobById(j.parentJobId)) {
    h += '<button class="btn btn-block btn-ghost" style="margin-bottom:13px" type="button" data-act="job-open" data-id="' + esc(j.parentJobId) + '">' +
      'ดูงานรอบก่อน (' + thDate(jobById(j.parentJobId).date) + ')</button>';
  }

  /* ---- รูปถ่าย ---- */
  h += '<div class="sec-h"><span class="sec-t">รูปถ่าย ' + ((j.photos || []).length || '') + '</span></div>' +
    '<div class="ph-grid" id="phGrid" style="margin-bottom:9px">' +
    '<button class="ph-add" type="button" data-act="photo-add" data-id="' + esc(j.id) + '">' +
    ICO.cam + '<span>ถ่ายรูป</span></button></div>' +
    '<button class="btn btn-sm btn-ghost" style="margin-bottom:14px" type="button" data-act="photo-pick" data-id="' + esc(j.id) + '">' +
    'เลือกรูปจากคลังภาพแทน</button>';

  /* ---- ไทม์ไลน์ ---- */
  const ev = (j.events || []).slice().reverse();
  if (ev.length) {
    h += '<div class="sec-h"><span class="sec-t">ประวัติงานนี้</span></div><div class="tl">' +
      ev.map((e) => {
        const s = ST[e.st] || {};
        return '<div class="tl-i' + (e.st === 'done' ? ' ok' : '') + (e.st === 'failed' ? ' bad' : '') + '">' +
          '<div class="tl-t">' + esc(s.label || e.st) + '</div>' +
          '<div class="tl-s">' + clockOf(e.at) + (e.lat ? ' · บันทึกพิกัดแล้ว' : ' · ไม่มีพิกัด') + '</div></div>';
      }).join('') + '</div>';
  }

  /* ---- ปุ่มดำเนินการ ตามลำดับขั้น ---- */
  const nPhoto = (j.photos || []).length;
  h += '<div class="actions">';

  if (j.status === 'pending' || j.status === 'assigned') {
    h += stepHint(1, 'เริ่มเดินทางไปร้าน') +
      '<button class="btn btn-pri btn-block" type="button" data-act="job-st" data-id="' + esc(j.id) + '" data-st="enroute">' +
      ICO.truck + ' เริ่มเดินทาง</button>';
  }

  if (j.status === 'enroute') {
    h += stepHint(2, 'ถึงหน้าร้านแล้วกดยืนยัน') +
      '<button class="btn btn-pri btn-block" type="button" data-act="job-st" data-id="' + esc(j.id) + '" data-st="arrived">' +
      ICO.pin + ' ถึงร้านแล้ว</button>';
  }

  if (j.status === 'arrived') {
    if (!nPhoto) {
      /* ยังไม่ถ่ายรูป ปิดงานไม่ได้ */
      h += stepHint(3, 'ถ่ายรูปก่อน แล้วจึงปิดงานได้') +
        '<button class="btn btn-acc btn-block" type="button" data-act="photo-add" data-id="' + esc(j.id) + '">' +
        ICO.cam + ' ถ่ายรูปหน้างาน</button>' +
        '<button class="btn btn-ghost btn-block" type="button" data-act="photo-pick" data-id="' + esc(j.id) + '">' +
        'เลือกรูปจากคลังภาพ</button>' +
        '<div class="note" style="margin-top:4px"><span class="ni">📷</span>' +
        '<div>ต้องมีรูปอย่างน้อย 1 รูปก่อนปิดงาน ทั้งกรณีส่งสำเร็จและส่งไม่สำเร็จ</div></div>';
      if (canSeeOffice()) {
        h += '<button class="btn btn-ghost btn-block" style="margin-top:4px" type="button" ' +
          'data-act="close-nophoto" data-id="' + esc(j.id) + '">' +
          'ปิดงานโดยไม่มีรูป (สิทธิ์ออฟฟิศ)</button>';
      }
    } else {
      h += stepHint(4, 'แนบรูปแล้ว ' + nPhoto + ' รูป ปิดงานได้') +
        '<button class="btn btn-acc btn-block" type="button" data-act="close-ok" data-id="' + esc(j.id) + '">' +
        ICO.check + ' ปิดงานสำเร็จ</button>' +
        '<button class="btn btn-danger btn-block" type="button" data-act="close-fail" data-id="' + esc(j.id) + '">' +
        ICO.x + ' ปิดงานไม่สำเร็จ</button>';
    }
  }

  if (CLOSED[j.status]) {
    h += canSeeOffice()
      ? '<button class="btn btn-block" type="button" data-act="job-reopen" data-id="' + esc(j.id) + '">ย้อนสถานะกลับเป็นถึงร้าน</button>'
      : '<div class="note info"><span class="ni">🔒</span><div>งานนี้ปิดแล้ว ' +
        'แก้ไขได้เฉพาะหัวหน้างานหรือผู้ดูแลระบบ ถ้าบันทึกผิดให้แจ้งหัวหน้า</div></div>';
  }
  if (editable) {
    h += '<div class="btn-row">' +
      '<button class="btn btn-ghost" type="button" data-act="job-move" data-id="' + esc(j.id) + '">' +
        (S.cloud && !canSeeOffice() ? 'ขอย้ายงาน' : 'ย้ายคนขับ / วัน') + '</button>' +
      (canSeeOffice() ? '<button class="btn btn-danger" type="button" data-act="job-del" data-id="' + esc(j.id) + '">ลบงาน</button>' : '') +
      '</div>';
  }
  h += '</div>';

  return h;
}

async function openJob(id) {
  const j = jobById(id);
  if (!j) { toast('ไม่พบงานนี้', 'bad'); return; }
  openSheet(jobDetailHtml(j), () => renderPhotos(j));
}

/** วาดรูปถ่ายของงานลงใน grid (ต้องโหลด blob แบบ async) */
async function renderPhotos(j) {
  const grid = document.getElementById('phGrid');
  if (!grid) return;
  const ids = j.photos || [];
  const addBtn = grid.querySelector('.ph-add');
  for (const pid of ids) {
    const url = await DB.photos.url(pid);
    if (!url) continue;
    const div = document.createElement('div');
    div.className = 'ph';
    div.innerHTML = '<img src="' + url + '" alt="รูปถ่ายงาน" data-act="photo-view" data-url="' + url + '">' +
      '<button class="ph-x" type="button" data-act="photo-del" data-jid="' + esc(j.id) + '" data-pid="' + esc(pid) + '" aria-label="ลบรูป">' +
      '<svg viewBox="0 0 20 20" width="12" height="12"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>';
    grid.insertBefore(div, addBtn);
  }
}

ACT['job-open'] = (el) => {
  const j = jobById(el.dataset.id);
  if (j && !canOpenJob(j)) { ACT['job-locked'](); return; }
  if (sheetOpen()) closeSheet(true);
  openJob(el.dataset.id);
};

ACT['job-locked'] = () => {
  toast('งานนี้ปิดแล้ว ดูรายละเอียดและแก้ไขได้เฉพาะหัวหน้างานกับผู้ดูแลระบบ', 'bad', 4200);
};
ACT['photo-view'] = (el) => {
  const d = document.createElement('div');
  d.id = 'photoViewer';
  d.innerHTML = '<img src="' + el.dataset.url + '" alt="รูปถ่าย">' +
    '<button class="pv-x" type="button">' + ICO.x + '</button>';
  d.addEventListener('click', () => d.remove());
  document.body.appendChild(d);
};
