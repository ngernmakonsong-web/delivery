/* ===========================================================
   forms.js — ฟอร์มสร้าง/แก้ไข ปิดงาน รูปถ่าย สำรองข้อมูล ส่งออก
   =========================================================== */
'use strict';

/* ======================= ตัวช่วยฟอร์ม ======================= */

function val(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}
function checked(id) {
  const el = document.getElementById(id);
  return !!(el && el.checked);
}
function setErr(msg) {
  const el = document.getElementById('formErr');
  if (el) { el.textContent = msg || ''; el.style.display = msg ? 'block' : 'none'; }
}

function confirmSheet(title, text, okLabel, danger, onOk) {
  openSheet(
    sheetHead(title) +
    '<p style="margin:-8px 0 16px;font-size:14.5px;line-height:1.65">' + text + '</p>' +
    '<div class="btn-row">' +
    '<button class="btn btn-ghost" type="button" data-act="sheet-back">ยกเลิก</button>' +
    '<button class="btn ' + (danger ? 'btn-danger' : 'btn-pri') + '" type="button" id="cfmOk">' + esc(okLabel) + '</button>' +
    '</div>',
    (body) => {
      body.querySelector('#cfmOk').addEventListener('click', async () => {
        closeSheet();
        await onOk();
      });
    }
  );
}

function selectOpts(list, sel, keyF, labF) {
  return list.map((o) => {
    const k = keyF(o);
    return '<option value="' + esc(k) + '"' + (k === sel ? ' selected' : '') + '>' + esc(labF(o)) + '</option>';
  }).join('');
}

function dateInput(id, label, value, hint) {
  return '<div class="f"><label for="' + id + '">' + esc(label) + '</label>' +
    '<input type="date" id="' + id + '" value="' + esc(value || '') + '">' +
    (hint ? '<div class="f-hint">' + hint + '</div>' : '') + '</div>';
}

/* ======================= ฟอร์มงาน ======================= */

function itemRow(it) {
  it = it || { name: '', qty: '', unit: 'ชิ้น' };
  return '<div class="item">' +
    '<input type="text" class="it-name" placeholder="ชื่อสินค้า" value="' + esc(it.name) + '">' +
    '<input type="number" class="it-qty" inputmode="decimal" placeholder="จำนวน" value="' + esc(it.qty) + '">' +
    '<input type="text" class="it-unit" list="unitList" placeholder="หน่วย" value="' + esc(it.unit || '') + '">' +
    '<button class="rm" type="button" data-act="item-rm" aria-label="ลบรายการ">' + ICO.x + '</button>' +
    '</div>';
}

function jobFormHtml(j, presetDate) {
  const isNew = !j || !j.id;
  j = j || {};
  const ty = j.type || 'deliver';
  const cod = j.cod || {};
  const bill = j.bill || {};
  const pay = j.pay || {};
  const items = (j.items && j.items.length) ? j.items : [{ name: '', qty: '', unit: 'ชิ้น' }];
  const date = j.date || presetDate || S.date;
  const driverId = j.driverId !== undefined ? j.driverId : (activeDriverId() || (S.drivers[0] && S.drivers[0].id) || '');

  let h = sheetHead(isNew ? 'สร้างงานใหม่' : 'แก้ไขงาน', isNew ? '' : (j.storeName || ''));

  h += '<datalist id="unitList">' + UNITS.map((u) => '<option value="' + u + '">').join('') + '</datalist>';

  h += '<div class="f"><div class="f-lab">ประเภทงาน</div><div class="seg" id="tySeg">' +
    Object.keys(TY).map((k) =>
      '<button type="button" class="' + (k === ty ? 'on' : '') + '" data-act="ty-pick" data-k="' + k + '">' +
      TY[k].ico + ' ' + TY[k].label + '</button>').join('') +
    '</div><input type="hidden" id="jType" value="' + ty + '"></div>';

  /* ร้านค้า: คีย์รหัสลูกค้าเพื่อดึงข้อมูลเก่า หรือเลือกจากรายการ */
  if (!S.stores.length) {
    h += '<div class="f"><div class="f-lab">ร้านค้า</div>' +
      '<div class="note" style="margin-bottom:0"><span class="ni">🏪</span><div>ยังไม่มีร้านในระบบ ' +
      '<button class="btn btn-sm" style="margin-top:7px" type="button" data-act="store-new-inline">เพิ่มร้านก่อน</button></div></div>' +
      '<input type="hidden" id="jStore" value=""></div>';
  } else {
    const cur = j.storeId ? storeById(j.storeId) : null;
    h += '<div class="f"><label for="jCode">รหัสลูกค้า <span class="opt">(คีย์รหัสแล้วดึงข้อมูลเก่ามาให้)</span></label>' +
      '<div class="codebar">' +
        '<input type="text" id="jCode" placeholder="เช่น C001" value="' + esc((cur && cur.code) || '') + '">' +
        '<button class="btn" type="button" data-act="code-find">' + ICO.search + ' ค้นหา</button>' +
      '</div></div>';

    h += '<div class="f"><label for="jStore">ร้านค้า <span style="color:var(--s-failed)">*</span></label>' +
      '<select id="jStore" data-chg="store-chosen"><option value="">— เลือกร้าน —</option>' +
      selectOpts(S.stores, j.storeId || '', (s) => s.id, (s) => (s.code ? s.code + ' · ' : '') + s.name) +
      '</select>' +
      '<div class="f-hint">ไม่มีร้านที่ต้องการ? <button class="btn btn-sm" type="button" data-act="store-new-inline">เพิ่มร้านใหม่</button></div>' +
      '<div id="storePanel">' + (j.storeId ? storePanelHtml(j.storeId, ty) : '') + '</div>' +
      '</div>';
  }

  /* คนขับ + วันที่ — ต้องระบุคนขับเสมอ */
  h += '<div class="f-2" style="margin-bottom:12px">' +
    '<div class="f"><label for="jDriver">คนขับ <span style="color:var(--s-failed)">*</span></label><select id="jDriver">' +
    (driverId ? '' : '<option value="">— เลือกคนขับ —</option>') +
    selectOpts(S.drivers, driverId, (d) => d.id, (d) => d.name + (d.vehicle ? ' · ' + d.vehicle : '')) + '</select></div>' +
    '<div class="f"><label for="jDate">วันที่</label><input type="date" id="jDate" value="' + esc(date) + '"></div>' +
    '</div>';

  /* ---- ส่งสินค้า ---- */
  h += '<div id="blk-deliver" class="ty-blk"' + (ty !== 'deliver' ? ' style="display:none"' : '') + '>' +
    '<div class="f-2" style="margin-bottom:12px">' +
      '<div class="f"><label for="jBillNo">เลขที่บิล / ใบส่งของ</label><input type="text" id="jBillNo" inputmode="text" value="' + esc(j.billNo || '') + '"></div>' +
      '<div class="f"><label for="jAmount">ยอดบิล (บาท)</label><input type="number" id="jAmount" inputmode="decimal" step="0.01" value="' + esc(j.amount || '') + '"></div>' +
    '</div>' +
    '<div class="f"><div class="f-lab">รายการสินค้า <span class="opt">(ไม่ใส่ก็ได้)</span></div>' +
      '<div class="item-h"><span>ชื่อสินค้า</span><span>จำนวน</span><span>หน่วย</span><span></span></div>' +
      '<div class="items" id="itemList">' + items.map(itemRow).join('') + '</div>' +
      '<button class="btn btn-sm btn-ghost" style="margin-top:7px" type="button" data-act="item-add">' + ICO.plus + ' เพิ่มรายการ</button>' +
    '</div>' +
    '<label class="check" style="margin-bottom:10px">' +
      '<input type="checkbox" id="jCod" ' + (cod.on ? 'checked' : '') + ' data-chg="cod-toggle">' +
      '<span>เก็บเงินปลายทาง</span></label>' +
    '<div class="f" id="codBox"' + (cod.on ? '' : ' style="display:none"') + '>' +
      '<label for="jCodAmt">ยอดที่ต้องเก็บ (บาท)</label>' +
      '<input type="number" id="jCodAmt" inputmode="decimal" step="0.01" value="' + esc(cod.expected || '') + '">' +
      '<div class="f-hint">ยอดที่รับจริงจะกรอกตอนปิดงาน</div></div>' +
    '</div>';

  /* ---- วางบิล ---- */
  h += '<div id="blk-bill" class="ty-blk"' + (ty !== 'bill' ? ' style="display:none"' : '') + '>' +
    '<div class="f-2" style="margin-bottom:12px">' +
      '<div class="f"><label for="jDocNo">เลขที่ใบวางบิล</label><input type="text" id="jDocNo" value="' + esc(bill.docNo || '') + '"></div>' +
      '<div class="f"><label for="jBillAmt">ยอดรวม (บาท)</label><input type="number" id="jBillAmt" inputmode="decimal" step="0.01" value="' + esc(j.amount || '') + '"></div>' +
    '</div>' +
    '<div class="f"><label for="jBillRefs">บิลที่วาง</label>' +
      '<input type="text" id="jBillRefs" value="' + esc((bill.billRefs || []).join(', ')) + '" placeholder="เช่น INV-001, INV-002">' +
      '<div class="f-hint">หลายบิลให้คั่นด้วยเครื่องหมายจุลภาค</div></div>' +
    dateInput('jAppt', 'วันนัดรับเช็ค', bill.appointmentDate, 'ใส่ไว้แล้วตอนปิดงานจะมีปุ่มสร้างงานรับเช็คให้ทันที') +
    '</div>';

  /* ---- รับเช็ค ---- */
  h += '<div id="blk-cheque" class="ty-blk"' + (ty !== 'cheque' ? ' style="display:none"' : '') + '>' +
    '<div class="f"><div class="f-lab">ลูกค้าชำระเป็น</div><div class="seg" id="paySeg">' +
      Object.keys(PAY).map((k) =>
        '<button type="button" class="' + ((pay.method || 'cheque') === k ? 'on' : '') + '" data-act="pay-pick" data-k="' + k + '">' +
        PAY[k].label + '</button>').join('') +
      '</div><input type="hidden" id="jPayMethod" value="' + esc(pay.method || 'cheque') + '">' +
      '<div class="f-hint">ตั้งไว้เป็นเช็คก่อนได้ ถ้าหน้างานลูกค้าจ่ายสดหรือโอน กดเปลี่ยนตอนปิดงานได้เลย</div></div>' +
    '<div id="chqBox"' + ((pay.method || 'cheque') === 'cheque' ? '' : ' style="display:none"') + '>' +
      '<div class="f-2" style="margin-bottom:12px">' +
        '<div class="f"><label for="jChqNo">เลขที่เช็ค</label><input type="text" id="jChqNo" inputmode="numeric" value="' + esc(pay.chequeNo || '') + '"></div>' +
        '<div class="f"><label for="jBank">ธนาคาร</label><input type="text" id="jBank" value="' + esc(pay.bank || '') + '"></div>' +
      '</div>' +
      dateInput('jChqDate', 'วันที่ลงเช็ค', pay.chequeDate) +
    '</div>' +
    '<div class="f"><label for="jPayAmt">ยอดเงิน (บาท)</label>' +
      '<input type="number" id="jPayAmt" inputmode="decimal" step="0.01" value="' + esc(pay.amount || '') + '"></div>' +
    '<div class="f"><label for="jPayRefs">ตัดบิลเลขที่</label>' +
      '<input type="text" id="jPayRefs" value="' + esc((pay.billRefs || []).join(', ')) + '" placeholder="เช่น INV-001, INV-002"></div>' +
    '</div>';

  h += '<div class="f"><label for="jNote">หมายเหตุ <span class="opt">(ไม่ใส่ก็ได้)</span></label>' +
    '<textarea id="jNote" placeholder="เช่น ให้โทรก่อนถึง 15 นาที / จอดรถหลังร้าน">' + esc(j.note || '') + '</textarea></div>';

  h += '<div class="f-err" id="formErr" style="display:none"></div>';

  h += '<button class="btn btn-pri btn-block" type="button" data-act="job-save" data-id="' + esc(j.id || '') + '">' +
    (isNew ? 'สร้างงาน' : 'บันทึกการแก้ไข') + '</button>';

  if (!isNew) {
    h += '<button class="btn btn-ghost btn-block" style="margin-top:8px" type="button" data-act="sheet-back">ยกเลิก</button>';
  }

  return h;
}

