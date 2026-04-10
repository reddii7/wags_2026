import { supabase } from '../../config.js';
import { showSpinner, triggerHaptic } from '../../utils.js';

export const loadAdminEnterScoresView = async (container, role) => {
    showSpinner(container);
    const [{ data: comps, error: compErr }, { data: users, error: userErr }] = await Promise.all([
        supabase.from('competitions').select('id, name, competition_date').eq('status', 'open').order('competition_date', { ascending: false }),
        supabase.from('profiles').select('id, full_name').order('full_name')
    ]);

    if (compErr || userErr) { container.innerHTML = '<div class="alert alert-danger">Error loading data.</div>'; return; }
    if (!comps || comps.length === 0) { container.innerHTML = '<div class="alert alert-warning">No open competitions found.</div>'; return; }

    const latestCompId = comps[0].id;

    container.innerHTML = `
        <form id="admin-select-comp-form" class="row g-2 align-items-end mb-3">
            <div class="col-md-6">
                <label class="form-label">Competition</label>
                <select id="admin-comp-select" class="form-select" required>
                    <option value="">Select competition...</option>
                    ${comps.map(c => `<option value="${c.id}" ${c.id === latestCompId ? 'selected' : ''}>${c.name} (${new Date(c.competition_date).toLocaleDateString()})</option>`).join('')}
                </select>
            </div>
        </form>
        <div id="admin-score-entry-section"></div>`;

    const compSelect = container.querySelector('#admin-comp-select');
    const scoreEntrySection = container.querySelector('#admin-score-entry-section');
    const editScoreModalEl = document.getElementById('editScoreModal');
    const editScoreModal = bootstrap.Modal.getOrCreateInstance(editScoreModalEl);
    const editScoreForm = document.getElementById('edit-score-form');

    const renderAdminEnteredScoresList = async (compId, userMap) => {
        const listContainer = scoreEntrySection.querySelector('#admin-entered-scores-list');
        if (!listContainer) return;
        showSpinner(listContainer);

        const { data: rounds, error } = await supabase.from('rounds').select('id, user_id, stableford_score, has_snake, has_camel, is_paid').eq('competition_id', compId).order('stableford_score', { ascending: false });
        if (error) { listContainer.innerHTML = '<div class="alert alert-danger">Error loading scores.</div>'; return; }

        // Calculate and update the total collected
        const totalCollected = rounds.reduce((acc, r) => {
            if (r.is_paid) {
                return acc + 5 + (r.has_snake ? 1 : 0) + (r.has_camel ? 1 : 0);
            }
            return acc;
        }, 0);
        scoreEntrySection.querySelector('#total-collected').textContent = `£${totalCollected.toFixed(2)}`;

        if (!rounds || rounds.length === 0) { listContainer.innerHTML = '<div class="text-muted">No scores entered yet.</div>'; return; }

        const tableRows = rounds.map(r => {
            const amountDue = 5 + (r.has_snake ? 1 : 0) + (r.has_camel ? 1 : 0);
            return `
                <tr data-round-id="${r.id}" data-user-id="${r.user_id}">
                    <td class="player-val">${userMap[r.user_id] || 'Unknown User'}</td>
                    <td class="score-val">${r.stableford_score}</td>
                    <td class="text-center">£${amountDue.toFixed(2)}</td>
                    <td class="text-center"><input class="form-check-input paid-checkbox" type="checkbox" data-round-id="${r.id}" ${r.is_paid ? 'checked' : ''}></td>
                    <td>
                        <button class="btn btn-sm btn-secondary admin-edit-score-btn">Edit</button> 
                        <button class="btn btn-sm btn-danger admin-delete-score-btn">Delete</button>
                    </td>
                </tr>`;
        }).join('');

        listContainer.innerHTML = `<h5>Scores Entered</h5><table class="table table-sm table-striped"><thead><tr><th>Player</th><th>Points</th><th class="text-center">Due</th><th class="text-center">Paid</th><th>Actions</th></tr></thead><tbody>${tableRows}</tbody></table>`;
    };

    compSelect.addEventListener('change', async () => {
        const compId = compSelect.value;
        if (!compId) { scoreEntrySection.innerHTML = ''; return; }
        showSpinner(scoreEntrySection);

        const { data: rounds } = await supabase.from('rounds').select('user_id').eq('competition_id', compId);
        const scoredUserIds = new Set(rounds?.map(r => r.user_id) || []);
        const availableUsers = users.filter(u => !scoredUserIds.has(u.id));
        const userMap = Object.fromEntries(users.map(u => [u.id, u.full_name]));

        scoreEntrySection.innerHTML = `
            <div class="card mb-4">
                <div class="card-body text-center">
                    <h6 class="card-title text-muted">Total Collected for this Competition</h6>
                    <div class="display-6 fw-bold" id="total-collected">£0.00</div>
                </div>
            </div>
            <form id="admin-add-score-form" class="row g-2 align-items-end mb-4">
                <div class="col-md-4"><label class="form-label">Player</label><select id="admin-player-select" class="form-select" required><option value="">Select player...</option>${availableUsers.map(u => `<option value="${u.id}">${u.full_name}</option>`).join('')}</select></div>
                <div class="col-md-2"><label class="form-label">Points</label><input type="number" id="admin-score-input" class="form-control" min="0" max="60" required></div>
                <div class="col-md-3 d-flex align-items-end"><div class="form-check me-3"><input class="form-check-input" type="checkbox" id="admin-snake-check"><label class="form-check-label" for="admin-snake-check">Snake</label></div><div class="form-check"><input class="form-check-input" type="checkbox" id="admin-camel-check"><label class="form-check-label" for="admin-camel-check">Camel</label></div></div>
                <div class="col-md-2"><button type="submit" class="btn btn-success w-100">Add Score</button></div>
                <div class="col-md-12"><div id="admin-add-score-msg" class="mt-2"></div></div>
            </form>
            <hr>
            <div id="admin-entered-scores-list"></div>`;

        await renderAdminEnteredScoresList(compId, userMap);

        scoreEntrySection.querySelector('#admin-add-score-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            triggerHaptic(10);
            const form = e.target;
            const msg = form.querySelector('#admin-add-score-msg');
            const playerId = form.querySelector('#admin-player-select').value;
            if (!playerId) { msg.textContent = 'Please select a player.'; msg.className = 'text-danger'; return; }

            msg.textContent = 'Saving...';
            const { error } = await supabase.from('rounds').insert({
                competition_id: compId, user_id: playerId,
                stableford_score: parseInt(form.querySelector('#admin-score-input').value, 10),
                has_snake: form.querySelector('#admin-snake-check').checked,
                has_camel: form.querySelector('#admin-camel-check').checked
            });

            if (error) { msg.textContent = error.message; msg.className = 'text-danger'; }
            else {
                msg.textContent = 'Score added!'; msg.className = 'text-success';
                form.reset();
                form.querySelector(`#admin-player-select option[value="${playerId}"]`).remove();
                await renderAdminEnteredScoresList(compId, userMap);
            }
        });

        scoreEntrySection.querySelector('#admin-entered-scores-list').addEventListener('click', async (e) => {
            const button = e.target;
            const tr = button.closest('tr');
            if (!tr) return;
            const roundId = tr.dataset.roundId;

            if (button.classList.contains('admin-edit-score-btn')) {
                document.getElementById('edit-round-id').value = roundId;
                document.getElementById('edit-score-player-name').value = tr.querySelector('.player-val').textContent;
                document.getElementById('edit-score-points').value = tr.querySelector('.score-val').textContent;
                document.getElementById('edit-score-snake').checked = tr.querySelector('.snake-val').textContent === 'Yes';
                document.getElementById('edit-score-camel').checked = tr.querySelector('.camel-val').textContent === 'Yes';
                editScoreModal.show();
            } else if (button.classList.contains('admin-delete-score-btn')) {
                if (!confirm('Delete this score?')) return;
                await supabase.from('rounds').delete().eq('id', roundId);
                // Re-trigger change to refresh the add player dropdown and the list
                compSelect.dispatchEvent(new Event('change'));
            } else if (button.classList.contains('paid-checkbox')) {
                const checkbox = button;
                checkbox.disabled = true;
                const isPaid = checkbox.checked;
                await supabase.from('rounds').update({ is_paid: isPaid }).eq('id', roundId);
                // Re-render the list to update the total collected
                await renderAdminEnteredScoresList(compId, userMap);
                compSelect.dispatchEvent(new Event('change'));
            }
        });
    });

    editScoreForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msgEl = editScoreModalEl.querySelector('#edit-score-message');
        const saveBtn = editScoreModalEl.querySelector('button[type="submit"]');
        saveBtn.disabled = true;
        msgEl.textContent = 'Saving...';

        const roundId = document.getElementById('edit-round-id').value;
        const { error } = await supabase.from('rounds').update({
            stableford_score: parseInt(document.getElementById('edit-score-points').value, 10),
            has_snake: document.getElementById('edit-score-snake').checked,
            has_camel: document.getElementById('edit-score-camel').checked
        }).eq('id', roundId);

        if (error) { msgEl.textContent = 'Error: ' + error.message; }
        else {
            editScoreModal.hide();
            compSelect.dispatchEvent(new Event('change')); // Refresh the list
        }
        saveBtn.disabled = false;
    });

    // Automatically load the score entry section for the latest competition
    compSelect.dispatchEvent(new Event('change'));
};