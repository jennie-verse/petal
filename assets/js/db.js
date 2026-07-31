import { READER_FONT_VALUES, DEFAULT_FONT, DEFAULT_FONT_SIZE, SETTING_LIMITS } from "./fonts.js";

const DB_NAME = "petal-reader";
const DB_VERSION = 1;
// Deliberately narrower than backup.js: unknown or retired font values are
// migrated to DEFAULT_FONT here rather than rejected.
const READER_FONTS = new Set(READER_FONT_VALUES);
const DEFAULT_READER_PREFERENCES = {
  id: "reader",
  preset: "comfortable",
  fontFamily: DEFAULT_FONT,
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: 1.6,
  letterSpacing: 0,
  paragraphSpacing: 0.5,
  horizontalMargin: 32,
  verticalMargin: 24,
  textWidth: 68,
  alignment: "left",
  spread: "auto",
  flow: "paginated",
  theme: "paper",
  animation: false,
  publisherStyles: false
};

let dbPromise;

export const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const clampNumber = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

export function normalizeReaderPreferences(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalized = {
    ...DEFAULT_READER_PREFERENCES,
    id: "reader",
    preset: ["original", "comfortable", "focus", "large", "custom"].includes(source.preset)
      ? source.preset : DEFAULT_READER_PREFERENCES.preset,
    fontFamily: READER_FONTS.has(source.fontFamily)
      ? source.fontFamily : DEFAULT_READER_PREFERENCES.fontFamily,
    fontSize: clampNumber(source.fontSize, DEFAULT_READER_PREFERENCES.fontSize, ...SETTING_LIMITS.fontSize),
    lineHeight: clampNumber(source.lineHeight, DEFAULT_READER_PREFERENCES.lineHeight, ...SETTING_LIMITS.lineHeight),
    letterSpacing: clampNumber(source.letterSpacing, DEFAULT_READER_PREFERENCES.letterSpacing, ...SETTING_LIMITS.letterSpacing),
    paragraphSpacing: clampNumber(source.paragraphSpacing, DEFAULT_READER_PREFERENCES.paragraphSpacing, ...SETTING_LIMITS.paragraphSpacing),
    horizontalMargin: clampNumber(source.horizontalMargin, DEFAULT_READER_PREFERENCES.horizontalMargin, ...SETTING_LIMITS.horizontalMargin),
    verticalMargin: clampNumber(source.verticalMargin, DEFAULT_READER_PREFERENCES.verticalMargin, ...SETTING_LIMITS.verticalMargin),
    textWidth: clampNumber(source.textWidth, DEFAULT_READER_PREFERENCES.textWidth, ...SETTING_LIMITS.textWidth),
    alignment: ["left", "justify"].includes(source.alignment) ? source.alignment : DEFAULT_READER_PREFERENCES.alignment,
    spread: ["auto", "1", "2"].includes(source.spread) ? source.spread : DEFAULT_READER_PREFERENCES.spread,
    flow: ["paginated", "scrolled"].includes(source.flow) ? source.flow : DEFAULT_READER_PREFERENCES.flow,
    theme: ["paper", "rose", "mint", "sky", "lavender", "beige"].includes(source.theme)
      ? source.theme : DEFAULT_READER_PREFERENCES.theme,
    animation: typeof source.animation === "boolean" ? source.animation : DEFAULT_READER_PREFERENCES.animation,
    publisherStyles: typeof source.publisherStyles === "boolean"
      ? source.publisherStyles : DEFAULT_READER_PREFERENCES.publisherStyles
  };
  normalized.revision = Number.isFinite(source.revision) && source.revision > 0 ? source.revision : 1;
  normalized.updatedAt = typeof source.updatedAt === "string" ? source.updatedAt : now();
  return normalized;
}

export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      const stores = {
        books: { keyPath: "id", indexes: [["lastOpenedAt", "lastOpenedAt"], ["updatedAt", "updatedAt"], ["activeFileHash", "activeFileHash"]] },
        publicationFiles: { keyPath: "fileHash", indexes: [["bookId", "bookId"]] },
        readingStates: { keyPath: "bookId", indexes: [["lastReadAt", "lastReadAt"]] },
        annotations: { keyPath: "id", indexes: [["bookId", "bookId"], ["bookKind", ["bookId", "kind"]], ["updatedAt", "updatedAt"], ["deletedAt", "deletedAt"]] },
        bookmarks: { keyPath: "id", indexes: [["bookId", "bookId"], ["updatedAt", "updatedAt"], ["deletedAt", "deletedAt"]] },
        vocabulary: { keyPath: "id", indexes: [["bookId", "bookId"], ["word", "word"], ["updatedAt", "updatedAt"], ["deletedAt", "deletedAt"]] },
        preferences: { keyPath: "id" },
        dictionaryCache: { keyPath: "key" },
        searchCache: { keyPath: "key" },
        meta: { keyPath: "key" }
      };
      for (const [name, config] of Object.entries(stores)) {
        const store = db.objectStoreNames.contains(name)
          ? event.target.transaction.objectStore(name)
          : db.createObjectStore(name, { keyPath: config.keyPath });
        for (const [indexName, keyPath] of config.indexes || []) {
          if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, { unique: false });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return dbPromise;
}

