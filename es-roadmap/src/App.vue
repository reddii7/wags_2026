<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { parseLetter, formatPrice } from "./lib/parseLetter.js";
import { buildRoadmap } from "./lib/buildRoadmap.js";
import { buildPine } from "./lib/buildPine.js";
import { collectLevels, isAlwaysOn, lineColor, placeLabels } from "./lib/chartLayout.js";
import { SAMPLE_LETTER } from "./lib/sampleLetter.js";

const STORAGE_KEY = "es-roadmap:draft";

const letter = ref("");
const last = ref("7722");
const high = ref("7782.50");
const low = ref("7711.75");
const tab = ref("roadmap");
const copied = ref("");
const error = ref("");

const session = computed(() => ({
  last: last.value,
  high: high.value,
  low: low.value,
}));

const parsed = computed(() => {
  if (!letter.value.trim()) return null;
  try {
    return parseLetter(letter.value);
  } catch (err) {
    error.value = err.message || "Could not parse letter.";
    return null;
  }
});

const roadmap = computed(() => (parsed.value ? buildRoadmap(parsed.value, session.value) : null));
const pine = computed(() => (parsed.value ? buildPine(parsed.value, session.value) : ""));

const previewLines = computed(() => {
  if (!parsed.value) return [];
  const all = collectLevels(parsed.value).filter((level) => level.major || isAlwaysOn(level));
  const lastN = Number.parseFloat(last.value);
  if (!Number.isFinite(lastN)) return all;
  return all.filter((level) => Math.abs(level.price - lastN) <= 120);
});

const previewLabels = computed(() =>
  parsed.value
    ? placeLabels(collectLevels(parsed.value), 16, {
        anchor: last.value,
        range: 80,
      })
    : [],
);

const previewBox = computed(() => {
  const prices = previewLines.value.map((level) => level.price);
  const lastN = Number.parseFloat(last.value);
  if (Number.isFinite(lastN)) prices.push(lastN);
  if (!prices.length) return { min: 0, max: 1 };
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = Math.max(12, (max - min) * 0.05);
  return { min: min - pad, max: max + pad };
});

const canGenerate = computed(() => letter.value.trim().length > 40);

function previewY(price) {
  const { min, max } = previewBox.value;
  return 12 + ((max - price) / (max - min || 1)) * 336;
}

watch(
  [letter, last, high, low],
  () => {
    error.value = "";
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ letter: letter.value, last: last.value, high: high.value, low: low.value }),
    );
  },
  { deep: false },
);

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.letter) {
      letter.value = saved.letter;
      last.value = saved.last ?? last.value;
      high.value = saved.high ?? high.value;
      low.value = saved.low ?? low.value;
    }
  } catch {
    /* ignore */
  }
});

function loadSample() {
  letter.value = SAMPLE_LETTER;
  last.value = "7722";
  high.value = "7782.50";
  low.value = "7711.75";
  tab.value = "roadmap";
}

function clearAll() {
  letter.value = "";
  copied.value = "";
}

async function copyText(text, label) {
  await navigator.clipboard.writeText(text);
  copied.value = label;
  setTimeout(() => {
    if (copied.value === label) copied.value = "";
  }, 1600);
}