/* ======================= แผงข้อมูลร้าน + ประวัติเก่า ======================= */

/** แผงที่โผล่ใต้ช่องเลือกร้าน แสดงข้อมูลร้านที่บันทึกไว้และประวัติงานเก่า */
function storePanelHtml(storeId, jobType) {
  const s = storeById(storeId);
  if (!s) return '';
  const hasPin = s.lat !== undefined && s.lat !== null;
  const hrs = hoursLabel(s);
  const bil = billingLabel(s);
  const bnote = billingNoteOf(s);

  const hist = S.jobs.filter((x) => x.storeId === storeId && CLOSED[x.status])
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  // งานล่าสุดของประเภทเดียวกันที่ "มีข้อมูลให้ดึงจริง" ไม่ใช่งานเปล่า
  const lastSame = S.jobs.filter((x) =>
    x.storeId === storeId && x.type === jobType &&
    (((x.items || []).length) || num(x.amount) || (x.pay && x.pay.bank) ||
     ((x.bill && (x.bill.billRefs || []).length))))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];

  let h = '<div class="infopanel">';
  h += '<div class="ip-t">' + esc(s.name) + (s.code ? ' <span style="font-weight:500;opacity:.7">· ' + esc(s.code) + '</span>' : '') + '</div>';
  if (s.address) h += '<div class="ip-r">' + esc(s.address) + '</div>';
  const line2 = [];
  if (s.contactName) line2.push(esc(s.contactName));
  if (s.phone) line2.push(esc(s.phone));
  if (line2.length) h += '<div class="ip-r">' + line2.join(' · ') + '</div>';
  if (hrs) h += '<div class="ip-r">รับของ ' + esc(hrs) + '</div>';
  if (bil) h += '<div class="ip-r">วางบิล ' + esc(bil) + (bnote ? ' · ' + esc(bnote) : '') + '</div>';
  else if (bnote) h += '<div class="ip-r">วางบิล ' + esc(bnote) + '</div>';
  if (s.note) h += '<div class="ip-r">' + esc(s.note) + '</div>';
  h += '<div class="' + (hasPin ? 'ip-r' : 'ip-warn') + '">' +
    (hasPin ? '📍 ปักหมุดแล้ว' : '📍 ยังไม่ได้ปักหมุด นำทางไม่ได้') + '</div>';

  if (hist.length) {
    h += '<div class="ip-hist"><div class="ip-h">ประวัติล่าสุด ' + hist.length + ' ครั้ง</div>' +
      hist.slice(0, 3).map((x) => {
        const t = TY[x.type] || TY.deliver;
        const ok = x.status === 'done';
        return '<div class="ip-j"><span>' + thDate(x.date) + '</span>' +
          '<b>' + t.label + '</b>' +
          '<span>' + (ok ? '✓ สำเร็จ' : '✗ ' + ((x.fail && x.fail.reason) || 'ไม่สำเร็จ')) + '</span></div>';
      }).join('') + '</div>';
  }

  h += '<div class="ip-btns">';
  if (lastSame) {
    h += '<button class="btn" type="button" data-act="use-last" data-id="' + esc(lastSame.id) + '">' +
      'ใช้ข้อมูลจาก ' + thDate(lastSame.date) + '</button>';
  }
  h += '<button class="btn" type="button" data-act="pin-map-store" data-id="' + esc(s.id) + '" data-back="job">' +
    (hasPin ? 'แก้หมุด' : 'ปักหมุด') + '</button>';
  h += '<button class="btn" type="button" data-act="store-edit-inline" data-id="' + esc(s.id) + '">แก้ข้อมูลร้าน</button>';
  h += '</div></div>';
  return h;
}

function refreshStorePanel() {
  const box = document.getElementById('storePanel');
  const sel = document.getElementById('jStore');
  if (!box || !sel) return;
  box.innerHTML = sel.value ? storePanelHtml(sel.value, val('jType') || 'deliver') : '';
}

ACT['store-chosen'] = () => {
  refreshStorePanel();
  const sel = document.getElementById('jStore');
  const s = sel && sel.value ? storeById(sel.value) : null;
  const code = document.getElementById('jCode');
  if (code && s) code.value = s.code || '';
  setErr('');
};

ACT['code-find'] = () => {
  const q = val('jCode').trim().toLowerCase();
  if (!q) { setErr('ยังไม่ได้พิมพ์รหัสลูกค้า'); return; }
  let hit = S.stores.find((s) => String(s.code || '').trim().toLowerCase() === q);
  if (!hit) hit = S.stores.find((s) => String(s.code || '').trim().toLowerCase().indexOf(q) === 0);
  if (!hit) hit = S.stores.find((s) => String(s.name || '').toLowerCase().indexOf(q) > -1);
  if (!hit) {
    setErr('ไม่พบรหัส "' + val('jCode') + '" ในระบบ ตรวจรหัสอีกครั้ง หรือกดเพิ่มร้านใหม่ด้านล่าง');
    const box = document.getElementById('storePanel');
    if (box) box.innerHTML = '';
    return;
  }
  setErr('');
  const sel = document.getElementById('jStore');
  sel.value = hit.id;
  document.getElementById('jCode').value = hit.code || '';
  refreshStorePanel();
  toast('ดึงข้อมูล ' + hit.name + ' มาแล้ว', 'ok');
};

/** คัดลอกรายการสินค้า/ยอด/ธนาคาร จากงานล่าสุดของร้านเดียวกัน */
ACT['use-last'] = (el) => {
  const last = jobById(el.dataset.id);
  if (!last) return;
  const ty = val('jType') || 'deliver';

  if (ty === 'deliver') {
    if (num(last.amount)) document.getElementById('jAmount').value = last.amount;
    const list = document.getElementById('itemList');
    if (list && (last.items || []).length) {
      list.innerHTML = last.items.map(itemRow).join('');
    }
    if (last.cod && last.cod.on) {
      const c = document.getElementById('jCod');
      c.checked = true; ACT['cod-toggle'](c);
      document.getElementById('jCodAmt').value = last.cod.expected || '';
    }
  } else if (ty === 'bill') {
    if (num(last.amount)) document.getElementById('jBillAmt').value = last.amount;
    if (last.bill && (last.bill.billRefs || []).length) {
      document.getElementById('jBillRefs').value = last.bill.billRefs.join(', ');
    }
  } else if (ty === 'cheque') {
    if (last.pay) {
      if (last.pay.bank) document.getElementById('jBank').value = last.pay.bank;
      if (num(last.pay.amount)) document.getElementById('jPayAmt').value = last.pay.amount;
      if ((last.pay.billRefs || []).length) document.getElementById('jPayRefs').value = last.pay.billRefs.join(', ');
    }
  }
  toast('ดึงข้อมูลจากงานวันที่ ' + thDate(last.date) + ' มาแล้ว ปรับแก้ได้', 'ok', 3500);
};

/** แก้ข้อมูลร้านจากในฟอร์มงาน แล้วกลับมาที่ฟอร์มงานพร้อมค่าเดิม */
ACT['store-edit-inline'] = (el) => {
  _jobDraft = readJobForm();
  openSheet(storeFormHtml(storeById(el.dataset.id), { backable: true, then: 'job' }));
};

/** อ่านค่าที่กรอกไว้ในฟอร์มงาน เพื่อเก็บไว้ตอนแวะไปเพิ่มร้านใหม่ */
function readJobForm() {
  if (!document.getElementById('jType')) return null;
  const type = val('jType') || 'deliver';
  const d = {
    type: type,
    storeId: val('jStore'),
    driverId: val('jDriver'),
    date: val('jDate'),
    note: val('jNote')
  };
  if (type === 'deliver') {
    d.billNo = val('jBillNo');
    d.amount = val('jAmount');
    d.items = readItems();
    d.cod = { on: checked('jCod'), expected: val('jCodAmt') };
  } else if (type === 'bill') {
    d.amount = val('jBillAmt');
    d.bill = { docNo: val('jDocNo'), billRefs: splitRefs(val('jBillRefs')), appointmentDate: val('jAppt') };
  } else {
    d.pay = {
      method: val('jPayMethod') || 'cheque',
      chequeNo: val('jChqNo'), bank: val('jBank'), chequeDate: val('jChqDate'),
      amount: val('jPayAmt'), billRefs: splitRefs(val('jPayRefs'))
    };
  }
  return d;
}

let _jobDraft = null;

ACT['job-new'] = () => { _jobDraft = null; openSheet(jobFormHtml(null, S.date)); };
ACT['job-edit'] = (el) => { _jobDraft = null; openSheet(jobFormHtml(jobById(el.dataset.id))); };

