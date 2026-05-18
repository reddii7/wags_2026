begin;

create table if not exists public.scorecard_submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references public.rounds (id) on delete set null,
  round_label text not null default '',
  submitted_by text not null default '',
  completed_count integer not null default 0 check (completed_count >= 0),
  csv_text text not null,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'reviewed', 'imported', 'rejected')),
  admin_notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz
);

create index if not exists idx_scorecard_submissions_created_at
  on public.scorecard_submissions (created_at desc);

create index if not exists idx_scorecard_submissions_round_id
  on public.scorecard_submissions (round_id);

alter table public.scorecard_submissions enable row level security;

drop policy if exists "public can create scorecard submissions"
  on public.scorecard_submissions;

create policy "public can create scorecard submissions"
  on public.scorecard_submissions
  for insert
  to anon, authenticated
  with check (
    status = 'new'
    and completed_count >= 0
    and length(csv_text) <= 200000
    and jsonb_typeof(payload_json) = 'object'
  );

grant insert on public.scorecard_submissions to anon, authenticated;

comment on table public.scorecard_submissions is
  'Restricted staging inbox for committee score-entry cards. Public clients may insert only; admins review before touching live scores.';

commit;
