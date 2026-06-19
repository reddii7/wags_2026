<script setup>
import { ref, watch, inject } from "vue";
import { RouterLink } from "vue-router";
import AdminNotice from "@/components/AdminNotice.vue";
import {
  pickDefaultRoundId,
  formatRoundLabel,
  loadCampaignRoster,
} from "@/composables/useRoundScores.js";

const admin = inject("adminCtx");
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
const ops = ref({
  heldCards: 0,
  heldGroups: 0,
  members: 0,
  openCampaigns: 0,
});

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

async function loadOpsStatus() {
  ops.value = {
    heldCards: 0,
    heldGroups: 0,
    members: 0,
    openCampaigns: 0,
  };
  const sb = admin?.client?.value;
  if (!sb) return;

  const [
    heldCardsResult,
    heldGroupsResult,
    membersResult,
    campaignsResult,
  ] = await Promise.all([
    sb
      .from("scorecard_player_cards")
      .select("*", { count: "exact", head: true }),
    sb
      .from("scorecard_player_cards")
      .select("season_id, played_date")
      .limit(500),
    sb
      .from("members")
      .select("*", { count: "exact", head: true }),
    sb
      .from("campaigns")
      .select("*", { count: "exact", head: true })
      .eq("status", "open"),
  ]);

  const firstError = [
    heldCardsResult.error,
    heldGroupsResult.error,
    membersResult.error,
    campaignsResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const groupKeys = new Set(
    (heldGroupsResult.data ?? []).map(
      (card) => `${card.season_id || "none"}:${card.played_date || "unknown"}`,
    ),
  );

  ops.value = {
    heldCards: heldCardsResult.count ?? 0,
    heldGroups: groupKeys.size,
    members: membersResult.count ?? 0,
    openCampaigns: campaignsResult.count ?? 0,
  };
}

async function load() {
  const sb = admin?.client?.value;
  if (!sb) {
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    await Promise.all([loadWeeklyStatus(), loadOpsStatus()]);
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

watch(
  () => admin?.client?.value,
  () => load(),
  { immediate: true },
);

</script>

<template>
  <div class="view">
    <h1 class="h1">Overview</h1>
    <p class="lede">The normal weekly flow, in order.</p>

    <AdminNotice v-if="!admin?.client?.value" tone="warning">
      Connect to Supabase first.
    </AdminNotice>

    <div v-else class="status-grid" aria-label="Admin status overview">
      <RouterLink
        class="status-card"
        :to="weekly.roundId ? { path: '/manage/score-entry', query: { round: weekly.roundId } } : '/manage/score-entry'"
      >
        <span class="status-label">Selected round</span>
        <strong>{{ weekly.roundLabel || (loading ? "Loading…" : "No round found") }}</strong>
        <span v-if="weekly.roundId && !weekly.finalized" class="status-sub">
          {{ weekly.scored }}/{{ weekly.roster || "?" }} scored
          <template v-if="weekly.missing"> · {{ weekly.missing }} missing</template>
        </span>
        <span v-else-if="weekly.finalized" class="status-pill ok">Finalized</span>
      </RouterLink>

      <RouterLink class="status-card" to="/manage/score-submissions">
        <span class="status-label">Held cards</span>
        <strong>{{ ops.heldCards }}</strong>
        <span class="status-sub">
          {{ ops.heldGroups }} date group{{ ops.heldGroups === 1 ? "" : "s" }} waiting
        </span>
      </RouterLink>

      <RouterLink class="status-card" to="/manage/1-members">
        <span class="status-label">Members</span>
        <strong>{{ ops.members }}</strong>
        <span class="status-sub">Configured in the live admin schema</span>
      </RouterLink>

      <RouterLink class="status-card" to="/manage/4-campaigns">
        <span class="status-label">Open campaigns</span>
        <strong>{{ ops.openCampaigns }}</strong>
        <span class="status-sub">Active seasons available to workflows</span>
      </RouterLink>
    </div>

    <div v-if="admin?.client?.value" class="cards">
      <RouterLink class="card card-primary" to="/manage/score-submissions">
        <span class="card-step">1</span>
        <span class="card-title">Held cards</span>
        <span class="card-sub">Review committee cards and import into a round</span>
      </RouterLink>

      <RouterLink
        class="card"
        :to="weekly.roundId ? { path: '/manage/score-entry', query: { round: weekly.roundId } } : '/manage/score-entry'"
      >
        <span class="card-step">2</span>
        <span class="card-title">Live score entry</span>
        <span v-if="weekly.roundLabel" class="card-sub">{{ weekly.roundLabel }}</span>
        <span v-if="weekly.roundId && !weekly.finalized" class="card-stat">
          {{ weekly.scored }}/{{ weekly.roster || "?" }} scored
          <template v-if="weekly.missing"> · {{ weekly.missing }} missing</template>
        </span>
        <span v-else-if="weekly.finalized" class="card-stat">Round finalized</span>
      </RouterLink>

      <RouterLink class="card" to="/manage/6-rounds">
        <span class="card-step">3</span>
        <span class="card-title">Rounds</span>
        <span class="card-sub">Create rounds first. Finalize later when scores are correct.</span>
      </RouterLink>
    </div>

    <h2 class="h2">RS Cup</h2>
    <div class="cards">
      <RouterLink class="card" to="/manage/13-competitions">
        <span class="card-title">Competitions</span>
        <span class="card-sub">RS Cup competition on the summer campaign</span>
      </RouterLink>
      <RouterLink class="card" to="/manage/14-cup-matches">
        <span class="card-title">Cup matches</span>
        <span class="card-sub">Draw, play-by dates, winners, and result text for the app</span>
      </RouterLink>
    </div>

    <h2 class="h2">Communications</h2>
    <div class="cards">
      <RouterLink class="card" to="/notifications">
        <span class="card-title">Send notification</span>
        <span class="card-sub">Push announcement to members who allow notifications</span>
      </RouterLink>
    </div>

    <AdminNotice v-if="error" tone="warning">{{ error }}</AdminNotice>
  </div>
</template>

<style scoped>
.view {
  max-width: 1040px;
}

.h1 {
  margin: 0 0 0.35rem;
  font-size: clamp(1.35rem, 1.1rem + 0.9vw, 1.9rem);
  letter-spacing: -0.03em;
}

.h2 {
  margin: 1.75rem 0 0.7rem;
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--muted-strong);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lede {
  margin: 0 0 1rem;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.8rem;
  margin: 0 0 1.35rem;
}

.status-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-height: 7.5rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 10%, transparent), transparent 8rem),
    var(--panel);
  box-shadow: var(--shadow-soft);
  color: var(--text);
  text-decoration: none;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}

