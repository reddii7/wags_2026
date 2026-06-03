<script setup>
import { ref, computed, watch, inject, nextTick } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import {
  pickDefaultRoundId,
  mapRoundOptions,
  isDuplicateKeyError,
  friendlyDuplicateScoreMessage,
  loadCampaignRoster,
  loadActiveMembers,
  loadRoundById,
  rosterSourceLabel,
  setActiveCampaignId,
} from "@/composables/useRoundScores.js";

const admin = inject("adminCtx");
const route = useRoute();
const router = useRouter();

const roundId = ref("");
const roundOptions = ref([]);
const roundDetail = ref(null);
const roster = ref([]);
const rosterSource = ref("");
const scores = ref([]);
const loading = ref(false);
const savingId = ref(null);
const error = ref("");
const filter = ref("missing");
const search = ref("");

const drafts = ref({});
/** @type {import('vue').Ref<Record<string, HTMLInputElement | null>>} */
const pointsRefs = ref({});

async function loadRounds() {
  const sb = admin?.client?.value;
  if (!sb) {
    roundOptions.value = [];
    return;
  }
  const { data, error: qerr } = await sb
    .from("rounds")
    .select(
      "id, name, play_order, round_date, round_type, finalized, campaign_id, campaigns(label, kind)",
    )
    .order("play_order", { ascending: true, nullsFirst: false })
    .order("round_date", { ascending: true })
    .limit(400);
  if (qerr) throw qerr;
  const summer = (data ?? []).filter((r) => r.campaigns?.kind === "summer_main");
  roundOptions.value = mapRoundOptions(summer.length ? summer : data ?? []);

  const fromQuery = route.query.round;
  const pick =
    (typeof fromQuery === "string" && roundOptions.value.some((o) => o.id === fromQuery)
      ? fromQuery
      : "") || pickDefaultRoundId(roundOptions.value.map((o) => o.raw)) || roundOptions.value[0]?.id || "";
  roundId.value = pick;
}

async function loadAll() {
  error.value = "";
  const sb = admin?.client?.value;
  if (!sb || !roundId.value) {
    scores.value = [];
    roster.value = [];
    roundDetail.value = null;
    return;
  }
  loading.value = true;
  try {
    roundDetail.value = await loadRoundById(sb, roundId.value);
    const opt = roundOptions.value.find((o) => o.id === roundId.value);
    if (opt?.campaignId) setActiveCampaignId(opt.campaignId);

    const { data: scoreRows, error: sErr } = await sb
      .from("round_players")
      .select(
        "id, member_id, stableford_points, snake_count, camel_count, entry_fee_pence, entered, disqualified, members(full_name)",
      )
      .eq("round_id", roundId.value)
      .order("stableford_points", { ascending: false, nullsFirst: false });
    if (sErr) throw sErr;
    scores.value = scoreRows ?? [];

    if (opt?.campaignId) {
      const result = await loadCampaignRoster(sb, opt.campaignId);
      roster.value = result.roster;
      rosterSource.value = result.source;
    } else {
      roster.value = await loadActiveMembers(sb);
      rosterSource.value = "members";
    }

    const nextDrafts = {};
    for (const m of roster.value) {
      const existing = scores.value.find((s) => s.member_id === m.memberId);
      nextDrafts[m.memberId] = {
        points: existing?.stableford_points ?? "",
        snake: Number(existing?.snake_count) > 0,
        camel: Number(existing?.camel_count) > 0,
        fee: existing?.entry_fee_pence ?? 500,
        dq: Boolean(existing?.disqualified),
        rowId: existing?.id ?? null,
      };
    }
    drafts.value = nextDrafts;
  } catch (e) {
    error.value = e?.message || String(e);
    scores.value = [];
    roster.value = [];
  } finally {
    loading.value = false;
  }
}

const roundFinalized = computed(() => Boolean(roundDetail.value?.finalized));

