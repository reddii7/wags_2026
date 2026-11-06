const FIGURE = /(£[\d,.]+|\b\d+(?:\.\d+)?\s+points?\b)/gi;

export function figureParts(value) {
  const text = String(value || "");
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(FIGURE)) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ text: text.slice(last, index), accent: false });
    }
    parts.push({ text: match[0], accent: true });
    last = index + match[0].length;
  }
  if (last < text.length || !parts.length) {
    parts.push({ text: text.slice(last), accent: false });
  }
  return parts;
}
