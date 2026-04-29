<script setup>
import { computed, onMounted, ref } from "vue";
import { useSession } from "../../composables/useSession";
import { supabase } from "../../lib/supabase";
import { triggerHapticFeedback } from "../../utils/haptics";

const { loading: sessionLoading, isAdmin, role, profile } = useSession();
const loading = ref(true);
const error = ref("");
const openCompetitions = ref([]);
const closedCompetitions = ref([]);
const seasons = ref([]);
const currentSeason = ref(null);
const creating = ref(false);
const createMessage = ref("");
const actionMessage = ref("");
const actionLog = ref([]);
const processingCompetitionId = ref(null);
const form = ref({
  name: "",
  competition_date: new Date().toISOString().slice(0, 10),
});

const canCreate = computed(() => role.value === "admin");
const canManage = computed(() => role.value === "admin");
const selectedSeason = computed(() => {
  return (
    seasons.value.find((season) => {
      if (!form.value.competition_date) return false;
      return (
        form.value.competition_date >= season.start_date &&
        form.value.competition_date <= season.end_date
      );
    }) || null
  );
});

const seasonContext = computed(() => {
  if (!currentSeason.value) return "No current summer season is configured.";
  if (!form.value.competition_date)
    return `Current season: ${currentSeason.value.name || currentSeason.value.start_year}.`;
  if (!selectedSeason.value)
    return "Selected date is outside every configured summer season.";
  if (selectedSeason.value.id === currentSeason.value.id)
    return `This competition will count in ${selectedSeason.value.name || selectedSeason.value.start_year}.`;
  return `This date belongs to ${selectedSeason.value.name || selectedSeason.value.start_year}, not the current season ${currentSeason.value.name || currentSeason.value.start_year}.`;
});

const loadAdminData = async () => {
  loading.value = true;
  error.value = "";

  const [
    { data: competitions, error: competitionsError },
    { data: seasonData, error: seasonsError },
  ] = await Promise.all([
    supabase
      .from("competitions")
      .select(
        "id, name, competition_date, status, winner_id, prize_pot, rollover_amount, profiles(full_name)",
      )
      .order("competition_date", { ascending: false }),
    supabase
      .from("seasons")
      .select("id, name, start_year, start_date, end_date, is_current")
      .order("start_year", { ascending: false }),
  ]);

  if (competitionsError || seasonsError) {
    error.value =
      competitionsError?.message ||
      seasonsError?.message ||
      "Unable to load admin data.";
    openCompetitions.value = [];
    closedCompetitions.value = [];
    seasons.value = [];
    currentSeason.value = null;
    loading.value = false;
    return;
  }

  seasons.value = seasonData || [];
  currentSeason.value =
    seasons.value.find((season) => season.is_current) ||
    seasons.value[0] ||
    null;
  openCompetitions.value = (competitions || []).filter(
    (competition) => competition.status === "open",
  );
  closedCompetitions.value = (competitions || []).filter(
    (competition) => competition.status !== "open",
  );
  loading.value = false;
};

const createCompetition = async () => {
  if (!canCreate.value) return;

  triggerHapticFeedback();

  createMessage.value = "";
  actionMessage.value = "";
  creating.value = true;

  if (!form.value.name.trim() || !form.value.competition_date) {
    createMessage.value = "Competition name and date are required.";
    creating.value = false;
    return;
  }

  if (!selectedSeason.value) {
    createMessage.value = "That date does not fall inside a configured season.";
    creating.value = false;
    return;
  }

  if (
    currentSeason.value &&
    selectedSeason.value.start_year < currentSeason.value.start_year
  ) {
    createMessage.value = `Cannot create a new competition in frozen past season ${selectedSeason.value.name || selectedSeason.value.start_year}.`;
    creating.value = false;
    return;
  }

  if (
    currentSeason.value &&
    selectedSeason.value.id !== currentSeason.value.id
  ) {
    const confirmed = window.confirm(
      `This date falls in ${selectedSeason.value.name || selectedSeason.value.start_year}, not the current season ${currentSeason.value.name || currentSeason.value.start_year}. Create it anyway?`,
    );

    if (!confirmed) {
      createMessage.value = "Competition creation cancelled.";
      creating.value = false;
      return;
    }
  }

  const { data: existingComps, error: duplicateError } = await supabase
    .from("competitions")
    .select("id, name")
    .eq("competition_date", form.value.competition_date);

  if (duplicateError) {
    createMessage.value = duplicateError.message;
    creating.value = false;
    return;
  }

  if (existingComps?.length) {
    createMessage.value = `A competition already exists on ${form.value.competition_date}: ${existingComps.map((item) => item.name).join(", ")}.`;
    creating.value = false;
    return;
  }

  const { error: insertError } = await supabase.from("competitions").insert({
    name: form.value.name.trim(),
    competition_date: form.value.competition_date,
    status: "open",
  });

  if (insertError) {
    createMessage.value = insertError.message;
    creating.value = false;
    return;
  }

  form.value = {
    name: "",
    competition_date: new Date().toISOString().slice(0, 10),
  };
  createMessage.value = "Competition created.";
  creating.value = false;
  await loadAdminData();
};

