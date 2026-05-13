<script setup>
import { ref, inject, watch, computed } from "vue";

const admin = inject("adminCtx");

const campaigns = ref([]);
const oldId = ref("");
const nextId = ref("");
const effectiveFrom = ref(new Date().toISOString().slice(0, 10));
const previewRows = ref([]);
const loading = ref(false);
const busy = ref(false);
const err = ref("");

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
  const ok = window.confirm(
    "Close the old summer campaign and apply P/R?\n\n" +
      "• Old campaign → status closed\n" +
      "• Next campaign → league_assignments upserted (tier from §4.2)\n" +
      "• Handicaps are NOT reset — they keep rolling from last round\n" +
      "• Next campaign opens if it was draft",
  );
  if (!ok) return;
  err.value = "";
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
    window.alert(
      `Done. League rows upserted: ${data?.league_assignments_upserted ?? "?"}. ${data?.handicap_note ?? ""}`,
    );
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
    <h1 class="h1">Close summer season (P/R)</h1>
    <p class="lede">
      §4.2: top 3 in divisions 2–4 promoted; bottom 3 in divisions 1–3 relegated (promotion wins on overlap).
      Standings use each member’s best 10 net stableford scores in <strong>finalized</strong>
      <code>summer_weekly</code> rounds for the <strong>old</strong> campaign. Handicaps are unchanged.
    </p>
    <p v-if="!admin?.client?.value" class="warn">Connect in the header first.</p>
    <template v-else>
      <p v-if="err" class="err">{{ err }}</p>
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
        <button type="button" class="btn primary" :disabled="busy || !oldId" @click="runPreview">
          {{ busy ? "…" : "Preview P/R" }}
        </button>
        <button
          type="button"
          class="btn danger"
          :disabled="busy || !oldId || !nextId || oldId === nextId"
          @click="runApply"
        >
          Close old + apply to next
        </button>
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
  </div>
</template>

<style scoped>
.view {
  max-width: 900px;
}
.h1 {
  font-size: 1.1rem;
  margin: 0 0 0.35rem;
}
.lede {
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.45;
  margin: 0 0 1rem;
}
.lede code {
  font-size: 0.85em;
}
.warn {
  color: #fcd34d;
}
.err {
  color: #fecaca;
  font-size: 0.88rem;
  margin-bottom: 0.75rem;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem 1rem;
  margin-bottom: 0.75rem;
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
  border-radius: 8px;
  padding: 0.45rem 0.55rem;
  background: var(--bg);
  color: var(--text);
  font-size: 0.88rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.btn {
  border-radius: 8px;
  border: 1px solid var(--line);
  padding: 0.45rem 0.85rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  background: var(--bg);
  color: var(--text);
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.btn.danger {
  border-color: #b91c1c;
  color: #fecaca;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
.tbl th,
.tbl td {
  border: 1px solid var(--line);
  padding: 0.35rem 0.5rem;
  text-align: left;
}
.tbl th {
  background: var(--surface);
  color: var(--muted);
}
</style>
