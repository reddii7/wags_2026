<script setup>
import { computed, onMounted, ref, watch, watchEffect } from "vue";
import { createClient } from "@supabase/supabase-js";

const FALLBACK_SUPABASE_URL = "https://iwzqzpzskawxrwhttufq.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3enF6cHpza2F3eHJ3aHR0dWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjcwMTIsImV4cCI6MjA5NDIwMzAxMn0.vtsmUKLuUXSMsipPH4KHcE7NhOGIV8BIPjHVkDhsOME";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;
const FETCH_ALL_DATA_URL =
  import.meta.env.VITE_FETCH_ALL_DATA_URL ||
  `${SUPABASE_URL.replace(".supabase.co", ".functions.supabase.co")}/fetch-all-data`;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const HOLES = [
  { no: 1, par: 4, index: 9 },
  { no: 2, par: 3, index: 10 },
  { no: 3, par: 4, index: 1 },
  { no: 4, par: 4, index: 5 },
  { no: 5, par: 5, index: 4 },
  { no: 6, par: 5, index: 2 },
  { no: 7, par: 5, index: 7 },
  { no: 8, par: 4, index: 3 },
  { no: 9, par: 3, index: 6 },
  { no: 10, par: 4, index: 8 },
];
const WEEK_ONE_DATE = "2026-04-01";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const metadata = ref(null);
const loading = ref(false);
const syncingId = ref("");
const error = ref("");
const success = ref("");
const selectedSeasonId = ref("");
const playedDate = ref(new Date().toISOString().slice(0, 10));
const selectedPlayerId = ref("");
const playerPickerOpen = ref(false);
const drafts = ref({});
const theme = ref(localStorage.getItem("wags-score-entry-theme") || "dark");
const confirmDialog = ref({
  open: false,
  title: "",
  message: "",
  confirmText: "Confirm",
  danger: false,
  resolve: null,
});

const seasons = computed(() => metadata.value?.seasons || []);
const selectedSeason = computed(
  () => seasons.value.find((season) => String(season.id) === String(selectedSeasonId.value)) || null,
);
const profiles = computed(() =>
  [...(metadata.value?.profiles || [])]
    .filter((player) => player.id && player.full_name)
    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))),
);

const selectedPlayer = computed(
  () =>
    profiles.value.find((player) => String(player.id) === String(selectedPlayerId.value)) ||
    null,
);

const selectablePlayers = computed(() =>
  profiles.value.filter((player) => {
    const isSelected = String(player.id) === String(selectedPlayerId.value);
    const isSaved = Boolean(drafts.value[player.id]?.saved);
    return isSelected || !isSaved;
  }),
);

const storageKey = computed(() =>
  selectedSeasonId.value && playedDate.value
    ? `wags-score-entry:${selectedSeasonId.value}:${playedDate.value}`
    : "",
);

const selectedPlayerRow = computed(() =>
  selectedPlayer.value ? buildPlayerRow(selectedPlayer.value) : null,
);

const playerPickerLabel = computed(() =>
  selectedPlayer.value
    ? `${selectedPlayer.value.full_name} · HCP ${defaultHandicap(selectedPlayer.value)}`
    : "Select player",
);

const playedWeekNumber = computed(() => {
  if (!playedDate.value) return null;
  const weekOne = parseDateOnly(WEEK_ONE_DATE);
  const played = parseDateOnly(playedDate.value);
  if (!weekOne || !played) return null;
  const daysSinceWeekOne = Math.floor((played - weekOne) / MS_PER_DAY);
  if (daysSinceWeekOne < 0) return null;
  return Math.floor(daysSinceWeekOne / 7) + 1;
});

