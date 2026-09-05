import { get, getAll, saveReadingSession, uuid } from "./db.js";
import { artifactToJournalRecord, localDate, localIso, measuredActivitySeconds, readingSessionRecords } from "./journal-record.js";

const APP = "petal";
const NAMESPACE = "petal";
const QUEUE_NAMESPACE = "petal-journal";
const ENABLED_KEY = "petal.journalEnabled.v1";
const CONTENT_KEY = "petal.journalContent.v1";
const TOKEN_KEY = "sync.token.v1";
const IDLE_MS = 5 * 60 * 1000;
const githubPagesOwner = () => {
  const hostname = String(globalThis.location?.hostname || "").toLowerCase();
  return hostname.endsWith(".github.io")
    ? hostname.slice(0, -".github.io".length)
    : "";
};
const REPO = Object.freeze({ owner: githubPagesOwner(), repo: "webapp-data", branch: "main" });

let clientPromise = null;
let syncModulePromise = null;
let listener = null;
let active = null;
let idleTimer = null;
let lastState = { status: "not reported", pendingCount: 0, errorCode: "" };

function readItem(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

function writeItem(key, value) {
  try { localStorage.setItem(key, value); } catch { /* local reading still works */ }
}

function publish(patch) {
  lastState = { ...lastState, ...patch };
  try { listener?.({ enabled: isJournalEnabled(), ...lastState }); } catch { /* UI only */ }
}

function safeCode(error, fallback) {
  return typeof error?.code === "string" && /^[A-Z0-9_-]{1,64}$/.test(error.code)
    ? error.code : fallback;
}

async function syncApi() {
  if (!syncModulePromise) {
    syncModulePromise = import("../../../shared/v1/sync.js").catch(error => {
      syncModulePromise = null;
      throw error;
    });
  }
  return syncModulePromise;
}

export function hasJournalToken() {
  return Boolean(readItem(TOKEN_KEY));
}

export function saveJournalToken(value) {
  const token = String(value || "").trim();
  if (token) writeItem(TOKEN_KEY, token);
  clientPromise = null;
  return Boolean(token);
}

export async function saveJournalConnection(token, preferredName = "") {
  if (String(token || "").trim()) saveJournalToken(token);
  if (!hasJournalToken()) return { ok: false, reason: "token" };
  try {
    await ensureContext(preferredName);
    clientPromise = null;
    return { ok: true };
  } catch {
    return { ok: false, reason: "context" };
  }
}

export function isJournalEnabled() {
  return readItem(ENABLED_KEY) === "1";
}
export function isJournalContentEnabled() { return readItem(CONTENT_KEY) !== "0"; }
export function withoutJournalContent(record) {
  const data = { ...(record?.data || {}) };
  for (const key of ["quote", "note", "definition", "example", "sentence", "koreanNote"]) delete data[key];
  return { ...record, updatedAt: localIso(), data: { ...data, contentIncluded: false } };
}
export async function setJournalContentEnabled(enabled) {
  writeItem(CONTENT_KEY, enabled ? "1" : "0");
  const client = await getClient();
  if (client && !enabled) await client.transformPending(withoutJournalContent);
  await reportJournalStatus();
}

export function getJournalState() {
  return { enabled: isJournalEnabled(), hasToken: hasJournalToken(), ...lastState };
}

export function onJournalState(fn) {
  listener = typeof fn === "function" ? fn : null;
  if (listener) publish({});
  return () => { if (listener === fn) listener = null; };
}

export async function getJournalContext() {
  try {
    const api = await syncApi();
    return { id: api.getContextId(NAMESPACE) || "", label: api.getContextLabel(NAMESPACE) || "" };
  } catch {
    return { id: "", label: "" };
  }
}

async function ensureContext(preferredName = "") {
  const api = await syncApi();
  const id = await api.ensureContextId(NAMESPACE, () => preferredName.trim());
  if (preferredName.trim()) api.setContextLabel(NAMESPACE, preferredName.trim());
  return id;
}

async function getClient() {
  if (clientPromise) {
    const existing = await clientPromise;
    if (existing) return existing;
    clientPromise = null;
  }
  clientPromise = (async () => {
    const context = (await getJournalContext()).id;
    if (!context) return null;
    const module = await import("../../../shared/v2/journal.js");
    return module.createJournalClient({
      app: APP,
      context,
      namespace: QUEUE_NAMESPACE,
      isEnabled: isJournalEnabled,
      resolveConfig: async () => {
        const token = readItem(TOKEN_KEY);
        if (!token) throw Object.assign(new Error("Journal authentication unavailable"), { code: "AUTH" });
        return { ...REPO, token };
      },
      onState: state => publish({
        status: state.status,
        pendingCount: state.pendingCount,
        errorCode: state.errorCode || "",
        lastSuccessfulWriteAt: state.lastSuccessfulWriteAt,
      }),
    });
  })().catch(() => null);
  return clientPromise;
}

export async function toggleJournal(enabled, preferredName = "") {
  if (enabled) {
    if (!hasJournalToken()) return { ok: false, reason: "token" };
    try { await ensureContext(preferredName); }
    catch { return { ok: false, reason: "context" }; }
  }
  writeItem(ENABLED_KEY, enabled ? "1" : "0");
  clientPromise = null;
  publish({ status: enabled ? "ready" : "disabled", errorCode: "" });
  await reportJournalStatus({ enabledAt: enabled ? localIso() : undefined });
  return { ok: true };
}

export async function reportJournalStatus(extra = {}) {
  const client = await getClient();
  if (!client) return false;
  try {
    await client.reportStatus({ journalEnabled: isJournalEnabled(), contentIncluded: isJournalContentEnabled(), ...extra });
    return true;
  } catch (error) {
    publish({ status: "error", errorCode: safeCode(error, "STATUS_FAILED") });
    return false;
  }
}

async function enqueueRecord(record, options = {}) {
  if (!isJournalEnabled()) return false;
  const client = await getClient();
  if (!client) {
    publish({ status: "error", errorCode: "MODULE_UNAVAILABLE" });
    return false;
  }
  try {
    await client.enqueue(record, options);
    return true;
  } catch (error) {
    publish({ status: "error", errorCode: safeCode(error, "QUEUE_FAILED") });
    return false;
  }
}

export async function queueArtifact(storeName, record, book, operation = "created", options = {}) {
  const journalRecord = artifactToJournalRecord(storeName, record, book, operation, { ...options, includeContent: isJournalContentEnabled() });
  return enqueueRecord(journalRecord, { date: localDate(journalRecord.at) });
}

export async function queueArtifactDeletion(storeName, record, book) {
  if (!record) return false;
  const operations = [{ type: "created", timestamp: record.createdAt || record.updatedAt }];
  if (storeName !== "bookmarks" && localDate(record.updatedAt) !== localDate(record.createdAt || record.updatedAt)) {
    operations.push({ type: "updated", timestamp: record.updatedAt });
  }
  let queued = false;
  for (const operation of operations) {
    const source = { ...record, updatedAt: operation.timestamp };
    queued = await queueArtifact(storeName, source, book, operation.type, {
      deleted: true,
      updatedAt: record.deletedAt || new Date(),
    }) || queued;
  }
  return queued;
}

export async function queueReadingSession(session, book, { deleted = false } = {}) {
  let queued = false;
  for (const record of readingSessionRecords({ ...session, deleted }, book, { includeContent: isJournalContentEnabled() })) {
    queued = await enqueueRecord(record, { date: localDate(record.at) }) || queued;
  }
  return queued;
}

async function projectActiveSession() {
  if (!active) return;
  active.updatedAt = localIso();
  await saveReadingSession(active);
  await queueReadingSession(active, active.book);
}

function clearIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = null;
}

