<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { supabase } from "./lib/supabase.js";

const session = ref(null);
const scorer = ref(null);
const rounds = ref([]);
const roundId = ref("");
const roundDetail = ref(null);
const roster = ref([]);
const drafts = ref({});
const baselines = ref({});
const pointsRefs = ref({});

const authEmail = ref("");
const authPassword = ref("");
const authLoading = ref(false);
const bootLoading = ref(true);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const success = ref("");
const search = ref("");
const filter = ref("all");

function emptyDraft() {
  return { points: "", rowId: null };
}

function draftFromScore(existing) {
  if (!existing) return emptyDraft();
  return {
    points: existing.stableford_points ?? "",
    rowId: existing.id ?? null,
  };
}

function cloneDraft(draft) {
  return {
    points: draft?.points === "" || draft?.points == null ? "" : Number(draft.points),
    rowId: draft?.rowId ?? null,
  };
}

function normalizePoints(value) {
  if (value === "" || value == null) return null;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

function isDirty(memberId) {
  const a = normalizePoints(drafts.value[memberId]?.points);
  const b = normalizePoints(baselines.value[memberId]?.points);
  return a !== b;
}

function hasPoints(memberId) {
  return normalizePoints(drafts.value[memberId]?.points) != null;
}

function isPersisted(memberId) {
  return baselines.value[memberId]?.rowId != null
    || normalizePoints(baselines.value[memberId]?.points) != null;
}

const roundOptions = computed(() =>
  (rounds.value || []).map((r) => {
    const date = r.round_date ? String(r.round_date).slice(0, 10) : "?";
    const name = r.name ? `${r.name} · ` : "";
    const fin = r.finalized ? " · done" : "";
    const camp = r.campaign_label || "Winter";
    return {
      id: r.id,
      label: `${name}${date}${fin} · ${camp}`,
      finalized: Boolean(r.finalized),
      raw: r,
    };
  }),
);

const roundFinalized = computed(() => Boolean(roundDetail.value?.finalized));

const dirtyMemberIds = computed(() =>
  roster.value.filter((m) => isDirty(m.memberId)).map((m) => m.memberId),
);

const dirtyCount = computed(() => dirtyMemberIds.value.length);

const saveableDirtyMembers = computed(() =>
  roster.value.filter((m) => isDirty(m.memberId) && hasPoints(m.memberId)),
);

const progress = computed(() => {
  const total = roster.value.length;
  const entered = roster.value.filter((m) => hasPoints(m.memberId)).length;
  const saved = roster.value.filter((m) => isPersisted(m.memberId)).length;
  return {
    total,
    entered,
    saved,
    missingEntered: Math.max(0, total - entered),
  };
});

const displayList = computed(() => {
  const q = search.value.trim().toLowerCase();
  return roster.value.filter((m) => {
    if (filter.value === "unsaved" && !isDirty(m.memberId)) return false;
    if (filter.value === "missing" && isPersisted(m.memberId) && !isDirty(m.memberId)) {
      return false;
    }
    if (filter.value === "scored" && !isPersisted(m.memberId)) return false;
    if (q && !m.fullName.toLowerCase().includes(q)) return false;
    return true;
  });
});

function rowStatus(memberId) {
  if (isDirty(memberId)) return "edited";
  if (isPersisted(memberId)) return "saved";
  return "";
}

function setPointsRef(memberId, el) {
  if (el) pointsRefs.value[memberId] = el;
  else delete pointsRefs.value[memberId];
}

function focusMemberPoints(memberId) {
  const el = pointsRefs.value[memberId];
  if (!el) return;
  el.focus();
  el.select();
}

function getNextFocusTarget(memberId) {
  const list = displayList.value.length ? displayList.value : roster.value;
  if (!list.length) return null;
  const i = list.findIndex((m) => m.memberId === memberId);
  if (i < 0) return list[0];
  return list[(i + 1) % list.length];
}

async function onPointsEnter(member) {
  if (roundFinalized.value || saving.value) return;
  const next = getNextFocusTarget(member.memberId);
  if (!next || next.memberId === member.memberId) return;
  await nextTick();
  focusMemberPoints(next.memberId);
}

async function focusFirstMissing() {
  await nextTick();
  const first = roster.value.find((m) => !hasPoints(m.memberId));
  if (first) focusMemberPoints(first.memberId);
}

function friendlyError(err) {
  const msg = err?.message || String(err);
  if (/Winter scorer access required/i.test(msg)) {
    return "This account is not a Winter scorer. Ask admin to enable Winter scorer on your member row.";
  }
  if (/Sign in required/i.test(msg)) return "Sign in required.";
  if (/finalized/i.test(msg)) return msg;
  return msg;
}

async function bootstrapSession() {
  error.value = "";
  const { data, error: rpcErr } = await supabase.rpc("winter_scorer_session");
  if (rpcErr) throw rpcErr;
  scorer.value = data?.scorer || null;
  rounds.value = data?.rounds || [];
  if (!roundId.value || !rounds.value.some((r) => r.id === roundId.value)) {
    const open = rounds.value.find((r) => !r.finalized);
    roundId.value = open?.id || rounds.value[0]?.id || "";
  }
}

async function loadSheet({ preserveDirty = false } = {}) {
  if (!roundId.value) {
    roster.value = [];
    roundDetail.value = null;
    if (!preserveDirty) {
      drafts.value = {};
      baselines.value = {};
    }
    return;
  }
  loading.value = true;
  if (!preserveDirty) {
    error.value = "";
    success.value = "";
  }
  try {
    const { data, error: rpcErr } = await supabase.rpc("winter_scorer_get_sheet", {
      p_round_id: roundId.value,
    });
    if (rpcErr) throw rpcErr;

    roundDetail.value = data?.round || null;
    const scoreByMember = new Map(
      (data?.scores || []).map((s) => [String(s.member_id), s]),
    );
    roster.value = (data?.roster || []).map((m) => ({
      memberId: m.member_id,
      fullName: m.full_name,
    }));

    const nextDrafts = {};
    const nextBaselines = {};
    for (const m of roster.value) {
      const existing = scoreByMember.get(String(m.memberId));
      const loaded = draftFromScore(existing);
      nextBaselines[m.memberId] = cloneDraft(loaded);
      if (
        preserveDirty &&
        drafts.value[m.memberId] &&
        isDirty(m.memberId)
      ) {
        nextDrafts[m.memberId] = {
          ...drafts.value[m.memberId],
          rowId: loaded.rowId ?? drafts.value[m.memberId].rowId,
        };
      } else {
        nextDrafts[m.memberId] = loaded;
      }
    }
    drafts.value = nextDrafts;
    baselines.value = nextBaselines;
  } catch (e) {
    error.value = friendlyError(e);
    roster.value = [];
    roundDetail.value = null;
  } finally {
    loading.value = false;
  }
}

async function refreshAll() {
  await bootstrapSession();
  await loadSheet();
}

function discardChanges() {
  if (!dirtyCount.value) return;
  if (!window.confirm(`Discard ${dirtyCount.value} unsaved change${dirtyCount.value === 1 ? "" : "s"}?`)) {
    return;
  }
  const next = {};
  for (const m of roster.value) {
    next[m.memberId] = {
      ...baselines.value[m.memberId],
      points: baselines.value[m.memberId]?.points ?? "",
    };
  }
  drafts.value = next;
  success.value = "";
  error.value = "";
}

async function saveAll() {
  if (roundFinalized.value || saving.value || !roundId.value) return;
  const members = saveableDirtyMembers.value;
  if (!members.length) {
    error.value = dirtyCount.value
      ? "Enter net points on edited rows before saving."
      : "No unsaved changes.";
    return;
  }

  const payloads = members.map((m) => ({
    member_id: m.memberId,
    stableford_points: normalizePoints(drafts.value[m.memberId]?.points),
    entry_fee_pence: 500,
  }));

  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    const { data, error: rpcErr } = await supabase.rpc("winter_scorer_upsert_scores", {
      p_round_id: roundId.value,
      p_scores: payloads,
    });
    if (rpcErr) throw rpcErr;
    await loadSheet();
    success.value = `Saved ${data?.saved ?? payloads.length} score${(data?.saved ?? payloads.length) === 1 ? "" : "s"}.`;
  } catch (e) {
    error.value = friendlyError(e);
  } finally {
    saving.value = false;
  }
}

