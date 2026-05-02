<script setup>
import { ref, computed, onMounted } from "vue";
import { useSession } from "../composables/useSession";
import { triggerHapticFeedback } from "../utils/haptics";
import RoundSection from "../components/RoundSection.vue";
import AppDialog from "../components/AppDialog.vue";
import QuietList from "../components/QuietList.vue";

const { user, profile } = useSession();

const props = defineProps({
  metadata: { type: Object, required: true },
});

const tournaments = ref([]);
const matches = ref([]);
const selectedTournament = ref(null);
const loading = ref(false);
const error = ref("");
const showMatchDialog = ref(false);
const selectedMatch = ref(null);
const isAdmin = computed(() => profile.value?.role === "admin");

// Hardcoded RS Cup draw data
const hardcodedTournament = {
  id: "rs-cup-2026",
  name: "Wags R/S Cup 2026",
  status: "active",
  created_at: "2026-05-02",
};

const hardcodedMatches = [
  // First Round Draw - Matches to be played by 19th May
  {
    id: "match-1",
    tournament_id: "rs-cup-2026",
    round_number: 1,
    player1_id: "p1",
    player2_id: "p2",
    player1_name: "A Mosson",
    player2_name: "James Harrison",
    status: "pending",
    created_at: "2026-05-02",
  },
  {
    id: "match-2",
    tournament_id: "rs-cup-2026",
    round_number: 1,
    player1_id: "p3",
    player2_id: "p4",
    player1_name: "R Kelly",
    player2_name: "Robbo",
    status: "pending",
    created_at: "2026-05-02",
  },
  {
    id: "match-3",
    tournament_id: "rs-cup-2026",
    round_number: 1,
    player1_id: "p5",
    player2_id: "p6",
    player1_name: "Rochey",
    player2_name: "Suchy",
    status: "pending",
    created_at: "2026-05-02",
  },
  {
    id: "match-4",
    tournament_id: "rs-cup-2026",
    round_number: 1,
    player1_id: "p7",
    player2_id: "p8",
    player1_name: "C Rowe",
    player2_name: "R Shaw",
    status: "pending",
    created_at: "2026-05-02",
  },
  {
    id: "match-5",
    tournament_id: "rs-cup-2026",
    round_number: 1,
    player1_id: "p9",
    player2_id: "p10",
    player1_name: "Ashley",
    player2_name: "James Simmons",
    status: "pending",
    created_at: "2026-05-02",
  },
  {
    id: "match-6",
    tournament_id: "rs-cup-2026",
    round_number: 1,
    player1_id: "p11",
    player2_id: "p12",
    player1_name: "Martin S",
    player2_name: "Ian Ind",
    status: "pending",
    created_at: "2026-05-02",
  },
  {
    id: "match-7",
    tournament_id: "rs-cup-2026",
    round_number: 1,
    player1_id: "p13",
    player2_id: "p14",
    player1_name: "Mick H",
    player2_name: "Nick S",
    status: "pending",
    created_at: "2026-05-02",
  },
  {
    id: "match-8",
    tournament_id: "rs-cup-2026",
    round_number: 1,
    player1_id: "p15",
    player2_id: "p16",
    player1_name: "Boardsey",
    player2_name: "Pimmsey",
    status: "pending",
    created_at: "2026-05-02",
  },
  {
    id: "match-9",
    tournament_id: "rs-cup-2026",
    round_number: 1,
    player1_id: "p17",
    player2_id: "p18",
    player1_name: "Tealey",
    player2_name: "Tom G",
    status: "pending",
    created_at: "2026-05-02",
  },
  {
    id: "match-10",
    tournament_id: "rs-cup-2026",
    round_number: 1,
    player1_id: "p19",
    player2_id: "p20",
    player1_name: "Howla",
    player2_name: "John M",
    status: "pending",
    created_at: "2026-05-02",
  },
];

