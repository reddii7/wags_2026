import { formatPrice } from "./parseLetter.js";

export function pineField(value, max = 2000) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/"/g, "'")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function tagLevel(level) {
  const bits = [formatPrice(level.price)];
  if (level.major) bits.push("(major)");
  if (level.fbd) bits.push("FBD");
  if (level.target) bits.push("Tgt");
  if (level.shortSpot) bits.push("SH");
  if (level.invalidation) bits.push("INV");
  return bits.join(" ");
}

export function formatSRList(levels, direction = "desc") {
  const ordered = [...(levels || [])].sort((a, b) =>
    direction === "desc" ? b.price - a.price : a.price - b.price,
  );
  return ordered.map(tagLevel).join(", ");
}

export function formatTargetList(prices) {
  return [...new Set(prices || [])]
    .sort((a, b) => a - b)
    .map((price) => `${formatPrice(price)} Tgt`)
    .join(", ");
}

function uniqPush(list, keySet, item) {
  if (!item?.pair || item.pair === "0/0" || keySet.has(item.pair)) return;
  keySet.add(item.pair);
  list.push(item);
}

function fbdItem(low, high, note) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  const sweep = Math.min(low, high);
  const reclaim = Math.max(low, high);
  if (sweep === reclaim) return null;
  return {
    pair: `${formatPrice(sweep)}/${formatPrice(reclaim)}`,
    note: pineField(note || "FBD", 28),
  };
}

function fboItem(high, low, note) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  const sweep = Math.max(low, high);
  const reclaim = Math.min(low, high);
  if (sweep === reclaim) return null;
  return {
    pair: `${formatPrice(sweep)}/${formatPrice(reclaim)}`,
    note: pineField(note || "FBO", 28),
  };
}

export function buildTraps(parsed, session = {}) {
  const fbds = [];
  const fbos = [];
  const seenFbd = new Set();
  const seenFbo = new Set();
  const sessionLow = Number.parseFloat(session.low);
  const sessionHigh = Number.parseFloat(session.high);
  const bearPrices = new Set([parsed.bear?.below, parsed.bear?.trigger].filter(Boolean));

  for (const setup of [...(parsed.setups?.fbd || []), ...(parsed.setups?.reclaim || [])]) {
    const prices = [...new Set(setup.prices || [])].sort((a, b) => a - b);
    if (prices.length >= 2) {
      uniqPush(fbds, seenFbd, fbdItem(prices[0], prices[prices.length - 1], "FBD"));
    } else if (prices.length === 1) {
      uniqPush(fbds, seenFbd, fbdItem(prices[0] - 4, prices[0], "FBD"));
    }
  }

  if (Number.isFinite(sessionLow)) {
    const shelf = (parsed.supports || []).find((level) => level.major && level.price >= sessionLow);
    if (shelf && sessionLow < shelf.price) {
      uniqPush(fbds, seenFbd, fbdItem(sessionLow, shelf.price, "LOD FBD"));
    }
  }

  for (const setup of parsed.setups?.shorts || []) {
    const prices = [...new Set(setup.prices || [])]
      .filter((price) => !bearPrices.has(price))
      .sort((a, b) => a - b);
    if (!prices.length) continue;
    const span = prices[prices.length - 1] - prices[0];
    if (prices.length >= 2 && span <= 12) {
      uniqPush(fbos, seenFbo, fboItem(prices[prices.length - 1], prices[0], "FBO"));
    } else {
      for (const price of prices) {
        const sweep = Number.isFinite(sessionHigh) && sessionHigh > price ? sessionHigh : price + 5;
        uniqPush(fbos, seenFbo, fboItem(sweep, price, "FBO"));
      }
    }
  }

  return {
    fbds: fbds.slice(0, 5),
    fbos: fbos.slice(0, 5),
  };
}

