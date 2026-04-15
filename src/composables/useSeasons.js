import { ref } from "vue";
import { supabase } from "../lib/supabase";

/**
 * Fetches all seasons.
 * Usage:
 *   const { seasons, loading, error, fetchSeasons } = useSeasons();
 *   await fetchSeasons();
 */
export function useSeasons() {
    const seasons = ref([]);
    const loading = ref(false);
    const error = ref("");

    async function fetchSeasons() {
        loading.value = true;
        error.value = "";
        seasons.value = [];
        const { data, error: err } = await supabase
            .from("seasons")
            .select("*")
            .order("start_year", { ascending: false });
        if (err) {
            error.value = err.message;
        } else {
            seasons.value = data || [];
        }
        loading.value = false;
    }

    return { seasons, loading, error, fetchSeasons };
}
