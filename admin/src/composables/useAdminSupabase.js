import { ref, computed, onMounted } from "vue";
import { createClient } from "@supabase/supabase-js";

export const ADMIN_SB_KEY = Symbol("adminSupabase");

const STORAGE_KEY = "wags_admin_config";

export function useAdminSupabase() {
  const url = ref("");
  const key = ref("");
  const client = ref(null);
  const connectError = ref("");
  const connecting = ref(false);
  const lastProbeOk = ref(false);

  const connected = computed(() => !!client.value);

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const c = JSON.parse(raw);
      if (typeof c.url === "string") url.value = c.url;
      if (typeof c.key === "string") key.value = c.key;
    } catch {
      /* ignore */
    }
  }

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ url: url.value.trim(), key: key.value.trim() }),
    );
  }

  onMounted(() => {
    loadSaved();
    const u = import.meta.env.VITE_SUPABASE_URL;
    const k = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
    if (u && !url.value) url.value = u;
    if (k && !key.value) key.value = k;
  });

  async function connect() {
    connectError.value = "";
    lastProbeOk.value = false;
    connecting.value = true;
    client.value = null;
    try {
      const sb = createClient(url.value.trim(), key.value.trim(), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await sb.from("campaigns").select("id").limit(1);
      if (error) throw error;
      client.value = sb;
      lastProbeOk.value = true;
      persist();
    } catch (e) {
      connectError.value = e?.message || String(e);
    } finally {
      connecting.value = false;
    }
  }

  function disconnect() {
    client.value = null;
    lastProbeOk.value = false;
  }

  return {
    url,
    key,
    client,
    connectError,
    connecting,
    lastProbeOk,
    connected,
    connect,
    disconnect,
    persist,
  };
}
