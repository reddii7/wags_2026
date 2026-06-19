<script setup>
import { ref, inject, watch, computed } from "vue";
import AdminButton from "@/components/AdminButton.vue";
import AdminConfirmDialog from "@/components/AdminConfirmDialog.vue";
import AdminNotice from "@/components/AdminNotice.vue";
import AdminPageHeader from "@/components/AdminPageHeader.vue";

const admin = inject("adminCtx");

const campaigns = ref([]);
const oldId = ref("");
const nextId = ref("");
const effectiveFrom = ref(new Date().toISOString().slice(0, 10));
const previewRows = ref([]);
const loading = ref(false);
const busy = ref(false);
const err = ref("");
const success = ref("");
const confirmDialog = ref({
  open: false,
  title: "",
  message: "",
  detail: "",
  confirmLabel: "Continue",
  resolve: null,
});

function normalizePreviewRpc(data) {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === "string") {
    try {
      const p = JSON.parse(data);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function selectedCampaignLabel(id) {
  const campaign = campaigns.value.find((c) => c.id === id);
  return campaign ? `${campaign.label} (${campaign.year})` : "selected campaign";
}

function askConfirm({ title, message, detail, confirmLabel }) {
  return new Promise((resolve) => {
    confirmDialog.value = {
      open: true,
      title,
      message,
      detail,
      confirmLabel,
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
    detail: "",
    confirmLabel: "Continue",
    resolve: null,
  };
  if (resolve) resolve(answer);
}

const summerCampaigns = computed(() =>
  (campaigns.value ?? []).filter((c) => c.kind === "summer_main"),
);

async function loadCampaigns() {
  const sb = admin?.client?.value;
  if (!sb) {
    campaigns.value = [];
    return;
  }
  err.value = "";
  loading.value = true;
  try {
    const { data, error: q } = await sb
      .from("campaigns")
      .select("id, label, year, kind, status")
      .order("year", { ascending: false });
    if (q) throw q;
    campaigns.value = data ?? [];
  } catch (e) {
    err.value = e?.message || String(e);
    campaigns.value = [];
  } finally {
    loading.value = false;
  }
}

async function runPreview() {
  const sb = admin?.client?.value;
  if (!sb || !oldId.value) return;
  err.value = "";
  success.value = "";
  busy.value = true;
  previewRows.value = [];
  try {
    const { data, error: q } = await sb.rpc("preview_summer_pr", {
      p_old_campaign: oldId.value,
    });
    if (q) throw q;
    previewRows.value = normalizePreviewRpc(data);
  } catch (e) {
    err.value = e?.message || String(e);
  } finally {
    busy.value = false;
  }
}

async function runApply() {
  const sb = admin?.client?.value;
  if (!sb || !oldId.value || !nextId.value) return;
  const ok = await askConfirm({
    title: "Close summer campaign?",
    message: `Apply promotion/relegation from ${selectedCampaignLabel(oldId.value)} into ${selectedCampaignLabel(nextId.value)}.`,
    detail:
      "Old campaign -> status closed\n" +
      "Next campaign -> league assignments upserted from section 4.2\n" +
      "Handicaps are not reset; they keep rolling from the last round\n" +
      "Next campaign opens if it was draft",
    confirmLabel: "Close + apply P/R",
  });
  if (!ok) return;
  err.value = "";
  success.value = "";
  busy.value = true;
  try {
    const { data, error: q } = await sb.rpc("apply_summer_close_with_pr", {
      p_old_campaign: oldId.value,
      p_next_campaign: nextId.value,
      p_effective_from: effectiveFrom.value,
    });
    if (q) throw q;
    await loadCampaigns();
    previewRows.value = [];
    err.value = "";
    success.value = `Done. League rows upserted: ${data?.league_assignments_upserted ?? "?"}. ${data?.handicap_note ?? ""}`;
  } catch (e) {
    err.value = e?.message || String(e);
  } finally {
    busy.value = false;
  }
}

watch(
  () => admin?.client?.value,
  () => loadCampaigns(),
  { immediate: true },
);
</script>

<template>
  <div class="view">
    <AdminPageHeader eyebrow="Season workflow" title="Close summer season (P/R)">
      <template #description>
        §4.2: top 3 in divisions 2–4 promoted; bottom 3 in divisions 1–3 relegated
        (promotion wins on overlap). Standings use each member’s best 10 net stableford
        scores in <strong>finalized</strong> <code>summer_weekly</code> rounds for the
        <strong>old</strong> campaign. Handicaps are unchanged.
      </template>
    </AdminPageHeader>
    <AdminNotice v-if="!admin?.client?.value" tone="warning">
      Connect in the header first.
    </AdminNotice>
    <template v-else>
      <AdminNotice v-if="err" tone="error">{{ err }}</AdminNotice>
      <AdminNotice v-if="success" tone="success">{{ success }}</AdminNotice>
      <div class="grid">
        <label class="field">
          <span class="lab">Closing campaign (summer)</span>
          <select v-model="oldId" class="input" :disabled="loading">
            <option value="">— choose —</option>
            <option v-for="c in summerCampaigns" :key="c.id" :value="c.id">
              {{ c.label }} ({{ c.year }}) · {{ c.status }}
            </option>
          </select>
        </label>
        <label class="field">
          <span class="lab">Next summer campaign</span>
          <select v-model="nextId" class="input" :disabled="loading">
            <option value="">— choose —</option>
            <option v-for="c in summerCampaigns" :key="c.id" :value="c.id">
              {{ c.label }} ({{ c.year }}) · {{ c.status }}
            </option>
          </select>
        </label>
        <label class="field">
          <span class="lab">New assignments effective from</span>
          <input v-model="effectiveFrom" type="date" class="input" />
        </label>
      </div>
      <div class="row">
        <AdminButton variant="primary" :disabled="busy || !oldId" @click="runPreview">
          {{ busy ? "…" : "Preview P/R" }}
        </AdminButton>
        <AdminButton
          variant="danger"
          :disabled="busy || !oldId || !nextId || oldId === nextId"
          @click="runApply"
        >
          Close old + apply to next
        </AdminButton>
      </div>

      <table v-if="previewRows.length" class="tbl">
        <thead>
          <tr>
            <th>Tier</th>
            <th>#</th>
            <th>Member</th>
            <th>Best 10</th>
            <th>New tier</th>
            <th>Movement</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in previewRows" :key="r.member_id + String(i)">
            <td>{{ r.old_tier }}</td>
            <td>{{ r.rank_in_tier }}</td>
            <td>{{ r.full_name }}</td>
            <td>{{ r.best10_total }}</td>
            <td>{{ r.new_tier }}</td>
            <td>{{ r.movement }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <AdminConfirmDialog
      :open="confirmDialog.open"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :detail="confirmDialog.detail"
      :confirm-label="confirmDialog.confirmLabel"
      tone="danger"
      @confirm="closeConfirm(true)"
      @cancel="closeConfirm(false)"
    />
  </div>
</template>

<style scoped>
.view {
  display: grid;
  gap: 1rem;
  max-width: 980px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem 1rem;
  margin-bottom: 0.9rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}
@media (max-width: 720px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.lab {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
}
.input {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 0.55rem 0.7rem;
  background: color-mix(in srgb, var(--panel) 88%, var(--bg));
  color: var(--text);
  font-size: 0.88rem;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}
.input:focus {
  border-color: color-mix(in srgb, var(--accent) 52%, var(--line));
  box-shadow: 0 0 0 3px var(--focus-ring);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}
.tbl th,
.tbl td {
  border-bottom: 1px solid var(--line);
  padding: 0.55rem 0.7rem;
  text-align: left;
}
.tbl th {
  background: color-mix(in srgb, var(--panel-strong) 92%, var(--accent));
  color: var(--muted);
  font-size: 0.68rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.tbl tbody tr:last-child td {
  border-bottom: none;
}
</style>
