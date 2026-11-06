-- ============================================================
--  ระบบจัดส่งสินค้า — โครงฐานข้อมูลและกฎสิทธิ์
--  วางทั้งไฟล์นี้ลงใน Supabase → SQL Editor → Run
--  รันซ้ำได้ ไม่พัง
-- ============================================================

-- ------------------------------------------------------------
-- 1) ผู้ใช้งานและบทบาท
--    driver = คนขับ เห็นเฉพาะงานตัวเอง
--    office = CS / หัวหน้าจัดส่ง เห็นงานทุกคน
--    admin  = ผู้ดูแล เห็นทุกอย่าง + สร้างบัญชีได้
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  name        text not null,
  role        text not null default 'driver' check (role in ('driver','office','admin')),
  vehicle     text,
  phone       text,
  active      boolean not null default true,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2) ร้านค้า
-- ------------------------------------------------------------
create table if not exists public.stores (
  id           uuid primary key default gen_random_uuid(),
  code         text,
  name         text not null,
  address      text,
  phone        text,
  contact_name text,
  open_from    text,
  open_to      text,
  open_hours   text,
  billing      jsonb,
  note         text,
  lat          double precision,
  lng          double precision,
  deleted      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists stores_code_idx on public.stores (lower(code));
create index if not exists stores_name_idx on public.stores (name);

-- ------------------------------------------------------------
-- 3) งาน
-- ------------------------------------------------------------
create table if not exists public.jobs (
  id             uuid primary key default gen_random_uuid(),
  date           date not null,
  type           text not null check (type in ('deliver','bill','cheque')),
  store_id       uuid references public.stores(id) on delete set null,
  store_name     text,
  driver_id      uuid references public.profiles(id) on delete set null,
  status         text not null default 'assigned'
                 check (status in ('pending','assigned','enroute','arrived','done','failed')),
  seq            int not null default 0,
  bill_no        text,
  amount         numeric,
  items          jsonb default '[]'::jsonb,
  cod            jsonb,
  bill           jsonb,
  pay            jsonb,
  note           text,
  close_note     text,
  photos         jsonb default '[]'::jsonb,
  events         jsonb default '[]'::jsonb,
  fail           jsonb,
  rescheduled_to date,
  parent_job_id  uuid,
  child_job_id   uuid,
  round          int not null default 1,
  arrived_at     timestamptz,
  closed_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists jobs_date_idx   on public.jobs (date);
create index if not exists jobs_driver_idx on public.jobs (driver_id, date);
create index if not exists jobs_store_idx  on public.jobs (store_id);

-- ------------------------------------------------------------
-- 4) ตำแหน่งล่าสุดของคนขับ (ให้ออฟฟิศเห็นรถแบบสด)
-- ------------------------------------------------------------
create table if not exists public.driver_positions (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  lat       double precision,
  lng       double precision,
  acc       real,
  at        timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5) อัปเดตเวลาแก้ไขอัตโนมัติ
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists stores_touch on public.stores;
create trigger stores_touch before update on public.stores
  for each row execute function public.touch_updated_at();

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 6) ตัวช่วยเช็กบทบาท
--    security definer เพื่อให้อ่าน profiles ได้โดยไม่ติดกฎของตัวเอง
--    (ไม่งั้นจะวนลูปไม่รู้จบตอนตรวจสิทธิ์)
-- ------------------------------------------------------------
create or replace function public.is_office()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('office','admin') and active
  );
$$;

create or replace function public.is_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

-- ------------------------------------------------------------
-- 7) เปิดการจำกัดสิทธิ์ระดับแถว
-- ------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.stores           enable row level security;
alter table public.jobs             enable row level security;
alter table public.driver_positions enable row level security;

-- ---- profiles ----
-- ทุกคนที่ล็อกอินอ่านได้ เพราะต้องเห็นชื่อคนขับบนงาน
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

-- ยังไม่มีผู้ดูแลเลย = ยังตั้งระบบไม่เสร็จ คนแรกจึงตั้งตัวเองเป็นผู้ดูแลได้
create or replace function public.no_admin_yet()
returns boolean language sql security definer stable
set search_path = public as $$
  select not exists (select 1 from public.profiles where role = 'admin');
$$;

