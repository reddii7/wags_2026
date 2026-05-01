<script setup>
import { ref, computed, watch } from "vue";
import AppDialog from "../components/AppDialog.vue";
import QuietList from "../components/QuietList.vue";
import { triggerHapticFeedback } from "../utils/haptics";

const props = defineProps({
  season: { type: Object, required: true },
  metadata: { type: Object, required: true },
});

const rawLeagueRows = computed(() => {
  // Filter by selected season (id or start_year)
  const seasonId = props.season?.id;
  const seasonYear = String(props.season?.start_year);
  return (
    props.metadata?.leagues?.[seasonId] ||
    props.metadata?.leagues?.[seasonYear] ||
    []
  );
});

const canonicalLeagueNames = [
  "PREMIERSHIP",
  "CHAMPIONSHIP",
  "LEAGUE 1",
  "LEAGUE 2",
];

const leagueSortIndex = (name) => {
  const normalized = String(name || "").toUpperCase();
  const idx = canonicalLeagueNames.findIndex((n) => n === normalized);
  if (idx !== -1) return idx;
  const numMatch = normalized.match(/\bLEAGUE\s*(\d+)\b/);
  if (numMatch) return Number(numMatch[1]) + 1;
  return 999;
};

const getPlayerLabel = (row) =>
  String(row?.full_name || row?.player || row?.name || "").trim();

const normalizeLeagueToken = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseSeparatorLeagueLabel = (row) => {
  const label = normalizeLeagueToken(getPlayerLabel(row));
  if (/^LEAGUE\s*\d+$/.test(label)) {
    const num = label.match(/\d+/)?.[0] || "";
    return num ? `LEAGUE ${num}` : label;
  }
  if (canonicalLeagueNames.includes(label)) return label;
  return null;
};

const isLeagueSeparatorRow = (row) => {
  const rawName = getPlayerLabel(row);
  if (!rawName) return false;
  const label = normalizeLeagueToken(rawName);
  const isLabel =
    /^LEAGUE\s*\d+$/.test(label) ||
    canonicalLeagueNames.includes(label) ||
    /^LEAGUE/.test(label);
  const hasNoScore =
    row?.total_score === undefined ||
    row?.total_score === null ||
    row?.total_score === "";
  return isLabel && hasNoScore;
};

const isRenderableLeaguePlayerRow = (row) => {
  if (parseSeparatorLeagueLabel(row)) return false;
  if (isLeagueSeparatorRow(row)) return false;
  const hasName = !!getPlayerLabel(row);
  return hasName;
};

const resolveLeagueLabel = (row, fallbackIndex) => {
  const fromRow =
    row?.league_name ||
    row?.league ||
    row?.division ||
    row?.division_name ||
    row?.group_name ||
    row?.tier ||
    row?.league_title;

  if (fromRow !== undefined && fromRow !== null && String(fromRow).trim()) {
    return String(fromRow);
  }

  return canonicalLeagueNames[fallbackIndex] || `LEAGUE ${fallbackIndex + 1}`;
};

const buildGroupsFromResets = (rows) => {
  const grouped = [];
  let current = null;
  let lastPos = -Infinity;

  rows.forEach((row) => {
    const pos = Number(row.position ?? row.pos ?? row.rank_no ?? row.rank);
    const isValidPos = Number.isFinite(pos);
    const startsNewGroup = !current || (isValidPos && pos <= lastPos);

    if (startsNewGroup) {
      current = {
        leagueName: resolveLeagueLabel(row, grouped.length),
        rows: [],
      };
      grouped.push(current);
      lastPos = -Infinity;
    }

    current.rows.push(row);
    if (isValidPos) lastPos = pos;
  });

  return grouped;
};

