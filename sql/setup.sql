-- =====================================================
-- TechCampus_Hub — courses, purchases and paid notes
-- Run this once in: Supabase Dashboard → SQL Editor
-- =====================================================

-- -------------------------------------------------
-- 1. Course catalog (sellable bundles)
-- -------------------------------------------------
create table if not exists public.courses (
    id          uuid primary key default gen_random_uuid(),
    slug        text unique not null,
    title       text not null,
    description text not null default '',
    price_inr   integer not null default 0 check (price_inr >= 0),
    highlights  text[] not null default '{}',
    sort_order  integer not null default 0,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now()
);

-- -------------------------------------------------
-- 2. Purchase requests (manual UPI + admin approval)
-- -------------------------------------------------
create table if not exists public.course_purchases (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    user_email   text not null default '',
    user_name    text not null default '',
    course_id    uuid not null references public.courses (id) on delete cascade,
    course_title text not null default '',
    amount_inr   integer not null check (amount_inr >= 0),
    utr          text not null,
    status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
    created_at   timestamptz not null default now(),
    reviewed_at  timestamptz
);

create index if not exists course_purchases_user_idx
    on public.course_purchases (user_id, created_at desc);
create index if not exists course_purchases_status_idx
    on public.course_purchases (status, created_at desc);

-- -------------------------------------------------
-- 3. Link notes to a paid bundle (null = free note)
-- -------------------------------------------------
alter table public.notes
    add column if not exists course_id uuid
    references public.courses (id) on delete set null;

-- -------------------------------------------------
-- 4. Store the portal's UPI ID for checkout
-- -------------------------------------------------
alter table public.site_settings
    add column if not exists upi_id text;

update public.site_settings
   set upi_id = 'abhishekprajapati8115@okicici'
 where id = 1 and (upi_id is null or upi_id = '');

-- -------------------------------------------------
-- 5. Admin helper used by row level security
-- -------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.students s
        where lower(s.email) = lower(auth.email())
          and s.role = 'admin'
    );
$$;

-- -------------------------------------------------
-- 6. Row level security
-- -------------------------------------------------
alter table public.courses enable row level security;
alter table public.course_purchases enable row level security;

drop policy if exists "courses_public_read" on public.courses;
create policy "courses_public_read"
    on public.courses for select
    to anon, authenticated
    using (is_active);

drop policy if exists "courses_admin_write" on public.courses;
create policy "courses_admin_write"
    on public.courses for all
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

drop policy if exists "purchases_insert_own" on public.course_purchases;
create policy "purchases_insert_own"
    on public.course_purchases for insert
    to authenticated
    with check (
        auth.uid() = user_id
        and status = 'pending'
    );

drop policy if exists "purchases_select_own_or_admin" on public.course_purchases;
create policy "purchases_select_own_or_admin"
    on public.course_purchases for select
    to authenticated
    using (
        auth.uid() = user_id
        or public.is_admin()
    );

drop policy if exists "purchases_admin_update" on public.course_purchases;
create policy "purchases_admin_update"
    on public.course_purchases for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- -------------------------------------------------
-- 7. Seed catalog (edit prices/titles freely)
-- -------------------------------------------------
insert into public.courses (slug, title, description, price_inr, highlights, sort_order)
values
    ('mca-notes-bundle',
     'MCA Complete Notes Bundle',
     'Every semester''s subject notes for MCA — organized by semester and subject, PDF downloads.',
     499,
     array['All MCA semesters', 'Subject-wise PDF notes', 'Lifetime access after approval', 'New notes added regularly'],
     1),
    ('btech-cse-notes-bundle',
     'B.Tech CSE Notes Bundle',
     'Semester notes for Computer Science & Engineering — core subjects, units and topic notes.',
     599,
     array['All CSE semesters', 'Unit-wise notes', 'Lifetime access after approval', 'New notes added regularly'],
     2),
    ('pyq-mastery-pack',
     'Previous Year Papers (PYQ) Pack',
     'Previous year question papers with solutions — sorted by course, year and semester.',
     199,
     array['Years of question papers', 'Course + semester sorted', 'One-time payment', 'Lifetime access'],
     3)
on conflict (slug) do nothing;

-- =====================================================
-- Part 2 — SRS feature set
-- Course validity, favourites, notifications,
-- certificates, feedback, TNP bundles, Gemini link.
-- Safe to re-run.
-- =====================================================

