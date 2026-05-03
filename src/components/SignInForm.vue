<script setup>
import { ref } from "vue";
import { useSession } from "../composables/useSession";

const showPassword = ref(false);
const email = ref("");
const password = ref("");
const submitting = ref(false);
const error = ref("");
const { signIn } = useSession();

const handleSubmit = async () => {
  submitting.value = true;
  error.value = "";
  try {
    await signIn({ email: email.value, password: password.value });
    // Success: parent should close dialog
  } catch (loginError) {
    error.value = loginError.message;
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <form class="auth-form" @submit.prevent="handleSubmit">
    <label class="field-label" for="login-email">Email</label>
    <input
      id="login-email"
      v-model="email"
      class="quiet-input"
      type="email"
      autocomplete="email"
      required
    />

    <label class="field-label" for="login-password">Password</label>
    <input
      id="login-password"
      v-model="password"
      class="quiet-input"
      :type="showPassword ? 'text' : 'password'"
      autocomplete="current-password"
      required
    />
    <label
      style="
        font-size: 0.9em;
        display: flex;
        align-items: center;
        gap: 0.5em;
        margin-bottom: 1em;
      "
    >
      <input
        type="checkbox"
        v-model="showPassword"
        style="width: 1em; height: 1em"
      />
      Show password
    </label>
    <button class="quiet-button" type="submit" :disabled="submitting">
      {{ submitting ? "Signing in…" : "Sign in" }}
    </button>
    <p v-if="error" class="empty-state" style="margin-top: 0.5em">
      {{ error }}
    </p>
  </form>
</template>