ACT['ty-pick'] = (el) => {
  const k = el.dataset.k;
  document.getElementById('jType').value = k;
  document.querySelectorAll('#tySeg button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
  ['deliver', 'bill', 'cheque'].forEach((x) => {
    const blk = document.getElementById('blk-' + x);
    if (blk) blk.style.display = (x === k) ? '' : 'none';
  });
  refreshStorePanel();   // ปุ่ม "ใช้ข้อมูลจากงานล่าสุด" ขึ้นกับประเภทงาน
};

ACT['pay-pick'] = (el) => {
  const k = el.dataset.k;
  document.getElementById('jPayMethod').value = k;
  document.querySelectorAll('#paySeg button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
  const box = document.getElementById('chqBox');
  if (box) box.style.display = (k === 'cheque') ? '' : 'none';
};

ACT['cod-toggle'] = (el) => {
  const box = document.getElementById('codBox');
  if (box) box.style.display = el.checked ? '' : 'none';
};

ACT['item-add'] = () => {
  const list = document.getElementById('itemList');
  if (!list) return;
  const d = document.createElement('div');
  d.innerHTML = itemRow();
  list.appendChild(d.firstChild);
  const inputs = list.querySelectorAll('.it-name');
  if (inputs.length) inputs[inputs.length - 1].focus();
};
ACT['item-rm'] = (el) => {
  const list = document.getElementById('itemList');
  const row = el.closest('.item');
  if (!row || !list) return;
  if (list.children.length === 1) {
    row.querySelectorAll('input').forEach((i) => { i.value = ''; });
  } else row.remove();
};

function readItems() {
  const out = [];
  document.querySelectorAll('#itemList .item').forEach((r) => {
    const name = String(r.querySelector('.it-name').value || '').trim();
    const qty = String(r.querySelector('.it-qty').value || '').trim();
    const unit = String(r.querySelector('.it-unit').value || '').trim();
    if (name || qty) out.push({ name: name, qty: qty, unit: unit });
  });
  return out;
}

function splitRefs(s) {
  return String(s || '').split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean);
}

async function nextSeq(date, driverId) {
  const list = jobsOfDay(date, driverId || null);
  return list.reduce((m, j) => Math.max(m, j.seq || 0), 0) + 1;
}

ACT['job-save'] = async (el) => {
  const id = el.dataset.id;
  const old = id ? jobById(id) : null;
  const type = val('jType') || 'deliver';
  const storeId = val('jStore');
  const driverId = val('jDriver');
  const date = val('jDate') || S.date;

  if (!storeId) { setErr('ยังไม่ได้เลือกร้านค้า'); return; }
  const st = storeById(storeId);
  if (!st) { setErr('ไม่พบร้านที่เลือก'); return; }
  if (!driverId) { setErr('ยังไม่ได้เลือกคนขับ ทุกงานต้องระบุว่าใครเป็นคนไป'); return; }

  const rec = {
    id: id || undefined,
    date: date,
    type: type,
    storeId: storeId,
    storeName: st.name,
    driverId: driverId,
    status: old ? (old.status === 'pending' ? 'assigned' : old.status) : 'assigned',
    note: val('jNote'),
    photos: old ? (old.photos || []) : [],
    events: old ? (old.events || []) : [],
    round: old ? (old.round || 1) : 1,
    parentJobId: old ? old.parentJobId : undefined,
    childJobId: old ? old.childJobId : undefined,
    rescheduledTo: old ? old.rescheduledTo : undefined,
    fail: old ? old.fail : undefined,
    seq: old ? old.seq : 0
  };

  if (type === 'deliver') {
    rec.billNo = val('jBillNo');
    rec.amount = num(val('jAmount'));
    rec.items = readItems();
    const on = checked('jCod');
    rec.cod = {
      on: on,
      expected: on ? num(val('jCodAmt')) : 0,
      received: old && old.cod ? num(old.cod.received) : 0,
      method: old && old.cod ? old.cod.method : 'cash'
    };
    if (on && !rec.cod.expected) { setErr('ติ๊กเก็บเงินปลายทางไว้ แต่ยังไม่ได้ใส่ยอดที่ต้องเก็บ'); return; }
  }

  if (type === 'bill') {
    rec.amount = num(val('jBillAmt'));
    rec.bill = {
      docNo: val('jDocNo'),
      billRefs: splitRefs(val('jBillRefs')),
      appointmentDate: val('jAppt')
    };
  }

  if (type === 'cheque') {
    const m = val('jPayMethod') || 'cheque';
    rec.pay = {
      method: m,
      chequeNo: m === 'cheque' ? val('jChqNo') : '',
      bank: m === 'cheque' ? val('jBank') : '',
      chequeDate: m === 'cheque' ? val('jChqDate') : '',
      amount: num(val('jPayAmt')),
      billRefs: splitRefs(val('jPayRefs'))
    };
    rec.amount = rec.pay.amount;
  }

  if (!old || old.date !== date || old.driverId !== (driverId || '')) {
    rec.seq = await nextSeq(date, driverId);
  }

  const saved = await DB.jobs.put(rec);
  await reload();
  closeSheet(true);
  render();
  toast(id ? 'บันทึกการแก้ไขแล้ว' : 'สร้างงานแล้ว', 'ok');
  if (!id) setTimeout(() => openJob(saved.id), 120);
};

ACT['job-del'] = (el) => {
  const j = jobById(el.dataset.id);
  if (!j) return;
  confirmSheet('ลบงานนี้?', 'งานที่ ' + esc(j.storeName || '') + ' วันที่ ' + thDate(j.date) +
    ' จะถูกลบถาวร รูปถ่ายที่แนบไว้จะถูกลบด้วย', 'ลบงาน', true, async () => {
    for (const pid of (j.photos || [])) { try { await DB.photos.remove(pid); } catch (e) {} }
    await DB.jobs.remove(j.id);
    await reload();
    closeSheet(true);
    render();
    toast('ลบงานแล้ว');
  });
};

/* ======================= สถานะงาน ======================= */

async function pushEvent(j, st) {
  const ev = (j.events || []).slice();
  const p = S.pos;
  ev.push({
    st: st,
    at: new Date().toISOString(),
    lat: p ? p.lat : undefined,
    lng: p ? p.lng : undefined,
    acc: p ? Math.round(p.acc) : undefined
  });
  return ev;
}

ACT['job-st'] = async (el) => {
  const j = jobById(el.dataset.id);
  if (!j) return;
  const st = el.dataset.st;
  const rec = Object.assign({}, j, { status: st, events: await pushEvent(j, st) });
  if (st === 'enroute') rec.startedAt = new Date().toISOString();
  if (st === 'arrived') rec.arrivedAt = new Date().toISOString();
  await DB.jobs.put(rec);
  await reload();
  closeSheet(true);
  render();
  toast(st === 'enroute' ? 'เริ่มเดินทางแล้ว' : 'บันทึกว่าถึงร้านแล้ว', 'ok');
  setTimeout(() => openJob(j.id), 120);
};

ACT['job-reopen'] = (el) => {
  const j = jobById(el.dataset.id);
  if (!j) return;
  confirmSheet('ย้อนสถานะงาน?', 'งานนี้จะกลับไปเป็น "ถึงร้าน" เพื่อแก้ไขและปิดงานใหม่ ' +
    'ประวัติเดิมยังเก็บไว้ทั้งหมด', 'ย้อนสถานะ', false, async () => {
    const rec = Object.assign({}, j, {
      status: 'arrived',
      events: await pushEvent(j, 'arrived'),
      fail: undefined,
      closedAt: undefined
    });
    await DB.jobs.put(rec);
    await reload();
    closeSheet(true);
    render();
    toast('ย้อนสถานะแล้ว');
    setTimeout(() => openJob(j.id), 120);
  });
};

/* ======================= ปิดงานสำเร็จ ======================= */

ACT['close-ok'] = (el) => {
  const j = jobById(el.dataset.id);
  if (!j) return;
  const nPhotos = (j.photos || []).length;

  let h = sheetHead('ปิดงานสำเร็จ', j.storeName || '', true);

  if (j.type === 'deliver' && j.cod && j.cod.on) {
    h += '<div class="note" style="margin-bottom:13px"><span class="ni">💵</span>' +
      '<div>ต้องเก็บเงินปลายทาง <b>' + money(j.cod.expected) + ' บาท</b></div></div>' +
      '<div class="f"><label for="cRecv">ยอดที่รับจริง (บาท)</label>' +
      '<input type="number" id="cRecv" inputmode="decimal" step="0.01" value="' + esc(j.cod.expected) + '"></div>' +
      '<div class="f"><div class="f-lab">รับเป็น</div><div class="seg" id="cMethodSeg">' +
      '<button type="button" class="on" data-act="cmethod" data-k="cash">เงินสด</button>' +
      '<button type="button" data-act="cmethod" data-k="transfer">โอน</button>' +
      '</div><input type="hidden" id="cMethod" value="cash"></div>';
  }

  if (j.type === 'bill') {
    const b = j.bill || {};
    h += '<div class="f"><label for="cDocNo">เลขที่ใบวางบิล</label>' +
      '<input type="text" id="cDocNo" value="' + esc(b.docNo || '') + '"></div>' +
      dateInput('cAppt', 'วันนัดรับเช็ค', b.appointmentDate, 'ถ้าร้านนัดวันแล้ว ใส่ไว้จะสร้างงานรับเช็คต่อได้ทันที');
  }

  if (j.type === 'cheque') {
    const p = j.pay || {};
    const m = p.method || 'cheque';
    h += '<div class="f"><div class="f-lab">ลูกค้าชำระเป็น</div><div class="seg" id="paySeg">' +
      Object.keys(PAY).map((k) =>
        '<button type="button" class="' + (m === k ? 'on' : '') + '" data-act="pay-pick" data-k="' + k + '">' +
        PAY[k].label + '</button>').join('') +
      '</div><input type="hidden" id="jPayMethod" value="' + m + '"></div>' +
      '<div id="chqBox"' + (m === 'cheque' ? '' : ' style="display:none"') + '>' +
      '<div class="f-2" style="margin-bottom:12px">' +
        '<div class="f"><label for="jChqNo">เลขที่เช็ค</label><input type="text" id="jChqNo" inputmode="numeric" value="' + esc(p.chequeNo || '') + '"></div>' +
        '<div class="f"><label for="jBank">ธนาคาร</label><input type="text" id="jBank" value="' + esc(p.bank || '') + '"></div>' +
      '</div>' + dateInput('jChqDate', 'วันที่ลงเช็ค', p.chequeDate) + '</div>' +
      '<div class="f"><label for="jPayAmt">ยอดเงิน (บาท)</label>' +
      '<input type="number" id="jPayAmt" inputmode="decimal" step="0.01" value="' + esc(p.amount || '') + '"></div>' +
      '<div class="f"><label for="jPayRefs">ตัดบิลเลขที่</label>' +
      '<input type="text" id="jPayRefs" value="' + esc((p.billRefs || []).join(', ')) + '"></div>';
  }

  h += '<div class="f"><label for="cNote">บันทึกเพิ่มเติม <span class="opt">(ไม่ใส่ก็ได้)</span></label>' +
    '<textarea id="cNote" placeholder="เช่น ฝากไว้กับพนักงานชื่อ...">' + esc(j.closeNote || '') + '</textarea></div>';

  h += nPhotos
    ? '<div class="note info" style="margin-bottom:13px"><span class="ni">📷</span><div>แนบรูปไว้แล้ว ' + nPhotos + ' รูป</div></div>'
    : '<div class="note" style="margin-bottom:13px"><span class="ni">📷</span>' +
      '<div>ยังไม่มีรูปถ่าย ถ้าต้องการแนบ ให้กดยกเลิกแล้วกดถ่ายรูปในหน้างานก่อน ' +
      'หรือปิดงานไปเลยก็ได้ ย้อนกลับมาเพิ่มรูปทีหลังได้</div></div>';

  h += '<div class="f-err" id="formErr" style="display:none"></div>' +
    '<button class="btn btn-acc btn-block" type="button" data-act="close-ok-save" data-id="' + esc(j.id) + '">' +
    ICO.check + ' ยืนยันปิดงานสำเร็จ</button>' +
    '<button class="btn btn-ghost btn-block" style="margin-top:8px" type="button" data-act="sheet-back">ยกเลิก</button>';

  openSheet(h);
};

ACT['cmethod'] = (el) => {
  document.getElementById('cMethod').value = el.dataset.k;
  document.querySelectorAll('#cMethodSeg button').forEach((b) => b.classList.toggle('on', b.dataset.k === el.dataset.k));
};

ACT['close-ok-save'] = async (el) => {
  const j = jobById(el.dataset.id);
  if (!j) return;
  const rec = Object.assign({}, j, {
    status: 'done',
    closedAt: new Date().toISOString(),
    closeNote: val('cNote'),
    events: await pushEvent(j, 'done'),
    fail: undefined
  });

  if (j.type === 'deliver' && j.cod && j.cod.on) {
    const got = num(val('cRecv'));
    if (!got) { setErr('ยังไม่ได้ใส่ยอดที่รับจริง ถ้าเก็บเงินไม่ได้ให้ปิดงานไม่สำเร็จแทน'); return; }
    rec.cod = Object.assign({}, j.cod, { received: got, method: val('cMethod') || 'cash' });
  }

  if (j.type === 'bill') {
    rec.bill = Object.assign({}, j.bill || {}, { docNo: val('cDocNo'), appointmentDate: val('cAppt') });
  }

  if (j.type === 'cheque') {
    const m = val('jPayMethod') || 'cheque';
    const amt = num(val('jPayAmt'));
    if (!amt) { setErr('ยังไม่ได้ใส่ยอดเงิน'); return; }
    if (m === 'cheque' && !val('jChqNo')) { setErr('รับเป็นเช็ค แต่ยังไม่ได้ใส่เลขที่เช็ค'); return; }
    rec.pay = {
      method: m,
      chequeNo: m === 'cheque' ? val('jChqNo') : '',
      bank: m === 'cheque' ? val('jBank') : '',
      chequeDate: m === 'cheque' ? val('jChqDate') : '',
      amount: amt,
      billRefs: splitRefs(val('jPayRefs'))
    };
    rec.amount = amt;
  }

  await DB.jobs.put(rec);
  await reload();
  closeSheet(true);
  render();
  toast('ปิดงานสำเร็จแล้ว', 'ok');
};

/* ======================= ปิดงานไม่สำเร็จ ======================= */

ACT['close-fail'] = (el) => {
  const j = jobById(el.dataset.id);
  if (!j) return;

  let h = sheetHead('ปิดงานไม่สำเร็จ', j.storeName || '', true);

  h += '<div class="f"><div class="f-lab">สาเหตุ <span style="color:var(--s-failed)">*</span></div>' +
    '<div class="pills" id="frPills">' +
    FAIL_REASONS.map((r) => '<button type="button" class="pill" data-act="fr-pick" data-r="' + esc(r) + '">' + esc(r) + '</button>').join('') +
    '</div><input type="hidden" id="fReason" value="">' +
    '<div class="f" id="frOther" style="display:none;margin-top:9px">' +
    '<input type="text" id="fReasonOther" placeholder="พิมพ์สาเหตุ"></div></div>';

  h += '<div class="f"><label for="fNote">รายละเอียดเพิ่มเติม <span class="opt">(ไม่ใส่ก็ได้)</span></label>' +
    '<textarea id="fNote" placeholder="เช่น ร้านแจ้งให้มาวันจันทร์ ติดต่อคุณสมหญิง"></textarea></div>';

  h += '<div class="f"><div class="f-lab">นัดใหม่วันไหน</div>' +
    '<div class="pills" style="margin-bottom:9px">' +
    '<button type="button" class="pill" data-act="rs-pick" data-d="' + addDays(j.date, 1) + '">พรุ่งนี้ (' + thDate(addDays(j.date, 1)) + ')</button>' +
    '<button type="button" class="pill" data-act="rs-pick" data-d="' + addDays(j.date, 2) + '">' + thDate(addDays(j.date, 2)) + '</button>' +
    '<button type="button" class="pill" data-act="rs-pick" data-d="' + addDays(j.date, 7) + '">อีก 7 วัน</button>' +
    '<button type="button" class="pill" data-act="rs-pick" data-d="">ยังไม่นัด</button>' +
    '</div>' +
    '<input type="date" id="fResch" value="' + addDays(j.date, 1) + '">' +
    '<div class="f-hint">ถ้าใส่วันไว้ ระบบจะสร้างงานรอบใหม่ให้อัตโนมัติในวันนั้น ' +
    'โดยยังผูกกับงานเดิมเพื่อดูประวัติย้อนหลังได้</div></div>';

  h += '<div class="f" id="fDriverBox"><label for="fDriver">รอบใหม่ให้ใครไป</label>' +
    '<select id="fDriver">' +
    selectOpts(S.drivers, j.driverId || '', (d) => d.id, (d) => d.name + (d.vehicle ? ' · ' + d.vehicle : '')) +
    '</select></div>';

  h += '<div class="f-err" id="formErr" style="display:none"></div>' +
    '<button class="btn btn-danger btn-block" type="button" data-act="close-fail-save" data-id="' + esc(j.id) + '">' +
    ICO.x + ' ยืนยันปิดงานไม่สำเร็จ</button>' +
    '<button class="btn btn-ghost btn-block" style="margin-top:8px" type="button" data-act="sheet-back">ยกเลิก</button>';

  openSheet(h);
};

ACT['fr-pick'] = (el) => {
  const r = el.dataset.r;
  document.getElementById('fReason').value = r;
  document.querySelectorAll('#frPills .pill').forEach((b) => b.classList.toggle('on-bad', b.dataset.r === r));
  const other = document.getElementById('frOther');
  other.style.display = (r === 'อื่น ๆ') ? '' : 'none';
  if (r === 'อื่น ๆ') document.getElementById('fReasonOther').focus();
  setErr('');
};

ACT['rs-pick'] = (el) => {
  const d = el.dataset.d;
  document.getElementById('fResch').value = d;
  document.querySelectorAll('[data-act="rs-pick"]').forEach((b) => b.classList.toggle('on', b.dataset.d === d));
};

ACT['close-fail-save'] = async (el) => {
  const j = jobById(el.dataset.id);
  if (!j) return;

  let reason = val('fReason');
  if (!reason) { setErr('ยังไม่ได้เลือกสาเหตุ'); return; }
  if (reason === 'อื่น ๆ') {
    const o = val('fReasonOther');
    if (!o) { setErr('เลือก "อื่น ๆ" แล้วต้องพิมพ์สาเหตุด้วย'); return; }
    reason = o;
  }

  const resch = val('fResch');
  const nextDriver = val('fDriver') || j.driverId || (S.drivers[0] && S.drivers[0].id) || '';
  if (resch && !nextDriver) { setErr('นัดวันใหม่ไว้ แต่ยังไม่ได้เลือกว่าใครไปรอบใหม่'); return; }

  const rec = Object.assign({}, j, {
    status: 'failed',
    closedAt: new Date().toISOString(),
    events: await pushEvent(j, 'failed'),
    fail: { reason: reason, note: val('fNote'), at: new Date().toISOString() },
    rescheduledTo: resch || undefined
  });

  let childId = null;
  if (resch) {
    const driverId = nextDriver;
    const child = {
      date: resch,
      type: j.type,
      storeId: j.storeId,
      storeName: j.storeName,
      driverId: driverId,
      status: 'assigned',
      billNo: j.billNo,
      amount: j.amount,
      items: j.items,
      cod: j.cod ? Object.assign({}, j.cod, { received: 0 }) : undefined,
      bill: j.bill,
      pay: j.pay ? Object.assign({}, j.pay) : undefined,
      note: j.note,
      photos: [],
      events: [],
      round: (j.round || 1) + 1,
      parentJobId: j.id,
      seq: await nextSeq(resch, driverId)
    };
    const saved = await DB.jobs.put(child);
    childId = saved.id;
    rec.childJobId = childId;
  }

  await DB.jobs.put(rec);
  await reload();
  closeSheet(true);
  render();
  toast(resch ? 'บันทึกแล้ว สร้างงานรอบใหม่วันที่ ' + thDate(resch) : 'บันทึกการปิดงานไม่สำเร็จแล้ว', 'ok');
};

/* ======================= สร้างงานรับเช็คจากงานวางบิล ======================= */

ACT['job-from-bill'] = async (el) => {
  const j = jobById(el.dataset.id);
  if (!j || !j.bill || !j.bill.appointmentDate) return;
  const d = j.bill.appointmentDate;
  const rec = {
    date: d,
    type: 'cheque',
    storeId: j.storeId,
    storeName: j.storeName,
    driverId: j.driverId || (S.drivers[0] && S.drivers[0].id) || '',
    status: 'assigned',
    pay: {
      method: 'cheque', chequeNo: '', bank: '', chequeDate: '',
      amount: num(j.amount), billRefs: (j.bill.billRefs || []).slice()
    },
    amount: num(j.amount),
    note: 'จากการวางบิลวันที่ ' + thDate(j.date),
    photos: [], events: [], round: 1,
    parentJobId: j.id,
    seq: await nextSeq(d, j.driverId)
  };
  const saved = await DB.jobs.put(rec);
  await reload();
  closeSheet(true);
  render();
  toast('สร้างงานรับเช็ค วันที่ ' + thDate(d) + ' แล้ว', 'ok');
  setTimeout(() => openJob(saved.id), 120);
};

/* ======================= ย้ายงาน ======================= */

ACT['job-move'] = (el) => {
  const j = jobById(el.dataset.id);
  if (!j) return;
  openSheet(
    sheetHead('ย้ายงาน', j.storeName || '', true) +
    '<div class="f"><label for="mDriver">คนขับ <span style="color:var(--s-failed)">*</span></label><select id="mDriver">' +
    (j.driverId ? '' : '<option value="">— เลือกคนขับ —</option>') +
    selectOpts(S.drivers, j.driverId || '', (d) => d.id, (d) => d.name + (d.vehicle ? ' · ' + d.vehicle : '')) + '</select></div>' +
    '<div class="f-err" id="formErr" style="display:none"></div>' +
    dateInput('mDate', 'วันที่', j.date) +
    '<button class="btn btn-pri btn-block" type="button" data-act="job-move-save" data-id="' + esc(j.id) + '">บันทึก</button>'
  );
};

ACT['job-move-save'] = async (el) => {
  const j = jobById(el.dataset.id);
  if (!j) return;
  const driverId = val('mDriver');
  if (!driverId) { setErr('ยังไม่ได้เลือกคนขับ'); return; }
  const date = val('mDate') || j.date;
  const changed = (j.driverId || '') !== driverId || j.date !== date;
  const rec = Object.assign({}, j, {
    driverId: driverId,
    date: date,
    status: (j.status === 'pending') ? 'assigned' : j.status,
    seq: changed ? await nextSeq(date, driverId) : j.seq
  });
  await DB.jobs.put(rec);
  await reload();
  closeSheet(true);
  render();
  toast('ย้ายงานแล้ว', 'ok');
};

/* ======================= เรียงลำดับ ======================= */

async function reseq(list) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].seq !== i + 1) await DB.jobs.put(Object.assign({}, list[i], { seq: i + 1 }));
  }
}

