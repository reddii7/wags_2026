<script setup>
import { ref, inject } from "vue";

const admin = inject("adminCtx");
const rpcName = ref("");
const rpcParamsText = ref("{}");
const rpcBusy = ref(false);
const rpcError = ref("");
const rpcResult = ref("");

async function runRpc() {
  rpcError.value = "";
  rpcResult.value = "";
  const sb = admin?.client?.value;
  if (!sb) {
    rpcError.value = "Connect first.";
    return;
  }
  const name = rpcName.value.trim();
  if (!name) {
    rpcError.value = "Enter a function name.";
    return;
  }
  let params = {};
  const raw = rpcParamsText.value.trim();
  if (raw) {
    try {
      params = JSON.parse(raw);
    } catch {
      rpcError.value = "Params must be valid JSON.";
      return;
    }
  }
  rpcBusy.value = true;
  try {
    const { data, error } = await sb.rpc(name, params);
    if (error) throw error;
    rpcResult.value =
      data === undefined || data === null
        ? String(data)
        : JSON.stringify(data, null, 2);
  } catch (e) {
    rpcError.value = e?.message || String(e);
  } finally {
    rpcBusy.value = false;
  }
}
</script>

<template>
  <div class="view">
    <h1 class="h1">RPC console</h1>
    <p class="lede">Call Postgres RPCs with the service-role client (greenfield has none yet).</p>
    <label class="field">
      <span class="label">Function</span>
      <input v-model="rpcName" class="input mono" type="text" spellcheck="false" />
    </label>
    <label class="field">
      <span class="label">Params (JSON)</span>
      <textarea v-model="rpcParamsText" class="textarea mono" rows="5" spellcheck="false" />
    </label>
    <button
      type="button"
      class="btn primary"
      :disabled="rpcBusy || !rpcName.trim()"
      @click="runRpc"
    >
      {{ rpcBusy ? "Running…" : "Run RPC" }}
    </button>
    <p v-if="rpcError" class="err">{{ rpcError }}</p>
    <pre v-if="rpcResult" class="pre">{{ rpcResult }}</pre>
  </div>
</template>

<style scoped>
.h1 {
  font-size: 1.1rem;
  margin: 0 0 0.35rem;
}
.lede {
  color: var(--muted);
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.85rem;
}
.label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
}
.input,
.textarea {
  width: 100%;
  max-width: 560px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
  background: var(--bg);
  color: var(--text);
  font-size: 0.9rem;
}
.mono {
  font-family: ui-monospace, monospace;
  font-size: 0.82rem;
}
.btn {
  border-radius: 8px;
  border: 1px solid var(--accent);
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  background: var(--accent);
  color: #fff;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.err {
  color: #fecaca;
  font-size: 0.88rem;
}
.pre {
  margin-top: 1rem;
  padding: 0.85rem;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  overflow: auto;
  max-height: 400px;
  font-size: 0.78rem;
}
</style>
