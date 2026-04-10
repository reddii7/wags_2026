import { supabase } from './config.js';

/**
 * Gets the current user's session access token, needed for calling secure Edge Functions.
 * @returns {Promise<string|undefined>} The access token or undefined if not available.
 */
export const getSessionToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
};

export const triggerHaptic = (duration = 10) => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(duration);
    }
};

export const createSeasonSelector = ({ seasons, selectedSeasonId, idPrefix = 'season' }) => {
    const items = (seasons || []).map((season) => {
        const label = season.name || String(season.start_year || 'Season');
        const activeClass = season.id === selectedSeasonId ? 'active' : '';
        return `<button type="button" class="season-selector-button ${activeClass}" data-season-id="${season.id}" data-selector-group="${idPrefix}">${label}</button>`;
    }).join('');

    return `
        <div class="season-selector-shell">
            <div class="season-selector" role="tablist" aria-label="Season selector">
                ${items}
            </div>
        </div>`;
};

export const bindSeasonSelector = (container, onSelect) => {
    container.querySelectorAll('.season-selector-button[data-season-id]').forEach((button) => {
        button.addEventListener('click', () => {
            if (button.classList.contains('active')) return;
            triggerHaptic(10);
            onSelect(button.dataset.seasonId);
        });
    });
};

export const createQuietSparkline = (values, { stroke = '#3A5A40', fillFrom = 'rgba(58, 90, 64, 0.18)', fillTo = 'rgba(58, 90, 64, 0.01)', width = 360, height = 112 } = {}) => {
    const points = (values || []).map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (points.length < 2) {
        return '<div class="text-muted">No trend available.</div>';
    }

    const max = Math.max(...points);
    const min = Math.min(...points);
    const range = Math.max(max - min, 1);
    const stepX = width / Math.max(points.length - 1, 1);
    const pathPoints = points.map((value, index) => {
        const x = index * stepX;
        const y = height - (((value - min) / range) * (height - 18) + 9);
        return [x, y];
    });

    const linePath = pathPoints.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
    const gradientId = `spark-${Math.random().toString(36).slice(2, 10)}`;

    return `
        <svg viewBox="0 0 ${width} ${height}" class="quiet-sparkline" role="img" aria-label="Trend sparkline">
            <defs>
                <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="${fillFrom}" />
                    <stop offset="100%" stop-color="${fillTo}" />
                </linearGradient>
            </defs>
            <path d="${areaPath}" fill="url(#${gradientId})"></path>
            <path d="${linePath}" fill="none" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>`;
};

/**
 * Creates and returns the HTML and chart initialization logic for a player's handicap history.
 * @param {string} userId - The UUID of the user.
 * @returns {Promise<{html: string, callback: function|null}>} An object with HTML content and a chart callback.
 */
