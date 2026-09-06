function pad(value) {
  return String(Math.abs(value)).padStart(2, "0");
}

export function localDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid journal date");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localIso(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid journal timestamp");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `.${String(date.getMilliseconds()).padStart(3, "0")}`
    + `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

function boundedProgress(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

export function measuredActivitySeconds(lastTickAt, timestamp, { visible = true, idleMs = 300000 } = {}) {
  if (!visible) return 0;
  const start = Number(lastTickAt);
  const end = Number(timestamp);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.min(idleMs, end - start)) / 1000;
}

function nextLocalMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

export function readingSessionRecords(session, book, options = {}) {
  if (!session?.id || !book?.id) throw new Error("A reading session and book are required");
  const startMs = new Date(session.startedAt).getTime();
  const endMs = new Date(session.endedAt || session.updatedAt || session.startedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) throw new Error("Invalid reading session timestamps");
  const safeEnd = Math.max(startMs, endMs);
  const duration = Math.max(1, safeEnd - startMs);
  const activeSeconds = Math.max(0, Number(session.activeSeconds) || 0);
  const records = [];
  let cursor = startMs;
  do {
    const segmentEnd = Math.min(safeEnd, nextLocalMidnight(new Date(cursor)));
    const date = localDate(new Date(cursor));
    const share = safeEnd === startMs ? 1 : (segmentEnd - cursor) / duration;
    records.push({
      id: `${session.id}:${date}`,
      kind: "reading-session",
      at: localIso(new Date(cursor)),
      updatedAt: localIso(session.updatedAt || session.endedAt || new Date()),
      deleted: session.deleted === true,
      title: String(book.title || "Untitled book"),
      data: {
        bookId: book.id,
        bookTitle: String(book.title || "Untitled book"),
        author: String(book.author || ""),
        startedAt: localIso(new Date(cursor)),
        endedAt: localIso(new Date(segmentEnd)),
        activeSeconds: Math.round(activeSeconds * share),
        startProgression: boundedProgress(session.startProgression),
        endProgression: boundedProgress(session.endProgression),
        chapterLabel: String(session.chapterLabel || ""),
        contentIncluded: options.includeContent !== false,
        ...(session.importedHistory ? { importedHistory: true, historyAccuracy: session.historyAccuracy || "exact" } : {}),
      },
    });
    cursor = segmentEnd;
  } while (cursor < safeEnd);
  return records;
}

function artifactKind(storeName, record, operation) {
  if (storeName === "annotations") return `${record.kind === "note" ? "note" : "highlight"}-${operation}`;
  if (storeName === "bookmarks") return "bookmark-created";
  if (storeName === "vocabulary") return `vocabulary-${operation}`;
  throw new Error("Unsupported Petal journal artifact");
}

export function artifactToJournalRecord(storeName, record, book, operation = "created", options = {}) {
  if (!record?.id || !book?.id) throw new Error("An artifact and book are required");
  const normalizedOperation = operation === "updated" && storeName !== "bookmarks" ? "updated" : "created";
  const timestamp = normalizedOperation === "created"
    ? (record.createdAt || record.updatedAt)
    : (record.updatedAt || record.createdAt);
  const date = localDate(timestamp);
  const locator = record.locator || {};
  const common = {
    bookId: book.id,
    bookTitle: String(book.title || "Untitled book"),
    author: String(book.author || ""),
    chapterLabel: String(locator.chapterLabel || record.chapterLabel || ""),
    progression: boundedProgress(locator.progression ?? record.progression),
  };
  let details = {};
  if (storeName === "annotations") {
    details = {
      quote: String(record.quote || locator.textQuote?.exact || ""),
      note: String(record.note || ""),
      semanticColor: String(record.semanticColor || ""),
    };
  } else if (storeName === "vocabulary") {
    details = {
      word: String(record.word || ""),
      partOfSpeech: String(record.partOfSpeech || ""),
      definition: String(record.definition || ""),
      example: String(record.example || ""),
      sentence: String(record.sentence || ""),
      koreanNote: String(record.koreanNote || ""),
    };
  }
  const includeContent = options.includeContent !== false;
  if (!includeContent) {
    for (const key of ["quote", "note", "definition", "example", "sentence", "koreanNote"]) delete details[key];
  }
  return {
    id: normalizedOperation === "created" ? `${record.id}:created` : `${record.id}:updated:${date}`,
    kind: artifactKind(storeName, record, normalizedOperation),
    at: localIso(timestamp),
    updatedAt: localIso(options.updatedAt || record.deletedAt || record.updatedAt || timestamp),
    deleted: options.deleted === true,
    title: String(book.title || "Untitled book"),
    data: { ...common, ...details, contentIncluded: includeContent, ...(options.importedHistory ? { importedHistory: true, historyAccuracy: options.historyAccuracy || "exact" } : {}) },
  };
}