async function swapSeq(id, dir) {
  const j = jobById(id);
  if (!j) return;
  const all = jobsOfDay(j.date, j.driverId || null);
  const open = all.filter((x) => !CLOSED[x.status]);
  const i = open.findIndex((x) => x.id === id);
  if (i < 0) return;
  const k = i + dir;
  if (k < 0 || k >= open.length) return;
  const tmp = open[i];
  open[i] = open[k];
  open[k] = tmp;
  const closed = all.filter((x) => CLOSED[x.status]);
  await reseq(closed.concat(open));
  await reload();
  render();
}

ACT['job-up'] = (el) => swapSeq(el.dataset.id, -1);
ACT['job-down'] = (el) => swapSeq(el.dataset.id, 1);

ACT['route-suggest'] = async () => {
  const drvId = activeDriverId();
  const all = jobsOfDay(S.date, drvId);
  const open = all.filter((j) => !CLOSED[j.status]);
  if (open.length < 2) { toast('มีงานน้อยเกินกว่าจะจัดลำดับ'); return; }

  let from = S.pos;
  if (!from) {
    toast('กำลังหาตำแหน่งปัจจุบัน...');
    from = await gpsOnce();
  }

  const pinned = [], unpinned = [];
  open.forEach((j) => {
    const st = storeById(j.storeId);
    if (st && st.lat !== undefined && st.lat !== null) pinned.push({ j: j, p: { lat: st.lat, lng: st.lng } });
    else unpinned.push(j);
  });

  if (pinned.length < 2) { toast('ร้านที่ปักหมุดไว้ยังน้อยเกินไป ลองปักหมุดร้านเพิ่มก่อน', 'bad', 4000); return; }

  // เพื่อนบ้านใกล้สุด เริ่มจากตำแหน่งปัจจุบัน (ถ้าไม่มีให้เริ่มจากร้านแรก)
  const rest = pinned.slice();
  const order = [];
  let cur = from || rest[0].p;
  while (rest.length) {
    let bi = 0, bd = Infinity;
    rest.forEach((x, i) => {
      const d = distKm(cur, x.p);
      if (d !== null && d < bd) { bd = d; bi = i; }
    });
    const pick = rest.splice(bi, 1)[0];
    order.push(pick.j);
    cur = pick.p;
  }

  const closed = all.filter((j) => CLOSED[j.status]);
  await reseq(closed.concat(order, unpinned));
  await reload();
  render();
  toast('จัดลำดับแนะนำให้แล้ว ปรับเองได้ด้วยปุ่มลูกศร' +
    (unpinned.length ? ' (' + unpinned.length + ' ร้านไม่มีหมุด ต่อท้ายไว้)' : ''), 'ok', 4200);
};

