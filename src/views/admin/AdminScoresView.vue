// Sync selectedCompetitionId with route query param
watch(
  [selectedCompetitionId, route],
  ([compId, currentRoute]) => {
    if (!compId) return;
    if (currentRoute.query.competition !== compId) {
      // Update the route query param without reloading
      router.replace({ name: 'admin-scores', query: { competition: compId } });
    }
  },
  { immediate: false },
);
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSession } from "../../composables/useSession";
import { supabase } from "../../lib/supabase";
import { triggerHapticFeedback } from "../../utils/haptics";

const route = useRoute();
const router = useRouter();
const { loading: sessionLoading, isAdmin, profile } = useSession();

const loading = ref(true);
const saving = ref(false);
const error = ref("");
const message = ref("");
const competitions = ref([]);
const players = ref([]);
const rounds = ref([]);
const selectedCompetitionId = ref(null);

// Accept selectedCompetitionId as a prop from parent (App.vue)
import { defineProps, watch as vwatch } from 'vue';
const props = defineProps({
  selectedCompetitionId: { type: String, default: null },
});

// Watch for prop changes and update local state
vwatch(
  () => props.selectedCompetitionId,
  (newId) => {
    if (newId && newId !== selectedCompetitionId.value) {
      selectedCompetitionId.value = newId;
    }
  },
  { immediate: true },
);
const editingRoundId = ref(null);
const form = ref({
  user_id: "",
  stableford_score: "",
  has_snake: false,
  has_camel: false,
  is_paid: false,
});

const selectedCompetition = computed(
  () =>
    competitions.value.find(
      (competition) => competition.id === selectedCompetitionId.value,
    ) || null,
);

const availablePlayers = computed(() => {
  const taken = new Set(
    rounds.value
      .filter((round) => round.id !== editingRoundId.value)
      .map((round) => round.user_id),
  );

  return players.value.filter(
    (player) => !taken.has(player.id) || player.id === form.value.user_id,
  );
});

const totalCollected = computed(() =>
  rounds.value.reduce((sum, round) => {
    if (!round.is_paid) return sum;
    return sum + 5 + (round.has_snake ? 1 : 0) + (round.has_camel ? 1 : 0);
  }, 0),
);

const scoreRows = computed(() =>
  rounds.value.map((round) => ({
    ...round,
    amountDue: 5 + (round.has_snake ? 1 : 0) + (round.has_camel ? 1 : 0),
  })),
);

const resetForm = () => {
  editingRoundId.value = null;
  form.value = {
    user_id: "",
    stableford_score: "",
    has_snake: false,
    has_camel: false,
    is_paid: false,
  };
};

const handleResetFormClick = () => {
  triggerHapticFeedback();
  resetForm();
};

const loadCompetitions = async () => {
  const { data, error: queryError } = await supabase
    .from("competitions")
    .select("id, name, competition_date, status")
    .eq("status", "open")
    .order("competition_date", { ascending: false });

  if (queryError) throw queryError;

  competitions.value = data || [];
  console.log('[AdminScores] competitions loaded:', competitions.value);
  const requestedCompetitionId =
    typeof route.query.competition === "string"
      ? route.query.competition
      : null;
  if (
    requestedCompetitionId &&
    competitions.value.some(
      (competition) => competition.id === requestedCompetitionId,
    )
  ) {
    selectedCompetitionId.value = requestedCompetitionId;
    return;
  }

  if (
    !competitions.value.some(
      (competition) => competition.id === selectedCompetitionId.value,
    )
  ) {
    selectedCompetitionId.value = competitions.value[0]?.id || null;
  }
};

