<script setup>
import { computed } from 'vue';

const props = defineProps({
  tournament: {
    type: Object,
    required: true
  },
  stats: {
    type: Object,
    default: () => ({})
  }
});

const tournamentStatus = computed(() => {
  if (!props.tournament) return 'unknown';
  switch (props.tournament.status) {
    case 'active': return 'active';
    case 'completed': return 'completed';
    case 'upcoming': return 'upcoming';
    default: return 'unknown';
  }
});

const statusText = computed(() => {
  switch (tournamentStatus.value) {
    case 'active': return 'In Progress';
    case 'completed': return 'Completed';
    case 'upcoming': return 'Upcoming';
    default: return 'Unknown';
  }
});

const statusColor = computed(() => {
  switch (tournamentStatus.value) {
    case 'active': return 'var(--warning, #ff9800)';
    case 'completed': return 'var(--success, #4caf50)';
    case 'upcoming': return 'var(--info, #2196f3)';
    default: return 'var(--text-muted, #888)';
  }
});

const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};
</script>

<template>
  <div class="tournament-header">
    <div class="tournament-header__main">
      <div class="tournament-header__title">
        <h1 class="tournament-header__name">
          🏆 {{ tournament.name || 'RS Cup' }}
        </h1>
        <div class="tournament-header__status">
          <span 
            class="tournament-header__status-badge"
            :style="{ backgroundColor: statusColor }"
          >
            {{ statusText }}
          </span>
        </div>
      </div>
      
      <div class="tournament-header__dates" v-if="tournament.created_at">
        <span class="tournament-header__date-label">Started:</span>
        <span class="tournament-header__date">{{ formatDate(tournament.created_at) }}</span>
      </div>
    </div>
    
    <div class="tournament-header__stats" v-if="stats">
      <div class="tournament-header__stat">
        <div class="tournament-header__stat-number">
          {{ stats.totalParticipants || 0 }}
        </div>
        <div class="tournament-header__stat-label">Participants</div>
      </div>
      
      <div class="tournament-header__stat">
        <div class="tournament-header__stat-number">
          {{ stats.totalMatches || 0 }}
        </div>
        <div class="tournament-header__stat-label">Matches</div>
      </div>
      
      <div class="tournament-header__stat">
        <div class="tournament-header__stat-number">
          {{ stats.completedMatches || 0 }}
        </div>
        <div class="tournament-header__stat-label">Completed</div>
      </div>
      
      <div class="tournament-header__stat" v-if="stats.currentRound">
        <div class="tournament-header__stat-number">
          {{ stats.currentRound }}
        </div>
        <div class="tournament-header__stat-label">Current Round</div>
      </div>
    </div>
    
    <div class="tournament-header__winner" v-if="tournamentStatus === 'completed' && stats.winner">
      <div class="tournament-header__winner-label">🏆 Winner:</div>
      <div class="tournament-header__winner-name">{{ stats.winner }}</div>
    </div>
  </div>
</template>

<style scoped>
.tournament-header {
  background: var(--bg-secondary, #1a1a1a);
  border: 1px solid var(--line, #333);
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.tournament-header__main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.tournament-header__title {
  flex: 1;
}

.tournament-header__name {
  font-size: 2rem;
  font-weight: 800;
  color: var(--text, #eee);
  margin: 0 0 0.75rem 0;
  line-height: 1.2;
}

.tournament-header__status {
  display: flex;
  align-items: center;
}

.tournament-header__status-badge {
  display: inline-block;
  padding: 0.375rem 0.75rem;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tournament-header__dates {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted, #888);
  font-size: 0.875rem;
}

.tournament-header__date-label {
  font-weight: 600;
}

.tournament-header__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.tournament-header__stat {
  text-align: center;
}

.tournament-header__stat-number {
  font-size: 2rem;
  font-weight: 800;
  color: var(--primary, #2196f3);
  line-height: 1;
  margin-bottom: 0.25rem;
}

.tournament-header__stat-label {
  font-size: 0.875rem;
  color: var(--text-muted, #888);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tournament-header__winner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: color-mix(in srgb, var(--success, #4caf50) 10%, transparent);
  border: 1px solid var(--success, #4caf50);
  border-radius: 12px;
}

.tournament-header__winner-label {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--success, #4caf50);
}

.tournament-header__winner-name {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text, #eee);
}

@media (max-width: 768px) {
  .tournament-header {
    padding: 1rem;
    margin-bottom: 1.5rem;
  }
  
  .tournament-header__name {
    font-size: 1.5rem;
  }
  
  .tournament-header__main {
    flex-direction: column;
    align-items: stretch;
  }
  
  .tournament-header__dates {
    justify-content: center;
  }
  
  .tournament-header__stats {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
  
  .tournament-header__stat-number {
    font-size: 1.5rem;
  }
  
  .tournament-header__winner {
    flex-direction: column;
    text-align: center;
    gap: 0.5rem;
  }
}

@media (max-width: 480px) {
  .tournament-header__stats {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
  
  .tournament-header__stat {
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-align: left;
  }
  
  .tournament-header__stat-number {
    font-size: 1.25rem;
  }
}
</style>