const scoreByMember = computed(() => {
  const map = new Map();
  for (const s of scores.value) map.set(s.member_id, s);
  return map;
});

const progress = computed(() => {
  const total = roster.value.length;
  const scored = roster.value.filter((m) => scoreByMember.value.has(m.memberId)).length;
  return { total, scored, missing: Math.max(0, total - scored) };
});

const displayList = computed(() => {
  const q = search.value.trim().toLowerCase();
  return roster.value.filter((m) => {
    const has = scoreByMember.value.has(m.memberId);
    if (filter.value === "missing" && has) return false;
    if (filter.value === "scored" && !has) return false;
    if (q && !m.fullName.toLowerCase().includes(q)) return false;
    return true;
  });
});

function setPointsRef(memberId, el) {
  if (el) pointsRefs.value[memberId] = el;
  else delete pointsRefs.value[memberId];
}

function focusMemberPoints(memberId) {
  const el = pointsRefs.value[memberId];
  if (!el) return;
  el.focus();
  el.select();
}

/** Next unscored player in roster order (wraps to top). */
function getNextMissingAfter(memberId) {
  const list = roster.value;
  if (!list.length) return null;
  let start = 0;
  if (memberId) {
    const i = list.findIndex((m) => m.memberId === memberId);
    start = i >= 0 ? i + 1 : 0;
  }
  for (let i = start; i < list.length; i++) {
    if (!scoreByMember.value.has(list[i].memberId)) return list[i];
  }
  for (let i = 0; i < start; i++) {
    if (!scoreByMember.value.has(list[i].memberId)) return list[i];
  }
  return null;
}

async function focusFirstMissing() {
  await nextTick();
  const first = roster.value.find((m) => !scoreByMember.value.has(m.memberId));
  if (first) focusMemberPoints(first.memberId);
}

async function onPointsEnter(member) {
  if (roundFinalized.value || savingId.value) return;
  await saveMember(member, { focusNext: true });
}

async function saveMember(member, { focusNext = false } = {}) {
  if (roundFinalized.value) return;
  const sb = admin?.client?.value;
  if (!sb) return;
  const d = drafts.value[member.memberId];
  if (!d) return;

  const pts = d.points === "" || d.points == null ? null : parseInt(String(d.points), 10);
  if (pts == null || Number.isNaN(pts)) {
    error.value = `Enter stableford points for ${member.fullName}.`;
    return;
  }

  savingId.value = member.memberId;
  error.value = "";
  const payload = {
    round_id: roundId.value,
    member_id: member.memberId,
    stableford_points: pts,
    snake_count: d.snake ? 1 : 0,
    camel_count: d.camel ? 1 : 0,
    entry_fee_pence: Number(d.fee) || 500,
    entered: true,
    disqualified: Boolean(d.dq),
  };

  try {
    if (d.rowId) {
      const { error: uErr } = await sb.from("round_players").update(payload).eq("id", d.rowId);
      if (uErr) throw uErr;
    } else {
      const { data, error: iErr } = await sb
        .from("round_players")
        .insert(payload)
        .select("id")
        .single();
      if (iErr) throw iErr;
      drafts.value[member.memberId].rowId = data.id;
    }
    await loadAll();

    if (focusNext && !roundFinalized.value) {
      const next = getNextMissingAfter(member.memberId);
      if (next) {
        await nextTick();
        focusMemberPoints(next.memberId);
      }
    }

    if (progress.value.missing === 0 && !roundFinalized.value) {
      const go = window.confirm(
        `All ${progress.value.total} roster players have scores. Open Rounds to finalize?`,
      );
      if (go) router.push("/manage/6-rounds");
    }
  } catch (e) {
    error.value = isDuplicateKeyError(e)
      ? friendlyDuplicateScoreMessage()
      : e?.message || String(e);
  } finally {
    savingId.value = null;
  }
}

watch(
  () => admin?.client?.value,
  async () => {
    try {
      await loadRounds();
      await loadAll();
    } catch (e) {
      error.value = e?.message || String(e);
    }
  },
  { immediate: true },
);

