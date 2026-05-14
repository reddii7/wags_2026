<script setup>
import { ref, watch, inject, computed, reactive } from "vue";
import { useRoute } from "vue-router";
import { ENUMS } from "@/config/entityAdminConfig.js";

const admin = inject("adminCtx");
const route = useRoute();

const entity = computed(() => route.meta?.entity);
const rows = ref([]);
const loading = ref(false);
const error = ref("");
const dialogOpen = ref(false);
const dialogMode = ref("create");
const saving = ref(false);
const formError = ref("");
const model = ref({});
const fkOptions = ref({});
const fkLoadErrors = ref({});
const jsonDraft = reactive({});

// Custom row-action state
const rpcBusy = ref({});   // rowKey → true while running
const rpcResult = ref(null); // last result/error message to show inline

// Remember last-used create values per table so repeat adds are fast.
// Keyed by table name; reset when navigating to a different entity.
const lastCreateValues = ref({});

/** When entity.filterByCampaign — scope standings-style views to one campaign */
const campaignFilterId = ref("");
const campaignFilterOptions = ref([]);

/** When entity.filterBySelectedRound — scope list to one round (dropdown) */
const snapshotRoundPickerId = ref("");
const snapshotRoundPickerOptions = ref([]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const displayRows = computed(() => {
  const cols = entity.value?.listColumns ?? [];
  return (rows.value ?? []).map((row) => {
    const out = {};
    for (const c of cols) {
      out[c.key] = flattenCell(row, c.key);
    }
    return out;
  });
});

function flattenCell(row, key) {
  if (key === "campaign_id" && row.campaigns != null)
    return row.campaigns?.label ?? row.campaign_id;
  if (key === "competition_id" && row.competitions != null)
    return row.competitions?.name ?? row.competition_id;
  if (key === "member_id" && row.members != null)
    return row.members?.full_name ?? row.member_id;
  if (key === "round_id" && row.rounds != null) {
    const r = row.rounds;
    const name = r.name ? `${r.name} · ` : "";
    const date = r.round_date ? r.round_date.slice(0, 10) : "?";
    return `${name}${date}`;
  }
  if (key === "winner_member_id") {
    if (row.members != null) return row.members?.full_name ?? "—";
    if (row.winner != null) return row.winner?.full_name ?? "—";
    if (!row.winner_member_id) return "—";
    return row.winner_member_id;
  }
  if (key === "home_member_id" && row.home != null)
    return row.home?.full_name ?? row.home_member_id;
  if (key === "away_member_id" && row.away != null)
    return row.away?.full_name ?? row.away_member_id;
  const v = row[key];
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return JSON.stringify(v);
  }
  return v;
}

function isCompositePk() {
  const pk = entity.value?.primaryKey;
  return Array.isArray(pk) && pk.length > 1;
}

async function loadCampaignFilterOptions() {
  campaignFilterOptions.value = [];
  campaignFilterId.value = "";
  const sb = admin?.client?.value;
  const e = entity.value;
  if (!sb || !e?.filterByCampaign) return;
  let q = sb
    .from("campaigns")
    .select("id,label,year,kind")
    .order("year", { ascending: false });
  if (e.campaignFilterKind) q = q.eq("kind", e.campaignFilterKind);
  const { data, error: qerr } = await q;
  if (qerr) throw qerr;
  campaignFilterOptions.value = data ?? [];
  campaignFilterId.value = data?.[0]?.id ?? "";
}

async function loadRoundPickerOptions() {
  snapshotRoundPickerOptions.value = [];
  snapshotRoundPickerId.value = "";
  const sb = admin?.client?.value;
  const e = entity.value;
  if (!sb || !e?.filterBySelectedRound) return;

  let campIds = null;
  if (e.roundFilterCampaignKind) {
    const { data: camps, error: cErr } = await sb
      .from("campaigns")
      .select("id")
      .eq("kind", e.roundFilterCampaignKind);
    if (cErr) throw cErr;
    campIds = (camps ?? []).map((c) => c.id);
    if (!campIds.length) return;
  }

  let q = sb
    .from("rounds")
    .select("id, name, play_order, round_date, round_type, finalized, campaign_id, campaigns(label)")
    .order("play_order", { ascending: true, nullsFirst: false })
    .order("round_date", { ascending: true })
    .limit(400);
  if (campIds) q = q.in("campaign_id", campIds);
  const { data, error: qerr } = await q;
  if (qerr) throw qerr;
  const list = data ?? [];
  snapshotRoundPickerOptions.value = list.map((r) => {
    const date = r.round_date ? r.round_date.slice(0, 10) : "?";
    const nm = r.name ? `${r.name} · ` : "";
    const fin = r.finalized ? " · done" : "";
    return {
      id: r.id,
      label: `${nm}${date} · ${r.round_type}${fin} · ${r.campaigns?.label ?? "—"}`,
    };
  });
  snapshotRoundPickerId.value = list[0]?.id ?? "";
}

