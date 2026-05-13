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
  { key: "campaign", label: "Campaign" },
  { key: "member", label: "Member" },
  { key: "tier", label: "Tier" },
  { key: "effective_from", label: "Effective from" },
];

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
    const { data, error: qerr } = await sb
      .from("league_assignments")
      .select("tier, effective_from, campaigns(label), members(full_name)")
      .eq("campaign_id", campaignId.value)
      .order("tier", { ascending: true })
      .limit(400);
    if (qerr) throw qerr;
    rows.value = (data ?? []).map((r) => ({
      campaign: r.campaigns?.label ?? "—",
      member: r.members?.full_name ?? "—",
      tier: r.tier ?? "—",
      effective_from: r.effective_from ?? "—",
    }));
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
    <h1 class="h1">Member app · Leagues (preview)</h1>
    <p class="lede">League assignments — tier per member per campaign.</p>
    <div v-if="admin?.client?.value" class="campaign-row">
      <label class="campaign-label">
        Campaign
        <select v-model="campaignId" class="campaign-select" :disabled="!campaigns.length">
          <option v-for="c in campaigns" :key="c.id" :value="c.id">
            {{ c.label }} ({{ c.year }})
          </option>
        </select>
      </label>
    </div>
    <p v-if="!admin?.client?.value" class="warn">Connect first.</p>
    <DataTable
      v-else
      :columns="columns"
      :rows="rows"
      :loading="loading"
      :error="error"
    />
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