.status-card:hover {
  border-color: color-mix(in srgb, var(--accent) 46%, var(--line));
  box-shadow: var(--shadow);
  transform: translateY(-2px);
}

.status-label {
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status-card strong {
  margin-top: 0.1rem;
  font-size: clamp(1.25rem, 1rem + 0.8vw, 1.8rem);
  letter-spacing: -0.04em;
  line-height: 1.05;
}

.status-sub {
  margin-top: auto;
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.35;
}

.status-pill {
  align-self: flex-start;
  margin-top: auto;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
}

.status-pill.ok {
  background: var(--ok-soft);
  color: var(--ok);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.8rem;
  margin-bottom: 1rem;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-height: 9.5rem;
  padding: 1.1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--panel) 94%, white), var(--panel)),
    var(--panel);
  text-decoration: none;
  color: var(--text);
  box-shadow: var(--shadow-soft);
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}

.card:hover {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  box-shadow: var(--shadow);
  transform: translateY(-2px);
}

.card-primary {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 18%, transparent), transparent 12rem),
    var(--panel);
}

.card-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.7rem;
  margin-bottom: 0.35rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 18%, var(--panel));
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 800;
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

@media (max-width: 980px) {
  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .status-grid {
    grid-template-columns: 1fr;
  }
}
</style>
