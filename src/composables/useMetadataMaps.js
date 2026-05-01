import { computed } from "vue";

/**
 * Derives memoized lookup Maps from the global metadata object.
 * Pass the reactive `metadata` prop/ref and get back pre-built Maps
 * that are only recomputed when their source arrays change.
 *
 * Usage:
 *   const { playerById, compById, seasonCompIds } = useMetadataMaps(
 *     computed(() => props.metadata),
 *   );
 */
export function useMetadataMaps(metadataRef) {
    /** Map<userId, profile> */
    const playerById = computed(() => {
        const map = new Map();
        for (const p of metadataRef.value?.profiles ?? []) {
            map.set(p.id, p);
        }
        return map;
    });

    /** Map<competitionId, competition> */
    const compById = computed(() => {
        const map = new Map();
        for (const c of metadataRef.value?.competitions ?? []) {
            map.set(c.id, c);
        }
        return map;
    });

    /** Map<seasonId, Set<competitionId>> */
    const seasonCompIds = computed(() => {
        const map = new Map();
        for (const c of metadataRef.value?.competitions ?? []) {
            if (!c.season) continue;
            if (!map.has(c.season)) map.set(c.season, new Set());
            map.get(c.season).add(c.id);
        }
        return map;
    });

    return { playerById, compById, seasonCompIds };
}
