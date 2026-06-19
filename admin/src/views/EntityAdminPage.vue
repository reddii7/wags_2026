<script setup>
import { ref, watch, inject, computed, reactive, onBeforeUnmount } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { ENUMS } from "@/config/entityAdminConfig.js";
import {
  pickDefaultRoundId,
  mapRoundOptions,
  scoredMemberIdsFromRows,
  isDuplicateKeyError,
  friendlyDuplicateScoreMessage,
  loadCampaignRoster,
  loadActiveMembers,
  checkRoundFinalizeReady,
  setActiveCampaignId,
} from "@/composables/useRoundScores.js";

const admin = inject("adminCtx");
const route = useRoute();
const router = useRouter();

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
const notice = ref(null);
let noticeTimer = null;
const confirmDialog = reactive({
  open: false,
  title: "",
  message: "",
  detail: "",
  confirmLabel: "Continue",
  cancelLabel: "Cancel",
  tone: "default",
  resolve: null,
});

// Remember last-used create values per table so repeat adds are fast.
// Keyed by table name; reset when navigating to a different entity.
const lastCreateValues = ref({});

/** When entity.filterByCampaign — scope standings-style views to one campaign */
const campaignFilterId = ref("");
const campaignFilterOptions = ref([]);

/** When entity.filterBySelectedRound — scope list to one round (dropdown) */
const snapshotRoundPickerId = ref("");
const snapshotRoundPickerOptions = ref([]);
const rosterMembers = ref([]);
const tableSearch = ref("");
const tableDensity = ref(localStorage.getItem("wags_admin_table_density") || "comfortable");
const tableSort = reactive({ key: "", dir: "asc" });

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

function cellSearchText(value) {
  if (value == null) return "";
  return String(value).toLowerCase();
}

function compareCellValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  const aNum = typeof a === "number" ? a : Number(String(a).replace(/,/g, ""));
  const bNum = typeof b === "number" ? b : Number(String(b).replace(/,/g, ""));
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;

  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function isSortableColumn(column) {
  return column?.key && column.key !== "_actions";
}

function toggleSort(column) {
  if (!isSortableColumn(column)) return;
  if (tableSort.key === column.key) {
    tableSort.dir = tableSort.dir === "asc" ? "desc" : "asc";
    return;
  }
  tableSort.key = column.key;
  tableSort.dir = "asc";
}

function sortLabel(column) {
  if (!isSortableColumn(column)) return undefined;
  if (tableSort.key !== column.key) return `Sort by ${column.label}`;
  return `Sorted ${tableSort.dir === "asc" ? "ascending" : "descending"} by ${column.label}`;
}

function ariaSort(column) {
  if (!isSortableColumn(column) || tableSort.key !== column.key) return "none";
  return tableSort.dir === "asc" ? "ascending" : "descending";
}

function setTableDensity(value) {
  tableDensity.value = value;
  localStorage.setItem("wags_admin_table_density", value);
}

function showNotice(message, tone = "ok") {
  notice.value = { message, tone };
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = null;
    noticeTimer = null;
  }, 4200);
}

function askConfirm({
  title,
  message,
  detail = "",
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  tone = "default",
}) {
  return new Promise((resolve) => {
    confirmDialog.title = title;
    confirmDialog.message = message;
    confirmDialog.detail = detail;
    confirmDialog.confirmLabel = confirmLabel;
    confirmDialog.cancelLabel = cancelLabel;
    confirmDialog.tone = tone;
    confirmDialog.resolve = resolve;
    confirmDialog.open = true;
  });
}

function closeConfirm(answer) {
  const resolve = confirmDialog.resolve;
  confirmDialog.open = false;
  confirmDialog.resolve = null;
  if (resolve) resolve(answer);
}

function rowSummary(row) {
  const cols = entity.value?.listColumns ?? [];
  const parts = cols
    .map((c) => flattenCell(row, c.key))
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map((v) => String(v))
    .slice(0, 3);
  return parts.join(" · ") || rowKey(row);
}

