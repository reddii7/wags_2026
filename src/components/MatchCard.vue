<script setup>
import { computed } from "vue";

const props = defineProps({
  match: {
    type: Object,
    required: true,
  },
  isCurrentUser: {
    type: Boolean,
    default: false,
  },
  showDetails: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["click", "score-update"]);

const matchStatus = computed(() => {
  if (props.match.winner_id) return "completed";
  if (props.match.status === "in_progress") return "in-progress";
  return "pending";
});

const winnerName = computed(() => {
  if (!props.match.winner_id) return null;
  return props.match.player1_id === props.match.winner_id
    ? props.match.player1_name
    : props.match.player2_name;
});

const canEditScore = computed(() => {
  return props.match.status !== "completed" && props.showDetails;
});

const handleClick = () => {
  emit("click", props.match);
};

const updateScore = (player, score) => {
  emit("score-update", { matchId: props.match.id, player, score });
};
</script>

<template>
  <div
    class="match-card"
    :class="{
      'match-card--completed': matchStatus === 'completed',
      'match-card--current': matchStatus === 'in-progress',
      'match-card--current-user': isCurrentUser,
    }"
    @click="handleClick"
  >
    <div class="match-card__round" v-if="match.round_number">
      Round {{ match.round_number }}
    </div>

    <div class="match-card__players">
      <div class="match-card__players-horizontal">
        <span
          class="match-card__player-name"
          :class="{
            'match-card__player--winner': match.player1_id === match.winner_id,
          }"
        >
          {{ match.player1_name || "TBD" }}
        </span>

        <span class="match-card__versus">VS</span>

        <span
          class="match-card__player-name"
          :class="{
            'match-card__player--winner': match.player2_id === match.winner_id,
          }"
        >
          {{ match.player2_name || "TBD" }}
        </span>
      </div>

      <div class="match-card__scores" v-if="showDetails">
        <div class="match-card__score-row">
          <div class="match-card__score">
            <input
              v-if="canEditScore"
              type="number"
              class="match-card__score-input"
              :value="match.player1_score || ''"
              @input="updateScore('player1', $event.target.value)"
              placeholder="Score"
              min="0"
            />
            <span v-else class="match-card__score-display">
              {{ match.player1_score || "-" }}
            </span>
          </div>

          <div class="match-card__score">
            <input
              v-if="canEditScore"
              type="number"
              class="match-card__score-input"
              :value="match.player2_score || ''"
              @input="updateScore('player2', $event.target.value)"
              placeholder="Score"
              min="0"
            />
            <span v-else class="match-card__score-display">
              {{ match.player2_score || "-" }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="match-card__status">
      <span
        class="match-card__status-indicator"
        :data-status="matchStatus"
      ></span>
      <span class="match-card__status-text">
        {{
          matchStatus === "completed"
            ? `Winner: ${winnerName}`
            : matchStatus === "in-progress"
              ? "In Progress"
              : "Upcoming"
        }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.match-card {
  background: var(--bg-secondary, #1a1a1a);
  border: 1px solid var(--line, #333);
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.match-card:hover {
  border-color: var(--accent, #4a9eff);
  transform: translateY(-1px);
}

.match-card--completed {
  border-color: var(--success, #4caf50);
  background: color-mix(in srgb, var(--success, #4caf50) 5%, transparent);
}

.match-card--current {
  border-color: var(--warning, #ff9800);
  background: color-mix(in srgb, var(--warning, #ff9800) 5%, transparent);
}

.match-card--current-user {
  border-color: var(--primary, #2196f3);
  background: color-mix(in srgb, var(--primary, #2196f3) 8%, transparent);
}

.match-card__round {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted, #888);
  text-transform: uppercase;
  margin-bottom: 0.5rem;
}

.match-card__players {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.match-card__players-horizontal {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem;
  background: var(--bg, #111);
  border-radius: 8px;
}

.match-card__player-name {
  color: var(--text, #eee);
  font-weight: 500;
  flex: 1;
  text-align: center;
}

.match-card__player-name.match-card__player--winner {
  color: var(--success, #4caf50);
  font-weight: 600;
}

.match-card__versus {
  font-weight: 700;
  color: var(--text-muted, #888);
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  flex-shrink: 0;
}

.match-card__score {
  min-width: 60px;
  text-align: right;
}

.match-card__score-input {
  background: var(--bg-input, #222);
  border: 1px solid var(--line, #444);
  color: var(--text, #eee);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  width: 60px;
  text-align: center;
  font-size: 0.875rem;
}

.match-card__score-display {
  color: var(--text, #eee);
  font-weight: 600;
  font-size: 0.875rem;
}

.match-card__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  font-size: 0.875rem;
}

.match-card__status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted, #888);
}

.match-card__status-indicator[data-status="completed"] {
  background: var(--success, #4caf50);
}

.match-card__status-indicator[data-status="in-progress"] {
  background: var(--warning, #ff9800);
  animation: pulse 2s infinite;
}

.match-card__status-indicator[data-status="pending"] {
  background: var(--text-muted, #888);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.match-card__status-text {
  color: var(--text-muted, #888);
}

.match-card__scores {
  margin-top: 0.5rem;
}

.match-card__score-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.match-card__score {
  flex: 1;
  text-align: center;
}

@media (min-width: 768px) {
  .match-card__players {
    flex-direction: row;
    align-items: center;
    gap: 1rem;
  }

  .match-card__versus {
    flex-shrink: 0;
    margin: 0;
  }

  .match-card__player {
    flex: 1;
  }

  .match-card__players-horizontal {
    gap: 1.5rem;
  }
}
</style>
