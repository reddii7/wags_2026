<script setup>
import { ref, computed, watch, inject } from "vue";
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
        snakes: existing?.snake_count ?? 0,
        camels: existing?.camel_count ?? 0,
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

function rowClass(memberId) {
  const s = scoreByMember.value.get(memberId);
  if (!s) return "entry-missing";
  if (s.disqualified) return "entry-dq";
  return "entry-done";
}

async function saveMember(member) {
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
    snake_count: Number(d.snakes) || 0,
    camel_count: Number(d.camels) || 0,
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
</script>

<template>
  <div class="score-entry">
    <h1 class="h1">Enter scores</h1>
    <p class="lede">Add or update net stableford points for one round. Saved players appear greyed out.</p>

    <p v-if="!admin?.client?.value" class="warn">Connect to Supabase in the header first.</p>

    <template v-else>
      <div class="controls">
        <label class="field-inline">
          Round
          <select v-model="roundId" class="select" :disabled="loading || !roundOptions.length">
            <option v-for="o in roundOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>
        <label class="field-inline">
          Show
          <select v-model="filter" class="select">
            <option value="missing">Missing only</option>
            <option value="all">Everyone</option>
            <option value="scored">Scored only</option>
          </select>
        </label>
        <label class="field-inline grow">
          Search
          <input v-model="search" type="search" class="input" placeholder="Player name…" />
        </label>
        <button type="button" class="btn ghost" :disabled="loading" @click="loadAll">Refresh</button>
      </div>

      <div
        v-if="roundId"
        :class="['banner', roundFinalized ? 'banner-lock' : 'banner-ok']"
      >
        <template v-if="roundFinalized">
          <strong>Finalized</strong> — scores are read-only.
          <RouterLink to="/manage/6-rounds">Reopen round</RouterLink>
        </template>
        <template v-else>
          <strong>{{ progress.scored }} / {{ progress.total }}</strong> scored
          <span v-if="progress.missing"> · {{ progress.missing }} missing</span>
          <span v-if="rosterSourceLabel(rosterSource)" class="banner-meta">
            · {{ rosterSourceLabel(rosterSource) }}
          </span>
        </template>
      </div>

      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="loading" class="muted">Loading…</p>

      <ul v-else class="entry-list">
        <li
          v-for="m in displayList"
          :key="m.memberId"
          :class="['entry-row', rowClass(m.memberId)]"
        >
          <div class="entry-name">
            <span class="name">{{ m.fullName }}</span>
            <span v-if="scoreByMember.has(m.memberId)" class="tag">Saved</span>
          </div>
          <div class="entry-fields">
            <label class="mini">
              Pts
              <input
                v-model="drafts[m.memberId].points"
                type="number"
                class="input num"
                min="0"
                max="60"
                :disabled="roundFinalized || savingId === m.memberId"
              />
            </label>
            <label class="mini">
              🐍
              <input
                v-model.number="drafts[m.memberId].snakes"
                type="number"
                class="input num"
                min="0"
                :disabled="roundFinalized || savingId === m.memberId"
              />
            </label>
            <label class="mini">
              🐪
              <input
                v-model.number="drafts[m.memberId].camels"
                type="number"
                min="0"
                class="input num"
                :disabled="roundFinalized || savingId === m.memberId"
              />
            </label>
            <label class="mini check">
              <input
                v-model="drafts[m.memberId].dq"
                type="checkbox"
                :disabled="roundFinalized || savingId === m.memberId"
              />
              DQ
            </label>
            <button
              type="button"
              class="btn primary"
              :disabled="roundFinalized || savingId === m.memberId"
              @click="saveMember(m)"
            >
              {{ savingId === m.memberId ? "…" : scoreByMember.has(m.memberId) ? "Update" : "Save" }}
            </button>
          </div>
        </li>
      </ul>

      <p v-if="!loading && !displayList.length" class="muted">No players match this filter.</p>

      <p class="footer-links">
        <RouterLink to="/manage/7-scores">Advanced scores table</RouterLink>
        ·
        <RouterLink to="/manage/6-rounds">Rounds &amp; finalize</RouterLink>
      </p>
    </template>
  </div>
</template>

<style scoped>
.score-entry {
  max-width: 900px;
}

.h1 {
  margin: 0 0 0.35rem;
  font-size: 1.2rem;
}

.lede {
  margin: 0 0 1rem;
  color: var(--muted);
  font-size: 0.88rem;
}

.warn {
  color: #fcd34d;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: flex-end;
  margin-bottom: 0.75rem;
}

.field-inline {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
}

.field-inline.grow {
  flex: 1;
  min-width: 10rem;
}

.select,
.input {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.4rem 0.55rem;
  background: var(--bg);
  color: var(--text);
  font-size: 0.88rem;
}

.input.num {
  width: 4rem;
}

.banner {
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  font-size: 0.86rem;
  border: 1px solid var(--line);
}

.banner-ok {
  background: color-mix(in srgb, var(--ok) 12%, var(--surface));
}

.banner-lock {
  background: color-mix(in srgb, var(--danger) 12%, var(--surface));
}

.banner-meta {
  color: var(--muted);
  font-weight: 400;
}

.err {
  color: #fecaca;
  font-size: 0.88rem;
}

.muted {
  color: var(--muted);
  font-size: 0.88rem;
}

.entry-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.entry-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.entry-row.entry-done {
  opacity: 0.55;
  background: color-mix(in srgb, var(--muted) 8%, var(--surface));
}

.entry-row.entry-missing {
  border-color: color-mix(in srgb, #f59e0b 40%, var(--line));
}

.entry-row.entry-dq {
  opacity: 0.5;
  text-decoration: line-through;
}

.entry-name {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 10rem;
}

.name {
  font-weight: 600;
  font-size: 0.92rem;
}

.tag {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--muted);
}

.entry-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.45rem;
}

.mini {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.68rem;
  color: var(--muted);
}

.mini.check {
  flex-direction: row;
  align-items: center;
  gap: 0.25rem;
  padding-bottom: 0.35rem;
}

.btn {
  border-radius: 8px;
  padding: 0.4rem 0.75rem;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn.ghost {
  background: transparent;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.footer-links {
  margin-top: 1.25rem;
  font-size: 0.82rem;
  color: var(--muted);
}
</style>
