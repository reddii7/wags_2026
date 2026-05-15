<script setup>
import { ref, watch, inject } from "vue";
import { RouterLink } from "vue-router";
import DataTable from "@/components/DataTable.vue";
import {
  pickDefaultRoundId,
  formatRoundLabel,
  loadCampaignRoster,
} from "@/composables/useRoundScores.js";

const admin = inject("adminCtx");
const counts = ref([]);
const loading = ref(false);
const error = ref("");
const weekly = ref({
  roundId: "",
  roundLabel: "",
  finalized: false,
  scored: 0,
  roster: 0,
  missing: 0,
});

const tables = [
  "members",
  "handicap_rules",
  "money_rules",
  "campaigns",
  "league_assignments",
  "rounds",
  "round_players",
  "weekly_prize_state",
  "handicap_snapshots",
];

async function loadWeeklyStatus() {
  weekly.value = {
    roundId: "",
    roundLabel: "",
    finalized: false,
    scored: 0,
    roster: 0,
    missing: 0,
  };
  const sb = admin?.client?.value;
  if (!sb) return;

  const { data: rounds, error: rErr } = await sb
    .from("rounds")
    .select("id, name, play_order, round_date, round_type, finalized, campaign_id, campaigns(label, kind)")
    .order("play_order", { ascending: true, nullsFirst: false })
    .order("round_date", { ascending: true })
    .limit(200);
  if (rErr) throw rErr;

  const summer = (rounds ?? []).filter((r) => r.campaigns?.kind === "summer_main");
  const pool = summer.length ? summer : rounds ?? [];
  const roundId = pickDefaultRoundId(pool);
  const round = pool.find((r) => r.id === roundId);
  if (!round) return;

  const { count: scored } = await sb
    .from("round_players")
    .select("*", { count: "exact", head: true })
    .eq("round_id", roundId);

  const rosterResult = round.campaign_id
    ? await loadCampaignRoster(sb, round.campaign_id)
    : { roster: [] };
  const roster = rosterResult.roster;

  const rosterN = roster.length;
  const scoredN = scored ?? 0;
  weekly.value = {
    roundId,
    roundLabel: formatRoundLabel(round),
    finalized: Boolean(round.finalized),
    scored: scoredN,
    roster: rosterN,
    missing: rosterN ? Math.max(0, rosterN - scoredN) : 0,
  };
}

async function load() {
  const sb = admin?.client?.value;
  if (!sb) {
    counts.value = [];
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const out = [];
    for (const t of tables) {
      const { count, error: cErr } = await sb
        .from(t)
        .select("*", { count: "exact", head: true });
      if (cErr) throw cErr;
      out.push({ table: t, count: count ?? 0 });
    }
    counts.value = out;
    await loadWeeklyStatus();
  } catch (e) {
    error.value = e?.message || String(e);
    counts.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => admin?.client?.value,
  () => load(),
  { immediate: true },
);

const countColumns = [
  { key: "table", label: "Table" },
  { key: "count", label: "Rows" },
];
</script>

<template>
  <div class="view">
    <h1 class="h1">Overview</h1>
    <p class="lede">Weekly tasks and database row counts.</p>

    <p v-if="!admin?.client?.value" class="warn">Connect to Supabase (expand connection bar above).</p>

    <div v-else class="cards">
      <RouterLink
        class="card card-primary"
        :to="weekly.roundId ? { path: '/manage/score-entry', query: { round: weekly.roundId } } : '/manage/score-entry'"
      >
        <span class="card-title">Enter scores</span>
        <span v-if="weekly.roundLabel" class="card-sub">{{ weekly.roundLabel }}</span>
        <span v-if="weekly.roundId && !weekly.finalized" class="card-stat">
          {{ weekly.scored }}/{{ weekly.roster || "?" }} scored
          <template v-if="weekly.missing"> · {{ weekly.missing }} missing</template>
        </span>
        <span v-else-if="weekly.finalized" class="card-stat">Round finalized</span>
        <span v-else class="card-stat">Pick a round</span>
      </RouterLink>

      <RouterLink class="card" to="/manage/6-rounds">
        <span class="card-title">Rounds &amp; finalize</span>
        <span class="card-sub">Finalize when all scores are in</span>
      </RouterLink>

      <RouterLink class="card" to="/manage/season-close">
        <span class="card-title">Close summer (P/R)</span>
        <span class="card-sub">End of season promotion / relegation</span>
      </RouterLink>
    </div>

    <h2 class="h2">Table counts</h2>
    <DataTable :columns="countColumns" :rows="counts" :loading="loading" :error="error" />
  </div>
</template>

<style scoped>
.view {
  max-width: 960px;
}

.h1 {
  margin: 0 0 0.35rem;
  font-size: 1.15rem;
}

.h2 {
  margin: 1.5rem 0 0.65rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--muted);
}

.lede {
  margin: 0 0 1rem;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.warn {
  color: #fcd34d;
  font-size: 0.88rem;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.65rem;
  margin-bottom: 0.5rem;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  text-decoration: none;
  color: var(--text);
  transition:
    border-color 0.15s,
    background 0.15s;
}

.card:hover {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

.card-primary {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
}

.card-title {
  font-weight: 700;
  font-size: 0.95rem;
}

.card-sub {
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}

.card-stat {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--accent);
  margin-top: 0.15rem;
}
</style>