async function loadRows() {
  rows.value = [];
  error.value = "";
  const sb = admin?.client?.value;
  const e = entity.value;
  if (!sb || !e?.table) return;
  if (e.filterByCampaign && !campaignFilterId.value) {
    rows.value = [];
    loading.value = false;
    return;
  }
  if (e.filterBySelectedRound && !snapshotRoundPickerId.value) {
    rows.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    let q = sb.from(e.table).select(e.listSelect ?? "*").limit(500);
    if (e.filterByCampaign && campaignFilterId.value) {
      q = q.eq("campaign_id", campaignFilterId.value);
    }
    if (e.filterBySelectedRound && snapshotRoundPickerId.value) {
      q = q.eq("round_id", snapshotRoundPickerId.value);
    }
    if (e.order) {
      const clauses = Array.isArray(e.order) ? e.order : [e.order];
      for (const o of clauses) {
        const opts = { ascending: o.ascending !== false };
        if (o.nullsFirst !== undefined) opts.nullsFirst = o.nullsFirst;
        if (o.foreignTable) opts.foreignTable = o.foreignTable;
        q = q.order(o.column, opts);
      }
    }
    const { data, error: qerr } = await q;
    if (qerr) throw qerr;
    rows.value = data ?? [];
  } catch (err) {
    error.value = err?.message || String(err);
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadFkOptions() {
  const sb = admin?.client?.value;
  const fields = entity.value?.formFields ?? [];
  if (!sb) return;
  const next = {};
  const errMap = {};
  for (const f of fields) {
    if (f.type !== "fk" || !f.fk) continue;
    const fk = f.fk;
    try {
      if (fk.table === "rounds") {
        let q = sb
          .from("rounds")
          .select("id, name, round_date, round_type, campaigns(label)")
          .order("round_date", { ascending: false })
          .limit(400);
        if (fk.filter) q = q.eq(fk.filter.column, fk.filter.value);
        const { data, error: qerr } = await q;
        if (qerr) throw qerr;
        next[f.key] = (data ?? []).map((r) => {
          const date = r.round_date ? r.round_date.slice(0, 10) : "?";
          const name = r.name ? `${r.name} · ` : "";
          const label = `${name}${date} · ${r.round_type} · ${r.campaigns?.label ?? "—"}`;
          return { value: r.id, label };
        });
        continue;
      }
      let q = sb.from(fk.table).select(
        `${fk.valueKey}, ${fk.labelKey}${fk.subLabelKey ? `, ${fk.subLabelKey}` : ""}`,
      );
      if (fk.filter) q = q.eq(fk.filter.column, fk.filter.value);
      const orderCol = fk.labelKey || fk.valueKey;
      const { data, error: qerr } = await q
        .order(orderCol, { ascending: true })
        .limit(500);
      if (qerr) throw qerr;
      next[f.key] = (data ?? []).map((r) => {
        let label = String(r[fk.labelKey] ?? "");
        if (fk.subLabelKey && r[fk.subLabelKey])
          label += ` (${r[fk.subLabelKey]})`;
        return { value: r[fk.valueKey], label };
      });
    } catch (err) {
      next[f.key] = [];
      errMap[f.key] = err?.message || String(err);
    }
  }
  fkLoadErrors.value = errMap;
  fkOptions.value = next;

  // Auto-default fkAutoDefault fields when creating (only if model value is empty)
  if (dialogMode.value === "create") {
    for (const f of fields) {
      if (!f.fkAutoDefault) continue;
      const opts = next[f.key];
      if (opts?.length && !model.value[f.key]) {
        model.value = { ...model.value, [f.key]: opts[0].value };
      }
    }
  }
}

function initJsonDraft() {
  for (const key of Object.keys(jsonDraft)) delete jsonDraft[key];
  for (const f of entity.value?.formFields ?? []) {
    if (f.type !== "json") continue;
    if (f.hideOnCreate && dialogMode.value === "create") continue;
    const v = model.value[f.key];
    if (
      f.jsonEmptyMeansNull &&
      (v == null || (typeof v === "object" && Object.keys(v).length === 0))
    ) {
      jsonDraft[f.key] = "";
      continue;
    }
    jsonDraft[f.key] =
      typeof v === "object" && v !== null
        ? JSON.stringify(v, null, 2)
        : String(v ?? (f.default !== undefined ? JSON.stringify(f.default) : ""));
  }
}

function blankModel() {
  const m = {};
  const last = lastCreateValues.value;
  for (const f of entity.value?.formFields ?? []) {
    if (f.hideOnCreate) continue;
    // Pre-fill from last create if available, unless the field is a
    // unique/sequential value (numbers default to null so user types fresh).
    if (last[f.key] !== undefined) {
      // Don't carry forward numeric fields — they're usually unique per row.
      if (f.type !== "number") {
        m[f.key] = last[f.key];
        continue;
      }
    }
    if (f.default !== undefined) m[f.key] = f.default;
    else if (f.type === "boolean") m[f.key] = false;
    else if (f.type === "json")
      m[f.key] = f.default !== undefined ? f.default : f.required ? {} : null;
    else if (f.type === "enum" && f.required && f.default === undefined)
      m[f.key] = "";
    else m[f.key] = null;
  }
  return m;
}

function openCreate() {
  dialogMode.value = "create";
  formError.value = "";
  model.value = blankModel();
  if (entity.value?.table === "members" && !model.value.league_effective_from) {
    model.value.league_effective_from = new Date().toISOString().slice(0, 10);
  }
  if (
    entity.value?.filterBySelectedRound &&
    snapshotRoundPickerId.value &&
    (entity.value.formFields ?? []).some((f) => f.key === "round_id")
  ) {
    model.value = { ...model.value, round_id: snapshotRoundPickerId.value };
  }
  initJsonDraft();
  dialogOpen.value = true;
  void loadFkOptions();
}

function sanitizeRawForModel(raw) {
  const e = entity.value;
  const fields = e?.formFields ?? [];
  const pk = e?.primaryKey;
  const out = {};
  for (const f of fields) {
    if (!Object.prototype.hasOwnProperty.call(raw, f.key)) continue;
    const val = raw[f.key];
    if (f.type === "json") {
      out[f.key] =
        val != null && typeof val === "object"
          ? JSON.parse(JSON.stringify(val))
          : val;
      continue;
    }
    if (val !== null && typeof val === "object" && !Array.isArray(val)) continue;
    out[f.key] = val;
  }
  // preserve the PK value(s) for edit operations
  if (typeof pk === "string" && raw[pk] != null) out[pk] = raw[pk];
  if (Array.isArray(pk)) {
    for (const k of pk) {
      const v = raw[k];
      if (v !== undefined && typeof v !== "object") out[k] = v;
    }
  }
  return out;
}

function openEdit(row) {
  dialogMode.value = "edit";
  formError.value = "";
  const raw = { ...row };
  model.value = sanitizeRawForModel(raw);
  initJsonDraft();
  dialogOpen.value = true;
  void loadFkOptions();
}

function closeDialog() {
  dialogOpen.value = false;
}

function coercePayload() {
  const payload = {};
  const fields = entity.value?.formFields ?? [];
  for (const f of fields) {
    if (f.persist === false) continue;
    if (f.hideOnCreate && dialogMode.value === "create") continue;

    if (f.type === "json") {
      const rawStr = jsonDraft[f.key];
      const str =
        typeof rawStr === "string"
          ? rawStr.trim()
          : rawStr == null
            ? ""
            : JSON.stringify(rawStr);
      let v;
      if (f.jsonEmptyMeansNull && (str === "" || str === "null")) v = null;
      else {
        try {
          v = str === "" ? {} : JSON.parse(str);
        } catch {
          throw new Error(`${f.label}: invalid JSON`);
        }
        if (
          f.jsonEmptyMeansNull &&
          v &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          Object.keys(v).length === 0
        )
          v = null;
      }
      payload[f.key] = v;
      continue;
    }

    let v = model.value[f.key];

    if (f.type === "enum" || f.type === "fk") {
      if (f.required && (v === "" || v === undefined || v === null))
        throw new Error(`${f.label} is required`);
    }
    if ((f.type === "text" || f.type === "textarea") && f.required) {
      if (v == null || (typeof v === "string" && !String(v).trim()))
        throw new Error(`${f.label} is required`);
    }

    if (f.type === "number" || f.type === "decimal") {
      if (typeof v === "number" && Number.isNaN(v)) v = null;
      if (v === "" || v === null || v === undefined) {
        if (f.required) throw new Error(`${f.label} is required`);
        v = null;
      } else {
        v = f.type === "decimal" ? Number(v) : parseInt(String(v), 10);
        if (Number.isNaN(v)) throw new Error(`${f.label} is not a valid number`);
      }
      payload[f.key] = v;
      continue;
    }

    if (f.format === "uuid") {
      const s = v == null ? "" : String(v).trim();
      if (!s) v = null;
      else if (!UUID_RE.test(s)) throw new Error(`${f.label}: invalid UUID`);
      else v = s;
    }

    if (f.type === "datetime") {
      if (v === "" || v == null) v = null;
      else if (typeof v === "string") {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) throw new Error(`${f.label}: invalid date/time`);
        v = d.toISOString();
      }
    }

    if (f.type === "date") {
      if (v === "" || v == null) v = null;
      else if (typeof v === "string") v = v.slice(0, 10);
    }

    if (f.type === "fk" && (v === "" || v === undefined)) v = null;

    payload[f.key] = v;
  }
  return payload;
}

async function save() {
  const sb = admin?.client?.value;
  if (!sb) return;
  formError.value = "";
  saving.value = true;
  try {
    const payload = coercePayload();
    const table = entity.value.table;
    const pk = entity.value.primaryKey;

    if (dialogMode.value === "create") {
      const insert = { ...payload };
      // only strip auto-generated uuid id; leave non-id PKs (e.g. round_type) in place
      if (pk === "id" || pk == null) delete insert.id;
      const selectCol = typeof pk === "string" ? pk : "*";
      const { data: inserted, error: qerr } = await sb
        .from(table)
        .insert(insert)
        .select(selectCol)
        .maybeSingle();
      if (qerr) throw qerr;
      // Remember values for the next add (skip nulls so blanks don't persist).
      lastCreateValues.value = Object.fromEntries(
        Object.entries(payload).filter(([, v]) => v !== null && v !== "" && v !== undefined),
      );

      if (
        table === "members" &&
        typeof pk === "string" &&
        inserted?.[pk] &&
        model.value.league_campaign_id
      ) {
        const effRaw = model.value.league_effective_from;
        const effDate =
          effRaw && String(effRaw).trim()
            ? String(effRaw).slice(0, 10)
            : new Date().toISOString().slice(0, 10);
        const { error: laErr } = await sb.from("league_assignments").insert({
          campaign_id: model.value.league_campaign_id,
          member_id: inserted[pk],
          tier: Number(model.value.league_tier ?? 4),
          effective_from: effDate,
        });
        if (laErr) throw laErr;
      }
    } else {
      const updateBody = { ...payload };
      if (isCompositePk()) {
        for (const k of pk) delete updateBody[k];
      } else if (typeof pk === "string") {
        delete updateBody[pk];
      }
      if (isCompositePk()) {
        let q = sb.from(table).update(updateBody);
        for (const k of pk) q = q.eq(k, model.value[k]);
        const { error: qerr } = await q;
        if (qerr) throw qerr;
      } else {
        const pkVal = model.value[pk];
        const { error: qerr } = await sb
          .from(table)
          .update(updateBody)
          .eq(pk, pkVal);
        if (qerr) throw qerr;
      }
    }
    closeDialog();
    await loadRows();
  } catch (e) {
    formError.value = e?.message || String(e);
  } finally {
    saving.value = false;
  }
}

async function removeRow(row) {
  const sb = admin?.client?.value;
  if (!sb) return;
  const table = entity.value.table;
  const pk = entity.value.primaryKey;
  const ok = window.confirm("Delete this row?");
  if (!ok) return;
  try {
    if (isCompositePk()) {
      let q = sb.from(table).delete();
      for (const k of pk) q = q.eq(k, row[k]);
      const { error: qerr } = await q;
      if (qerr) throw qerr;
    } else {
      const { error: qerr } = await sb.from(table).delete().eq(pk, row[pk]);
      if (qerr) throw qerr;
    }
    await loadRows();
  } catch (e) {
    error.value = e?.message || String(e);
  }
}

function enumOptions(enumKey) {
  return ENUMS[enumKey] ?? [];
}

const isReadOnly = computed(() => Boolean(entity.value?.readOnly));

function fieldDisabled(f) {
  if (dialogMode.value !== "edit") return false;
  const pk = entity.value?.primaryKey;
  if (typeof pk === "string" && f.key === pk) return true;
  if (f.key === "id") return true;
  return Boolean(f.immutableOnEdit);
}

function rowKey(row) {
  const pk = entity.value?.primaryKey;
  if (!row || !pk) return String(Math.random());
  if (Array.isArray(pk)) return pk.map((k) => row[k]).join(":");
  return String(row[pk] ?? "");
}

async function runRowAction(action, row) {
  const sb = admin?.client?.value;
  if (!sb) return;
  const key = rowKey(row);
  if (action.confirm && !window.confirm(action.confirm)) return;
  rpcResult.value = null;
  rpcBusy.value = { ...rpcBusy.value, [key]: true };
  try {
    const pkField = entity.value?.primaryKey ?? "id";
    const params = { [action.rpc.paramKey]: row[action.rpc.pkField ?? pkField] };
    const { data, error: rpcErr } = await sb.rpc(action.rpc.name, params);
    if (rpcErr) throw rpcErr;
    const result = typeof data === "object" ? data : { result: data };
    rpcResult.value = { ok: true, action: action.label, data: result };
    await loadRows();
  } catch (e) {
    rpcResult.value = { ok: false, action: action.label, msg: e?.message || String(e) };
  } finally {
    const next = { ...rpcBusy.value };
    delete next[key];
    rpcBusy.value = next;
  }
}

watch(
  () => [admin?.client?.value, route.fullPath],
  async () => {
    closeDialog();
    error.value = "";
    lastCreateValues.value = {}; // clear memory when switching entity
    try {
      if (entity.value?.filterByCampaign) {
        await loadCampaignFilterOptions();
      } else {
        campaignFilterOptions.value = [];
        campaignFilterId.value = "";
      }
      if (entity.value?.filterBySelectedRound) {
        await loadRoundPickerOptions();
      } else {
        snapshotRoundPickerOptions.value = [];
        snapshotRoundPickerId.value = "";
      }
    } catch (err) {
      error.value = err?.message || String(err);
      rows.value = [];
      loading.value = false;
      return;
    }
    await loadRows();
  },
  { immediate: true },
);

const tableColumns = computed(() => {
  const cols = entity.value?.listColumns ?? [];
  if (isReadOnly.value) return cols;
  return [...cols, { key: "_actions", label: "Actions" }];
});

const tableRowsWithActions = computed(() => {
  return displayRows.value.map((r, i) => ({
    ...r,
    _actions: "",
    _raw: rows.value[i],
  }));
});

const formFieldsVisible = computed(() => {
  const fields = entity.value?.formFields ?? [];
  if (dialogMode.value === "create") return fields.filter((f) => !f.hideOnCreate);
  return fields.filter((f) => f.hideOnEdit !== true);
});
</script>

<template>
  <div class="entity-admin" v-if="entity">
    <p class="hint">{{ route.meta?.title }}</p>
    <p class="lead">
      Step {{ route.meta?.step }} —
      <span v-if="isReadOnly">read-only view</span>
      <span v-else>edit the live Supabase tables (service role)</span>.
    </p>
    <div class="toolbar">
      <button
        v-if="!isReadOnly"
        type="button"
        class="btn primary"
        :disabled="!admin?.client?.value"
        @click="openCreate"
      >
        Add row
      </button>
      <button
        type="button"
        class="btn ghost"
        :disabled="!admin?.client?.value || loading"
        @click="loadRows"
      >
        Refresh
      </button>
    </div>
    <div v-if="entity.filterByCampaign" class="campaign-filter-bar">
      <label class="campaign-filter-label">
        Campaign
        <select
          v-model="campaignFilterId"
          class="campaign-filter-select"
          :disabled="!admin?.client?.value || !campaignFilterOptions.length"
          @change="loadRows"
        >
          <option v-for="c in campaignFilterOptions" :key="c.id" :value="c.id">
            {{ c.label }} ({{ c.year }})
          </option>
        </select>
      </label>
      <span v-if="!campaignFilterOptions.length" class="muted">No matching campaigns.</span>
    </div>

    <div v-if="entity.filterBySelectedRound" class="campaign-filter-bar">
      <label class="campaign-filter-label">
        Round
        <select
          v-model="snapshotRoundPickerId"
          class="campaign-filter-select"
          :disabled="!admin?.client?.value || !snapshotRoundPickerOptions.length"
          @change="loadRows"
        >
          <option v-for="o in snapshotRoundPickerOptions" :key="o.id" :value="o.id">
            {{ o.label }}
          </option>
        </select>
      </label>
      <span v-if="!snapshotRoundPickerOptions.length" class="muted">No rounds in scope.</span>
    </div>

    <p v-if="!admin?.client?.value" class="warn">Connect in the header first.</p>

    <div v-if="rpcResult" :class="['rpc-banner', rpcResult.ok ? 'rpc-ok' : 'rpc-err']">
      <strong>{{ rpcResult.action }}:</strong>
      <span v-if="rpcResult.ok && rpcResult.data?.handicaps_restored != null">
        Round reopened ✓ — {{ rpcResult.data.handicaps_restored }} handicap(s) restored.
      </span>
      <span v-else-if="rpcResult.ok">
        {{ rpcResult.data?.tie ? "Tie — pot rolls over. " : "" }}
        {{ rpcResult.data?.entrants }} entrants ·
        pot {{ rpcResult.data?.pot_pence }}p ·
        fines {{ rpcResult.data?.fines_pence ?? 0 }}p ·
        bank {{ rpcResult.data?.bank_pence }}p ·
        paid out {{ rpcResult.data?.paid_out_pence }}p ·
        rollover out {{ rpcResult.data?.rollover_out }}p.
        {{ rpcResult.data?.affects_handicap ? "Handicaps updated. " : "No handicap changes (cup/finals/away). " }}
        Round finalized ✓
      </span>
      <span v-else>{{ rpcResult.msg }}</span>
      <button type="button" class="link" style="margin-left:0.75rem" @click="rpcResult=null">✕</button>
    </div>

    <div class="table-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th v-for="c in tableColumns" :key="c.key">{{ c.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td :colspan="tableColumns.length" class="muted">Loading…</td>
          </tr>
          <tr v-else-if="error">
            <td :colspan="tableColumns.length" class="err">{{ error }}</td>
          </tr>
          <tr v-else-if="!tableRowsWithActions.length">
            <td :colspan="tableColumns.length" class="muted">No rows yet.</td>
          </tr>
          <tr v-for="r in tableRowsWithActions" v-else :key="rowKey(r._raw)">
            <td v-for="c in entity.listColumns" :key="c.key">{{ r[c.key] ?? "—" }}</td>
            <td v-if="!isReadOnly" class="actions">
              <template v-for="act in (entity.rowActions ?? [])" :key="act.key">
                <button
                  v-if="!act.condition || act.condition(r._raw)"
                  type="button"
                  class="link accent"
                  :disabled="rpcBusy[rowKey(r._raw)]"
                  @click="runRowAction(act, r._raw)"
                >{{ rpcBusy[rowKey(r._raw)] ? "…" : act.label }}</button>
              </template>
              <button type="button" class="link" @click="openEdit(r._raw)">Edit</button>
              <button type="button" class="link danger" @click="removeRow(r._raw)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <teleport to="body">
      <div v-if="dialogOpen" class="modal-backdrop" @click.self="closeDialog">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-head">
            <h2>{{ dialogMode === "create" ? "Add" : "Edit" }} — {{ entity.table }}</h2>
            <button type="button" class="icon-x" aria-label="Close" @click="closeDialog">×</button>
          </div>
          <div class="modal-body">
            <p v-if="formError" class="err">{{ formError }}</p>
            <div v-for="f in formFieldsVisible" :key="f.key" class="field">
              <label class="label">{{ f.label }}{{ f.required ? " *" : "" }}</label>
              <p v-if="fkLoadErrors[f.key]" class="fk-err">{{ fkLoadErrors[f.key] }}</p>
              <input
                v-if="f.type === 'text'"
                v-model="model[f.key]"
                class="input"
                type="text"
                :disabled="fieldDisabled(f)"
              />
              <input
                v-else-if="f.type === 'number'"
                v-model.number="model[f.key]"
                class="input"
                type="number"
                :min="f.min"
                :step="f.step || 1"
                :disabled="fieldDisabled(f)"
              />
              <input
                v-else-if="f.type === 'decimal'"
                v-model="model[f.key]"
                class="input"
                type="number"
                :step="f.step ?? 0.1"
                :disabled="fieldDisabled(f)"
              />
              <input
                v-else-if="f.type === 'date'"
                v-model="model[f.key]"
                class="input"
                type="date"
                :disabled="fieldDisabled(f)"
              />
              <input
                v-else-if="f.type === 'datetime'"
                v-model="model[f.key]"
                class="input"
                type="datetime-local"
                :disabled="fieldDisabled(f)"
              />
              <textarea
                v-else-if="f.type === 'textarea'"
                v-model="model[f.key]"
                class="textarea"
                rows="3"
                :disabled="fieldDisabled(f)"
              />
              <textarea
                v-else-if="f.type === 'json'"
                v-model="jsonDraft[f.key]"
                class="textarea mono"
                rows="6"
              />
              <select
                v-else-if="f.type === 'enum'"
                v-model="model[f.key]"
                class="input"
                :disabled="fieldDisabled(f)"
              >
                <option v-if="f.required" disabled value="">— select —</option>
                <option v-for="opt in enumOptions(f.enumKey)" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </select>
              <select
                v-else-if="f.type === 'fk'"
                v-model="model[f.key]"
                class="input"
                :disabled="fieldDisabled(f)"
              >
                <option :value="null">— none —</option>
                <option
                  v-for="opt in fkOptions[f.key] || []"
                  :key="String(opt.value)"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
              <label v-else-if="f.type === 'boolean'" class="check">
                <input v-model="model[f.key]" type="checkbox" :disabled="fieldDisabled(f)" />
                <span>Yes</span>
              </label>
            </div>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn ghost" @click="closeDialog">Cancel</button>
            <button type="button" class="btn primary" :disabled="saving" @click="save">
              {{ saving ? "Saving…" : "Save" }}
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.entity-admin {
  max-width: 1100px;
}
.hint {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.lead {
  margin: 0.25rem 0 1rem;
  color: var(--muted);
  font-size: 0.88rem;
}
.toolbar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.btn {
  border-radius: 8px;
  padding: 0.45rem 0.9rem;
  font-size: 0.85rem;
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
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.warn {
  color: #fcd34d;
  font-size: 0.88rem;
}
.table-wrap {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
th,
td {
  padding: 0.45rem 0.55rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
}
th {
  background: var(--surface);
  color: var(--muted);
  font-size: 0.68rem;
  text-transform: uppercase;
}
.actions {
  white-space: nowrap;
}
.link {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.8rem;
  margin-right: 0.5rem;
}
.link.danger {
  color: #f87171;
}
.err {
  color: #fecaca;
}
.muted {
  color: var(--muted);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 2rem 1rem;
  z-index: 1000;
}
.modal {
  width: min(520px, 100%);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--line);
}
.modal-head h2 {
  margin: 0;
  font-size: 1rem;
}
.icon-x {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
}
.modal-body {
  padding: 1rem;
  overflow-y: auto;
}
.field {
  margin-bottom: 0.85rem;
}
.fk-err {
  margin: 0 0 0.35rem;
  font-size: 0.75rem;
  color: #f87171;
}
.label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 0.25rem;
}
.input,
.textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.45rem 0.55rem;
  background: var(--bg);
  color: var(--text);
  font-size: 0.88rem;
}
.textarea {
  resize: vertical;
}
.mono {
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.88rem;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--line);
}
.link.accent {
  color: #60a5fa;
  font-weight: 600;
}
.active-round-bar {
  margin-bottom: 0.6rem;
  padding: 0.45rem 0.75rem;
  border-radius: 8px;
  font-size: 0.83rem;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
}
.campaign-filter-bar {
  margin-bottom: 0.6rem;
  padding: 0.45rem 0.75rem;
  border-radius: 8px;
  font-size: 0.83rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
}
.campaign-filter-label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.campaign-filter-select {
  min-width: 12rem;
  padding: 0.25rem 0.45rem;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--panel);
  color: inherit;
  font-size: 0.85rem;
}
.rpc-banner {
  margin: 0 0 0.75rem;
  padding: 0.6rem 0.85rem;
  border-radius: 8px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.rpc-ok  { background: #163b24; color: #86efac; border: 1px solid #166534; }
.rpc-err { background: #3b1212; color: #fca5a5; border: 1px solid #991b1b; }
</style>