export function buildDirects(parsed, session = {}) {
  const last = Number.parseFloat(session.last);
  const bids = [];
  const offers = [];
  const used = new Set();

  const pushBid = (level, note) => {
    if (!level || used.has(level.price) || bids.length >= 5) return;
    used.add(level.price);
    bids.push({ price: level.price, note: pineField(note || tagLevel(level), 24) });
  };
  const pushOffer = (level, note) => {
    if (!level || used.has(`o${level.price}`) || offers.length >= 5) return;
    used.add(`o${level.price}`);
    offers.push({ price: level.price, note: pineField(note || tagLevel(level), 24) });
  };

  const supports = [...(parsed.supports || [])].sort((a, b) => b.price - a.price);
  const resistances = [...(parsed.resistances || [])].sort((a, b) => a.price - b.price);

  for (const level of supports.filter((item) => item.fbd || item.major)) {
    if (Number.isFinite(last) && itemAboveBand(level.price, last, 40)) continue;
    pushBid(level, level.fbd ? `${formatPrice(level.price)} FBD` : `${formatPrice(level.price)} Bid`);
  }
  for (const extra of parsed.extras || []) {
    if (extra.fbd) pushBid(extra, `${formatPrice(extra.price)} FBD`);
  }

  for (const level of resistances.filter((item) => item.shortSpot || item.target || item.major)) {
    if (Number.isFinite(last) && level.price < last - 5 && !level.shortSpot) continue;
    if (level.shortSpot) pushOffer(level, `${formatPrice(level.price)} SH`);
  }
  for (const price of parsed.targets || []) {
    const level = resistances.find((item) => item.price === price) || {
      price,
      major: false,
    };
    pushOffer(level, `${formatPrice(price)} Tgt`);
  }

  return { bids: bids.slice(0, 5), offers: offers.slice(0, 5) };
}

function itemAboveBand(price, last, band) {
  return price > last + band;
}

function padTraps(items) {
  const slots = [...items];
  while (slots.length < 5) slots.push({ pair: "0/0", note: "" });
  return slots.slice(0, 5);
}

function padDirects(items, fallbackNote) {
  const slots = [...items];
  while (slots.length < 5) slots.push({ price: 0, note: fallbackNote });
  return slots.slice(0, 5);
}

export function buildDailyFields(parsed, session = {}) {
  const traps = buildTraps(parsed, session);
  const directs = buildDirects(parsed, session);
  const fbds = padTraps(traps.fbds);
  const fbos = padTraps(traps.fbos);
  const bids = padDirects(directs.bids, "Bid");
  const offers = padDirects(directs.offers, "Offer");

  return {
    title: pineField(
      ["DAILY LEVELS", parsed.planDay, parsed.dateLabel].filter(Boolean).join(" — "),
      48,
    ),
    supports: formatSRList(parsed.supports, "desc"),
    resistances: formatSRList(parsed.resistances, "asc"),
    targets: formatTargetList(parsed.targets),
    fbds,
    fbos,
    bids,
    offers,
  };
}

function slotPair(slot) {
  return slot.pair || "0/0";
}

function slotNote(slot) {
  return pineField(slot.note, 28);
}

function slotPrice(slot) {
  const price = Number(slot?.price);
  if (!Number.isFinite(price) || price === 0) return "0.0";
  return formatPrice(price);
}

