<script setup>
import { ref, computed, watch, inject, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter, RouterLink, onBeforeRouteLeave } from "vue-router";
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
  normalizeScoreDraft,
  isScoreDraftDirty,
  buildRoundPlayerPayload,
  upsertRoundPlayerScores,
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
const saving = ref(false);
const error = ref("");
const success = ref("");
/** Default to full sheet so points + snake/camel stay editable until Save all. */
const filter = ref("all");
const search = ref("");

const drafts = ref({});
/** Baseline loaded from DB — used for dirty detection / discard. */
const baselines = ref({});
/** @type {import('vue').Ref<Record<string, HTMLInputElement | null>>} */
const pointsRefs = ref({});

function emptyDraft() {
  return {
    points: "",
    snake: false,
    camel: false,
    fee: 500,
    dq: false,
    rowId: null,
  };
}

function draftFromScore(existing) {
  if (!existing) return emptyDraft();
  return {
    points: existing.stableford_points ?? "",
    snake: Number(existing.snake_count) > 0,
    camel: Number(existing.camel_count) > 0,
    fee: existing.entry_fee_pence ?? 500,
    dq: Boolean(existing.disqualified),
    rowId: existing.id ?? null,
  };
}

function cloneDraft(draft) {
  const n = normalizeScoreDraft(draft);
  return {
    points: n.points ?? "",
    snake: n.snake,
    camel: n.camel,
    fee: n.fee,
    dq: n.dq,
    rowId: n.rowId,
  };
}

function hasPoints(memberId) {
  return normalizeScoreDraft(drafts.value[memberId]).points != null;
}

function isPersisted(memberId) {
  return scoreByMember.value.has(memberId);
}

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

async function loadAll({ preserveDirty = false } = {}) {
  error.value = "";
  if (!preserveDirty) success.value = "";
  const sb = admin?.client?.value;
  if (!sb || !roundId.value) {
    scores.value = [];
    roster.value = [];
    roundDetail.value = null;
    if (!preserveDirty) {
      drafts.value = {};
      baselines.value = {};
    }
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
    const nextBaselines = {};
    for (const m of roster.value) {
      const existing = scores.value.find((s) => s.member_id === m.memberId);
      const loaded = draftFromScore(existing);
      nextBaselines[m.memberId] = cloneDraft(loaded);
      if (preserveDirty && drafts.value[m.memberId] && isScoreDraftDirty(drafts.value[m.memberId], nextBaselines[m.memberId])) {
        nextDrafts[m.memberId] = {
          ...drafts.value[m.memberId],
          rowId: loaded.rowId ?? drafts.value[m.memberId].rowId,
        };
      } else {
        nextDrafts[m.memberId] = loaded;
      }
    }
    drafts.value = nextDrafts;
    baselines.value = nextBaselines;
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
  const entered = roster.value.filter((m) => hasPoints(m.memberId)).length;
  const saved = roster.value.filter((m) => isPersisted(m.memberId)).length;
  return {
    total,
    entered,
    saved,
    missingEntered: Math.max(0, total - entered),
    missingSaved: Math.max(0, total - saved),
  };
});

const dirtyMemberIds = computed(() =>
  roster.value
    .filter((m) => isScoreDraftDirty(drafts.value[m.memberId], baselines.value[m.memberId]))
    .map((m) => m.memberId),
);

const dirtyCount = computed(() => dirtyMemberIds.value.length);

const saveableDirtyMembers = computed(() =>
  roster.value.filter((m) => {
    if (!dirtyMemberIds.value.includes(m.memberId)) return false;
    const d = normalizeScoreDraft(drafts.value[m.memberId]);
    return d.points != null || d.dq;
  }),
);

const incompleteDirtyCount = computed(() =>
  Math.max(0, dirtyCount.value - saveableDirtyMembers.value.length),
);

const displayList = computed(() => {
  const q = search.value.trim().toLowerCase();
  return roster.value.filter((m) => {
    // "missing" = not yet in DB — keep typed drafts visible so snakes/camels can still be set
    if (filter.value === "missing" && isPersisted(m.memberId) && !dirtyMemberIds.value.includes(m.memberId)) {
      return false;
    }
    if (filter.value === "scored" && !isPersisted(m.memberId)) return false;
    if (filter.value === "unsaved" && !dirtyMemberIds.value.includes(m.memberId)) return false;
    if (q && !m.fullName.toLowerCase().includes(q)) return false;
    return true;
  });
});

const allEntered = computed(
  () => progress.value.total > 0 && progress.value.missingEntered === 0 && !roundFinalized.value,
);

const sheetReadyToSave = computed(
  () => allEntered.value && dirtyCount.value > 0 && incompleteDirtyCount.value === 0,
);

