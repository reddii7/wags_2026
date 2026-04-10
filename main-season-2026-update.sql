-- Apply Summer 2026 league assignments from the confirmed 2025 final standings.
-- Assumption used here: 3 up / 3 down between League 1, League 2 and League 3,
-- with the top 3 from League 4 promoted into League 3.
--
-- This script:
-- 1. Updates public.profiles.league_name for the listed players
-- 2. Rebuilds the 2026 season_league_memberships snapshot from current profiles
--
-- Run this only after main-season-setup.sql has already been applied.

create or replace function public.apply_2026_league_assignments()
returns void
language plpgsql
as $$
declare
    v_season_id uuid;
    v_missing_names text;
begin
    select id into v_season_id
    from public.seasons
    where start_year = 2026;

    if v_season_id is null then
        raise exception 'Season 2026 does not exist in public.seasons';
    end if;

    with assignments(league_name, full_name) as (
        values
            ('League 1', 'Richard Bird'),
            ('League 1', 'Simon Carter'),
            ('League 1', 'James Tough'),
            ('League 1', 'Jon Boden'),
            ('League 1', 'Andy Ray'),
            ('League 1', 'Tim Allsopp'),
            ('League 1', 'Tim Lewis'),
            ('League 1', 'Steve Such'),
            ('League 1', 'Mark Howell'),
            ('League 1', 'Tony Mynard'),
            ('League 1', 'Nick Stableford'),
            ('League 1', 'Dave Harrison'),
            ('League 1', 'Ian Ind'),
            ('League 1', 'John Goodman'),
            ('League 1', 'Tom Green'),
            ('League 2', 'Jez Williams'),
            ('League 2', 'Mark Ready'),
            ('League 2', 'Marc Allsopp'),
            ('League 2', 'Adam Teale'),
            ('League 2', 'Paul Smith'),
            ('League 2', 'Steve Robinson'),
            ('League 2', 'Mick Sandoz'),
            ('League 2', 'Gary Adcock'),
            ('League 2', 'Lee Eastoe'),
            ('League 2', 'Richard Shaw'),
            ('League 2', 'Paul Blades'),
            ('League 2', 'Kevin Horton'),
            ('League 2', 'Chris Boards'),
            ('League 2', 'Martin Stevenson'),
            ('League 2', 'Jon Murchington'),
            ('League 3', 'Stuart Pickersgill'),
            ('League 3', 'Mark Jeffries'),
            ('League 3', 'Ross Jeffries'),
            ('League 3', 'Peter Jeffries'),
            ('League 3', 'Ade Cooper'),
            ('League 3', 'Stu Clark'),
            ('League 3', 'James Harrison'),
            ('League 3', 'Richard Craven Jones'),
            ('League 3', 'Stephen Wallace'),
            ('League 3', 'Les Lawrence'),
            ('League 3', 'Paul Chapman'),
            ('League 3', 'Steve Rochester'),
            ('League 3', 'Adam Simcox'),
            ('League 3', 'Mark Jackson'),
            ('League 3', 'Stuart Murdock'),
            ('League 4', 'Mick Hennessy'),
            ('League 4', 'Brian Elliot'),
            ('League 4', 'Jon Price'),
            ('League 4', 'Mark Mosley'),
            ('League 4', 'Ross Kelly'),
            ('League 4', 'Craig Milligan'),
            ('League 4', 'Steve Tarmey'),
            ('League 4', 'Dan Conway'),
            ('League 4', 'James Simmons'),
            ('League 4', 'James Willis'),
            ('League 4', 'Warren Crook'),
            ('League 4', 'Matt Spencer'),
            ('League 4', 'Paul Garratt'),
            ('League 4', 'Richard Cook'),
            ('League 4', 'Andy Spencer'),
            ('League 4', 'Craig Jones'),
            ('League 4', 'Neale Aston'),
            ('League 4', 'Scott Worrall')
    ),
    missing as (
        select a.full_name
        from assignments a
        left join public.profiles p on p.full_name = a.full_name
        where p.id is null
    )
    select string_agg(full_name, ', ' order by full_name)
    into v_missing_names
    from missing;

    if v_missing_names is not null then
        raise exception 'These 2026 league players were not found in public.profiles: %', v_missing_names;
    end if;

    update public.profiles p
    set league_name = a.league_name
    from (
        values
            ('League 1', 'Richard Bird'),
            ('League 1', 'Simon Carter'),
            ('League 1', 'James Tough'),
            ('League 1', 'Jon Boden'),
            ('League 1', 'Andy Ray'),
            ('League 1', 'Tim Allsopp'),
            ('League 1', 'Tim Lewis'),
            ('League 1', 'Steve Such'),
            ('League 1', 'Mark Howell'),
            ('League 1', 'Tony Mynard'),
            ('League 1', 'Nick Stableford'),
            ('League 1', 'Dave Harrison'),
            ('League 1', 'Ian Ind'),
            ('League 1', 'John Goodman'),
            ('League 1', 'Tom Green'),
            ('League 2', 'Jez Williams'),
            ('League 2', 'Mark Ready'),
            ('League 2', 'Marc Allsopp'),
            ('League 2', 'Adam Teale'),
            ('League 2', 'Paul Smith'),
            ('League 2', 'Steve Robinson'),
            ('League 2', 'Mick Sandoz'),
            ('League 2', 'Gary Adcock'),
            ('League 2', 'Lee Eastoe'),
            ('League 2', 'Richard Shaw'),
            ('League 2', 'Paul Blades'),
            ('League 2', 'Kevin Horton'),
            ('League 2', 'Chris Boards'),
            ('League 2', 'Martin Stevenson'),
            ('League 2', 'Jon Murchington'),
            ('League 3', 'Stuart Pickersgill'),
            ('League 3', 'Mark Jeffries'),
            ('League 3', 'Ross Jeffries'),
            ('League 3', 'Peter Jeffries'),
            ('League 3', 'Ade Cooper'),
            ('League 3', 'Stu Clark'),
            ('League 3', 'James Harrison'),
            ('League 3', 'Richard Craven Jones'),
            ('League 3', 'Stephen Wallace'),
            ('League 3', 'Les Lawrence'),
            ('League 3', 'Paul Chapman'),
            ('League 3', 'Steve Rochester'),
            ('League 3', 'Adam Simcox'),
            ('League 3', 'Mark Jackson'),
            ('League 3', 'Stuart Murdock'),
            ('League 4', 'Mick Hennessy'),
            ('League 4', 'Brian Elliot'),
            ('League 4', 'Jon Price'),
            ('League 4', 'Mark Mosley'),
            ('League 4', 'Ross Kelly'),
            ('League 4', 'Craig Milligan'),
            ('League 4', 'Steve Tarmey'),
            ('League 4', 'Dan Conway'),
            ('League 4', 'James Simmons'),
            ('League 4', 'James Willis'),
            ('League 4', 'Warren Crook'),
            ('League 4', 'Matt Spencer'),
            ('League 4', 'Paul Garratt'),
            ('League 4', 'Richard Cook'),
            ('League 4', 'Andy Spencer'),
            ('League 4', 'Craig Jones'),
            ('League 4', 'Neale Aston'),
            ('League 4', 'Scott Worrall')
    ) as a(league_name, full_name)
    where p.full_name = a.full_name;

    delete from public.season_league_memberships
    where season_id = v_season_id;

    perform public.snapshot_season_league_memberships(2026);
end;
$$;

select public.apply_2026_league_assignments();