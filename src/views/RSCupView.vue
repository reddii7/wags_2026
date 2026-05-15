<script setup>
import { computed, watch } from "vue";
import { triggerHapticFeedback } from "../utils/haptics";
import QuietList from "../components/QuietList.vue";

const props = defineProps({
  season: { type: Object, default: null },
  metadata: { type: Object, required: true },
  selectedCompetitionId: { type: String, default: null },
});

// Helper to resolve profile names
const getPlayer = (id) => {
  if (!id) return { full_name: "TBC" };
  return (
    props.metadata.profiles?.find((p) => p.id === id) || {
      full_name: "Unknown",
    }
  );
};

// Find the tournament for this season
const tournament = computed(() => {
  // Don't search if metadata is still loading
  if (props.metadata.loading) return null;

  const tournaments = props.metadata.matchplay_tournaments || [];
  const matches = props.metadata.matchplay_matches || [];

  // Find tournaments that have matches
  const tournamentsWithMatches = tournaments.filter((t) =>
    matches.some((m) => m.tournament_id === t.id),
  );

  // Prefer tournament with matches, fallback to first RS Cup tournament
  return (
    tournamentsWithMatches.find((t) =>
      t.name?.toLowerCase().includes("rs cup"),
    ) || tournaments.find((t) => t.name?.toLowerCase().includes("rs cup"))
  );
});

// Watch tournament changes
watch(tournament, (newTournament) => {}, { immediate: true });

// Format play_by_date nicely e.g. "Wed 20 May 2026"
const formatPlayBy = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "long", year: "numeric",
  });
};

// Group matches by stage_code for display (preserves the label the admin entered)
const roundsWithMatches = computed(() => {
  if (!tournament.value) return [];

  const matches = (props.metadata.matchplay_matches || []).filter(
    (m) => m.tournament_id === tournament.value.id,
  );

  // Group by stage_code, preserve order by round_number then slot_index
  const groups = {};
  matches.forEach((m) => {
    const key = m.stage_code || String(m.round_number);
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });

  return Object.keys(groups)
    .sort((a, b) => {
      const na = groups[a][0]?.round_number ?? 99;
      const nb = groups[b][0]?.round_number ?? 99;
      return na - nb;
    })
    .map((stageKey) => {
      const stageMatches = groups[stageKey];
      // Use stage_label from data; fall back to title-cased key
      const roundLabel =
        stageMatches[0]?.stage_label ||
        stageKey.replace(/\b\w/g, (c) => c.toUpperCase());
      // Use first non-null play_by_date in the group
      const playByRaw = stageMatches.find((m) => m.play_by_date)?.play_by_date ?? null;
      const playBy = formatPlayBy(playByRaw);

      return {
        roundNumber: stageMatches[0]?.round_number ?? 99,
        roundLabel,
        playBy,
        matches: stageMatches
          .sort((a, b) => (a.slot_index ?? 0) - (b.slot_index ?? 0))
          .map((match) => {
            const player1 = getPlayer(match.player1_id);
            const player2 = getPlayer(match.player2_id);
            return {
              id: match.id,
              player1: player1.full_name,
              player2: player2.full_name,
              match,
            };
          })
          .sort((a, b) => {
            if (a.match.winner_id && !b.match.winner_id) return -1;
            if (!a.match.winner_id && b.match.winner_id) return 1;
            return 0;
          }),
      };
    });
});

</script>

<template>
  <section class="page-stack rscup-page">
    <section class="hero-block home-hero cup-hero knockout-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">RS Cup 2026</div>
      </div>
    </section>

    <section
      class="content-panel content-panel--minimal content-panel--flush-top"
    >
      <div v-if="!tournament" class="empty-state">
        No tournament data found.
      </div>
      <div v-else-if="!roundsWithMatches.length" class="empty-state">
        The draw has not been made yet.
      </div>

      <div v-else class="rounds-container">
        <div
          v-for="round in roundsWithMatches"
          :key="round.roundNumber"
          class="round-section"
        >
          <h3 class="round-header round-header--left">{{ round.roundLabel }}</h3>

          <div class="matches-list">
            <p v-if="round.playBy && round.matches.every(m => !m.match.winner_id)" class="pending-deadline">Play by {{ round.playBy }}</p>
            <template v-for="(match, idx) in round.matches" :key="match.id">
              <template v-if="idx > 0 && !match.match.winner_id && round.matches[idx - 1].match.winner_id">
                <div class="matches-divider"></div>
                <p v-if="round.playBy" class="pending-deadline">Play by {{ round.playBy }}</p>
              </template>
              <div class="match-item">
              <div class="match-players">
                <span
                  class="player-name"
                  :class="{
                    winner: !!match.match.winner_id,
                  }"
                >
                  {{
                    match.match.winner_id
                      ? getPlayer(match.match.winner_id).full_name
                      : match.player1
                  }}
                </span>
                <span class="match-versus">{{ match.match.winner_id ? 'beat' : 'vs' }}</span>
                <span
                  class="player-name"
                  :class="{
                    loser: !!match.match.winner_id,
                  }"
                >
                  {{
                    match.match.winner_id
                      ? getPlayer(match.match.winner_id === match.match.player1_id ? match.match.player2_id : match.match.player1_id).full_name
                      : match.player2
                  }}
                </span>
              </div>
            </div>
            </template>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.knockout-hero {
  background: var(--surface-1);
  border-bottom: 0.5px solid var(--line);
  text-align: center;
  padding-bottom: 2rem;
}

.hero-description {
  margin: 0.5rem auto 0;
  max-width: 500px;
  opacity: 0.8;
}

.rounds-container {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.round-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.round-header {
  display: block;
  text-transform: uppercase;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #858585;
  margin-bottom: 0.5em;
  font-family: inherit;
  text-align: center;
  padding: 1rem 0 0.75rem;
}

.matches-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0 1rem 1.5rem;
}

.round-header--left {
  text-align: left;
  padding-left: 1rem;
  padding-right: 1rem;
}

.pending-deadline {
  display: block;
  text-transform: uppercase;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #858585;
  font-family: inherit;
  text-align: left;
  margin: 0 -1rem;
  padding: 1rem 1rem 0.75rem;
}

.matches-divider {
  height: 1.25rem;
}

.match-item {
  background: var(--surface-2);
  border-radius: 8px;
  padding: 0.75rem 1rem;
}

.match-players {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  text-align: center;
}

.player-name {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text);
  flex: 1;
  transition: all 0.3s ease;
}

.player-name.winner {
  font-weight: 900;
  color: var(--text);
}

.player-name.loser {
  opacity: 0.3;
  color: var(--muted);
}

.match-versus {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--muted);
  letter-spacing: 0.05em;
  flex-shrink: 0;
}
</style>