function armIdleTimer() {
  clearIdleTimer();
  idleTimer = setTimeout(() => finishReadingSession("idle").catch(() => {}), IDLE_MS);
}

export async function beginReadingSession(book, readingState = {}) {
  if (active?.book?.id === book?.id) return noteReaderActivity({
    progression: readingState.progression,
    chapterLabel: readingState.chapterLabel,
  });
  await finishReadingSession("switch");
  const timestamp = localIso();
  active = {
    id: uuid(),
    bookId: book.id,
    book: { id: book.id, title: book.title, author: book.author },
    date: localDate(timestamp),
    startedAt: timestamp,
    endedAt: timestamp,
    updatedAt: timestamp,
    activeSeconds: 0,
    startProgression: Number(readingState?.progression) || 0,
    endProgression: Number(readingState?.progression) || 0,
    chapterLabel: String(readingState?.chapterLabel || ""),
    lastTickAt: Date.now(),
  };
  armIdleTimer();
  await projectActiveSession();
}

export async function noteReaderActivity(location = {}) {
  if (!active || document.visibilityState !== "visible") return;
  const timestamp = Date.now();
  active.activeSeconds += measuredActivitySeconds(active.lastTickAt, timestamp, {
    visible: document.visibilityState === "visible", idleMs: IDLE_MS,
  });
  active.lastTickAt = timestamp;
  active.endedAt = localIso(timestamp);
  if (Number.isFinite(Number(location.progression))) active.endProgression = Number(location.progression);
  if (location.chapterLabel) active.chapterLabel = String(location.chapterLabel);
  armIdleTimer();
  await projectActiveSession();
}