const groups = computed(() => {
  const leagueRows = rawLeagueRows.value;
  if (!Array.isArray(leagueRows) || !leagueRows.length) return [];

  // Highest-priority parser: payloads that include embedded separator rows
  // such as "LEAGUE 1" inside the row list.
  const groupsFromSeparators = [];
  let separatorGroup = null;
  for (const rawRow of leagueRows) {
    const separatorLabel = parseSeparatorLeagueLabel(rawRow);
    if (separatorLabel) {
      separatorGroup = { leagueName: separatorLabel, rows: [] };
      groupsFromSeparators.push(separatorGroup);
      continue;
    }
    if (!separatorGroup) continue;
    separatorGroup.rows.push({
      ...rawRow,
      position: rawRow.position ?? rawRow.pos ?? rawRow.rank_no ?? rawRow.rank ?? "",
    });
  }
  if (groupsFromSeparators.length > 1) {
    return groupsFromSeparators
      .map((g) => ({
        leagueName: g.leagueName,
        rows: g.rows.filter(isRenderableLeaguePlayerRow),
      }))
      .filter((g) => g.rows.length)
      .sort((a, b) => leagueSortIndex(a.leagueName) - leagueSortIndex(b.leagueName));
  }

  // First pass: normalize rows and infer league labels from explicit fields
  // or embedded separator rows in flat payloads.
  let currentLabelFromSeparator = null;
  const normalizedRows = [];
  for (const rawRow of leagueRows) {
    if (isLeagueSeparatorRow(rawRow)) {
      currentLabelFromSeparator =
        parseSeparatorLeagueLabel(rawRow) ||
        String(rawRow.full_name || rawRow.player || rawRow.name);
      continue;
    }
    const explicitLabel =
      rawRow?.league_name ||
      rawRow?.league ||
      rawRow?.division ||
      rawRow?.division_name ||
      rawRow?.group_name ||
      rawRow?.tier ||
      rawRow?.league_title;

    normalizedRows.push({
      ...rawRow,
      position: rawRow.position ?? rawRow.pos ?? rawRow.rank_no ?? rawRow.rank ?? "",
      _leagueLabel: explicitLabel || currentLabelFromSeparator || null,
    });
  }

  if (!normalizedRows.length) return [];

  // Try grouping by inferred labels first.
  const mapped = new Map();
  for (const row of normalizedRows) {
    const key = resolveLeagueLabel({ ...row, league_name: row._leagueLabel }, mapped.size);
    if (!mapped.has(key)) mapped.set(key, []);
    mapped.get(key).push(row);
  }

  const groupedByLabel = [...mapped.entries()].map(([leagueName, players]) => ({
    leagueName,
    rows: [...players].sort((a, b) => {
      const pa = Number(a.position);
      const pb = Number(b.position);
      const va = Number.isFinite(pa) ? pa : 999;
      const vb = Number.isFinite(pb) ? pb : 999;
      return va - vb;
    }),
  }));

  // If everything collapses into one group, recover groups by detecting position resets.
  if (groupedByLabel.length <= 1 && normalizedRows.length > 15) {
    return buildGroupsFromResets(normalizedRows)
      .map((g) => ({
        leagueName: g.leagueName,
        rows: g.rows.filter(isRenderableLeaguePlayerRow),
      }))
      .filter((g) => g.rows.length)
      .sort(
      (a, b) => leagueSortIndex(a.leagueName) - leagueSortIndex(b.leagueName),
    );
  }

  return groupedByLabel
    .map((g) => ({
      leagueName: g.leagueName,
      rows: g.rows.filter(isRenderableLeaguePlayerRow),
    }))
    .filter((g) => g.rows.length)
    .sort((a, b) => leagueSortIndex(a.leagueName) - leagueSortIndex(b.leagueName));
});

const leagueNavIdx = ref(0);
const leagueNavList = computed(() => groups.value.map((g) => g.leagueName));
const selectedGroup = computed(() => groups.value[leagueNavIdx.value] || null);

watch(groups, (nextGroups) => {
  if (!nextGroups.length) {
    leagueNavIdx.value = 0;
    return;
  }
  if (leagueNavIdx.value > nextGroups.length - 1) {
    leagueNavIdx.value = 0;
  }
});
const selectedPlayer = ref(null);
const detailRows = ref([]);
const detailLoading = ref(false);
const isDetailOpen = ref(false);
const loading = ref(false);
const error = ref("");

const columns = [
  {
    key: "position",
    label: "POS",
    className: "numeric narrow",
    width: "3.5rem",
  },
  {
    key: "full_name",
    label: "PLAYER",
    className: "player",
    width: "minmax(0, 1fr)",
  },
  {
    key: "total_score",
    label: "PTS",
    className: "numeric",
    width: "5.5rem",
  },
];

const detailColumns = [
  {
    key: "competition_name",
    label: "Round",
    className: "player",
    width: "minmax(0, 1fr)",
  },
  {
    key: "competition_date",
    label: "Date",
    className: "numeric narrow",
    width: "6rem",
  },
  {
    key: "stableford_score",
    label: "Score",
    className: "numeric",
    width: "4.5rem",
  },
];

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
};

const formatLeagueTitle = (value) => {
  if (!value) return "LEAGUE";
  // Map league names to new names
  const leagueMap = canonicalLeagueNames;
  // Try to match by number or order
  const match = String(value).match(/\d+/);
  if (match && leagueMap[Number(match[0]) - 1]) {
    return leagueMap[Number(match[0]) - 1];
  }
  // Try to match by order if value is 0-based or 1-based index
  const idx = ["premiership", "championship", "league 1", "league 2"].findIndex(
    (n) => String(value).toLowerCase().includes(n.toLowerCase()),
  );
  if (idx !== -1) return leagueMap[idx];
  // Fallback: assign by order if possible
  const fallbackIdx = ["A", "B", "C", "D"].indexOf(String(value).toUpperCase());
  if (fallbackIdx !== -1) return leagueMap[fallbackIdx];
  return String(value).toUpperCase();
};

// No-op: groups is now computed from metadata

