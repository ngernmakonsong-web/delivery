/* ===========================================================
   auth.js — หน้าล็อกอิน ระบบสิทธิ์ และการจัดการบัญชีผู้ใช้
   =========================================================== */
'use strict';

/* ======================= หน้าล็อกอิน ======================= */

function authShell(inner) {
  return '<div id="authWrap"><div class="auth-card">' +
    '<div class="auth-logo"><img src="icons/icon-192.png" alt="" width="54" height="54"></div>' +
    '<h1 class="auth-t">ระบบจัดส่งสินค้า</h1>' +
    inner + '</div></div>';
}

function renderLogin(msg, offerFirstRun) {
  document.body.classList.add('auth-mode');
  document.getElementById('screen').innerHTML = authShell(
    '<p class="auth-s">เข้าสู่ระบบเพื่อดูงานของคุณ</p>' +
    (msg ? '<div class="note" style="margin-bottom:13px"><span class="ni">⚠️</span><div>' + esc(msg) + '</div></div>' : '') +
    '<div class="f"><label for="liUser">ชื่อผู้ใช้</label>' +
    '<input type="text" id="liUser" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="เช่น somchai"></div>' +
    '<div class="f"><label for="liPass">รหัสผ่าน</label>' +
    '<input type="password" id="liPass" autocomplete="current-password" placeholder="รหัสผ่าน"></div>' +
    '<div class="f-err" id="authErr" style="display:none"></div>' +
    '<button class="btn btn-pri btn-block" type="button" data-act="login">เข้าสู่ระบบ</button>' +
    (offerFirstRun
      ? '<button class="btn btn-ghost btn-block" style="margin-top:9px" type="button" data-act="go-first-run">' +
        'ยังไม่มีบัญชีผู้ดูแล สร้างคนแรก</button>'
      : '') +
    '<p class="auth-foot">ลืมรหัสผ่าน หรือยังไม่มีบัญชี ติดต่อหัวหน้างานให้สร้างให้</p>'
  );
  const u = document.getElementById('liUser');
  if (u) u.focus();
  const p = document.getElementById('liPass');
  if (p) p.addEventListener('keydown', (e) => { if (e.key === 'Enter') ACT['login'](); });
}

function renderFirstRun() {
  document.body.classList.add('auth-mode');
  document.getElementById('screen').innerHTML = authShell(
    '<p class="auth-s">ยังไม่มีผู้ใช้ในระบบ สร้างบัญชีผู้ดูแลคนแรก</p>' +
    '<div class="note info" style="margin-bottom:13px"><span class="ni">👑</span>' +
    '<div>บัญชีนี้จะเป็นผู้ดูแล เห็นงานทุกคน จัดงานได้ และสร้างบัญชีให้คนขับได้</div></div>' +
    '<div class="f"><label for="suName">ชื่อ-สกุล</label>' +
    '<input type="text" id="suName" placeholder="เช่น สมชาย ใจดี"></div>' +
    '<div class="f"><label for="suUser">ชื่อผู้ใช้สำหรับเข้าระบบ</label>' +
    '<input type="text" id="suUser" autocapitalize="none" spellcheck="false" placeholder="ภาษาอังกฤษ ไม่มีเว้นวรรค เช่น somchai">' +
    '<div class="f-hint">ใช้ตัวอักษรอังกฤษและตัวเลขเท่านั้น</div></div>' +
    '<div class="f"><label for="suPass">รหัสผ่าน</label>' +
    '<input type="password" id="suPass" autocomplete="new-password" placeholder="อย่างน้อย 6 ตัว"></div>' +
    '<div class="f"><label for="suPass2">ยืนยันรหัสผ่าน</label>' +
    '<input type="password" id="suPass2" autocomplete="new-password"></div>' +
    '<div class="f-err" id="authErr" style="display:none"></div>' +
    '<button class="btn btn-pri btn-block" type="button" data-act="signup-first">สร้างบัญชีผู้ดูแล</button>' +
    '<button class="btn btn-ghost btn-block" style="margin-top:9px" type="button" data-act="go-login">มีบัญชีอยู่แล้ว เข้าสู่ระบบ</button>'
  );
}

