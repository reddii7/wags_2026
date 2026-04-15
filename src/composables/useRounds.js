import { ref } from "vue";
import { supabase } from "../lib/supabase";

/**
 * Fetches rounds for a given competition or season.
 * Usage:
 *   const { rounds, loading, error, fetchRounds } = useRounds();
 *   await fetchRounds({ competitionId, seasonId });
 */
export function useRounds() {
    const rounds = ref([]);
    const loading = ref(false);
    const error = ref("");

    async function fetchRounds({ competitionId, seasonId } = {}) {
        loading.value = true;
        error.value = "";
        rounds.value = [];
        let query = supabase.from("rounds").select("*");
        if (competitionId) query = query.eq("competition_id", competitionId);
        if (seasonId) query = query.eq("season_id", seasonId);
        const { data, error: err } = await query;
        if (err) {
            error.value = err.message;
        } else {
            rounds.value = data || [];
        }
        loading.value = false;
    }

    return { rounds, loading, error, fetchRounds };
}
