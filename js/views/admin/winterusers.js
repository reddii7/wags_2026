import { supabase } from '../../config.js';
import { showSpinner } from '../../utils.js';

export const loadAdminWinterUsersView = async (container) => {
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
    let allProfilesCache = [];
    let winterPlayerIds = new Set();

    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <a href="#" class="text-decoration-none" id="back-to-ww-admin">&larr; Back to WinterWAGS Admin</a>
        </div>

        <div id="ww-admin-message" class="mb-3"></div>

        <div class="row g-3">
            <!-- Left Column: Add Players -->
            <div class="col-md-7">
                <div class="card h-100">
                    <div class="card-body">
                        <h5 class="card-title">Add Players to Season</h5>
                        <div class="row g-2 mb-2 align-items-end">
                            <div class="col-sm-6">
                                <label for="ww-season-select" class="form-label small">Season</label>
                                <select id="ww-season-select" class="form-select"></select>
                            </div>
                            <div class="col-sm-6">
                                <label for="ww-player-search" class="form-label small">Search Players</label>
                                <input id="ww-player-search" class="form-control" placeholder="Filter by name..." />
                            </div>
                        </div>
                        <div id="ww-all-players-list" class="list-group mb-3" style="max-height: 400px; overflow-y: auto;"></div>
                        <button id="ww-add-selected-players" class="btn btn-primary">Add Selected to Season</button>
                    </div>
                </div>
            </div>

            <!-- Right Column: Current Players -->
            <div class="col-md-5">
                <div class="card h-100">
                    <div class="card-body">
                        <h5 class="card-title">Players in Season</h5>
                        <div id="ww-season-players-list" class="list-group">
                            <!-- Players in the selected season will be listed here -->
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const msgEl = container.querySelector('#ww-admin-message');
    const seasonSelect = container.querySelector('#ww-season-select');
    const searchInput = container.querySelector('#ww-player-search');
    const allPlayersListEl = container.querySelector('#ww-all-players-list');
    const seasonPlayersListEl = container.querySelector('#ww-season-players-list');

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

    // Render the list of all WAGS players
    function renderAllPlayersList() {
        const filter = searchInput.value.toLowerCase();
        const filteredProfiles = allProfilesCache.filter(p => p.full_name.toLowerCase().includes(filter));

        allPlayersListEl.innerHTML = filteredProfiles.map(p => {
            const isAdded = winterPlayerIds.has(p.id);
            return `
                <label class="list-group-item d-flex justify-content-between align-items-center">
                    <span>${p.full_name}</span>
                    ${isAdded
                    ? '<span class="badge bg-success">Added</span>'
                    : `<input class="form-check-input" type="checkbox" data-user-id="${p.id}" data-full-name="${p.full_name}">`
                }
                </label>`;
        }).join('');
    }

    // Render the list of players in the current winter season
    function renderSeasonPlayersList() {
        const seasonPlayers = allProfilesCache.filter(p => winterPlayerIds.has(p.id));
        seasonPlayersListEl.innerHTML = seasonPlayers.length > 0
            ? seasonPlayers.map(p => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <span>${p.full_name}</span>
                    <button class="btn btn-sm btn-outline-danger remove-player-btn" data-user-id="${p.id}">&times;</button>
                </div>`).join('')
            : '<div class="list-group-item text-muted">No players in this season yet.</div>';
    }

    // Fetch data and re-render lists
    async function refreshLists() {
        const seasonYear = seasonSelect.value;
        if (!seasonYear) return;

        showSpinner(seasonPlayersListEl);
        const { data: winterPlayers, error } = await supabase.from('winter_players').select('user_id').eq('season', seasonYear);
        if (error) {
            msgEl.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
            return;
        }
        winterPlayerIds = new Set(winterPlayers.map(p => p.user_id));
        renderAllPlayersList();
        renderSeasonPlayersList();
    }

    // Event Listeners
    seasonSelect.addEventListener('change', refreshLists);
    searchInput.addEventListener('input', renderAllPlayersList);

    container.querySelector('#ww-add-selected-players').addEventListener('click', async () => {
        const checked = Array.from(allPlayersListEl.querySelectorAll('input:checked'));
        const seasonYear = seasonSelect.value;
        if (checked.length === 0 || !seasonYear) return;

        msgEl.innerHTML = `<div class="text-muted">Adding ${checked.length} players...</div>`;
        const playersToAdd = checked.map(cb => ({ user_id: cb.dataset.userId, season: String(seasonYear) }));

        const { error } = await supabase.from('winter_players').upsert(playersToAdd, { onConflict: ['user_id', 'season'] });
        if (error) {
            msgEl.innerHTML = `<div class="alert alert-danger">Error adding players: ${error.message}</div>`;
        } else {
            msgEl.innerHTML = `<div class="alert alert-success">${checked.length} players added to season.</div>`;
            await refreshLists();
        }
    });

    seasonPlayersListEl.addEventListener('click', async (e) => {
        if (!e.target.classList.contains('remove-player-btn')) return;

        const userId = e.target.dataset.userId;
        const seasonYear = seasonSelect.value;
        if (!userId || !seasonYear) return;

        if (!confirm('Are you sure you want to remove this player from the season? Their scores will also be deleted.')) return;

        msgEl.innerHTML = `<div class="text-muted">Removing player...</div>`;
        // Note: A database function/trigger would be better to cascade delete scores.
        // For now, we just remove them from the winter_players list.
        const { error } = await supabase.from('winter_players').delete().match({ user_id: userId, season: seasonYear });

        if (error) {
            msgEl.innerHTML = `<div class="alert alert-danger">Error removing player: ${error.message}</div>`;
        } else {
            msgEl.innerHTML = `<div class="alert alert-success">Player removed from season.</div>`;
            await refreshLists();
        }
    });

    // Initial Load
    async function initialize() {
        renderSeasonSelector();
        showSpinner(allPlayersListEl);
        const { data: profiles, error } = await supabase.from('profiles').select('id, full_name').order('full_name');
        if (error) {
            msgEl.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
            return;
        }
        allProfilesCache = profiles;
        await refreshLists();
    }

    await initialize();
};