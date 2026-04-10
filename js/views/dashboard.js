import { supabase } from '../config.js';
import { getCurrentMainSeason } from '../seasons.js';
import { showSpinner, showModalWithContent, createHandicapHistoryContent, createScoresTable, triggerHaptic } from '../utils.js';

export const loadDashboardView = async (container, currentUser) => {
    showSpinner(container);
    try {
        if (!currentUser || ['admin', 'committee'].includes(currentUser.role)) {
            // Public home view
            const [openCompsRes] = await Promise.all([
                supabase.from('competitions').select('id, name, competition_date').eq('status', 'open').order('competition_date', { ascending: true })
            ]);

            const openComps = openCompsRes.data;

            const publicViews = [
                { view: 'results', icon: 'fa-trophy', title: 'Results', body: 'See the latest scores, placings and prize outcomes.' },
                { view: 'best14', icon: 'fa-star', title: 'Best 14', body: 'Check who is leading the season-long race.' },
                { view: 'handicaps', icon: 'fa-golf-ball-tee', title: 'Handicaps', body: 'View current marks and track movement over time.' },
                { view: 'leagues', icon: 'fa-users', title: 'Leagues', body: 'Follow each division and how players are shaping up.' },
                { view: 'winterwags', icon: 'fa-snowflake', title: 'WinterWAGS', body: 'Jump into the separate winter competition tables.' },
            ];

            let dashHtml = `
                <section class="landing-hero mb-4">
                    <div class="landing-hero-card">
                        <div class="page-kicker">welcome to the</div>
                        <div class="landing-brand-name">WAGS</div>
                        <div class="landing-trust">Everything you need to follow the season in one place</div>
                        <h1 class="landing-title">Follow the latest <span>results</span> and keep track of the wider season.</h1>
                        <p class="landing-subtitle">Start with this week’s competition, then move into Best 14, leagues, handicaps when you want the bigger picture.</p>
                        <div class="landing-actions">
                            <button type="button" class="btn landing-action-primary" data-view="results">Results</button>
                            <button type="button" class="btn landing-action-secondary" data-view="handicaps">Handicaps</button>
                        </div>
                    </div>
                </section>
                <section class="landing-grid mb-4">
                    ${publicViews.map(item => `
                        <a href="#" class="landing-tile" data-view="${item.view}">
                            <div class="landing-tile-top">
                                <div class="landing-tile-icon"><i class="fas ${item.icon}"></i></div>
                                <div>
                                    <div class="landing-tile-title">${item.title}</div>
                                    <div class="landing-tile-copy">${item.body}</div>
                                </div>
                            </div>
                            <div class="landing-tile-cta">Go to ${item.title}</div>
                        </a>
                    `).join('')}
                </section>`;

            if (openComps && openComps.length > 0) {
                dashHtml += `<section class="landing-panel mb-4"><div class="landing-panel-body"><div class="d-flex justify-content-between align-items-center mb-3"><h2 class="h4 mb-0">Open Competitions</h2><span class="badge text-bg-light">${openComps.length}</span></div><div class="landing-open-list">`;
                openComps.forEach(comp => {
                    dashHtml += `<div class="landing-open-item"><div><div class="fw-semibold">${comp.name}</div><div class="text-muted small">${new Date(comp.competition_date).toLocaleDateString()}</div></div><button type="button" class="btn btn-outline-primary btn-sm landing-open-btn" data-view="results">Results</button></div>`;
                });
                dashHtml += `</div></div></section>`;
            }

            container.innerHTML = dashHtml;
            container.querySelectorAll('[data-view]').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    triggerHaptic(10);
                    container.dispatchEvent(new CustomEvent('wags-navigate', {
                        detail: { view: link.dataset.view },
                        bubbles: true,
                    }));
                });
            });
            return;
        }

        // Personal home view for logged-in users
        const currentSeason = await getCurrentMainSeason();
        const currentSeasonId = currentSeason?.id || null;

        const [profileRes, best14TotalRes, openCompsRes, userRoundsRes, lastRoundRes] = await Promise.all([
            supabase.from('profiles').select('full_name, current_handicap, league_name').eq('id', currentUser.id).single(),
            currentSeasonId
                ? supabase.rpc('get_player_best_14_total', { p_profile_id: currentUser.id, p_season_id: currentSeasonId })
                : Promise.resolve({ data: [] }),
            supabase.from('competitions').select('id, name, competition_date').eq('status', 'open').order('competition_date', { ascending: true }),
            supabase.from('rounds').select('competition_id').eq('user_id', currentUser.id),
            supabase.from('rounds').select('stableford_score, competitions(name)').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(1).single()
        ]);

        if (profileRes.error) throw profileRes.error;

        const profile = profileRes.data;
        const best14Total = best14TotalRes.data?.[0];
        const openComps = openCompsRes.data;
        const userRounds = userRoundsRes.data;
        const lastRound = lastRoundRes.data;

        let dashHtml = `<div class="page-shell"><section class="page-hero"><div class="page-heading"><div class="page-kicker">Player home</div><h1 class="mb-1">Welcome, ${profile?.full_name || 'Player'}!</h1><p class="page-summary">Your current season snapshot, latest round and score submission live here.</p></div><div class="page-metrics"><div class="metric-card"><div class="metric-label">League</div><div class="metric-value">${profile?.league_name || 'Unassigned'}</div></div><div class="metric-card"><div class="metric-label">Open comps</div><div class="metric-value">${openComps?.length ?? 0}</div></div></div></section>`;

        dashHtml += `<div class="row g-3 mb-4">
            <div class="col-12 col-md-6 mb-3">
                <div class="card text-center h-100"><div class="card-body">
                    <h5 class="card-title">Current Handicap</h5>
                    <div class="display-6">${profile?.current_handicap ?? 'N/A'}</div>
                    <div class="small text-muted mt-2">START: <strong id="start-hcap-val">...</strong> &nbsp; | &nbsp; CURR: <strong>${profile?.current_handicap ?? 'N/A'}</strong></div>
                    <button data-modal-id="myHandicapHistoryModal" class="btn btn-secondary mt-2">View H'cap History</button>
                </div></div>
            </div>
            <div class="col-12 col-md-6 mb-3">
                <div class="card text-center h-100"><div class="card-body">
                    <h5 class="card-title">Best 14 Total</h5>
                    <div class="display-6">${best14Total?.total ?? 'N/A'}</div>
                    ${best14TotalRes.error ? `<div class='text-danger small'>${best14TotalRes.error.message}</div>` : ''}
                    ${best14Total ? `<div class="small text-muted mt-2">PLAYED: <strong>${best14Total.games_played ?? 0}</strong> &nbsp; | &nbsp; POS: <strong>${best14Total.pos ?? '-'}</strong></div>
                    <button data-modal-id="myBest14Modal" class="btn btn-secondary mt-2">View My Best 14</button>` : ''}
                </div></div>
            </div>
        </div>`;

        let lastRoundHtml = '<div class="small text-muted mt-2">No rounds played yet.</div>';
        if (lastRoundRes.error) {
            lastRoundHtml = `<div class="small text-danger mt-2">Error loading last round.</div>`;
        } else if (lastRound) {
            const compName = lastRound.competitions?.name || 'N/A';
            const score = lastRound.stableford_score ?? 'N/A';
            lastRoundHtml = `<div class="small text-muted mt-2">LAST ROUND: <strong>${compName}</strong> &nbsp; | &nbsp; SCORE: <strong>${score}</strong></div>`;
        }
        dashHtml += `<div class="mb-4"><div class="card text-center"><div class="card-body"><h5 class="card-title">My Rounds</h5>${lastRoundHtml}<button data-modal-id="myRoundsModal" class="btn btn-primary mt-2">View All Rounds</button></div></div></div>`;

        const submittedCompIds = userRounds?.map(r => r.competition_id) || [];
        const nextComp = openComps?.[0];
        if (nextComp && !submittedCompIds.includes(nextComp.id)) {
            dashHtml += `<div class="alert alert-info mb-4">Next competition: <strong>${nextComp.name}</strong> on <strong>${new Date(nextComp.competition_date).toLocaleDateString()}</strong>. You haven't entered a score yet!</div>`;
        }

        dashHtml += `<div class="row"><div class="col-12 col-lg-8 mb-4"><div class="card"><div class="card-body"><div class="section-title-row"><h5 class="card-title mb-0">Submit A Score</h5><span class="small text-muted">Current competition entry</span></div><form id="add-score-form"><fieldset><div class="mb-3"><label for="open-comp-select" class="form-label">Competition</label><select id="open-comp-select" class="form-select" required><option>Loading...</option></select></div><div class="mb-3"><label for="stableford-score-input" class="form-label">Points</label><input type="number" id="stableford-score-input" class="form-control" required min="0" max="60"></div><div class="d-flex align-items-center mb-3"><div class="form-check me-3"><input class="form-check-input" type="checkbox" id="has-snake-check"><label class="form-check-label" for="has-snake-check">Snake?</label></div><div class="form-check"><input class="form-check-input" type="checkbox" id="has-camel-check"><label class="form-check-label" for="has-camel-check">Camel?</label></div></div><button type="submit" class="btn btn-primary" disabled>Submit Score</button></fieldset><div id="form-message" class="mt-2"></div></form></div></div></div></div></div>`;

        container.innerHTML = dashHtml;

        supabase.from('handicap_history').select('new_handicap').eq('user_id', currentUser.id).order('created_at', { ascending: true }).limit(1).then(({ data }) => {
            const startVal = data?.[0]?.new_handicap ?? profile?.current_handicap ?? 'N/A';
            const el = container.querySelector('#start-hcap-val');
            if (el) el.textContent = startVal;
        });

        container.querySelector('button[data-modal-id="myHandicapHistoryModal"]')?.addEventListener('click', () => {
            showModalWithContent('myHandicapHistoryModal', 'Handicap History', () => createHandicapHistoryContent(currentUser.id));
        });

        container.querySelector('button[data-modal-id="myBest14Modal"]')?.addEventListener('click', () => {
            showModalWithContent('myBest14Modal', 'My Best 14 Scores', async () => {
                const { data, error } = await supabase.rpc('get_player_best_14_scores', {
                    p_profile_id: currentUser.id,
                    p_season_id: currentSeasonId,
                });
                if (error) throw error;
                return createScoresTable(data);
            });
        });

        container.querySelector('button[data-modal-id="myRoundsModal"]')?.addEventListener('click', () => {
            showModalWithContent('myRoundsModal', 'All Rounds Played', async () => {
                const { data: allRounds, error } = await supabase.from('rounds').select('*, competitions(name, competition_date)').eq('user_id', currentUser.id).order('created_at', { ascending: false });
                if (error) throw error;
                if (!allRounds || allRounds.length === 0) return '<div class="text-muted">No rounds found.</div>';
                const tableRows = allRounds.map(r => `<tr><td>${r.competitions?.name || r.competition_id}</td><td>${r.competitions?.competition_date ? new Date(r.competitions.competition_date).toLocaleDateString() : ''}</td><td>${r.stableford_score ?? ''}</td><td>${r.has_snake ? 'Yes' : ''}</td><td>${r.has_camel ? 'Yes' : ''}</td></tr>`).join('');
                return `<div class="table-responsive"><table class="table table-striped"><thead><tr><th>Competition</th><th>Date</th><th>Score</th><th>Snake</th><th>Camel</th></tr></thead><tbody>${tableRows}</tbody></table></div>`;
            });
        });

        const compSelect = container.querySelector('#open-comp-select');
        const submitBtn = container.querySelector('button[type="submit"]');
        const availableComps = openComps?.filter(c => !submittedCompIds.includes(c.id)) || [];

        if (availableComps.length > 0) {
            compSelect.innerHTML = availableComps.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            submitBtn.disabled = false;
        } else {
            compSelect.innerHTML = '<option>No open competitions to enter</option>';
        }

        container.querySelector('#add-score-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            triggerHaptic(10);
            const msgEl = container.querySelector('#form-message');
            submitBtn.disabled = true;
            msgEl.className = 'alert alert-info mt-2';
            msgEl.textContent = 'Submitting...';

            const { error } = await supabase.from('rounds').insert([{
                competition_id: compSelect.value,
                user_id: currentUser.id,
                stableford_score: parseInt(container.querySelector('#stableford-score-input').value, 10),
                has_snake: container.querySelector('#has-snake-check').checked,
                has_camel: container.querySelector('#has-camel-check').checked
            }]);

            if (error) {
                msgEl.className = 'alert alert-danger mt-2';
                msgEl.textContent = `Error: ${error.message}`;
                submitBtn.disabled = false;
            } else {
                // Dispatch a custom event to tell the UI router to refresh the view
                e.target.dispatchEvent(new CustomEvent('wags-navigate', { detail: { view: 'home' }, bubbles: true }));
            }
        });
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error loading home view: ${error.message}</div>`;
    }
};