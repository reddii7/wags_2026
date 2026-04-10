import { supabase } from '../../config.js';
import { showSpinner } from '../../utils.js';

export const loadAdminWinterDashboardView = async (container) => {
    showSpinner(container);

    // Helper to format season name as "YYYY/YY"
    function formatSeasonName(startYear) {
        if (!startYear) return 'N/A';
        const endYear = String(Number(startYear) + 1).slice(-2);
        return `${startYear}/${endYear}`;
    }

    // Load seasons list from DB (derived from competitions and players)
    async function loadSeasons() {
        const { data, error } = await supabase.from('winter_seasons').select('season');
        if (error) console.warn('Failed to load seasons', error);
        return (data || []).map(s => Number(s.season));
    }

    const seasons = await loadSeasons();
    const currentSeasonYear = seasons.length > 0 ? seasons[0] : new Date().getFullYear();

    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-4">
            <div>
                <h4 class="mb-0">WinterWAGS Admin</h4>
                <small class="text-muted">Current Season: ${formatSeasonName(currentSeasonYear)}</small>
            </div>
            <div>
                <button id="ww-admin-new-season" class="btn btn-outline-primary">Start New Season</button>
            </div>
        </div>

        <div id="ww-admin-message" class="mb-3"></div>

        <div class="row g-3">
            <div class="col-md-6">
                <div class="card h-100">
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title"><i class="fas fa-list-check nav-icon me-2"></i>Competitions</h5>
                        <p class="card-text text-muted small">Create new weekly competitions and manage existing seasons.</p>
                        <div class="mt-auto">
                            <button class="btn btn-primary wags-navigate-btn" data-view="admin-winter-comps">Manage Competitions</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card h-100">
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title"><i class="fas fa-user-cog nav-icon me-2"></i>Players</h5>
                        <p class="card-text text-muted small">Add players from the main WAGS list to the current WinterWAGS season.</p>
                        <div class="mt-auto">
                            <button class="btn btn-primary wags-navigate-btn" data-view="admin-winter-users">Manage Players</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card h-100">
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title"><i class="fas fa-clipboard-list nav-icon me-2"></i>Enter Scores</h5>
                        <p class="card-text text-muted small">Enter and edit weekly gross scores for all players.</p>
                        <div class="mt-auto">
                            <button class="btn btn-primary wags-navigate-btn" data-view="admin-winter-scores">Enter Scores</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card h-100">
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title"><i class="fas fa-sterling-sign nav-icon me-2"></i>Finance</h5>
                        <p class="card-text text-muted small">View the season's cumulative pot and weekly prize breakdowns.</p>
                        <div class="mt-auto">
                            <button class="btn btn-primary wags-navigate-btn" data-view="admin-winter-finance">View Finance</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Event listener for navigation buttons
    container.querySelectorAll('.wags-navigate-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const viewId = e.target.dataset.view;
            if (viewId) {
                document.body.dispatchEvent(new CustomEvent('wags-navigate', {
                    detail: { view: viewId },
                    bubbles: true
                }));
            }
        });
    });

    // Placeholder for "Start New Season" logic
    container.querySelector('#ww-admin-new-season').addEventListener('click', () => {
        alert('The "Start New Season" functionality will be part of the new "Manage Competitions" section.');
    });
};