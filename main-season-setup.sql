-- Main SUMMER season support for Best 14, Leagues and historical league membership.
-- Seasons are calendar-year based, e.g. 2025 = 1 Jan 2025 to 31 Dec 2025.
-- WinterWAGS remains separate and is not affected by anything in this file.
-- Run this in Supabase SQL editor after reviewing on a backup first.

create table if not exists public.seasons (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    start_year integer not null unique,
    start_date date not null,
    end_date date not null,
    is_current boolean not null default false,
    created_at timestamptz not null default now(),
    constraint seasons_date_range_chk check (start_date <= end_date)
);

create unique index if not exists seasons_one_current_idx
    on public.seasons (is_current)
    where is_current = true;

create table if not exists public.season_league_memberships (
    season_id uuid not null references public.seasons(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    league_name text not null,
    created_at timestamptz not null default now(),
    primary key (season_id, user_id)
);

create index if not exists season_league_memberships_league_idx
    on public.season_league_memberships (season_id, league_name);

create or replace function public.snapshot_season_league_memberships(p_start_year integer)
returns void
language sql
as $$
    insert into public.season_league_memberships (season_id, user_id, league_name)
    select s.id, p.id, p.league_name
    from public.seasons s
    join public.profiles p on p.league_name is not null
    where s.start_year = p_start_year
    on conflict (season_id, user_id) do update
    set league_name = excluded.league_name;
$$;

create or replace function public.load_2025_final_league_memberships()
returns void
language plpgsql
as $$
declare
    v_season_id uuid;
    v_missing_names text;
begin
    select id into v_season_id
    from public.seasons
    where start_year = 2025;

    if v_season_id is null then
        raise exception 'Season 2025 does not exist in public.seasons';
    end if;

    with final_memberships(league_name, final_position, full_name) as (
        values
            ('League 1', 1, 'Richard Bird'),
            ('League 1', 1, 'Simon Carter'),
            ('League 1', 3, 'James Tough'),
            ('League 1', 3, 'Jon Boden'),
            ('League 1', 5, 'Andy Ray'),
            ('League 1', 6, 'Tim Allsopp'),
            ('League 1', 7, 'Tim Lewis'),
            ('League 1', 8, 'Steve Such'),
            ('League 1', 9, 'Mark Howell'),
            ('League 1', 9, 'Tony Mynard'),
            ('League 1', 11, 'Nick Stableford'),
            ('League 1', 12, 'Dave Harrison'),
            ('League 1', 13, 'Jez Williams'),
            ('League 1', 14, 'Mark Ready'),
            ('League 1', 15, 'Marc Allsopp'),
            ('League 2', 1, 'Ian Ind'),
            ('League 2', 2, 'John Goodman'),
            ('League 2', 3, 'Tom Green'),
            ('League 2', 4, 'Adam Teale'),
            ('League 2', 5, 'Paul Smith'),
            ('League 2', 5, 'Steve Robinson'),
            ('League 2', 7, 'Mick Sandoz'),
            ('League 2', 8, 'Gary Adcock'),
            ('League 2', 9, 'Lee Eastoe'),
            ('League 2', 9, 'Richard Shaw'),
            ('League 2', 11, 'Paul Blades'),
            ('League 2', 12, 'Kevin Horton'),
            ('League 2', 13, 'Stuart Pickersgill'),
            ('League 2', 14, 'Mark Jeffries'),
            ('League 2', 15, 'Ross Jeffries'),
            ('League 3', 1, 'Chris Boards'),
            ('League 3', 1, 'Martin Stevenson'),
            ('League 3', 3, 'Jon Murchington'),
            ('League 3', 4, 'Peter Jeffries'),
            ('League 3', 5, 'Ade Cooper'),
            ('League 3', 5, 'Stu Clark'),
            ('League 3', 7, 'James Harrison'),
            ('League 3', 8, 'Richard Craven Jones'),
            ('League 3', 9, 'Stephen Wallace'),
            ('League 3', 10, 'Les Lawrence'),
            ('League 3', 11, 'Paul Chapman'),
            ('League 3', 12, 'Steve Rochester'),
            ('League 3', 13, 'Mick Hennessy'),
            ('League 3', 14, 'Brian Elliot'),
            ('League 3', 15, 'Jon Price'),
            ('League 4', 1, 'Adam Simcox'),
            ('League 4', 2, 'Mark Jackson'),
            ('League 4', 3, 'Stuart Murdock'),
            ('League 4', 4, 'Mark Mosley'),
            ('League 4', 5, 'Ross Kelly'),
            ('League 4', 6, 'Craig Milligan'),
            ('League 4', 7, 'Steve Tarmey'),
            ('League 4', 8, 'Dan Conway'),
            ('League 4', 9, 'James Simmons'),
            ('League 4', 10, 'James Willis'),
            ('League 4', 11, 'Warren Crook'),
            ('League 4', 12, 'Matt Spencer'),
            ('League 4', 13, 'Paul Garratt'),
            ('League 4', 14, 'Richard Cook'),
            ('League 4', 15, 'Andy Spencer'),
            ('League 4', 16, 'Craig Jones'),
            ('League 4', 17, 'Neale Aston'),
            ('League 4', 17, 'Scott Worrall')
    ),
    missing as (
        select fm.full_name
        from final_memberships fm
        left join public.profiles p on p.full_name = fm.full_name
        where p.id is null
    )
    select string_agg(full_name, ', ' order by full_name)
    into v_missing_names
    from missing;

    if v_missing_names is not null then
        raise exception 'These 2025 league players were not found in public.profiles: %', v_missing_names;
    end if;

    insert into public.season_league_memberships (season_id, user_id, league_name)
    select v_season_id, p.id, fm.league_name
    from (
        values
            ('League 1', 1, 'Richard Bird'),
            ('League 1', 1, 'Simon Carter'),
            ('League 1', 3, 'James Tough'),
            ('League 1', 3, 'Jon Boden'),
            ('League 1', 5, 'Andy Ray'),
            ('League 1', 6, 'Tim Allsopp'),
            ('League 1', 7, 'Tim Lewis'),
            ('League 1', 8, 'Steve Such'),
            ('League 1', 9, 'Mark Howell'),
            ('League 1', 9, 'Tony Mynard'),
            ('League 1', 11, 'Nick Stableford'),
            ('League 1', 12, 'Dave Harrison'),
            ('League 1', 13, 'Jez Williams'),
            ('League 1', 14, 'Mark Ready'),
            ('League 1', 15, 'Marc Allsopp'),
            ('League 2', 1, 'Ian Ind'),
            ('League 2', 2, 'John Goodman'),
            ('League 2', 3, 'Tom Green'),
            ('League 2', 4, 'Adam Teale'),
            ('League 2', 5, 'Paul Smith'),
            ('League 2', 5, 'Steve Robinson'),
            ('League 2', 7, 'Mick Sandoz'),
            ('League 2', 8, 'Gary Adcock'),
            ('League 2', 9, 'Lee Eastoe'),
            ('League 2', 9, 'Richard Shaw'),
            ('League 2', 11, 'Paul Blades'),
            ('League 2', 12, 'Kevin Horton'),
            ('League 2', 13, 'Stuart Pickersgill'),
            ('League 2', 14, 'Mark Jeffries'),
            ('League 2', 15, 'Ross Jeffries'),
            ('League 3', 1, 'Chris Boards'),
            ('League 3', 1, 'Martin Stevenson'),
            ('League 3', 3, 'Jon Murchington'),
            ('League 3', 4, 'Peter Jeffries'),
            ('League 3', 5, 'Ade Cooper'),
            ('League 3', 5, 'Stu Clark'),
            ('League 3', 7, 'James Harrison'),
            ('League 3', 8, 'Richard Craven Jones'),
            ('League 3', 9, 'Stephen Wallace'),
            ('League 3', 10, 'Les Lawrence'),
            ('League 3', 11, 'Paul Chapman'),
            ('League 3', 12, 'Steve Rochester'),
            ('League 3', 13, 'Mick Hennessy'),
            ('League 3', 14, 'Brian Elliot'),
            ('League 3', 15, 'Jon Price'),
            ('League 4', 1, 'Adam Simcox'),
            ('League 4', 2, 'Mark Jackson'),
            ('League 4', 3, 'Stuart Murdock'),
            ('League 4', 4, 'Mark Mosley'),
            ('League 4', 5, 'Ross Kelly'),
            ('League 4', 6, 'Craig Milligan'),
            ('League 4', 7, 'Steve Tarmey'),
            ('League 4', 8, 'Dan Conway'),
            ('League 4', 9, 'James Simmons'),
            ('League 4', 10, 'James Willis'),
            ('League 4', 11, 'Warren Crook'),
            ('League 4', 12, 'Matt Spencer'),
            ('League 4', 13, 'Paul Garratt'),
            ('League 4', 14, 'Richard Cook'),
            ('League 4', 15, 'Andy Spencer'),
            ('League 4', 16, 'Craig Jones'),
            ('League 4', 17, 'Neale Aston'),
            ('League 4', 17, 'Scott Worrall')
    ) as fm(league_name, final_position, full_name)
    join public.profiles p on p.full_name = fm.full_name
    on conflict (season_id, user_id) do update
    set league_name = excluded.league_name;
end;
$$;

-- Seed example summer seasons using calendar years.
insert into public.seasons (name, start_year, start_date, end_date, is_current)
values
    ('Summer 2025', 2025, date '2025-01-01', date '2025-12-31', false),
    ('Summer 2026', 2026, date '2026-01-01', date '2026-12-31', true)
on conflict (start_year) do update
set name = excluded.name,
    start_date = excluded.start_date,
    end_date = excluded.end_date;

-- Freeze the final 2025 summer league memberships from the confirmed end-of-season table.
-- League names below are stored exactly as supplied in the final 2025 standings.
select public.load_2025_final_league_memberships();

-- IMPORTANT:
-- Do NOT snapshot 2026 memberships yet unless you have already manually updated
-- profiles.league_name for the new season.
--
-- When you have finished the manual promotion / relegation changes for 2026, run:
-- select public.snapshot_season_league_memberships(2026);

create or replace function public.get_best_14_scores(p_season_id uuid)
returns table(user_id uuid, full_name text, total_score bigint)
language sql
stable
as $$
    with season_window as (
        select start_date, end_date
        from public.seasons
        where id = p_season_id
    ),
    ranked_scores as (
        select
            r.user_id,
            r.stableford_score,
            row_number() over (partition by r.user_id order by r.stableford_score desc) as rn
        from public.rounds r
        join public.competitions c on c.id = r.competition_id
        cross join season_window sw
        where r.user_id is not null
          and r.stableford_score is not null
          and c.competition_date between sw.start_date and sw.end_date
    )
    select
        rs.user_id,
        p.full_name,
        sum(rs.stableford_score)::bigint as total_score
    from ranked_scores rs
    join public.profiles p on p.id = rs.user_id
    where rs.rn <= 14
    group by rs.user_id, p.full_name
    order by total_score desc, p.full_name;
$$;

create or replace function public.get_player_best_14_scores(p_profile_id uuid, p_season_id uuid)
returns table(competition_name text, competition_date date, stableford_score integer)
language sql
stable
as $$
    with season_window as (
        select start_date, end_date
        from public.seasons
        where id = p_season_id
    ),
    ranked_scores as (
        select
            c.name as competition_name,
            c.competition_date,
            r.stableford_score,
            row_number() over (order by r.stableford_score desc, c.competition_date desc) as rn
        from public.rounds r
        join public.competitions c on c.id = r.competition_id
        cross join season_window sw
        where r.user_id = p_profile_id
          and r.stableford_score is not null
          and c.competition_date between sw.start_date and sw.end_date
    )
    select competition_name, competition_date, stableford_score
    from ranked_scores
    where rn <= 14
    order by stableford_score desc, competition_date desc;
$$;

create or replace function public.get_player_best_14_total(p_profile_id uuid, p_season_id uuid)
returns table(total bigint, games_played bigint, pos bigint)
language sql
stable
as $$
    with leaderboard as (
        select
            b.user_id,
            b.total_score as total,
            dense_rank() over (order by b.total_score desc, b.full_name) as pos
        from public.get_best_14_scores(p_season_id) b
    ),
    season_window as (
        select start_date, end_date
        from public.seasons
        where id = p_season_id
    ),
    played as (
        select count(*)::bigint as games_played
        from public.rounds r
        join public.competitions c on c.id = r.competition_id
        cross join season_window sw
        where r.user_id = p_profile_id
          and r.stableford_score is not null
          and c.competition_date between sw.start_date and sw.end_date
    )
    select l.total, p.games_played, l.pos
    from leaderboard l
    cross join played p
    where l.user_id = p_profile_id;
$$;

create or replace function public.get_league_standings_best10(p_season_id uuid)
returns table(user_id uuid, full_name text, league_name text, total_score bigint)
language sql
stable
as $$
    with season_window as (
        select start_date, end_date
        from public.seasons
        where id = p_season_id
    ),
    ranked_scores as (
        select
            r.user_id,
            r.stableford_score,
            row_number() over (partition by r.user_id order by r.stableford_score desc) as rn
        from public.rounds r
        join public.competitions c on c.id = r.competition_id
        cross join season_window sw
        where r.user_id is not null
          and r.stableford_score is not null
          and c.competition_date between sw.start_date and sw.end_date
    )
    select
        p.id as user_id,
        p.full_name,
        slm.league_name,
        coalesce(sum(rs.stableford_score), 0)::bigint as total_score
    from public.season_league_memberships slm
    join public.profiles p on p.id = slm.user_id
    left join ranked_scores rs
        on rs.user_id = slm.user_id
       and rs.rn <= 10
    where slm.season_id = p_season_id
    group by p.id, p.full_name, slm.league_name
    order by slm.league_name, total_score desc, p.full_name;
$$;

create or replace function public.get_player_best_10_scores(p_profile_id uuid, p_season_id uuid)
returns table(competition_name text, competition_date date, stableford_score integer)
language sql
stable
as $$
    with season_window as (
        select start_date, end_date
        from public.seasons
        where id = p_season_id
    ),
    ranked_scores as (
        select
            c.name as competition_name,
            c.competition_date,
            r.stableford_score,
            row_number() over (order by r.stableford_score desc, c.competition_date desc) as rn
        from public.rounds r
        join public.competitions c on c.id = r.competition_id
        cross join season_window sw
        where r.user_id = p_profile_id
          and r.stableford_score is not null
          and c.competition_date between sw.start_date and sw.end_date
    )
    select competition_name, competition_date, stableford_score
    from ranked_scores
    where rn <= 10
    order by stableford_score desc, competition_date desc;
$$;
