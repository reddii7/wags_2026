import { supabase } from '../config.js';
import { formatSeasonLabel, getCurrentMainSeason, loadMainSeasons } from '../seasons.js';
import { showSpinner, showModalWithContent, createScoresTable, createQuietSparkline, createSeasonSelector, bindSeasonSelector } from '../utils.js';

export const loadBest14View = async (container) => {
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
            const { data, error } = await supabase.rpc('get_best_14_scores', { p_season_id: seasonId });
            if (error) {
                container.innerHTML = `<div class="alert alert-danger">Error fetching data: ${error.message}</div>`;
                return;
            }

            const sorted = (data || []).slice().sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0));
            const topScore = sorted[0]?.total_score ?? '-';
            const sparklineHtml = createQuietSparkline(sorted.map((player) => player.total_score ?? 0));

            let tableHtml = `<table class="table table-striped"><thead><tr><th>Pos</th><th>Player</th><th class="text-center">Best 14</th></tr></thead><tbody>`;
            let lastScore = null;
            let lastPos = 0;
            sorted.forEach((player, index) => {
                const pos = player.total_score === lastScore ? lastPos : index + 1;
                lastScore = player.total_score;
                lastPos = pos;
                tableHtml += `<tr><td>${pos}</td><td><a href="#" class="player-link" data-player-name="${player.full_name}" data-season-id="${seasonId}">${player.full_name}</a></td><td class="text-center">${player.total_score}</td></tr>`;
            });
            tableHtml += `</tbody></table>`;

            container.innerHTML = `
                <div class="page-shell">
                    <section class="page-hero">
                        <div class="page-heading">
                            <div class="page-kicker">Season leaderboard</div>
                            <h1 class="mb-1">Best 14 Scores</h1>
                            <p class="page-summary">Follow the season totals and open any player to inspect the rounds behind their ranking.</p>
                        </div>
                        <div class="page-toolbar">
                            <div class="section-note"><i class="fas fa-wave-square"></i><span>Quiet trend view of the current leaderboard.</span></div>
                        </div>
                    </section>
                    ${createSeasonSelector({ seasons, selectedSeasonId: seasonId, idPrefix: 'best14' })}
                    <section class="page-metrics">
                        <div class="metric-card"><div class="metric-label">Season</div><div class="metric-value">${formatSeasonLabel(selectedSeason)}</div></div>
                        <div class="metric-card"><div class="metric-label">Players ranked</div><div class="metric-value">${sorted.length}</div></div>
                        <div class="metric-card"><div class="metric-label">Leading total</div><div class="metric-value">${topScore}</div></div>
                    </section>
                    <section class="surface-block">
                        <div class="section-title-row"><h5>Trend</h5><span class="small text-muted">Season pace</span></div>
                        ${sparklineHtml}
                    </section>
                    <section class="surface-block table-panel">
                        <div class="section-note mb-3"><i class="fas fa-info-circle"></i><span>Click a player's name to view their scores.</span></div>
                        <div class="table-responsive">${tableHtml}</div>
                    </section>
                </div>`;

            bindSeasonSelector(container, renderView);

            container.querySelectorAll('.player-link').forEach((link) => {
                link.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const playerName = link.dataset.playerName;
                    const viewSeasonId = link.dataset.seasonId;
                    showModalWithContent('playerBest14Modal', `Best 14 Scores for ${playerName}`, async () => {
                        const { data: profile, error: profileError } = await supabase.from('profiles').select('id').eq('full_name', playerName).single();
                        if (profileError) throw profileError;
                        if (!profile) return `<div class='alert alert-danger'>Could not find player.</div>`;

                        const { data: scores, error: scoresError } = await supabase.rpc('get_player_best_14_scores', {
                            p_profile_id: profile.id,
                            p_season_id: viewSeasonId,
                        });
                        if (scoresError) throw scoresError;
                        return createScoresTable(scores);
                    });
                });
            });
        };

        await renderView(selectedSeasonId);
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error loading Best 14: ${error.message}</div>`;
    }
};