/* ======================= ฟอร์มร้านค้า ======================= */

/** ตาราง 1-31 + สิ้นเดือน สำหรับเลือกรอบวางบิลรายเดือน */
function dayGridHtml(sel) {
  sel = sel || [];
  let g = '<div class="daygrid">';
  for (let d = 1; d <= 31; d++) {
    g += '<button type="button" class="' + (sel.indexOf(d) > -1 ? 'on' : '') + '" data-act="bc-day" data-d="' + d + '">' + d + '</button>';
  }
  g += '<button type="button" class="wide ' + (sel.indexOf(EOM) > -1 ? 'on' : '') + '" data-act="bc-day" data-d="' + EOM + '">สิ้นเดือน</button>';
  g += '</div>';
  return g;
}

function storeFormHtml(s, opts) {
  const isNew = !s || !s.id;
  s = s || {};
  opts = opts || {};
  const hasPin = s.lat !== undefined && s.lat !== null;

  let h = sheetHead(isNew ? 'เพิ่มร้านค้า' : 'แก้ไขร้านค้า', isNew ? '' : s.name, !!opts.backable);

  h += '<div class="f"><label for="sName">ชื่อร้าน <span style="color:var(--s-failed)">*</span></label>' +
    '<input type="text" id="sName" value="' + esc(s.name || '') + '" placeholder="เช่น ร้านสมชายการค้า"></div>';

  h += '<div class="f-2" style="margin-bottom:12px">' +
    '<div class="f"><label for="sCode">รหัสร้าน <span class="opt">(ถ้ามี)</span></label>' +
    '<input type="text" id="sCode" value="' + esc(s.code || '') + '"></div>' +
    '<div class="f"><label for="sPhone">เบอร์โทร</label>' +
    '<input type="tel" id="sPhone" inputmode="tel" value="' + esc(s.phone || '') + '"></div>' +
    '</div>';

  h += '<div class="f"><label for="sAddr">ที่อยู่</label>' +
    '<textarea id="sAddr" placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด">' + esc(s.address || '') + '</textarea></div>';

  h += '<div class="f"><label for="sContact">ชื่อผู้ติดต่อ</label>' +
    '<input type="text" id="sContact" value="' + esc(s.contactName || '') + '"></div>';

  /* ---- เวลารับของ: เลือกเวลา ไม่ต้องพิมพ์ ---- */
  h += '<div class="f"><div class="f-lab">เวลารับของ</div>' +
    '<div class="f-2">' +
      '<div class="f"><label for="sFrom" style="font-size:11.5px;font-weight:500;color:var(--ink-3)">ตั้งแต่</label>' +
      '<input type="time" id="sFrom" value="' + esc(s.openFrom || '') + '"></div>' +
      '<div class="f"><label for="sTo" style="font-size:11.5px;font-weight:500;color:var(--ink-3)">ถึง</label>' +
      '<input type="time" id="sTo" value="' + esc(s.openTo || '') + '"></div>' +
    '</div>' +
    (s.openHours && !s.openFrom
      ? '<div class="f-hint">เดิมบันทึกไว้เป็นข้อความว่า "' + esc(s.openHours) + '" เลือกเวลาด้านบนเพื่อแทนที่</div>'
      : '<div class="f-hint">เว้นว่างไว้ได้ถ้าร้านไม่กำหนดเวลา</div>') +
    '</div>';

  /* ---- รอบวางบิล: กดเลือกวัน ---- */
  const b = s.billing || {};
  const bMode = b.mode || 'none';
  const bDaysM = bMode === 'month' ? (b.days || []) : [];
  const bDaysW = bMode === 'week' ? (b.days || []) : [];

  h += '<div class="f"><div class="f-lab">รอบวางบิล</div>' +
    '<div class="seg" id="bcSeg">' +
      [['none', 'ไม่กำหนด'], ['month', 'ทุกวันที่'], ['week', 'ทุกสัปดาห์']].map((o) =>
        '<button type="button" class="' + (bMode === o[0] ? 'on' : '') + '" data-act="bc-mode" data-k="' + o[0] + '">' +
        o[1] + '</button>').join('') +
    '</div>' +
    '<input type="hidden" id="sBcMode" value="' + bMode + '">' +
    '<input type="hidden" id="sBcDaysM" value="' + bDaysM.join(',') + '">' +
    '<input type="hidden" id="sBcDaysW" value="' + bDaysW.join(',') + '">' +

    '<div id="bcMonth" style="margin-top:9px' + (bMode !== 'month' ? ';display:none' : '') + '">' +
      dayGridHtml(bDaysM) + '</div>' +

    '<div id="bcWeek" style="margin-top:9px' + (bMode !== 'week' ? ';display:none' : '') + '">' +
      '<div class="wdays">' + WDAY_SHORT.map((w, i) =>
        '<button type="button" class="' + (bDaysW.indexOf(i) > -1 ? 'on' : '') + '" data-act="bc-wday" data-d="' + i + '">' +
        w + '</button>').join('') + '</div></div>' +

    '<div style="margin-top:9px"><input type="text" id="sBcNote" placeholder="หมายเหตุรอบวางบิล เช่น ต้องวางก่อนบ่ายสาม" value="' +
      esc(billingNoteOf(s) || s.billingCycle || '') + '"></div>' +
    '</div>';

  /* พิกัด */
  h += '<div class="f"><div class="f-lab">พิกัดร้าน (หมุดบนแผนที่)</div>' +
    '<div class="card" style="padding:12px">' +
    '<div id="pinState" style="font-size:14px;font-weight:600;margin-bottom:9px">' +
      (hasPin
        ? '<span style="color:var(--s-done)">✓ ปักหมุดแล้ว</span> <span class="muted mono" style="font-weight:400;font-size:12.5px">' + Number(s.lat).toFixed(6) + ', ' + Number(s.lng).toFixed(6) + '</span>'
        : '<span style="color:var(--accent)">ยังไม่ได้ปักหมุด</span>') +
    '</div>' +
    '<input type="hidden" id="sLat" value="' + (hasPin ? s.lat : '') + '">' +
    '<input type="hidden" id="sLng" value="' + (hasPin ? s.lng : '') + '">' +
    '<button class="btn btn-sm btn-pri btn-block" style="margin-bottom:8px" type="button" data-act="pin-map">' +
      ICO.map + ' เลือกจุดบนแผนที่ (แม่นที่สุด)</button>' +
    '<button class="btn btn-sm btn-block" style="margin-bottom:8px" type="button" data-act="pin-here">' +
      ICO.locate + ' ใช้ตำแหน่งที่ยืนอยู่ตอนนี้</button>' +
    '<div class="f" style="margin-bottom:0"><label for="sPaste" style="font-size:12px">หรือวางพิกัดจาก Google Maps</label>' +
    '<input type="text" id="sPaste" placeholder="13.756331, 100.501765" data-inp="pin-paste">' +
    '<div class="f-hint">ใน Google Maps กดค้างที่จุดร้าน แล้วแตะตัวเลขพิกัดเพื่อคัดลอก จากนั้นวางลงช่องนี้</div></div>' +
    '</div></div>';

  h += '<div class="f"><label for="sNote">หมายเหตุ</label>' +
    '<textarea id="sNote" placeholder="เช่น จอดรถหลังร้าน ประตูเล็กซอยข้าง">' + esc(s.note || '') + '</textarea></div>';

  h += '<div class="f-err" id="formErr" style="display:none"></div>';

  h += '<button class="btn btn-pri btn-block" type="button" data-act="store-save" data-id="' + esc(s.id || '') +
    '" data-then="' + esc(opts.then || '') + '">' + (isNew ? 'บันทึกร้าน' : 'บันทึกการแก้ไข') + '</button>';

  if (!isNew) {
    h += '<button class="btn btn-danger btn-block" style="margin-top:8px" type="button" data-act="store-del" data-id="' + esc(s.id) + '">ลบร้านนี้</button>';
  }
  return h;
}

ACT['store-new'] = () => openSheet(storeFormHtml(null));
ACT['store-new-inline'] = () => {
  _jobDraft = readJobForm();   // เก็บสิ่งที่กรอกค้างไว้ก่อน เพื่อไม่ให้หายตอนกลับมา
  openSheet(storeFormHtml(null, { backable: true, then: 'job' }));
};

/* ---- รอบวางบิล ---- */

