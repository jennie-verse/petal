import {
  openDatabase, getAll, getPreferences, getMeta, setMeta, now, uuid,
  normalizeReaderPreferences
} from "./db.js";
import { ACCEPTED_FONT_VALUES, SETTING_LIMITS } from "./fonts.js";

const RECORD_STORES = ["books", "readingStates", "readingSessions", "annotations", "bookmarks", "vocabulary"];
const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const APP_VERSION = "1.4.0";
const PREFERENCE_RULES = {
  preset: ["original", "comfortable", "focus", "large", "custom"],
  // Includes retired v1.0.1 values on purpose: validation is permissive so old
  // backups load, and normalizeReaderPreferences() migrates them afterwards.
  fontFamily: ACCEPTED_FONT_VALUES,
  alignment: ["left", "justify"],
  spread: ["auto", "1", "2"],
  flow: ["paginated", "scrolled"],
  theme: ["paper", "rose", "mint", "sky", "lavender", "beige"]
};
const NUMERIC_PREFERENCE_RULES = SETTING_LIMITS;

const download = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

async function shareOrDownload(blob, name, title) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
  } else {
    download(blob, name);
  }
}

export async function makeBackupPackage() {
  const deviceId = await getMeta("deviceId") || uuid();
  await setMeta("deviceId", deviceId);
  const data = {};
  for (const store of RECORD_STORES) {
    const records = await getAll(store);
    data[store] = store === "books"
      ? records.map(({ coverBlob, ...book }) => book)
      : records;
  }
  data.preferences = await getPreferences();
  return {
    format: "petal-reader-backup",
    schemaVersion: 2,
    appVersion: APP_VERSION,
    exportId: uuid(),
    exportedAt: now(),
    sourceDeviceId: deviceId,
    data
  };
}

export async function exportJsonBackup() {
  const payload = await makeBackupPackage();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const date = payload.exportedAt.slice(0, 10);
  await shareOrDownload(blob, `petal-reader-backup-${date}.json`, "Petal Reader backup");
  await setMeta("lastSuccessfulBackupAt", now());
  return payload;
}

export async function readBackupFile(file) {
  if (file.size > MAX_BACKUP_BYTES) throw new Error("This backup is larger than the 25 MB safety limit.");
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("This file is not valid JSON. Nothing was changed.");
  }
  validateBackup(parsed);
  return parsed;
}

export function validateBackup(value) {
  if (!value || value.format !== "petal-reader-backup") throw new Error("This is not a Petal Reader backup. Nothing was changed.");
  if (![1, 2].includes(value.schemaVersion)) throw new Error("This backup version is not supported. Nothing was changed.");
  if (!value.data || typeof value.data !== "object") throw new Error("This backup has no data section.");
  // v1 backups predate measured reading sessions. They remain valid and are
  // upgraded in memory without inventing unavailable history.
  if (value.schemaVersion === 1 && !Array.isArray(value.data.readingSessions)) value.data.readingSessions = [];
  const preferences = value.data.preferences;
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
    throw new Error("Backup reader preferences are missing or invalid.");
  }
  for (const [key, allowed] of Object.entries(PREFERENCE_RULES)) {
    if (!allowed.includes(preferences[key])) throw new Error(`Backup reader preference “${key}” is invalid.`);
  }
  for (const [key, [min, max]] of Object.entries(NUMERIC_PREFERENCE_RULES)) {
    if (typeof preferences[key] !== "number" || !Number.isFinite(preferences[key]) || preferences[key] < min || preferences[key] > max) {
      throw new Error(`Backup reader preference “${key}” is outside its supported range.`);
    }
  }
  for (const key of ["animation", "publisherStyles"]) {
    if (typeof preferences[key] !== "boolean") throw new Error(`Backup reader preference “${key}” is invalid.`);
  }
  value.data.preferences = normalizeReaderPreferences(preferences);
  for (const store of RECORD_STORES) {
    if (!Array.isArray(value.data[store])) throw new Error(`Backup section “${store}” is missing or invalid.`);
    if (value.data[store].length > 100_000) throw new Error(`Backup section “${store}” contains too many records.`);
    const ids = new Set();
    for (const record of value.data[store]) {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error(`Backup section “${store}” contains an invalid record.`);
      }
      const id = store === "readingStates" ? record.bookId : record.id;
      if (typeof id !== "string" || !SAFE_ID.test(id) || ids.has(id)) {
        throw new Error(`Backup section “${store}” contains a missing, unsafe, or duplicate ID.`);
      }
      ids.add(id);
      if (store !== "books" && (typeof record.bookId !== "string" || !SAFE_ID.test(record.bookId))) {
        throw new Error(`Backup section “${store}” contains an invalid book reference.`);
      }
      for (const dateKey of ["createdAt", "updatedAt", "deletedAt", "lastReadAt", "lastOpenedAt"]) {
        if (record[dateKey] != null && (typeof record[dateKey] !== "string" || Number.isNaN(Date.parse(record[dateKey])))) {
          throw new Error(`Backup section “${store}” contains an invalid ${dateKey} date.`);
        }
      }
      if (record.revision != null && (!Number.isFinite(record.revision) || record.revision < 0)) {
        throw new Error(`Backup section “${store}” contains an invalid revision.`);
      }
      if (JSON.stringify(record).length > 2_000_000) {
        throw new Error(`Backup section “${store}” contains an oversized record.`);
      }
      if (store === "books") delete record.coverBlob;
      if (store === "books" && (
        typeof record.title !== "string" || record.title.length > 1_000
        || typeof record.author !== "string" || record.author.length > 1_000
      )) {
        throw new Error("Backup book metadata is missing or oversized.");
      }
    }
  }
  const bookIds = new Set(value.data.books.map(book => book.id));
  for (const store of ["readingStates", "readingSessions", "annotations", "bookmarks", "vocabulary"]) {
    for (const record of value.data[store]) {
      if (!bookIds.has(record.bookId)) record.orphaned = true;
    }
  }
  return true;
}

