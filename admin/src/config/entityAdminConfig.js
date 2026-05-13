/**
 * Admin CRUD definitions — aligned to the live schema on iwzqzpzskawxrwhttufq.
 * Setup order: members → lookup tables → campaigns → assignments → rounds → scores → derived.
 */

export const ENUMS = {
  campaign_kind: ["summer_main", "winter_reduced"],
  campaign_status: ["draft", "open", "closed"],
  bank_wallet: ["club", "winter_bank", "none"],
  round_type: [
    "summer_weekly",
    "winter_weekly",
    "rs_cup",
    "finals_champs",
    "finals_chumps",
    "away_day",
  ],
};

/**
 * @typedef {{
 *   key: string,
 *   label: string,
 *   type: string,
 *   required?: boolean,
 *   default?: unknown,
 *   enumKey?: string,
 *   fk?: { table: string, valueKey: string, labelKey: string, subLabelKey?: string, filter?: { column: string, value: string } },
 *   step?: number,
 *   min?: number,
 *   immutableOnEdit?: boolean,
 *   format?: "uuid",
 *   jsonEmptyMeansNull?: boolean,
 *   persist?: boolean,
 *   hideOnEdit?: boolean,
 * }} FormField
 *
 * @typedef {{ column: string, ascending?: boolean, nullsFirst?: boolean, foreignTable?: string }} OrderClause
 * Entity list query: `order` is one clause or an array (applied left-to-right).
 * `filterBySelectedRound`: show a Round dropdown; list is filtered to `round_id` (e.g. scores, handicap_snapshots).
 * `roundFilterCampaignKind`: when set with `filterBySelectedRound`, only rounds in campaigns of this kind appear in the dropdown.
 */