export const createHandicapHistoryContent = async (userId) => {
    const { data: hcapData, error: hcapError } = await supabase
        .from('handicap_history')
        .select('created_at, old_handicap, adjustment, new_handicap, competition_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }); // Order ascending for chart

    if (hcapError) throw hcapError;
    if (!hcapData || hcapData.length === 0) {
        return { html: '<div class="text-muted">No handicap history found.</div>', callback: null };
    }

    const compIds = hcapData.map(h => h.competition_id).filter(Boolean);
    const compInfoMap = {};
    if (compIds.length > 0) {
        const { data: comps } = await supabase.from('competitions').select('id, competition_date, name').in('id', compIds);
        const { data: compScores } = await supabase.from('rounds').select('competition_id, stableford_score').in('competition_id', compIds).eq('user_id', userId);
        if (comps) comps.forEach(c => compInfoMap[c.id] = { name: c.name });
        if (compScores) compScores.forEach(cs => {
            if (compInfoMap[cs.competition_id]) compInfoMap[cs.competition_id].score = cs.stableford_score;
        });
    }

    // Data for table (sorted descending)
    const tableRows = [...hcapData].reverse().map(h => {
        const compInfo = h.competition_id ? compInfoMap[h.competition_id] : null;
        const weekName = compInfo?.name || 'Manual Adjustment';
        const score = compInfo?.score ?? 'N/A';
        return `<tr><td>${weekName}</td><td>${score}</td><td>${h.old_handicap}</td><td>${h.adjustment}</td><td>${h.new_handicap}</td></tr>`;
    }).join('');

    // Data for chart (sorted ascending)
    const chartLabels = hcapData.map(h => compInfoMap[h.competition_id]?.name || 'Start');
    const chartData = hcapData.map(h => h.new_handicap);

    const html = `
        <div class="mb-4 quiet-chart-shell" style="height: 190px;">
            <canvas id="handicap-chart"></canvas>
        </div>
        <div class="table-responsive">
            <table class="table table-striped">
                <thead><tr><th>Week</th><th>Score</th><th>Old</th><th>Adj</th><th>New</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>
    `;

    const callback = () => {
        const ctx = document.getElementById('handicap-chart')?.getContext('2d');
        if (!ctx) return null;

        const isDarkMode = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const labelColor = isDarkMode ? '#dee2e6' : '#495057';

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: 'Handicap',
                    data: chartData,
                    borderColor: '#3A5A40',
                    backgroundColor: 'rgba(58, 90, 64, 0.14)',
                    fill: true,
                    borderWidth: 1.2,
                    pointRadius: 0,
                    tension: 0.34
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        display: false,
                        ticks: {
                            color: labelColor,
                            callback: (value) => value.toFixed(1)
                        },
                        grid: { display: false, color: gridColor }
                    },
                    x: { display: false, ticks: { color: labelColor }, grid: { display: false, color: gridColor } }
                },
                plugins: { legend: { display: false } }
            }
        });
    };

    return { html, callback };
};

/**
 * Renders a loading spinner in a given container.
 * @param {HTMLElement} container - The element to display the spinner in.
 */
export const showSpinner = (container) => {
    container.innerHTML = `<div class="d-flex justify-content-center align-items-center h-100"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>`;
};

/**
 * Creates and returns the HTML for a generic scores table.
 * @param {Array<Object>} scores - Array of score objects.
 * @param {string} [noScoresMessage='No scores found.'] - Message to display if scores array is empty.
 * @returns {string} HTML string for the table or a message if no scores.
 */
export const createScoresTable = (scores, noScoresMessage = 'No scores found.') => {
    if (!scores || scores.length === 0) return `<div class="text-muted">${noScoresMessage}</div>`;
    const tableRows = scores.map((s, i) => `<tr><td>${i + 1}</td><td>${s.competition_name || 'N/A'}</td><td>${s.stableford_score ?? 'N/A'}</td></tr>`).join('');
    return `<div class="table-responsive"><table class="table table-striped"><thead><tr><th>#</th><th>Competition</th><th>Score</th></tr></thead><tbody>${tableRows}</tbody></table></div>`;
};

/**
 * Shows a modal, populates it with content from an async function, and handles loading/error states.
 * @param {string} modalId - The ID of the modal element.
 * @param {string} title - The title to set for the modal.
 * @param {Function} contentPromiseFn - An async function that returns a Promise resolving to an HTML string for the modal body.
 * The promise should resolve to an object: { html: string, callback: function }.
 */
export const showModalWithContent = async (modalId, title, contentPromiseFn) => {
    const modalEl = document.getElementById(modalId);
    if (!modalEl) { console.error(`Modal with ID #${modalId} not found.`); return; }

    // Destroy any existing chart instance associated with this modal to prevent conflicts
    if (modalEl.chartInstance) {
        modalEl.chartInstance.destroy();
        modalEl.chartInstance = null;
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const modalTitle = modalEl.querySelector('.modal-title');
    const modalBody = modalEl.querySelector('.modal-body');

    if (modalTitle) modalTitle.textContent = title;
    showSpinner(modalBody);
    modal.show();

    try {
        const content = await contentPromiseFn();
        modalBody.innerHTML = content.html || content; // Support old string-only and new object format
        if (content.callback) {
            modalEl.chartInstance = content.callback(); // Store the new chart instance
        }
    } catch (error) {
        modalBody.innerHTML = `<div class="alert alert-danger">Failed to load content: ${error.message}</div>`;
    }
};