const tournamentStats = computed(() => {
  if (!selectedTournament.value || !matches.value.length) return {};

  const tournamentMatches = matches.value.filter(
    (match) => match.tournament_id === selectedTournament.value.id,
  );

  const completedMatches = tournamentMatches.filter((match) => match.winner_id);
  const uniqueParticipants = new Set([
    ...tournamentMatches.map((m) => m.player1_id).filter(Boolean),
    ...tournamentMatches.map((m) => m.player2_id).filter(Boolean),
  ]);

  const currentRound = Math.max(
    ...tournamentMatches.map((m) => m.round_number || 0),
  );
  const winner = completedMatches.find(
    (m) => m.round_number === currentRound,
  )?.winner_name;

  return {
    totalParticipants: uniqueParticipants.size,
    totalMatches: tournamentMatches.length,
    completedMatches: completedMatches.length,
    currentRound: currentRound || null,
    winner: winner,
  };
});

const rounds = computed(() => {
  if (!selectedTournament.value || !matches.value.length) return [];

  const tournamentMatches = matches.value.filter(
    (match) => match.tournament_id === selectedTournament.value.id,
  );

  const roundNumbers = [
    ...new Set(tournamentMatches.map((m) => m.round_number || 0)),
  ]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  return roundNumbers.map((number) => ({
    number,
    name: getRoundName(number),
    completed:
      tournamentMatches.filter((m) => m.round_number === number && m.winner_id)
        .length ===
      tournamentMatches.filter((m) => m.round_number === number).length,
  }));
});

const getRoundName = (roundNumber) => {
  const names = {
    1: "First Round",
    2: "Second Round",
    3: "Quarter Finals",
    4: "Semi Finals",
    5: "Final",
  };
  return names[roundNumber] || `Round ${roundNumber}`;
};

const tableRows = computed(() => {
  return matches.value.map((match) => ({
    id: match.id,
    round: getRoundName(match.round_number),
    players: `${match.player1_name} vs ${match.player2_name}`,
    status: match.winner_id ? "Completed" : "Pending",
  }));
});

const loadTournaments = () => {
  tournaments.value = [hardcodedTournament];
  selectedTournament.value = hardcodedTournament;
};

const loadMatches = () => {
  matches.value = hardcodedMatches;
};

const handleMatchClick = (match) => {
  selectedMatch.value = match;
  showMatchDialog.value = true;
  triggerHapticFeedback();
};

const handleScoreUpdate = (payload) => {
  if (!isAdmin.value) return;

  const matchIndex = matches.value.findIndex((m) => m.id === payload.matchId);
  if (matchIndex === -1) return;

  if (payload.player === "player1") {
    matches.value[matchIndex].player1_score = payload.score
      ? parseInt(payload.score)
      : null;
  } else {
    matches.value[matchIndex].player2_score = payload.score
      ? parseInt(payload.score)
      : null;
  }
};

const closeMatchDialog = () => {
  showMatchDialog.value = false;
  selectedMatch.value = null;
};

// Initialize data on mount
onMounted(() => {
  loadTournaments();
  loadMatches();
});
</script>

