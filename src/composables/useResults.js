import { ref } from "vue";
import { supabase } from "../lib/supabase";

/**
 * Fetches results for a given competition or season.
 * Usage:
 *   const { results, loading, error, fetchResults } = useResults();
 *   await fetchResults({ competitionId, seasonId });
 */
export function useResults() {
    const results = ref([]);
    const loading = ref(false);
    const error = ref("");

    async function fetchResults({ competitionId, seasonId } = {}) {
        loading.value = true;
        error.value = "";
        results.value = [];
        let query = supabase.from("public_results_view").select("*");
        if (competitionId) query = query.eq("competition_id", competitionId);
        if (seasonId) query = query.eq("season_id", seasonId);
        const { data, error: err } = await query;
        if (err) {
            error.value = err.message;
        } else {
            results.value = data || [];
        }
        loading.value = false;
    }

    return { results, loading, error, fetchResults };
}
