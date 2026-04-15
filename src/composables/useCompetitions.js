import { ref } from "vue";
import { supabase } from "../lib/supabase";

/**
 * Fetches competitions for a given season.
 * Usage:
 *   const { competitions, loading, error, fetchCompetitions } = useCompetitions();
 *   await fetchCompetitions({ season: { start_date, end_date } });
 */
export function useCompetitions() {
    const competitions = ref([]);
    const loading = ref(false);
    const error = ref("");

    async function fetchCompetitions({ season } = {}) {
        loading.value = true;
        error.value = "";
        competitions.value = [];
        if (!season || !season.start_date || !season.end_date) {
            loading.value = false;
            return;
        }
        const { data, error: err } = await supabase
            .from("competitions")
            .select("id, name, competition_date, status")
            .gte("competition_date", season.start_date)
            .lte("competition_date", season.end_date);
        if (err) {
            error.value = err.message;
        } else {
            competitions.value = data || [];
        }
        loading.value = false;
    }

    return { competitions, loading, error, fetchCompetitions };
}
