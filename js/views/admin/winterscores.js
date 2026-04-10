import { supabase } from '../../config.js';
import { showSpinner } from '../../utils.js';

export const loadAdminWinterScoresView = async (container) => {
    showSpinner(container);

    // Helper to format season name
    function formatSeasonName(startYear) {
        if (!startYear) return 'N/A';
        const endYear = String(Number(startYear) + 1).slice(-2);
        return `${startYear}/${endYear}`;
    }

    // Load seasons list from DB
    async function loadSeasons() {
        const { data, error } = await supabase.from('winter_seasons').select('season');
        if (error) console.warn('Failed to load seasons', error);
        return (data || []).map(s => Number(s.season));
    }

    const seasons = await loadSeasons();
    const currentSeasonYear = seasons.length > 0 ? seasons[0] : null;

    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <a href="#" class="text-decoration-none" id="back-to-ww-admin">&larr; Back to WinterWAGS Admin</a>
        </div>

        <div id="ww-score-msg" class="mb-3"></div>

        <div class="card">
            <div class="card-body">
                <h5 class="card-title">Enter Weekly Scores</h5>
                <div class="row g-3 align-items-end mb-3">
                    <div class="col-md-4">
                        <label for="ww-season-select" class="form-label">Season</label>
                        <select id="ww-season-select" class="form-select"></select>
                    </div>
                    <div class="col-md-8">
                        <label for="ww-score-comp-select" class="form-label">Competition</label>
                        <select id="ww-score-comp-select" class="form-select"></select>
                    </div>
                </div>

                <div id="ww-score-entry-list" style="max-height: 500px; overflow-y: auto;">
                    <!-- Player score inputs will be rendered here -->
                </div>

                <div class="mt-3">
                    <button id="ww-save-scores" class="btn btn-primary">Save All Scores</button>
                </div>
            </div>
        </div>
    `;

    const msgEl = container.querySelector('#ww-score-msg');
    const seasonSelect = container.querySelector('#ww-season-select');
    const compSelect = container.querySelector('#ww-score-comp-select');
    const scoreListEl = container.querySelector('#ww-score-entry-list');

    // Back navigation
    container.querySelector('#back-to-ww-admin').addEventListener('click', (e) => {
        e.preventDefault();
        document.body.dispatchEvent(new CustomEvent('wags-navigate', { detail: { view: 'admin-winter' }, bubbles: true }));
    });

    // Populate seasons dropdown
    function renderSeasonSelector() {
        seasonSelect.innerHTML = seasons.length > 0
            ? seasons.map(year => `<option value="${year}">${formatSeasonName(year)}</option>`).join('')
            : '<option>No seasons found</option>';
        if (currentSeasonYear) seasonSelect.value = currentSeasonYear;
    }

    // Load competitions for the selected season
    async function renderCompSelector() {
        const seasonYear = seasonSelect.value;
        compSelect.innerHTML = '<option>Loading...</option>';
        if (!seasonYear) { compSelect.innerHTML = '<option>Select a season first</option>'; return; }

        const { data: comps, error } = await supabase.from('winter_competitions').select('id, name, competition_date').eq('season', seasonYear).order('competition_date', { ascending: false });
        if (error) { compSelect.innerHTML = `<option>Error loading comps</option>`; return; }

        compSelect.innerHTML = comps.length > 0
            ? comps.map(c => `<option value="${c.id}">${c.name} (${new Date(c.competition_date).toLocaleDateString()})</option>`).join('')
            : '<option>No competitions in this season</option>';

        await renderScoreForm();
    }

    // Render the score entry form for the selected competition
    async function renderScoreForm() {
        const competitionId = compSelect.value;
        const seasonYear = seasonSelect.value;
        showSpinner(scoreListEl);

        if (!competitionId || !seasonYear) {
            scoreListEl.innerHTML = '<div class="text-muted p-3">Select a season and competition to enter scores.</div>';
            return;
        }

        const [{ data: players, error: pError }, { data: scores, error: sError }] = await Promise.all([
            supabase.from('winter_players').select('profiles(id, full_name)').eq('season', seasonYear).order('profiles(full_name)'),
            supabase.from('winter_scores').select('user_id, score').eq('competition_id', competitionId)
        ]);

        if (pError || sError) { scoreListEl.innerHTML = `<div class="alert alert-danger">Error loading data: ${pError?.message || sError?.message}</div>`; return; }

        const scoreMap = new Map(scores.map(s => [s.user_id, s.score]));

        scoreListEl.innerHTML = players.map(p => {
            const profile = p.profiles;
            if (!profile) return '';
            const currentScore = scoreMap.get(profile.id) || '';
            return `
                <div class="row g-2 mb-2 align-items-center">
                    <div class="col-6">
                        <label class="form-label-plaintext">${profile.full_name}</label>
                    </div>
                    <div class="col-6">
                        <input type="number" class="form-control score-input" data-user-id="${profile.id}" value="${currentScore}" placeholder="Gross Score">
                    </div>
                </div>
            `;
        }).join('');
    }

    // Event Listeners
    seasonSelect.addEventListener('change', renderCompSelector);
    compSelect.addEventListener('change', renderScoreForm);

    container.querySelector('#ww-save-scores').addEventListener('click', async () => {
        const competitionId = compSelect.value;
        if (!competitionId) { msgEl.innerHTML = `<div class="alert alert-warning">Please select a competition.</div>`; return; }

        const scoresToUpsert = [];
        container.querySelectorAll('.score-input').forEach(input => {
            if (input.value !== null && input.value.trim() !== '') {
                scoresToUpsert.push({
                    user_id: input.dataset.userId,
                    competition_id: competitionId,
                    score: Number(input.value)
                });
            }
        });

        if (scoresToUpsert.length === 0) { msgEl.innerHTML = `<div class="alert alert-info">No scores entered to save.</div>`; return; }

        msgEl.innerHTML = `<div class="text-muted">Saving ${scoresToUpsert.length} scores...</div>`;
        const { error } = await supabase.from('winter_scores').upsert(scoresToUpsert, { onConflict: ['user_id', 'competition_id'] });

        if (error) { msgEl.innerHTML = `<div class="alert alert-danger">Error saving scores: ${error.message}</div>`; }
        else { msgEl.innerHTML = `<div class="alert alert-success">Successfully saved ${scoresToUpsert.length} scores.</div>`; }
    });

    // Initial Render
    renderSeasonSelector();
    await renderCompSelector();
};