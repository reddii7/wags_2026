import { supabase } from '../../config.js';
import { showSpinner } from '../../utils.js';
import { findSeasonForDate, formatSeasonLabel, getCurrentMainSeason, loadMainSeasons } from '../../seasons.js';

const getTodayInputValue = () => {
    const today = new Date();
    const adjusted = new Date(today.getTime() - (today.getTimezoneOffset() * 60000));
    return adjusted.toISOString().split('T')[0];
};

export const loadAdminCompsView = async (container, role) => {
    container.innerHTML = `
        <div class="page-shell">
            <section class="page-hero">
                <div class="page-heading">
                    <div class="page-kicker">Admin</div>
                    <h1 class="mb-1">Competitions</h1>
                    <p class="page-summary">Create competitions, finalize open rounds, and review historical events from one place.</p>
                </div>
            </section>
            <section class="surface-block"><div class="section-title-row"><h5>Create Competition</h5><span class="small text-muted">Season-aware creation</span></div><form id="create-competition-form"><div class="row"><div class="col-md-6 mb-3"><label class="form-label">Name</label><input type="text" id="comp-name" class="form-control" required></div><div class="col-md-6 mb-3"><label class="form-label">Date</label><input type="date" id="comp-date" class="form-control" required></div></div><div id="comp-season-context" class="form-text mb-2"></div><button type="submit" class="btn btn-success">Create</button><div id="create-comp-message" class="mt-2"></div></form></section>
            <section class="surface-block"><div class="section-title-row"><h4>Open Competitions</h4><span class="small text-muted">Ready to manage</span></div><div id="open-competitions-list" class="list-group"></div></section>
            <section class="surface-block"><h4 id="closed-comps-toggle" class="d-flex align-items-center mb-0" style="cursor: pointer; user-select: none;"><span id="closed-comps-arrow" class="me-2" style="transition: transform 0.2s;">▶</span> Closed Competitions</h4><div id="closed-competitions-list" class="list-group mt-3" style="display: none;"></div></section>
        </div>`;

    const openList = container.querySelector('#open-competitions-list');
    const closedList = container.querySelector('#closed-competitions-list');
    const createCompForm = container.querySelector('#create-competition-form');
    const createCompMessage = container.querySelector('#create-comp-message');
    const compDateInput = container.querySelector('#comp-date');
    const seasonContextEl = container.querySelector('#comp-season-context');
    const finalizeModalEl = document.getElementById('finalizeCompetitionModal');
    const finalizeModal = bootstrap.Modal.getOrCreateInstance(finalizeModalEl);
    const [seasons, currentSeason] = await Promise.all([loadMainSeasons(), getCurrentMainSeason()]);

    const updateSeasonContext = () => {
        const selectedDate = compDateInput.value;
        const selectedSeason = findSeasonForDate(seasons, selectedDate);

        if (!currentSeason) {
            seasonContextEl.textContent = 'No current summer season is configured.';
            seasonContextEl.className = 'form-text text-danger mb-2';
            return;
        }

        if (!selectedDate) {
            seasonContextEl.textContent = `Current season: ${formatSeasonLabel(currentSeason)} (${currentSeason.start_date} to ${currentSeason.end_date}).`;
            seasonContextEl.className = 'form-text mb-2';
            return;
        }

        if (!selectedSeason) {
            seasonContextEl.textContent = 'Selected date is outside every configured summer season.';
            seasonContextEl.className = 'form-text text-danger mb-2';
            return;
        }

        const inCurrentSeason = selectedSeason.id === currentSeason.id;
        const isPastSeason = selectedSeason.start_year < currentSeason.start_year;
        seasonContextEl.textContent = inCurrentSeason
            ? `This competition will count in ${formatSeasonLabel(selectedSeason)}.`
            : `This date belongs to ${formatSeasonLabel(selectedSeason)}, not the current season ${formatSeasonLabel(currentSeason)}.`;
        seasonContextEl.className = `form-text mb-2 ${isPastSeason ? 'text-danger' : inCurrentSeason ? 'text-success' : 'text-warning'}`;
    };

    compDateInput.value = getTodayInputValue();
    updateSeasonContext();
    compDateInput.addEventListener('change', updateSeasonContext);

    const loadAdminComps = async () => {
        showSpinner(openList);
        const { data: comps, error } = await supabase.from('competitions').select('*, profiles(full_name)').order('competition_date', { ascending: false });
        if (error) { openList.innerHTML = `<div class="alert alert-danger">${error.message}</div>`; return; }

        const openComps = comps.filter(c => c.status === 'open');
        const closedComps = comps.filter(c => c.status !== 'open');

        openList.innerHTML = openComps.length > 0
            ? openComps.map(c => `<div class="list-group-item d-flex justify-content-between align-items-center"><span>${c.name} (${new Date(c.competition_date).toLocaleDateString()})</span> ${role === 'admin' ? `<button class="btn btn-primary btn-sm process-btn" data-comp-id="${c.id}">Finalize</button>` : ''}</div>`).join('')
            : '<div class="list-group-item">No open competitions found.</div>';

        closedList.innerHTML = closedComps.map(c => {
            const winnerName = c.winner_id && c.profiles ? c.profiles.full_name : '';
            const winnerBadge = winnerName ? `<span class="badge bg-success ms-2">Winner: ${winnerName}</span>` : '';
            const adminButtons = role === 'admin' ? `
                <button class="btn btn-warning btn-sm me-2 reopen-comp-btn" data-comp-id="${c.id}" data-comp-name="${c.name}">Re-open</button>
                <button class="btn btn-outline-danger btn-sm delete-comp-btn" data-comp-id="${c.id}">Delete</button>
            ` : '';
            return `<div class="list-group-item d-flex justify-content-between align-items-center"><span>${c.name} (${new Date(c.competition_date).toLocaleDateString()}) <span class="badge bg-secondary">Closed</span>${winnerBadge}</span> <div>${adminButtons}</div></div>`;
        }).join('');

        if (role === 'committee') {
            createCompForm.querySelectorAll('input, button').forEach(el => {
                el.disabled = true;
                el.title = 'Only admins can manage competitions.';
            });
        }
    };

    createCompForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = e.target.querySelector('#comp-name').value.trim();
        const competitionDate = e.target.querySelector('#comp-date').value;
        const selectedSeason = findSeasonForDate(seasons, competitionDate);

        createCompMessage.className = 'text-info mt-2';
        createCompMessage.textContent = 'Creating...';

        if (!name || !competitionDate) {
            createCompMessage.className = 'alert alert-danger mt-2';
            createCompMessage.textContent = 'Competition name and date are required.';
            return;
        }

        if (!selectedSeason) {
            createCompMessage.className = 'alert alert-danger mt-2';
            createCompMessage.textContent = 'That date does not fall inside any configured summer season.';
            return;
        }

        if (currentSeason && selectedSeason.start_year < currentSeason.start_year) {
            createCompMessage.className = 'alert alert-danger mt-2';
            createCompMessage.textContent = `Cannot create a new competition in frozen past season ${formatSeasonLabel(selectedSeason)}.`;
            return;
        }

        if (currentSeason && selectedSeason.id !== currentSeason.id) {
            const confirmed = window.confirm(`This date falls in ${formatSeasonLabel(selectedSeason)}, not the current season ${formatSeasonLabel(currentSeason)}. Create it anyway?`);
            if (!confirmed) {
                createCompMessage.className = 'alert alert-warning mt-2';
                createCompMessage.textContent = 'Competition creation cancelled.';
                return;
            }
        }

        const { data: existingComps, error: duplicateCheckError } = await supabase
            .from('competitions')
            .select('id, name')
            .eq('competition_date', competitionDate);

        if (duplicateCheckError) {
            createCompMessage.className = 'alert alert-danger mt-2';
            createCompMessage.textContent = duplicateCheckError.message;
            return;
        }

        if (existingComps?.length) {
            const existingNames = existingComps.map((comp) => comp.name).join(', ');
            createCompMessage.className = 'alert alert-warning mt-2';
            createCompMessage.textContent = `A competition already exists on ${competitionDate}: ${existingNames}.`;
            return;
        }

        const { error } = await supabase.from('competitions').insert({ name, competition_date: competitionDate });
        if (error) {
            createCompMessage.className = 'alert alert-danger mt-2';
            createCompMessage.textContent = error.message;
        }
        else {
            createCompMessage.className = 'alert alert-success mt-2';
            createCompMessage.textContent = 'Created!';
            e.target.reset();
            compDateInput.value = getTodayInputValue();
            updateSeasonContext();
            await loadAdminComps();
            setTimeout(() => createCompMessage.textContent = '', 2000);
        }
    });

    finalizeModalEl.addEventListener('click', async (e) => {
        if (e.target.id !== 'finalize-confirm-btn') return;
        const confirmBtn = e.target;
        const compId = confirmBtn.dataset.compId;
        if (!compId) return;

        const logBody = finalizeModalEl.querySelector('#finalize-log');
        const footer = finalizeModalEl.querySelector('.modal-footer');
        const closeBtn = finalizeModalEl.querySelector('.btn-close');

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Processing...`;
        footer.querySelector('.btn-secondary').disabled = true;
        closeBtn.style.display = 'none';
        logBody.innerHTML = '';
        logBody.style.display = 'block';
        finalizeModalEl.querySelector('.modal-body p').style.display = 'none';

        const log = (msg, isError = false) => {
            logBody.innerHTML += `<div class="${isError ? 'text-danger' : ''}">${msg}</div>`;
            logBody.scrollTop = logBody.scrollHeight;
        };

        const { data, error } = await supabase.rpc('finalize_competition', { p_comp_id: compId });

        if (error || data.error) {
            log(`❌ An error occurred: ${error?.message || data.error}`, true);
        } else {
            data.log.forEach(entry => log(entry.message, entry.isError));
        }
        footer.innerHTML = `<button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>`;
        closeBtn.style.display = 'inline-block';
        finalizeModalEl.addEventListener('hidden.bs.modal', () => loadAdminComps(), { once: true });
    });

    container.addEventListener('click', async (e) => {
        if (e.target.classList.contains('process-btn')) {
            const compId = e.target.dataset.compId;
            const compName = e.target.previousElementSibling.textContent;
            finalizeModalEl.querySelector('#finalize-comp-name').textContent = compName;
            finalizeModalEl.querySelector('.modal-body p').style.display = 'block';
            finalizeModalEl.querySelector('#finalize-log').style.display = 'none';
            finalizeModalEl.querySelector('.modal-footer').innerHTML = `
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="finalize-confirm-btn" data-comp-id="${compId}">Finalize</button>`;
            finalizeModal.show();
        }
        if (e.target.classList.contains('delete-comp-btn')) {
            const compId = e.target.dataset.compId;
            if (!confirm('Are you sure you want to DELETE this competition? This is irreversible.')) return;
            const { error } = await supabase.from('competitions').delete().eq('id', compId);
            if (error) { alert(`Error: ${error.message}`); }
            else { alert('Competition deleted!'); await loadAdminComps(); }
        }
        if (e.target.classList.contains('reopen-comp-btn')) {
            const button = e.target;
            const compId = button.dataset.compId;
            const compName = button.dataset.compName;
            if (!confirm(`Are you sure you want to RE-OPEN "${compName}"?\n\nThis will delete its financial and handicap records, which will be recreated when you re-finalize it.`)) return;

            button.disabled = true;
            button.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Re-opening...`;

            const { data, error } = await supabase.rpc('reopen_competition', { p_comp_id: compId });

            if (error || data.error) {
                alert(`Error re-opening competition: ${error?.message || data.error}`);
            }
            // Always reload the component list, regardless of success or failure of the RPC
            await loadAdminComps();
        }
    });

    container.querySelector('#closed-comps-toggle')?.addEventListener('click', (e) => {
        e.currentTarget.querySelector('#closed-comps-arrow').style.transform = closedList.style.display === 'none' ? 'rotate(90deg)' : 'rotate(0deg)';
        closedList.style.display = closedList.style.display === 'none' ? 'block' : 'none';
    });

    await loadAdminComps();
};