ACT['bc-mode'] = (el) => {
  const k = el.dataset.k;
  document.getElementById('sBcMode').value = k;
  document.querySelectorAll('#bcSeg button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
  document.getElementById('bcMonth').style.display = (k === 'month') ? '' : 'none';
  document.getElementById('bcWeek').style.display = (k === 'week') ? '' : 'none';
};

function toggleDayInput(inputId, day, btn) {
  const inp = document.getElementById(inputId);
  const cur = String(inp.value || '').split(',').filter(Boolean).map(Number);
  const i = cur.indexOf(day);
  if (i > -1) cur.splice(i, 1); else cur.push(day);
  cur.sort((a, b) => a - b);
  inp.value = cur.join(',');
  btn.classList.toggle('on', cur.indexOf(day) > -1);
}

ACT['bc-day'] = (el) => toggleDayInput('sBcDaysM', Number(el.dataset.d), el);
ACT['bc-wday'] = (el) => toggleDayInput('sBcDaysW', Number(el.dataset.d), el);

/* ---- ปักหมุดบนแผนที่ ---- */

let _pmMap = null, _pmMarker = null, _pmOnPick = null;

function setPmCoord(ll) {
  const el = document.getElementById('pmCoord');
  if (el) el.textContent = ll.lat.toFixed(6) + ', ' + ll.lng.toFixed(6);
}

function openPinPicker(o) {
  _pmOnPick = o.onPick;
  openSheet(
    sheetHead('ปักหมุดบนแผนที่', o.name || '', true) +
    '<div class="note info" style="margin-bottom:11px"><span class="ni">👆</span>' +
    '<div>ซูมเข้าให้ใกล้ที่สุดแล้วแตะตรงหน้าร้าน หรือลากหมุดไปวาง ยิ่งซูมใกล้หมุดยิ่งตรง</div></div>' +
    '<div class="pickmap">' +
      '<div class="pm-map" id="pmMap"></div>' +
      '<div class="pm-tip">แตะบนแผนที่ หรือลากหมุด</div>' +
      '<button class="pm-locate" type="button" data-act="pm-locate" aria-label="ไปที่ตำแหน่งฉัน">' + ICO.locate + '</button>' +
    '</div>' +
    '<div class="pm-coord"><span class="muted">พิกัดที่เลือก</span><span class="mono" id="pmCoord">ยังไม่ได้เลือก</span></div>' +
    '<button class="btn btn-pri btn-block" style="margin-top:12px" type="button" data-act="pm-ok">ใช้จุดนี้</button>' +
    '<button class="btn btn-ghost btn-block" style="margin-top:8px" type="button" data-act="sheet-back">ยกเลิก</button>',
    () => mountPickMap(o)
  );
}

function mountPickMap(o) {
  const el = document.getElementById('pmMap');
  if (!el || typeof L === 'undefined') {
    if (el) el.innerHTML = '<div style="padding:22px;text-align:center;color:var(--ink-3)">โหลดแผนที่ไม่ได้ ตรวจสัญญาณอินเทอร์เน็ต</div>';
    return;
  }
  const has = o.lat !== undefined && o.lat !== null && o.lat !== '';
  const start = has ? [Number(o.lat), Number(o.lng)]
    : (S.pos ? [S.pos.lat, S.pos.lng] : [13.7563, 100.5018]);
  const zoom = has ? 18 : (S.pos ? 17 : 12);

  _pmMap = L.map(el, { zoomControl: true, attributionControl: true }).setView(start, zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  }).addTo(_pmMap);

  _pmMarker = L.marker(start, {
    draggable: true,
    icon: L.divIcon({
      className: '',
      html: '<div class="pin pin-deliver" style="width:32px;height:32px"><span>📍</span></div>',
      iconSize: [32, 32], iconAnchor: [16, 30]
    })
  }).addTo(_pmMap);

  if (has || S.pos) setPmCoord({ lat: start[0], lng: start[1] });

  _pmMarker.on('dragend', () => setPmCoord(_pmMarker.getLatLng()));
  _pmMap.on('click', (e) => { _pmMarker.setLatLng(e.latlng); setPmCoord(e.latlng); });

  // แผ่นเลื่อนขึ้นมาทีหลัง ต้องบอก Leaflet ให้วัดขนาดใหม่
  setTimeout(() => { if (_pmMap) _pmMap.invalidateSize(); }, 260);
  setTimeout(() => { if (_pmMap) _pmMap.invalidateSize(); }, 650);
}

ACT['pm-locate'] = async (el) => {
  el.innerHTML = '<span class="spin" style="border-color:var(--line);border-top-color:var(--brand)"></span>';
  const p = await gpsOnce();
  el.innerHTML = ICO.locate;
  if (!p) { toast('หาตำแหน่งไม่ได้ ลองออกมาที่โล่ง', 'bad'); return; }
  S.pos = p;
  if (_pmMap && _pmMarker) {
    _pmMap.setView([p.lat, p.lng], 18);
    _pmMarker.setLatLng([p.lat, p.lng]);
    setPmCoord(p);
  }
};

ACT['pm-ok'] = () => {
  if (!_pmMarker) { toast('ยังไม่ได้เลือกจุด', 'bad'); return; }
  const ll = _pmMarker.getLatLng();
  const cb = _pmOnPick;
  if (_pmMap) { _pmMap.remove(); _pmMap = null; _pmMarker = null; }
  _pmOnPick = null;
  if (cb) cb(ll.lat, ll.lng);
};

/** เปิดแผนที่จากในฟอร์มร้าน: เก็บค่าที่กรอกค้างไว้ก่อน แล้วสร้างฟอร์มใหม่พร้อมหมุด */
ACT['pin-map'] = () => {
  const draft = readStoreForm();
  openPinPicker({
    name: draft.name || 'ร้านใหม่',
    lat: draft.lat, lng: draft.lng,
    onPick: (lat, lng) => {
      closeSheet(true);
      openSheet(storeFormHtml(Object.assign({}, draft, { lat: lat, lng: lng }), { backable: !!_jobDraft, then: _jobDraft ? 'job' : '' }));
      toast('ปักหมุดจากแผนที่แล้ว', 'ok');
    }
  });
};

/** แก้หมุดของร้านที่บันทึกแล้ว โดยเซฟลงฐานข้อมูลทันที */
ACT['pin-map-store'] = (el) => {
  const s = storeById(el.dataset.id);
  if (!s) return;
  const back = el.dataset.back || '';
  openPinPicker({
    name: s.name, lat: s.lat, lng: s.lng,
    onPick: async (lat, lng) => {
      await DB.stores.put(Object.assign({}, s, { lat: lat, lng: lng }));
      await reload();
      closeSheet();
      toast('แก้หมุดร้าน ' + s.name + ' แล้ว', 'ok');
      if (back === 'job') {
        refreshStorePanel();
      } else if (back === 'store') {
        closeSheet(true);
        ACT['store-open']({ dataset: { id: s.id } });
      } else if (back.indexOf('jobDetail:') === 0) {
        closeSheet(true);
        openJob(back.slice(10));
      } else {
        closeSheet(true);
        render();
      }
    }
  });
};

ACT['pin-here'] = async (el) => {
  el.disabled = true;
  el.innerHTML = '<span class="spin" style="border-color:var(--line);border-top-color:var(--brand)"></span> กำลังหาตำแหน่ง...';
  const p = await gpsOnce();
  el.disabled = false;
  el.innerHTML = ICO.locate + ' ใช้ตำแหน่งที่ยืนอยู่ตอนนี้';
  if (!p) { toast('หาตำแหน่งไม่ได้ ลองออกมาที่โล่งหรือตรวจว่าเปิด GPS แล้ว', 'bad', 4000); return; }
  document.getElementById('sLat').value = p.lat;
  document.getElementById('sLng').value = p.lng;
  document.getElementById('pinState').innerHTML =
    '<span style="color:var(--s-done)">✓ ปักหมุดแล้ว</span> <span class="muted mono" style="font-weight:400;font-size:12.5px">' +
    p.lat.toFixed(6) + ', ' + p.lng.toFixed(6) + ' (± ' + Math.round(p.acc) + ' ม.)</span>';
  toast('ปักหมุดจากตำแหน่งปัจจุบันแล้ว', 'ok');
};

ACT['pin-paste'] = (el) => {
  const p = parseLatLng(el.value);
  if (!p) return;
  document.getElementById('sLat').value = p.lat;
  document.getElementById('sLng').value = p.lng;
  document.getElementById('pinState').innerHTML =
    '<span style="color:var(--s-done)">✓ ปักหมุดแล้ว</span> <span class="muted mono" style="font-weight:400;font-size:12.5px">' +
    p.lat.toFixed(6) + ', ' + p.lng.toFixed(6) + '</span>';
};

/** อ่านค่าที่กรอกไว้ในฟอร์มร้าน (ใช้ตอนแวะไปเปิดแผนที่แล้วกลับมา) */
function readStoreForm() {
  if (!document.getElementById('sName')) return {};
  const latS = val('sLat'), lngS = val('sLng');
  const mode = val('sBcMode') || 'none';
  const days = mode === 'month' ? val('sBcDaysM') : (mode === 'week' ? val('sBcDaysW') : '');
  return {
    id: (document.querySelector('[data-act="store-save"]') || { dataset: {} }).dataset.id || undefined,
    name: val('sName'),
    code: val('sCode'),
    phone: val('sPhone'),
    address: val('sAddr'),
    contactName: val('sContact'),
    openFrom: val('sFrom'),
    openTo: val('sTo'),
    billing: {
      mode: mode,
      days: String(days || '').split(',').filter(Boolean).map(Number),
      note: val('sBcNote')
    },
    note: val('sNote'),
    lat: latS === '' ? undefined : Number(latS),
    lng: lngS === '' ? undefined : Number(lngS)
  };
}

