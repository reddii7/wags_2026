import { supabase } from '../../config.js';
import { showSpinner } from '../../utils.js';

export const loadAdminFinanceView = async (container, role) => {
    showSpinner(container);

    try {
        const [
            { data: comps, error: compError },
            { data: allTransactions, error: transError }
        ] = await Promise.all([
            supabase.from('competitions').select('id, name, competition_date, prize_pot, winner:winner_id(full_name)').eq('status', 'closed'),
            supabase.from('financial_transactions').select('*')
        ]);

        if (compError) console.error("Error fetching competitions:", compError.message);

        if (transError) {
            // This is a common Supabase development error when the database schema changes.
            // We can catch it and provide a helpful message to the user.
            if (transError.message.includes('schema cache')) {
                container.innerHTML = `<div class="alert alert-warning">
                    <h4>Schema Cache Error</h4>
                    <p>The application's view of the database is outdated because of a recent change (like adding the 'financial_transactions' table).</p>
                    <p>To fix this, please do a <strong>hard refresh</strong> of this page: <strong>Cmd+Shift+R</strong> (on Mac) or <strong>Ctrl+Shift+R</strong> (on Windows/Linux).</p>
                    <hr><small class="text-muted">Details: ${transError.message}</small></div>`;
                return;
            }
            throw transError; // Re-throw other errors
        }

        if ((!comps || comps.length === 0) && (!allTransactions || allTransactions.length === 0)) {
            container.innerHTML = '<div class="alert alert-info">No financial data found.</div>';
            return;
        }

        // --- Group transactions by competition ID ---
        const transByComp = (allTransactions || []).reduce((acc, t) => {
            if (t.competition_id) {
                if (!acc[t.competition_id]) {
                    acc[t.competition_id] = [];
                }
                acc[t.competition_id].push(t);
            }
            return acc;
        }, {});

        const compEvents = (comps || []).map(comp => {
            const compTrans = transByComp[comp.id] || [];

            // Total income is the sum of all money collected for this competition.
            const totalCashIn = compTrans
                .filter(t => ['weekly_prize_pot', 'entry_fee', 'snake_fine', 'camel_fine'].includes(t.type))
                .reduce((sum, t) => sum + t.amount, 0);

            // The contribution to the end-of-season pot is the sum of specific transaction types.
            const endOfSeasonContribution = compTrans
                .filter(t => ['entry_fee', 'snake_fine', 'camel_fine'].includes(t.type))
                .reduce((sum, t) => sum + t.amount, 0);

            const winnerPrize = comp.prize_pot || 0;

            return {
                date: comp.competition_date,
                description: comp.name,
                cashIn: totalCashIn,
                prize: winnerPrize,
                endOfSeasonContribution: endOfSeasonContribution,
                winner: comp.winner?.full_name || null,
                type: 'competition'
            };
        }) || [];

        // --- Process Manual Transactions ---
        // Only show transactions explicitly marked as 'manual'. Others are part of competition totals.
        const manualEvents = (allTransactions || [])
            .filter(t => t.type === 'manual')
            .map(t => ({
                id: t.id,
                date: t.transaction_date,
                description: t.description,
                cashIn: t.amount > 0 ? t.amount : 0,
                prize: t.amount < 0 ? -t.amount : 0,
                endOfSeasonContribution: t.amount,
                type: 'manual'
            })) || [];

        // --- Combine, Sort, and Calculate ---
        // Sort chronologically (oldest first) to calculate running balance correctly
        const allEventsSorted = [...compEvents, ...manualEvents].sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate running balance
        let runningBalance = 0;
        const eventsWithBalanceChronological = allEventsSorted.map(event => {
            runningBalance += event.endOfSeasonContribution;
            return { ...event, runningBalance };
        });

        // Reverse for display (newest first)
        const eventsWithBalance = [...eventsWithBalanceChronological].reverse();

        // --- Calculate Final Totals for Summary Cards ---
        const finalPot = runningBalance;
        const totalPrizes = eventsWithBalance.reduce((acc, event) => acc + event.prize, 0);
        const totalCashIn = eventsWithBalance.reduce((acc, event) => acc + event.cashIn, 0);
        const totalFines = (allTransactions || [])
            .filter(t => t.type === 'snake_fine' || t.type === 'camel_fine')
            .reduce((sum, t) => sum + t.amount, 0);

        const tableRows = eventsWithBalance.map(event => {
            if (event.type === 'competition') {
                const winnerDisplay = event.winner ? event.winner : `<span class="text-muted fst-italic">Rollover</span>`;
                return `
                    <tr>
                        <td>${new Date(event.date).toLocaleDateString()}</td>
                        <td>${event.description}</td>
                        <td class="text-center align-middle text-success">£${event.cashIn.toFixed(2)}</td>
                        <td class="align-middle">${winnerDisplay}</td>
                        <td class="text-center align-middle text-danger">£${event.prize.toFixed(2)}</td>
                        <td class="text-center align-middle">£${event.endOfSeasonContribution.toFixed(2)}</td>
                        <td class="text-center align-middle fw-bold">£${event.runningBalance.toFixed(2)}</td>
                        <td class="text-center align-middle">
                            <button class="btn btn-sm btn-secondary" disabled title="Competition entries are derived from finalized results.">Edit</button>
                            <button class="btn btn-sm btn-danger" disabled title="Delete the competition from the 'Competitions' page to remove it.">Delete</button>
                        </td>
                    </tr>`;
            } else { // Manual transaction
                return `
                    <tr>
                        <td>${new Date(event.date).toLocaleDateString()}</td>
                        <td>${event.description} <span class="badge bg-secondary">Manual</span></td>
                        <td class="text-center align-middle text-success">${event.cashIn > 0 ? `£${event.cashIn.toFixed(2)}` : '-'}</td>
                        <td class="text-center align-middle">-</td>
                        <td class="text-center align-middle text-danger">${event.prize > 0 ? `£${event.prize.toFixed(2)}` : '-'}</td>
                        <td class="text-center align-middle">£${event.endOfSeasonContribution.toFixed(2)}</td>
                        <td class="text-center align-middle fw-bold">£${event.runningBalance.toFixed(2)}</td>
                        <td class="text-center align-middle">
                            ${role === 'admin' ? `
                                <button class="btn btn-sm btn-secondary edit-trans-btn" data-trans-id="${event.id}">Edit</button>
                                <button class="btn btn-sm btn-danger delete-trans-btn" data-trans-id="${event.id}">Delete</button>
                            ` : ''}
                        </td>
                    </tr>`;
            }
        }).join('');

        container.innerHTML = `
            <div class="page-shell">
                <section class="page-hero">
                    <div class="page-heading">
                        <div class="page-kicker">Admin</div>
                        <h1 class="mb-1">Finance</h1>
                        <p class="page-summary">Track competition money flow, season pot movements, and manual adjustments in one ledger view.</p>
                    </div>
                </section>
                <section class="surface-block">
                    <div class="section-title-row"><h5>Manual Transaction</h5><span class="small text-muted">Direct ledger entry</span></div>
                    <form id="manual-transaction-form" class="row g-3 align-items-end">
                        <div class="col-md-3"><label class="form-label">Date</label><input type="date" id="trans-date" class="form-control" required></div>
                        <div class="col-md-5"><label class="form-label">Description</label><input type="text" id="trans-desc" class="form-control" required></div>
                        <div class="col-md-2"><label class="form-label">Amount</label><input type="number" step="0.01" id="trans-amount" class="form-control" placeholder="e.g., -50.00" required></div>
                        <div class="col-md-2"><button type="submit" class="btn btn-success w-100">Add</button></div>
                        <div class="col-12"><div id="trans-message" class="mt-2"></div></div>
                    </form>
                </section>
                <section class="page-metrics row g-3 mb-0">
                <div class="col-md-6 col-lg-3 mb-3 mb-lg-0">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <h6 class="card-title text-muted">Total Prizes</h6>
                            <div class="display-6 fw-bold">£${totalPrizes.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 col-lg-3 mb-3 mb-lg-0">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <h6 class="card-title text-muted">End of Season Pot</h6>
                            <div class="display-6 fw-bold">£${finalPot.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 col-lg-3 mb-3 mb-md-0">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <h6 class="card-title text-muted">Total Cash In</h6>
                            <div class="display-6 fw-bold">£${totalCashIn.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 col-lg-3">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <h6 class="card-title text-muted">Snakes/Camels</h6>
                            <div class="display-6 fw-bold">£${totalFines.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
                </section>
                <section class="surface-block table-panel">
                <div class="section-title-row"><h5>Ledger</h5><span class="small text-muted">Newest entries first</span></div>
                <div class="table-responsive">
                <table class="table table-striped">
                    <thead class="table-light"><tr><th>Date</th><th>Description</th><th class="text-center">Cash In</th><th>Winner</th><th class="text-center">Prize</th><th class="text-center">End of Season</th><th class="text-center">Running Balance</th><th class="text-center">Actions</th></tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
                </div>
                </section>
            </div>
        `;

        const editTransModalEl = document.getElementById('editTransactionModal');
        const editTransModal = bootstrap.Modal.getOrCreateInstance(editTransModalEl);
        const editTransForm = document.getElementById('edit-transaction-form');
        const editTransMsgEl = document.getElementById('edit-trans-message');

        if (role === 'committee') {
            container.querySelector('#manual-transaction-form').querySelectorAll('input, button').forEach(el => el.disabled = true);
        }

        container.querySelector('#manual-transaction-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const msgEl = container.querySelector('#trans-message');
            msgEl.textContent = 'Saving...';
            const { error } = await supabase.from('financial_transactions').insert({
                transaction_date: e.target.querySelector('#trans-date').value,
                description: e.target.querySelector('#trans-desc').value,
                amount: parseFloat(e.target.querySelector('#trans-amount').value),
                type: 'manual' // Add the required 'type' field
            });
            if (error) { msgEl.textContent = `Error: ${error.message}`; }
            else {
                msgEl.textContent = '';
                e.target.reset();
                loadAdminFinanceView(container); // Reload the view
            }
        });

        container.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-trans-btn');
            if (editBtn) {
                const transId = editBtn.dataset.transId;
                const eventData = eventsWithBalance.find(ev => String(ev.id) === transId);
                if (eventData) {
                    editTransForm.querySelector('#edit-trans-id').value = eventData.id;
                    editTransForm.querySelector('#edit-trans-date').value = eventData.date;
                    editTransForm.querySelector('#edit-trans-desc').value = eventData.description;
                    editTransForm.querySelector('#edit-trans-amount').value = eventData.endOfSeasonContribution.toFixed(2);
                    editTransMsgEl.textContent = '';
                    editTransModal.show();
                }
            }

            const deleteBtn = e.target.closest('.delete-trans-btn');
            if (deleteBtn) {
                const transId = deleteBtn.dataset.transId;
                if (confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
                    deleteBtn.disabled = true;
                    deleteBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`;
                    const { error } = await supabase.from('financial_transactions').delete().eq('id', transId);
                    if (error) {
                        alert(`Error deleting transaction: ${error.message}`);
                        deleteBtn.disabled = false;
                        deleteBtn.innerHTML = `Delete`;
                    } else {
                        loadAdminFinanceView(container); // Reload the view
                    }
                }
            }
        });

        editTransForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            editTransMsgEl.textContent = 'Saving...';
            const transId = editTransForm.querySelector('#edit-trans-id').value;
            const { error } = await supabase.from('financial_transactions').update({
                transaction_date: editTransForm.querySelector('#edit-trans-date').value,
                description: editTransForm.querySelector('#edit-trans-desc').value,
                amount: parseFloat(editTransForm.querySelector('#edit-trans-amount').value)
            }).eq('id', transId);

            if (error) {
                editTransMsgEl.textContent = `Error: ${error.message}`;
            } else {
                editTransMsgEl.textContent = '';
                editTransModal.hide();
                loadAdminFinanceView(container); // Reload the view
            }
        });

    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error loading finance data: ${error.message}</div>`;
    }
};