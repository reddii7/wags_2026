import { supabase } from '../config.js';
import { showSpinner } from '../utils.js';

export const loadResultsView = async (container) => {
    showSpinner(container);

    // Fetch status as well to find the latest finalized competition
    const { data: comps, error } = await supabase.from('competitions').select('id, name, competition_date, status').order('competition_date', { ascending: false });
    if (error || !comps || comps.length === 0) {
        container.innerHTML = '<h1>Results</h1><p>No competitions found.</p>';
        return;
    }

    // Find the most recent competition that is 'closed'
    const latestFinalizedComp = comps.find(c => c.status === 'closed');

    let initialCompId = null;
    let headerHtml = '';

    if (latestFinalizedComp) {
        initialCompId = latestFinalizedComp.id;
        headerHtml = `
            <h2 class="h4 mb-0" id="results-comp-name">${latestFinalizedComp.name}</h2>
            <div class="text-muted small">${new Date(latestFinalizedComp.competition_date).toLocaleDateString()}</div>`;
    } else {
        headerHtml = `
            <h2 class="h4 mb-0" id="results-comp-name">No Finalized Results</h2>
            <div class="text-muted small">Select a competition to view current standings.</div>`;
    }

    container.innerHTML = `
        <div class="page-shell">
            <section class="page-hero">
                <div class="page-heading">
                    <div class="page-kicker">Competition archive</div>
                    <h1 class="mb-1">Results</h1>
                    <p class="page-summary">Review the latest closed competition or move back through any previous round from the full list.</p>
                </div>
                <div class="page-toolbar">
                    <div>
                        <label for="results-comp-select" class="form-label small">View another competition</label>
                        <select id="results-comp-select" class="form-select">
                            ${comps.map(c => `<option value="${c.id}" ${c.id === initialCompId ? 'selected' : ''}>${c.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </section>
            <section class="surface-block">${headerHtml}</section>
            <div id="results-table-container"></div>
        </div>`;

    const resultsTableContainer = container.querySelector('#results-table-container');
    const compSelect = container.querySelector('#results-comp-select');
    const compNameEl = container.querySelector('#results-comp-name');
    const compDateEl = compNameEl ? compNameEl.nextElementSibling : null;

    const displayResults = async (compId) => {
        if (!compId) {
            resultsTableContainer.innerHTML = '<p class="text-muted">Please select a competition to view results.</p>';
            return;
        }
        showSpinner(resultsTableContainer);

        const selectedComp = comps.find(c => c.id == compId);
        if (selectedComp && compNameEl && compDateEl) {
            compNameEl.textContent = selectedComp.name;
            compDateEl.textContent = new Date(selectedComp.competition_date).toLocaleDateString();
        }

        const [{ data: rounds }, { data: compDetails }, { data: handicapHistory }] = await Promise.all([
            supabase.from('rounds').select('user_id, stableford_score, has_snake, has_camel, profiles(full_name)').eq('competition_id', compId).order('stableford_score', { ascending: false }),
            supabase.from('competitions').select('status, prize_pot, rollover_amount, winner_id, profiles(full_name)').eq('id', compId).single(),
            supabase.from('handicap_history').select('user_id, old_handicap, new_handicap').eq('competition_id', compId)
        ]);

        let infoHtml = '';
        // With the backend fixed, `prize_pot` for a closed comp is always the final, accumulated total.
        // `rollover_amount` is purely informational to show what was carried in.
        const displayPot = compDetails?.prize_pot || 0;

        // Case 1: The competition is closed and has a clear winner.
        if (compDetails?.winner_id && compDetails?.profiles?.full_name) {
            let prizeText = '';
            if (displayPot > 0) {
                const rolloverInfo = (compDetails.rollover_amount && compDetails.rollover_amount > 0)
                    ? ` (includes £${Number(compDetails.rollover_amount).toFixed(2)} rolled over)`
                    : '';
                prizeText = ` — Prize: <strong>£${Number(displayPot).toFixed(2)}</strong>${rolloverInfo}`;
            }
            infoHtml += `<div class="alert alert-success text-center">🏆 Winner: <strong>${compDetails.profiles.full_name}</strong>${prizeText}</div>`;
        } // Case 2: The competition is closed with no clear winner (i.e., a tie), so the pot is rolled over.
        else if (compDetails?.status === 'closed' && !compDetails?.winner_id) {
            const prizeText = displayPot > 0
                ? `The prize pot of <strong>£${Number(displayPot).toFixed(2)}</strong> has been rolled over to the next competition.`
                : 'This competition was a tie or the winner was not recorded.';
            infoHtml += `<div class="alert alert-warning text-center">${prizeText}</div>`;
        } // Case 3: The competition is still open, but we want to show if it includes a rollover.
        else if (compDetails?.rollover_amount && compDetails.rollover_amount > 0) {
            infoHtml += `<div class="alert alert-info text-center">Includes a rollover of <strong>£${Number(compDetails.rollover_amount).toFixed(2)}</strong> from a previous competition.</div>`;
        }

        if (rounds && rounds.length > 0) {
            const handicapChanges = new Map();
            if (compDetails?.status === 'closed' && handicapHistory) {
                handicapHistory.forEach(h => {
                    handicapChanges.set(h.user_id, { old: h.old_handicap, new: h.new_handicap });
                });
            }

            let tableRows = '';
            let lastScore = null, lastPos = 0;
            rounds.forEach((r, i) => {
                const pos = r.stableford_score === lastScore ? lastPos : i + 1;
                lastScore = r.stableford_score;
                lastPos = pos;

                let hcapChangeHtml = '';
                const hcapChange = handicapChanges.get(r.user_id);
                if (hcapChange) {
                    const oldPlaying = Math.round(hcapChange.old);
                    const newPlaying = Math.round(hcapChange.new);
                    if (oldPlaying !== newPlaying) {
                        const changeClass = newPlaying < oldPlaying ? 'text-success' : 'text-danger';
                        hcapChangeHtml = ` <span class="small fst-italic ${changeClass}">(${oldPlaying} → ${newPlaying})</span>`;
                    }
                }

                const sPill = r.has_snake ? ` <span class='badge bg-warning text-dark status-pill' title='Snake'>S</span>` : "";
                const cPill = r.has_camel ? ` <span class='badge bg-info text-dark status-pill' title='Camel'>C</span>` : "";
                tableRows += `<tr><td>${pos}</td><td class='align-middle'><span class='d-inline-flex align-items-center'>${r.profiles.full_name}${hcapChangeHtml}${sPill}${cPill}</span></td><td class='text-center align-middle'>${r.stableford_score}</td></tr>`;
            });
            resultsTableContainer.innerHTML = `<section class="surface-block table-panel"><div class="section-title-row"><h5>Leaderboard</h5></div>${infoHtml}<div class="table-responsive"><table class="table table-striped"><thead><tr><th>Pos</th><th>Player</th><th class='text-center'>Pts</th></tr></thead><tbody>${tableRows}</tbody></table></div></section>`;
        } else {
            resultsTableContainer.innerHTML = '<section class="surface-block"><p class="mb-0">No results found for this competition.</p></section>';
        }
    };

    compSelect.addEventListener('change', () => displayResults(compSelect.value));
    await displayResults(initialCompId);
};