const rankedRows = computed(() => {
  const sorted = profiles.value
    .map((player) => buildPlayerRow(player))
    .filter((row) => row.saved)
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if ((a.grossTotal ?? 999) !== (b.grossTotal ?? 999)) {
        return (a.grossTotal ?? 999) - (b.grossTotal ?? 999);
      }
      return a.fullName.localeCompare(b.fullName);
    });

  let lastRank = 0;
  let lastPoints = null;
  return sorted.map((row, idx) => {
    if (row.points !== lastPoints) {
      lastRank = idx + 1;
      lastPoints = row.points;
    }
    return { ...row, rank: lastRank };
  });
});

const completedRows = computed(() => rankedRows.value);
const paidCount = computed(() => completedRows.value.filter((row) => row.paid).length);
const snakeCount = computed(() => completedRows.value.filter((row) => row.snake).length);
const camelCount = computed(() => completedRows.value.filter((row) => row.camel).length);
const entryCashPounds = computed(() => paidCount.value * 5);
const finesCashPounds = computed(() => snakeCount.value + camelCount.value);
const cashTotalPounds = computed(() => entryCashPounds.value + finesCashPounds.value);

function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
}

watchEffect(() => {
  document.documentElement.dataset.theme = theme.value;
  document.documentElement.style.colorScheme = theme.value;
  localStorage.setItem("wags-score-entry-theme", theme.value);
});
function defaultHandicap(player) {
  return Math.round(Number(player.current_handicap ?? player.handicap_index ?? 0) || 0);
}

