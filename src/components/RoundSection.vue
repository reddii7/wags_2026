<script setup>
import { ref, computed } from 'vue';
import MatchCard from './MatchCard.vue';

const props = defineProps({
  round: {
    type: Object,
    required: true
  },
  matches: {
    type: Array,
    default: () => []
  },
  currentUserId: {
    type: String,
    default: null
  },
  isExpanded: {
    type: Boolean,
    default: true
  },
  showDetails: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['match-click', 'score-update', 'toggle-expand']);

const isExpanded = ref(props.isExpanded);

const roundMatches = computed(() => {
  return props.matches.filter(match => match.round_number === props.round.number);
});

const completedMatches = computed(() => {
  return roundMatches.value.filter(match => match.winner_id);
});

const pendingMatches = computed(() => {
  return roundMatches.value.filter(match => !match.winner_id);
});

const roundStatus = computed(() => {
  if (completedMatches.value.length === roundMatches.value.length && roundMatches.value.length > 0) {
    return 'completed';
  }
  if (completedMatches.value.length > 0) {
    return 'in-progress';
  }
  return 'pending';
});

const isCurrentUserInMatch = (match) => {
  return props.currentUserId && 
         (match.player1_id === props.currentUserId || match.player2_id === props.currentUserId);
};

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
  emit('toggle-expand', props.round.number);
};

const handleMatchClick = (match) => {
  emit('match-click', match);
};

const handleScoreUpdate = (payload) => {
  emit('score-update', payload);
};

const getRoundName = (roundNumber) => {
  const names = {
    1: 'First Round',
    2: 'Second Round', 
    3: 'Quarter Finals',
    4: 'Semi Finals',
    5: 'Final'
  };
  return names[roundNumber] || `Round ${roundNumber}`;
};
</script>

<template>
  <div class="round-section">
    <div 
      class="round-section__header"
      :class="{ 'round-section__header--collapsed': !isExpanded }"
      @click="toggleExpand"
    >
      <div class="round-section__title">
        <h3 class="round-section__name">{{ getRoundName(round.number) }}</h3>
        <div class="round-section__meta">
          <span class="round-section__matches">
            {{ completedMatches.length }}/{{ roundMatches.length }} completed
          </span>
          <span 
            class="round-section__status"
            :data-status="roundStatus"
          >
            {{ roundStatus }}
          </span>
        </div>
      </div>
      <div class="round-section__toggle">
        <svg 
          class="round-section__toggle-icon"
          :class="{ 'round-section__toggle-icon--expanded': isExpanded }"
          width="20" 
          height="20" 
          viewBox="0 0 20 20" 
          fill="currentColor"
        >
          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </div>
    </div>
    
    <div 
      class="round-section__content"
      :class="{ 'round-section__content--collapsed': !isExpanded }"
    >
      <div v-if="roundMatches.length === 0" class="round-section__empty">
        <p>No matches scheduled for this round</p>
      </div>
      
      <div v-else class="round-section__matches">
        <!-- Current/Upcoming Matches -->
        <div v-if="pendingMatches.length > 0" class="round-section__match-group">
          <div class="round-section__match-group-title">Upcoming</div>
          <MatchCard
            v-for="match in pendingMatches"
            :key="match.id"
            :match="match"
            :is-current-user="isCurrentUserInMatch(match)"
            :show-details="showDetails"
            @click="handleMatchClick"
            @score-update="handleScoreUpdate"
          />
        </div>
        
        <!-- Completed Matches -->
        <div v-if="completedMatches.length > 0" class="round-section__match-group">
          <div class="round-section__match-group-title">Completed</div>
          <MatchCard
            v-for="match in completedMatches"
            :key="match.id"
            :match="match"
            :is-current-user="isCurrentUserInMatch(match)"
            :show-details="showDetails"
            @click="handleMatchClick"
            @score-update="handleScoreUpdate"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.round-section {
  margin-bottom: 2rem;
  background: var(--bg, #111);
  border: 1px solid var(--line, #333);
  border-radius: 16px;
  overflow: hidden;
}

.round-section__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  background: var(--bg-secondary, #1a1a1a);
  cursor: pointer;
  user-select: none;
  transition: background 0.2s ease;
}

.round-section__header:hover {
  background: var(--bg-tertiary, #222);
}

.round-section__header--collapsed {
  border-bottom: none;
}

.round-section__title {
  flex: 1;
}

.round-section__name {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text, #eee);
  margin: 0;
}

.round-section__meta {
  display: flex;
  gap: 1rem;
  margin-top: 0.25rem;
}

.round-section__matches {
  font-size: 0.875rem;
  color: var(--text-muted, #888);
}

.round-section__status {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
  background: var(--bg-tertiary, #222);
  color: var(--text-muted, #888);
}

.round-section__status[data-status="completed"] {
  background: color-mix(in srgb, var(--success, #4caf50) 20%, transparent);
  color: var(--success, #4caf50);
}

.round-section__status[data-status="in-progress"] {
  background: color-mix(in srgb, var(--warning, #ff9800) 20%, transparent);
  color: var(--warning, #ff9800);
}

.round-section__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--bg-tertiary, #222);
  transition: transform 0.2s ease;
}

.round-section__toggle-icon {
  color: var(--text-muted, #888);
  transition: transform 0.2s ease;
}

.round-section__toggle-icon--expanded {
  transform: rotate(180deg);
}

.round-section__content {
  padding: 1.25rem;
  transition: all 0.3s ease;
  max-height: 2000px;
  opacity: 1;
}

.round-section__content--collapsed {
  max-height: 0;
  padding: 0 1.25rem;
  opacity: 0;
  overflow: hidden;
}

.round-section__empty {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted, #888);
}

.round-section__match-group {
  margin-bottom: 1.5rem;
}

.round-section__match-group:last-child {
  margin-bottom: 0;
}

.round-section__match-group-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--line, #333);
}

@media (min-width: 768px) {
  .round-section__header {
    padding: 1.25rem 1.5rem;
  }
  
  .round-section__content {
    padding: 1.5rem;
  }
  
  .round-section__content--collapsed {
    padding: 0 1.5rem;
  }
}
</style>
