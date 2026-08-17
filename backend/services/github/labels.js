// Label handling for the issue corpus. GitHub labels vary in spelling between
// repositories ("Good First Issue", "good-first-issue", "good first issue", …),
// so we normalize before filtering and matching.

// Canonicalized label key: lowercase, whitespace-equivalent separators collapsed.
export function normalizeLabel(label) {
  return String(label || "")
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, " ");
}

// Well-known starter labels a newcomer-friendly filter should treat as equal.
export const STARTER_LABEL_KEYS = ["good first issue", "help wanted"];

export function isStarterLabel(label) {
  return STARTER_LABEL_KEYS.includes(normalizeLabel(label));
}

// Returns the normalized key of the first matching starter label, or null.
export function starterLabelKey(labels = []) {
  for (const label of labels) {
    const key = normalizeLabel(label);
    if (STARTER_LABEL_KEYS.includes(key)) return key;
  }
  return null;
}

// Distinct normalized label list (orders not important; used for storage).
export function normalizeLabels(labels = []) {
  return [...new Set(labels.map(normalizeLabel).filter(Boolean))];
}