function parseDateOnly(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

function blankDraft(player) {
  return {
    saved: false,
    snake: false,
    camel: false,
    paid: false,
    scores: Object.fromEntries(HOLES.map((hole) => [hole.no, ""])),
  };
}

function normalizeGross(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function handicapStrokesForHole(handicap, index) {
  const hcp = Math.trunc(Number(handicap) || 0);
  if (hcp <= 0) return 0;
  const base = Math.floor(hcp / HOLES.length);
  const extra = hcp % HOLES.length;
  return base + (index <= extra ? 1 : 0);
}

function stablefordPoints(par, netScore) {
  if (netScore == null) return 0;
  return Math.max(0, par - netScore + 2);
}

function ensureDraft(player) {
  if (!drafts.value[player.id]) drafts.value[player.id] = blankDraft(player);
  return drafts.value[player.id];
}

function buildPlayerRow(player) {
  const draft = ensureDraft(player);
  const handicap = defaultHandicap(player);
  const holeResults = HOLES.map((hole) => {
    const gross = normalizeGross(draft.scores?.[hole.no]);
    const strokes = handicapStrokesForHole(handicap, hole.index);
    const net = gross == null ? null : gross - strokes;
    const points = stablefordPoints(hole.par, net);
    return { ...hole, gross, strokes, net, points };
  });
  const holesEntered = holeResults.filter((hole) => hole.gross != null).length;
  const grossTotal = holeResults.reduce(
    (sum, hole) => sum + (hole.gross == null ? 0 : hole.gross),
    0,
  );
  return {
    memberId: player.id,
    fullName: String(player.full_name || ""),
    handicap,
    snake: Boolean(draft.snake),
    camel: Boolean(draft.camel),
    paid: Boolean(draft.paid),
    saved: Boolean(draft.saved),
    snake_count: draft.snake ? 1 : 0,
    camel_count: draft.camel ? 1 : 0,
    entry_fee_pence: draft.paid ? 500 : 0,
    holeResults,
    holesEntered,
    cardComplete: holesEntered === HOLES.length,
    grossTotal: holesEntered ? grossTotal : null,
    points: holeResults.reduce((sum, hole) => sum + hole.points, 0),
  };
}

function hydrateDrafts() {
  let stored = {};
  try {
    stored = storageKey.value
      ? JSON.parse(localStorage.getItem(storageKey.value) || "{}")
      : {};
  } catch {
    stored = {};
  }

  drafts.value = Object.fromEntries(
    profiles.value.map((player) => [
      player.id,
      {
        ...blankDraft(player),
        saved: Boolean(stored[player.id]?.saved),
        snake: Boolean(stored[player.id]?.snake),
        camel: Boolean(stored[player.id]?.camel),
        paid: Boolean(stored[player.id]?.paid),
        scores: {
          ...blankDraft(player).scores,
          ...(stored[player.id]?.scores || {}),
        },
      },
    ]),
  );
}

function saveDrafts() {
  if (!storageKey.value) return;
  try {
    localStorage.setItem(storageKey.value, JSON.stringify(drafts.value));
  } catch {
    // Draft persistence is a convenience only.
  }
}

async function loadData() {
  loading.value = true;
  error.value = "";
  success.value = "";
  try {
    const response = await fetch(`${FETCH_ALL_DATA_URL}?_=${Date.now()}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    const data = await response.json();
    if (!response.ok || data?.error) {
      throw new Error(data?.error || `Could not load data (${response.status})`);
    }
    metadata.value = data;
    const preferredSeason =
      data.seasons?.find((season) => season.is_current) ||
      data.seasons?.find((season) => season.is_active) ||
      data.seasons?.[0];
    selectedSeasonId.value = String(preferredSeason?.id || "");
    setDefaultPlayedDate(data.competitions || []);
    hydrateDrafts();
    selectedPlayerId.value = "";
    await loadStagedCards();
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function setDefaultPlayedDate(allRounds = metadata.value?.competitions || []) {
  const seasonRounds = allRounds.filter(
    (round) => String(round.season || "") === String(selectedSeasonId.value || ""),
  );
  const openRound =
    seasonRounds.find((round) => round.status === "open") ||
    seasonRounds[seasonRounds.length - 1];
  playedDate.value = openRound?.competition_date || new Date().toISOString().slice(0, 10);
}

async function loadStagedCards() {
  if (!selectedSeasonId.value || !playedDate.value || !profiles.value.length) return;
  const { data, error: qerr } = await supabase
    .from("scorecard_player_cards")
    .select("*")
    .eq("season_id", selectedSeasonId.value)
    .eq("played_date", playedDate.value);
  if (qerr) throw qerr;

  const byMember = new Map((data || []).map((row) => [row.member_id, row]));
  drafts.value = Object.fromEntries(
    profiles.value.map((player) => {
      const staged = byMember.get(player.id);
      if (!staged) return [player.id, drafts.value[player.id] || blankDraft(player)];
      return [
        player.id,
        {
          ...blankDraft(player),
          saved: true,
          snake: Number(staged.snake_count) > 0,
          camel: Number(staged.camel_count) > 0,
          paid: Boolean(staged.paid),
          scores: {
            ...blankDraft(player).scores,
            ...(staged.gross_scores || {}),
          },
        },
      ];
    }),
  );
}

function askConfirm({ title, message, confirmText = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    confirmDialog.value = {
      open: true,
      title,
      message,
      confirmText,
      danger,
      resolve,
    };
  });
}

function closeConfirm(answer) {
  const resolve = confirmDialog.value.resolve;
  confirmDialog.value = {
    open: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    danger: false,
    resolve: null,
  };
  resolve?.(answer);
}

async function clearDraft() {
  const ok = await askConfirm({
    title: "Clear local cards?",
    message: "This clears all unsaved cards for this date on this device.",
    confirmText: "Clear",
    danger: true,
  });
  if (!ok) return;
  try {
    if (storageKey.value) localStorage.removeItem(storageKey.value);
  } catch {
    // ignore
  }
  hydrateDrafts();
}

function editPlayer(memberId) {
  selectedPlayerId.value = memberId;
  playerPickerOpen.value = false;
  requestAnimationFrame(() => {
    document.querySelector(".score-card")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

function openPlayerPicker() {
  playerPickerOpen.value = true;
}

function pickPlayer(memberId) {
  selectedPlayerId.value = memberId;
  playerPickerOpen.value = false;
}

function resetUnsavedSelectedDraft() {
  const player = selectedPlayer.value;
  if (!player) return;
  if (drafts.value[player.id]?.saved) return;
  drafts.value = {
    ...drafts.value,
    [player.id]: blankDraft(player),
  };
}

function moveHoleFocus(currentHoleNo, direction) {
  const currentIndex = HOLES.findIndex((hole) => hole.no === currentHoleNo);
  const nextHole = HOLES[currentIndex + direction];
  if (!nextHole) return;
  requestAnimationFrame(() => {
    document.querySelector(`[data-hole-input="${nextHole.no}"]`)?.focus();
  });
}

function handleHoleKeydown(event, holeNo) {
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    event.preventDefault();
    moveHoleFocus(holeNo, 1);
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    moveHoleFocus(holeNo, -1);
  }
}

async function deletePlayerCard(row) {
  if (!row?.memberId) return;
  const ok = await askConfirm({
    title: "Delete staged card?",
    message: `Delete ${row.fullName}'s card for this date? Live competition scores will not be touched.`,
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;
  const player = profiles.value.find((p) => p.id === row.memberId);
  if (!player) return;
  syncingId.value = row.memberId;
  error.value = "";
  success.value = "";
  try {
    const { error: derr } = await supabase
      .from("scorecard_player_cards")
      .delete()
      .eq("season_id", selectedSeasonId.value)
      .eq("played_date", playedDate.value)
      .eq("member_id", row.memberId);
    if (derr) throw derr;
    drafts.value = {
      ...drafts.value,
      [row.memberId]: blankDraft(player),
    };
    success.value = `${row.fullName}'s card was removed.`;
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    syncingId.value = "";
  }
}

async function saveSelectedCard() {
  if (!selectedPlayerRow.value?.cardComplete) {
    error.value = "Enter all 10 hole scores before saving this card.";
    return;
  }
  if (!selectedSeasonId.value || !playedDate.value) {
    error.value = "Season and played date are required.";
    return;
  }
  error.value = "";
  success.value = "";
  const memberId = selectedPlayerRow.value.memberId;
  const row = selectedPlayerRow.value;
  const missingChecks = [];
  if (!row.paid) missingChecks.push("Paid is not ticked");
  if (!row.snake && !row.camel) missingChecks.push("No snake or camel is ticked");
  if (missingChecks.length) {
    const ok = await askConfirm({
      title: "Check payment and fines?",
      message: `${missingChecks.join(". ")}. Save ${row.fullName}'s card anyway?`,
      confirmText: "Save anyway",
    });
    if (!ok) return;
  }
  const grossScores = Object.fromEntries(
    row.holeResults.map((hole) => [String(hole.no), hole.gross]),
  );
  syncingId.value = memberId;
  try {
    const payload = {
      season_id: selectedSeasonId.value || null,
      played_date: playedDate.value,
      member_id: memberId,
      full_name: row.fullName,
      handicap: row.handicap,
      gross_scores: grossScores,
      stableford_points: row.points,
      gross_total: row.grossTotal,
      snake_count: row.snake_count,
      camel_count: row.camel_count,
      paid: row.paid,
      entry_fee_pence: row.entry_fee_pence,
      submitted_by: "",
      payload_json: { version: 1, hole_rules: HOLES, row },
    };
    const { error: upsertError } = await supabase
      .from("scorecard_player_cards")
      .upsert(payload, { onConflict: "season_id,played_date,member_id" });
    if (upsertError) throw upsertError;
    drafts.value = {
      ...drafts.value,
      [memberId]: {
        ...drafts.value[memberId],
        saved: true,
      },
    };
    success.value = `${row.fullName}'s card was saved.`;
    selectedPlayerId.value = "";
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    syncingId.value = "";
  }
}

watch([selectedSeasonId, playedDate], async () => {
  hydrateDrafts();
  try {
    await loadStagedCards();
  } catch (e) {
    error.value = e?.message || String(e);
  }
});
watch(selectedPlayerId, resetUnsavedSelectedDraft);
watch(drafts, saveDrafts, { deep: true });
onMounted(loadData);
</script>

<template>
  <main class="app-shell">
    <aside class="app-sidebar">
      <strong class="brand">WAGS</strong>
      <nav>
        <span class="nav-item active">Score Entry</span>
      </nav>
      <button type="button" class="theme-button" @click="toggleTheme">
        {{ theme === "dark" ? "Light" : "Dark" }}
      </button>
      <div class="sidebar-foot">
        <span>{{ completedRows.length }}/{{ profiles.length }}</span>
        <small>Cards complete</small>
      </div>
    </aside>

    <div class="main-panel">
      <div class="mobile-topbar">
        <strong class="brand">WAGS</strong>
        <button type="button" class="theme-button" @click="toggleTheme">
          {{ theme === "dark" ? "Light" : "Dark" }}
        </button>
      </div>

      <section class="hero-card">
        <div>
          <p class="eyebrow">WAGS scoring</p>
          <h1>{{ playedWeekNumber ? `Week ${playedWeekNumber} score entry` : "10-hole score entry" }}</h1>
          <p>Enter gross scores. Saved cards update the admin inbox immediately.</p>
        </div>
      </section>

      <p v-if="error" class="notice error">{{ error }}</p>
      <p v-if="success" class="notice success">{{ success }}</p>

      <section class="glass-card controls-card">
        <div class="readonly-field">
          <span>Season</span>
          <strong>{{ selectedSeason?.label || selectedSeason?.name || selectedSeason?.start_year || "-" }}</strong>
        </div>
        <label>
          <span>Played date</span>
          <input v-model="playedDate" type="date" />
        </label>
      </section>

      <section class="player-picker">
        <label>
          <span>Player</span>
          <button type="button" class="player-select-trigger" @click="openPlayerPicker">
            <span>{{ playerPickerLabel }}</span>
            <span class="player-select-trigger__chevron" aria-hidden="true">⌄</span>
          </button>
        </label>
      </section>

      <section v-if="selectedPlayerRow" class="score-card">
        <div class="score-card__top">
          <div>
            <h2>{{ selectedPlayerRow.fullName }}</h2>
            <p>
              Playing handicap {{ selectedPlayerRow.handicap }} ·
              {{ selectedPlayerRow.holesEntered }} of 10 holes entered
            </p>
          </div>
        </div>

        <div class="holes-grid">
          <label
            v-for="hole in selectedPlayerRow.holeResults"
            :key="hole.no"
            class="hole-card"
            :class="{ filled: hole.gross != null }"
          >
            <span class="hole-card__label">{{ hole.no }}</span>
            <input
              v-model="drafts[selectedPlayerRow.memberId].scores[hole.no]"
              type="number"
              min="1"
              inputmode="numeric"
              placeholder="-"
              :data-hole-input="hole.no"
              @keydown="handleHoleKeydown($event, hole.no)"
            />
          </label>
          <div class="total-card">
            <span>TOTAL</span>
            <strong>{{ selectedPlayerRow.points }}</strong>
          </div>
        </div>

        <div class="flags-row">
        <label class="flag-check">
            <input v-model="drafts[selectedPlayerRow.memberId].snake" type="checkbox" />
            Snake
          </label>
        <label class="flag-check">
            <input v-model="drafts[selectedPlayerRow.memberId].camel" type="checkbox" />
            Camel
          </label>
        <label class="flag-check">
            <input v-model="drafts[selectedPlayerRow.memberId].paid" type="checkbox" />
            Paid
          </label>
        </div>

      <div class="card-actions">
        <button
          type="button"
          class="quiet-action"
          :disabled="!selectedPlayerRow.cardComplete || syncingId === selectedPlayerRow.memberId"
          @click="saveSelectedCard"
        >
          {{ syncingId === selectedPlayerRow.memberId ? "Saving..." : selectedPlayerRow.saved ? "Update card" : "Save card" }}
        </button>
        <span v-if="!selectedPlayerRow.cardComplete">
          Enter all 10 holes before saving.
        </span>
      </div>
      </section>

      <section class="leaderboard">
        <div class="section-title">
          <h2>Completed cards</h2>
        <span>{{ completedRows.length }} saved</span>
        </div>
        <div class="summary-strip" aria-label="Cash summary">
          <span><strong>{{ completedRows.length }}</strong> players</span>
          <span><strong>{{ paidCount }}</strong> paid</span>
          <span><strong>{{ snakeCount }}</strong> snakes</span>
          <span><strong>{{ camelCount }}</strong> camels</span>
          <span class="summary-strip__cash"><strong>£{{ cashTotalPounds }}</strong> cash</span>
        </div>
      <p v-if="!completedRows.length" class="submit-hint">
        Save each player card that played. Saved cards update the admin inbox immediately.
        </p>
        <div v-if="completedRows.length" class="completed-table-wrap">
          <table class="completed-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Pts</th>
                <th>Flags</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in completedRows" :key="row.memberId">
                <td>#{{ row.rank }}</td>
                <td class="name">{{ row.fullName }}</td>
                <td><strong>{{ row.points }}</strong></td>
                <td>
                  <span class="mini-flags">
                    <span v-if="row.snake">Snake</span>
                    <span v-if="row.camel">Camel</span>
                    <span v-if="row.paid">Paid</span>
                  </span>
                </td>
                <td>
                  <div class="row-actions">
                    <button type="button" @click="editPlayer(row.memberId)">Edit</button>
                    <button type="button" class="danger-text" @click="deletePlayerCard(row)">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!completedRows.length" class="empty">Completed players appear here.</p>
      </section>
    </div>

    <Teleport to="body">
      <div
        v-if="playerPickerOpen"
        class="app-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Choose player"
        @click.self="playerPickerOpen = false"
      >
        <section class="app-dialog__panel">
          <div class="app-dialog__header">
            <div>
              <p class="eyebrow">Score entry</p>
              <h2>Player</h2>
            </div>
            <button type="button" class="dialog-close" @click="playerPickerOpen = false">
              Close
            </button>
          </div>
          <ul class="picker-list" role="listbox" aria-label="Players">
            <li v-for="player in selectablePlayers" :key="player.id" role="none">
              <button
                type="button"
                class="picker-list__option"
                :class="{
                  'picker-list__option--active': String(player.id) === String(selectedPlayerId),
                }"
                role="option"
                :aria-selected="String(player.id) === String(selectedPlayerId)"
                @click="pickPlayer(player.id)"
              >
                <span class="picker-list__label">{{ player.full_name }}</span>
                <span class="picker-list__meta">HCP {{ defaultHandicap(player) }}</span>
                <span
                  v-if="String(player.id) === String(selectedPlayerId)"
                  class="picker-list__check"
                  aria-hidden="true"
                >
                  ✓
                </span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="confirmDialog.open"
        class="app-dialog"
        role="dialog"
        aria-modal="true"
        @click.self="closeConfirm(false)"
      >
        <section class="app-dialog__panel">
          <div class="app-dialog__header">
            <div>
              <p class="eyebrow">Confirm</p>
              <h2>{{ confirmDialog.title }}</h2>
            </div>
            <button type="button" class="dialog-close" @click="closeConfirm(false)">
              Close
            </button>
          </div>
          <p>{{ confirmDialog.message }}</p>
          <div class="dialog-actions">
            <button type="button" class="quiet-action" @click="closeConfirm(false)">
              Cancel
            </button>
            <button
              type="button"
              class="quiet-action"
              :class="{ 'danger-action': confirmDialog.danger }"
              @click="closeConfirm(true)"
            >
              {{ confirmDialog.confirmText }}
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </main>
</template>