const runCompetitionAction = async ({
  competition,
  confirmMessage,
  successMessage,
  rpcName,
  deleteDirect = false,
}) => {
  if (!canManage.value) return;
  if (!window.confirm(confirmMessage)) return;

  processingCompetitionId.value = competition.id;
  actionMessage.value = "";
  actionLog.value = [];

  if (deleteDirect) {
    const { error: deleteError } = await supabase
      .from("competitions")
      .delete()
      .eq("id", competition.id);
    processingCompetitionId.value = null;

    if (deleteError) {
      actionMessage.value =
        deleteError.message || "Unable to delete competition.";
      return;
    }

    actionMessage.value = successMessage;
    await loadAdminData();
    return;
  }

  const { data, error: rpcError } = await supabase.rpc(rpcName, {
    p_comp_id: competition.id,
  });
  processingCompetitionId.value = null;

  if (rpcError) {
    actionMessage.value = rpcError.message || "Competition action failed.";
    return;
  }

  if (data?.error) {
    actionMessage.value = data.error;
    return;
  }

  actionMessage.value = successMessage;
  actionLog.value = Array.isArray(data?.log)
    ? data.log.map((entry, index) => ({
        id: `${competition.id}-${index}`,
        message: entry.message,
        isError: Boolean(entry.isError),
      }))
    : [];

  await loadAdminData();
};

const finalizeCompetition = async (competition) => {
  triggerHapticFeedback();
  await runCompetitionAction({
    competition,
    confirmMessage: `Finalize ${competition.name}? This will settle the competition, apply handicap changes, and determine the winner or rollover.`,
    successMessage: `${competition.name} finalized.`,
    rpcName: "finalize_competition",
  });
};

const reopenCompetition = async (competition) => {
  triggerHapticFeedback();
  await runCompetitionAction({
    competition,
    confirmMessage: `Re-open ${competition.name}? This will remove the competition's financial and handicap records so it can be finalized again later.`,
    successMessage: `${competition.name} re-opened.`,
    rpcName: "reopen_competition",
  });
};

const deleteCompetition = async (competition) => {
  triggerHapticFeedback();
  await runCompetitionAction({
    competition,
    confirmMessage: `Delete ${competition.name}? This is irreversible.`,
    successMessage: `${competition.name} deleted.`,
    deleteDirect: true,
  });
};