watch(roundId, async () => {
  router.replace({ query: { ...route.query, round: roundId.value || undefined } });
  await loadAll();
});

watch(loading, (isLoading, wasLoading) => {
  if (wasLoading && !isLoading && filter.value === "missing" && !roundFinalized.value) {
    void focusFirstMissing();
  }
});

watch(filter, (mode) => {
  if (mode === "missing" && !loading.value && !roundFinalized.value) {
    void focusFirstMissing();
  }
});
</script>

<template>
  <div class="score-entry">
    <header class="admin-page-header">
      <div>
        <p class="eyebrow">Weekly workflow</p>
        <h1>Enter scores</h1>
        <p class="lede">
          Type points and press <kbd>Enter</kbd> to save and jump to the next missing player.
        </p>
      </div>
      <button type="button" class="secondary-button" :disabled="loading" @click="loadAll">
        {{ loading ? "Refreshing…" : "Refresh" }}
      </button>
    </header>

    <p v-if="!admin?.client?.value" class="notice notice--warn">Connect to Supabase in the header first.</p>

    <template v-else>
      <section class="toolbar-card">
        <label class="field-pill">
          <span>Round</span>
          <select v-model="roundId" :disabled="loading || !roundOptions.length">
            <option v-for="o in roundOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>
        <label class="field-pill">
          <span>Show</span>
          <select v-model="filter">
            <option value="missing">Missing only</option>
            <option value="all">Everyone</option>
            <option value="scored">Scored only</option>
          </select>
        </label>
        <label class="field-pill field-pill--grow">
          <span>Search</span>
          <input v-model="search" type="search" placeholder="Player name…" />
        </label>
      </section>

      <p v-if="roundId" :class="['status-line', roundFinalized ? 'status-line--lock' : '']">
        <template v-if="roundFinalized">
          <strong>Finalized</strong> — read-only.
          <RouterLink to="/manage/6-rounds">Reopen round</RouterLink>
        </template>
        <template v-else>
          <strong>{{ progress.scored }} / {{ progress.total }}</strong> scored
          <span v-if="progress.missing"> · {{ progress.missing }} missing</span>
          <span v-if="rosterSourceLabel(rosterSource)">
            · {{ rosterSourceLabel(rosterSource) }}
          </span>
        </template>
      </p>

      <p v-if="error" class="notice notice--error">{{ error }}</p>
      <p v-if="loading" class="empty-state">Loading…</p>

      <section v-else class="entry-panel">
        <div class="table-wrap">
          <table class="data-table entry-table">
            <thead>
              <tr>
                <th class="col-player">Player</th>
                <th class="col-pts">Pts</th>
                <th class="col-tick">Snake</th>
                <th class="col-tick">Camel</th>
                <th class="col-action"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in displayList" :key="m.memberId">
                <td class="col-player">
                  <span class="player-name">{{ m.fullName }}</span>
                  <span v-if="scoreByMember.has(m.memberId)" class="saved-tag">Saved</span>
                </td>
                <td class="col-pts">
                  <input
                    :ref="(el) => setPointsRef(m.memberId, el)"
                    v-model="drafts[m.memberId].points"
                    type="number"
                    class="pts-input"
                    min="0"
                    max="60"
                    inputmode="numeric"
                    autocomplete="off"
                    :disabled="roundFinalized || savingId === m.memberId"
                    @keydown.enter.prevent="onPointsEnter(m)"
                  />
                </td>
                <td class="col-tick">
                  <input
                    v-model="drafts[m.memberId].snake"
                    type="checkbox"
                    class="tick-input"
                    :disabled="roundFinalized || savingId === m.memberId"
                    :aria-label="`Snake for ${m.fullName}`"
                  />
                </td>
                <td class="col-tick">
                  <input
                    v-model="drafts[m.memberId].camel"
                    type="checkbox"
                    class="tick-input"
                    :disabled="roundFinalized || savingId === m.memberId"
                    :aria-label="`Camel for ${m.fullName}`"
                  />
                </td>
                <td class="col-action">
                  <button
                    type="button"
                    class="primary-button primary-button--compact"
                    :disabled="roundFinalized || savingId === m.memberId"
                    @click="saveMember(m)"
                  >
                    {{
                      savingId === m.memberId
                        ? "…"
                        : scoreByMember.has(m.memberId)
                          ? "Update"
                          : "Save"
                    }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!displayList.length" class="empty-state">No players match this filter.</p>
      </section>

      <p class="footer-links">
        <RouterLink to="/manage/7-scores">Advanced scores table</RouterLink>
        ·
        <RouterLink to="/manage/6-rounds">Rounds</RouterLink>
      </p>
    </template>
  </div>
</template>

<style scoped>
.score-entry {
  display: grid;
  gap: 1.25rem;
}

.admin-page-header {
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
.lede {
  margin: 0;
}

.lede {
  margin-top: 0.4rem;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.lede kbd {
  font-size: 0.85em;
  padding: 0.12em 0.4em;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--bg);
  font-family: inherit;
}

.primary-button,
.secondary-button {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.65rem 1rem;
  background: var(--surface);
  color: var(--text);
  font-weight: 700;
  font-size: 0.84rem;
  cursor: pointer;
}

.primary-button {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.primary-button--compact {
  padding: 0.5rem 0.9rem;
  font-size: 0.8rem;
}

.secondary-button:disabled,
.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.toolbar-card {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
  padding: 1rem 1.25rem;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
}

.field-pill {
  display: grid;
  gap: 0.3rem;
  min-width: 10rem;
}

.field-pill--grow {
  flex: 1;
  min-width: 12rem;
}

.field-pill span {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.field-pill select,
.field-pill input {
  min-height: 2.45rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.55rem 0.85rem;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
}

.status-line {
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: color-mix(in srgb, var(--ok) 8%, var(--surface));
  font-size: 0.86rem;
}

.status-line--lock {
  background: color-mix(in srgb, var(--danger) 8%, var(--surface));
}

.status-line span {
  color: var(--muted);
  font-weight: 400;
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

.notice--warn {
  color: #fbbf24;
}

.entry-panel {
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
  overflow: hidden;
}

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.entry-table th,
.entry-table td {
  padding: 0.7rem 0.85rem;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
}

.entry-table th {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--bg) 55%, var(--surface));
}

.entry-table tbody tr:last-child td {
  border-bottom: 0;
}

.col-player {
  width: 38%;
  min-width: 10rem;
  text-align: left;
}

.col-pts {
  width: 5.5rem;
  text-align: center;
}

.col-tick {
  width: 4.25rem;
  text-align: center;
}

.col-action {
  width: 6.5rem;
  text-align: right;
}

.entry-table th.col-pts,
.entry-table th.col-tick,
.entry-table th.col-action {
  text-align: center;
}

.entry-table th.col-action {
  text-align: right;
}

.player-name {
  font-weight: 600;
  font-size: 0.92rem;
}

.saved-tag {
  display: inline-block;
  margin-left: 0.45rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.pts-input {
  width: 4.25rem;
  min-height: 2.35rem;
  margin: 0 auto;
  display: block;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.4rem 0.5rem;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  text-align: center;
}

.pts-input:focus {
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  border-color: var(--accent);
}

.tick-input {
  width: 1.05rem;
  height: 1.05rem;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
  vertical-align: middle;
}

.tick-input:disabled,
.pts-input:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.empty-state {
  margin: 0;
  padding: 1rem 1.25rem;
  color: var(--muted);
  font-size: 0.88rem;
}

.footer-links {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
}

@media (max-width: 720px) {
  .admin-page-header {
    display: grid;
  }

  .toolbar-card {
    display: grid;
  }

  .field-pill,
  .field-pill--grow {
    min-width: 0;
  }
}
</style>
