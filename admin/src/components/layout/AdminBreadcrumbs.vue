<script setup>
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";

const route = useRoute();

const crumbs = computed(() => {
  const matched = route.matched.filter((r) => r.meta?.title);
  if (!matched.length) {
    return [{ label: "Overview", to: "/" }];
  }
  return matched.map((r, i) => {
    const isLast = i === matched.length - 1;
    const path = r.path.includes(":") ? route.path : r.path || "/";
    return {
      label: r.meta.title,
      to: isLast ? null : path === "" ? "/" : path,
    };
  });
});
</script>

<template>
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <ol class="crumb-list">
      <li v-for="(crumb, i) in crumbs" :key="`${crumb.label}-${i}`" class="crumb-item">
        <span v-if="i > 0" class="sep" aria-hidden="true">/</span>
        <RouterLink v-if="crumb.to" :to="crumb.to" class="crumb-link">{{ crumb.label }}</RouterLink>
        <span v-else class="crumb-current">{{ crumb.label }}</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.breadcrumbs {
  margin-bottom: 0.85rem;
}

.crumb-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.15rem 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
}

.crumb-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.sep {
  color: var(--muted);
  user-select: none;
}

.crumb-link {
  color: var(--muted);
  text-decoration: none;
}

.crumb-link:hover {
  color: var(--accent);
}

.crumb-current {
  color: var(--text);
  font-weight: 600;
}
</style>