ACT['store-save'] = async (el) => {
  const id = el.dataset.id;
  const then = el.dataset.then;
  const name = val('sName');
  if (!name) { setErr('ยังไม่ได้ใส่ชื่อร้าน'); return; }

  const old = id ? storeById(id) : null;
  const rec = Object.assign({}, readStoreForm(), { id: id || undefined, name: name });
  // ล้างข้อความรอบวางบิลแบบเก่าทิ้ง เมื่อเลือกแบบใหม่แล้ว
  if (rec.billing && rec.billing.mode !== 'none') rec.billingCycle = '';
  else if (old) rec.billingCycle = old.billingCycle;
  if (rec.openFrom && old) rec.openHours = '';
  else if (old) rec.openHours = old.openHours;

  const saved = await DB.stores.put(rec);
  await reload();

  if (then === 'job') {
    // กลับไปฟอร์มงานพร้อมค่าที่กรอกค้างไว้ และเลือกร้านที่เพิ่งเพิ่มให้เลย
    const draft = Object.assign({}, _jobDraft || {}, { storeId: saved.id });
    _jobDraft = null;
    closeSheet(true);
    openSheet(jobFormHtml(draft, S.date));
    toast('เพิ่มร้าน ' + name + ' แล้ว เลือกให้เรียบร้อย', 'ok');
    return;
  }

  closeSheet(true);
  render();
  toast(id ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มร้านแล้ว', 'ok');
};

ACT['store-del'] = (el) => {
  const s = storeById(el.dataset.id);
  if (!s) return;
  const used = S.jobs.filter((j) => j.storeId === s.id).length;
  confirmSheet('ลบร้านนี้?',
    used
      ? 'ร้าน ' + esc(s.name) + ' มีงานผูกอยู่ ' + used + ' รายการ ระบบจะซ่อนร้านออกจากรายการแต่เก็บประวัติงานไว้'
      : 'ร้าน ' + esc(s.name) + ' จะถูกลบ',
    'ลบร้าน', true, async () => {
      if (used) await DB.stores.put(Object.assign({}, s, { deleted: true }));
      else await DB.stores.remove(s.id);
      await reload();
      closeSheet(true);
      render();
      toast('ลบร้านแล้ว');
    });
};

ACT['store-pin-now'] = async (el) => {
  const s = storeById(el.dataset.id);
  if (!s) return;
  const p = await gpsOnce();
  if (!p) { toast('หาตำแหน่งไม่ได้', 'bad'); return; }
  await DB.stores.put(Object.assign({}, s, { lat: p.lat, lng: p.lng }));
  await reload();
  closeSheet(true);
  render();
  toast('ปักหมุดร้าน ' + s.name + ' แล้ว', 'ok');
};

ACT['store-search'] = (el) => {
  S.search = el.value;
  const scr = document.getElementById('screen');
  scr.innerHTML = Views.stores();
  const inp = scr.querySelector('[data-inp="store-search"]');
  if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
};
ACT['store-search-clear'] = () => { S.search = ''; render(); };

/* ======================= รายละเอียดร้าน ======================= */

ACT['store-open'] = (el) => {
  const s = storeById(el.dataset.id);
  if (!s) return;
  const jobs = S.jobs.filter((j) => j.storeId === s.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const hasPin = s.lat !== undefined && s.lat !== null;
  const done = jobs.filter((j) => j.status === 'done').length;
  const failed = jobs.filter((j) => j.status === 'failed').length;

  let h = sheetHead(s.name, s.code ? 'รหัส ' + s.code : '');

  const bits = [];
  if (s.address) bits.push('<div class="dl-r"><div class="dl-k">ที่อยู่</div><div class="dl-v">' + esc(s.address) + '</div></div>');
  if (s.contactName) bits.push('<div class="dl-r"><div class="dl-k">ผู้ติดต่อ</div><div class="dl-v">' + esc(s.contactName) + '</div></div>');
  if (s.phone) bits.push('<div class="dl-r"><div class="dl-k">โทร</div><div class="dl-v">' + esc(s.phone) + '</div></div>');
  const shrs = hoursLabel(s);
  if (shrs) bits.push('<div class="dl-r"><div class="dl-k">เวลารับของ</div><div class="dl-v">' + esc(shrs) + '</div></div>');
  const sbil = billingLabel(s), sbn = billingNoteOf(s);
  if (sbil || sbn) bits.push('<div class="dl-r"><div class="dl-k">รอบวางบิล</div><div class="dl-v">' +
    esc(sbil || '') + (sbn ? (sbil ? '<br>' : '') + '<span class="muted" style="font-size:12.5px">' + esc(sbn) + '</span>' : '') + '</div></div>');
  if (s.note) bits.push('<div class="dl-r"><div class="dl-k">หมายเหตุ</div><div class="dl-v">' + esc(s.note) + '</div></div>');
  bits.push('<div class="dl-r"><div class="dl-k">หมุด</div><div class="dl-v">' +
    (hasPin ? '<span class="mono" style="font-size:13px">' + Number(s.lat).toFixed(6) + ', ' + Number(s.lng).toFixed(6) + '</span>' : '<span style="color:var(--accent)">ยังไม่ได้ปักหมุด</span>') +
    '</div></div>');
  h += '<div class="dl">' + bits.join('') + '</div>';

  const row = [];
  if (s.phone) row.push('<a class="btn" href="' + esc(telUrl(s.phone)) + '">' + ICO.phone + ' โทร</a>');
  if (hasPin) row.push('<a class="btn btn-pri" href="' + esc(navUrl(s.lat, s.lng)) + '" target="_blank" rel="noopener">' + ICO.nav + ' นำทาง</a>');
  if (row.length) h += '<div class="btn-row" style="margin-bottom:8px">' + row.join('') + '</div>';

  h += '<button class="btn btn-block" style="margin-bottom:13px" type="button" data-act="pin-map-store" data-id="' + esc(s.id) + '" data-back="store">' +
    ICO.map + (hasPin ? ' แก้หมุดบนแผนที่' : ' ปักหมุดบนแผนที่') + '</button>';

  h += '<div class="tiles tiles-3" style="margin-bottom:14px">' +
    tile('งานทั้งหมด', jobs.length) +
    tile('สำเร็จ', done, '', 'ok') +
    tile('ไม่สำเร็จ', failed, '', failed ? 'bad' : '') +
    '</div>';

  h += '<div class="btn-row" style="margin-bottom:14px">' +
    '<button class="btn" type="button" data-act="store-edit" data-id="' + esc(s.id) + '">แก้ไขข้อมูลร้าน</button>' +
    '<button class="btn btn-acc" type="button" data-act="job-new-store" data-id="' + esc(s.id) + '">' + ICO.plus + ' สร้างงาน</button>' +
    '</div>';

  if (jobs.length) {
    h += '<div class="sec-h"><span class="sec-t">ประวัติงานร้านนี้</span></div>' +
      jobs.slice(0, 30).map((j) => {
        const t = TY[j.type] || TY.deliver;
        const sj = ST[j.status] || ST.pending;
        return '<button class="row" type="button" data-act="job-open" data-id="' + esc(j.id) + '">' +
          '<div class="row-ico" style="background:var(--line-2)">' + t.ico + '</div>' +
          '<div class="row-main"><div class="row-t">' + t.label + ' · ' + thDate(j.date) +
          (j.round > 1 ? ' <span class="chip">รอบ ' + j.round + '</span>' : '') + '</div>' +
          '<div class="row-s">' + esc(sj.label + (j.fail && j.fail.reason ? ' · ' + j.fail.reason : '')) + '</div></div>' +
          '<div class="row-x">' + ICO.chev + '</div></button>';
      }).join('');
  }

  openSheet(h);
};

ACT['store-edit'] = (el) => openSheet(storeFormHtml(storeById(el.dataset.id), { backable: true }));

ACT['job-new-store'] = (el) => {
  closeSheet(true);
  openSheet(jobFormHtml(null, S.date));
  setTimeout(() => { const s = document.getElementById('jStore'); if (s) s.value = el.dataset.id; }, 60);
};

/* ======================= รูปถ่าย ======================= */

let _photoJobId = null;

ACT['photo-add'] = (el) => {
  _photoJobId = el.dataset.id;
  const inp = document.getElementById('photoInput');
  inp.value = '';
  inp.click();
};

ACT['photo-pick'] = (el) => {
  _photoJobId = el.dataset.id;
  const inp = document.getElementById('photoPick');
  inp.value = '';
  inp.click();
};

async function compressImage(file, maxDim, quality) {
  let bmp = null;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    try { bmp = await createImageBitmap(file); } catch (e2) { bmp = null; }
  }
  if (!bmp) {
    // สำรอง: ใช้ <img>
    const url = URL.createObjectURL(file);
    try {
      bmp = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = url;
      });
    } catch (e) { URL.revokeObjectURL(url); return file; }
  }
  const w = bmp.width || bmp.naturalWidth;
  const hh = bmp.height || bmp.naturalHeight;
  const sc = Math.min(1, maxDim / Math.max(w, hh));
  const cw = Math.max(1, Math.round(w * sc));
  const ch = Math.max(1, Math.round(hh * sc));
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  cv.getContext('2d').drawImage(bmp, 0, 0, cw, ch);
  if (bmp.close) bmp.close();
  const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', quality));
  return blob || file;
}

async function handlePhotoFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file || !_photoJobId) return;
  const j = jobById(_photoJobId);
  if (!j) return;
  toast('กำลังย่อและบันทึกรูป...');
  try {
    const blob = await compressImage(file, 1280, 0.72);
    const rec = await DB.photos.add(blob, { jobId: j.id });
    await DB.jobs.put(Object.assign({}, j, { photos: (j.photos || []).concat([rec.id]) }));
    await reload();
    toast('บันทึกรูปแล้ว (' + byteLabel(blob.size) + ')', 'ok');
    closeSheet(true);
    openJob(j.id);
  } catch (err) {
    console.error(err);
    toast('บันทึกรูปไม่ได้ ลองใหม่อีกครั้ง', 'bad');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ['photoInput', 'photoPick'].forEach((id) => {
    const inp = document.getElementById(id);
    if (inp) inp.addEventListener('change', handlePhotoFile);
  });

  const rin = document.getElementById('restoreInput');
  if (rin) rin.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const n = await DB.importAll(data, window._restoreMode || 'merge');
      await reload();
      closeSheet(true);
      render();
      toast('กู้คืนแล้ว ร้าน ' + n.stores + ' · งาน ' + n.jobs + ' · รูป ' + n.photos, 'ok', 4500);
    } catch (err) {
      console.error(err);
      toast('อ่านไฟล์สำรองไม่ได้: ' + err.message, 'bad', 5000);
    }
  });
});

ACT['photo-del'] = (el) => {
  const j = jobById(el.dataset.jid);
  const pid = el.dataset.pid;
  if (!j) return;
  confirmSheet('ลบรูปนี้?', 'รูปจะถูกลบถาวร', 'ลบรูป', true, async () => {
    await DB.photos.remove(pid);
    await DB.jobs.put(Object.assign({}, j, { photos: (j.photos || []).filter((x) => x !== pid) }));
    await reload();
    closeSheet(true);
    openJob(j.id);
    toast('ลบรูปแล้ว');
  });
};

/* ======================= คนขับ ======================= */

ACT['driver-new'] = () => openSheet(driverFormHtml(null));
ACT['driver-edit'] = (el) => openSheet(driverFormHtml(driverById(el.dataset.id), true));

function driverFormHtml(d, backable) {
  const isNew = !d;
  d = d || {};
  return sheetHead(isNew ? 'เพิ่มคนขับ' : 'แก้ไขคนขับ', isNew ? '' : d.name, backable) +
    '<div class="f"><label for="dName">ชื่อ <span style="color:var(--s-failed)">*</span></label>' +
    '<input type="text" id="dName" value="' + esc(d.name || '') + '" placeholder="เช่น สมชาย"></div>' +
    '<div class="f-2" style="margin-bottom:12px">' +
    '<div class="f"><label for="dVeh">ทะเบียนรถ</label><input type="text" id="dVeh" value="' + esc(d.vehicle || '') + '" placeholder="เช่น 1กก-1234"></div>' +
    '<div class="f"><label for="dPhone">เบอร์โทร</label><input type="tel" id="dPhone" inputmode="tel" value="' + esc(d.phone || '') + '"></div>' +
    '</div>' +
    '<div class="f-err" id="formErr" style="display:none"></div>' +
    '<button class="btn btn-pri btn-block" type="button" data-act="driver-save" data-id="' + esc(d.id || '') + '">' +
    (isNew ? 'เพิ่มคนขับ' : 'บันทึก') + '</button>' +
    (isNew ? '' : '<button class="btn btn-danger btn-block" style="margin-top:8px" type="button" data-act="driver-del" data-id="' + esc(d.id) + '">ลบคนขับ</button>');
}

ACT['driver-save'] = async (el) => {
  const name = val('dName');
  if (!name) { setErr('ยังไม่ได้ใส่ชื่อ'); return; }
  const id = el.dataset.id;
  const old = id ? driverById(id) : null;
  await DB.drivers.put({
    id: id || undefined,
    name: name,
    vehicle: val('dVeh'),
    phone: val('dPhone'),
    order: old ? old.order : (S.drivers.length + 1)
  });
  await reload();
  closeSheet(true);
  render();
  toast(id ? 'บันทึกแล้ว' : 'เพิ่มคนขับแล้ว', 'ok');
};

ACT['driver-del'] = (el) => {
  const d = driverById(el.dataset.id);
  if (!d) return;
  if (S.drivers.length <= 1) { toast('ต้องมีคนขับอย่างน้อย 1 คน', 'bad'); return; }
  const used = S.jobs.filter((j) => j.driverId === d.id && !CLOSED[j.status]).length;
  confirmSheet('ลบคนขับ ' + esc(d.name) + '?',
    used ? 'ยังมีงานค้างอยู่ ' + used + ' รายการ งานเหล่านั้นจะกลายเป็นยังไม่มอบหมาย' : 'ประวัติงานเดิมยังเก็บไว้',
    'ลบคนขับ', true, async () => {
      for (const j of S.jobs.filter((x) => x.driverId === d.id && !CLOSED[x.status])) {
        await DB.jobs.put(Object.assign({}, j, { driverId: '', status: 'pending' }));
      }
      await DB.drivers.put(Object.assign({}, d, { deleted: true }));
      await reload();
      if (S.myDriverId === d.id) {
        S.myDriverId = S.drivers[0] ? S.drivers[0].id : null;
        await DB.meta.set('myDriverId', S.myDriverId);
      }
      if (S.officeDriverId === d.id) S.officeDriverId = null;
      closeSheet(true);
      render();
      toast('ลบคนขับแล้ว');
    });
};

/* ======================= ตั้งค่า ======================= */