function rowStatus(memberId) {
  const dirty = dirtyMemberIds.value.includes(memberId);
  const saved = scoreByMember.value.has(memberId);
  if (dirty) return "edited";
  if (saved) return "saved";
  return "";
}

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

/** Next player in current display list (wraps). Falls back to roster. */
function getNextFocusTarget(memberId) {
  const list = displayList.value.length ? displayList.value : roster.value;
  if (!list.length) return null;
  const i = list.findIndex((m) => m.memberId === memberId);
  if (i < 0) return list[0];
  return list[(i + 1) % list.length];
}

async function focusFirstMissing() {
  await nextTick();
  const first = roster.value.find((m) => !hasPoints(m.memberId));
  if (first) focusMemberPoints(first.memberId);
}

/** Enter: move to next row locally — no network save. */
async function onPointsEnter(member) {
  if (roundFinalized.value || saving.value) return;
  const next = getNextFocusTarget(member.memberId);
  if (!next || next.memberId === member.memberId) return;
  await nextTick();
  focusMemberPoints(next.memberId);
}

function discardChanges() {
  if (!dirtyCount.value) return;
  const ok = window.confirm(`Discard ${dirtyCount.value} unsaved change${dirtyCount.value === 1 ? "" : "s"}?`);
  if (!ok) return;
  const next = {};
  for (const m of roster.value) {
    next[m.memberId] = {
      ...baselines.value[m.memberId],
      points: baselines.value[m.memberId]?.points ?? "",
    };
  }
  drafts.value = next;
  success.value = "";
  error.value = "";
}

async function saveAll() {
  if (roundFinalized.value || saving.value) return;
  const sb = admin?.client?.value;
  if (!sb || !roundId.value) return;

  const members = saveableDirtyMembers.value;
  if (!members.length) {
    error.value =
      incompleteDirtyCount.value > 0
        ? "Enter points (or mark DQ) on edited rows before saving."
        : "No unsaved changes.";
    return;
  }

  const payloads = [];
  for (const m of members) {
    const payload = buildRoundPlayerPayload(roundId.value, m.memberId, drafts.value[m.memberId]);
    if (payload) payloads.push(payload);
  }

  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    await upsertRoundPlayerScores(sb, payloads);
    await loadAll();
    success.value = `Saved ${payloads.length} score${payloads.length === 1 ? "" : "s"}.`;
    if (progress.value.missingEntered === 0 && !roundFinalized.value) {
      success.value += " Sheet complete — ready to finalize.";
    }
  } catch (e) {
    error.value = isDuplicateKeyError(e)
      ? friendlyDuplicateScoreMessage()
      : e?.message || String(e);
  } finally {
    saving.value = false;
  }
}

function confirmLeaveIfDirty() {
  if (!dirtyCount.value || roundFinalized.value) return true;
  return window.confirm(
    `You have ${dirtyCount.value} unsaved score change${dirtyCount.value === 1 ? "" : "s"}. Leave without saving?`,
  );
}

function onBeforeUnload(e) {
  if (!dirtyCount.value || roundFinalized.value) return;
  e.preventDefault();
  e.returnValue = "";
}

onBeforeRouteLeave(() => confirmLeaveIfDirty());

