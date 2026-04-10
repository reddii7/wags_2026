import { supabase, SUPABASE_URL } from '../../config.js';
import { showSpinner, getSessionToken } from '../../utils.js';

let debounceTimer;

const leagueOptions = ['League 1', 'League 2', 'League 3', 'League 4'];

const normalizeText = (value) => value.trim().replace(/\s+/g, ' ');

const parseHandicapValue = (value) => {
    const normalized = value.trim().replace(',', '.');
    return Number.parseFloat(normalized);
};

export const loadAdminUsersView = async (container, role) => {
    container.innerHTML = `
        <div class="page-shell">
            <section class="page-hero">
                <div class="page-heading">
                    <div class="page-kicker">Admin</div>
                    <h1 class="mb-1">Users</h1>
                    <p class="page-summary">Create players, search the member list, and maintain role, handicap and league assignments cleanly.</p>
                </div>
            </section>
            <section class="surface-block"><div class="section-title-row"><h5>Create Player</h5><span class="small text-muted">Controlled league entry</span></div><form id="create-player-form"><div class="row g-2"><div class="col-md-4"><input type="text" id="player-full-name" class="form-control" placeholder="Full Name" required></div><div class="col-md-4"><input type="email" id="player-email" class="form-control" placeholder="Email" required></div><div class="col-md-4"><input type="password" id="player-password" class="form-control" placeholder="Password" minlength="8" required></div><div class="col-md-4"><input type="text" inputmode="decimal" id="player-starting-handicap" class="form-control" placeholder="Starting H'Cap" required></div><div class="col-md-4"><select id="player-league" class="form-select" required><option value="">Select league...</option>${leagueOptions.map((league) => `<option value="${league}">${league}</option>`).join('')}</select></div><div class="col-md-4"><select id="player-role" class="form-select" required><option value="player" selected>Player</option><option value="committee">Committee</option><option value="admin">Admin</option></select></div></div><button type="submit" class="btn btn-primary mt-3">Create Player</button><div id="create-player-message" class="mt-2"></div></form></section>
            <section class="surface-block table-panel"><div class="section-title-row"><h5>Manage Users</h5><span class="small text-muted">Search by name or email</span></div><input id="user-search-input" class="form-control mb-3" type="search" placeholder="Search users by name or email..."><div class="table-responsive"><table class="table table-sm table-striped"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>H'Cap</th><th>League</th><th>Actions</th></tr></thead><tbody id="user-management-table-body"></tbody></table></div></section>
        </div>`;

    const tbody = container.querySelector('#user-management-table-body');
    const searchInput = container.querySelector('#user-search-input');
    const createPlayerForm = container.querySelector('#create-player-form');
    const editUserModalEl = document.getElementById('editUserModal');
    const editUserModal = bootstrap.Modal.getOrCreateInstance(editUserModalEl);
    const editUserForm = document.getElementById('edit-user-form');

    const loadAllUsers = async (filter = '') => {
        showSpinner(tbody);
        let query = supabase.from('profiles').select('*');
        if (filter) query = query.or(`full_name.ilike.%${filter}%,email.ilike.%${filter}%`);
        const { data, error } = await query.order('full_name');

        if (error) { tbody.innerHTML = `<tr><td colspan="6" class="text-danger">Error loading users.</td></tr>`; return; }
        tbody.innerHTML = data.map(p => `
            <tr data-user-id="${p.id}">
                <td>${p.full_name}</td>
                <td>${p.email}</td>
                <td>${p.role}</td>
                <td>${p.current_handicap}</td>
                <td>${p.league_name || ''}</td>
                <td>${role === 'admin' ? `
                    <button class="btn btn-sm btn-secondary edit-user-btn">Edit</button>
                    <button class="btn btn-sm btn-danger delete-user-btn">Del</button>` : ''}
                </td>
            </tr>`).join('');
    };

    if (role === 'committee') {
        createPlayerForm.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
    }

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            loadAllUsers(e.target.value.trim());
        }, 400);
    });

    createPlayerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msgEl = container.querySelector('#create-player-message');
        msgEl.className = 'text-info mt-2';
        msgEl.textContent = 'Creating...';

        const fullName = normalizeText(document.getElementById('player-full-name').value);
        const email = normalizeText(document.getElementById('player-email').value).toLowerCase();
        const password = document.getElementById('player-password').value.trim();
        const roleValue = document.getElementById('player-role').value;
        const leagueName = document.getElementById('player-league').value;
        const startingHandicap = parseHandicapValue(document.getElementById('player-starting-handicap').value);

        if (!fullName || !email || !password || !roleValue || !leagueName) {
            msgEl.className = 'alert alert-danger mt-2';
            msgEl.textContent = 'Please complete all fields.';
            return;
        }

        if (!Number.isFinite(startingHandicap)) {
            msgEl.className = 'alert alert-danger mt-2';
            msgEl.textContent = 'Starting handicap must be a valid number.';
            return;
        }

        const accessToken = await getSessionToken();
        if (!accessToken) { msgEl.textContent = 'Session expired. Please log in again.'; return; }

        const payloads = [
            {
                full_name: fullName,
                email,
                password,
                role: roleValue,
                starting_handicap: startingHandicap,
                league_name: leagueName,
            },
            {
                full_name: fullName,
                email,
                password,
                role: roleValue,
                current_handicap: startingHandicap,
                league_name: leagueName,
            },
        ];

        let response;
        let result = { error: 'Failed to create player.' };

        for (const payload of payloads) {
            response = await fetch(`${SUPABASE_URL}/functions/v1/create-player`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                body: JSON.stringify(payload),
            });

            result = await response.json().catch(() => ({ error: 'Invalid server response.' }));

            if (response.ok && !result.error) {
                break;
            }

            if (result.error !== 'Invalid request body') {
                break;
            }
        }

        if (response.ok && !result.error) {
            msgEl.className = 'alert alert-success mt-2';
            msgEl.textContent = 'Player created!';
            e.target.reset();
            await loadAllUsers();
        } else {
            msgEl.className = 'alert alert-danger mt-2';
            msgEl.textContent = `Error: ${result.error || 'Failed to create player.'}`;
        }
    });

    editUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msgEl = editUserModalEl.querySelector('#edit-user-message');
        const saveBtn = editUserModalEl.querySelector('button[type="submit"]');
        saveBtn.disabled = true;
        msgEl.className = 'text-info';
        msgEl.textContent = 'Saving...';

        const userId = document.getElementById('edit-user-id').value;
        const fullName = normalizeText(document.getElementById('edit-user-name').value);
        const email = normalizeText(document.getElementById('edit-user-email').value).toLowerCase();
        const currentHandicap = parseHandicapValue(document.getElementById('edit-user-handicap').value);
        const leagueName = document.getElementById('edit-user-league').value;

        if (!fullName || !email || !leagueName || !Number.isFinite(currentHandicap)) {
            msgEl.className = 'alert alert-danger mt-2';
            msgEl.textContent = 'Please enter a valid name, email, handicap and league.';
            saveBtn.disabled = false;
            return;
        }

        const updatedProfile = {
            full_name: fullName,
            email,
            role: document.getElementById('edit-user-role').value,
            current_handicap: currentHandicap,
            league_name: leagueName
        };

        const { error } = await supabase.from('profiles').update(updatedProfile).eq('id', userId);

        if (error) {
            msgEl.className = 'alert alert-danger mt-2';
            msgEl.textContent = 'Error: ' + error.message;
            saveBtn.disabled = false;
        } else {
            msgEl.className = 'alert alert-success mt-2';
            msgEl.textContent = 'Saved successfully!';
            await loadAllUsers(searchInput.value.trim());
            setTimeout(() => {
                editUserModal.hide();
                saveBtn.disabled = false;
                msgEl.textContent = '';
            }, 1000);
        }
    });

    container.addEventListener('click', async (e) => {
        const button = e.target;
        const tr = button.closest('tr');
        if (!tr) return;
        const userId = tr.dataset.userId;

        if (button.classList.contains('edit-user-btn')) {
            const [name, email, role, hcap, league] = Array.from(tr.children).map(td => td.textContent);
            document.getElementById('edit-user-id').value = userId;
            document.getElementById('edit-user-name').value = name;
            document.getElementById('edit-user-email').value = email;
            document.getElementById('edit-user-role').value = role;
            document.getElementById('edit-user-handicap').value = hcap;
            document.getElementById('edit-user-league').value = league;
            editUserModal.show();
        }
        else if (button.classList.contains('delete-user-btn')) {
            if (!confirm('Are you sure you want to DELETE this user? This will also remove them from authentication.')) return;
            const accessToken = await getSessionToken();
            if (!accessToken) { alert('Session expired. Please log in again.'); return; }

            const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                body: JSON.stringify({ user_id: userId })
            });
            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                alert('Error deleting user: ' + (result.error || response.statusText));
            } else {
                alert('User deleted successfully.');
            }
            await loadAllUsers(searchInput.value.trim());
        }
    });

    await loadAllUsers();
};