const newer = (incoming, local, storeName) => {
  if (!local) return true;
  if (storeName === "readingStates") {
    return String(incoming.lastReadAt || incoming.updatedAt || "")
      .localeCompare(String(local.lastReadAt || local.updatedAt || "")) > 0;
  }
  const revisionDelta = (incoming.revision || 0) - (local.revision || 0);
  if (revisionDelta) return revisionDelta > 0;
  return String(incoming.updatedAt || "").localeCompare(String(local.updatedAt || "")) > 0;
};

export async function previewRestore(payload) {
  validateBackup(payload);
  const preview = { books: payload.data.books.length, added: 0, updated: 0, conflicts: 0, orphaned: 0 };
  for (const store of RECORD_STORES) {
    const local = await getAll(store);
    const key = record => store === "readingStates" ? record.bookId : record.id;
    const map = new Map(local.map(record => [key(record), record]));
    for (const incoming of payload.data[store]) {
      const current = map.get(key(incoming));
      if (!current) preview.added++;
      else if (JSON.stringify(current) !== JSON.stringify(incoming)) {
        preview.updated++;
        if ((current.revision || 0) === (incoming.revision || 0) && current.updatedAt !== incoming.updatedAt) preview.conflicts++;
      }
      if (incoming.orphaned) preview.orphaned++;
    }
  }
  return preview;
}

// Backups intentionally drop coverBlob, and books hold the device-local EPUB link
// in activeFileHash. Both must survive a restore or the data is lost for good.
const preserveLocalBookFields = (incoming, local) => ({
  ...incoming,
  // Backups never carry a cover, so a book that is new to this device simply has
  // none yet — stored as an explicit null, matching importPublication().
  coverBlob: local?.coverBlob ?? null,
  activeFileHash: local?.activeFileHash ?? incoming.activeFileHash ?? null
});

