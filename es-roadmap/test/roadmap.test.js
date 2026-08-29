import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseLetter, formatPrice } from "../src/lib/parseLetter.js";
import { buildRoadmap } from "../src/lib/buildRoadmap.js";
import { buildPine } from "../src/lib/buildPine.js";
import { SAMPLE_LETTER } from "../src/lib/sampleLetter.js";

describe("parseLetter", () => {
  const parsed = parseLetter(SAMPLE_LETTER);

  it("reads the plan day and title", () => {
    assert.equal(parsed.planDay, "Monday");
    assert.match(parsed.title, /August 31st Plan/i);
  });

  it("parses supports including majors", () => {
    assert.ok(parsed.supports.length >= 20);
    const major7714 = parsed.supports.find((l) => l.price === 7714);
    assert.ok(major7714);
    assert.equal(major7714.major, true);
    assert.equal(major7714.role, "support");
    assert.ok(parsed.supports.some((l) => l.price === 7658 && l.major));
  });

  it("parses resistances including majors", () => {
    assert.ok(parsed.resistances.length >= 15);
    assert.ok(parsed.resistances.some((l) => l.price === 7736 && l.major));
    assert.ok(parsed.resistances.some((l) => l.price === 7797 && l.major));
  });

  it("extracts failed-breakdown and reclaim setups", () => {
    const fbdPrices = parsed.setups.fbd.flatMap((s) => s.prices);
    assert.ok(fbdPrices.includes(7712) || parsed.extras.some((l) => l.price === 7712));
    assert.ok(fbdPrices.includes(7704) || parsed.setups.fbd.some((s) => /7704/.test(s.text)));
    assert.ok(parsed.setups.reclaim.length + parsed.setups.fbd.length >= 3);
  });

  it("extracts targets, short spots, and bear trigger", () => {
    assert.deepEqual(parsed.targets, [7758, 7771, 7797]);
    assert.equal(parsed.bear.below, 7659);
    assert.equal(parsed.bear.trigger, 7648);
    assert.ok(parsed.setups.shorts.length >= 1);
    const shortPrices = parsed.setups.shorts.flatMap((s) => s.prices);
    assert.ok(shortPrices.includes(7771));
    assert.ok(shortPrices.includes(7797));
  });

  it("keeps bull and bear case copy", () => {
    assert.match(parsed.bullCase, /defend 7714/i);
    assert.match(parsed.bearCase, /Begins below 7659/i);
    assert.equal(parsed.warnings.length, 0);
  });
});

describe("buildRoadmap", () => {
  const parsed = parseLetter(SAMPLE_LETTER);
  const roadmap = buildRoadmap(parsed, { last: 7722, high: 7782.5, low: 7711.75 });

  it("places last price between the nearest major support and resistance", () => {
    assert.ok(roadmap.position);
    assert.equal(roadmap.position.support.price, 7714);
    assert.equal(roadmap.position.resistance.price, 7736);
    assert.match(roadmap.position.summary, /7722/);
  });

  it("emits markdown with longs, shorts, and management", () => {
    assert.match(roadmap.markdown, /## Long setups/);
    assert.match(roadmap.markdown, /## Short setups/);
    assert.match(roadmap.markdown, /Lock 75%/);
    assert.match(roadmap.markdown, /7648/);
  });
});

describe("buildPine", () => {
  const parsed = parseLetter(SAMPLE_LETTER);
  const pine = buildPine(parsed, { last: 7722 });

  it("is pine v6 and includes key levels", () => {
    assert.match(pine, /^\/\/@version=6/m);
    assert.match(pine, /indicator\("/);
    assert.match(pine, /drawLevel\(7714, "S", true/);
    assert.match(pine, /drawLevel\(7797, "R", true/);
    assert.match(pine, /drawLevel\(7648/);
    assert.match(pine, /Last 7722/);
  });

  it("emits a table and escaped plan copy", () => {
    assert.match(pine, /table\.cell/);
    assert.match(pine, /Bull  /);
    assert.match(pine, /Bear  /);
    assert.equal((pine.match(/drawLevel\(/g) || []).length >= 20, true);
  });

  it("formats prices without trailing noise", () => {
    assert.equal(formatPrice(7714), "7714");
    assert.equal(formatPrice(7782.5), "7782.5");
  });
});
