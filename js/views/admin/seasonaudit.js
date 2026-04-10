import { supabase } from '../../config.js';
import { showSpinner } from '../../utils.js';
import { findSeasonForDate, formatSeasonLabel, getCurrentMainSeason, loadMainSeasons } from '../../seasons.js';

const renderIssueCard = (title, items, emptyMessage, renderItem) => `
    <div class="card h-100">
        <div class="card-body">
            <h5 class="card-title">${title}</h5>
            ${items.length
        ? `<ul class="list-group list-group-flush">${items.map(renderItem).join('')}</ul>`
        : `<div class="text-success small">${emptyMessage}</div>`}
        </div>
    </div>`;

const formatDate = (dateValue) => new Date(`${dateValue}T00:00:00`).toLocaleDateString();

export const loadAdminSeasonAuditView = async (container) => {
    showSpinner(container);

    try {
        const [seasons, currentSeason] = await Promise.all([
            loadMainSeasons({ forceRefresh: true }),
            getCurrentMainSeason(),
        ]);

        if (!seasons.length) {
            container.innerHTML = '<div class="alert alert-info">No summer seasons found. Create one first in Season Admin.</div>';
            return;
        }

        const renderAudit = async (seasonId) => {
            const selectedSeason = seasons.find((season) => season.id === seasonId) || currentSeason || seasons[0];
            const [{ data: profiles, error: profilesError }, { data: memberships, error: membershipsError }, { data: competitions, error: competitionsError }] = await Promise.all([
                supabase.from('profiles').select('id, full_name, league_name').order('full_name'),
                supabase.from('season_league_memberships').select('user_id, league_name').eq('season_id', selectedSeason.id),
                supabase.from('competitions').select('id, name, competition_date, status').order('competition_date', { ascending: false }),
            ]);

            if (profilesError) throw profilesError;
            if (membershipsError) throw membershipsError;
            if (competitionsError) throw competitionsError;

            const membershipMap = new Map((memberships || []).map((membership) => [membership.user_id, membership.league_name]));
            const missingMemberships = (profiles || []).filter((profile) => profile.league_name && !membershipMap.has(profile.id));
            const leagueMismatches = (profiles || []).filter((profile) => {
                const seasonLeague = membershipMap.get(profile.id);
                return seasonLeague && profile.league_name && seasonLeague !== profile.league_name;
            });

            const seasonCompetitions = (competitions || []).filter((competition) => (
                competition.competition_date >= selectedSeason.start_date && competition.competition_date <= selectedSeason.end_date
            ));
            const duplicateCompetitionDates = Object.entries(seasonCompetitions.reduce((accumulator, competition) => {
                if (!accumulator[competition.competition_date]) accumulator[competition.competition_date] = [];
                accumulator[competition.competition_date].push(competition);
                return accumulator;
            }, {})).filter(([, entries]) => entries.length > 1);

            const outOfSeasonCompetitions = (competitions || []).filter((competition) => !findSeasonForDate(seasons, competition.competition_date));
            const openCompetitionsOutsideCurrent = currentSeason
                ? (competitions || []).filter((competition) => competition.status === 'open' && (competition.competition_date < currentSeason.start_date || competition.competition_date > currentSeason.end_date))
                : [];

            container.innerHTML = `
                <div class="page-shell">
                <section class="page-hero">
                    <div class="page-heading">
                        <div class="page-kicker">Admin</div>
                        <h1 class="mb-1">Season Audit</h1>
                        <p class="page-summary">Review league snapshots, season membership coverage, and competition date hygiene by season.</p>
                    </div>
                    <div class="page-toolbar">
                        <div>
                            <label for="season-audit-select" class="form-label small">Season</label>
                            <select id="season-audit-select" class="form-select">
                                ${seasons.map((season) => `<option value="${season.id}" ${season.id === selectedSeason.id ? 'selected' : ''}>${formatSeasonLabel(season)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </section>
                <div class="row g-3 mb-4">
                    <div class="col-md-3"><div class="card h-100"><div class="card-body"><div class="text-muted small">Missing Season Memberships</div><div class="display-6">${missingMemberships.length}</div></div></div></div>
                    <div class="col-md-3"><div class="card h-100"><div class="card-body"><div class="text-muted small">Profile vs Snapshot Mismatches</div><div class="display-6">${leagueMismatches.length}</div></div></div></div>
                    <div class="col-md-3"><div class="card h-100"><div class="card-body"><div class="text-muted small">Duplicate Competition Dates</div><div class="display-6">${duplicateCompetitionDates.length}</div></div></div></div>
                    <div class="col-md-3"><div class="card h-100"><div class="card-body"><div class="text-muted small">Competitions Outside Any Season</div><div class="display-6">${outOfSeasonCompetitions.length}</div></div></div></div>
                </div>
                <div class="row g-3">
                    <div class="col-lg-6">${renderIssueCard(
                'Players Missing Season Membership',
                missingMemberships,
                'Every player with a league currently has a row in the selected season snapshot.',
                (profile) => `<li class="list-group-item d-flex justify-content-between align-items-center"><span>${profile.full_name}</span><span class="badge text-bg-secondary">${profile.league_name}</span></li>`,
            )}</div>
                    <div class="col-lg-6">${renderIssueCard(
                'Profile League Differs From Snapshot',
                leagueMismatches,
                'Current profile leagues match the selected season snapshot.',
                (profile) => `<li class="list-group-item d-flex justify-content-between align-items-center"><span>${profile.full_name}</span><span class="small text-muted">Profile: ${profile.league_name} | Snapshot: ${membershipMap.get(profile.id)}</span></li>`,
            )}</div>
                    <div class="col-lg-6">${renderIssueCard(
                'Duplicate Competition Dates In Selected Season',
                duplicateCompetitionDates,
                'No duplicate competition dates found for the selected season.',
                ([competitionDate, entries]) => `<li class="list-group-item"><div class="fw-semibold">${formatDate(competitionDate)}</div><div class="small text-muted">${entries.map((entry) => entry.name).join(', ')}</div></li>`,
            )}</div>
                    <div class="col-lg-6">${renderIssueCard(
                'Open Competitions Outside Current Season',
                openCompetitionsOutsideCurrent,
                'Every open competition is inside the current season window.',
                (competition) => `<li class="list-group-item"><div class="fw-semibold">${competition.name}</div><div class="small text-muted">${formatDate(competition.competition_date)}</div></li>`,
            )}</div>
                    <div class="col-12">${renderIssueCard(
                'Competitions Outside Any Configured Season',
                outOfSeasonCompetitions,
                'Every competition date belongs to a configured summer season.',
                (competition) => `<li class="list-group-item d-flex justify-content-between align-items-center"><span>${competition.name}</span><span class="small text-muted">${formatDate(competition.competition_date)}</span></li>`,
            )}</div>
                </div>
                </div>`;

            container.querySelector('#season-audit-select')?.addEventListener('change', (event) => {
                renderAudit(event.target.value);
            });
        };

        await renderAudit(currentSeason?.id || seasons[0].id);
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error loading season audit: ${error.message}</div>`;
    }
};