// Disable best 10 modal if not available in metadata
const openBest10 = (player) => {
  triggerHapticFeedback();
  selectedPlayer.value = player;
  detailLoading.value = true;

  const allRounds = props.metadata?.rounds || [];
  const allComps = props.metadata?.competitions || [];
  const allResults = props.metadata?.results || [];
  const seasonId = props.season?.id;
  const seasonYear = String(props.season?.start_year);

  // Filter competitions for this season
  const seasonCompIds = new Set(
    allComps
      .filter((c) => c.season === seasonId || String(c.season) === seasonYear)
      .map((c) => c.id),
  );

  const targetPlayerId = player.user_id || player.player_id || player.id;

  // Map player rounds with competition details
  const roundMap = new Map();
  [...allRounds, ...allResults].forEach((r) => {
    const rowUid = r.user_id || r.player_id;
    if (rowUid === targetPlayerId && seasonCompIds.has(r.competition_id)) {
      // Use Map to deduplicate by competition_id
      const existing = roundMap.get(r.competition_id);
      const score = r.stableford_score ?? r.score;
      if (!existing || score !== undefined) {
        roundMap.set(r.competition_id, {
          ...r,
          stableford_score: score,
        });
      }
    }
  });

  detailRows.value = Array.from(roundMap.values())
    .map((r) => {
      const comp = allComps.find((c) => c.id === r.competition_id);
      return {
        ...r,
        competition_name: comp?.name || "Unknown Round",
        competition_date: comp?.competition_date,
      };
    })
    .sort(
      (a, b) => new Date(b.competition_date) - new Date(a.competition_date),
    );

  detailLoading.value = false;
  isDetailOpen.value = true;
};

const closeBest10 = () => {
  triggerHapticFeedback();
  isDetailOpen.value = false;
  selectedPlayer.value = null;
  detailRows.value = [];
  detailLoading.value = false;
};

// No-op: all data is hydrated from metadata
</script>

<template>
  <section class="page-stack leagues-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline" style="margin-bottom: 0.5rem">
          League Standings
        </div>
        <p class="wags-body" style="margin: 0 auto; max-width: 500px">
          Standings for each league. Tap a player to view their best 10 scores.
        </p>
      </div>
    </section>

    <p v-if="loading" class="empty-state">Loading standings…</p>
    <p v-else-if="error" class="empty-state">{{ error }}</p>
    <p v-else-if="!groups.length" class="empty-state">
      No league data found for this season.
    </p>

    <nav v-if="groups.length > 1" class="league-round-nav" aria-label="League selector">
      <div class="league-round-scroll">
        <button
          v-for="(name, idx) in leagueNavList"
          :key="name"
          type="button"
          class="league-round-item"
          :class="{ active: leagueNavIdx === idx }"
          @click="leagueNavIdx = idx"
        >
          {{ formatLeagueTitle(name) }}
          <span v-if="leagueNavIdx === idx" class="league-round-line"></span>
        </button>
      </div>
    </nav>

    <section
      v-if="selectedGroup"
      class="content-panel content-panel--minimal content-panel--flush-top"
    >
      <QuietList
        :columns="columns"
        :hide-head="false"
        :rows="selectedGroup.rows"
        empty-text="No players in this league."
      >
        <template #full_name="{ row }">
          <div class="player-cell">
            <button class="row-button" type="button" @click="openBest10(row)">
              {{ row.full_name }}
            </button>
          </div>
        </template>
      </QuietList>
    </section>

    <AppDialog
      v-if="selectedPlayer"
      v-model="isDetailOpen"
      :aria-label="`${selectedPlayer.full_name} best 10 scores`"
      @close="closeBest10"
    >
      <template #header>
        <div class="panel-heading">
          <h3>{{ selectedPlayer.full_name }}</h3>
          <span>Best 10</span>
        </div>
      </template>

      <p v-if="detailLoading" class="empty-state">Loading best 10…</p>
      <p v-else-if="error" class="empty-state">{{ error }}</p>
      <QuietList
        v-else
        :columns="detailColumns"
        :hide-head="true"
        :rows="detailRows"
        empty-text="No best 10 scores yet."
      />
    </AppDialog>
  </section>
</template>

<style scoped>
.league-round-nav {
  background: var(--bg);
  border-bottom: 1px solid var(--line);
  padding: 0.1rem 0;
}

.league-round-scroll {
  display: flex;
  justify-content: space-evenly;
  padding: 0 0.5rem;
  gap: 0.25rem;
}

.league-round-item {
  position: relative;
  background: transparent;
  border: none;
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.6rem 0.75rem;
  min-width: 3.6rem;
  cursor: pointer;
  white-space: nowrap;
}

.league-round-item.active {
  color: var(--text);
}

.league-round-line {
  position: absolute;
  bottom: 0;
  left: 0.4rem;
  right: 0.4rem;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--accent);
}
</style>
