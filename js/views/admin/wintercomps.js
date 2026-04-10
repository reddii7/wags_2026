import { supabase } from '../../config.js';
import { showSpinner } from '../../utils.js';

export const loadAdminWinterCompsView = async (container) => {
    showSpinner(container);

    // Helper to format season name as "YYYY/YY"
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
            <button id="ww-admin-new-season" class="btn btn-outline-primary">Start New Season</button>
        </div>

        <div id="ww-admin-message" class="mb-3"></div>

        <div class="card mb-3">
            <div class="card-body">
                <h5 class="card-title">Manage Competitions</h5>
                <div class="row g-3 align-items-end">
                    <div class="col-md-4">
                        <label for="ww-season-select" class="form-label">Season</label>
                        <select id="ww-season-select" class="form-select"></select>
                    </div>
                    <div class="col-md-4">
                        <label for="ww-comp-date" class="form-label">New Competition Date</label>
                        <input id="ww-comp-date" type="date" class="form-control" />
                    </div>
                    <div class="col-md-4">
                        <button id="ww-create-comp" class="btn btn-primary w-100">Create Weekly Competition</button>
                    </div>
                </div>
                <div id="ww-create-comp-msg" class="mt-2"></div>
            </div>
        </div>

        <div class="card">
            <div class="card-body">
                <h5 class="card-title">Existing Competitions</h5>
                <div id="ww-current-comps-list" class="list-group">
                    <!-- Competitions will be listed here -->
                </div>
            </div>
        </div>
    `;

    const msgEl = container.querySelector('#ww-admin-message');
    const createCompMsgEl = container.querySelector('#ww-create-comp-msg');
    const seasonSelect = container.querySelector('#ww-season-select');
    const compsListEl = container.querySelector('#ww-current-comps-list');

    // Get references to the edit modal elements
    const editCompModalEl = document.getElementById('editWinterCompModal');
    const editCompModal = new bootstrap.Modal(editCompModalEl);
    const editCompForm = editCompModalEl.querySelector('#edit-winter-comp-form');
    const editCompMsgEl = editCompModalEl.querySelector('#edit-winter-comp-message');

    // Back navigation
    container.querySelector('#back-to-ww-admin').addEventListener('click', (e) => {
        e.preventDefault();
        document.body.dispatchEvent(new CustomEvent('wags-navigate', { detail: { view: 'admin-winter' }, bubbles: true }));
    });

    // Populate seasons dropdown
    function renderSeasonSelector() {
        seasonSelect.innerHTML = '';
        if (seasons.length === 0) {
            seasonSelect.innerHTML = '<option>No seasons found</option>';
            return;
        }
        seasons.forEach(year => {
            const option = new Option(formatSeasonName(year), year);
            seasonSelect.appendChild(option);
        });
        seasonSelect.value = currentSeasonYear;
    }

    // Load and display competitions for the selected season
    async function renderCompetitions() {
        const seasonYear = seasonSelect.value;
        if (!seasonYear) {
            compsListEl.innerHTML = '<div class="list-group-item text-muted">Select a season to view competitions.</div>';
            return;
        }
        showSpinner(compsListEl);
        try {
            const { data: comps, error } = await supabase
                .from('winter_competitions')
                .select('id, name, competition_date')
                .eq('season', seasonYear)
                .order('competition_date', { ascending: false });
            if (error) throw error;

            if (!comps || comps.length === 0) {
                compsListEl.innerHTML = '<div class="list-group-item text-muted">No competitions created for this season yet.</div>';
                return;
            }

            compsListEl.innerHTML = comps.map(c => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <span>${c.name} <small class="text-muted ms-2">${new Date(c.competition_date).toLocaleDateString()}</small></span>
                    <div>
                        <button class="btn btn-sm btn-outline-secondary edit-comp-btn" data-comp-id="${c.id}" data-comp-name="${c.name}" data-comp-date="${c.competition_date}">Edit</button>
                        <!-- Add delete button here if needed -->
                    </div>
                </div>
            `).join('');

        } catch (e) {
            compsListEl.innerHTML = `<div class="list-group-item text-danger">Error loading competitions: ${e.message}</div>`;
        }
    }

    // Event Listeners
    seasonSelect.addEventListener('change', renderCompetitions);

    container.querySelector('#ww-admin-new-season').addEventListener('click', async () => {
        const year = new Date().getFullYear();
        if (seasons.includes(year)) {
            msgEl.innerHTML = `<div class="alert alert-info">Season ${formatSeasonName(year)} already exists.</div>`;
            return;
        }

        msgEl.innerHTML = '<div class="text-muted">Starting new season...</div>';
        try {
            const { data: inserted, error } = await supabase
                .from('winter_competitions')
                .insert([{ name: `Season ${year} Start`, competition_date: `${year}-01-01`, season: String(year), status: 'open' }])
                .select('id').single();
            if (error) throw error;

            msgEl.innerHTML = `<div class="alert alert-success">Started season ${formatSeasonName(year)}.</div>`;
            seasons.unshift(year); // Add to start of array
            renderSeasonSelector();
            await renderCompetitions();
        } catch (e) {
            msgEl.innerHTML = `<div class="alert alert-danger">Failed to start season: ${e.message}</div>`;
        }
    });

    container.querySelector('#ww-create-comp').addEventListener('click', async () => {
        const dateVal = container.querySelector('#ww-comp-date').value;
        const seasonYear = seasonSelect.value;
        createCompMsgEl.innerHTML = '';

        if (!dateVal) { createCompMsgEl.innerHTML = '<div class="text-danger small">Please choose a date.</div>'; return; }
        if (!seasonYear) { createCompMsgEl.innerHTML = '<div class="text-danger small">Please select a season.</div>'; return; }

        try {
            const { data: existing } = await supabase.from('winter_competitions').select('id').eq('competition_date', dateVal).maybeSingle();
            if (existing) {
                createCompMsgEl.innerHTML = `<div class="text-warning small">A competition already exists for ${dateVal}.</div>`;
                return;
            }

            const compName = `WinterWAGS ${dateVal}`;
            const { error } = await supabase.from('winter_competitions').insert([{ name: compName, competition_date: dateVal, season: String(seasonYear), status: 'open' }]);
            if (error) throw error;

            createCompMsgEl.innerHTML = `<div class="text-success small">Competition "${compName}" created.</div>`;
            container.querySelector('#ww-comp-date').value = ''; // Clear date input
            await renderCompetitions();
        } catch (e) {
            createCompMsgEl.innerHTML = `<div class="text-danger small">Failed to create competition: ${e.message}</div>`;
        }
    });

    // Event listener for Edit Competition buttons
    compsListEl.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-comp-btn');
        if (editBtn) {
            const compId = editBtn.dataset.compId;
            const compName = editBtn.dataset.compName;
            const compDate = editBtn.dataset.compDate;

            editCompForm.querySelector('#edit-winter-comp-id').value = compId;
            editCompForm.querySelector('#edit-winter-comp-name').value = compName;
            editCompForm.querySelector('#edit-winter-comp-date').value = compDate;
            editCompMsgEl.innerHTML = ''; // Clear previous messages
            editCompModal.show();
        }
    });

    // Event listener for saving changes in the Edit Competition modal
    editCompForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        editCompMsgEl.innerHTML = '<div class="text-muted">Saving changes...</div>';
        const compId = editCompForm.querySelector('#edit-winter-comp-id').value;
        const newName = editCompForm.querySelector('#edit-winter-comp-name').value;
        const newDate = editCompForm.querySelector('#edit-winter-comp-date').value;

        try {
            const { error } = await supabase
                .from('winter_competitions')
                .update({ name: newName, competition_date: newDate })
                .eq('id', compId);

            if (error) throw error;

            editCompMsgEl.innerHTML = '<div class="alert alert-success small">Competition updated successfully!</div>';
            // Refresh the list after successful update
            await renderCompetitions();
            // Close modal after a short delay
            setTimeout(() => editCompModal.hide(), 1500);
        } catch (e) {
            editCompMsgEl.innerHTML = `<div class="alert alert-danger small">Failed to update competition: ${e.message}</div>`;
        }
    });

    // Initial Render
    renderSeasonSelector();
    await renderCompetitions();
};