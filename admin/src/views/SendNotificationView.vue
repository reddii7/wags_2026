<script setup>
import { computed, ref, inject } from "vue";
import AdminButton from "@/components/AdminButton.vue";
import AdminNotice from "@/components/AdminNotice.vue";
import AdminPageHeader from "@/components/AdminPageHeader.vue";

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

const titleCount = computed(() => title.value.length);
const bodyCount = computed(() => body.value.length);
const canSend = computed(
  () => Boolean(admin?.client?.value) && title.value.trim() && body.value.trim() && !sending.value,
);

async function send() {
  if (!admin?.client?.value) {
    result.value = { ok: false, message: "Connect to Supabase before sending notifications." };
    return;
  }
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
    <AdminPageHeader
      eyebrow="Communications"
      title="Send notification"
      description="Broadcast a push notification to all subscribed devices. Members receive it even when the app is closed."
    />

    <AdminNotice v-if="!admin?.client?.value" tone="warning">
      Connect to Supabase first so the send function receives admin credentials.
    </AdminNotice>

    <div class="compose-layout">
      <section class="form-card" aria-label="Compose push notification">
        <div class="field">
          <div class="label-row">
            <label class="label" for="notification-title">Title</label>
            <span class="counter">{{ titleCount }}/80</span>
          </div>
          <input
            id="notification-title"
            v-model="title"
            class="input"
            placeholder="e.g. Week 8 results are in"
            maxlength="80"
          />
        </div>

        <div class="field">
          <div class="label-row">
            <label class="label" for="notification-body">Message</label>
            <span class="counter">{{ bodyCount }}/200</span>
          </div>
          <textarea
            id="notification-body"
            v-model="body"
            class="input textarea"
            placeholder="e.g. Mark Ready wins with 22 points, £7.50 added to his season winnings."
            maxlength="200"
            rows="4"
          />
        </div>

        <div class="field">
          <label class="label" for="notification-url">Open URL</label>
          <select id="notification-url" v-model="url" class="input">
            <option value="/">Home</option>
            <option value="/results">Results</option>
            <option value="/rscup">RS Cup</option>
            <option value="/handicaps">Handicaps</option>
            <option value="/stats">Stats</option>
          </select>
        </div>

        <div class="form-actions">
          <AdminButton variant="primary" :disabled="!canSend" @click="send">
            {{ sending ? "Sending…" : "Send to all subscribers" }}
          </AdminButton>
          <span class="send-meta">Destination: {{ url || "/" }}</span>
        </div>

        <AdminNotice v-if="result" :tone="result.ok ? 'success' : 'error'">
          {{ result.message }}
        </AdminNotice>
      </section>

      <aside class="preview-card" aria-label="Notification preview and tips">
        <div class="phone-preview">
          <span class="preview-app">WAGS</span>
          <strong>{{ title.trim() || "Notification title" }}</strong>
          <p>{{ body.trim() || "Your message preview appears here before sending." }}</p>
        </div>

        <div class="tips">
          <h2 class="tips-h">Delivery notes</h2>
          <ul class="tips-list">
            <li>Members must have tapped <strong>Allow</strong> in the app at least once.</li>
            <li>iOS requires the app to be added to the home screen before push works.</li>
            <li>Stale subscriptions are cleaned up automatically on send.</li>
          </ul>
        </div>

        <div class="debug-section">
          <h2 class="tips-h">Re-prompt a device</h2>
          <p class="tips-p">Open this link on the device from the home screen icon:</p>
          <code class="debug-url">{{ appUrl }}?enablePush=1</code>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.view {
  display: grid;
  gap: 1.25rem;
  max-width: 1080px;
}

.compose-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(18rem, 0.75fr);
  gap: 1rem;
  align-items: start;
}

.form-card,
.preview-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}

.form-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
}

.preview-card {
  display: grid;
  gap: 1.2rem;
  padding: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.label {
  font-size: 0.72rem;
  color: var(--muted);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.counter,
.send-meta {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
}

.input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 0.65rem 0.75rem;
  background: color-mix(in srgb, var(--panel) 88%, var(--bg));
  color: var(--text);
  font-family: inherit;
  font-size: 0.9rem;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}

.input:focus {
  border-color: color-mix(in srgb, var(--accent) 52%, var(--line));
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.textarea {
  resize: vertical;
  min-height: 7.5rem;
  line-height: 1.45;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.7rem;
}

.phone-preview {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 1.5rem;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 16%, transparent), transparent 9rem),
    color-mix(in srgb, var(--panel-strong) 82%, var(--bg));
}

.preview-app {
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.phone-preview strong {
  font-size: 0.98rem;
}

.phone-preview p {
  margin: 0;
  color: var(--muted-strong);
  font-size: 0.85rem;
  line-height: 1.4;
}

.tips-h {
  font-size: 0.85rem;
  margin: 0 0 0.5rem;
  color: var(--muted-strong);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.tips-list {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.84rem;
  color: var(--muted);
  line-height: 1.75;
}

.tips-p {
  font-size: 0.84rem;
  color: var(--muted);
  margin: 0 0 0.5rem;
}

.debug-url {
  display: block;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 0.6rem 0.75rem;
  background: color-mix(in srgb, var(--panel) 88%, var(--bg));
  color: var(--accent);
  font-size: 0.78rem;
  word-break: break-all;
  user-select: all;
}

@media (max-width: 860px) {
  .compose-layout {
    grid-template-columns: 1fr;
  }
}
</style>
