import { supabase } from '../config.js';
import { formatSeasonLabel, getCurrentMainSeason, loadMainSeasons } from '../seasons.js';
import { showSpinner, showModalWithContent, createScoresTable, createSeasonSelector, bindSeasonSelector } from '../utils.js';

export const loadLeaguesView = async (container) => {
    showSpinner(container);
    try {
        const [seasons, currentSeason] = await Promise.all([loadMainSeasons(), getCurrentMainSeason()]);
        const selectedSeasonId = currentSeason?.id || seasons[0]?.id;

        if (!selectedSeasonId) {
            container.innerHTML = `<div class="alert alert-info">No seasons found. Create and mark a current season in Supabase first.</div>`;
            return;
        }

        const renderView = async (seasonId) => {
            const selectedSeason = seasons.find((season) => season.id === seasonId) || currentSeason;
            const { data, error } = await supabase.rpc('get_league_standings_best10', { p_season_id: seasonId });
            if (error) {
                container.innerHTML = `<div class="alert alert-danger">Error fetching league data: ${error.message}</div>`;
                return;
            }

            const leagues = {};
            if (data) data.forEach((row) => {
                if (!leagues[row.league_name]) leagues[row.league_name] = [];
                leagues[row.league_name].push(row);
            });
            const leagueCount = Object.keys(leagues).length;
            const playerCount = data?.length ?? 0;

            let tableHtml = '';
            if (Object.keys(leagues).length === 0) {
                tableHtml = '<section class="surface-block table-panel"><div class="text-center p-3 text-muted">No league data found.</div></section>';
            } else {
                Object.entries(leagues).forEach(([dbLeagueName, players]) => {
                    tableHtml += `<section class="surface-block table-panel"><h2 class="mt-0 mb-3 px-1">${dbLeagueName}</h2>`;
                    players.sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0) || a.full_name.localeCompare(b.full_name));

                    let innerTable = `<table class="table table-striped"><thead><tr><th>Pos</th><th>Player</th><th class="text-center">Best 10</th></tr></thead><tbody>`;
                    let lastScore = null;
                    let lastPos = 0;
                    players.forEach((player, index) => {
                        const pos = player.total_score === lastScore ? lastPos : index + 1;
                        lastScore = player.total_score;
                        lastPos = pos;
                        const leaderLabel = pos === 1 ? '<span class="winner-label">leader</span>' : '';
                        innerTable += `<tr><td class='text-center'>${pos}</td><td><a href="#" class="player-link" data-player-name="${player.full_name}" data-season-id="${seasonId}">${player.full_name}</a>${leaderLabel}</td><td class='text-center'>${player.total_score ?? 'N/A'}</td></tr>`;
                    });
                    innerTable += `</tbody></table>`;
                    tableHtml += `<div class="table-responsive">${innerTable}</div></section>`;
                });
            }

            container.innerHTML = `
                <div class="page-shell">
                    <section class="page-hero">
                        <div class="page-heading">
                            <div class="page-kicker">League tables</div>
                            <h1 class="mb-1">Leagues (Best 10)</h1>
                            <p class="page-summary">View each division clearly and drill into any player’s Best 10 score breakdown for the selected season.</p>
                        </div>
                        <div class="page-toolbar">
                            <div class="section-note"><i class="fas fa-users"></i><span>Leaders are marked quietly in green.</span></div>
                        </div>
                    </section>
                    ${createSeasonSelector({ seasons, selectedSeasonId: seasonId, idPrefix: 'leagues' })}
                    <section class="page-metrics">
                        <div class="metric-card"><div class="metric-label">Season</div><div class="metric-value">${formatSeasonLabel(selectedSeason)}</div></div>
                        <div class="metric-card"><div class="metric-label">Leagues</div><div class="metric-value">${leagueCount}</div></div>
                        <div class="metric-card"><div class="metric-label">Players</div><div class="metric-value">${playerCount}</div></div>
                    </section>
                    <div class="section-note"><i class="fas fa-info-circle"></i><span>Click a player's name to view their best 10 scores.</span></div>
                    ${tableHtml}
                </div>`;

            bindSeasonSelector(container, renderView);

            container.querySelectorAll('.player-link').forEach((link) => {
                link.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const playerName = link.dataset.playerName;
                    const viewSeasonId = link.dataset.seasonId;
                    showModalWithContent('playerLeagueBest10Modal', `Best 10 Scores for ${playerName}`, async () => {
                        const { data: profile, error: profileError } = await supabase.from('profiles').select('id').eq('full_name', playerName).single();
                        if (profileError) throw profileError;
                        if (!profile) return `<div class='alert alert-danger'>Could not find player.</div>`;

                        const { data: scores, error: scoresError } = await supabase.rpc('get_player_best_10_scores', {
                            p_profile_id: profile.id,
                            p_season_id: viewSeasonId,
                        });
                        if (scoresError) throw scoresError;
                        return createScoresTable(scores, 'No best 10 scores found.');
                    });
                });
            });
        };

        await renderView(selectedSeasonId);
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error loading Leagues: ${error.message}</div>`;
    }
};