const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const transactionDone = transaction => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = () => reject(transaction.error || new Error("Transaction aborted"));
  transaction.onerror = () => reject(transaction.error);
});

export async function get(storeName, key) {
  const db = await openDatabase();
  return requestResult(db.transaction(storeName).objectStore(storeName).get(key));
}

export async function getAll(storeName, indexName, query) {
  const db = await openDatabase();
  const source = indexName
    ? db.transaction(storeName).objectStore(storeName).index(indexName)
    : db.transaction(storeName).objectStore(storeName);
  return requestResult(source.getAll(query));
}

export async function put(storeName, value) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
  return value;
}

export async function putMany(storeName, values) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  values.forEach(value => store.put(value));
  await transactionDone(transaction);
}

export async function remove(storeName, key) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
}

export async function importPublication({ file, fileHash, metadata, coverBlob }) {
  const db = await openDatabase();
  const existingFile = await get("publicationFiles", fileHash);
  if (existingFile) return { duplicate: true, book: await get("books", existingFile.bookId) };

  const timestamp = now();
  const book = {
    id: uuid(),
    title: metadata.title || file.name.replace(/\.epub$/i, ""),
    author: Array.isArray(metadata.author) ? metadata.author.join(", ") : metadata.author || "Unknown author",
    language: metadata.language || "en",
    identifier: metadata.identifier || null,
    coverBlob: coverBlob || null,
    activeFileHash: fileHash,
    originalFileName: file.name,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    revision: 1
  };

  const transaction = db.transaction(["books", "publicationFiles"], "readwrite");
  transaction.objectStore("books").add(book);
  transaction.objectStore("publicationFiles").add({
    fileHash,
    bookId: book.id,
    epubBlob: file,
    fileName: file.name,
    size: file.size,
    importedAt: timestamp
  });
  await transactionDone(transaction);
  return { duplicate: false, book };
}

export async function reconnectPublication({ bookId, file, fileHash, metadata, coverBlob }) {
  const db = await openDatabase();
  const book = await get("books", bookId);
  if (!book) throw new Error("Book record not found.");
  const existing = await get("publicationFiles", fileHash);
  if (existing && existing.bookId !== bookId) throw new Error("This EPUB is already connected to another library record.");
  const timestamp = now();
  const transaction = db.transaction(["books", "publicationFiles"], "readwrite");
  transaction.objectStore("publicationFiles").put({
    fileHash,
    bookId,
    epubBlob: file,
    fileName: file.name,
    size: file.size,
    importedAt: timestamp
  });
  transaction.objectStore("books").put({
    ...book,
    title: book.title || metadata.title,
    author: book.author || metadata.author,
    coverBlob: book.coverBlob || coverBlob || null,
    activeFileHash: fileHash,
    originalFileName: file.name,
    updatedAt: timestamp,
    revision: (book.revision || 0) + 1
  });
  await transactionDone(transaction);
  return get("books", bookId);
}

export async function getBooks() {
  const books = (await getAll("books")).filter(book => !book.deletedAt);
  return books.sort((a, b) => String(b.lastOpenedAt || b.updatedAt).localeCompare(String(a.lastOpenedAt || a.updatedAt)));
}

export async function getBookFile(book) {
  if (!book?.activeFileHash) return null;
  return get("publicationFiles", book.activeFileHash);
}

export async function updateBook(bookId, patch) {
  const book = await get("books", bookId);
  if (!book) throw new Error("Book not found");
  const updated = {
    ...book,
    ...patch,
    updatedAt: now(),
    revision: (book.revision || 0) + 1
  };
  return put("books", updated);
}

export async function saveReadingState(bookId, patch) {
  const current = await get("readingStates", bookId);
  return put("readingStates", {
    ...current,
    ...patch,
    bookId,
    revision: (current?.revision || 0) + 1,
    createdAt: current?.createdAt || now(),
    updatedAt: now(),
    lastReadAt: now()
  });
}

