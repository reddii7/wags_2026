import { ref } from "vue";
import { supabase } from "../lib/supabase";

/**
 * Fetches results_summary for a set of competition IDs.
 * Usage:
 *   const { summaries, loading, error, fetchSummaries } = useResultsSummary();
 *   await fetchSummaries({ competitionIds: [...] });
 */
export function useResultsSummary() {
    const summaries = ref([]);
    const loading = ref(false);
    const error = ref("");

    async function fetchSummaries({ competitionIds } = {}) {
        loading.value = true;
        error.value = "";
        summaries.value = [];
        if (!competitionIds || !competitionIds.length) {
            loading.value = false;
            return;
        }
        const { data, error: err } = await supabase
            .from("results_summary")
            .select("competition_id, winner_names, amount, winner_type, num_players, snakes, camels, week_number, week_date, second_names")
            .in("competition_id", competitionIds);
        if (err) {
            error.value = err.message;
        } else {
            summaries.value = data || [];
        }
        loading.value = false;
    }

    return { summaries, loading, error, fetchSummaries };
}
