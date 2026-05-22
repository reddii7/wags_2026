<script setup>
import { computed, inject, onMounted, ref, watch } from "vue";

const admin = inject("adminCtx");
const loading = ref(false);
const importing = ref(false);
const error = ref("");
const success = ref("");
const cards = ref([]);
const rounds = ref([]);
const selectedRoundId = ref("");
const selectedKey = ref("");

const groups = computed(() => {
  const map = new Map();
  cards.value.forEach((card) => {
    const key = `${card.season_id || "none"}:${card.played_date || "unknown"}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        seasonId: card.season_id,
        playedDate: card.played_date,
        cards: [],
        updatedAt: card.updated_at,
      });
    }
    const group = map.get(key);
    group.cards.push(card);
    if (String(card.updated_at || "") > String(group.updatedAt || "")) {
      group.updatedAt = card.updated_at;
    }
  });

  return [...map.values()]
    .map((group) => ({
      ...group,
      cards: [...group.cards].sort((a, b) => {
        if ((b.stableford_points || 0) !== (a.stableford_points || 0)) {
          return (b.stableford_points || 0) - (a.stableford_points || 0);
        }
        if ((a.gross_total ?? 999) !== (b.gross_total ?? 999)) {
          return (a.gross_total ?? 999) - (b.gross_total ?? 999);
        }
        return String(a.full_name || "").localeCompare(String(b.full_name || ""));
      }),
    }))
    .sort((a, b) => String(b.playedDate || "").localeCompare(String(a.playedDate || "")));
});

const selectedGroup = computed(() => {
  if (!selectedKey.value) return groups.value[0] || null;
  return groups.value.find((group) => group.key === selectedKey.value) || groups.value[0] || null;
});

const selectedRows = computed(() => {
  let lastRank = 0;
  let lastPoints = null;
  return (selectedGroup.value?.cards || []).map((card, index) => {
    if (card.stableford_points !== lastPoints) {
      lastRank = index + 1;
      lastPoints = card.stableford_points;
    }
    return { ...card, rank: lastRank };
  });
});

const paidCount = computed(() => selectedRows.value.filter((row) => row.paid).length);
const snakeCount = computed(() =>
  selectedRows.value.reduce((total, row) => total + Number(row.snake_count || 0), 0),
);
const camelCount = computed(() =>
  selectedRows.value.reduce((total, row) => total + Number(row.camel_count || 0), 0),
);
const cashTotal = computed(() => paidCount.value * 5 + snakeCount.value + camelCount.value);

const selectedRound = computed(
  () => rounds.value.find((round) => String(round.id) === String(selectedRoundId.value)) || null,
);

const roundOptions = computed(() =>
  rounds.value.map((round) => ({
    id: round.id,
    label: [
      round.play_order ? `Week ${round.play_order}` : null,
      round.round_date,
      round.name,
      round.finalized ? "finalized" : null,
    ]
      .filter(Boolean)
      .join(" · "),
    finalized: Boolean(round.finalized),
  })),
);

function formatDate(value) {
  if (!value) return "Unknown date";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function holeValue(card, holeNo) {
  return card.gross_scores?.[String(holeNo)] ?? card.gross_scores?.[holeNo] ?? "";
}

function pickMatchingRound() {
  if (!selectedGroup.value) return;
  const playedDate = String(selectedGroup.value.playedDate || "");
  const dateMatches = rounds.value.filter(
    (round) =>
      String(round.round_date || "") === playedDate &&
      !round.finalized &&
      String(round.round_type || "") === "summer_weekly",
  );
  const pick = [...dateMatches].sort(
    (a, b) => (Number(b.play_order) || 0) - (Number(a.play_order) || 0),
  )[0];
  if (pick) selectedRoundId.value = pick.id;
}

const roundDateCollision = computed(() => {
  if (!selectedGroup.value) return false;
  const playedDate = String(selectedGroup.value.playedDate || "");
  return (
    rounds.value.filter(
      (round) =>
        String(round.round_date || "") === playedDate &&
        !round.finalized &&
        String(round.round_type || "") === "summer_weekly",
    ).length > 1
  );
});

function downloadCsv() {
  if (!selectedGroup.value) return;
  const headers = [
    "round_id",
    "round_date",
    "member_id",
    "full_name",
    "rank",
    "handicap",
    "gross_total",
    "stableford_points",
    "entered",
    "disqualified",
    "snake_count",
    "camel_count",
    "paid",
    "entry_fee_pence",
    ...Array.from({ length: 10 }, (_, index) => `h${index + 1}_gross`),
  ];
  const rows = selectedRows.value.map((row) => [
    "",
    row.played_date,
    row.member_id,
    row.full_name,
    row.rank,
    row.handicap,
    row.gross_total,
    row.stableford_points,
    true,
    false,
    row.snake_count || 0,
    row.camel_count || 0,
    row.paid,
    row.entry_fee_pence || 0,
    ...Array.from({ length: 10 }, (_, index) => holeValue(row, index + 1)),
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `scorecards-${selectedGroup.value.playedDate}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function loadCards() {
  const sb = admin?.client?.value;
  if (!sb) {
    cards.value = [];
    return;
  }
  loading.value = true;
  error.value = "";
  success.value = "";
  try {
    const { data, error: queryError } = await sb
      .from("scorecard_player_cards")
      .select("*")
      .order("played_date", { ascending: false })
      .order("updated_at", { ascending: false });
    if (queryError) throw queryError;
    cards.value = data || [];
    if (!selectedKey.value && groups.value[0]) selectedKey.value = groups.value[0].key;
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function loadRounds() {
  const sb = admin?.client?.value;
  if (!sb) {
    rounds.value = [];
    return;
  }
  const { data, error: roundsError } = await sb
    .from("rounds")
    .select("id, name, play_order, round_date, round_type, finalized, campaign_id, campaigns(label, kind)")
    .order("play_order", { ascending: true, nullsFirst: false })
    .order("round_date", { ascending: true })
    .limit(400);
  if (roundsError) throw roundsError;
  const summer = (data || []).filter((round) => round.campaigns?.kind === "summer_main");
  const pool = summer.length ? summer : data || [];
  rounds.value = pool.filter((round) => String(round.round_type || "") === "summer_weekly");
  pickMatchingRound();
}

async function loadAll() {
  loading.value = true;
  error.value = "";
  try {
    await loadCards();
    await loadRounds();
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function importToRound() {
  const sb = admin?.client?.value;
  if (!sb || !selectedGroup.value || !selectedRoundId.value) return;
  if (selectedRound.value?.finalized) {
    error.value = "This round is finalized. Reopen it before importing held cards.";
    return;
  }
  const ok = window.confirm(
    `Import ${selectedRows.value.length} held cards into ${selectedRound.value?.name || "the selected round"}?\n\nExisting scores for these players in that round will be updated.`,
  );
  if (!ok) return;

  importing.value = true;
  error.value = "";
  success.value = "";
  try {
    const payload = selectedRows.value.map((row) => ({
      round_id: selectedRoundId.value,
      member_id: row.member_id,
      stableford_points: Number(row.stableford_points) || 0,
      snake_count: Number(row.snake_count) || 0,
      camel_count: Number(row.camel_count) || 0,
      entry_fee_pence: Number(row.entry_fee_pence) || 0,
      entered: true,
      disqualified: false,
    }));
    const { error: upsertError } = await sb
      .from("round_players")
      .upsert(payload, { onConflict: "round_id,member_id" });
    if (upsertError) throw upsertError;
    success.value = `${payload.length} held cards imported into live scores. Review and finalize when ready.`;
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    importing.value = false;
  }
}

async function deleteGroup() {
  const sb = admin?.client?.value;
  if (!sb || !selectedGroup.value) return;
  if (!selectedGroup.value) return;
  const ok = window.confirm(
    `Clear ${selectedRows.value.length} staged cards for ${formatDate(selectedGroup.value.playedDate)}? Live competition scores will not be touched.`,
  );
  if (!ok) return;
  loading.value = true;
  error.value = "";
  success.value = "";
  try {
    const { error: deleteError } = await sb
      .from("scorecard_player_cards")
      .delete()
      .eq("season_id", selectedGroup.value.seasonId)
      .eq("played_date", selectedGroup.value.playedDate);
    if (deleteError) throw deleteError;
    success.value = "Staged cards cleared.";
    selectedKey.value = "";
    await loadCards();
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(loadAll);
watch(() => admin?.client?.value, loadAll);
watch(selectedGroup, pickMatchingRound);
</script>

<template>
  <div class="score-submissions">
    <header class="admin-page-header">
      <div>
        <p class="eyebrow">Weekly workflow</p>
        <h1>Held cards</h1>
        <p class="lede">
          Saved committee cards appear here live. Check them, import them into the selected round, then finalize.
        </p>
      </div>
      <button type="button" class="secondary-button" :disabled="loading" @click="loadAll">
        {{ loading ? "Refreshing..." : "Refresh" }}
      </button>
    </header>

    <p v-if="error" class="notice notice--error">{{ error }}</p>
    <p v-if="success" class="notice notice--success">{{ success }}</p>

    <section class="submission-layout">
      <aside class="submission-list">
        <button
          v-for="group in groups"
          :key="group.key"
          type="button"
          class="submission-list__item"
          :class="{ active: selectedGroup?.key === group.key }"
          @click="selectedKey = group.key"
        >
          <strong>{{ formatDate(group.playedDate) }}</strong>
          <span>{{ group.cards.length }} cards</span>
          <small>Updated {{ formatDateTime(group.updatedAt) }}</small>
        </button>
        <p v-if="!groups.length && !loading" class="empty-state">No staged cards yet.</p>
      </aside>

      <section v-if="selectedGroup" class="submission-detail">
        <div class="submission-detail__header">
          <div>
            <p class="eyebrow">Played {{ formatDate(selectedGroup.playedDate) }}</p>
            <h2>{{ selectedRows.length }} staged cards</h2>
            <p class="cash-line">
              {{ paidCount }} paid · {{ snakeCount }} snakes · {{ camelCount }} camels · £{{ cashTotal }} cash
            </p>
          </div>
          <div class="submission-actions">
            <label class="round-picker">
              <span>Import into round</span>
              <select v-model="selectedRoundId">
                <option value="">Select round</option>
                <option
                  v-for="round in roundOptions"
                  :key="round.id"
                  :value="round.id"
                  :disabled="round.finalized"
                >
                  {{ round.label }}
                </option>
              </select>
            </label>
            <p v-if="roundDateCollision" class="notice notice--warn">
              Multiple open weekly rounds share this date — confirm Play # in the dropdown before importing.
            </p>
            <button
              type="button"
              class="primary-button"
              :disabled="!selectedRoundId || importing || selectedRound?.finalized"
              @click="importToRound"
            >
              {{ importing ? "Importing..." : "Import to live scores" }}
            </button>
            <button type="button" class="secondary-button" @click="downloadCsv">Download CSV</button>
            <button type="button" class="danger-button" :disabled="loading" @click="deleteGroup">
              Clear date
            </button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Hcp</th>
                <th>Gross</th>
                <th>Pts</th>
                <th>Flags</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in selectedRows" :key="row.id">
                <td>#{{ row.rank }}</td>
                <td>{{ row.full_name }}</td>
                <td>{{ row.handicap }}</td>
                <td>{{ row.gross_total }}</td>
                <td><strong>{{ row.stableford_points }}</strong></td>
                <td>
                  <span v-if="row.snake_count">Snake</span>
                  <span v-if="row.camel_count"> Camel</span>
                  <span v-if="row.paid"> Paid</span>
                </td>
                <td>{{ formatDateTime(row.updated_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>
  </div>
</template>

<style scoped>
.score-submissions {
  display: grid;
  gap: 1.25rem;
}

.admin-page-header,
.submission-detail__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  padding: 1.25rem;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
}

.eyebrow {
  margin: 0 0 0.35rem;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1,
h2,
.lede,
.cash-line {
  margin: 0;
}

.lede,
.cash-line {
  margin-top: 0.4rem;
  color: var(--muted);
}

.primary-button,
.secondary-button,
.danger-button {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.65rem 1rem;
  background: var(--surface);
  color: var(--text);
  font-weight: 700;
  cursor: pointer;
}

.primary-button {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.danger-button {
  border-color: color-mix(in srgb, var(--danger) 50%, var(--line));
  color: var(--danger);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.notice {
  margin: 0;
  padding: 0.8rem 1rem;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface);
}

.notice--error {
  color: var(--danger);
}

.notice--success {
  color: var(--ok);
}

.submission-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 1rem;
}

.submission-list,
.submission-detail {
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
}

.submission-list {
  display: grid;
  align-content: start;
  overflow: hidden;
}

.submission-list__item {
  display: grid;
  gap: 0.2rem;
  width: 100%;
  padding: 1rem;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.submission-list__item.active {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.submission-list__item span,
.submission-list__item small,
.empty-state {
  color: var(--muted);
}

.empty-state {
  padding: 1rem;
}

.submission-detail {
  display: grid;
  gap: 1rem;
  padding: 1rem;
}

.submission-detail__header {
  padding: 0;
  border: 0;
}

.submission-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: flex-end;
}

.round-picker {
  display: grid;
  gap: 0.3rem;
  min-width: min(100%, 18rem);
}

.round-picker span {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.round-picker select {
  min-height: 2.45rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.55rem 0.85rem;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 0.75rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
  white-space: nowrap;
}

.data-table th {
  color: var(--muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

@media (max-width: 860px) {
  .admin-page-header,
  .submission-detail__header,
  .submission-layout {
    grid-template-columns: 1fr;
  }

  .admin-page-header,
  .submission-detail__header {
    display: grid;
  }

  .submission-actions {
    justify-content: flex-start;
  }
}
</style>
