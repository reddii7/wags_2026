import { createRouter, createWebHistory } from "vue-router";
import DashboardView from "@/views/DashboardView.vue";
import EntityAdminPage from "@/views/EntityAdminPage.vue";
import { ENTITY_ADMIN_PAGES } from "@/config/entityAdminConfig.js";
import PreviewHomeView from "@/views/PreviewHomeView.vue";
import PreviewResultsView from "@/views/PreviewResultsView.vue";
import PreviewLeaguesView from "@/views/PreviewLeaguesView.vue";
import PreviewBest14View from "@/views/PreviewBest14View.vue";
import PreviewHandicapsView from "@/views/PreviewHandicapsView.vue";
import PreviewRscupView from "@/views/PreviewRscupView.vue";
import PreviewStatsHubView from "@/views/PreviewStatsHubView.vue";
import RpcDevView from "@/views/RpcDevView.vue";
import SeasonCloseView from "@/views/SeasonCloseView.vue";

const manageRoutes = ENTITY_ADMIN_PAGES.map((p) => ({
  path: p.path,
  name: p.name,
  component: EntityAdminPage,
  meta: {
    title: p.title,
    step: p.step,
    entity: p.entity,
  },
}));

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "dashboard", component: DashboardView, meta: { title: "Overview" } },
    {
      path: "/manage/season-close",
      name: "season-close",
      component: SeasonCloseView,
      meta: { title: "Close summer (P/R)" },
    },
    ...manageRoutes,
    {
      path: "/app/stats",
      name: "app-stats",
      component: PreviewStatsHubView,
      meta: { title: "Stats hub preview" },
    },
    {
      path: "/app/home",
      name: "app-home",
      component: PreviewHomeView,
      meta: { title: "Home preview" },
    },
    {
      path: "/app/results",
      name: "app-results",
      component: PreviewResultsView,
      meta: { title: "Results preview" },
    },
    {
      path: "/app/leagues",
      name: "app-leagues",
      component: PreviewLeaguesView,
      meta: { title: "Leagues preview" },
    },
    {
      path: "/app/best14",
      name: "app-best14",
      component: PreviewBest14View,
      meta: { title: "Best 14 preview" },
    },
    {
      path: "/app/handicaps",
      name: "app-handicaps",
      component: PreviewHandicapsView,
      meta: { title: "Handicaps preview" },
    },
    {
      path: "/app/rscup",
      name: "app-rscup",
      component: PreviewRscupView,
      meta: { title: "RS Cup preview" },
    },
    {
      path: "/dev/rpc",
      name: "rpc",
      component: RpcDevView,
      meta: { title: "RPC" },
    },
  ],
});