async function signIn() {
  authLoading.value = true;
  error.value = "";
  success.value = "";
  try {
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: authEmail.value.trim(),
      password: authPassword.value,
    });
    if (authErr) throw authErr;
  } catch (e) {
    error.value = friendlyError(e);
  } finally {
    authLoading.value = false;
  }
}

async function signOut() {
  await supabase.auth.signOut();
  session.value = null;
  scorer.value = null;
  rounds.value = [];
  roundId.value = "";
  roster.value = [];
  drafts.value = {};
  baselines.value = {};
  authPassword.value = "";
}

function confirmLeaveIfDirty() {
  if (!dirtyCount.value || roundFinalized.value) return true;
  return window.confirm(
    `You have ${dirtyCount.value} unsaved score change${dirtyCount.value === 1 ? "" : "s"}. Leave without saving?`,
  );
}

function onBeforeUnload(e) {
  if (!dirtyCount.value || roundFinalized.value) return;
  e.preventDefault();
  e.returnValue = "";
}

let suppressRoundWatch = false;
watch(roundId, async (next, prev) => {
  if (suppressRoundWatch || !session.value || !scorer.value) return;
  if (prev && next !== prev && dirtyCount.value) {
    if (!confirmLeaveIfDirty()) {
      suppressRoundWatch = true;
      roundId.value = prev;
      await nextTick();
      suppressRoundWatch = false;
      return;
    }
  }
  await loadSheet();
});