-- -------------------------------------------------
-- P1. Course validity (days of access after approval)
-- -------------------------------------------------
alter table public.courses
    add column if not exists validity_days integer not null default 365;

-- -------------------------------------------------
-- P2. Purchase expiry (the student's course validity)
-- -------------------------------------------------
alter table public.course_purchases
    add column if not exists expires_at timestamptz;

-- Backfill already-approved purchases from their course.
update public.course_purchases p
   set expires_at = coalesce(p.reviewed_at, p.created_at)
                  + make_interval(days => c.validity_days)
  from public.courses c
 where c.id = p.course_id
   and p.status = 'approved'
   and p.expires_at is null;

-- -------------------------------------------------
-- P3. Favourites (per-user saved notes)
-- -------------------------------------------------
create table if not exists public.favorites (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references auth.users (id) on delete cascade,
    category   text not null default 'notes',
    item_id    text not null,
    item_title text not null default '',
    created_at timestamptz not null default now(),
    unique (user_id, category, item_id)
);

alter table public.favorites enable row level security;

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own"
    on public.favorites for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own"
    on public.favorites for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own"
    on public.favorites for delete
    to authenticated
    using (auth.uid() = user_id);

-- -------------------------------------------------
-- P4. Notifications (broadcasts + upload alerts)
-- -------------------------------------------------
create table if not exists public.notifications (
    id         uuid primary key default gen_random_uuid(),
    title      text not null,
    body       text not null default '',
    kind       text not null default 'general'
               check (kind in ('general', 'timetable', 'course', 'notes', 'pyq', 'tnp')),
    audience   text not null default 'all'
               check (audience in ('all', 'premium', 'free')),
    created_by text not null default '',
    created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists "notifications_read" on public.notifications;
create policy "notifications_read"
    on public.notifications for select
    to authenticated
    using (true);

drop policy if exists "notifications_admin_insert" on public.notifications;
create policy "notifications_admin_insert"
    on public.notifications for insert
    to authenticated
    with check (public.is_admin());

drop policy if exists "notifications_admin_delete" on public.notifications;
create policy "notifications_admin_delete"
    on public.notifications for delete
    to authenticated
    using (public.is_admin());

-- -------------------------------------------------
-- P5. Certificates (admin-managed links)
-- -------------------------------------------------
create table if not exists public.certificates (
    id          uuid primary key default gen_random_uuid(),
    title       text not null,
    url         text not null,
    description text not null default '',
    sort_order  integer not null default 0,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now()
);

alter table public.certificates enable row level security;

drop policy if exists "certificates_public_read" on public.certificates;
create policy "certificates_public_read"
    on public.certificates for select
    to anon, authenticated
    using (is_active);

drop policy if exists "certificates_admin_write" on public.certificates;
create policy "certificates_admin_write"
    on public.certificates for all
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- -------------------------------------------------
-- P6. Feedback & ratings (1-5 stars + written text)
-- -------------------------------------------------
create table if not exists public.feedback (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users (id) on delete cascade,
    user_name    text not null default '',
    user_email   text not null default '',
    target_type  text not null default 'website'
                 check (target_type in ('website', 'course', 'note')),
    target_label text not null default '',
    rating       integer not null check (rating between 1 and 5),
    message      text not null default '',
    created_at   timestamptz not null default now()
);

alter table public.feedback enable row level security;

drop policy if exists "feedback_select_own_or_admin" on public.feedback;
create policy "feedback_select_own_or_admin"
    on public.feedback for select
    to authenticated
    using (auth.uid() = user_id or public.is_admin());

drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own"
    on public.feedback for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "feedback_admin_delete" on public.feedback;
create policy "feedback_admin_delete"
    on public.feedback for delete
    to authenticated
    using (public.is_admin());

-- -------------------------------------------------
-- P7. TNP notes can belong to a paid bundle
--         (null = free TNP note)
-- -------------------------------------------------
alter table public.tnp
    add column if not exists course_id uuid
    references public.courses (id) on delete set null;

-- -------------------------------------------------
-- P8. AI chatbot (Gemini) link
-- -------------------------------------------------
alter table public.site_settings
    add column if not exists gemini_url text;

update public.site_settings
   set gemini_url = 'https://gemini.google.com'
 where id = 1 and (gemini_url is null or gemini_url = '');