export async function getBookRecords(bookId) {
  const [annotations, bookmarks, vocabulary] = await Promise.all([
    getAll("annotations", "bookId", bookId),
    getAll("bookmarks", "bookId", bookId),
    getAll("vocabulary", "bookId", bookId)
  ]);
  return {
    annotations: annotations.filter(item => !item.deletedAt),
    bookmarks: bookmarks.filter(item => !item.deletedAt),
    vocabulary: vocabulary.filter(item => !item.deletedAt)
  };
}

export async function addAnnotation(record) {
  const timestamp = now();
  return put("annotations", {
    ...record,
    id: record.id || uuid(),
    revision: record.revision || 1,
    createdAt: record.createdAt || timestamp,
    updatedAt: timestamp
  });
}

export async function addBookmark(record) {
  const timestamp = now();
  return put("bookmarks", {
    ...record,
    id: record.id || uuid(),
    revision: record.revision || 1,
    createdAt: record.createdAt || timestamp,
    updatedAt: timestamp
  });
}

export async function addVocabulary(record) {
  const timestamp = now();
  return put("vocabulary", {
    ...record,
    id: record.id || uuid(),
    revision: record.revision || 1,
    createdAt: record.createdAt || timestamp,
    updatedAt: timestamp
  });
}

export async function tombstone(storeName, id) {
  const record = await get(storeName, id);
  if (!record) return;
  return put(storeName, {
    ...record,
    deletedAt: now(),
    updatedAt: now(),
    revision: (record.revision || 0) + 1
  });
}

export async function getPreferences() {
  return normalizeReaderPreferences(await get("preferences", "reader"));
}

export async function savePreferences(preferences) {
  const current = await getPreferences();
  return put("preferences", normalizeReaderPreferences({
    ...current,
    ...preferences,
    id: "reader",
    updatedAt: now(),
    revision: (current.revision || 0) + 1
  }));
}

export async function deleteBookCopy(bookId) {
  const book = await get("books", bookId);
  if (!book?.activeFileHash) return;
  await remove("publicationFiles", book.activeFileHash);
  await updateBook(bookId, { activeFileHash: null });
}

export async function deleteBookAndRecords(bookId) {
  const db = await openDatabase();
  const book = await get("books", bookId);
  const transaction = db.transaction(["books", "publicationFiles", "readingStates", "annotations", "bookmarks", "vocabulary"], "readwrite");
  transaction.objectStore("books").put({ ...book, deletedAt: now(), updatedAt: now(), revision: (book.revision || 0) + 1 });
  if (book?.activeFileHash) transaction.objectStore("publicationFiles").delete(book.activeFileHash);
  const readingRequest = transaction.objectStore("readingStates").get(bookId);
  readingRequest.onsuccess = () => {
    const reading = readingRequest.result;
    if (reading) transaction.objectStore("readingStates").put({
      ...reading,
      deletedAt: now(),
      updatedAt: now(),
      revision: (reading.revision || 0) + 1
    });
  };
  for (const storeName of ["annotations", "bookmarks", "vocabulary"]) {
    const index = transaction.objectStore(storeName).index("bookId");
    const request = index.openCursor(IDBKeyRange.only(bookId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value;
      cursor.update({
        ...record,
        deletedAt: now(),
        updatedAt: now(),
        revision: (record.revision || 0) + 1
      });
      cursor.continue();
    };
  }
  await transactionDone(transaction);
}

export async function storageSummary() {
  const [estimate, persisted, files] = await Promise.all([
    navigator.storage?.estimate?.(),
    navigator.storage?.persisted?.(),
    getAll("publicationFiles")
  ]);
  return {
    usage: estimate?.usage || 0,
    quota: estimate?.quota || 0,
    persisted: Boolean(persisted),
    publicationBytes: files.reduce((total, file) => total + Number(file.size || file.epubBlob?.size || 0), 0)
  };
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function setMeta(key, value) {
  return put("meta", { key, value, updatedAt: now() });
}

export async function getMeta(key) {
  return (await get("meta", key))?.value;
}

export async function resetAllLocalData() {
  const db = await openDatabase();
  const storeNames = [...db.objectStoreNames];
  const transaction = db.transaction(storeNames, "readwrite");
  for (const storeName of storeNames) transaction.objectStore(storeName).clear();
  await transactionDone(transaction);
  localStorage.clear();
  if ("caches" in globalThis) {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("petal-reader-")).map(key => caches.delete(key)));
  }
}
