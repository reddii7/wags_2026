<script setup>
import { ref, watch, inject } from "vue";
import DataTable from "@/components/DataTable.vue";

const admin = inject("adminCtx");
const rows = ref([]);
const loading = ref(false);
const error = ref("");
const campaigns = ref([]);
const campaignId = ref("");

const columns = [
  { key: "member", label: "Member" },
  { key: "best_total", label: "Best 14 total" },
  { key: "scores_used", label: "Rounds counted" },
];

const take = 14;

async function loadCampaignOptions() {
  const sb = admin?.client?.value;
  if (!sb) {
    campaigns.value = [];
    campaignId.value = "";
    return;
  }
  const { data, error: qerr } = await sb
    .from("campaigns")
    .select("id,label,year,kind")
    .eq("kind", "summer_main")
    .order("year", { ascending: false });
  if (qerr) throw qerr;
  campaigns.value = data ?? [];
  const stillValid = campaigns.value.some((c) => c.id === campaignId.value);
  if (!stillValid) campaignId.value = campaigns.value[0]?.id ?? "";
}

async function load() {
  const sb = admin?.client?.value;
  if (!sb || !campaignId.value) {
    rows.value = [];
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    // summer_weekly rounds are the Best-14 source in the new schema
    const { data: rounds, error: e2 } = await sb
      .from("rounds")
      .select("id")
      .eq("round_type", "summer_weekly")
      .eq("campaign_id", campaignId.value);
    if (e2) throw e2;
    const roundIds = (rounds ?? []).map((r) => r.id);
    if (!roundIds.length) {
      rows.value = [];
      return;
    }
    const { data: rp, error: e3 } = await sb
      .from("round_players")
      .select("member_id, stableford_points, members(full_name)")
      .in("round_id", roundIds)
      .eq("entered", true)
      .not("stableford_points", "is", null)
      .limit(5000);
    if (e3) throw e3;
    const byMember = new Map();
    for (const row of rp ?? []) {
      const mid = row.member_id;
      const pts = Number(row.stableford_points);
      if (!Number.isFinite(pts)) continue;
      const name = row.members?.full_name ?? String(mid);
      if (!byMember.has(mid)) byMember.set(mid, { name, scores: [] });
      byMember.get(mid).scores.push(pts);
    }
    const out = [];
    for (const { name, scores } of byMember.values()) {
      const sorted = [...scores].sort((a, b) => b - a);
      const top = sorted.slice(0, take);
      const best_total = top.reduce((a, b) => a + b, 0);
      out.push({
        member: name,
        best_total,
        scores_used: top.length,
      });
    }
    out.sort((a, b) => b.best_total - a.best_total);
    rows.value = out;
  } catch (e) {
    error.value = e?.message || String(e);
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => [admin?.client?.value, campaignId.value],
  async () => {
    try {
      await loadCampaignOptions();
      await load();
    } catch (e) {
      error.value = e?.message || String(e);
      rows.value = [];
      loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="view">
    <h1 class="h1">Member app · Best 14 (preview)</h1>
    <p class="lede">
      Top {{ take }} net stableford scores per member for the selected summer campaign’s
      <code>summer_weekly</code> rounds, then summed.
    </p>
    <div v-if="admin?.client?.value" class="campaign-row">
      <label class="campaign-label">
        Summer campaign
        <select v-model="campaignId" class="campaign-select" :disabled="!campaigns.length">
          <option v-for="c in campaigns" :key="c.id" :value="c.id">
            {{ c.label }} ({{ c.year }})
          </option>
        </select>
      </label>
    </div>
    <p v-if="!admin?.client?.value" class="warn">Connect first.</p>
    <DataTable v-else :columns="columns" :rows="rows" :loading="loading" :error="error" />
  </div>
</template>

<style scoped>
.h1 {
  font-size: 1.1rem;
  margin: 0 0 0.35rem;
}
.lede {
  color: var(--muted);
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}
.lede code {
  font-size: 0.8em;
}
.warn {
  color: #fcd34d;
}
.campaign-row {
  margin-bottom: 0.75rem;
}
.campaign-label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: var(--muted);
}
.campaign-select {
  min-width: 12rem;
  padding: 0.25rem 0.45rem;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--panel);
  color: inherit;
  font-size: 0.85rem;
}
</style>