function downloadPine() {
  const blob = new Blob([pine.value], { type: "text/plain" });
  const stamp = (parsed.value?.planDay || "session").toLowerCase();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `es-roadmap-${stamp}.pine`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function levelClass(level) {
  const bits = [level.role];
  if (level.major) bits.push("major");
  if (level.fbd) bits.push("fbd");
  if (level.target) bits.push("target");
  if (level.shortSpot) bits.push("short");
  return bits.join(" ");
}

function levelMeta(level) {
  const tags = [];
  if (level.major) tags.push("major");
  if (level.fbd) tags.push("FBD");
  if (level.target) tags.push("target");
  if (level.shortSpot) tags.push("short");
  if (level.invalidation) tags.push("invalidation");
  return tags.join(" · ");
}
</script>

<template>
  <div class="shell">
    <header class="top">
      <div>
        <p class="eyebrow">Trade Companion → session card → TradingView</p>
        <h1>ES Daily Roadmap</h1>
      </div>
      <p class="lede">
        Paste the day’s letter. The app extracts levels, writes a long/short playbook, and emits Pine v6 you can paste into TradingView.
      </p>
    </header>

    <section class="grid">
      <aside class="panel input-panel">
        <div class="panel-head">
          <h2>Letter</h2>
          <div class="row-actions">
            <button type="button" class="ghost" @click="loadSample">Load sample</button>
            <button type="button" class="ghost" @click="clearAll">Clear</button>
          </div>
        </div>
        <textarea
          v-model="letter"
          spellcheck="false"
          placeholder="Paste the full Trade Companion letter here, including Supports are / Resistances are / Bull case / Bear case."
        />
        <div class="session">
          <label>
            Last
            <input v-model="last" inputmode="decimal" placeholder="7722" />
          </label>
          <label>
            High
            <input v-model="high" inputmode="decimal" placeholder="7782.5" />
          </label>
          <label>
            Low
            <input v-model="low" inputmode="decimal" placeholder="7711.75" />
          </label>
        </div>
        <p class="hint">
          Last / high / low are optional. They only locate “where you are” on the map — they do not change extracted levels.
        </p>
        <p v-if="error" class="warn">{{ error }}</p>
        <p v-else-if="parsed?.warnings?.length" class="warn">{{ parsed.warnings.join(" ") }}</p>
        <p v-else-if="parsed" class="ok">
          Parsed {{ parsed.supports.length }} supports, {{ parsed.resistances.length }} resistances,
          {{ parsed.setups.fbd.length + parsed.setups.reclaim.length }} long setups.
        </p>
      </aside>

      <section class="panel output-panel">
        <div class="tabs">
          <button type="button" :class="{ on: tab === 'roadmap' }" @click="tab = 'roadmap'">Roadmap</button>
          <button type="button" :class="{ on: tab === 'levels' }" @click="tab = 'levels'">Levels</button>
          <button type="button" :class="{ on: tab === 'pine' }" @click="tab = 'pine'">Pine v6</button>
        </div>

        <div v-if="!canGenerate" class="empty">
          Paste a letter or load the August 31 sample to generate today’s card.
        </div>

        <template v-else-if="parsed && roadmap">
          <div v-if="tab === 'roadmap'" class="roadmap">
            <div class="toolbar">
              <h2>{{ roadmap.headline }}</h2>
              <button type="button" @click="copyText(roadmap.markdown, 'roadmap')">
                {{ copied === "roadmap" ? "Copied" : "Copy markdown" }}
              </button>
            </div>
            <p v-if="roadmap.position" class="position">{{ roadmap.position.summary }}</p>
            <p v-if="roadmap.summary" class="lean">{{ roadmap.summary }}</p>

            <article>
              <h3>Long setups</h3>
              <ul>
                <li v-for="(line, idx) in roadmap.longs" :key="'l' + idx">{{ line }}</li>
                <li v-if="roadmap.targets.length">
                  Scale-out ladder: {{ roadmap.targets.map(formatPrice).join(", ") }}
                </li>
              </ul>
            </article>

            <article>
              <h3>Short setups</h3>
              <ul>
                <li v-for="(line, idx) in roadmap.shorts" :key="'s' + idx">{{ line }}</li>
                <li v-if="roadmap.bear?.below">
                  Advanced breakdown only if {{ formatPrice(roadmap.bear.below) }} is accepted down,
                  then under the bounce lows
                  <span v-if="roadmap.bear.trigger">(~{{ formatPrice(roadmap.bear.trigger) }})</span>.
                </li>
              </ul>
            </article>

            <article>
              <h3>Do not</h3>
              <ul>
                <li v-for="(line, idx) in roadmap.doNot" :key="'d' + idx">{{ line }}</li>
              </ul>
            </article>

            <article>
              <h3>Trade management</h3>
              <ul>
                <li v-for="(line, idx) in roadmap.management" :key="'m' + idx">{{ line }}</li>
              </ul>
            </article>

            <div class="cases">
              <article v-if="roadmap.bullCase">
                <h3>Bull case</h3>
                <p>{{ roadmap.bullCase }}</p>
              </article>
              <article v-if="roadmap.bearCase">
                <h3>Bear case</h3>
                <p>{{ roadmap.bearCase }}</p>
              </article>
            </div>
          </div>

          <div v-else-if="tab === 'levels'" class="levels">
            <div class="legend">
              <span class="chip support major">major support</span>
              <span class="chip resistance major">major resistance</span>
              <span class="chip fbd">FBD / setup</span>
              <span class="chip target">target</span>
              <span class="chip short">short</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Side</th>
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="level in parsed.all" :key="level.role + level.price" :class="levelClass(level)">
                  <td class="mono">{{ formatPrice(level.price) }}</td>
                  <td>{{ level.role }}</td>
                  <td>{{ levelMeta(level) || "—" }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-else class="pine">
            <div class="toolbar">
              <h2>TradingView Pine v6</h2>
              <div class="row-actions">
                <button type="button" @click="copyText(pine, 'pine')">
                  {{ copied === "pine" ? "Copied" : "Copy script" }}
                </button>
                <button type="button" class="ghost" @click="downloadPine">Download .pine</button>
              </div>
            </div>
            <ol class="steps">
              <li>Open the ES (or MES) chart on TradingView.</li>
              <li>Pine Editor → paste this script → Save → Add to chart.</li>
              <li>Lines stop at the last bar. Labels sit to the right, one per cluster, in three columns. Raise “Min label gap” on the chart if anything still stacks.</li>
            </ol>
            <div class="preview-wrap">
              <p class="preview-cap">Spacing preview (majors + setups only)</p>
              <svg class="preview" viewBox="0 0 640 360" role="img" aria-label="Level spacing preview">
                <rect x="0" y="0" width="640" height="360" fill="#0b1220" />
                <line
                  v-if="Number.isFinite(Number.parseFloat(last))"
                  x1="16"
                  x2="400"
                  :y1="previewY(Number.parseFloat(last))"
                  :y2="previewY(Number.parseFloat(last))"
                  stroke="#8b9bb4"
                  stroke-dasharray="4 4"
                  stroke-width="1"
                />
                <g v-for="level in previewLines" :key="'ln' + level.role + level.price">
                  <line
                    x1="16"
                    x2="400"
                    :y1="previewY(level.price)"
                    :y2="previewY(level.price)"
                    :stroke="lineColor(level)"
                    :stroke-width="level.major || isAlwaysOn(level) ? 2 : 1"
                    stroke-linecap="round"
                  />
                </g>
                <g v-for="level in previewLabels" :key="'lb' + level.role + level.price">
                  <rect
                    :x="412 + level.col * 72"
                    :y="previewY(level.price) - 8"
                    width="68"
                    height="16"
                    rx="3"
                    fill="#0b1220"
                    :stroke="lineColor(level)"
                    stroke-width="0.75"
                  />
                  <text
                    :x="416 + level.col * 72"
                    :y="previewY(level.price) + 4"
                    :fill="lineColor(level)"
                    font-size="10"
                    font-family="IBM Plex Mono, ui-monospace, monospace"
                  >
                    {{ level.label }}
                  </text>
                </g>
              </svg>
            </div>
            <pre>{{ pine }}</pre>
          </div>
        </template>
      </section>
    </section>
  </div>
</template>
