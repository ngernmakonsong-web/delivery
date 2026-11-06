-- ============================================================
--  ส่วนเพิ่มเติม: ลบบัญชี, ปิดงานไม่มีรูป, คำขอย้ายงาน
--  รันต่อจาก supabase-setup.sql ที่รันไปแล้ว  รันซ้ำได้ไม่พัง
-- ============================================================

-- 1) เปิดสิทธิ์ลบบัญชี (เฉพาะผู้ดูแล และลบตัวเองไม่ได้)
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.is_admin() and id <> auth.uid());

-- 2) ช่องเก็บว่างานไหนปิดโดยไม่มีรูป
alter table public.jobs
  add column if not exists closed_without_photo boolean not null default false;

-- ------------------------------------------------------------
--  การตรวจงาน
--  คนขับปิดงาน -> เข้าคิวรอตรวจ
--  หัวหน้า/ผู้ดูแล ตรวจแล้วกด ผ่าน หรือ ไม่ผ่าน
--  ไม่ผ่าน = ส่งกลับให้คนขับแก้ สถานะกลับไปเป็น "ถึงร้าน"
-- ------------------------------------------------------------
alter table public.jobs
  add column if not exists review_status text not null default 'none';
alter table public.jobs
  add column if not exists review_note  text;
alter table public.jobs
  add column if not exists reviewed_by  uuid references public.profiles(id) on delete set null;
alter table public.jobs
  add column if not exists reviewed_at  timestamptz;

create index if not exists jobs_review_idx
  on public.jobs (review_status) where review_status = 'pending';

-- 3) ตารางคำขอย้ายงาน
create table if not exists public.job_transfers (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  from_driver uuid references public.profiles(id) on delete set null,
  to_driver   uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending','approved','rejected','cancelled')),
  note        text,
  decided_by  uuid references public.profiles(id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists jt_to_idx   on public.job_transfers (to_driver, status);
create index if not exists jt_from_idx on public.job_transfers (from_driver, status);
create index if not exists jt_job_idx  on public.job_transfers (job_id);
create unique index if not exists jt_one_pending
  on public.job_transfers (job_id) where status = 'pending';

alter table public.job_transfers enable row level security;

drop policy if exists jt_select on public.job_transfers;
create policy jt_select on public.job_transfers
  for select to authenticated
  using (from_driver = auth.uid() or to_driver = auth.uid() or public.is_office());

drop policy if exists jt_insert on public.job_transfers;
create policy jt_insert on public.job_transfers
  for insert to authenticated
  with check (
    from_driver = auth.uid()
    and to_driver <> auth.uid()
    and exists (select 1 from public.jobs j where j.id = job_id and j.driver_id = auth.uid())
  );

drop policy if exists jt_update on public.job_transfers;
create policy jt_update on public.job_transfers
  for update to authenticated
  using (from_driver = auth.uid() or public.is_office())
  with check (from_driver = auth.uid() or public.is_office());

-- 4) ฟังก์ชันอนุมัติ / ปฏิเสธ
create or replace function public.approve_transfer(t_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare t public.job_transfers;
begin
  select * into t from public.job_transfers where id = t_id and status = 'pending';
  if not found then raise exception 'ไม่พบคำขอย้ายงานนี้ หรือถูกดำเนินการไปแล้ว'; end if;
  if not (t.to_driver = auth.uid() or public.is_office()) then
    raise exception 'เฉพาะคนขับที่รับงาน หรือหัวหน้างาน เท่านั้นที่อนุมัติได้';
  end if;
  update public.jobs
     set driver_id = t.to_driver,
         status = case when status = 'pending' then 'assigned' else status end
   where id = t.job_id;
  update public.job_transfers
     set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = t_id;
end $$;

create or replace function public.reject_transfer(t_id uuid, why text default null)
returns void language plpgsql security definer
set search_path = public as $$
declare t public.job_transfers;
begin
  select * into t from public.job_transfers where id = t_id and status = 'pending';
  if not found then raise exception 'ไม่พบคำขอย้ายงานนี้ หรือถูกดำเนินการไปแล้ว'; end if;
  if not (t.to_driver = auth.uid() or public.is_office()) then
    raise exception 'เฉพาะคนขับที่รับงาน หรือหัวหน้างาน เท่านั้นที่ปฏิเสธได้';
  end if;
  update public.job_transfers
     set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
         note = coalesce(why, note)
   where id = t_id;
end $$;

grant execute on function public.approve_transfer(uuid) to authenticated;
grant execute on function public.reject_transfer(uuid, text) to authenticated;

-- 5) เปิดการแจ้งเตือนแบบสดของตารางใหม่
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.job_transfers';
  exception when others then raise notice 'ข้าม job_transfers: %', sqlerrm;
  end;
end $$;

-- ------------------------------------------------------------
--  งานที่ปิดแล้ว ล็อกไม่ให้คนขับแก้
--  ตรวจงานย้อนหลังได้เฉพาะหัวหน้างานและผู้ดูแลระบบ
-- ------------------------------------------------------------
create or replace function public.guard_closed_jobs()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if old.status in ('done','failed') and not public.is_office() then
    raise exception 'งานที่ปิดแล้วแก้ไขได้เฉพาะหัวหน้างานหรือผู้ดูแลระบบ';
  end if;
  return new;
end $$;

drop trigger if exists jobs_guard_closed on public.jobs;
create trigger jobs_guard_closed before update on public.jobs
  for each row execute function public.guard_closed_jobs();

notify pgrst, 'reload schema';

-- 6) ตรวจผล
select
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='job_transfers')        as "ตารางคำขอย้ายงาน (ต้องเป็น 1)",
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('approve_transfer','reject_transfer')) as "ฟังก์ชันอนุมัติ (ต้องเป็น 2)",
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='jobs'
       and column_name='closed_without_photo')                          as "ช่องปิดงานไม่มีรูป (ต้องเป็น 1)",
  (select count(*) from pg_policies
     where schemaname='public' and policyname='profiles_delete')        as "สิทธิ์ลบบัญชี (ต้องเป็น 1)",
  (select count(*) from pg_trigger
     where tgname='jobs_guard_closed')                                  as "ล็อกงานที่ปิดแล้ว (ต้องเป็น 1)",
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='jobs'
       and column_name in ('review_status','review_note','reviewed_by','reviewed_at'))
                                                                        as "ช่องตรวจงาน (ต้องเป็น 4)";