watch(loading, (isLoading, wasLoading) => {
  if (wasLoading && !isLoading && !roundFinalized.value) {
    void focusFirstMissing();
  }
});

onMounted(async () => {
  window.addEventListener("beforeunload", onBeforeUnload);
  bootLoading.value = true;
  try {
    const { data } = await supabase.auth.getSession();
    session.value = data.session;
    if (data.session) {
      try {
        await bootstrapSession();
        await loadSheet();
      } catch (e) {
        error.value = friendlyError(e);
      }
    }
  } finally {
    bootLoading.value = false;
  }

  supabase.auth.onAuthStateChange(async (_event, nextSession) => {
    session.value = nextSession;
    if (!nextSession) {
      scorer.value = null;
      rounds.value = [];
      roundId.value = "";
      roster.value = [];
      return;
    }
    bootLoading.value = true;
    error.value = "";
    try {
      await bootstrapSession();
      await loadSheet();
    } catch (e) {
      error.value = friendlyError(e);
      scorer.value = null;
    } finally {
      bootLoading.value = false;
    }
  });
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
});
</script>

<template>
  <main v-if="bootLoading" class="login-shell">
    <p class="muted">Loading…</p>
  </main>

  <main v-else-if="!session || !scorer" class="login-shell">
    <section class="login-card">
      <strong class="brand">WAGS</strong>
      <div>
        <p class="eyebrow">Winter</p>
        <h1>Winter Scores</h1>
        <p>Sign in with your member account. Enter net Stableford points only.</p>
      </div>
      <form class="login-form" @submit.prevent="signIn">
        <label>
          <span>Email</span>
          <input
            v-model="authEmail"
            type="email"
            autocomplete="username"
            required
          />
        </label>
        <label>
          <span>Password</span>
          <input
            v-model="authPassword"
            type="password"
            autocomplete="current-password"
            required
          />
        </label>
        <button type="submit" class="primary-button" :disabled="authLoading">
          {{ authLoading ? "Signing in…" : "Sign in" }}
        </button>
      </form>
      <p v-if="error" class="notice error">{{ error }}</p>
    </section>
  </main>

  <main v-else class="app-shell">
    <header class="topbar">
      <div>
        <strong class="brand">WAGS</strong>
        <span class="topbar-meta">{{ scorer.full_name }} · Winter scorer</span>
      </div>
      <div class="topbar-actions">
        <button type="button" class="secondary-button" :disabled="loading || saving" @click="refreshAll">
          {{ loading ? "Refreshing…" : "Refresh" }}
        </button>
        <button type="button" class="secondary-button" @click="signOut">Sign out</button>
      </div>
    </header>

    <section class="hero">
      <p class="eyebrow">Winter §9</p>
      <h1>Enter net points</h1>
      <p>One number per player — Stableford points after handicap. No hole scores, no snakes or camels.</p>
    </section>

    <section class="toolbar">
      <label>
        <span>Week</span>
        <select v-model="roundId" :disabled="loading || saving || !roundOptions.length">
          <option v-if="!roundOptions.length" value="">No winter weeks yet</option>
          <option v-for="o in roundOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
        </select>
      </label>
      <label>
        <span>Show</span>
        <select v-model="filter">
          <option value="all">Full sheet</option>
          <option value="unsaved">Unsaved only</option>
          <option value="missing">Not saved yet</option>
          <option value="scored">Saved only</option>
        </select>
      </label>
      <label class="grow">
        <span>Search</span>
        <input v-model="search" type="search" placeholder="Player name…" />
      </label>
    </section>

    <p v-if="roundId" class="status-line" :class="{ locked: roundFinalized }">
      <template v-if="roundFinalized">
        <strong>Finalized</strong> — read-only. Reopen the round in main admin to edit.
      </template>
      <template v-else>
        <strong>{{ progress.entered }} / {{ progress.total }}</strong> entered
        <span v-if="progress.missingEntered"> · {{ progress.missingEntered }} blank</span>
        <span> · {{ progress.saved }} saved</span>
        <span v-if="dirtyCount"> · {{ dirtyCount }} waiting to save</span>
      </template>
    </p>

    <p v-if="error" class="notice error">{{ error }}</p>
    <p v-if="success" class="notice success">{{ success }}</p>
    <p v-if="loading" class="muted">Loading sheet…</p>

    <section v-else class="sheet">
      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th class="col-pts">Pts</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in displayList"
            :key="m.memberId"
            :class="{ dirty: rowStatus(m.memberId) === 'edited' }"
          >
            <td>
              <span class="player-name">{{ m.fullName }}</span>
              <span
                v-if="rowStatus(m.memberId)"
                class="tag"
                :class="{ draft: rowStatus(m.memberId) === 'edited' }"
              >
                {{ rowStatus(m.memberId) === "edited" ? "Draft" : "Saved" }}
              </span>
            </td>
            <td class="col-pts">
              <input
                :ref="(el) => setPointsRef(m.memberId, el)"
                v-model="drafts[m.memberId].points"
                type="number"
                min="0"
                max="60"
                inputmode="numeric"
                autocomplete="off"
                :disabled="roundFinalized || saving"
                @keydown.enter.prevent="onPointsEnter(m)"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!displayList.length" class="muted empty">No players match this filter.</p>
    </section>

    <footer v-if="!roundFinalized" class="save-bar" :class="{ active: dirtyCount }">
      <div>
        <template v-if="dirtyCount">
          <strong>{{ dirtyCount }}</strong> draft change{{ dirtyCount === 1 ? "" : "s" }}
        </template>
        <template v-else>
          <span class="muted">Fill net points, then Save all</span>
        </template>
      </div>
      <div class="save-actions">
        <button type="button" class="secondary-button" :disabled="!dirtyCount || saving" @click="discardChanges">
          Discard
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="!saveableDirtyMembers.length || saving"
          @click="saveAll"
        >
          {{ saving ? "Saving…" : `Save all${saveableDirtyMembers.length ? ` (${saveableDirtyMembers.length})` : ""}` }}
        </button>
      </div>
    </footer>
  </main>
</template>