<template>
  <div class="rs-cup-view">
    <div v-if="loading" class="rs-cup-view__loading">
      <div class="spinner"></div>
      <p>Loading tournament data...</p>
    </div>

    <div v-else-if="error" class="rs-cup-view__error">
      <p>{{ error }}</p>
      <button @click="loadTournaments" class="rs-cup-view__retry">Retry</button>
    </div>

    <div v-else-if="!tournaments.length" class="rs-cup-view__empty">
      <h2>No Tournaments</h2>
      <p>No RS Cup tournaments have been created yet.</p>
    </div>

    <div v-else class="rs-cup-view__content">
      <!-- Tournament Selector -->
      <div class="rs-cup-view__selector" v-if="tournaments.length > 1">
        <label for="tournament-select">Select Tournament:</label>
        <select
          id="tournament-select"
          v-model="selectedTournament"
          class="rs-cup-view__select"
        >
          <option
            v-for="tournament in tournaments"
            :key="tournament.id"
            :value="tournament"
          >
            {{ tournament.name }} ({{
              tournament.created_at
                ? new Date(tournament.created_at).getFullYear()
                : "Unknown"
            }})
          </option>
        </select>
      </div>

      <!-- Tournament Bracket -->
      <div
        class="rs-cup-view__bracket"
        v-if="selectedTournament && rounds.length"
      >
        <RoundSection
          v-for="round in rounds"
          :key="round.number"
          :round="round"
          :matches="matches"
          :current-user-id="user?.id"
          :show-details="isAdmin"
          @match-click="handleMatchClick"
          @score-update="handleScoreUpdate"
        />
      </div>

      <!-- Matches Table -->
      <div v-if="selectedTournament" class="rs-cup-view__table">
        <h2>RS Cup Matches</h2>
        <QuietList
          :columns="[
            { key: 'round', label: 'Round' },
            { key: 'players', label: 'Match' },
            { key: 'status', label: 'Status' },
          ]"
          :rows="tableRows"
          empty-text="No matches scheduled"
        />
      </div>
    </div>

    <!-- Match Details Dialog -->
    <AppDialog
      v-if="showMatchDialog && selectedMatch"
      :show="showMatchDialog"
      @close="closeMatchDialog"
    >
      <template #header>
        <h3>Match Details</h3>
      </template>

      <template #body>
        <div class="match-details">
          <div class="match-details__players">
            <div class="match-details__player">
              <span class="match-details__name">{{
                selectedMatch.player1_name
              }}</span>
              <span class="match-details__score">{{
                selectedMatch.player1_score || "-"
              }}</span>
            </div>
            <div class="match-details__versus">VS</div>
            <div class="match-details__player">
              <span class="match-details__name">{{
                selectedMatch.player2_name
              }}</span>
              <span class="match-details__score">{{
                selectedMatch.player2_score || "-"
              }}</span>
            </div>
          </div>

          <div class="match-details__info">
            <p>
              <strong>Round:</strong>
              {{ getRoundName(selectedMatch.round_number) }}
            </p>
            <p>
              <strong>Status:</strong>
              {{ selectedMatch.winner_id ? "Completed" : "Pending" }}
            </p>
            <p v-if="selectedMatch.winner_name">
              <strong>Winner:</strong> {{ selectedMatch.winner_name }}
            </p>
            <p v-if="selectedMatch.created_at">
              <strong>Date:</strong>
              {{ new Date(selectedMatch.created_at).toLocaleDateString() }}
            </p>
          </div>
        </div>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped>
.rs-cup-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
}

.rs-cup-view__loading,
.rs-cup-view__error,
.rs-cup-view__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  text-align: center;
}

.rs-cup-view__loading p,
.rs-cup-view__error p,
.rs-cup-view__empty p {
  color: var(--text-muted, #888);
  margin-top: 1rem;
}

.rs-cup-view__retry {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: var(--primary, #2196f3);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.rs-cup-view__content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.rs-cup-view__selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rs-cup-view__selector label {
  font-weight: 600;
  color: var(--text, #eee);
}

.rs-cup-view__select {
  padding: 0.75rem;
  background: var(--bg-secondary, #1a1a1a);
  border: 1px solid var(--line, #333);
  border-radius: 8px;
  color: var(--text, #eee);
  font-size: 1rem;
}

.rs-cup-view__bracket {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.rs-cup-view__no-matches {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-muted, #888);
  background: var(--bg-secondary, #1a1a1a);
  border: 1px solid var(--line, #333);
  border-radius: 12px;
}

.match-details {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.match-details__players {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary, #1a1a1a);
  border-radius: 8px;
}

.match-details__player {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
}

.match-details__name {
  font-weight: 600;
  color: var(--text, #eee);
}

.match-details__score {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--primary, #2196f3);
}

.match-details__versus {
  font-weight: 700;
  color: var(--text-muted, #888);
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.match-details__info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.match-details__info p {
  margin: 0;
  color: var(--text, #eee);
}

.match-details__info strong {
  color: var(--text-muted, #888);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--line, #333);
  border-top: 4px solid var(--primary, #2196f3);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@media (min-width: 768px) {
  .rs-cup-view {
    padding: 2rem;
  }

  .rs-cup-view__selector {
    flex-direction: row;
    align-items: center;
    gap: 1rem;
  }

  .rs-cup-view__selector label {
    margin-bottom: 0;
  }
}
</style>