/** @type {Array<{ path: string, name: string, title: string, step: number, entity: object }>} */
export const ENTITY_ADMIN_PAGES = [
  // ── 1. MEMBERS ────────────────────────────────────────────────────────────
  {
    path: "/manage/1-members",
    name: "manage-members",
    title: "1 · Members",
    step: 1,
    entity: {
      table: "members",
      primaryKey: "id",
      listSelect: "*",
      order: { column: "full_name", ascending: true },
      listColumns: [
        { key: "full_name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "handicap_index", label: "Current HCP" },
        { key: "initial_handicap_index", label: "Initial HCP" },
        { key: "is_admin", label: "Admin" },
      ],
      formFields: [
        { key: "full_name", label: "Full name", type: "text", required: true },
        { key: "email", label: "Email", type: "text", required: true },
        {
          key: "initial_handicap_index",
          label: "Initial handicap index",
          type: "decimal",
          required: true,
          step: 0.1,
          default: 18.0,
        },
        {
          key: "handicap_index",
          label: "Current handicap index",
          type: "decimal",
          required: true,
          step: 0.1,
          default: 18.0,
        },
        { key: "is_admin", label: "Is admin", type: "boolean", default: false },
        {
          key: "league_campaign_id",
          label: "League — campaign (optional)",
          type: "fk",
          required: false,
          persist: false,
          hideOnEdit: true,
          fkAutoDefault: true,
          fk: {
            table: "campaigns",
            valueKey: "id",
            labelKey: "label",
            filter: { column: "status", value: "open" },
          },
        },
        {
          key: "league_tier",
          label: "League — tier (1–4, optional)",
          type: "number",
          required: false,
          persist: false,
          hideOnEdit: true,
          min: 1,
          step: 1,
          default: 4,
        },
        {
          key: "league_effective_from",
          label: "League — effective from (optional)",
          type: "date",
          required: false,
          persist: false,
          hideOnEdit: true,
        },
      ],
    },
  },

  // ── 2. HANDICAP RULES (band lookup) ───────────────────────────────────────
  {
    path: "/manage/2-handicap-rules",
    name: "manage-handicap-rules",
    title: "2 · Handicap rules (band table)",
    step: 2,
    entity: {
      table: "handicap_rules",
      primaryKey: "id",
      listSelect: "*",
      order: { column: "max_hcap", ascending: true },
      listColumns: [
        { key: "max_hcap", label: "Max HCP (band ceiling)" },
        { key: "buffer_zone", label: "Buffer zone (B)" },
        { key: "cut_factor", label: "Cut factor (C)" },
        { key: "below_buffer_delta", label: "Below B (Δ)" },
      ],
      formFields: [
        {
          key: "max_hcap",
          label: "Max HCP (band ceiling — use 99 for the top band)",
          type: "decimal",
          required: true,
          step: 0.5,
        },
        {
          key: "buffer_zone",
          label: "Buffer zone (B) — score that triggers no change",
          type: "number",
          required: true,
        },
        {
          key: "cut_factor",
          label: "Cut factor (C) — multiplier when S > 20",
          type: "decimal",
          required: true,
          step: 0.1,
        },
        {
          key: "below_buffer_delta",
          label:
            "Below buffer (Δ) — handicap change when score < buffer_zone (e.g. +0.1)",
          type: "decimal",
          required: true,
          step: 0.1,
          default: 0.1,
        },
      ],
    },
  },

  // ── 3. MONEY RULES (per round type) ───────────────────────────────────────
  {
    path: "/manage/3-money-rules",
    name: "manage-money-rules",
    title: "3 · Money rules (per round type)",
    step: 3,
    entity: {
      table: "money_rules",
      primaryKey: "round_type",   // round_type is the PK in this table
      listSelect: "*",
      order: { column: "round_type", ascending: true },
      listColumns: [
        { key: "round_type", label: "Round type" },
        { key: "default_entry_fee_pence", label: "Entry (p)" },
        { key: "pot_slice_pence", label: "Pot slice (p/entrant)" },
        { key: "bank_slice_pence", label: "Bank slice (p/entrant)" },
        { key: "bank_wallet", label: "Bank wallet" },
        { key: "tie_treatment", label: "Tie treatment" },
        { key: "collect_fines", label: "Fines?" },
      ],
      formFields: [
        {
          key: "round_type",
          label: "Round type",
          type: "enum",
          enumKey: "round_type",
          required: true,
          immutableOnEdit: true,
        },
        {
          key: "default_entry_fee_pence",
          label:
            "Default entry fee (pence per player, 0 = none). Should match sum of pot+bank slices (+ fines if enabled).",
          type: "number",
          required: false,
          min: 0,
          step: 1,
        },
        {
          key: "pot_slice_pence",
          label:
            "Pot slice (pence per entrant — day winner pool; winter £2.50; finals whole fee here, bank 0)",
          type: "number",
          required: true,
          default: 150,
        },
        {
          key: "bank_slice_pence",
          label:
            "Bank slice (pence per entrant). Summer → club bank; winter → winter_bank (series accrual), not general club pot",
          type: "number",
          required: true,
          default: 350,
        },
        {
          key: "bank_wallet",
          label: "Where bank slice + fines accrue",
          type: "enum",
          enumKey: "bank_wallet",
          required: true,
          default: "club",
        },
        {
          key: "tie_treatment",
          label: "Tie treatment (e.g. rollover, split)",
          type: "text",
          required: true,
          default: "rollover",
        },
        {
          key: "collect_fines",
          label: "Collect snake/camel fines",
          type: "boolean",
          default: true,
        },
      ],
    },
  },

  // ── 4. CAMPAIGNS ──────────────────────────────────────────────────────────
  {
    path: "/manage/4-campaigns",
    name: "manage-campaigns",
    title: "4 · Campaigns",
    step: 4,
    entity: {
      table: "campaigns",
      primaryKey: "id",
      listSelect: "*",
      order: { column: "year", ascending: false },
      listColumns: [
        { key: "label", label: "Label" },
        { key: "kind", label: "Kind" },
        { key: "year", label: "Year" },
        { key: "status", label: "Status" },
        { key: "start_date", label: "Start" },
        { key: "end_date", label: "End" },
      ],
      formFields: [
        {
          key: "label",
          label: "Label (e.g. Main Summer 2026)",
          type: "text",
          required: true,
        },
        {
          key: "kind",
          label: "Kind",
          type: "enum",
          enumKey: "campaign_kind",
          required: true,
        },
        { key: "year", label: "Year", type: "number", required: true, default: 2026 },
        {
          key: "status",
          label: "Status",
          type: "enum",
          enumKey: "campaign_status",
          default: "draft",
        },
        { key: "start_date", label: "Start date", type: "date", required: false },
        { key: "end_date", label: "End date", type: "date", required: false },
      ],
    },
  },

  // ── 5. LEAGUE ASSIGNMENTS ─────────────────────────────────────────────────
  {
    path: "/manage/5-league-assignments",
    name: "manage-league-assignments",
    title: "5 · League assignments (tiers per campaign)",
    step: 5,
    entity: {
      table: "league_assignments",
      primaryKey: "id",
      listSelect: "*, campaigns(label), members(full_name)",
      order: { column: "tier", ascending: true },
      listColumns: [
        { key: "campaign_id", label: "Campaign" },
        { key: "member_id", label: "Member" },
        { key: "tier", label: "Tier (1=Prem)" },
        { key: "effective_from", label: "Effective from" },
      ],
      formFields: [
        {
          key: "campaign_id",
          label: "Campaign",
          type: "fk",
          required: true,
          fk: { table: "campaigns", valueKey: "id", labelKey: "label" },
        },
        {
          key: "member_id",
          label: "Member",
          type: "fk",
          required: true,
          fk: { table: "members", valueKey: "id", labelKey: "full_name" },
        },
        {
          key: "tier",
          label: "Tier (1 = Premiership, 2 = Championship, 3 = League One, 4 = League Two)",
          type: "number",
          required: true,
          min: 1,
          step: 1,
          default: 4,
        },
        { key: "effective_from", label: "Effective from", type: "date", required: true },
      ],
    },
  },

  // ── 6. ROUNDS ─────────────────────────────────────────────────────────────
  {
    path: "/manage/6-rounds",
    name: "manage-rounds",
    title: "6 · Rounds",
    step: 6,
    entity: {
      table: "rounds",
      primaryKey: "id",
      listSelect: "*, campaigns(label)",
      order: [
        { column: "play_order", ascending: true, nullsFirst: false },
        { column: "round_date", ascending: true },
      ],
      rowActions: [
        {
          key: "finalize",
          label: "Finalize ▶",
          condition: (row) => !row.finalized,
          confirm:
            "Finalize this round?\n\nThis will:\n• Compute prize money and write weekly_prize_state\n• Compute new handicaps and write handicap_snapshots\n• Update each member's current handicap_index\n• Mark the round as finalized",
          rpc: { name: "finalize_round", paramKey: "p_round_id", pkField: "id" },
        },
        {
          key: "reopen",
          label: "Reopen ↩",
          condition: (row) => row.finalized,
          confirm:
            "Reopen this round?\n\nThis will:\n• Restore every member's handicap to their pre-round value\n• Delete the weekly_prize_state row\n• Delete the handicap_snapshots for this round\n• Mark the round as not finalized\n\nUse this to correct scores before re-finalizing.",
          rpc: { name: "reopen_round", paramKey: "p_round_id", pkField: "id" },
        },
      ],
      listColumns: [
        { key: "name", label: "Name" },
        { key: "play_order", label: "Play #" },
        { key: "round_date", label: "Date" },
        { key: "round_type", label: "Type" },
        { key: "campaign_id", label: "Campaign" },
        { key: "course_par", label: "Stableford par" },
        { key: "finalized", label: "Finalized" },
      ],
      formFields: [
        { key: "name", label: "Round name (e.g. Week 01)", type: "text", required: false },
        {
          key: "play_order",
          label:
            "Play order (1, 2, 3… — optional but recommended: fixes rollover if round dates are out of order)",
          type: "number",
          required: false,
          min: 1,
          step: 1,
        },
        {
          key: "campaign_id",
          label: "Campaign",
          type: "fk",
          required: true,
          fk: { table: "campaigns", valueKey: "id", labelKey: "label" },
        },
        {
          key: "round_type",
          label: "Round type",
          type: "enum",
          enumKey: "round_type",
          required: true,
        },
        { key: "round_date", label: "Round date", type: "datetime", required: true },
        {
          key: "course_par",
          label:
            "Stableford par (20 for weekly/finals/RS Cup; set venue par for away days only)",
          type: "number",
          required: false,
          default: 20,
        },
        { key: "finalized", label: "Finalized", type: "boolean", default: false },
        {
          key: "finalized_at",
          label: "Finalized at (leave blank — set by finalize action)",
          type: "datetime",
          required: false,
        },
      ],
    },
  },

  // ── 7. SCORES (round players) ─────────────────────────────────────────────
  {
    path: "/manage/7-scores",
    name: "manage-scores",
    title: "7 · Scores (round players)",
    step: 7,
    entity: {
      table: "round_players",
      primaryKey: "id",
      listSelect: "*, members(full_name)",
      order: [
        { column: "stableford_points", ascending: false, nullsFirst: false },
        { column: "full_name", ascending: true, foreignTable: "members" },
      ],
      filterBySelectedRound: true,
      listColumns: [
        { key: "member_id", label: "Member" },
        { key: "stableford_points", label: "Pts" },
        { key: "entered", label: "Entered" },
        { key: "entry_fee_pence", label: "Entry (p)" },
        { key: "snake_count", label: "Snakes" },
        { key: "camel_count", label: "Camels" },
        { key: "disqualified", label: "DQ" },
      ],
      formFields: [
        {
          key: "round_id",
          label: "Round",
          type: "fk",
          required: true,
          fkAutoDefault: true,
          fk: {
            table: "rounds",
            valueKey: "id",
            labelKey: "round_date",
          },
        },
        {
          key: "member_id",
          label: "Member",
          type: "fk",
          required: true,
          fk: { table: "members", valueKey: "id", labelKey: "full_name" },
        },
        { key: "entered", label: "Entered / played", type: "boolean", default: true },
        {
          key: "stableford_points",
          label: "Net stableford points",
          type: "number",
          required: false,
          default: 0,
        },
        { key: "snake_count", label: "Snakes", type: "number", default: 0, min: 0 },
        { key: "camel_count", label: "Camels", type: "number", default: 0, min: 0 },
        {
          key: "entry_fee_pence",
          label:
            "Entry fee (pence) — per player for this round; use 0 for RS Cup; match money_rules default for weekly/finals",
          type: "number",
          required: true,
          default: 500,
        },
        {
          key: "disqualified",
          label: "Disqualified",
          type: "boolean",
          default: false,
        },
      ],
    },
  },

  // ── 8. WEEKLY PRIZE STATE ─────────────────────────────────────────────────
  {
    path: "/manage/8-prize-state",
    name: "manage-prize-state",
    title: "8 · Weekly prize state",
    step: 8,
    entity: {
      table: "weekly_prize_state",
      primaryKey: "id",
      listSelect: "*, rounds(name, round_date, round_type), members(full_name)",
      order: { column: "round_id", ascending: false },
      listColumns: [
        { key: "round_id", label: "Round" },
        { key: "winner_member_id", label: "Winner" },
        { key: "paid_out_pence", label: "Paid out (p)" },
        { key: "rollover_carried_in", label: "Rollover in (p)" },
        { key: "rollover_carried_out", label: "Rollover out (p)" },
        { key: "to_bank_pence", label: "Bank (p)" },
        { key: "bank_wallet", label: "Wallet" },
        { key: "manual_override", label: "Manual" },
      ],
      formFields: [
        {
          key: "round_id",
          label: "Round",
          type: "fk",
          required: true,
          fk: { table: "rounds", valueKey: "id", labelKey: "round_date" },
        },
        {
          key: "winner_member_id",
          label: "Winner (leave blank on tie)",
          type: "fk",
          required: false,
          fk: { table: "members", valueKey: "id", labelKey: "full_name" },
        },
        { key: "paid_out_pence", label: "Paid out (p)", type: "number", default: 0 },
        { key: "to_bank_pence", label: "To bank (p)", type: "number", default: 0 },
        {
          key: "bank_wallet",
          label: "Bank wallet (club / winter_bank / none)",
          type: "enum",
          enumKey: "bank_wallet",
          required: true,
          default: "club",
        },
        {
          key: "rollover_carried_in",
          label: "Rollover carried in (p)",
          type: "number",
          default: 0,
        },
        {
          key: "rollover_carried_out",
          label: "Rollover carried out (p)",
          type: "number",
          default: 0,
        },
        {
          key: "manual_override",
          label: "Manual override",
          type: "boolean",
          default: false,
        },
      ],
    },
  },

  // ── 9. HANDICAP SNAPSHOTS ─────────────────────────────────────────────────
  {
    path: "/manage/9-handicap-snapshots",
    name: "manage-handicap-snapshots",
    title: "9 · Handicap snapshots",
    step: 9,
    entity: {
      table: "handicap_snapshots",
      primaryKey: "id",
      listSelect: "*, members(full_name), rounds(round_date)",
      order: [
        { column: "full_name", ascending: true, foreignTable: "members" },
        { column: "member_id", ascending: true },
      ],
      filterBySelectedRound: true,
      roundFilterCampaignKind: "summer_main",
      listColumns: [
        { key: "member_id", label: "Member" },
        { key: "round_id", label: "Round" },
        { key: "handicap_before", label: "Before" },
        { key: "handicap_after", label: "After" },
        { key: "manual_override", label: "Manual" },
      ],
      formFields: [
        {
          key: "member_id",
          label: "Member",
          type: "fk",
          required: true,
          fk: { table: "members", valueKey: "id", labelKey: "full_name" },
        },
        {
          key: "round_id",
          label: "Round",
          type: "fk",
          required: true,
          fk: { table: "rounds", valueKey: "id", labelKey: "round_date" },
        },
        {
          key: "handicap_before",
          label: "Handicap before",
          type: "decimal",
          required: true,
          step: 0.1,
        },
        {
          key: "handicap_after",
          label: "Handicap after",
          type: "decimal",
          required: true,
          step: 0.1,
        },
        {
          key: "manual_override",
          label: "Manual override",
          type: "boolean",
          default: false,
        },
      ],
    },
  },

  // ── 10. SUMMER STANDINGS (read-only view) ─────────────────────────────────
  {
    path: "/manage/10-summer-standings",
    name: "manage-summer-standings",
    title: "10 · Summer standings (view)",
    step: 10,
    entity: {
      table: "v_summer_standings",
      primaryKey: ["campaign_id", "member_id"],
      filterByCampaign: true,
      campaignFilterKind: "summer_main",
      readOnly: true,
      listSelect: "*",
      order: [
        { column: "tier", ascending: true },
        { column: "best_14_total", ascending: false },
        { column: "full_name", ascending: true },
      ],
      listColumns: [
        { key: "campaign_label", label: "Campaign" },
        { key: "full_name", label: "Member" },
        { key: "tier", label: "Tier" },
        { key: "best_14_total", label: "Best 14 total" },
      ],
      formFields: [],
    },
  },

  // ── 11. WINTER STANDINGS (read-only view) ─────────────────────────────────
  {
    path: "/manage/11-winter-standings",
    name: "manage-winter-standings",
    title: "11 · Winter standings (view)",
    step: 11,
    entity: {
      table: "v_winter_standings",
      primaryKey: ["campaign_id", "member_id"],
      filterByCampaign: true,
      campaignFilterKind: "winter_reduced",
      readOnly: true,
      listSelect: "*",
      order: { column: "best_10_total", ascending: false },
      listColumns: [
        { key: "campaign_label", label: "Campaign" },
        { key: "full_name", label: "Member" },
        { key: "best_10_total", label: "Best 10 total" },
      ],
      formFields: [],
    },
  },

  // ── 12. BANK DASHBOARD (read-only view) ───────────────────────────────────
  {
    path: "/manage/12-bank",
    name: "manage-bank",
    title: "12 · Bank dashboard (view)",
    step: 12,
    entity: {
      table: "v_bank_dashboard",
      primaryKey: "campaign_id",
      readOnly: true,
      listSelect: "*",
      order: { column: "campaign_year", ascending: false },
      listColumns: [
        { key: "campaign_label", label: "Campaign" },
        { key: "campaign_year", label: "Year" },
        { key: "club_bank_pence", label: "Club bank (p)" },
        { key: "winter_bank_pence", label: "Winter bank (p)" },
        { key: "total_bank_balance_pence", label: "Total (p)" },
      ],
      formFields: [],
    },
  },
];
