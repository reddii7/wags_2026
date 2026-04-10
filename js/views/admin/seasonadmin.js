import { supabase } from '../../config.js';
import { showSpinner } from '../../utils.js';
import { clearMainSeasonsCache, formatSeasonLabel, getCurrentMainSeason, loadMainSeasons } from '../../seasons.js';

const getDefaultSeasonValues = () => {
    const nextYear = new Date().getFullYear() + 1;
    return {
        name: `Summer ${nextYear}`,
        startYear: String(nextYear),
        startDate: `${nextYear}-01-01`,
        endDate: `${nextYear}-12-31`,
    };
};

const setCurrentSeason = async (seasonId) => {
    const { error: clearError } = await supabase.from('seasons').update({ is_current: false }).neq('id', seasonId);
    if (clearError) throw clearError;

    const { error: setError } = await supabase.from('seasons').update({ is_current: true }).eq('id', seasonId);
    if (setError) throw setError;
};

export const loadAdminSeasonAdminView = async (container, role) => {
    if (role !== 'admin') {
        container.innerHTML = '<div class="alert alert-warning">Only admins can manage seasons.</div>';
        return;
    }

    const renderView = async () => {
        showSpinner(container);

        try {
            clearMainSeasonsCache();
            const [seasons, currentSeason] = await Promise.all([
                loadMainSeasons({ forceRefresh: true }),
                getCurrentMainSeason(),
            ]);
            const defaults = getDefaultSeasonValues();

            container.innerHTML = `
                <div class="d-flex justify-content-between align-items-end gap-3 mb-4 flex-wrap">
                    <div>
                        <h1 class="mb-1">Season Admin</h1>
                        <div class="small text-muted">Create summer seasons, set the current one, and snapshot league memberships.</div>
                    </div>
                    <button class="btn btn-outline-secondary" id="season-admin-refresh-btn">Refresh</button>
                </div>
                <div class="row g-4">
                    <div class="col-xl-6">
                        <div class="card h-100">
                            <div class="card-body">
                                <h5 class="card-title">Create Season</h5>
                                <form id="create-season-form" class="row g-3">
                                    <div class="col-md-6">
                                        <label for="season-name" class="form-label">Name</label>
                                        <input id="season-name" class="form-control" value="${defaults.name}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label for="season-start-year" class="form-label">Start Year</label>
                                        <input id="season-start-year" class="form-control" type="number" value="${defaults.startYear}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label for="season-start-date" class="form-label">Start Date</label>
                                        <input id="season-start-date" class="form-control" type="date" value="${defaults.startDate}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label for="season-end-date" class="form-label">End Date</label>
                                        <input id="season-end-date" class="form-control" type="date" value="${defaults.endDate}" required>
                                    </div>
                                    <div class="col-12">
                                        <div class="form-check">
                                            <input class="form-check-input" type="checkbox" id="season-make-current">
                                            <label class="form-check-label" for="season-make-current">Make this the current season after creation</label>
                                        </div>
                                    </div>
                                    <div class="col-12">
                                        <button type="submit" class="btn btn-primary">Create Season</button>
                                    </div>
                                    <div class="col-12"><div id="create-season-message"></div></div>
                                </form>
                            </div>
                        </div>
                    </div>
                    <div class="col-xl-6">
                        <div class="card h-100">
                            <div class="card-body">
                                <h5 class="card-title">Current Season</h5>
                                <div class="small text-muted mb-3">Current: ${currentSeason ? formatSeasonLabel(currentSeason) : 'None set'}</div>
                                <form id="set-current-season-form" class="row g-3 mb-4">
                                    <div class="col-md-8">
                                        <label for="current-season-select" class="form-label">Season</label>
                                        <select id="current-season-select" class="form-select" ${seasons.length ? '' : 'disabled'}>
                                            ${seasons.map((season) => `<option value="${season.id}" ${season.id === currentSeason?.id ? 'selected' : ''}>${formatSeasonLabel(season)}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div class="col-md-4 d-flex align-items-end">
                                        <button type="submit" class="btn btn-outline-primary w-100" ${seasons.length ? '' : 'disabled'}>Set Current</button>
                                    </div>
                                    <div class="col-12"><div id="set-current-season-message"></div></div>
                                </form>
                                <h5 class="card-title">Snapshot League Memberships</h5>
                                <form id="snapshot-season-form" class="row g-3">
                                    <div class="col-md-8">
                                        <label for="snapshot-season-select" class="form-label">Season</label>
                                        <select id="snapshot-season-select" class="form-select" ${seasons.length ? '' : 'disabled'}>
                                            ${seasons.map((season) => `<option value="${season.start_year}">${formatSeasonLabel(season)}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div class="col-md-4 d-flex align-items-end">
                                        <button type="submit" class="btn btn-outline-success w-100" ${seasons.length ? '' : 'disabled'}>Snapshot</button>
                                    </div>
                                    <div class="col-12"><div id="snapshot-season-message"></div></div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card mt-4">
                    <div class="card-body">
                        <h5 class="card-title">Configured Seasons</h5>
                        ${seasons.length ? `
                            <div class="table-responsive">
                                <table class="table table-striped align-middle mb-0">
                                    <thead><tr><th>Name</th><th>Year</th><th>Dates</th><th>Status</th></tr></thead>
                                    <tbody>
                                        ${seasons.map((season) => `
                                            <tr>
                                                <td>${season.name}</td>
                                                <td>${season.start_year}</td>
                                                <td>${season.start_date} to ${season.end_date}</td>
                                                <td>${season.is_current ? '<span class="badge text-bg-success">Current</span>' : '<span class="badge text-bg-secondary">Archived</span>'}</td>
                                            </tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>`
                    : '<div class="text-muted">No seasons configured yet.</div>'}
                    </div>
                </div>`;

            container.querySelector('#season-admin-refresh-btn')?.addEventListener('click', renderView);

            container.querySelector('#create-season-form')?.addEventListener('submit', async (event) => {
                event.preventDefault();
                const messageEl = container.querySelector('#create-season-message');
                const name = container.querySelector('#season-name').value.trim();
                const startYear = Number.parseInt(container.querySelector('#season-start-year').value, 10);
                const startDate = container.querySelector('#season-start-date').value;
                const endDate = container.querySelector('#season-end-date').value;
                const makeCurrent = container.querySelector('#season-make-current').checked;

                if (!name || !Number.isInteger(startYear) || !startDate || !endDate || startDate > endDate) {
                    messageEl.className = 'alert alert-danger mt-2';
                    messageEl.textContent = 'Enter a valid season name, year and date range.';
                    return;
                }

                try {
                    messageEl.className = 'text-info mt-2';
                    messageEl.textContent = 'Creating season...';
                    const { data, error } = await supabase.from('seasons').insert({
                        name,
                        start_year: startYear,
                        start_date: startDate,
                        end_date: endDate,
                        is_current: false,
                    }).select('id').single();
                    if (error) throw error;
                    if (makeCurrent && data?.id) {
                        await setCurrentSeason(data.id);
                    }
                    await renderView();
                } catch (error) {
                    messageEl.className = 'alert alert-danger mt-2';
                    messageEl.textContent = error.message;
                }
            });

            container.querySelector('#set-current-season-form')?.addEventListener('submit', async (event) => {
                event.preventDefault();
                const messageEl = container.querySelector('#set-current-season-message');
                const seasonId = container.querySelector('#current-season-select').value;

                try {
                    messageEl.className = 'text-info mt-2';
                    messageEl.textContent = 'Updating current season...';
                    await setCurrentSeason(seasonId);
                    await renderView();
                } catch (error) {
                    messageEl.className = 'alert alert-danger mt-2';
                    messageEl.textContent = error.message;
                }
            });

            container.querySelector('#snapshot-season-form')?.addEventListener('submit', async (event) => {
                event.preventDefault();
                const messageEl = container.querySelector('#snapshot-season-message');
                const startYear = Number.parseInt(container.querySelector('#snapshot-season-select').value, 10);

                try {
                    messageEl.className = 'text-info mt-2';
                    messageEl.textContent = 'Snapshotting league memberships...';
                    const { error } = await supabase.rpc('snapshot_season_league_memberships', { p_start_year: startYear });
                    if (error) throw error;
                    messageEl.className = 'alert alert-success mt-2';
                    messageEl.textContent = `League memberships snapshotted for ${startYear}.`;
                } catch (error) {
                    messageEl.className = 'alert alert-danger mt-2';
                    messageEl.textContent = error.message;
                }
            });
        } catch (error) {
            container.innerHTML = `<div class="alert alert-danger">Error loading season admin: ${error.message}</div>`;
        }
    };

    await renderView();
};
