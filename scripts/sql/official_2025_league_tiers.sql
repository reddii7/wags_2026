-- Official 2025 starting divisions (15 / 15 / 15); everyone else tier 4 (League Two).
-- Scope: campaign year 2025, kind summer_main.
-- Apply: supabase db query --linked -f scripts/sql/official_2025_league_tiers.sql

begin;

update public.league_assignments la
set tier = 4
from public.campaigns c
where la.campaign_id = c.id
  and c.year = 2025
  and c.kind = 'summer_main'::public.campaign_kind;

update public.league_assignments la
set tier = src.tier
from public.members m,
     public.campaigns c,
     (
       values
         ('Andy Ray', 1),
         ('Dave Harrison', 1),
         ('James Tough', 1),
         ('Jez Williams', 1),
         ('Jon Boden', 1),
         ('Marc Allsopp', 1),
         ('Mark Howell', 1),
         ('Mark Ready', 1),
         ('Nick Stableford', 1),
         ('Richard Bird', 1),
         ('Simon Carter', 1),
         ('Steve Such', 1),
         ('Tim Allsopp', 1),
         ('Tim Lewis', 1),
         ('Tony Mynard', 1),
         ('Adam Teale', 2),
         ('Gary Adcock', 2),
         ('Ian Ind', 2),
         ('John Goodman', 2),
         ('Kevin Horton', 2),
         ('Lee Eastoe', 2),
         ('Mark Jeffries', 2),
         ('Mick Sandoz', 2),
         ('Paul Blades', 2),
         ('Paul Smith', 2),
         ('Richard Shaw', 2),
         ('Ross Jeffries', 2),
         ('Steve Robinson', 2),
         ('Stuart Pickersgill', 2),
         ('Tom Green', 2),
         ('Ade Cooper', 3),
         ('Brian Elliot', 3),
         ('Chris Boards', 3),
         ('James Harrison', 3),
         ('Jon Murchington', 3),
         ('Jon Price', 3),
         ('Les Lawrence', 3),
         ('Martin Stevenson', 3),
         ('Mick Hennessy', 3),
         ('Paul Chapman', 3),
         ('Peter Jeffries', 3),
         ('Richard Craven Jones', 3),
         ('Stephen Wallace', 3),
         ('Steve Rochester', 3),
         ('Stu Clark', 3)
     ) as src(full_name, tier)
where la.member_id = m.id
  and la.campaign_id = c.id
  and c.year = 2025
  and c.kind = 'summer_main'::public.campaign_kind
  and lower(trim(m.full_name)) = lower(trim(src.full_name));

commit;