const loadPlayers = async () => {
  const { data, error: queryError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .order("full_name");

  if (queryError) throw queryError;
  players.value = data || [];
};

const loadRounds = async () => {
  if (!selectedCompetitionId.value) {
    rounds.value = [];
    resetForm();
    return;
  }

  const { data, error: queryError } = await supabase
    .from("rounds")
    .select(
      "id, user_id, stableford_score, has_snake, has_camel, is_paid, profiles(full_name)",
    )
    .eq("competition_id", selectedCompetitionId.value)
    .order("stableford_score", { ascending: false });

  if (queryError) throw queryError;

  rounds.value = data || [];

  if (
    editingRoundId.value &&
    !rounds.value.some((round) => round.id === editingRoundId.value)
  ) {
    resetForm();
  }
};

const refreshData = async () => {
  loading.value = true;
  error.value = "";

  try {
    await Promise.all([loadCompetitions(), loadPlayers()]);
    await loadRounds();
  } catch (loadError) {
    error.value = loadError.message || "Unable to load admin scores.";
  } finally {
    loading.value = false;
  }
};

const startEdit = (round) => {
  triggerHapticFeedback();
  editingRoundId.value = round.id;
  form.value = {
    user_id: round.user_id,
    stableford_score: round.stableford_score,
    has_snake: Boolean(round.has_snake),
    has_camel: Boolean(round.has_camel),
    is_paid: Boolean(round.is_paid),
  };
  message.value = "";
};

const saveRound = async () => {
  triggerHapticFeedback();
  if (!selectedCompetitionId.value) return;

  message.value = "";
  error.value = "";

  const score = Number.parseInt(form.value.stableford_score, 10);
  if (!form.value.user_id || Number.isNaN(score)) {
    message.value = "Select a player and enter a valid score.";
    return;
  }

  saving.value = true;

  const payload = {
    competition_id: selectedCompetitionId.value,
    user_id: form.value.user_id,
    stableford_score: score,
    has_snake: form.value.has_snake,
    has_camel: form.value.has_camel,
    is_paid: form.value.is_paid,
  };

  const query = editingRoundId.value
    ? supabase.from("rounds").update(payload).eq("id", editingRoundId.value)
    : supabase.from("rounds").insert(payload);

  const { error: queryError } = await query;
  if (queryError) {
    error.value = queryError.message;
    saving.value = false;
    return;
  }

  message.value = editingRoundId.value ? "Score updated." : "Score added.";
  saving.value = false;
  resetForm();
  await loadRounds();
};

const deleteRound = async (roundId) => {
  triggerHapticFeedback();
  error.value = "";
  message.value = "";

  const { error: queryError } = await supabase
    .from("rounds")
    .delete()
    .eq("id", roundId);
  if (queryError) {
    error.value = queryError.message;
    return;
  }

  if (editingRoundId.value === roundId) resetForm();
  message.value = "Score deleted.";
  await loadRounds();
};

const togglePaid = async (round) => {
  triggerHapticFeedback();
  error.value = "";

  const { error: queryError } = await supabase
    .from("rounds")
    .update({ is_paid: !round.is_paid })
    .eq("id", round.id);

  if (queryError) {
    error.value = queryError.message;
    return;
  }

  await loadRounds();
};

onMounted(async () => {
  if (!isAdmin.value) {
    loading.value = false;
    return;
  }

  await refreshData();
});

watch(selectedCompetitionId, async (competitionId, previousCompetitionId) => {
  if (competitionId === previousCompetitionId) return;
  resetForm();

  try {
    await loadRounds();
  } catch (loadError) {
    error.value =
      loadError.message || "Unable to load scores for this competition.";
  }
});
</script>

<template>
  <section class="admin-page">
    <nav class="admin-nav-tabs">
      <button
        class="admin-nav-tab"
        :class="{ active: $route.name === 'admin-competitions' }"
        @click="$router.push({ name: 'admin-competitions' })"
      >
        Competitions
      </button>
      <button
        class="admin-nav-tab"
        :class="{ active: $route.name === 'admin-scores' }"
        @click="
          competitions && competitions.length
            ? $router.push({ name: 'admin-scores', query: { competition: competitions[0].id } })
            : $router.push({ name: 'admin-scores' })
        "
      >
        Scores
      </button>
    </nav>
    <div>
      <h1 class="admin-page-title">Scores</h1>
      <p class="admin-page-copy">
        Enter weekly scores, track payments, and correct mistakes before closing
        a competition.
      </p>
      <button class="quiet-button quiet-button--ghost" @click="refreshData" style="margin-top: 0.5em;">
        Refresh competitions
      </button>
    </div>

    <section v-if="sessionLoading" class="content-panel">
      <p class="empty-state">Checking access…</p>
    </section>

    <section v-else-if="!isAdmin" class="content-panel compact-panel">
      <div class="panel-heading">
        <h3>Restricted</h3>
        <span>Admin access only</span>
      </div>
      <p class="empty-state">
        Sign in with a committee or admin account to manage scores.
      </p>
    </section>

    <template v-else>
      <div class="admin-status-strip">
        <div class="admin-status-item">
          <span class="stat-label">Competition</span>
          <strong>{{ selectedCompetition?.name || "None open" }}</strong>
        </div>
        <div class="admin-status-item">
          <span class="stat-label">Entries</span>
          <strong>{{ rounds.length }}</strong>
        </div>
        <div class="admin-status-item">
          <span class="stat-label">Collected</span>
          <strong>£{{ totalCollected.toFixed(2) }}</strong>
        </div>
        <div class="admin-status-item">
          <span class="stat-label">Signed in</span>
          <strong>{{ profile?.full_name || "Admin" }}</strong>
        </div>
      </div>

      <div class="admin-grid">
        <section class="content-panel auth-panel">
          <div class="panel-heading">
            <h3>{{ editingRoundId ? "Edit score" : "Add score" }}</h3>
            <span>{{
              editingRoundId ? "Update existing round" : "One entry per player"
            }}</span>
          </div>

          <div class="admin-form-grid">
            <div class="admin-form-grid--wide">
              <label class="field-label" for="admin-score-competition"
                >Competition</label
              >
              <select
                id="admin-score-competition"
                v-model="selectedCompetitionId"
                class="quiet-select"
                :disabled="loading || !competitions.length"
              >
                <option :value="null">Select open competition…</option>
                <option
                  v-for="competition in competitions"
                  :key="competition.id"
                  :value="competition.id"
                >
                  {{ competition.name }} ·
                  {{
                    new Date(competition.competition_date).toLocaleDateString()
                  }}
                </option>
              </select>
            </div>

            <div class="admin-form-grid--wide">
              <label class="field-label" for="admin-score-player">Player</label>
              <select
                id="admin-score-player"
                v-model="form.user_id"
                class="quiet-select"
                :disabled="!selectedCompetitionId || saving"
              >
                <option value="">Select player…</option>
                <option
                  v-for="player in availablePlayers"
                  :key="player.id"
                  :value="player.id"
                >
                  {{ player.full_name }}
                </option>
              </select>
            </div>

            <div>
              <label class="field-label" for="admin-score-points">Points</label>
              <input
                id="admin-score-points"
                v-model="form.stableford_score"
                class="quiet-input"
                type="number"
                min="0"
                max="60"
                :disabled="!selectedCompetitionId || saving"
              />
            </div>

            <div>
              <label class="field-label">Flags</label>
              <div class="admin-check-row">
                <label class="admin-check">
                  <input
                    v-model="form.has_snake"
                    type="checkbox"
                    :disabled="saving"
                  />
                  <span>Snake</span>
                </label>
                <label class="admin-check">
                  <input
                    v-model="form.has_camel"
                    type="checkbox"
                    :disabled="saving"
                  />
                  <span>Camel</span>
                </label>
                <label class="admin-check">
                  <input
                    v-model="form.is_paid"
                    type="checkbox"
                    :disabled="saving"
                  />
                  <span>Paid</span>
                </label>
              </div>
            </div>
          </div>

          <div class="admin-actions">
            <button
              class="quiet-button quiet-button--strong"
              type="button"
              :disabled="!selectedCompetitionId || saving"
              @click="saveRound"
            >
              {{
                saving
                  ? "Saving…"
                  : editingRoundId
                    ? "Save changes"
                    : "Add score"
              }}
            </button>
            <button
              v-if="editingRoundId"
              class="quiet-button quiet-button--ghost"
              type="button"
              @click="handleResetFormClick"
            >
              Cancel edit
            </button>
          </div>

          <p v-if="message" class="empty-state">{{ message }}</p>
          <p v-if="error" class="empty-state">{{ error }}</p>
        </section>

        <section class="content-panel">
          <div class="panel-heading">
            <h3>Entered scores</h3>
            <span>{{
              selectedCompetition ? "Open competition" : "Select a competition"
            }}</span>
          </div>

          <p v-if="loading" class="empty-state">Loading scores…</p>
          <p v-else-if="!competitions.length" class="empty-state">
            No open competitions found.
          </p>
          <div v-else class="admin-score-list">
            <div
              v-for="round in scoreRows"
              :key="round.id"
              class="admin-score-row"
            >
              <div>
                <strong>{{
                  round.profiles?.full_name || "Unknown player"
                }}</strong>
                <p class="admin-score-meta">
                  <span v-if="round.has_snake">Snake</span>
                  <span v-if="round.has_snake && round.has_camel"> · </span>
                  <span v-if="round.has_camel">Camel</span>
                  <span v-if="!round.has_snake && !round.has_camel"
                    >Standard entry</span
                  >
                </p>
              </div>
              <div class="admin-score-value">{{ round.stableford_score }}</div>
              <div class="admin-score-value">
                £{{ round.amountDue.toFixed(2) }}
              </div>
              <div class="admin-score-pay">
                <label class="admin-check">
                  <input
                    :checked="round.is_paid"
                    type="checkbox"
                    @change="togglePaid(round)"
                  />
                  <span>Paid</span>
                </label>
              </div>
              <div class="admin-actions">
                <button
                  class="quiet-button quiet-button--ghost"
                  type="button"
                  @click="startEdit(round)"
                >
                  Edit
                </button>
                <button
                  class="quiet-button quiet-button--ghost quiet-button--danger"
                  type="button"
                  @click="deleteRound(round.id)"
                >
                  Delete
                </button>
              </div>
            </div>
            <p v-if="!rounds.length" class="empty-state admin-score-empty">
              No scores entered yet.
            </p>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>
