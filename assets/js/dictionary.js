const BASE = new URL("../../dictionary/oewn-2025-dc343f2/", import.meta.url);
const memory = new Map();

const normalize = word => word
  .normalize("NFC")
  .toLocaleLowerCase("en")
  .replace(/^[^a-z]+|[^a-z'-]+$/g, "");

const chunkName = word => {
  const letters = word.replace(/[^a-z]/g, "").slice(0, 2);
  return `${letters.length === 2 ? letters : "__"}.json`;
};

async function loadChunk(word) {
  const name = chunkName(word);
  if (memory.has(name)) return memory.get(name);
  const response = await fetch(new URL(name, BASE));
  if (!response.ok) throw new Error("Local dictionary data could not be loaded.");
  const data = await response.json();
  memory.set(name, data);
  return data;
}

async function exact(word) {
  const chunk = await loadChunk(word);
  if (chunk.w[word]) return chunk.w[word];
  const alias = chunk.a[word]?.[0];
  if (alias) {
    const aliasChunk = await loadChunk(alias);
    return aliasChunk.w[alias];
  }
  return null;
}

function candidates(word) {
  const list = [];
  if (word.endsWith("ies") && word.length > 4) list.push(`${word.slice(0, -3)}y`);
  if (word.endsWith("es") && word.length > 3) list.push(word.slice(0, -2));
  if (word.endsWith("s") && word.length > 3) list.push(word.slice(0, -1));
  if (word.endsWith("ied") && word.length > 4) list.push(`${word.slice(0, -3)}y`);
  if (word.endsWith("ed") && word.length > 4) list.push(word.slice(0, -2), word.slice(0, -1));
  if (word.endsWith("ing") && word.length > 5) list.push(word.slice(0, -3), `${word.slice(0, -3)}e`);
  if (word.endsWith("er") && word.length > 4) list.push(word.slice(0, -2));
  if (word.endsWith("est") && word.length > 5) list.push(word.slice(0, -3));
  return [...new Set(list)];
}

export async function lookup(word) {
  const normalized = normalize(word);
  if (!normalized) return { word: "", entry: null };
  let entry = await exact(normalized);
  let matched = normalized;
  if (!entry) {
    for (const candidate of candidates(normalized)) {
      entry = await exact(candidate);
      if (entry) {
        matched = candidate;
        break;
      }
    }
  }
  return { word: normalized, matched, entry };
}

export function formatPartOfSpeech(code) {
  return ({ n: "noun", v: "verb", a: "adjective", s: "adjective", r: "adverb" })[code] || code || "";
}