-- สร้างโปรไฟล์: ผู้ดูแลสร้างให้ใครก็ได้
-- คนทั่วไปสร้างได้เฉพาะของตัวเอง และบังคับเป็น driver เท่านั้น
-- (ยกเว้นคนแรกสุดของระบบ ที่ยังไม่มีผู้ดูแล)
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (
    public.is_admin()
    or (id = auth.uid() and (role = 'driver' or public.no_admin_yet()))
  );

-- แก้ของตัวเองได้ หรือผู้ดูแลแก้ของใครก็ได้
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- กันคนขับเลื่อนขั้นตัวเองเป็นออฟฟิศ หรือเปิดบัญชีที่ถูกปิดไว้
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active)
     and not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลเท่านั้นที่เปลี่ยนบทบาทหรือเปิดปิดบัญชีได้';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---- stores ----
-- คนขับต้องเพิ่มร้านหน้างานและแก้หมุดได้ จึงให้ทุกคนที่ล็อกอินจัดการได้
drop policy if exists stores_select on public.stores;
create policy stores_select on public.stores
  for select to authenticated using (true);

drop policy if exists stores_write on public.stores;
create policy stores_write on public.stores
  for insert to authenticated with check (true);

drop policy if exists stores_update on public.stores;
create policy stores_update on public.stores
  for update to authenticated using (true) with check (true);

-- ลบร้านได้เฉพาะออฟฟิศ
drop policy if exists stores_delete on public.stores;
create policy stores_delete on public.stores
  for delete to authenticated using (public.is_office());

-- ---- jobs : หัวใจของเรื่องสิทธิ์ ----
-- คนขับเห็นเฉพาะงานที่มอบหมายให้ตัวเอง ออฟฟิศเห็นทั้งหมด
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs
  for select to authenticated
  using (driver_id = auth.uid() or public.is_office());

-- คนขับแก้ได้เฉพาะงานตัวเอง และห้ามโยนงานให้คนอื่น
drop policy if exists jobs_update on public.jobs;
create policy jobs_update on public.jobs
  for update to authenticated
  using (driver_id = auth.uid() or public.is_office())
  with check (driver_id = auth.uid() or public.is_office());

-- สร้างงานได้: ออฟฟิศสร้างให้ใครก็ได้ คนขับสร้างได้เฉพาะของตัวเอง
drop policy if exists jobs_insert on public.jobs;
create policy jobs_insert on public.jobs
  for insert to authenticated
  with check (public.is_office() or driver_id = auth.uid());

-- ลบงานได้เฉพาะออฟฟิศ
drop policy if exists jobs_delete on public.jobs;
create policy jobs_delete on public.jobs
  for delete to authenticated using (public.is_office());

-- ---- driver_positions ----
drop policy if exists dp_select on public.driver_positions;
create policy dp_select on public.driver_positions
  for select to authenticated
  using (driver_id = auth.uid() or public.is_office());

drop policy if exists dp_upsert on public.driver_positions;
create policy dp_upsert on public.driver_positions
  for insert to authenticated with check (driver_id = auth.uid());

drop policy if exists dp_update on public.driver_positions;
create policy dp_update on public.driver_positions
  for update to authenticated
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());

-- ------------------------------------------------------------
-- 7.5) ให้หน้าล็อกอินถามได้ว่าระบบตั้งค่าเสร็จหรือยัง
--      คืนค่าแค่ใช่/ไม่ใช่ ไม่เปิดเผยข้อมูลผู้ใช้
-- ------------------------------------------------------------
create or replace function public.system_initialized()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (select 1 from public.profiles where role = 'admin');
$$;

grant execute on function public.system_initialized() to anon, authenticated;

-- ------------------------------------------------------------
-- 8) ที่เก็บรูปถ่าย
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects
  for select using (bucket_id = 'photos');

drop policy if exists photos_insert on storage.objects;
create policy photos_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');

drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects
  for delete to authenticated using (bucket_id = 'photos');

-- ------------------------------------------------------------
-- 9) เปิดการแจ้งเตือนแบบสด ให้ออฟฟิศเห็นความเคลื่อนไหวทันที
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.stores;
alter publication supabase_realtime add table public.driver_positions;
alter publication supabase_realtime add table public.profiles;

-- ============================================================
--  เสร็จแล้ว
-- ============================================================
