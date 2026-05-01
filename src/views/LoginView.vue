<script setup>
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSession } from "../composables/useSession";

const router = useRouter();
const route = useRoute();
const { signIn } = useSession();
const email = ref("");
const password = ref("");
const submitting = ref(false);
const error = ref("");

const handleSubmit = async () => {
  submitting.value = true;
  error.value = "";
  try {
    await signIn({ email: email.value, password: password.value });
    const redirectTarget =
      typeof route.query.redirect === "string"
        ? route.query.redirect
        : "/";
    await router.push(redirectTarget);
  } catch (loginError) {
    error.value = loginError.message;
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <section class="page-stack">
    <section class="content-panel auth-panel compact-panel">
      <div class="panel-heading">
        <h3>Sign in</h3>
        <span>Members area</span>
      </div>
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
          type="password"
          autocomplete="current-password"
          required
        />

        <button class="quiet-button" type="submit" :disabled="submitting">
          {{ submitting ? "Signing in…" : "Sign in" }}
        </button>
      </form>
      <p v-if="error" class="empty-state">{{ error }}</p>
    </section>
  </section>
</template>
