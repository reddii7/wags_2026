<script setup>
import { ref, inject } from "vue";

const admin = inject("adminCtx");

const title = ref("");
const body = ref("");
const url = ref("/");
const sending = ref(false);
const result = ref(null);

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://iwzqzpzskawxrwhttufq.supabase.co";

const appUrl = import.meta.env.VITE_APP_URL || "https://wags.netlify.app";

const SEND_PUSH_URL = SUPABASE_URL.replace(".supabase.co", ".functions.supabase.co") + "/send-push";

async function send() {
  if (!title.value.trim() || !body.value.trim()) {
    result.value = { ok: false, message: "Title and message are required." };
    return;
  }
  sending.value = true;
  result.value = null;
  try {
    const sb = admin?.client?.value;
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData?.session?.access_token;

    const res = await fetch(SEND_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        title: title.value.trim(),
        body: body.value.trim(),
        url: url.value.trim() || "/",
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      result.value = { ok: false, message: json.error || `HTTP ${res.status}` };
    } else {
      const errDetail = json.errors?.length ? ` — ${json.errors.join("; ")}` : "";
      result.value = {
        ok: json.sent > 0,
        message: `Sent to ${json.sent} of ${json.total} device${json.total !== 1 ? "s" : ""}${json.stale_removed ? `, ${json.stale_removed} stale removed` : ""}${errDetail}.`,
      };
      title.value = "";
      body.value = "";
    }
  } catch (e) {
    result.value = { ok: false, message: e?.message || String(e) };
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="view">
    <h1 class="h1">Send Notification</h1>
    <p class="lede">
      Broadcast a push notification to all subscribed devices.
      Members receive it even when the app is closed.
    </p>

    <div class="form-card">
      <div class="field">
        <label class="label">Title</label>
        <input v-model="title" class="input" placeholder="e.g. Week 8 results are in" maxlength="80" />
      </div>

      <div class="field">
        <label class="label">Message</label>
        <textarea v-model="body" class="input textarea" placeholder="e.g. Mark Ready wins with 22 points, £7.50 added to his season winnings." maxlength="200" rows="3" />
      </div>

      <div class="field">
        <label class="label">Open URL (optional)</label>
        <select v-model="url" class="input">
          <option value="/">Home</option>
          <option value="/results">Results</option>
          <option value="/rscup">RS Cup</option>
          <option value="/handicaps">Handicaps</option>
          <option value="/stats">Stats</option>
        </select>
      </div>

      <button class="btn-send" :disabled="sending" @click="send">
        {{ sending ? "Sending…" : "Send to all subscribers" }}
      </button>

      <p v-if="result" :class="['result', result.ok ? 'ok' : 'err']">
        {{ result.message }}
      </p>
    </div>

    <div class="tips">
      <h2 class="tips-h">Tips</h2>
      <ul class="tips-list">
        <li>Members must have tapped <strong>Allow</strong> in the app at least once to receive notifications.</li>
        <li>iOS requires the app to be added to the home screen before push works.</li>
        <li>Stale subscriptions (uninstalled apps) are cleaned up automatically on send.</li>
      </ul>
    </div>

    <div class="debug-section">
      <h2 class="tips-h">Re-prompt a device</h2>
      <p class="tips-p">If the Allow banner isn't showing, open this link on the device from the home screen icon:</p>
      <code class="debug-url">{{ appUrl }}?enablePush=1</code>
    </div>
  </div>
</template>

<style scoped>
.h1 { margin: 0 0 0.35rem; font-size: 1.15rem; }
.lede { margin: 0 0 1.5rem; color: var(--muted); font-size: 0.88rem; line-height: 1.45; }

.form-card {
  background: var(--surface, #1e1e1e);
  border: 1px solid var(--line, #333);
  border-radius: 10px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 520px;
  margin-bottom: 2rem;
}

.field { display: flex; flex-direction: column; gap: 0.35rem; }
.label { font-size: 0.8rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }

.input {
  background: var(--bg, #111);
  border: 1px solid var(--line, #333);
  border-radius: 6px;
  color: var(--text, #eee);
  font-size: 0.9rem;
  padding: 0.55rem 0.75rem;
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
}
.input:focus { outline: none; border-color: var(--accent, #30d158); }
.textarea { resize: vertical; min-height: 72px; }

.btn-send {
  align-self: flex-start;
  background: var(--accent, #30d158);
  color: #000;
  border: none;
  border-radius: 8px;
  padding: 0.6rem 1.4rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-send:disabled { opacity: 0.5; cursor: not-allowed; }

.result { font-size: 0.88rem; margin: 0; padding: 0.5rem 0.75rem; border-radius: 6px; }
.result.ok { background: color-mix(in srgb, #30d158 15%, transparent); color: #30d158; }
.result.err { background: color-mix(in srgb, #c44 15%, transparent); color: #f87171; }

.tips { max-width: 520px; }
.tips-h { font-size: 0.9rem; margin: 0 0 0.5rem; color: var(--muted); }
.tips-list { margin: 0; padding-left: 1.2rem; font-size: 0.85rem; color: var(--muted); line-height: 1.8; }

.debug-section { max-width: 520px; margin-top: 1.5rem; }
.tips-p { font-size: 0.85rem; color: var(--muted); margin: 0 0 0.5rem; }
.debug-url {
  display: block;
  background: var(--bg, #111);
  border: 1px solid var(--line, #333);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
  color: var(--accent, #30d158);
  word-break: break-all;
  user-select: all;
}
</style>
