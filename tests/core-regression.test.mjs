import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateBackup } from "../assets/js/backup.js";
import { normalizeReaderPreferences } from "../assets/js/db.js";
import {
  DEFAULT_FONT,
  LEGACY_FONT_VALUES,
  READER_FONT_VALUES,
} from "../assets/js/fonts.js";

const readerSource = await readFile(new URL("../assets/js/reader-engine.js", import.meta.url), "utf8");
const sanitizerBody = readerSource.slice(
  readerSource.indexOf("function securePublicationMarkup"),
  readerSource.indexOf("export class ReaderEngineAdapter"),
);
const secureMarkup = new Function(
  "location",
  `${sanitizerBody}\nreturn securePublicationMarkup;`,
)({ origin: "https://reader.example" });

const preferences = (fontFamily = DEFAULT_FONT) => ({
  preset: "comfortable",
  fontFamily,
  fontSize: 16,
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
  publisherStyles: false,
});

const backup = (fontFamily = DEFAULT_FONT) => ({
  format: "petal-reader-backup",
  schemaVersion: 1,
  appVersion: "1.0.1",
  data: {
    books: [],
    readingStates: [],
    annotations: [],
    bookmarks: [],
    vocabulary: [],
    preferences: preferences(fontFamily),
  },
});

test("EPUB markup receives CSP and keeps internal relative resources", async () => {
  const output = await secureMarkup(
    '<?xml version="1.0"?><html><body><img src="images/cover.jpg"><a href="chapter-2.xhtml">Next</a></body></html>',
    "application/xhtml+xml",
  );
  assert.match(output, /Content-Security-Policy/);
  assert.match(output, /images\/cover\.jpg/);
  assert.match(output, /chapter-2\.xhtml/);
});

test("EPUB sanitizer rejects executable and external content", async () => {
  const output = await secureMarkup(
    '<html><head></head><body onload="evil()"><script>evil()</script><img src="//evil.example/a.png"><a href="javascript:evil()">bad</a></body></html>',
    "application/xhtml+xml",
  );
  assert.doesNotMatch(output, /<script|onload|evil\.example|javascript:/i);
});

test("unsafe CSS imports and external URLs are removed", async () => {
  const output = await secureMarkup(
    '@import url("//evil.example/a.css"); body { background: url(https://evil.example/a.png) }',
    "text/css",
  );
  assert.doesNotMatch(output, /evil\.example/);
});

test("malformed HTML without an injection point is not rendered", async () => {
  assert.equal(await secureMarkup("<p>fragment only</p>", "text/html"), "");
});

test("reader preferences clamp numeric values and migrate retired fonts", () => {
  assert.equal(normalizeReaderPreferences({ fontSize: 4 }).fontSize, 12);
  assert.equal(normalizeReaderPreferences({ fontSize: 80 }).fontSize, 34);
  assert.equal(READER_FONT_VALUES.length, 6);
  for (const font of LEGACY_FONT_VALUES) {
    assert.equal(normalizeReaderPreferences({ fontFamily: font }).fontFamily, DEFAULT_FONT);
  }
});

test("legacy backups remain valid and are normalized", () => {
  for (const font of LEGACY_FONT_VALUES) {
    const payload = backup(font);
    assert.equal(validateBackup(payload), true);
    assert.equal(payload.data.preferences.fontFamily, DEFAULT_FONT);
    assert.deepEqual(payload.data.readingSessions, []);
  }
});

test("backups reject unknown fonts, unsafe IDs, duplicates, and invalid dates", () => {
  assert.throws(() => validateBackup(backup("Unknown Font")), /fontFamily/);

  const unsafe = backup();
  unsafe.schemaVersion = 2;
  unsafe.data.readingSessions = [];
  unsafe.data.books = [{ id: "../book", title: "Book", author: "Author" }];
  assert.throws(() => validateBackup(unsafe), /unsafe/);

  const duplicate = backup();
  duplicate.schemaVersion = 2;
  duplicate.data.readingSessions = [];
  duplicate.data.books = [
    { id: "book-1", title: "Book", author: "Author" },
    { id: "book-1", title: "Book 2", author: "Author" },
  ];
  assert.throws(() => validateBackup(duplicate), /duplicate/);

  const badDate = backup();
  badDate.schemaVersion = 2;
  badDate.data.readingSessions = [];
  badDate.data.books = [{ id: "book-1", title: "Book", author: "Author", updatedAt: "not-a-date" }];
  assert.throws(() => validateBackup(badDate), /updatedAt/);
});
