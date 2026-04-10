/*
  WinterWAGS side-app (client-side, isolated)
  - Uses localStorage keys prefixed with "winterwags:" to avoid touching main app data
  - Tracks seasons starting 2025, weekly entries, cumulative pot and weekly pots
  - Stores only gross scores; does not alter handicaps in the main app
  - Winner determination: lowest gross (ties split payouts evenly)
  - Payments: each entry adds £2.50 to weekly pot and £2.50 to cumulative pot

  Assumptions (documented):
  - Weekly key is ISO date (YYYY-MM-DD) representing the week's date
  - Season winner is the player with lowest total gross across all weeks they played
  - If a player misses weeks, only weeks played count (no normalization)
  - Ties for weekly winners split the weekly pot equally; ties for season winner split cumulative
*/

import { supabase } from '../config.js';
import { showModalWithContent, createScoresTable } from '../utils.js';

// Expose as a window global for view system integration
window.WinterWags = (function () {
    // default starting year per user request
    function defaultStartYear() {
        const now = new Date();
        return Math.max(2025, now.getFullYear());
    }

    // Helper to convert date to YYYY-MM-DD
    // (defined above)

    // Load season data from Supabase: competitions, scores and registered players
    async function loadSeasonDataFromDB(year) {
        const { data, error } = await supabase.rpc('get_winter_weekly_data', { p_season_year: year });
        if (error) throw error;

        const season = {
            year: String(year),
            weeks: data.weeks || {},
            cumulativePot: data.cumulativePot || 0,
            // The 'players' object is no longer needed for rendering this view
        };
        return season;
    }

    // Local addEntry was removed; use addEntryToSupabase for DB persistence.

    // Attempt to persist an entry to Supabase. This is non-destructive to localStorage UI state.
    async function addEntryToSupabase(year, name, gross, dateStr) {
        if (!supabase) throw new Error('Supabase client not available');
        const wk = weekKeyFromDate(dateStr || new Date());

        // Try to find a profile matching the provided full name
        const { data: profile, error: profileError } = await supabase.from('profiles').select('id').eq('full_name', name).maybeSingle();
        if (profileError) throw profileError;
        if (!profile) {
            // If no matching profile, bail and let the caller fall back to local storage
            throw new Error('No matching profile found for name: ' + name);
        }

        const userId = profile.id;

        // Ensure a competition exists for this week in winter_competitions (upsert by competition_date)
        let competitionId = null;
        try {
            const seasonTxt = String(year);
            const { data: existingComp } = await supabase.from('winter_competitions').select('id').eq('competition_date', wk).maybeSingle();
            if (existingComp && existingComp.id) {
                competitionId = existingComp.id;
            } else {
                const { data: insertedComp, error: insertCompErr } = await supabase.from('winter_competitions').insert([{ name: `WinterWAGS ${wk}`, competition_date: wk, season: seasonTxt }]).select('id').single();
                if (insertCompErr) throw insertCompErr;
                competitionId = insertedComp.id;
            }
        } catch (e) {
            // If winter_competitions table doesn't exist or insert fails, rethrow to let caller fallback
            throw e;
        }

        // Upsert into winter_players for this season
        const seasonTxt = String(year);
        const upsertPlayer = await supabase.from('winter_players').upsert([{ user_id: userId, season: seasonTxt }], { onConflict: ['user_id', 'season'] });
        if (upsertPlayer.error) throw upsertPlayer.error;

        // Upsert score into winter_scores (unique constraint user_id, competition_id)
        const upsertScore = await supabase.from('winter_scores').upsert([{ user_id: userId, competition_id: competitionId, score: Number(gross) }], { onConflict: ['user_id', 'competition_id'] });
        if (upsertScore.error) throw upsertScore.error;

        // Return a local-style entry to be appended to the UI state (so pots are still tracked locally)
        return { id: `db-${Date.now()}`, name: name.trim(), gross: Number(gross), date: wk, createdAt: new Date().toISOString(), persisted: true };
    }

    function computeWeeklyWinners(week) {
        if (!week || !week.entries || week.entries.length === 0) return { winners: [], payoutPerWinner: 0 };
        const max = Math.max(...week.entries.map(e => e.gross)); // Find highest score
        const winners = week.entries.filter(e => e.gross === max).map(e => e.name);
        const uniqueWinners = Array.from(new Set(winners));
        const payout = uniqueWinners.length ? round2(week.pot / uniqueWinners.length) : 0;
        return { winners: uniqueWinners, payoutPerWinner: payout };
    }

    async function computeSeasonStandings(year) {
        const { data, error } = await supabase.rpc('get_winter_standings', { p_season_year: year });
        if (error) throw error;
        return data.map(p => ({ ...p, totalGross: p.total_score })); // Adapt to existing property name
    }

    async function closeSeasonDB(year) {
        const seasonTxt = String(year);
        // fetch competitions for season
        const { data: comps, error: compsErr } = await supabase.from('winter_competitions').select('id').eq('season', seasonTxt);
        if (compsErr) throw compsErr;
        const compIds = (comps || []).map(c => c.id);
        if (compIds.length === 0) return { winners: [], payoutPerWinner: 0, message: 'No competitions for season.' };

        // aggregate scores per user across season competitions
        const { data: scores, error: scoresErr } = await supabase.from('winter_scores').select('user_id, score, profiles(full_name)').in('competition_id', compIds);
        if (scoresErr) throw scoresErr;
        const totals = {};
        scores.forEach(s => {
            const name = s.profiles?.full_name || String(s.user_id);
            totals[name] = (totals[name] || 0) + Number(s.score);
        });
        const players = Object.keys(totals).map(name => ({ name, totalGross: totals[name] }));
        if (players.length === 0) return { winners: [], payoutPerWinner: 0, message: 'No players this season.' };
        players.sort((a, b) => a.totalGross - b.totalGross);
        const best = players[0].totalGross;
        const winners = players.filter(p => p.totalGross === best).map(p => p.name);

        // compute cumulative pot = count of scores * 2.5
        const cumulativePot = (scores || []).length * 2.5;
        const payoutPerWinner = round2(cumulativePot / (winners.length || 1));

        // mark competitions closed for the season
        await supabase.from('winter_competitions').update({ status: 'closed' }).eq('season', seasonTxt);

        return { winners, payoutPerWinner, cumulativePot };
    }

    async function startSeasonDB(year) {
        const seasonTxt = String(year);
        // create an initial competition dated Jan 1 of the season to register the season in DB
        const compDate = `${seasonTxt}-01-01`;
        const { data: existing } = await supabase.from('winter_competitions').select('id').eq('competition_date', compDate).eq('season', seasonTxt).maybeSingle();
        if (existing && existing.id) return existing;
        const { data: inserted, error } = await supabase.from('winter_competitions').insert([{ name: `Season ${seasonTxt} start`, competition_date: compDate, season: seasonTxt }]).select('id').single();
        if (error) throw error;
        return inserted;
    }

    function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

    /* ----- UI rendering ----- */
    let containerEl = null;

    async function renderView() {
        console.log('WinterWAGS renderView called');
        if (!containerEl) {
            console.error('WinterWAGS container not available for rendering');
            return;
        }

        if (!supabase) {
            containerEl.innerHTML = `<div class="alert alert-warning">Waiting for Supabase connection...</div>`;
            return;
        }

        const year = await currentSeasonYear();
        console.log('WinterWAGS loading season:', year);
        let season;
        try {
            season = await loadSeasonDataFromDB(year);
        } catch (e) {
            console.error('WinterWAGS failed to load season:', e);
            containerEl.innerHTML = `<div class="alert alert-danger">Failed to load WinterWAGS season data: ${e.message || e}</div>`;
            return;
        }
        containerEl.innerHTML = '';

        // Get all available seasons
        const seasonsSet = new Set();
        const { data: comps } = await supabase.from('winter_competitions').select('season').not('season', 'is', null);
        (comps || []).forEach(c => { if (c && c.season) seasonsSet.add(Number(c.season)); });
        const seasons = Array.from(seasonsSet).filter(n => !isNaN(n)).sort((a, b) => b - a); // Sort descending

        const header = el('div', { class: 'ww-header d-flex justify-content-between align-items-center mb-3' },
            el('div', { class: 'btn-group' },
                el('select', { id: 'ww-season-select', class: 'form-select' },
                    ...seasons.map(s => el('option', { value: s, selected: s === season.year }, `Season ${s}${s === season.year ? ' (Current)' : ''}`))
                )
            )
        );

        // Week selection dropdown
        const weekKeys = Object.keys(season.weeks).sort().reverse(); // Most recent first
        const weekSelect = el('div', { class: 'ww-week-select mb-3' },
            el('select', { id: 'ww-week-select', class: 'form-select' },
                el('option', { value: '' }, 'View All Weeks'),
                ...weekKeys.map(wk => el('option', { value: wk }, season.weeks[wk].name || `Week of ${wk}`))
            )
        );

        const weeklySection = el('div', { class: 'ww-weekly card mb-3 p-4' },
            el('div', { class: 'd-flex justify-content-between align-items-center mb-3' },
                el('div', {},
                    el('h5', { class: 'mb-0 d-inline-block' }, 'Weekly Results'),
                    el('span', { id: 'ww-weekly-date', class: 'text-muted ms-2' })
                )
            ),
            el('div', { id: 'ww-weekly-list' })
        );

        const seasonSection = el('div', { class: 'ww-season card mb-3 p-4 d-none' },
            el('div', { class: 'd-flex justify-content-between align-items-center mb-3' },
                el('h5', { class: 'mb-0' }, 'Season Standings'),
                el('div', {}, `Cumulative Pot: £${season.cumulativePot.toFixed(2)}`)
            ),
            el('div', { id: 'ww-season-standings' })
        );

        const viewToggle = el('div', { class: 'btn-group mb-3', role: 'group', id: 'ww-view-toggle' },
            el('button', { type: 'button', class: 'btn btn-primary active', 'data-view': 'weekly' }, 'Weekly Results'),
            el('button', { type: 'button', class: 'btn btn-primary', 'data-view': 'season' }, 'Season Standings')
        );

        containerEl.appendChild(header);
        containerEl.appendChild(viewToggle);
        containerEl.appendChild(weekSelect);
        containerEl.appendChild(weeklySection);
        containerEl.appendChild(seasonSection);

        // Wire up view toggle
        viewToggle.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                const view = e.target.dataset.view;
                viewToggle.querySelector('.active').classList.remove('active');
                e.target.classList.add('active');

                if (view === 'weekly') {
                    weeklySection.classList.remove('d-none');
                    seasonSection.classList.add('d-none');
                    weekSelect.classList.remove('d-none');
                } else {
                    weeklySection.classList.add('d-none');
                    seasonSection.classList.remove('d-none');
                    weekSelect.classList.add('d-none');
                }
            }
        });


        // Wire up season selector
        document.getElementById('ww-season-select').onchange = async (e) => {
            const selectedYear = Number(e.target.value);
            if (!isNaN(selectedYear)) {
                try { // The old loadSeasonFromDB is no longer needed.
                    season = await loadSeasonDataFromDB(selectedYear);
                    renderView();
                } catch (e) {
                    console.error('Failed to load season:', e);
                }
            }
        };

        // Wire up week selector
        document.getElementById('ww-week-select').onchange = (e) => {
            const selectedWeek = e.target.value;
            const weeklyList = document.getElementById('ww-weekly-list');
            const weeklyDateEl = document.getElementById('ww-weekly-date');

            weeklyList.innerHTML = '';
            weeklyDateEl.textContent = ''; // Clear date initially

            if (selectedWeek) {
                const [y, m, d] = selectedWeek.split('-');
                weeklyDateEl.textContent = `— ${d}-${m}-${y}`; // Set date in title
            } else {
                weeklyDateEl.textContent = ''; // Ensure date is not in title for "All Weeks"
            }

            const weeksToShow = selectedWeek ? [selectedWeek] : Object.keys(season.weeks).sort().reverse();
            weeksToShow.forEach(wk => {
                const week = season.weeks[wk];
                if (!week || !week.entries || week.entries.length === 0) return;

                // When a single week is selected, don't show the date in the sub-header.
                // When showing all weeks, include the date in each sub-header.
                let weekHeader;
                if (selectedWeek) {
                    weekHeader = `Winnings: £${week.pot.toFixed(2)}`;
                } else {
                    const [y, m, d] = wk.split('-');
                    weekHeader = `${week.name || `${d}-${m}-${y}`} — Winnings: £${week.pot.toFixed(2)}`;
                }
                const comp = el('div', { class: 'ww-week mb-4' },
                    el('h6', { class: 'border-bottom pb-2 mb-3' }, weekHeader)
                );

                // Weekly results table
                const table = el('table', { class: 'table table-sm table-hover' });
                const thead = el('thead', {});
                thead.appendChild(el('tr', {},
                    el('th', { scope: 'col' }, 'Pos'),
                    el('th', { scope: 'col' }, 'Player'),
                    el('th', { scope: 'col', class: 'text-end' }, 'Score'),
                ));

                const tbody = el('tbody', {});
                const sortedEntries = [...week.entries].sort((a, b) => b.gross - a.gross); // Sort highest first for Stableford

                // Determine the winning score (highest score)
                const winningScore = sortedEntries.length > 0 ? sortedEntries[0].gross : null;

                let lastScore = null;
                let lastPos = 0;

                sortedEntries.forEach((e, idx) => {
                    // Standard ranking logic (handles ties)
                    const pos = e.gross === lastScore ? lastPos : idx + 1;
                    lastScore = e.gross;
                    lastPos = pos;

                    // Check if the current entry is tied with the one before or after it
                    const isTiedWithPrevious = idx > 0 && e.gross === sortedEntries[idx - 1].gross;
                    const isTiedWithNext = idx < sortedEntries.length - 1 && e.gross === sortedEntries[idx + 1].gross;
                    const posDisplay = (isTiedWithPrevious || isTiedWithNext) ? `T${pos}` : String(pos);

                    // If the entry's score matches the winning score, prepare a trophy icon
                    const isWinner = winningScore !== null && e.gross === winningScore;
                    const winnerIcon = isWinner
                        ? el('i', { class: 'fas fa-trophy ms-2', style: 'color: #D4AF37; font-size: 0.8em;', title: 'Winner' })
                        : null;

                    const tr = el('tr', {});
                    tr.appendChild(el('td', {}, posDisplay, winnerIcon));
                    tr.appendChild(el('td', {}, e.name));
                    tr.appendChild(el('td', { class: 'text-end' }, String(e.gross)));
                    tbody.appendChild(tr);
                });

                table.appendChild(thead);
                table.appendChild(tbody);
                comp.appendChild(table);
                weeklyList.appendChild(comp);
            });
        };

        // Trigger initial population of weekly results
        document.getElementById('ww-week-select').dispatchEvent(new Event('change'));

        // Populate season standings
        const standingsEl = document.getElementById('ww-season-standings');
        standingsEl.innerHTML = '';
        const standings = await computeSeasonStandings(season.year);

        if (standings.length === 0) {
            standingsEl.appendChild(el('div', { class: 'text-muted' }, 'No players registered for this season yet.'));
        } else {
            const explanationEl = el('div', { class: 'mb-2 small text-muted' },
                el('i', { class: 'fas fa-info-circle me-1' }),
                "Click a player's name to view their best 10 scores."
            );
            standingsEl.appendChild(explanationEl);

                        const table = el('table', { class: 'table table-sm table-hover' });

                        const thead = el('thead', {});

                        thead.appendChild(el('tr', {},

                            el('th', { scope: 'col' }, 'Pos'),

                            el('th', { scope: 'col' }, 'Player'),

                            el('th', { scope: 'col', class: 'text-end' }, 'Played'),

                            el('th', { scope: 'col', class: 'text-end' }, 'Best 10')

                        ));

            

                                    const tbody = el('tbody', {});

            

                                    let lastScore = null;

            

                                    let lastPos = 0;

            

                        

            

                                    standings.forEach(async (p, idx) => {

            

                                        const pos = p.totalGross === lastScore ? lastPos : idx + 1;

            

                                        lastScore = p.totalGross;

            

                                        lastPos = pos;

            

                        

            

                                        const isTiedWithPrevious = idx > 0 && p.totalGross === standings[idx - 1].totalGross;

            

                                        const isTiedWithNext = idx < standings.length - 1 && p.totalGross === standings[idx + 1].totalGross;

            

                                        const posDisplay = (isTiedWithPrevious || isTiedWithNext) ? `T${pos}` : String(pos);

            

                        

            

                                        const tr = el('tr', {});

            

                                        const playedTd = el('td', { class: 'text-end' }, '...');

            

                                        tr.appendChild(el('td', {}, posDisplay));

            

                                        tr.appendChild(el('td', {}, el('a', { href: '#', class: 'player-link', 'data-player-id': p.user_id, 'data-player-name': p.name }, p.name)));

            

                                        tr.appendChild(playedTd);

            

                                        tr.appendChild(el('td', { class: 'text-end' }, String(p.totalGross)));

            

                                        tbody.appendChild(tr);

            

                        

            

                                        const { data, error } = await supabase.rpc('get_winter_player_best_10_scores', { p_profile_id: p.user_id, p_season_year: season.year });

            

                                        if (error) {

            

                                            console.error(`Failed to get scores for player ${p.name}`, error);

            

                                            playedTd.textContent = 'Error';

            

                                            return;

            

                                        }

            

                                        playedTd.textContent = data.length;

            

                                    });

            

                        

            

                                    table.appendChild(thead);

            

                                    table.appendChild(tbody);

            

                                    standingsEl.appendChild(table);

            

                        

            

                                    // Add event listeners for the new player links

            

                                    standingsEl.querySelectorAll('.player-link').forEach(link => {

            

                                        link.addEventListener('click', (e) => {

            

                                            e.preventDefault();

            

                                            const playerId = link.dataset.playerId;

            

                                            const playerName = link.dataset.playerName;

            

                                            showModalWithContent('playerLeagueBest10Modal', `Best 10 Scores for ${playerName}`, async () => {

            

                                                const { data, error } = await supabase.rpc('get_winter_player_best_10_scores', { p_profile_id: playerId, p_season_year: season.year });

            

                                                if (error) throw error;

            

                                                return createScoresTable(data, 'No scores found for this player in this season.');

            

                                            });

            

                                        });

            

                                    });        }

        // if closed, show results
        if (season.closed && season.closedResult) {
            const r = season.closedResult;
            const resEl = el('div', { class: 'alert alert-info mt-2' }, `Season closed. Winner(s): ${r.winners.join(', ')} — Each £${(r.payoutPerWinner || 0).toFixed(2)} (cumulative pot £${(r.cumulativePot || 0).toFixed(2)})`);
            containerEl.appendChild(resEl);
        }
    }

    function _appendChild(parent, child) {
        if (child === null || child === undefined) return;
        if (Array.isArray(child)) return child.forEach(c => _appendChild(parent, c));
        if (child instanceof Node) return parent.appendChild(child);
        // fallback to string
        parent.appendChild(document.createTextNode(String(child)));
    }

    function el(tag, attrsOrText, ...children) {
        const node = document.createElement(tag);

        // If attrsOrText is a primitive, treat as text content
        if (typeof attrsOrText === 'string' || typeof attrsOrText === 'number') {
            node.textContent = String(attrsOrText);
            children.forEach(c => _appendChild(node, c));
            return node;
        }

        // If attrsOrText looks like an attributes object, apply attributes
        const attrs = (attrsOrText && typeof attrsOrText === 'object' && !(attrsOrText instanceof Node)) ? attrsOrText : {};
        for (const k of Object.keys(attrs)) {
            if (k === 'class') node.className = attrs[k];
            else if (k === 'style') node.setAttribute('style', attrs[k]);
            else node.setAttribute(k, attrs[k]);
        }

        // If attrsOrText was actually a Node (caller omitted attrs), append it
        if (attrsOrText instanceof Node) _appendChild(node, attrsOrText);

        // Append remaining children (which may be strings, nodes or arrays)
        children.forEach(c => _appendChild(node, c));
        return node;
    }

    async function currentSeasonYear() {
        // derive seasons from DB (competitions and registered players)
        try {
            const seasonsSet = new Set();
            const { data: comps } = await supabase.from('winter_competitions').select('season').not('season', 'is', null);
            (comps || []).forEach(c => { if (c && c.season) seasonsSet.add(Number(c.season)); });
            const { data: wps } = await supabase.from('winter_players').select('season').not('season', 'is', null);
            (wps || []).forEach(p => { if (p && p.season) seasonsSet.add(Number(p.season)); });
            const seasons = Array.from(seasonsSet).filter(n => !isNaN(n)).sort((a, b) => a - b);
            if (seasons.length) return seasons[seasons.length - 1];
        } catch (e) {
            console.warn('Failed to derive current season from DB', e?.message || e);
        }
        return defaultStartYear();
    }

    async function loadView() {
        if (!containerEl) {
            containerEl = document.getElementById('winterwags-view');
            if (!containerEl) {
                console.error('WinterWAGS view container not found');
                return;
            }
        }
        await renderView();
        console.log('WinterWAGS view loaded and rendered');
    }

    function init() {
        containerEl = document.getElementById('winterwags-view');
        if (!containerEl) {
            console.error('WinterWAGS container not found during init');
            return;
        }
        console.log('WinterWAGS module initialized');
        // Don't render initially - wait for view system to call loadView
    }

    // expose minimal API for module integration
    return { init, loadView };
})();

document.addEventListener('DOMContentLoaded', () => {
    try { WinterWags.init(); } catch (e) { console.error('WinterWags init failed', e); }
});
