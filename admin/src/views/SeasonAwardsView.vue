<script setup>
import { computed, inject, ref, watch } from "vue";

const AWARD_TYPES = [
  { value: "championship", label: "Championship winner" },
  { value: "chumps", label: "Chumps winner" },
];

const admin = inject("adminCtx");

const campaigns = ref([]);
const members = ref([]);
const awards = ref([]);
const campaignId = ref("");
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const success = ref("");

const draft = ref({
  championship: "",
  chumps: "",
  championshipNotes: "",
  chumpsNotes: "",
});

const summerCampaigns = computed(() =>
  (campaigns.value ?? []).filter((c) => c.kind === "summer_main"),
);

const selectedCampaign = computed(
  () => summerCampaigns.value.find((c) => c.id === campaignId.value) || null,
);

function awardFor(type) {
  return awards.value.find((a) => a.award_type === type) || null;
}

function syncDraftFromAwards() {
  const champs = awardFor("championship");
  const chumps = awardFor("chumps");
  draft.value = {
    championship: champs?.member_id || "",
    chumps: chumps?.member_id || "",
    championshipNotes: champs?.notes || "",
    chumpsNotes: chumps?.notes || "",
  };
}

async function loadCampaigns() {
  const sb = admin?.client?.value;
  if (!sb) {
    campaigns.value = [];
    campaignId.value = "";
    return;
  }
  const { data, error: qerr } = await sb
    .from("campaigns")
    .select("id, label, year, kind, status")
    .order("year", { ascending: false });
  if (qerr) throw qerr;
  campaigns.value = data ?? [];
  if (!summerCampaigns.value.some((c) => c.id === campaignId.value)) {
    campaignId.value =
      summerCampaigns.value.find((c) => c.status === "open")?.id ||
      summerCampaigns.value.find((c) => Number(c.year) === 2026)?.id ||
      summerCampaigns.value[0]?.id ||
      "";
  }
}

async function loadMembers() {
  const sb = admin?.client?.value;
  if (!sb) {
    members.value = [];
    return;
  }
  const { data, error: qerr } = await sb
    .from("members")
    .select("id, full_name")
    .order("full_name", { ascending: true })
    .limit(500);
  if (qerr) throw qerr;
  members.value = data ?? [];
}

async function loadAwards() {
  const sb = admin?.client?.value;
  if (!sb || !campaignId.value) {
    awards.value = [];
    syncDraftFromAwards();
    return;
  }
  const { data, error: qerr } = await sb
    .from("campaign_awards")
    .select("id, campaign_id, award_type, member_id, notes, members(full_name)")
    .eq("campaign_id", campaignId.value);
  if (qerr) throw qerr;
  awards.value = data ?? [];
  syncDraftFromAwards();
}

async function loadAll() {
  loading.value = true;
  error.value = "";
  success.value = "";
  try {
    await loadCampaigns();
    await loadMembers();
    await loadAwards();
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function saveAwards() {
  const sb = admin?.client?.value;
  if (!sb || !campaignId.value) return;
  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    const rows = [];
    for (const type of AWARD_TYPES) {
      const memberId = draft.value[type.value];
      if (!memberId) continue;
      rows.push({
        campaign_id: campaignId.value,
        award_type: type.value,
        member_id: memberId,
        notes:
          type.value === "championship"
            ? draft.value.championshipNotes || null
            : draft.value.chumpsNotes || null,
      });
    }

    for (const type of AWARD_TYPES) {
      const memberId = draft.value[type.value];
      if (memberId) continue;
      const existing = awardFor(type.value);
      if (!existing?.id) continue;
      const { error: delErr } = await sb
        .from("campaign_awards")
        .delete()
        .eq("id", existing.id);
      if (delErr) throw delErr;
    }

    if (rows.length) {
      const { error: upsertErr } = await sb
        .from("campaign_awards")
        .upsert(rows, { onConflict: "campaign_id,award_type" });
      if (upsertErr) throw upsertErr;
    }

    await loadAwards();
    success.value = "Season awards saved. Member History tab will show them after the next data refresh.";
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    saving.value = false;
  }
}

watch(
  () => admin?.client?.value,
  () => loadAll(),
  { immediate: true },
);

watch(campaignId, async (next, prev) => {
  if (!next || next === prev) return;
  loading.value = true;
  error.value = "";
  success.value = "";
  try {
    await loadAwards();
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="view">
    <header class="page-header">
      <div>
        <p class="eyebrow">Season close</p>
        <h1>Season awards</h1>
        <p class="lede">
          Record Championship and Chumps winners without entering full finals scorecards.
          These appear on the member app History tab.
        </p>
      </div>
      <button type="button" class="secondary-button" :disabled="loading || saving" @click="loadAll">
        {{ loading ? "Refreshing…" : "Refresh" }}
      </button>
    </header>

    <p v-if="!admin?.client?.value" class="notice notice--warn">Connect to Supabase in the header first.</p>

    <template v-else>
      <p v-if="error" class="notice notice--error">{{ error }}</p>
      <p v-if="success" class="notice notice--success">{{ success }}</p>

      <section class="toolbar-card">
        <label class="field-pill">
          <span>Summer campaign</span>
          <select v-model="campaignId" :disabled="loading || !summerCampaigns.length">
            <option v-for="c in summerCampaigns" :key="c.id" :value="c.id">
              {{ c.label }} ({{ c.year }}) · {{ c.status }}
            </option>
          </select>
        </label>
      </section>

      <section v-if="selectedCampaign" class="form-card">
        <p class="campaign-line">
          Editing <strong>{{ selectedCampaign.label }}</strong>
          <span v-if="selectedCampaign.status === 'closed'"> · closed</span>
        </p>

        <label class="field">
          <span>Championship winner</span>
          <select v-model="draft.championship" :disabled="saving">
            <option value="">— not set —</option>
            <option v-for="m in members" :key="m.id" :value="m.id">{{ m.full_name }}</option>
          </select>
        </label>
        <label class="field">
          <span>Championship notes (optional)</span>
          <input v-model="draft.championshipNotes" type="text" :disabled="saving" placeholder="e.g. Summer 2026 Championship winner" />
        </label>

        <label class="field">
          <span>Chumps winner</span>
          <select v-model="draft.chumps" :disabled="saving">
            <option value="">— not set —</option>
            <option v-for="m in members" :key="`c-${m.id}`" :value="m.id">{{ m.full_name }}</option>
          </select>
        </label>
        <label class="field">
          <span>Chumps notes (optional)</span>
          <input v-model="draft.chumpsNotes" type="text" :disabled="saving" placeholder="e.g. Summer 2026 Chumps winner" />
        </label>

        <div class="actions">
          <button type="button" class="primary-button" :disabled="saving || !campaignId" @click="saveAwards">
            {{ saving ? "Saving…" : "Save awards" }}
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.view {
  display: grid;
  gap: 1.25rem;
  max-width: 720px;
}

.page-header {
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

.secondary-button,
.primary-button {
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

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
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

.notice--warn {
  color: #fbbf24;
}

.toolbar-card,
.form-card {
  display: grid;
  gap: 0.85rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
}

.field-pill,
.field {
  display: grid;
  gap: 0.3rem;
}

.field-pill span,
.field span {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.field-pill select,
.field select,
.field input {
  min-height: 2.45rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.55rem 0.85rem;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
}

.campaign-line {
  margin: 0;
  font-size: 0.9rem;
}

.actions {
  display: flex;
  justify-content: flex-end;
}
</style>
