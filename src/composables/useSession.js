import { computed, ref } from 'vue';
import { supabase } from '../lib/supabase';

const user = ref(null);
const profile = ref(null);
const loading = ref(true);
let initialized = false;

const loadProfile = async (sessionUser) => {
    if (!sessionUser) {
        user.value = null;
        profile.value = null;
        return null;
    }

    user.value = sessionUser;
    const { data, error } = await supabase
        .from('members')
        .select('id, full_name')
        .eq('id', sessionUser.id)
        .single();

    if (error) {
        profile.value = null;
        return null;
    }

    profile.value = {
        id: data.id,
        full_name: data.full_name,
        role: 'member',
        league_name: null,
        current_handicap: null,
    };
    return profile.value;
};

export const initializeSession = async () => {
    if (initialized) return;
    initialized = true;

    const {
        data: { session },
    } = await supabase.auth.getSession();
    await loadProfile(session?.user || null);
    loading.value = false;

    supabase.auth.onAuthStateChange(async (_event, sessionState) => {
        loading.value = true;
        await loadProfile(sessionState?.user || null);
        loading.value = false;
    });
};

export const useSession = () => {
    const role = computed(() => profile.value?.role || 'public');

    const signIn = async ({ email, password }) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    };

    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    };

    return {
        user: computed(() => user.value),
        profile: computed(() => profile.value),
        role,
        loading: computed(() => loading.value),
        signIn,
        signOut,
    };
};