export async function restoreBackup(payload, mode = "merge") {
  validateBackup(payload);
  const restorePreview = await previewRestore(payload);
  const localBooks = new Map((await getAll("books")).map(book => [book.id, book]));
  const db = await openDatabase();
  const stores = [...RECORD_STORES, "preferences"];
  const transaction = db.transaction(stores, "readwrite");
  const done = new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error("Restore was rolled back."));
    transaction.onerror = () => reject(transaction.error);
  });

  if (mode === "replace") {
    for (const name of RECORD_STORES) transaction.objectStore(name).clear();
    transaction.objectStore("preferences").put({
      ...payload.data.preferences,
      id: "reader"
    });
  }

  for (const storeName of RECORD_STORES) {
    const store = transaction.objectStore(storeName);
    for (const incoming of payload.data[storeName]) {
      if (mode === "replace") {
        store.put(storeName === "books"
          ? preserveLocalBookFields(incoming, localBooks.get(incoming.id))
          : incoming);
        continue;
      }
      const key = storeName === "readingStates" ? incoming.bookId : incoming.id;
      const request = store.get(key);
      request.onsuccess = () => {
        const current = request.result;
        const preserveConflicts = ["annotations", "vocabulary"].includes(storeName);
        const isConflict = current && preserveConflicts
          && (current.revision || 0) === (incoming.revision || 0)
          && current.updatedAt !== incoming.updatedAt
          && JSON.stringify(current) !== JSON.stringify(incoming);
        const incomingWins = newer(incoming, current, storeName);
        if (isConflict) {
          const loser = incomingWins ? current : incoming;
          store.put({
            ...loser,
            id: uuid(),
            conflictOf: current.id,
            updatedAt: now(),
            revision: (loser.revision || 0) + 1
          });
        }
        if (incomingWins) {
          store.put(storeName === "books"
            ? preserveLocalBookFields(incoming, current)
            : incoming);
        }
      };
    }
  }
  await done;
  return restorePreview;
}

const safeName = value => (value || "Untitled")
  .normalize("NFKC")
  .replace(/[\\/:*?"<>|#\[\]^]/g, "-")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 80);

const yamlString = value => JSON.stringify(String(value ?? ""));
const blockId = (prefix, id) => `^${prefix}-${String(id).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 12)}`;
const inlineMarkdown = value => String(value ?? "").replace(/\r?\n/g, "<br>");
const quoteLines = value => String(value ?? "").split(/\r?\n/).map(line => `> ${line}`);

export async function exportBookMarkdown(book) {
  const [state] = (await getAll("readingStates")).filter(item => item.bookId === book.id);
  const sections = {
    Highlights: (await getAll("annotations", "bookId", book.id)).filter(item => item.kind === "highlight" && !item.deletedAt),
    Notes: (await getAll("annotations", "bookId", book.id)).filter(item => item.kind === "note" && !item.deletedAt),
    Vocabulary: (await getAll("vocabulary", "bookId", book.id)).filter(item => !item.deletedAt),
    Bookmarks: (await getAll("bookmarks", "bookId", book.id)).filter(item => !item.deletedAt)
  };
  const lines = [
    "---",
    `title: ${yamlString(book.title)}`,
    `author: ${yamlString(book.author)}`,
    `book_id: ${yamlString(book.id)}`,
    "tags:",
    "  - petal-reader",
    `progress: ${Math.round((state?.progression || 0) * 100)}`,
    `exported_at: ${yamlString(now())}`,
    `app_version: "${APP_VERSION}"`,
    "---",
    ""
  ];
  for (const [heading, records] of Object.entries(sections)) {
    lines.push(`# ${heading}`, "");
    for (const record of records.sort((a, b) =>
      (a.locator?.spineIndex || 0) - (b.locator?.spineIndex || 0)
      || (a.locator?.progression || 0) - (b.locator?.progression || 0)
      || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
    )) {
      if (heading === "Vocabulary") {
        lines.push(
          `## ${inlineMarkdown(record.word)}`, "",
          `- Part of speech: ${inlineMarkdown(record.partOfSpeech)}`,
          `- Definition: ${inlineMarkdown(record.definition)}`,
          `- Korean note: ${inlineMarkdown(record.koreanNote)}`,
          `- Chapter: ${inlineMarkdown(record.locator?.chapterLabel)}`,
          "", blockId("v", record.id), ""
        );
      } else {
        lines.push(`> [!quote] ${record.semanticColor || record.kind || "bookmark"}`);
        if (record.quote || record.locator?.textQuote?.exact) {
          lines.push(...quoteLines(record.quote || record.locator.textQuote.exact));
        }
        if (record.note) lines.push(">", ...quoteLines(record.note));
        lines.push("", blockId(heading === "Bookmarks" ? "b" : "h", record.id), "");
      }
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const name = `${safeName(book.title)}--${book.id.slice(0, 8)}.md`;
  await shareOrDownload(blob, name, `${book.title} — Petal Reader notes`);
  await setMeta("lastSuccessfulBackupAt", now());
}
