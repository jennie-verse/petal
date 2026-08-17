import test from "node:test";
import assert from "node:assert/strict";
import { artifactToJournalRecord, localDate, measuredActivitySeconds, readingSessionRecords } from "../assets/js/journal-record.js";

const book = { id: "book-1", title: "Fixture Garden", author: "A. Reader" };

test("reading sessions contain the approved progress and book fields", () => {
  const [record] = readingSessionRecords({
    id: "session-1",
    startedAt: "2026-08-17T10:00:00-05:00",
    endedAt: "2026-08-17T10:12:30-05:00",
    updatedAt: "2026-08-17T10:12:30-05:00",
    activeSeconds: 750,
    startProgression: .25,
    endProgression: .31,
    chapterLabel: "Chapter 4",
  }, book);
  assert.equal(record.kind, "reading-session");
  assert.equal(record.title, "Fixture Garden");
  assert.equal(record.data.activeSeconds, 750);
  assert.equal(record.data.startProgression, .25);
  assert.equal(record.data.endProgression, .31);
  assert.equal(record.data.chapterLabel, "Chapter 4");
});

test("sessions crossing local midnight split into stable date records", () => {
  const start = new Date(2026, 7, 17, 23, 59, 30);
  const end = new Date(2026, 7, 18, 0, 0, 30);
  const records = readingSessionRecords({
    id: "session-midnight", startedAt: start, endedAt: end, updatedAt: end,
    activeSeconds: 60, startProgression: .4, endProgression: .41,
  }, book);
  assert.deepEqual(records.map(record => record.id), [
    `session-midnight:${localDate(start)}`,
    `session-midnight:${localDate(end)}`,
  ]);
  assert.deepEqual(records.map(record => record.data.activeSeconds), [30, 30]);
});

test("activity measurement excludes hidden time and caps idle time at five minutes", () => {
  assert.equal(measuredActivitySeconds(1_000, 11_000), 10);
  assert.equal(measuredActivitySeconds(1_000, 601_000), 300);
  assert.equal(measuredActivitySeconds(1_000, 11_000, { visible: false }), 0);
});

test("highlight projection keeps requested text but excludes private CFI", () => {
  const record = artifactToJournalRecord("annotations", {
    id: "highlight-1", kind: "highlight",
    createdAt: "2026-08-17T11:00:00-05:00", updatedAt: "2026-08-17T11:00:00-05:00",
    quote: "Fixture quotation", note: "Fixture note", semanticColor: "core",
    locator: { cfiRange: "epubcfi(/do-not-copy)", chapterLabel: "Chapter 5", progression: .52 },
  }, book, "created");
  assert.equal(record.id, "highlight-1:created");
  assert.equal(record.kind, "highlight-created");
  assert.equal(record.data.quote, "Fixture quotation");
  assert.equal(record.data.note, "Fixture note");
  assert.equal(JSON.stringify(record).includes("epubcfi"), false);
});

test("updates use one stable record per artifact and local date", () => {
  const record = artifactToJournalRecord("vocabulary", {
    id: "word-1", createdAt: "2026-08-16T09:00:00-05:00", updatedAt: "2026-08-17T12:00:00-05:00",
    word: "verdant", definition: "green with vegetation",
    locator: { chapterLabel: "Chapter 2", progression: .2 },
  }, book, "updated");
  assert.equal(record.id, "word-1:updated:2026-08-17");
  assert.equal(record.kind, "vocabulary-updated");
});

test("bookmark projection never includes raw locator identifiers", () => {
  const record = artifactToJournalRecord("bookmarks", {
    id: "bookmark-1", createdAt: "2026-08-17T13:00:00-05:00", updatedAt: "2026-08-17T13:00:00-05:00",
    locator: { cfi: "epubcfi(/private)", spineIndex: 9, chapterLabel: "Chapter 9", progression: .9 },
  }, book);
  assert.deepEqual(record.data, {
    bookId: "book-1", bookTitle: "Fixture Garden", author: "A. Reader",
    chapterLabel: "Chapter 9", progression: .9,
  });
});

test("all actual Petal mutation and lifecycle paths are wired", async () => {
  const { readFile } = await import("node:fs/promises");
  const app = await readFile(new URL("../assets/js/app.js", import.meta.url), "utf8");
  const db = await readFile(new URL("../assets/js/db.js", import.meta.url), "utf8");
  for (const required of [
    'queueArtifact("annotations"', 'queueArtifact("bookmarks"', 'queueArtifact("vocabulary"',
    'queueArtifactDeletion("annotations"', 'queueArtifactDeletion("bookmarks"',
    'queueArtifactDeletion("vocabulary"', 'beginReadingSession(', 'finishReadingSession(',
    'document.addEventListener("visibilitychange"', '"selectionchange"',
  ]) assert.ok(app.includes(required), `missing hook: ${required}`);
  assert.ok(db.includes('readingSessions: { keyPath: "id"'));
  assert.equal(db.includes("localStorage.clear()"), false);
});
