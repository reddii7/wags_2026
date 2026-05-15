<script setup>
import { provide } from "vue";
import { RouterView } from "vue-router";
import { useAdminSupabase } from "./composables/useAdminSupabase.js";

const admin = useAdminSupabase();
provide("adminCtx", admin);
</script>

<template>
  <RouterView />
</template>