export async function finishReadingSession(reason = "closed") {
  clearIdleTimer();
  if (!active) return;
  const session = active;
  active = null;
  const timestamp = Date.now();
  session.activeSeconds += measuredActivitySeconds(session.lastTickAt, timestamp, {
    // visibilitychange fires after the document becomes hidden, but this final
    // interval was accumulated while the viewer was still visible.
    visible: true, idleMs: IDLE_MS,
  });
  session.endedAt = localIso(timestamp);
  session.updatedAt = session.endedAt;
  session.reason = reason;
  await saveReadingSession(session);
  await queueReadingSession(session, session.book);
}

export async function handleVisibility(book, readingState = {}) {
  if (document.visibilityState === "hidden") await finishReadingSession("hidden");
  else if (book) await beginReadingSession(book, readingState);
}

export async function backfillJournal({ from, to }) {
  const client = await getClient();
  if (!client) return { written: 0, error: new Error("Journal unavailable") };
  const [books, readingStates, annotations, bookmarks, vocabulary] = await Promise.all([
    getAll("books"), getAll("readingStates"), getAll("annotations"), getAll("bookmarks"), getAll("vocabulary"),
  ]);
  const bookMap = new Map(books.filter(book => !book.deletedAt).map(book => [book.id, book]));
  const within = value => {
    try { const date = localDate(value); return date >= from && date <= to; } catch { return false; }
  };
  const records = [];
  for (const reading of readingStates) {
    const book = bookMap.get(reading.bookId);
    if (!book || reading.deletedAt || !within(reading.lastReadAt)) continue;
    const timestamp = reading.lastReadAt;
    records.push(...readingSessionRecords({
      id: `imported-${reading.bookId}-${localDate(timestamp)}`,
      startedAt: timestamp,
      endedAt: timestamp,
      updatedAt: timestamp,
      activeSeconds: 0,
      startProgression: reading.progression,
      endProgression: reading.progression,
      chapterLabel: reading.chapterLabel,
      importedHistory: true,
    }, book));
  }
  for (const [storeName, items] of [["annotations", annotations], ["bookmarks", bookmarks], ["vocabulary", vocabulary]]) {
    for (const item of items) {
      const book = bookMap.get(item.bookId);
      if (!book || item.deletedAt) continue;
      if (within(item.createdAt)) records.push(artifactToJournalRecord(storeName, item, book, "created", { importedHistory: true }));
      if (storeName !== "bookmarks" && item.updatedAt !== item.createdAt && within(item.updatedAt)) {
        records.push(artifactToJournalRecord(storeName, item, book, "updated", { importedHistory: true }));
      }
    }
  }
  const dates = new Set(records.map(record => localDate(record.at)));
  await reportJournalStatus({ backfill: { status: "running", from, to, processedDates: 0, totalDates: dates.size, updatedAt: localIso() } });
  for (const record of records) await client.enqueue(record, { date: localDate(record.at) });
  const result = await client.flush();
  await reportJournalStatus({ backfill: {
    status: result.error ? "partial" : "complete", from, to,
    processedDates: result.error ? 0 : dates.size, totalDates: dates.size, updatedAt: localIso(),
  } });
  return { ...result, records: records.length, dates: dates.size };
}

export async function redactJournalContent({ from, to }) {
  const client = await getClient();
  if (!client) return { redactedRecords: 0, pendingCount: 0, error: new Error("Journal unavailable") };
  return client.redactRange({ from, to, transform: withoutJournalContent });
}

export async function refreshJournalState() {
  const client = await getClient();
  if (client) {
    try { publish({ pendingCount: await client.pendingCount() }); } catch { /* safe status only */ }
  }
  return getJournalState();
}
