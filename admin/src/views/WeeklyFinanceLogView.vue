<script setup>
import { computed, inject, ref, watch } from "vue";
import { RouterLink } from "vue-router";

const admin = inject("adminCtx");

const campaigns = ref([]);
const campaignId = ref("");
const rows = ref([]);
const loading = ref(false);
const error = ref("");

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
}

function formatMoney(pence) {
  if (pence == null || Number.isNaN(Number(pence))) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(Number(pence) / 100);
}

function formatSignedMoney(pence) {
  if (pence == null || Number.isNaN(Number(pence))) return "—";
  const value = Number(pence);
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatMoney(value)}`;
}

function formatRoundLabel(round) {
  const parts = [];
  if (round.play_order != null) parts.push(`Week ${round.play_order}`);
  if (round.name) parts.push(round.name);
  return parts.join(" · ") || round.round_type || "Round";
}

function pickDefaultCampaignId(list) {
  if (!list?.length) return "";
  return (
    list.find((c) => c.kind === "summer_main" && c.status === "open")?.id ||
    list.find((c) => c.kind === "winter_reduced" && c.status === "open")?.id ||
    list[0]?.id ||
    ""
  );
}

function makeBlankAgg() {
  return {
    entrants: 0,
    entryFeesPence: 0,
    snakeCount: 0,
    camelCount: 0,
    finesPence: 0,
    collectedPence: 0,
    scoredCount: 0,
    dqCount: 0,
  };
}

async function loadCampaignOptions() {
  const sb = admin?.client?.value;
  if (!sb) {
    campaigns.value = [];
    campaignId.value = "";
    return;
  }
  const { data, error: qerr } = await sb
    .from("campaigns")
    .select("id, label, year, kind, status")
    .order("year", { ascending: false });
  if (qerr) throw qerr;
  campaigns.value = data ?? [];
  if (!campaigns.value.some((c) => c.id === campaignId.value)) {
    campaignId.value = pickDefaultCampaignId(campaigns.value);
  }
}

async function loadFinanceLog() {
  const sb = admin?.client?.value;
  if (!sb || !campaignId.value) {
    rows.value = [];
    return;
  }

  loading.value = true;
  error.value = "";
  try {
    const { data: rounds, error: roundsError } = await sb
      .from("rounds")
      .select("id, name, play_order, round_date, round_type, finalized, campaign_id, campaigns(label, kind, year)")
      .eq("campaign_id", campaignId.value)
      .in("round_type", ["summer_weekly", "winter_weekly"])
      .order("play_order", { ascending: true, nullsFirst: false })
      .order("round_date", { ascending: true })
      .limit(200);
    if (roundsError) throw roundsError;

    const roundList = rounds ?? [];
    if (!roundList.length) {
      rows.value = [];
      return;
    }

    const roundIds = roundList.map((round) => round.id);

    const [{ data: prizeRows, error: prizeError }, { data: playerRows, error: playerError }] =
      await Promise.all([
        sb
          .from("weekly_prize_state")
          .select(
            "round_id, winner_member_id, paid_out_pence, rollover_carried_in, rollover_carried_out, to_bank_pence, bank_wallet, members(full_name)",
          )
          .in("round_id", roundIds),
        sb
          .from("round_players")
          .select(
            "round_id, member_id, stableford_points, entry_fee_pence, snake_count, camel_count, entered, disqualified",
          )
          .in("round_id", roundIds),
      ]);

    if (prizeError) throw prizeError;
    if (playerError) throw playerError;

    const prizeByRound = new Map((prizeRows ?? []).map((row) => [row.round_id, row]));
    const playersByRound = new Map();

    for (const row of playerRows ?? []) {
      const agg = playersByRound.get(row.round_id) ?? makeBlankAgg();
      const entered = row.entered !== false;
      if (entered) {
        agg.entrants += 1;
        agg.entryFeesPence += Number(row.entry_fee_pence) || 0;
        agg.snakeCount += Number(row.snake_count) || 0;
        agg.camelCount += Number(row.camel_count) || 0;
        if (row.stableford_points != null) agg.scoredCount += 1;
        if (row.disqualified) agg.dqCount += 1;
      }
      agg.finesPence = (agg.snakeCount + agg.camelCount) * 100;
      agg.collectedPence = agg.entryFeesPence + agg.finesPence;
      playersByRound.set(row.round_id, agg);
    }

    rows.value = roundList.map((round) => {
      const prize = prizeByRound.get(round.id) ?? null;
      const agg = playersByRound.get(round.id) ?? makeBlankAgg();
      const rolloverIn = Number(prize?.rollover_carried_in) || 0;
      const paidOut = Number(prize?.paid_out_pence) || 0;
      const banked = Number(prize?.to_bank_pence) || 0;
      const rolloverOut = Number(prize?.rollover_carried_out) || 0;
      const accountingDelta = round.finalized
        ? agg.collectedPence + rolloverIn - paidOut - banked - rolloverOut
        : null;

      let financeStatus = "Awaiting scores";
      if (round.finalized && prize) financeStatus = "Booked";
      else if (round.finalized) financeStatus = "Finalized · finance missing";
      else if (agg.entrants) financeStatus = "Open";

      let winnerLabel = "—";
      if (prize?.winner_member_id) winnerLabel = prize.members?.full_name ?? "Winner recorded";
      else if (prize && rolloverOut > 0) winnerLabel = "Tie / rollover";

      return {
        id: round.id,
        roundDate: round.round_date,
        roundLabel: formatRoundLabel(round),
        roundType: round.round_type,
        finalized: Boolean(round.finalized),
        financeStatus,
        entrants: agg.entrants,
        scoredCount: agg.scoredCount,
        dqCount: agg.dqCount,
        entryFeesPence: agg.entryFeesPence,
        finesPence: agg.finesPence,
        collectedPence: agg.collectedPence,
        paidOutPence: prize ? paidOut : null,
        bankedPence: prize ? banked : null,
        rolloverInPence: prize ? rolloverIn : null,
        rolloverOutPence: prize ? rolloverOut : null,
        accountingDelta,
        winnerLabel,
        bankWallet: prize?.bank_wallet ?? "—",
      };
    });
  } catch (e) {
    error.value = e?.message || String(e);
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

const selectedCampaign = computed(
  () => campaigns.value.find((campaign) => campaign.id === campaignId.value) ?? null,
);

const summary = computed(() => {
  const finalizedRows = rows.value.filter((row) => row.finalized);
  const bookedRows = finalizedRows.filter((row) => row.financeStatus === "Booked");
  const latestBooked = [...bookedRows].reverse()[0] ?? null;
  return {
    weeks: rows.value.length,
    bookedWeeks: bookedRows.length,
    collectedPence: rows.value.reduce((sum, row) => sum + (Number(row.collectedPence) || 0), 0),
    paidOutPence: bookedRows.reduce((sum, row) => sum + (Number(row.paidOutPence) || 0), 0),
    bankedPence: bookedRows.reduce((sum, row) => sum + (Number(row.bankedPence) || 0), 0),
    openRolloverPence: latestBooked?.rolloverOutPence ?? 0,
    flaggedWeeks: rows.value.filter(
      (row) => row.finalized && (row.financeStatus !== "Booked" || row.accountingDelta !== 0),
    ).length,
  };
});

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv() {
  if (!rows.value.length) return;
  const headers = [
    "round_date",
    "round_label",
    "round_type",
    "status",
    "entrants",
    "scored_count",
    "dq_count",
    "entry_fees_pence",
    "fines_pence",
    "collected_pence",
    "rollover_in_pence",
    "paid_out_pence",
    "to_bank_pence",
    "rollover_out_pence",
    "accounting_delta_pence",
    "winner",
    "bank_wallet",
  ];
  const body = rows.value.map((row) => [
    row.roundDate,
    row.roundLabel,
    row.roundType,
    row.financeStatus,
    row.entrants,
    row.scoredCount,
    row.dqCount,
    row.entryFeesPence,
    row.finesPence,
    row.collectedPence,
    row.rolloverInPence ?? "",
    row.paidOutPence ?? "",
    row.bankedPence ?? "",
    row.rolloverOutPence ?? "",
    row.accountingDelta ?? "",
    row.winnerLabel,
    row.bankWallet,
  ]);
  const csv = [headers, ...body].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `weekly-finance-${selectedCampaign.value?.label || "campaign"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

watch(
  () => admin?.client?.value,
  async () => {
    try {
      await loadCampaignOptions();
      await loadFinanceLog();
    } catch (e) {
      error.value = e?.message || String(e);
    }
  },
  { immediate: true },
);

watch(campaignId, async (next, prev) => {
  if (!next || next === prev) return;
  await loadFinanceLog();
});
</script>

<template>
  <div class="finance-log">
    <header class="page-header">
      <div>
        <p class="eyebrow">Treasurer view</p>
        <h1>Weekly finance log</h1>
        <p class="lede">
          Booked weekly prize rows, bank movements, rollover, and cash collected from entered scores.
        </p>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="secondary-button"
          :disabled="loading || !rows.length"
          @click="downloadCsv"
        >
          Download CSV
        </button>
        <button type="button" class="secondary-button" :disabled="loading" @click="loadFinanceLog">
          {{ loading ? "Refreshing…" : "Refresh" }}
        </button>
      </div>
    </header>

    <p v-if="!admin?.client?.value" class="notice notice--warn">Connect to Supabase in the header first.</p>

    <template v-else>
      <section class="toolbar-card">
        <label class="field-pill">
          <span>Campaign</span>
          <select v-model="campaignId" :disabled="loading || !campaigns.length">
            <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
              {{ campaign.label }} ({{ campaign.year }}) · {{ campaign.kind }} · {{ campaign.status }}
            </option>
          </select>
        </label>
      </section>

      <p v-if="error" class="notice notice--error">{{ error }}</p>

      <section v-if="selectedCampaign" class="summary-grid">
        <article class="summary-card">
          <span class="summary-label">Weeks</span>
          <strong class="summary-value">{{ summary.weeks }}</strong>
          <span class="summary-sub">{{ summary.bookedWeeks }} booked</span>
        </article>
        <article class="summary-card">
          <span class="summary-label">Collected</span>
          <strong class="summary-value">{{ formatMoney(summary.collectedPence) }}</strong>
          <span class="summary-sub">Entry fees + snake/camel fines</span>
        </article>
        <article class="summary-card">
          <span class="summary-label">Paid out</span>
          <strong class="summary-value">{{ formatMoney(summary.paidOutPence) }}</strong>
          <span class="summary-sub">Booked weekly winner payouts</span>
        </article>
        <article class="summary-card">
          <span class="summary-label">Banked</span>
          <strong class="summary-value">{{ formatMoney(summary.bankedPence) }}</strong>
          <span class="summary-sub">Booked to bank wallets</span>
        </article>
        <article class="summary-card">
          <span class="summary-label">Open rollover</span>
          <strong class="summary-value">{{ formatMoney(summary.openRolloverPence) }}</strong>
          <span class="summary-sub">Latest booked rollover out</span>
        </article>
        <article class="summary-card" :class="{ 'summary-card--warn': summary.flaggedWeeks > 0 }">
          <span class="summary-label">Needs attention</span>
          <strong class="summary-value">{{ summary.flaggedWeeks }}</strong>
          <span class="summary-sub">Missing finance row or accounting mismatch</span>
        </article>
      </section>

      <section class="table-card">
        <div v-if="loading" class="empty-state">Loading…</div>
        <div v-else-if="!rows.length" class="empty-state">No weekly rounds found for this campaign.</div>
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Round</th>
                <th>Status</th>
                <th>Entrants</th>
                <th>Collected</th>
                <th>Rollover in</th>
                <th>Paid out</th>
                <th>Banked</th>
                <th>Rollover out</th>
                <th>Winner</th>
                <th>Check</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in rows"
                :key="row.id"
                :class="{ 'row--warn': row.finalized && (row.financeStatus !== 'Booked' || row.accountingDelta !== 0) }"
              >
                <td>{{ formatDate(row.roundDate) }}</td>
                <td>
                  <div class="cell-stack">
                    <strong>{{ row.roundLabel }}</strong>
                    <span>{{ row.roundType }}</span>
                  </div>
                </td>
                <td>
                  <span
                    :class="[
                      'status-pill',
                      row.financeStatus === 'Booked'
                        ? 'status-pill--ok'
                        : row.finalized
                          ? 'status-pill--warn'
                          : 'status-pill--muted',
                    ]"
                  >
                    {{ row.financeStatus }}
                  </span>
                </td>
                <td>
                  <div class="cell-stack">
                    <strong>{{ row.entrants }}</strong>
                    <span>{{ row.scoredCount }} scored · {{ row.dqCount }} DQ</span>
                  </div>
                </td>
                <td>
                  <div class="cell-stack">
                    <strong>{{ formatMoney(row.collectedPence) }}</strong>
                    <span>fees {{ formatMoney(row.entryFeesPence) }} · fines {{ formatMoney(row.finesPence) }}</span>
                  </div>
                </td>
                <td>{{ formatMoney(row.rolloverInPence) }}</td>
                <td>{{ formatMoney(row.paidOutPence) }}</td>
                <td>
                  <div class="cell-stack">
                    <strong>{{ formatMoney(row.bankedPence) }}</strong>
                    <span>{{ row.bankWallet }}</span>
                  </div>
                </td>
                <td>{{ formatMoney(row.rolloverOutPence) }}</td>
                <td>{{ row.winnerLabel }}</td>
                <td>
                  <div class="cell-stack">
                    <strong :class="{ 'money-ok': row.accountingDelta === 0, 'money-warn': row.accountingDelta !== 0 }">
                      {{
                        row.accountingDelta == null
                          ? "—"
                          : row.accountingDelta === 0
                            ? "OK"
                            : formatSignedMoney(row.accountingDelta)
                      }}
                    </strong>
                    <div class="cell-links">
                      <RouterLink :to="{ path: '/manage/score-entry', query: { round: row.id } }">Scores</RouterLink>
                      ·
                      <RouterLink to="/manage/6-rounds">Rounds</RouterLink>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.finance-log {
  display: grid;
  gap: 1.25rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  padding: 1.25rem;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
}

