// TF-IDF baseline vectorizer. Deterministic keyword/lexical comparison only —
// NO embeddings. Isolated so Phase 2B/3 can swap in an embedding matcher
// without touching the rest of the ranker.

import {
  getSkillLexicon,
} from "../skills/skillExtractor.js";

// English stopwords (small common set) — enough for the corpus baseline.
const STOPWORDS = new Set(
  "a an and as at be by for from how in is it of on or that the to was what when where who will with this your you we they he she its their our are were can have has could should would do does did not no so than then just also but if them there here all each some any".split(
    " "
  )
);

// Tokenize a document into lowercase alpha-numeric terms (2+ chars).
export function tokenize(text = "") {
  const terms = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9+#._\s-]/g, " ")
    .split(/[\s_-]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return terms;
}

export function termFrequencies(text = "") {
  const map = new Map();
  for (const term of tokenize(text)) {
    map.set(term, (map.get(term) || 0) + 1);
  }
  return map;
}

// Build normalized TF vectors for a set of documents.
// Each doc: { id, text }. Returns { docs: [{id, tf: Map}], vocab: Set }.
export function buildTfVectors(docs) {
  const vectors = [];
  const vocab = new Set();
  for (const doc of docs) {
    const tf = termFrequencies(doc.text);
    // Normalize by total terms so longer docs don't dominate.
    const total = [...tf.values()].reduce((a, b) => a + b, 0) || 1;
    const normalized = new Map();
    for (const [term, count] of tf) {
      vocab.add(term);
      normalized.set(term, count / total);
    }
    vectors.push({ id: doc.id, tf: normalized });
  }
  return { docs: vectors, vocab };
}

// IDF per term across the collection; smoothed (log(N+1)/(df+1)) + 1.
export function buildIdf(tfVectors, vocab) {
  const N = tfVectors.docs.length;
  const df = new Map();
  for (const term of vocab) df.set(term, 0);
  for (const doc of tfVectors.docs) {
    for (const term of doc.tf.keys()) {
      if (vocab.has(term)) df.set(term, df.get(term) + 1);
    }
  }
  const idf = new Map();
  for (const term of vocab) {
    const docFreq = df.get(term) || 0;
    idf.set(term, Math.log((N + 1) / (docFreq + 1)) + 1);
  }
  return idf;
}

export function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  // iterate smaller map
  const [small, large] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
  for (const [term, value] of small) {
    const other = large.get(term);
    if (other) dot += value * other;
    normA += value * value;
  }
  for (const value of large.values()) normB += value * value;
  for (const value of small.values()) normA += value * value;
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// Skill lexicon terms (aliases) used to enrich issue documents, so a match on
// "FastAPI" or "Express" maps to a skill even if the raw token differs.
export function skillAliasTerms() {
  const terms = new Set();
  const lexicon = getSkillLexicon();
  for (const { aliases } of Object.values(lexicon)) {
    for (const alias of aliases) terms.add(alias.toLowerCase());
  }
  return terms;
}