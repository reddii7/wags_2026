import { supabase } from '../../config.js';
import { showSpinner } from '../../utils.js';

export const loadAdminWinterFinanceView = async (container) => {
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

        <div id="ww-finance-msg" class="mb-3"></div>

        <div class="card mb-3">
            <div class="card-body">
                <h5 class="card-title">Season Finance Overview</h5>
                <div class="row g-3 align-items-end">
                    <div class="col-md-4">
                        <label for="ww-season-select" class="form-label">Season</label>
                        <select id="ww-season-select" class="form-select"></select>
                    </div>
                </div>
            </div>
        </div>

        <div id="ww-finance-summary">
            <!-- Summary cards and table will be rendered here -->
        </div>
    `;

    const msgEl = container.querySelector('#ww-finance-msg');
    const seasonSelect = container.querySelector('#ww-season-select');
    const summaryEl = container.querySelector('#ww-finance-summary');

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

    // Load and display financial data for the selected season
    async function renderFinanceData() {
        const seasonYear = seasonSelect.value;
        showSpinner(summaryEl);
        if (!seasonYear) {
            summaryEl.innerHTML = '<div class="text-muted p-3">Select a season to view financial data.</div>';
            return;
        }

        // Fetch all comps and scores for the season
        const { data: comps, error: cError } = await supabase.from('winter_competitions').select('id, name, competition_date').eq('season', seasonYear).order('competition_date', { ascending: false });
        if (cError) { msgEl.innerHTML = `<div class="alert alert-danger">${cError.message}</div>`; return; }

        const compIds = comps.map(c => c.id);
        const { data: scores, error: sError } = await supabase.from('winter_scores').select('competition_id, score, profiles(full_name)').in('competition_id', compIds);
        if (sError) { msgEl.innerHTML = `<div class="alert alert-danger">${sError.message}</div>`; return; }

        const cumulativePot = scores.length * 2.50;
        let totalWeeklyPrizes = 0;

        const weeklyBreakdown = comps.map(comp => {
            const weekScores = scores.filter(s => s.competition_id === comp.id);
            if (weekScores.length === 0) return null;

            const weeklyPot = weekScores.length * 2.50;
            totalWeeklyPrizes += weeklyPot;

            const maxScore = Math.max(...weekScores.map(s => s.score));
            const winners = weekScores.filter(s => s.score === maxScore).map(s => s.profiles.full_name);
            const payout = winners.length > 0 ? weeklyPot / winners.length : 0;

            return `
                <tr>
                    <td>${new Date(comp.competition_date).toLocaleDateString()}</td>
                    <td>${comp.name}</td>
                    <td class="text-end">${weekScores.length}</td>
                    <td class="text-end">£${weeklyPot.toFixed(2)}</td>
                    <td>${winners.join(', ')}</td>
                    <td class="text-end">£${payout.toFixed(2)}</td>
                </tr>
            `;
        }).filter(Boolean).join('');

        summaryEl.innerHTML = `
            <div class="row g-3 mb-4">
                <div class="col-md-6"><div class="card text-center"><div class="card-body"><h6 class="card-title text-muted">End of Season Pot</h6><div class="display-6 fw-bold">£${cumulativePot.toFixed(2)}</div></div></div></div>
                <div class="col-md-6"><div class="card text-center"><div class="card-body"><h6 class="card-title text-muted">Total Weekly Prizes</h6><div class="display-6 fw-bold">£${totalWeeklyPrizes.toFixed(2)}</div></div></div></div>
            </div>
            <div class="card"><div class="card-body">
                <h5 class="card-title">Weekly Breakdown</h5>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead><tr><th>Date</th><th>Competition</th><th class="text-end">Entries</th><th class="text-end">Weekly Pot</th><th>Winner(s)</th><th class="text-end">Payout</th></tr></thead>
                        <tbody>${weeklyBreakdown || '<tr><td colspan="6" class="text-muted">No scores entered for this season yet.</td></tr>'}</tbody>
                    </table>
                </div>
            </div></div>
        `;
    }

    // Event Listeners
    seasonSelect.addEventListener('change', renderFinanceData);

    // Initial Render
    renderSeasonSelector();
    await renderFinanceData();
};