.eyebrow {
  margin: 0 0 0.35rem;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1,
.lede {
  margin: 0;
}

.lede {
  margin-top: 0.4rem;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.45;
  max-width: 58rem;
}

.header-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.primary-button,
.secondary-button {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.65rem 1rem;
  background: var(--surface);
  color: var(--text);
  font-weight: 700;
  font-size: 0.84rem;
  cursor: pointer;
}

.secondary-button:disabled,
.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.toolbar-card {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
  padding: 1rem 1.25rem;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
}

.field-pill {
  display: grid;
  gap: 0.3rem;
  min-width: 18rem;
}

.field-pill span {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.field-pill select {
  min-height: 2.45rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.55rem 0.85rem;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
}

.notice {
  margin: 0;
  padding: 0.8rem 1rem;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface);
}

.notice--error {
  color: var(--danger);
}

.notice--warn {
  color: #fbbf24;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.85rem;
}

.summary-card {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
}

.summary-card--warn {
  border-color: color-mix(in srgb, var(--danger) 45%, var(--line));
}

.summary-label,
.summary-sub {
  color: var(--muted);
}

.summary-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.summary-value {
  font-size: 1.15rem;
}

.summary-sub {
  font-size: 0.82rem;
  line-height: 1.35;
}

.table-card {
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
  overflow: hidden;
}

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 0.8rem 0.85rem;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
  text-align: left;
  white-space: nowrap;
}

.data-table th {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--bg) 55%, var(--surface));
}

.data-table tbody tr:last-child td {
  border-bottom: 0;
}

.row--warn {
  background: color-mix(in srgb, var(--danger) 5%, transparent);
}

.status-pill {
  display: inline-flex;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 700;
  border: 1px solid var(--line);
}

.status-pill--ok {
  color: var(--ok);
  border-color: color-mix(in srgb, var(--ok) 40%, var(--line));
}

.status-pill--warn {
  color: #fbbf24;
  border-color: color-mix(in srgb, #fbbf24 40%, var(--line));
}

.status-pill--muted {
  color: var(--muted);
}

.cell-stack {
  display: grid;
  gap: 0.18rem;
}

.cell-stack span,
.cell-links {
  color: var(--muted);
  font-size: 0.78rem;
}

.money-ok {
  color: var(--ok);
}

.money-warn {
  color: var(--danger);
}

.empty-state {
  margin: 0;
  padding: 1rem 1.25rem;
  color: var(--muted);
  font-size: 0.88rem;
}

@media (max-width: 760px) {
  .page-header {
    display: grid;
  }

  .field-pill {
    min-width: 0;
    width: 100%;
  }
}
</style>