onMounted(() => {
  window.addEventListener("beforeunload", onBeforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
});

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

let suppressRoundWatch = false;
watch(roundId, async (next, prev) => {
  if (suppressRoundWatch) return;
  if (prev && next !== prev && dirtyCount.value) {
    if (!confirmLeaveIfDirty()) {
      suppressRoundWatch = true;
      roundId.value = prev;
      await nextTick();
      suppressRoundWatch = false;
      return;
    }
  }
  router.replace({ query: { ...route.query, round: roundId.value || undefined } });
  await loadAll();
});

watch(loading, (isLoading, wasLoading) => {
  if (wasLoading && !isLoading && !roundFinalized.value) {
    void focusFirstMissing();
  }
});

watch(filter, () => {
  if (!loading.value && !roundFinalized.value) {
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
          Fill the whole sheet first — points, snakes, and camels stay local.
          Press <kbd>Enter</kbd> to move down, then <strong>Save all</strong> when the sheet is complete.
        </p>
      </div>
      <button type="button" class="secondary-button" :disabled="loading || saving" @click="loadAll()">
        {{ loading ? "Refreshing…" : "Refresh" }}
      </button>
    </header>

    <p v-if="!admin?.client?.value" class="notice notice--warn">Connect to Supabase in the header first.</p>

    <template v-else>
      <section class="toolbar-card">
        <label class="field-pill">
          <span>Round</span>
          <select v-model="roundId" :disabled="loading || saving || !roundOptions.length">
            <option v-for="o in roundOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>
        <label class="field-pill">
          <span>Show</span>
          <select v-model="filter">
            <option value="all">Full sheet</option>
            <option value="unsaved">Unsaved only</option>
            <option value="missing">Not saved to DB</option>
            <option value="scored">Saved only</option>
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
          <strong>{{ progress.entered }} / {{ progress.total }}</strong> entered on sheet
          <span v-if="progress.missingEntered"> · {{ progress.missingEntered }} still blank</span>
          <span> · {{ progress.saved }} saved to DB</span>
          <span v-if="dirtyCount"> · {{ dirtyCount }} waiting to save</span>
          <span v-if="rosterSourceLabel(rosterSource)">
            · {{ rosterSourceLabel(rosterSource) }}
          </span>
        </template>
      </p>

      <p v-if="error" class="notice notice--error">{{ error }}</p>
      <p v-if="success" class="notice notice--success">
        {{ success }}
        <template v-if="allEntered && !dirtyCount">
          ·
          <RouterLink to="/manage/6-rounds">Open Rounds to finalize</RouterLink>
        </template>
      </p>
      <p v-if="sheetReadyToSave" class="notice notice--ready">
        Sheet looks complete — use <strong>Save all</strong> to write scores to the database.
      </p>
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
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in displayList"
                :key="m.memberId"
                :class="{ 'row--dirty': rowStatus(m.memberId) === 'edited' }"
              >
                <td class="col-player">
                  <span class="player-name">{{ m.fullName }}</span>
                  <span
                    v-if="rowStatus(m.memberId)"
                    :class="['saved-tag', rowStatus(m.memberId) === 'edited' ? 'saved-tag--edited' : '']"
                  >
                    {{ rowStatus(m.memberId) === "edited" ? "Draft" : "Saved" }}
                  </span>
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
                    :disabled="roundFinalized || saving"
                    @keydown.enter.prevent="onPointsEnter(m)"
                  />
                </td>
                <td class="col-tick">
                  <input
                    v-model="drafts[m.memberId].snake"
                    type="checkbox"
                    class="tick-input"
                    :disabled="roundFinalized || saving"
                    :aria-label="`Snake for ${m.fullName}`"
                  />
                </td>
                <td class="col-tick">
                  <input
                    v-model="drafts[m.memberId].camel"
                    type="checkbox"
                    class="tick-input"
                    :disabled="roundFinalized || saving"
                    :aria-label="`Camel for ${m.fullName}`"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!displayList.length" class="empty-state">No players match this filter.</p>
      </section>

      <footer v-if="!roundFinalized" class="save-bar" :class="{ 'save-bar--active': dirtyCount }">
        <div class="save-bar__status">
          <template v-if="dirtyCount">
            <strong>{{ dirtyCount }}</strong> draft change{{ dirtyCount === 1 ? "" : "s" }}
            <span v-if="incompleteDirtyCount">
              · {{ incompleteDirtyCount }} still need points
            </span>
            <span v-else-if="sheetReadyToSave"> · sheet ready</span>
          </template>
          <template v-else>
            <span class="muted">No unsaved changes — fill the sheet, then Save all</span>
          </template>
        </div>
        <div class="save-bar__actions">
          <button
            type="button"
            class="secondary-button"
            :disabled="!dirtyCount || saving"
            @click="discardChanges"
          >
            Discard
          </button>
          <button
            type="button"
            class="primary-button"
            :disabled="!saveableDirtyMembers.length || saving"
            @click="saveAll"
          >
            {{ saving ? "Saving…" : `Save all${saveableDirtyMembers.length ? ` (${saveableDirtyMembers.length})` : ""}` }}
          </button>
        </div>
      </footer>

      <p class="footer-links">
        <RouterLink to="/manage/score-submissions">Held cards</RouterLink>
        ·
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
  padding-bottom: 5.5rem;
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

.notice--success {
  color: var(--ok);
}

.notice--ready {
  color: var(--accent);
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

.row--dirty {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
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

.entry-table th.col-pts,
.entry-table th.col-tick {
  text-align: center;
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

.saved-tag--edited {
  color: var(--accent);
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

.save-bar {
  position: sticky;
  bottom: 0.75rem;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 24px color-mix(in srgb, #000 12%, transparent);
}

.save-bar--active {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
}

.save-bar__status {
  font-size: 0.88rem;
}

.save-bar__status .muted,
.muted {
  color: var(--muted);
}

.save-bar__actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
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

  .save-bar {
    bottom: 0.5rem;
  }

  .save-bar__actions {
    width: 100%;
  }

  .save-bar__actions .primary-button,
  .save-bar__actions .secondary-button {
    flex: 1;
  }
}
</style>