onMounted(async () => {
  if (!isAdmin.value) {
    loading.value = false;
    return;
  }
  await loadAdminData();
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
          openCompetitions.length
            ? $router.push({ name: 'admin-scores', query: { competition: openCompetitions[0].id } })
            : $router.push({ name: 'admin-scores' })
        "
      >
        Scores
      </button>
    </nav>
    <div>
      <h1 class="admin-page-title">Competitions</h1>
      <p class="admin-page-copy">
        Create events, finalize open rounds, and manage the archive from one
        place.
      </p>
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
        Sign in with a committee or admin account to access competitions
        management.
      </p>
    </section>

    <template v-else>
      <div class="admin-status-strip">
        <div class="admin-status-item">
          <span class="stat-label">Signed in</span>
          <strong>{{ profile?.full_name || "Admin" }}</strong>
        </div>
        <div class="admin-status-item">
          <span class="stat-label">Role</span>
          <strong>{{ role }}</strong>
        </div>
        <div class="admin-status-item">
          <span class="stat-label">Open</span>
          <strong>{{ openCompetitions.length }}</strong>
        </div>
        <div class="admin-status-item">
          <span class="stat-label">Closed</span>
          <strong>{{ closedCompetitions.length }}</strong>
        </div>
      </div>

      <section class="content-panel auth-panel">
        <div class="panel-heading">
          <h3>Create competition</h3>
          <span>{{ canCreate ? "Admin only" : "Read only" }}</span>
        </div>
        <div class="auth-form">
          <label class="field-label" for="comp-name">Name</label>
          <input
            id="comp-name"
            v-model="form.name"
            class="quiet-input"
            type="text"
            :disabled="!canCreate || creating"
          />

          <label class="field-label" for="comp-date">Date</label>
          <input
            id="comp-date"
            v-model="form.competition_date"
            class="quiet-input"
            type="date"
            :disabled="!canCreate || creating"
          />

          <p class="helper-copy">{{ seasonContext }}</p>
          <button
            class="quiet-button quiet-button--strong"
            type="button"
            :disabled="!canCreate || creating"
            @click="createCompetition"
          >
            {{ creating ? "Creating…" : "Create competition" }}
          </button>
        </div>
        <p v-if="createMessage" class="empty-state">{{ createMessage }}</p>
      </section>

      <section
        v-if="actionMessage || actionLog.length"
        class="content-panel auth-panel"
      >
        <div class="panel-heading">
          <h3>Competition activity</h3>
          <span>Latest action</span>
        </div>
        <p v-if="actionMessage" class="empty-state">{{ actionMessage }}</p>
        <div v-if="actionLog.length" class="admin-log">
          <div
            v-for="entry in actionLog"
            :key="entry.id"
            class="admin-log-row"
            :class="{ 'admin-log-row--error': entry.isError }"
          >
            {{ entry.message }}
          </div>
        </div>
      </section>

      <section class="content-panel">
        <div class="panel-heading">
          <h3>Open competitions</h3>
          <span>Ready to finalize</span>
        </div>
        <p v-if="loading" class="empty-state">Loading competitions…</p>
        <p v-else-if="error" class="empty-state">{{ error }}</p>
        <div v-else class="admin-list">
          <div
            v-for="competition in openCompetitions"
            :key="competition.id"
            class="admin-list-row"
          >
            <div>
              <strong>{{ competition.name }}</strong>
              <p>
                {{
                  new Date(competition.competition_date).toLocaleDateString()
                }}
                <span v-if="Number(competition.rollover_amount || 0) > 0">
                  · Includes £{{
                    Number(competition.rollover_amount).toFixed(2)
                  }}
                  rollover</span
                >
              </p>
            </div>
            <div class="admin-actions">
              <button
                class="quiet-button quiet-button--ghost"
                @click="$emit('navigate', { target: 'admin', competitionId: competition.id })"
              >
                Scores
              </button>
              <button
                class="quiet-button quiet-button--strong"
                type="button"
                :disabled="
                  !canManage || processingCompetitionId === competition.id
                "
                @click="finalizeCompetition(competition)"
              >
                {{
                  processingCompetitionId === competition.id
                    ? "Working…"
                    : "Finalize"
                }}
              </button>
            </div>
          </div>
          <p v-if="!openCompetitions.length" class="empty-state">
            No open competitions.
          </p>
        </div>
      </section>

      <section class="content-panel">
        <div class="panel-heading">
          <h3>Closed competitions</h3>
          <span>Archive</span>
        </div>
        <div class="admin-list">
          <div
            v-for="competition in closedCompetitions"
            :key="competition.id"
            class="admin-list-row"
          >
            <div>
              <strong>{{ competition.name }}</strong>
              <p>
                {{
                  new Date(competition.competition_date).toLocaleDateString()
                }}
                <span v-if="competition.profiles?.full_name">
                  · Winner {{ competition.profiles.full_name }}</span
                >
                <span v-else> · Rolled over</span>
                <span v-if="Number(competition.prize_pot || 0) > 0">
                  · £{{ Number(competition.prize_pot).toFixed(2) }}</span
                >
              </p>
            </div>
            <div class="admin-actions">
              <button
                class="quiet-button quiet-button--ghost"
                type="button"
                :disabled="
                  !canManage || processingCompetitionId === competition.id
                "
                @click="reopenCompetition(competition)"
              >
                Re-open
              </button>
              <button
                class="quiet-button quiet-button--ghost quiet-button--danger"
                type="button"
                :disabled="
                  !canManage || processingCompetitionId === competition.id
                "
                @click="deleteCompetition(competition)"
              >
                Delete
              </button>
            </div>
          </div>
          <p v-if="!closedCompetitions.length" class="empty-state">
            No closed competitions.
          </p>
        </div>
      </section>
    </template>
  </section>
</template>