ACT['settings-open'] = async () => {
  const q = await DB.quota();
  const pu = await DB.photos.usage();

  let h = sheetHead('ตั้งค่า', 'คนขับ พื้นที่เก็บข้อมูล');

  h += '<div class="sec-h"><span class="sec-t">คนขับ / รถ</span>' +
    '<button class="btn btn-sm" type="button" data-act="driver-new">' + ICO.plus + ' เพิ่ม</button></div>';
  h += S.drivers.map((d) =>
    '<button class="row" type="button" data-act="driver-edit" data-id="' + esc(d.id) + '">' +
    '<div class="row-ico">' + esc(initials(d.name)) + '</div>' +
    '<div class="row-main"><div class="row-t">' + esc(d.name) + '</div>' +
    '<div class="row-s">' + esc([d.vehicle, d.phone].filter(Boolean).join(' · ') || 'ยังไม่ใส่ทะเบียนรถ') + '</div></div>' +
    '<div class="row-x">' + ICO.chev + '</div></button>').join('');

  h += '<div class="divider"></div><div class="sec-h"><span class="sec-t">พื้นที่เก็บข้อมูลในเครื่องนี้</span></div>' +
    '<div class="dl">' +
    '<div class="dl-r"><div class="dl-k">ร้านค้า</div><div class="dl-v tnum">' + S.stores.length + '</div></div>' +
    '<div class="dl-r"><div class="dl-k">งานทั้งหมด</div><div class="dl-v tnum">' + S.jobs.length + '</div></div>' +
    '<div class="dl-r"><div class="dl-k">รูปถ่าย</div><div class="dl-v tnum">' + pu.count + ' รูป · ' + byteLabel(pu.bytes) + '</div></div>' +
    (q ? '<div class="dl-r"><div class="dl-k">ใช้ไปทั้งหมด</div><div class="dl-v">' + byteLabel(q.used) +
      (q.total ? ' จาก ' + byteLabel(q.total) : '') + '</div></div>' : '') +
    '</div>';

  h += '<div class="note" style="margin-bottom:13px"><span class="ni">⚠️</span>' +
    '<div>ข้อมูลทั้งหมดเก็บอยู่ในเบราว์เซอร์ของเครื่องนี้เครื่องเดียว ' +
    'ถ้าล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่อง ข้อมูลจะหาย ' +
    '<b>ควรกดสำรองข้อมูลเก็บไว้ทุกสัปดาห์</b></div></div>';

  h += '<button class="btn btn-block" style="margin-bottom:8px" type="button" data-act="backup-open">' + ICO.dl + ' ไปหน้าสำรองข้อมูล</button>';
  h += '<button class="btn btn-danger btn-block" type="button" data-act="wipe">ลบข้อมูลทั้งหมดในเครื่องนี้</button>';

  openSheet(h);
};

ACT['wipe'] = () => {
  confirmSheet('ลบข้อมูลทั้งหมด?',
    'ร้านค้า งาน รูปถ่าย และคนขับทั้งหมดจะถูกลบถาวร <b>กู้คืนไม่ได้</b> ' +
    'ถ้ายังไม่ได้สำรองข้อมูล ให้กดยกเลิกแล้วไปสำรองก่อน',
    'ลบทั้งหมด', true, async () => {
      await DB.wipe();
      await DB.meta.set('myDriverId', null);
      await reload();
      await DB.drivers.put({ name: 'ฉัน', vehicle: '', phone: '', order: 1 });
      await reload();
      S.myDriverId = S.drivers[0].id;
      await DB.meta.set('myDriverId', S.myDriverId);
      closeSheet(true);
      render();
      toast('ลบข้อมูลทั้งหมดแล้ว');
    });
};

/* ======================= สำรองข้อมูล ======================= */

function download(filename, content, type) {
  const blob = (content instanceof Blob) ? content : new Blob([content], { type: type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
}

ACT['backup-open'] = async () => {
  const pu = await DB.photos.usage();
  openSheet(
    sheetHead('สำรองและกู้คืนข้อมูล') +
    '<div class="note info" style="margin-bottom:14px"><span class="ni">☁️</span>' +
    '<div>กดสำรองแล้วไฟล์จะถูกดาวน์โหลดลงเครื่อง จากนั้นเปิดแอป Google Drive แล้วอัปโหลดไฟล์นั้นเก็บไว้ ' +
    'หรือในมือถือกดแชร์ไฟล์ไปที่ Drive ได้เลย<br><br>' +
    'ไฟล์นี้เอากลับมาใส่เครื่องใหม่ได้ทั้งหมด รวมรูปถ่าย</div></div>' +

    '<div class="sec-h"><span class="sec-t">สำรองข้อมูล</span></div>' +
    '<button class="btn btn-pri btn-block" style="margin-bottom:8px" type="button" data-act="backup-full">' +
    ICO.dl + ' สำรองทั้งหมด รวมรูป (' + byteLabel(pu.bytes) + ')</button>' +
    '<button class="btn btn-block" style="margin-bottom:8px" type="button" data-act="backup-light">' +
    ICO.dl + ' สำรองเฉพาะข้อมูล ไม่รวมรูป (ไฟล์เล็ก)</button>' +
    '<button class="btn btn-block" type="button" data-act="export-jobs-all">' +
    ICO.dl + ' ส่งออกงานทั้งหมดเป็น CSV (เปิดใน Excel)</button>' +

    '<div class="divider"></div>' +
    '<div class="sec-h"><span class="sec-t">กู้คืนจากไฟล์สำรอง</span></div>' +
    '<button class="btn btn-block" style="margin-bottom:8px" type="button" data-act="restore" data-mode="merge">' +
    'กู้คืนแบบรวมกับข้อมูลเดิม</button>' +
    '<button class="btn btn-danger btn-block" type="button" data-act="restore" data-mode="replace">' +
    'กู้คืนแบบล้างของเดิมทิ้งก่อน</button>' +
    '<div class="f-hint" style="margin-top:9px">แบบรวมเหมาะกับการย้ายเครื่องหรือเพิ่มข้อมูล ' +
    'แบบล้างเหมาะกับการย้อนกลับไปใช้ไฟล์สำรองเก่า</div>'
  );
};

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}

ACT['backup-full'] = async () => {
  toast('กำลังเตรียมไฟล์สำรอง...');
  const data = await DB.exportAll(true);
  download('delivery-backup-' + stamp() + '.json', JSON.stringify(data), 'application/json');
  toast('สำรองข้อมูลแล้ว อย่าลืมอัปขึ้น Google Drive', 'ok', 4500);
};

ACT['backup-light'] = async () => {
  const data = await DB.exportAll(false);
  download('delivery-data-' + stamp() + '.json', JSON.stringify(data), 'application/json');
  toast('สำรองข้อมูล (ไม่รวมรูป) แล้ว', 'ok');
};

ACT['restore'] = (el) => {
  window._restoreMode = el.dataset.mode;
  if (el.dataset.mode === 'replace') {
    confirmSheet('ล้างของเดิมแล้วกู้คืน?',
      'ข้อมูลที่มีอยู่ในเครื่องนี้จะถูกลบก่อน แล้วใส่ข้อมูลจากไฟล์สำรองเข้าไปแทน',
      'เลือกไฟล์', true, async () => { document.getElementById('restoreInput').click(); });
  } else {
    document.getElementById('restoreInput').click();
  }
};

/* ======================= ส่งออก CSV ======================= */

function csv(rows) {
  const cell = (v) => {
    const s = (v === undefined || v === null) ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

function jobRows(list) {
  const rows = [[
    'วันที่', 'ลำดับ', 'ประเภท', 'ร้านค้า', 'รหัสร้าน', 'คนขับ', 'สถานะ',
    'เลขที่บิล/เอกสาร', 'ยอดเงิน', 'เก็บเงินปลายทาง', 'รับจริง', 'วิธีรับ',
    'เลขที่เช็ค', 'ธนาคาร', 'วันที่ลงเช็ค',
    'สาเหตุไม่สำเร็จ', 'รายละเอียด', 'นัดใหม่', 'รอบที่',
    'เวลาถึงร้าน', 'เวลาปิดงาน', 'จำนวนรูป', 'หมายเหตุ'
  ]];
  list.forEach((j) => {
    const st = storeById(j.storeId);
    const drv = driverById(j.driverId);
    const p = j.pay || {};
    const c = j.cod || {};
    const b = j.bill || {};
    rows.push([
      j.date, j.seq || '', (TY[j.type] || {}).label || j.type,
      j.storeName || (st && st.name) || '', (st && st.code) || '',
      drv ? drv.name : '', (ST[j.status] || {}).label || j.status,
      j.billNo || b.docNo || (p.billRefs || []).join(' '),
      jobAmount(j) || '',
      c.on ? c.expected : '', c.on ? c.received : '', c.on ? (PAY[c.method] || {}).label || '' : '',
      p.chequeNo || '', p.bank || '', p.chequeDate || '',
      (j.fail && j.fail.reason) || '', (j.fail && j.fail.note) || '',
      j.rescheduledTo || '', j.round || 1,
      clockOf(j.arrivedAt), clockOf(j.closedAt),
      (j.photos || []).length, j.note || ''
    ]);
  });
  return rows;
}

ACT['export-jobs'] = () => {
  const list = jobsOfDay(S.date, null);
  if (!list.length) { toast('วันนี้ยังไม่มีงาน', 'bad'); return; }
  download('งาน-' + S.date + '.csv', csv(jobRows(list)), 'text/csv;charset=utf-8');
  toast('ส่งออกแล้ว', 'ok');
};

ACT['export-jobs-all'] = () => {
  const list = S.jobs.slice().sort((a, b) =>
    String(a.date).localeCompare(String(b.date)) || (a.seq || 0) - (b.seq || 0));
  if (!list.length) { toast('ยังไม่มีงาน', 'bad'); return; }
  download('งานทั้งหมด-' + stamp() + '.csv', csv(jobRows(list)), 'text/csv;charset=utf-8');
  toast('ส่งออกแล้ว', 'ok');
};

ACT['export-failed'] = () => {
  const list = S.jobs.filter((j) => j.status === 'failed')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!list.length) { toast('ไม่มีข้อมูล', 'bad'); return; }
  download('ปิดงานไม่สำเร็จ-' + stamp() + '.csv', csv(jobRows(list)), 'text/csv;charset=utf-8');
  toast('ส่งออกแล้ว', 'ok');
};

ACT['export-cheques'] = () => {
  const list = jobsOfDay(S.date, null).filter((j) =>
    j.status === 'done' && j.type === 'cheque' && j.pay && (j.pay.method || 'cheque') === 'cheque');
  if (!list.length) { toast('วันนี้ยังไม่มีเช็ครับเข้า', 'bad'); return; }
  const rows = [['วันที่รับ', 'ร้านค้า', 'เลขที่เช็ค', 'ธนาคาร', 'วันที่ลงเช็ค', 'ยอดเงิน', 'ตัดบิล', 'คนขับ']];
  list.forEach((j) => {
    const drv = driverById(j.driverId);
    rows.push([j.date, j.storeName, j.pay.chequeNo, j.pay.bank, j.pay.chequeDate,
      j.pay.amount, (j.pay.billRefs || []).join(' '), drv ? drv.name : '']);
  });
  download('เช็ครับเข้า-' + S.date + '.csv', csv(rows), 'text/csv;charset=utf-8');
  toast('ส่งออกแล้ว', 'ok');
};