function renderAuthError(title, detail) {
  document.body.classList.add('auth-mode');
  document.getElementById('screen').innerHTML = authShell(
    '<p class="auth-s">' + esc(title) + '</p>' +
    '<div class="note" style="margin-bottom:13px"><span class="ni">⚠️</span><div>' + detail + '</div></div>' +
    '<button class="btn btn-block" type="button" data-act="reload-app">ลองใหม่</button>'
  );
}

function setAuthErr(msg) {
  const el = document.getElementById('authErr');
  if (el) { el.textContent = msg || ''; el.style.display = msg ? 'block' : 'none'; }
}

function validUsername(u) {
  return /^[a-z0-9._-]{3,30}$/.test(String(u || '').trim().toLowerCase());
}

ACT['reload-app'] = () => location.reload();
ACT['go-first-run'] = () => renderFirstRun();
ACT['go-login'] = () => renderLogin();

ACT['login'] = async () => {
  const u = (document.getElementById('liUser').value || '').trim();
  const p = document.getElementById('liPass').value || '';
  if (!u) { setAuthErr('ยังไม่ได้ใส่ชื่อผู้ใช้'); return; }
  if (!p) { setAuthErr('ยังไม่ได้ใส่รหัสผ่าน'); return; }

  const btn = document.querySelector('[data-act="login"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> กำลังเข้าระบบ...';
  setAuthErr('');
  try {
    await Cloud.signIn(u, p);
    await startApp();
  } catch (e) {
    setAuthErr(e.message);
    btn.disabled = false;
    btn.textContent = 'เข้าสู่ระบบ';
  }
};

ACT['signup-first'] = async () => {
  const name = (document.getElementById('suName').value || '').trim();
  const u = (document.getElementById('suUser').value || '').trim().toLowerCase();
  const p = document.getElementById('suPass').value || '';
  const p2 = document.getElementById('suPass2').value || '';

  if (!name) { setAuthErr('ยังไม่ได้ใส่ชื่อ'); return; }
  if (!validUsername(u)) { setAuthErr('ชื่อผู้ใช้ต้องเป็นตัวอักษรอังกฤษหรือตัวเลข 3-30 ตัว ไม่มีเว้นวรรค'); return; }
  if (p.length < 6) { setAuthErr('รหัสผ่านต้องอย่างน้อย 6 ตัว'); return; }
  if (p !== p2) { setAuthErr('รหัสผ่านสองช่องไม่ตรงกัน'); return; }

  const btn = document.querySelector('[data-act="signup-first"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> กำลังสร้างบัญชี...';
  setAuthErr('');
  try {
    await Cloud.signUpFirst(u, p, name);
    await startApp();
    toast('สร้างบัญชีผู้ดูแลแล้ว ยินดีต้อนรับ', 'ok', 4000);
  } catch (e) {
    setAuthErr(e.message);
    btn.disabled = false;
    btn.textContent = 'สร้างบัญชีผู้ดูแล';
  }
};

/** เมนูบัญชีที่เปิดจากไอคอนมุมขวาบน */
ACT['account-menu'] = () => {
  if (!S.cloud) {
    toast('โหมดนี้ยังไม่ได้ต่อเซิร์ฟเวอร์ จึงไม่มีระบบเข้าออก', '', 3000);
    return;
  }
  const p = S.me;
  if (!p) { renderLogin(); return; }
  const role = ({ driver: 'คนขับ', office: 'ออฟฟิศ / CS', admin: 'ผู้ดูแล' })[p.role] || p.role;

  let h = sheetHead(p.name, p.username + ' · ' + role);

  h += '<div class="dl">' +
    '<div class="dl-r"><div class="dl-k">ชื่อผู้ใช้</div><div class="dl-v mono">' + esc(p.username) + '</div></div>' +
    '<div class="dl-r"><div class="dl-k">สิทธิ์</div><div class="dl-v">' + esc(role) + '</div></div>' +
    (p.vehicle ? '<div class="dl-r"><div class="dl-k">ทะเบียนรถ</div><div class="dl-v">' + esc(p.vehicle) + '</div></div>' : '') +
    '</div>';

  h += '<div class="actions">' +
    '<button class="btn btn-block" type="button" data-act="passwd">เปลี่ยนรหัสผ่านของฉัน</button>' +
    (canSeeOffice()
      ? '<button class="btn btn-block" type="button" data-act="users-open">จัดการบัญชีผู้ใช้</button>' : '') +
    '<button class="btn btn-danger btn-block" type="button" data-act="logout">' +
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M15 17l5-5-5-5M20 12H9M11 3H5a1 1 0 00-1 1v16a1 1 0 001 1h6"/></svg>' +
    ' ออกจากระบบ</button>' +
    '</div>';

  openSheet(h);
};

ACT['logout'] = () => {
  confirmSheet('ออกจากระบบ?', 'งานที่บันทึกไว้แล้วอยู่บนเซิร์ฟเวอร์ ไม่หายไปไหน', 'ออกจากระบบ', false, async () => {
    await Cloud.signOut();
    location.reload();
  });
};

/* ======================= จัดการบัญชีผู้ใช้ ======================= */

const ROLES = {
  driver: { label: 'คนขับ', desc: 'เห็นเฉพาะงานที่มอบหมายให้ตัวเอง' },
  office: { label: 'ออฟฟิศ / CS', desc: 'เห็นงานทุกคน จัดงานและย้ายงานได้' },
  admin:  { label: 'ผู้ดูแล', desc: 'เห็นทุกอย่าง และสร้างบัญชีผู้ใช้ได้' }
};

ACT['users-open'] = async () => {
  const list = await Cloud.client().from('profiles').select('*').order('sort_order').order('name');
  const rows = (list.data || []);
  const meId = Cloud.current() ? Cloud.current().id : '';

  let h = sheetHead('บัญชีผู้ใช้', rows.length + ' คน');

  if (Cloud.isAdmin()) {
    h += '<button class="btn btn-pri btn-block" style="margin-bottom:13px" type="button" data-act="user-new">' +
      ICO.plus + ' สร้างบัญชีใหม่</button>';
  }

  h += rows.map((r) => {
    const role = ROLES[r.role] || ROLES.driver;
    const isMe = r.id === meId;
    return '<button class="row' + (r.active === false ? ' row-warn' : '') + '" type="button" ' +
      (Cloud.isAdmin() ? 'data-act="user-edit" data-id="' + esc(r.id) + '"' : '') + '>' +
      '<div class="row-ico">' + esc(initials(r.name)) + '</div>' +
      '<div class="row-main"><div class="row-t">' + esc(r.name) +
        (isMe ? ' <span class="chip">คุณ</span>' : '') +
        (r.active === false ? ' <span class="chip st-failed">ปิดใช้งาน</span>' : '') + '</div>' +
      '<div class="row-s">' + esc(r.username) + ' · ' + role.label +
        (r.vehicle ? ' · ' + esc(r.vehicle) : '') + '</div></div>' +
      (Cloud.isAdmin() ? '<div class="row-x">' + ICO.chev + '</div>' : '') +
      '</button>';
  }).join('');

  if (!Cloud.isAdmin()) {
    h += '<div class="note info" style="margin-top:11px"><span class="ni">ℹ️</span>' +
      '<div>เฉพาะผู้ดูแลเท่านั้นที่สร้างหรือแก้ไขบัญชีได้</div></div>';
  }

  h += '<div class="divider"></div>' +
    '<button class="btn btn-block" style="margin-bottom:8px" type="button" data-act="passwd">เปลี่ยนรหัสผ่านของฉัน</button>' +
    '<button class="btn btn-danger btn-block" type="button" data-act="logout">ออกจากระบบ</button>';

  openSheet(h);
};

function userFormHtml(u) {
  const isNew = !u;
  u = u || {};
  const role = u.role || 'driver';
  return sheetHead(isNew ? 'สร้างบัญชีใหม่' : 'แก้ไขบัญชี', isNew ? '' : u.name, true) +
    '<div class="f"><label for="uName">ชื่อ-สกุล <span style="color:var(--s-failed)">*</span></label>' +
    '<input type="text" id="uName" value="' + esc(u.name || '') + '" placeholder="เช่น สมชาย ใจดี"></div>' +

    (isNew
      ? '<div class="f"><label for="uUser">ชื่อผู้ใช้ <span style="color:var(--s-failed)">*</span></label>' +
        '<input type="text" id="uUser" autocapitalize="none" spellcheck="false" placeholder="ภาษาอังกฤษ ไม่มีเว้นวรรค">' +
        '<div class="f-hint">คนขับใช้ชื่อนี้เข้าระบบ ตั้งแล้วเปลี่ยนไม่ได้</div></div>' +
        '<div class="f"><label for="uPass">รหัสผ่านเริ่มต้น <span style="color:var(--s-failed)">*</span></label>' +
        '<input type="text" id="uPass" placeholder="อย่างน้อย 6 ตัว" value="' + esc(suggestPass()) + '">' +
        '<div class="f-hint">บอกรหัสนี้ให้เจ้าตัว แล้วให้เขาเปลี่ยนเองภายหลังได้</div></div>'
      : '<div class="dl" style="margin-bottom:12px"><div class="dl-r">' +
        '<div class="dl-k">ชื่อผู้ใช้</div><div class="dl-v mono">' + esc(u.username) + '</div></div></div>') +

    '<div class="f"><div class="f-lab">สิทธิ์การใช้งาน</div>' +
    Object.keys(ROLES).map((k) =>
      '<label class="check" style="margin-bottom:7px">' +
      '<input type="radio" name="urole" value="' + k + '"' + (role === k ? ' checked' : '') + '>' +
      '<span>' + ROLES[k].label + '<br><span class="muted" style="font-size:12px">' + ROLES[k].desc + '</span></span>' +
      '</label>').join('') + '</div>' +

    '<div class="f-2" style="margin-bottom:12px">' +
    '<div class="f"><label for="uVeh">ทะเบียนรถ</label><input type="text" id="uVeh" value="' + esc(u.vehicle || '') + '"></div>' +
    '<div class="f"><label for="uPhone">เบอร์โทร</label><input type="tel" id="uPhone" inputmode="tel" value="' + esc(u.phone || '') + '"></div>' +
    '</div>' +

    (isNew ? '' :
      '<label class="check" style="margin-bottom:12px">' +
      '<input type="checkbox" id="uActive"' + (u.active !== false ? ' checked' : '') + '>' +
      '<span>เปิดใช้งานบัญชีนี้<br><span class="muted" style="font-size:12px">ปิดไว้แล้วจะเข้าระบบไม่ได้ แต่ประวัติงานยังอยู่</span></span>' +
      '</label>') +

    '<div class="f-err" id="formErr" style="display:none"></div>' +
    '<button class="btn btn-pri btn-block" type="button" data-act="user-save" data-id="' + esc(u.id || '') + '">' +
    (isNew ? 'สร้างบัญชี' : 'บันทึก') + '</button>' +

    (isNew ? '' :
      '<div class="divider"></div>' +
      '<div class="note info" style="margin-bottom:11px"><span class="ni">🔑</span>' +
      '<div><b>ลืมรหัสผ่าน</b> ตั้งใหม่ให้คนอื่นจากในแอปไม่ได้ ' +
      'ให้ไปที่ Supabase → Authentication → Users → คลิกที่บัญชีนั้น → Reset password<br>' +
      'หรือจะลบบัญชีนี้แล้วสร้างใหม่ด้วยรหัสใหม่ก็ได้</div></div>' +
      '<div id="uJobInfo" class="muted" style="font-size:13px;margin-bottom:9px">กำลังนับงานของบัญชีนี้...</div>' +
      '<button class="btn btn-danger btn-block" type="button" data-act="user-del" data-id="' + esc(u.id) + '" ' +
      'data-name="' + esc(u.name) + '">ลบบัญชีนี้ถาวร</button>');
}

/** นับงานของบัญชี แล้วเติมลงในฟอร์มแก้ไข */
async function fillUserJobInfo(userId) {
  const box = document.getElementById('uJobInfo');
  if (!box) return;
  try {
    const all = await Cloud.client().from('jobs').select('id,status').eq('driver_id', userId);
    const list = all.data || [];
    const open = list.filter((j) => j.status !== 'done' && j.status !== 'failed').length;
    box.innerHTML = list.length
      ? 'บัญชีนี้มีงานผูกอยู่ <b>' + list.length + '</b> รายการ (ยังไม่ปิด ' + open + ')' +
        '<br>ถ้าลบ ต้องเลือกโอนงานให้คนอื่นก่อน'
      : 'บัญชีนี้ยังไม่มีงานผูกอยู่ ลบได้เลย';
  } catch (e) { box.textContent = ''; }
}

function suggestPass() {
  const a = 'abcdefghjkmnpqrstuvwxyz';
  const n = '23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
  for (let i = 0; i < 4; i++) s += n[Math.floor(Math.random() * n.length)];
  return s;
}

ACT['user-new'] = () => openSheet(userFormHtml(null));

ACT['user-edit'] = async (el) => {
  const { data } = await Cloud.client().from('profiles').select('*').eq('id', el.dataset.id).maybeSingle();
  if (!data) { toast('ไม่พบบัญชีนี้', 'bad'); return; }
  openSheet(userFormHtml(data), () => fillUserJobInfo(data.id));
};

/* ---- ลบบัญชี ---- */

ACT['user-del'] = async (el) => {
  const id = el.dataset.id;
  const name = el.dataset.name || '';
  const meId = Cloud.current() ? Cloud.current().id : '';

  if (id === meId) { toast('ลบบัญชีของตัวเองไม่ได้', 'bad', 3500); return; }

  const { data } = await Cloud.client().from('jobs').select('id,status').eq('driver_id', id);
  const list = data || [];
  const others = S.drivers.filter((d) => d.id !== id);

  if (list.length && !others.length) {
    toast('ต้องมีผู้ใช้อื่นอย่างน้อย 1 คนไว้รับโอนงานก่อน', 'bad', 4000);
    return;
  }

  let h = sheetHead('ลบบัญชี ' + name + '?', '', true);

  h += '<div class="note" style="margin-bottom:13px"><span class="ni">⚠️</span><div>' +
    'บัญชีนี้จะเข้าระบบไม่ได้อีก และหายไปจากรายชื่อคนขับ<br>' +
    '<b>ถ้าแค่อยากพักงานชั่วคราว</b> แนะนำให้กดยกเลิกแล้วติ๊ก "เปิดใช้งานบัญชีนี้" ออกแทน ' +
    'ซึ่งย้อนกลับได้</div></div>';

  if (list.length) {
    h += '<div class="f"><label for="delMove">โอนงาน ' + list.length + ' รายการไปให้ใคร</label>' +
      '<select id="delMove">' +
      others.map((d) => '<option value="' + esc(d.id) + '">' + esc(d.name) +
        (d.vehicle ? ' · ' + esc(d.vehicle) : '') + '</option>').join('') +
      '</select>' +
      '<div class="f-hint">ประวัติงานเดิมจะยังอยู่ครบ แต่จะแสดงว่าเป็นงานของคนที่รับโอน</div></div>';
  } else {
    h += '<p class="muted" style="margin:-4px 0 13px;font-size:13.5px">บัญชีนี้ไม่มีงานผูกอยู่</p>';
  }

  h += '<div class="note info" style="margin-bottom:13px"><span class="ni">ℹ️</span><div>' +
    'การเข้าสู่ระบบของบัญชีนี้จะถูกตัดทันที แต่ชื่อผู้ใช้จะยังถูกจองอยู่ในระบบยืนยันตัวตน ' +
    'ถ้าต้องการใช้ชื่อเดิมซ้ำ ให้ลบที่ Supabase → Authentication → Users ด้วย</div></div>';

  h += '<div class="f-err" id="formErr" style="display:none"></div>' +
    '<button class="btn btn-danger btn-block" type="button" data-act="user-del-go" ' +
    'data-id="' + esc(id) + '" data-n="' + list.length + '">ยืนยันลบบัญชี</button>' +
    '<button class="btn btn-ghost btn-block" style="margin-top:8px" type="button" data-act="sheet-back">ยกเลิก</button>';

  openSheet(h);
};

ACT['user-del-go'] = async (el) => {
  const id = el.dataset.id;
  const n = Number(el.dataset.n || 0);
  el.disabled = true;
  el.innerHTML = '<span class="spin"></span> กำลังลบ...';
  try {
    if (n) {
      const to = val('delMove');
      if (!to) throw new Error('ยังไม่ได้เลือกคนรับโอนงาน');
      const { error } = await Cloud.client().from('jobs').update({ driver_id: to }).eq('driver_id', id);
      if (error) throw new Error('โอนงานไม่สำเร็จ: ' + error.message);
    }
    const { error: e2 } = await Cloud.client().from('profiles').delete().eq('id', id);
    if (e2) throw new Error('ลบบัญชีไม่สำเร็จ: ' + e2.message);

    await reload();
    closeSheet(true);
    render();
    toast(n ? 'ลบบัญชีแล้ว โอนงาน ' + n + ' รายการเรียบร้อย' : 'ลบบัญชีแล้ว', 'ok', 3800);
    ACT['users-open']();
  } catch (e) {
    setErr(e.message);
    el.disabled = false;
    el.textContent = 'ยืนยันลบบัญชี';
  }
};

ACT['user-save'] = async (el) => {
  const id = el.dataset.id;
  const name = val('uName');
  const roleEl = document.querySelector('input[name="urole"]:checked');
  const role = roleEl ? roleEl.value : 'driver';
  if (!name) { setErr('ยังไม่ได้ใส่ชื่อ'); return; }

  const btn = el;
  btn.disabled = true;
  const label = btn.textContent;
  btn.innerHTML = '<span class="spin"></span> กำลังบันทึก...';

  try {
    if (id) {
      const { error } = await Cloud.client().from('profiles').update({
        name: name, role: role, vehicle: val('uVeh') || null,
        phone: val('uPhone') || null, active: checked('uActive')
      }).eq('id', id);
      if (error) throw new Error(error.message);
      toast('บันทึกแล้ว', 'ok');
    } else {
      const u = val('uUser').toLowerCase();
      const p = val('uPass');
      if (!validUsername(u)) throw new Error('ชื่อผู้ใช้ต้องเป็นตัวอักษรอังกฤษหรือตัวเลข 3-30 ตัว ไม่มีเว้นวรรค');
      if (p.length < 6) throw new Error('รหัสผ่านต้องอย่างน้อย 6 ตัว');
      await Cloud.createUser({
        username: u, password: p, name: name, role: role,
        vehicle: val('uVeh'), phone: val('uPhone')
      });
      closeSheet(true);
      openSheet(
        sheetHead('สร้างบัญชีแล้ว', name) +
        '<div class="note info" style="margin-bottom:14px"><span class="ni">✓</span>' +
        '<div>ส่งข้อมูลนี้ให้เจ้าตัวเพื่อเข้าระบบ</div></div>' +
        '<div class="dl">' +
        '<div class="dl-r"><div class="dl-k">ชื่อผู้ใช้</div><div class="dl-v mono big">' + esc(u) + '</div></div>' +
        '<div class="dl-r"><div class="dl-k">รหัสผ่าน</div><div class="dl-v mono big">' + esc(p) + '</div></div>' +
        '<div class="dl-r"><div class="dl-k">สิทธิ์</div><div class="dl-v">' + ROLES[role].label + '</div></div>' +
        '</div>' +
        '<div class="note" style="margin-bottom:13px"><span class="ni">🔑</span>' +
        '<div>จดรหัสนี้ไว้ก่อนปิดหน้านี้ ระบบไม่แสดงอีก ถ้าลืมให้ผู้ดูแลตั้งใหม่ให้</div></div>' +
        '<button class="btn btn-pri btn-block" type="button" data-act="users-open">กลับไปหน้าบัญชีผู้ใช้</button>'
      );
      await reload();
      render();
      return;
    }
    await reload();
    closeSheet(true);
    render();
  } catch (e) {
    setErr(e.message);
    btn.disabled = false;
    btn.textContent = label;
  }
};

ACT['passwd'] = () => {
  openSheet(
    sheetHead('เปลี่ยนรหัสผ่านของฉัน', Cloud.current() ? Cloud.current().username : '', true) +
    '<div class="f"><label for="pwNew">รหัสผ่านใหม่</label>' +
    '<input type="password" id="pwNew" autocomplete="new-password" placeholder="อย่างน้อย 6 ตัว"></div>' +
    '<div class="f"><label for="pwNew2">ยืนยันรหัสผ่านใหม่</label>' +
    '<input type="password" id="pwNew2" autocomplete="new-password"></div>' +
    '<div class="f-err" id="formErr" style="display:none"></div>' +
    '<button class="btn btn-pri btn-block" type="button" data-act="passwd-save">เปลี่ยนรหัสผ่าน</button>'
  );
};

ACT['passwd-save'] = async (el) => {
  const a = val('pwNew'), b = val('pwNew2');
  if (a.length < 6) { setErr('รหัสผ่านต้องอย่างน้อย 6 ตัว'); return; }
  if (a !== b) { setErr('รหัสผ่านสองช่องไม่ตรงกัน'); return; }
  el.disabled = true;
  el.innerHTML = '<span class="spin"></span> กำลังเปลี่ยน...';
  try {
    await Cloud.changePassword(a);
    closeSheet(true);
    toast('เปลี่ยนรหัสผ่านแล้ว', 'ok');
  } catch (e) {
    setErr(e.message);
    el.disabled = false;
    el.textContent = 'เปลี่ยนรหัสผ่าน';
  }
};

/* ======================= ย้ายข้อมูลเดิมขึ้นคลาวด์ ======================= */

ACT['migrate'] = () => {
  confirmSheet('ย้ายข้อมูลเดิมขึ้นเซิร์ฟเวอร์?',
    'ร้านค้าและงานที่เคยบันทึกไว้ในเครื่องนี้จะถูกคัดลอกขึ้นเซิร์ฟเวอร์ ' +
    'งานทั้งหมดจะถูกมอบหมายให้บัญชีของคุณ แล้วค่อยย้ายให้คนอื่นทีหลังได้<br><br>' +
    '<b>รูปถ่ายเดิมย้ายอัตโนมัติไม่ได้</b> ยังอยู่ในเครื่องนี้เหมือนเดิม',
    'ย้ายข้อมูล', false, async () => {
      openSheet(sheetHead('กำลังย้ายข้อมูล') +
        '<div class="loadwrap"><div class="spin"></div></div>' +
        '<p class="center muted" id="migStep">กำลังเริ่ม...</p>');
      try {
        const n = await Cloud.migrateLocal((s) => {
          const el = document.getElementById('migStep');
          if (el) el.textContent = s;
        });
        await reload();
        closeSheet(true);
        render();
        toast('ย้ายขึ้นเซิร์ฟเวอร์แล้ว ร้าน ' + n.stores + ' · งาน ' + n.jobs +
          (n.skipped ? ' (ข้าม ' + n.skipped + ')' : ''), 'ok', 5000);
      } catch (e) {
        closeSheet(true);
        toast('ย้ายข้อมูลไม่สำเร็จ: ' + e.message, 'bad', 5000);
      }
    });
};
