import { ref } from "vue";
import { supabase } from "../lib/supabase";

/**
 * Fetches and updates user profiles.
 * Usage:
 *   const { profile, loading, error, fetchProfile, updateProfile } = useProfiles();
 */
export function useProfiles() {
    const profile = ref(null);
    const loading = ref(false);
    const error = ref("");

    async function fetchProfile(userId) {
        loading.value = true;
        error.value = "";
        profile.value = null;
        const { data, error: err } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .single();
        if (err) {
            error.value = err.message;
        } else {
            profile.value = data;
        }
        loading.value = false;
    }

    async function updateProfile(userId, data) {
        loading.value = true;
        error.value = "";
        const { error: err } = await supabase
            .from("profiles")
            .update(data)
            .eq("id", userId);
        if (err) {
            error.value = err.message;
        }
        loading.value = false;
    }

    return { profile, loading, error, fetchProfile, updateProfile };
}
