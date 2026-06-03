import { ref, computed, onMounted } from "vue";
import { createClient } from "@supabase/supabase-js";

export const ADMIN_SB_KEY = Symbol("adminSupabase");

/** Greenfield v3 — same project as the member app (has public.campaigns). */
const FALLBACK_SUPABASE_URL = "https://iwzqzpzskawxrwhttufq.supabase.co";

const STORAGE_KEY = "wags_admin_config";

function projectRefFromUrl(url) {
  try {
    const host = new URL(String(url).trim()).hostname;
    const m = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function projectRefFromJwt(key) {
  try {
    const payload = JSON.parse(atob(String(key).trim().split(".")[1]));
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

function friendlyConnectError(err, { url = "", key = "" } = {}) {
  const msg = err?.message || String(err);
  const urlRef = projectRefFromUrl(url);
  const keyRef = projectRefFromJwt(key);
  if (urlRef && keyRef && urlRef !== keyRef) {
    return (
      `URL project (${urlRef}) does not match API key project (${keyRef}). ` +
      "The member app anon key is not the admin service role key — use both from the same project in Dashboard → Settings → API."
    );
  }
  if (/campaigns.*does not exist|relation.*campaigns/i.test(msg)) {
    return (
      "This database has no public.campaigns table (wrong or empty Supabase project). " +
      "The live member app does not use this table — it loads via fetch-all-data — so the app can work while admin fails. " +
      `Use ${FALLBACK_SUPABASE_URL} plus the service_role secret from that project. Click Disconnect to clear a cached URL/key.`
    );
  }
  if (/permission denied|row-level security|42501/i.test(msg)) {
    return (
      "Permission denied on campaigns. Use the service_role key (not the anon key from the member app)."
    );
  }
  return msg;
}

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
    const envUrl = import.meta.env.VITE_SUPABASE_URL;
    const envKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
    // .env beats stale localStorage (common cause of "campaigns does not exist" locally).
    url.value = envUrl || url.value || FALLBACK_SUPABASE_URL;
    if (envKey) key.value = envKey;

    if (envUrl && envKey) {
      void connect();
    }
  });

  async function connect() {
    connectError.value = "";
    lastProbeOk.value = false;
    connecting.value = true;
    client.value = null;
    try {
      const trimmedUrl = url.value.trim();
      const trimmedKey = key.value.trim();
      const sb = createClient(trimmedUrl, trimmedKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await sb.from("rounds").select("id").limit(1);
      if (error) throw error;
      client.value = sb;
      lastProbeOk.value = true;
      persist();
    } catch (e) {
      connectError.value = friendlyConnectError(e, {
        url: url.value,
        key: key.value,
      });
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