export function buildPine(parsed, session = {}) {
  const f = buildDailyFields(parsed, session);
  const [fbd1, fbd2, fbd3, fbd4, fbd5] = f.fbds;
  const [fbo1, fbo2, fbo3, fbo4, fbo5] = f.fbos;
  const [db1, db2, db3, db4, db5] = f.bids;
  const [do1, do2, do3, do4, do5] = f.offers;

  return `// This Pine Script® code is subject to the terms of the Mozilla Public License 2.0 at https://mozilla.org/MPL/2.0/
// © Gemini_Collaborator
// Levels filled from today's Trade Companion letter.

//@version=6
indicator("DAILY LEVELS", overlay = true, max_lines_count = 500, max_labels_count = 500, max_boxes_count = 100)

// --- 1. INSTITUTIONAL SYNC ---
grp_conv = "Institutional Sync"
ref_ticker = input.symbol("CME_MINI:ES1!", "Reference Ticker", group=grp_conv)
lock_spread = input.bool(false, "LOCK SPREAD", group=grp_conv)
manual_off = input.float(0.0, "Manual Offset", step=0.25, group=grp_conv)
show_dash = input.bool(true, "Show Dashboard", group=grp_conv)

is_ref       = str.contains(str.upper(syminfo.ticker), "ES")
is_secondary = str.contains(str.upper(syminfo.ticker), "SPTRD")
is_allowed   = is_ref or is_secondary

es_price = is_allowed ? request.security(ref_ticker, timeframe.period, close, gaps=barmerge.gaps_off) : close
raw_basis = close - es_price

active_offset = is_ref ? 0.0 : (lock_spread ? manual_off : math.round(ta.median(raw_basis, 30) * 4) / 4)

// --- 2. VISUALS & OFFSETS (DECOUPLED) ---
grp_vis = "Global Visuals"
txtSizeInput = input.string("Small", "Label Size", options=["Tiny", "Small", "Normal", "Large"], group=grp_vis)
txtSize = txtSizeInput == "Tiny" ? size.tiny : txtSizeInput == "Small" ? size.small : txtSizeInput == "Normal" ? size.normal : size.large
lineWeight = input.int(1, "Line Thickness", minval=1, maxval=5, group=grp_vis)

grp_sr_off = "S/R Offsets"
levelOffset = input.int(45, "S/R Offset", group = grp_sr_off)
levelLength = input.int(20, "S/R Length", group = grp_sr_off)

grp_tar_off = "Target Offsets"
targetOffset = input.int(65, "Target Offset", group = grp_tar_off)
targetLength = input.int(20, "Target Length", group = grp_tar_off)

grp_trap_off = "Trap Box Offsets (FBD/FBO)"
trapOffset = input.int(10, "Trap Offset", group = grp_trap_off)
trapLength = input.int(15, "Trap Length", group = grp_trap_off)

grp_bid_off = "Direct Box Offsets (Bid/Offer)"
bidBoxOffset = input.int(10, "Direct Offset", group = grp_bid_off)
bidBoxLength = input.int(40, "Direct Length", group = grp_bid_off)
boxHeight = input.float(2.0, "Direct Box Height (Pts)", step=0.25, group=grp_bid_off)

// --- 3. DATA INPUTS ---
groupLevels = "Key Levels"
sup_data = input.text_area("${f.supports || "0"}", "Supports", group = groupLevels)
res_data = input.text_area("${f.resistances || "0"}", "Resistances", group = groupLevels)
tar_data = input.text_area("${f.targets || "0"}", "Targets", group = groupLevels)

// --- 4. FBD LONG SLOTS (5) ---
grp_fbd = "FBD Long Slots (Sweep/Reclaim)"
fbd1 = input.string("${slotPair(fbd1)}", "FBD 1", inline="f1", group=grp_fbd), n1 = input.string("${slotNote(fbd1)}", "Note", inline="f1", group=grp_fbd)
fbd2 = input.string("${slotPair(fbd2)}", "FBD 2", inline="f2", group=grp_fbd), n2 = input.string("${slotNote(fbd2)}", "Note", inline="f2", group=grp_fbd)
fbd3 = input.string("${slotPair(fbd3)}", "FBD 3", inline="f3", group=grp_fbd), n3 = input.string("${slotNote(fbd3)}", "Note", inline="f3", group=grp_fbd)
fbd4 = input.string("${slotPair(fbd4)}", "FBD 4", inline="f4", group=grp_fbd), n4 = input.string("${slotNote(fbd4)}", "Note", inline="f4", group=grp_fbd)
fbd5 = input.string("${slotPair(fbd5)}", "FBD 5", inline="f5", group=grp_fbd), n5 = input.string("${slotNote(fbd5)}", "Note", inline="f5", group=grp_fbd)

// --- 5. FBO SHORT SLOTS (5) ---
grp_fbo = "FBO Short Slots (Sweep/Reclaim)"
fbo1 = input.string("${slotPair(fbo1)}", "FBO 1", inline="o1", group=grp_fbo), m1 = input.string("${slotNote(fbo1)}", "Note", inline="o1", group=grp_fbo)
fbo2 = input.string("${slotPair(fbo2)}", "FBO 2", inline="o2", group=grp_fbo), m2 = input.string("${slotNote(fbo2)}", "Note", inline="o2", group=grp_fbo)
fbo3 = input.string("${slotPair(fbo3)}", "FBO 3", inline="o3", group=grp_fbo), m3 = input.string("${slotNote(fbo3)}", "Note", inline="o3", group=grp_fbo)
fbo4 = input.string("${slotPair(fbo4)}", "FBO 4", inline="o4", group=grp_fbo), m4 = input.string("${slotNote(fbo4)}", "Note", inline="o4", group=grp_fbo)
fbo5 = input.string("${slotPair(fbo5)}", "FBO 5", inline="o5", group=grp_fbo), m5 = input.string("${slotNote(fbo5)}", "Note", inline="o5", group=grp_fbo)

// --- 6. DIRECT BID SLOTS (5) ---
grp_dbid = "Direct Bid Slots (Single Level)"
db1p = input.float(${slotPrice(db1)}, "Bid 1", inline="db1", group=grp_dbid), db1n = input.string("${slotNote(db1)}", "", inline="db1", group=grp_dbid)
db2p = input.float(${slotPrice(db2)}, "Bid 2", inline="db2", group=grp_dbid), db2n = input.string("${slotNote(db2)}", "", inline="db2", group=grp_dbid)
db3p = input.float(${slotPrice(db3)}, "Bid 3", inline="db3", group=grp_dbid), db3n = input.string("${slotNote(db3)}", "", inline="db3", group=grp_dbid)
db4p = input.float(${slotPrice(db4)}, "Bid 4", inline="db4", group=grp_dbid), db4n = input.string("${slotNote(db4)}", "", inline="db4", group=grp_dbid)
db5p = input.float(${slotPrice(db5)}, "Bid 5", inline="db5", group=grp_dbid), db5n = input.string("${slotNote(db5)}", "", inline="db5", group=grp_dbid)

// --- 7. DIRECT OFFER SLOTS (5) ---
grp_doff = "Direct Offer Slots (Single Level)"
do1p = input.float(${slotPrice(do1)}, "Offer 1", inline="do1", group=grp_doff), do1n = input.string("${slotNote(do1)}", "", inline="do1", group=grp_doff)
do2p = input.float(${slotPrice(do2)}, "Offer 2", inline="do2", group=grp_doff), do2n = input.string("${slotNote(do2)}", "", inline="do2", group=grp_doff)
do3p = input.float(${slotPrice(do3)}, "Offer 3", inline="do3", group=grp_doff), do3n = input.string("${slotNote(do3)}", "", inline="do3", group=grp_doff)
do4p = input.float(${slotPrice(do4)}, "Offer 4", inline="do4", group=grp_doff), do4n = input.string("${slotNote(do4)}", "", inline="do4", group=grp_doff)
do5p = input.float(${slotPrice(do5)}, "Offer 5", inline="do5", group=grp_doff), do5n = input.string("${slotNote(do5)}", "", inline="do5", group=grp_doff)

// --- COLORS ---
grp_col = "Colors"
bullColor = input.color(#089981, "Bullish", group=grp_col)
bearColor = input.color(#f23645, "Bearish", group=grp_col)

// --- ARRAYS & CLEANUP ---
var line[] allLines = array.new_line()
var label[] allLabels = array.new_label()
var box[] allBoxes = array.new_box()

clearDrawings() =>
    if array.size(allLines) > 0
        for i = 0 to array.size(allLines) - 1
            line.delete(array.get(allLines, i))
        array.clear(allLines)
    if array.size(allLabels) > 0
        for i = 0 to array.size(allLabels) - 1
            label.delete(array.get(allLabels, i))
        array.clear(allLabels)
    if array.size(allBoxes) > 0
        for i = 0 to array.size(allBoxes) - 1
            box.delete(array.get(allBoxes, i))
        array.clear(allBoxes)

// --- DRAWING HELPERS ---
drawDirect(float price, string note, color col, bool isOffer, float off, int xS, int len, float h, string tS) =>
    if price != 0
        p = price + off
        top = isOffer ? p + h : p
        bot = isOffer ? p : p - h
        array.push(allBoxes, box.new(xS, top, xS + len, bot, border_color=color.new(col, 40), bgcolor=color.new(col, 90)))
        array.push(allLabels, label.new(xS + len, p, " " + note, color=#00000000, textcolor=col, style=label.style_label_left, size=tS))

drawTrap(string entry, string note, color col, float off, int xS, int len, string tS) =>
    if entry != "0/0"
        parts = str.split(entry, "/")
        if array.size(parts) == 2
            p1 = str.tonumber(array.get(parts, 0)) + off
            p2 = str.tonumber(array.get(parts, 1)) + off
            if not na(p1) and not na(p2)
                array.push(allBoxes, box.new(xS, p1, xS + len, p2, border_color=color.new(col, 60), bgcolor=color.new(col, 85)))
                array.push(allLabels, label.new(xS + len, p1, " " + str.tostring(p1-off) + " SW" + (note != "" ? " ("+note+")" : ""), color=#00000000, textcolor=col, style=label.style_label_left, size=tS))
                array.push(allLabels, label.new(xS + len, p2, " " + str.tostring(p2-off) + " RE", color=#00000000, textcolor=col, style=label.style_label_left, size=tS))

drawSR(string data, color col, float off, int xStart, int xLen, int lWeight, string tSize) =>
    if data != ""
        items = str.split(data, ",")
        for item in items
            clean = str.trim(item)
            isMaj = str.contains(str.lower(clean), "major")
            parts = str.split(clean, " ")
            pricePart = array.get(parts, 0)
            comment = ""
            if array.size(parts) > 1
                for i = 1 to array.size(parts) - 1
                    comment += " " + array.get(parts, i)
            v = str.tonumber(pricePart) + off
            if not na(v)
                array.push(allLines, line.new(xStart, v, xStart + xLen, v, color=col, width=isMaj ? lWeight + 1 : lWeight, style=isMaj ? line.style_solid : line.style_dotted))
                array.push(allLabels, label.new(xStart + xLen, v, " " + pricePart + comment, color=#00000000, textcolor=col, style=label.style_label_left, size=tSize))

// --- EXECUTION ---
if barstate.islast and is_allowed
    clearDrawings()
    xSR = bar_index + levelOffset
    xTar = bar_index + targetOffset
    xTrp = bar_index + trapOffset
    xBid = bar_index + bidBoxOffset
    drawSR(sup_data, bullColor, active_offset, xSR, levelLength, lineWeight, txtSize)
    drawSR(res_data, bearColor, active_offset, xSR, levelLength, lineWeight, txtSize)
    drawSR(tar_data, color.gray, active_offset, xTar, targetLength, lineWeight, txtSize)

    drawTrap(fbd1, n1, bullColor, active_offset, xTrp, trapLength, txtSize)
    drawTrap(fbd2, n2, bullColor, active_offset, xTrp, trapLength, txtSize)
    drawTrap(fbd3, n3, bullColor, active_offset, xTrp, trapLength, txtSize)
    drawTrap(fbd4, n4, bullColor, active_offset, xTrp, trapLength, txtSize)
    drawTrap(fbd5, n5, bullColor, active_offset, xTrp, trapLength, txtSize)

    drawTrap(fbo1, m1, bearColor, active_offset, xTrp, trapLength, txtSize)
    drawTrap(fbo2, m2, bearColor, active_offset, xTrp, trapLength, txtSize)
    drawTrap(fbo3, m3, bearColor, active_offset, xTrp, trapLength, txtSize)
    drawTrap(fbo4, m4, bearColor, active_offset, xTrp, trapLength, txtSize)
    drawTrap(fbo5, m5, bearColor, active_offset, xTrp, trapLength, txtSize)

    drawDirect(db1p, db1n, bullColor, false, active_offset, xBid, bidBoxLength, boxHeight, txtSize)
    drawDirect(db2p, db2n, bullColor, false, active_offset, xBid, bidBoxLength, boxHeight, txtSize)
    drawDirect(db3p, db3n, bullColor, false, active_offset, xBid, bidBoxLength, boxHeight, txtSize)
    drawDirect(db4p, db4n, bullColor, false, active_offset, xBid, bidBoxLength, boxHeight, txtSize)
    drawDirect(db5p, db5n, bullColor, false, active_offset, xBid, bidBoxLength, boxHeight, txtSize)

    drawDirect(do1p, do1n, bearColor, true, active_offset, xBid, bidBoxLength, boxHeight, txtSize)
    drawDirect(do2p, do2n, bearColor, true, active_offset, xBid, bidBoxLength, boxHeight, txtSize)
    drawDirect(do3p, do3n, bearColor, true, active_offset, xBid, bidBoxLength, boxHeight, txtSize)
    drawDirect(do4p, do4n, bearColor, true, active_offset, xBid, bidBoxLength, boxHeight, txtSize)
    drawDirect(do5p, do5n, bearColor, true, active_offset, xBid, bidBoxLength, boxHeight, txtSize)

// --- DASHBOARD ---
var table dash = table.new(position.top_right, 2, 1)
if show_dash and barstate.islast
    if is_allowed
        diff = math.abs(raw_basis - active_offset)
        table.cell(dash, 0, 0, (is_ref ? "ES REF" : "IG SYNC") + " | OFF: " + str.tostring(active_offset), text_color=color.white, bgcolor=diff > 1.0 ? color.red : color.blue)
    else
        table.cell(dash, 0, 0, "UNAUTHORIZED: " + syminfo.ticker, text_color=color.white, bgcolor=color.red)
`;
}
