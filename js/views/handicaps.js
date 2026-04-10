import { supabase } from '../config.js';
import { showSpinner, showModalWithContent, createHandicapHistoryContent } from '../utils.js';

export const loadHandicapsView = async (container) => {
    showSpinner(container);
    const { data, error } = await supabase.from('profiles').select('id, full_name, current_handicap').not('current_handicap', 'is', null).order('full_name');
    if (error) {
        container.innerHTML = `<div class="alert alert-danger">Error fetching data: ${error.message}</div>`;
        return;
    }

    const lowestHandicap = data?.length ? Math.min(...data.map((player) => Number(player.current_handicap))) : '-';
    let tableHtml = `<table class="table table-striped"><thead><tr><th>Player</th><th class="text-center">H'cap</th></tr></thead><tbody>`;
    data.forEach(p => {
        tableHtml += `<tr><td><a href="#" class="player-link" data-player-id="${p.id}" data-player-name="${p.full_name}">${p.full_name}</a></td><td class="text-center">${p.current_handicap}</td></tr>`;
    });
    tableHtml += `</tbody></table>`;
    container.innerHTML = `<div class="page-shell"><section class="page-hero"><div class="page-heading"><div class="page-kicker">Player index</div><h1 class="mb-1">Player Handicaps</h1><p class="page-summary">Browse the current handicap list and open any player to view their handicap history over time.</p></div><div class="page-toolbar"><div class="section-note"><i class="fas fa-chart-line"></i><span>Open any player for a minimalist history sparkline.</span></div></div></section><section class="page-metrics"><div class="metric-card"><div class="metric-label">Players listed</div><div class="metric-value">${data.length}</div></div><div class="metric-card"><div class="metric-label">Lowest handicap</div><div class="metric-value">${lowestHandicap}</div></div></section><section class="surface-block table-panel"><div class="section-note mb-3"><i class="fas fa-info-circle"></i><span>Click a player's name to view their handicap history.</span></div><div class="table-responsive">${tableHtml}</div></section></div>`;

    container.querySelectorAll('.player-link').forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const playerId = link.dataset.playerId;
            const playerName = link.dataset.playerName;
            showModalWithContent('playerHandicapHistoryModal', `Handicap History for ${playerName}`, () => createHandicapHistoryContent(playerId));
        });
    });
};