onBeforeUnmount(() => {
  if (noticeTimer) clearTimeout(noticeTimer);
});

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
  snapshotRoundPickerOptions.value = mapRoundOptions(list);
  const preferred = pickDefaultRoundId(list);
  const stillValid = list.some((r) => r.id === snapshotRoundPickerId.value);
  snapshotRoundPickerId.value = stillValid
    ? snapshotRoundPickerId.value
    : preferred || list[0]?.id || "";
  const opt = snapshotRoundPickerOptions.value.find((o) => o.id === snapshotRoundPickerId.value);
  if (opt?.campaignId) setActiveCampaignId(opt.campaignId);
}

async function loadScoreRoster() {
  rosterMembers.value = [];
  if (!entity.value?.scoreEntry || !admin?.client?.value) return;
  const campId = selectedRoundOption.value?.campaignId;
  try {
    if (campId) {
      const { roster } = await loadCampaignRoster(admin.client.value, campId);
      rosterMembers.value = roster;
    } else {
      rosterMembers.value = await loadActiveMembers(admin.client.value);
    }
  } catch {
    rosterMembers.value = [];
  }
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
      const scored =
        entity.value?.excludeScoredMembersOnCreate &&
        f.key === "member_id" &&
        dialogMode.value === "create" &&
        entity.value?.table === "round_players"
          ? scoredMemberIdsFromRows(rows.value)
          : null;

      next[f.key] = (data ?? []).map((r) => {
        let label = String(r[fk.labelKey] ?? "");
        if (fk.subLabelKey && r[fk.subLabelKey])
          label += ` (${r[fk.subLabelKey]})`;
        const value = r[fk.valueKey];
        const already = scored?.has(String(value));
        if (already) label += " (already scored — use Edit)";
        return { value, label, disabled: Boolean(already) };
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
  if (entity.value?.lockWhenRoundFinalized && roundIsFinalized.value) {
    showNotice(
      "This round is finalized. Reopen it on Rounds before adding scores.",
      "warning",
    );
    return;
  }
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
  if (entity.value?.lockWhenRoundFinalized && roundIsFinalized.value) {
    showNotice(
      "This round is finalized. Reopen it on Rounds before editing scores.",
      "warning",
    );
    return;
  }
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

  if (entity.value?.table === "rounds") {
    const weekMatch = String(payload.name || "").match(/week\s+(\d+)/i);
    if (
      (payload.play_order == null || payload.play_order === undefined) &&
      weekMatch
    ) {
      payload.play_order = parseInt(weekMatch[1], 10);
    }
    if (
      String(payload.round_type || "") === "summer_weekly" &&
      !(Number(payload.play_order) > 0)
    ) {
      throw new Error(
        "Play # is required for weekly rounds (e.g. 7 for Week 07). It drives Home and Results week labels.",
      );
    }
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
      // Optional number fields left blank must not erase existing DB values on edit.
      if (table === "rounds" && updateBody.play_order == null) {
        delete updateBody.play_order;
      }
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
    showNotice(
      `${route.meta?.title || entity.value.table} row ${
        dialogMode.value === "create" ? "created" : "updated"
      }.`,
    );
  } catch (e) {
    formError.value = isDuplicateKeyError(e)
      ? friendlyDuplicateScoreMessage()
      : e?.message || String(e);
  } finally {
    saving.value = false;
  }
}

async function removeRow(row) {
  if (entity.value?.lockWhenRoundFinalized && roundIsFinalized.value) {
    showNotice("This round is finalized. Reopen it before deleting scores.", "warning");
    return;
  }
  const sb = admin?.client?.value;
  if (!sb) return;
  const table = entity.value.table;
  const pk = entity.value.primaryKey;
  const ok = await askConfirm({
    title: "Delete row?",
    message: "This will permanently delete the selected row from the live Supabase table.",
    detail: rowSummary(row),
    confirmLabel: "Delete row",
    tone: "danger",
  });
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
    showNotice("Row deleted.");
  } catch (e) {
    error.value = e?.message || String(e);
    showNotice(error.value, "danger");
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

  if (action.key === "finalize" && entity.value?.table === "rounds") {
    try {
      const check = await checkRoundFinalizeReady(sb, row);
      if (!check.ok) {
        const names = [...check.missing, ...check.incomplete];
        const bulletList = names
          .slice(0, 12)
          .map((m) => `• ${m.fullName}`)
          .join("\n");
        const more =
          names.length > 12 ? `\n…and ${names.length - 12} more` : "";
        const override = await askConfirm({
          title: "Finalize incomplete round?",
          message:
            `Scores look incomplete for "${row.name || "this round"}". ` +
            `${check.summary}. Enter scores first if possible.`,
          detail: bulletList
            ? `${bulletList}${more}\n\nFinalizing anyway may make handicaps and prize money wrong.`
            : "Finalizing anyway may make handicaps and prize money wrong.",
          confirmLabel: "Finalize anyway",
          tone: "danger",
        });
        if (!override) return;
      }
    } catch (e) {
      const override = await askConfirm({
        title: "Finalize without verification?",
        message: `Could not verify scores (${e?.message || String(e)}).`,
        detail: "Only continue if you have manually checked that the round is ready.",
        confirmLabel: "Finalize anyway",
        tone: "danger",
      });
      if (!override) return;
    }
  }

  if (
    action.confirm &&
    !(await askConfirm({
      title: `${action.label}?`,
      message: action.confirm,
      confirmLabel: action.label,
      tone: action.key === "finalize" ? "danger" : "default",
    }))
  ) {
    return;
  }
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
    showNotice(`${action.label} complete.`);
  } catch (e) {
    rpcResult.value = { ok: false, action: action.label, msg: e?.message || String(e) };
    showNotice(rpcResult.value.msg, "danger");
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
    tableSearch.value = "";
    tableSort.key = "";
    tableSort.dir = "asc";
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
    await loadScoreRoster();
  },
  { immediate: true },
);

watch(snapshotRoundPickerId, async () => {
  const opt = snapshotRoundPickerOptions.value.find((o) => o.id === snapshotRoundPickerId.value);
  if (opt?.campaignId) setActiveCampaignId(opt.campaignId);
  await loadScoreRoster();
});

const isScoreEntry = computed(() => Boolean(entity.value?.scoreEntry));

const selectedRoundOption = computed(() =>
  snapshotRoundPickerOptions.value.find((o) => o.id === snapshotRoundPickerId.value),
);

const roundIsFinalized = computed(() => Boolean(selectedRoundOption.value?.finalized));

const canModifyScores = computed(() => !isScoreEntry.value || !roundIsFinalized.value);

const scoreProgress = computed(() => {
  if (!isScoreEntry.value) return null;
  const scored = rows.value.length;
  const roster = rosterMembers.value.length;
  const missing =
    roster > 0 ? rosterMembers.value.filter((m) => !rows.value.some((r) => r.member_id === m.memberId)).length : null;
  return { scored, roster, missing };
});

function rowStatusClass(raw) {
  if (!isScoreEntry.value || !raw) return "";
  if (raw.disqualified) return "row-dq";
  if (raw.stableford_points != null && raw.stableford_points !== "") return "row-scored";
  if (raw.entered) return "row-incomplete";
  return "";
}

function goToScoreEntry() {
  router.push({
    path: "/manage/score-entry",
    query: snapshotRoundPickerId.value ? { round: snapshotRoundPickerId.value } : {},
  });
}

const tableColumns = computed(() => {
  const cols = entity.value?.listColumns ?? [];
  if (isReadOnly.value) return cols;
  return [...cols, { key: "_actions", label: "Actions" }];
});

const filteredSortedRowPairs = computed(() => {
  const cols = entity.value?.listColumns ?? [];
  const query = tableSearch.value.trim().toLowerCase();
  const pairs = displayRows.value.map((display, i) => ({
    display,
    raw: rows.value[i],
  }));

  const filtered = query
    ? pairs.filter(({ display }) =>
        cols.some((c) => cellSearchText(display[c.key]).includes(query)),
      )
    : pairs;

  if (!tableSort.key) return filtered;

  const direction = tableSort.dir === "desc" ? -1 : 1;
  return [...filtered].sort((a, b) => {
    const compared = compareCellValues(a.display[tableSort.key], b.display[tableSort.key]);
    return compared * direction;
  });
});

const tableRowsWithActions = computed(() => {
  return filteredSortedRowPairs.value.map(({ display, raw }) => ({
    ...display,
    _actions: "",
    _raw: raw,
  }));
});

const tableResultSummary = computed(() => {
  const total = rows.value.length;
  const visible = tableRowsWithActions.value.length;
  if (loading.value) return "Loading rows";
  if (!total) return "No loaded rows";
  if (visible === total) return `${total} row${total === 1 ? "" : "s"}`;
  return `${visible} of ${total} row${total === 1 ? "" : "s"}`;
});

const emptyTableMessage = computed(() =>
  tableSearch.value.trim() && rows.value.length
    ? "No rows match your search."
    : "No rows yet.",
);

const formFieldsVisible = computed(() => {
  const fields = entity.value?.formFields ?? [];
  if (dialogMode.value === "create") return fields.filter((f) => !f.hideOnCreate);
  return fields.filter((f) => f.hideOnEdit !== true);
});
</script>

<template>
  <div class="entity-admin" v-if="entity">
    <p v-if="route.meta?.step" class="hint">{{ route.meta?.title }}</p>
    <p class="lead">
      <span v-if="isReadOnly">Read-only view.</span>
      <span v-else-if="isScoreEntry">
        Advanced table view. Prefer
        <button type="button" class="link accent" @click="goToScoreEntry">Enter scores</button>
        for weekly entry.
      </span>
      <span v-else>Edit live Supabase tables (service role).</span>
    </p>

    <div
      v-if="isScoreEntry && snapshotRoundPickerId"
      :class="['status-banner', roundIsFinalized ? 'banner-finalized' : 'banner-scores']"
    >
      <template v-if="roundIsFinalized">
        <strong>Finalized.</strong> Scores are locked. Reopen on
        <RouterLink to="/manage/6-rounds">Rounds</RouterLink> to edit.
      </template>
      <template v-else-if="scoreProgress">
        <strong>{{ selectedRoundOption?.label }}</strong>
        · {{ scoreProgress.scored }} scored
        <template v-if="scoreProgress.roster">
          / {{ scoreProgress.roster }} in roster
          <template v-if="scoreProgress.missing">
            · <span class="banner-warn">{{ scoreProgress.missing }} missing</span>
          </template>
        </template>
      </template>
    </div>

    <div class="toolbar">
      <button
        v-if="isScoreEntry"
        type="button"
        class="btn primary"
        :disabled="!admin?.client?.value"
        @click="goToScoreEntry"
      >
        Enter scores
      </button>
      <button
        v-if="!isReadOnly"
        type="button"
        class="btn"
        :class="{ primary: !isScoreEntry }"
        :disabled="!admin?.client?.value || !canModifyScores"
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

    <div class="grid-controls" aria-label="Table controls">
      <label class="grid-search">
        <span class="sr-only">Search rows</span>
        <input
          v-model="tableSearch"
          class="grid-search-input"
          type="search"
          placeholder="Search visible rows"
          autocomplete="off"
        />
      </label>
      <button
        v-if="tableSearch"
        type="button"
        class="btn ghost compact-btn"
        @click="tableSearch = ''"
      >
        Clear
      </button>
      <div class="density-toggle" aria-label="Table density">
        <button
          type="button"
          :class="['density-btn', tableDensity === 'comfortable' ? 'active' : '']"
          @click="setTableDensity('comfortable')"
        >
          Comfortable
        </button>
        <button
          type="button"
          :class="['density-btn', tableDensity === 'compact' ? 'active' : '']"
          @click="setTableDensity('compact')"
        >
          Compact
        </button>
      </div>
      <span class="grid-count" aria-live="polite">{{ tableResultSummary }}</span>
    </div>

    <div :class="['table-wrap', `density-${tableDensity}`]">
      <table class="tbl">
        <thead>
          <tr>
            <th
              v-for="c in tableColumns"
              :key="c.key"
              :aria-sort="ariaSort(c)"
              :class="{ sortable: isSortableColumn(c), sorted: tableSort.key === c.key }"
            >
              <button
                v-if="isSortableColumn(c)"
                type="button"
                class="sort-btn"
                :aria-label="sortLabel(c)"
                @click="toggleSort(c)"
              >
                <span>{{ c.label }}</span>
                <span class="sort-indicator" aria-hidden="true">
                  {{ tableSort.key === c.key ? (tableSort.dir === "asc" ? "↑" : "↓") : "↕" }}
                </span>
              </button>
              <span v-else>{{ c.label }}</span>
            </th>
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
            <td :colspan="tableColumns.length" class="muted">{{ emptyTableMessage }}</td>
          </tr>
          <tr
            v-for="r in tableRowsWithActions"
            v-else
            :key="rowKey(r._raw)"
            :class="rowStatusClass(r._raw)"
          >
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
              <button
                type="button"
                class="link"
                :disabled="!canModifyScores"
                @click="openEdit(r._raw)"
              >
                Edit
              </button>
              <button
                type="button"
                class="link danger"
                :disabled="!canModifyScores"
                @click="removeRow(r._raw)"
              >
                Delete
              </button>
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
                  :disabled="opt.disabled"
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

    <teleport to="body">
      <div v-if="confirmDialog.open" class="confirm-backdrop" @click.self="closeConfirm(false)">
        <div
          class="confirm-card"
          :class="`tone-${confirmDialog.tone}`"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-message"
        >
          <div class="confirm-icon" aria-hidden="true">
            {{ confirmDialog.tone === "danger" ? "!" : "?" }}
          </div>
          <div class="confirm-content">
            <h2 id="confirm-title">{{ confirmDialog.title }}</h2>
            <p id="confirm-message">{{ confirmDialog.message }}</p>
            <p v-if="confirmDialog.detail" class="confirm-detail">{{ confirmDialog.detail }}</p>
          </div>
          <div class="confirm-actions">
            <button type="button" class="btn ghost" @click="closeConfirm(false)">
              {{ confirmDialog.cancelLabel }}
            </button>
            <button
              type="button"
              :class="['btn', confirmDialog.tone === 'danger' ? 'danger' : 'primary']"
              @click="closeConfirm(true)"
            >
              {{ confirmDialog.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </teleport>

    <teleport to="body">
      <Transition name="toast">
        <div v-if="notice" :class="['toast', `tone-${notice.tone}`]" role="status" aria-live="polite">
          {{ notice.message }}
        </div>
      </Transition>
    </teleport>
  </div>
</template>

<style scoped>
.entity-admin {
  max-width: 1180px;
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
  margin: 0.25rem 0 1.1rem;
  color: var(--muted);
  font-size: 0.88rem;
}
.status-banner {
  margin: 0 0 0.75rem;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-md);
  font-size: 0.84rem;
  line-height: 1.45;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-soft);
}

.banner-scores {
  background: color-mix(in srgb, var(--accent) 10%, var(--panel));
}

.banner-finalized {
  background: color-mix(in srgb, var(--danger) 12%, var(--panel));
  color: var(--danger);
}

.banner-warn {
  color: var(--warning);
  font-weight: 600;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.9rem;
}

.tbl tbody tr.row-scored {
  opacity: 0.72;
}

.tbl tbody tr.row-incomplete {
  background: color-mix(in srgb, var(--warning) 8%, transparent);
}

.tbl tbody tr.row-dq {
  opacity: 0.55;
  text-decoration: line-through;
}
.btn {
  border-radius: var(--radius-md);
  padding: 0.52rem 0.95rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--text);
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    transform 0.16s ease;
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}
.btn.danger {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn:not(:disabled):hover {
  border-color: var(--line-strong);
  background: var(--panel-strong);
  transform: translateY(-1px);
}
.btn.primary:not(:disabled):hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.btn.danger:not(:disabled):hover {
  background: color-mix(in srgb, var(--danger) 86%, #000);
  border-color: color-mix(in srgb, var(--danger) 86%, #000);
}
.btn.ghost:not(:disabled):hover {
  background: var(--panel-strong);
}
.compact-btn {
  padding: 0.45rem 0.7rem;
}
.warn {
  display: inline-flex;
  align-items: center;
  min-height: 2.25rem;
  padding: 0.55rem 0.8rem;
  border: 1px solid color-mix(in srgb, var(--warning) 32%, var(--line));
  border-radius: var(--radius-md);
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 0.88rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.grid-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
  margin: 0 0 0.75rem;
}
.grid-search {
  flex: 1 1 16rem;
  max-width: 28rem;
}
.grid-search-input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 0.52rem 0.75rem;
  background: var(--panel);
  color: var(--text);
  font-size: 0.86rem;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}
.grid-search-input::placeholder {
  color: var(--muted);
}
.grid-search-input:focus {
  border-color: color-mix(in srgb, var(--accent) 52%, var(--line));
  box-shadow: 0 0 0 3px var(--focus-ring);
}
.density-toggle {
  display: inline-flex;
  align-items: center;
  padding: 0.18rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
}
.density-btn {
  border: 0;
  border-radius: 999px;
  padding: 0.32rem 0.6rem;
  background: transparent;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.density-btn.active {
  background: color-mix(in srgb, var(--accent) 16%, var(--panel));
  color: var(--text);
}
.grid-count {
  margin-left: auto;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 700;
}
.table-wrap {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
th,
td {
  padding: 0.58rem 0.7rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
}
th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: color-mix(in srgb, var(--panel-strong) 92%, var(--accent));
  color: var(--muted);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
th.sortable {
  padding: 0;
}
.sort-btn {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  min-height: 2.35rem;
  padding: 0.58rem 0.7rem;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 800;
  text-align: left;
  text-transform: inherit;
  letter-spacing: inherit;
  cursor: pointer;
}
.sort-btn:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.sort-indicator {
  color: var(--muted);
  font-size: 0.72rem;
}
th.sorted .sort-indicator {
  color: var(--accent);
}
.density-compact td {
  padding: 0.36rem 0.55rem;
}
.density-compact .sort-btn {
  min-height: 1.95rem;
  padding: 0.4rem 0.55rem;
}
.tbl tbody tr {
  transition: background 0.14s ease;
}
.tbl tbody tr:hover {
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}
.tbl tbody tr:last-child td {
  border-bottom: none;
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
  border-radius: 6px;
  padding: 0.12rem 0.16rem;
}
.link.danger {
  color: var(--danger);
}
.err {
  color: var(--danger);
}
.muted {
  color: var(--muted);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 2rem 1rem;
  z-index: 1000;
}
.modal {
  width: min(580px, 100%);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.9rem 1rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel-strong) 76%, transparent);
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
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.input,
.textarea {
  width: 100%;
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
.input:focus,
.textarea:focus {
  border-color: color-mix(in srgb, var(--accent) 52%, var(--line));
  box-shadow: 0 0 0 3px var(--focus-ring);
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
  padding: 0.85rem 1rem;
  border-top: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel-strong) 60%, transparent);
}
.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(8px);
}
.confirm-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.9rem;
  width: min(480px, 100%);
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow);
}
.confirm-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, var(--panel));
  color: var(--accent);
  font-weight: 900;
}
.confirm-card.tone-danger .confirm-icon {
  background: var(--danger-soft);
  color: var(--danger);
}
.confirm-content h2 {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  letter-spacing: -0.01em;
}
.confirm-content p {
  margin: 0;
  color: var(--muted-strong);
  font-size: 0.88rem;
  line-height: 1.45;
}
.confirm-detail {
  margin-top: 0.75rem !important;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--panel-strong) 70%, transparent);
  color: var(--text) !important;
  white-space: pre-line;
}
.confirm-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 0.2rem;
}
.toast {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 1200;
  max-width: min(26rem, calc(100vw - 2rem));
  padding: 0.75rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--ok) 36%, var(--line));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ok) 12%, var(--panel));
  color: var(--text);
  box-shadow: var(--shadow);
  font-size: 0.88rem;
  font-weight: 650;
}
.toast.tone-warning {
  border-color: color-mix(in srgb, var(--warning) 42%, var(--line));
  background: color-mix(in srgb, var(--warning) 14%, var(--panel));
}
.toast.tone-danger {
  border-color: color-mix(in srgb, var(--danger) 42%, var(--line));
  background: color-mix(in srgb, var(--danger) 13%, var(--panel));
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.link.accent {
  color: var(--accent);
  font-weight: 600;
}
.active-round-bar {
  margin-bottom: 0.6rem;
  padding: 0.6rem 0.8rem;
  border-radius: var(--radius-md);
  font-size: 0.83rem;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
}
.campaign-filter-bar {
  margin-bottom: 0.75rem;
  padding: 0.6rem 0.8rem;
  border-radius: var(--radius-md);
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
  padding: 0.4rem 0.55rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  background: var(--panel);
  color: inherit;
  font-size: 0.85rem;
}
.rpc-banner {
  margin: 0 0 0.75rem;
  padding: 0.7rem 0.9rem;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.rpc-ok  { background: var(--ok-soft); color: var(--ok); border: 1px solid color-mix(in srgb, var(--ok) 42%, var(--line)); }
.rpc-err { background: var(--danger-soft); color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 42%, var(--line)); }
</style>
