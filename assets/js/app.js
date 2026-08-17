import { icon } from "./icons.js";
import {
  openDatabase, getBooks, get, getAll, getBookFile, importPublication, updateBook,
  saveReadingState, getBookRecords, addAnnotation, addBookmark, addVocabulary,
  tombstone, getPreferences, savePreferences, storageSummary, requestPersistentStorage,
  getMeta, setMeta, now, reconnectPublication, deleteBookCopy, deleteBookAndRecords,
  resetAllLocalData
} from "./db.js";
import {
  backfillJournal, beginReadingSession, finishReadingSession, getJournalContext,
  getJournalState, handleVisibility, noteReaderActivity, onJournalState,
  queueArtifact, queueArtifactDeletion, refreshJournalState, saveJournalConnection, saveJournalToken,
  queueReadingSession, toggleJournal
} from "./journal.js";
import { inspectEpub, ReaderEngineAdapter } from "./reader-engine.js";
import { lookup, formatPartOfSpeech } from "./dictionary.js";
import {
  exportJsonBackup, readBackupFile, previewRestore, restoreBackup, exportBookMarkdown
} from "./backup.js";
import {
  READER_FONTS, SETTING_RANGES, SETTING_UNITS, SETTING_LABELS
} from "./fonts.js";

const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");
const epubInput = document.querySelector("#epub-input");
const backupInput = document.querySelector("#backup-input");

const state = {
  books: [],
  preferences: null,
  storage: { usage: 0, quota: 0, persisted: false },
  lastBackup: null,
  currentBook: null,
  currentLocation: null,
  currentSelection: null,
  reader: null,
  readerToolsVisible: true,
  coverUrls: new Map(),
  searchController: null,
  restorePayload: null,
  reconnectBookId: null,
  importWorker: null,
  importReject: null,
  importCancelled: false,
  overlayOpener: null,
  waitingWorker: null,
  locationSaveTimer: null,
  pendingReadingState: null,
  demo: new URLSearchParams(location.search).has("demo") || location.hash === "#demo"
};

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const formatBytes = bytes => {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
};

const formatDate = value => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
};

const progressOf = book => Math.round((book.progression || 0) * 100);

function toast(message, timeout = 3200) {
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = message;
  toastRegion.append(element);
  setTimeout(() => element.remove(), timeout);
}

function showError(error) {
  console.error(error);
  toast(error?.message || String(error), 5200);
}

function flowerMark() {
  return `<svg class="brand-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">
    <path d="M12 12C5 11 3 7 3 3c4 0 8 2 9 9Zm0 0c1-7 5-9 9-9 0 4-2 8-9 9Zm0 0c7 1 9 5 9 9-4 0-8-2-9-9Zm0 0c-1 7-5 9-9 9 0-4 2-8 9-9Z"/>
  </svg>`;
}

function demoBooks() {
  return [
    {
      id: "demo-secret-garden", title: "The Secret Garden", author: "Frances Hodgson Burnett",
      chapterLabel: "Chapter 12 · The Robin Who Showed the Way", progression: .42,
      coverUrl: "./assets/images/secret-garden-cover.png"
    },
    {
      id: "demo-pride", title: "Pride and Prejudice", author: "Jane Austen", progression: .18,
      coverUrl: "./assets/icons/icon-source.png"
    },
    {
      id: "demo-jane", title: "Jane Eyre", author: "Charlotte Brontë", progression: .63,
      coverUrl: "./assets/icons/icon-source.png"
    }
  ];
}

async function coverUrl(book) {
  if (book.coverUrl) return book.coverUrl;
  if (state.coverUrls.has(book.id)) return state.coverUrls.get(book.id);
  if (book.coverBlob) {
    const url = URL.createObjectURL(book.coverBlob);
    state.coverUrls.set(book.id, url);
    return url;
  }
  return "./assets/icons/icon-source.png";
}

async function hydrateBookProgress(books) {
  return Promise.all(books.map(async book => {
    const [reading, publication] = await Promise.all([
      get("readingStates", book.id),
      getBookFile(book)
    ]);
    return {
      ...book,
      hasPublication: Boolean(publication),
      progression: reading?.progression || 0,
      chapterLabel: reading?.chapterLabel || "Not started",
      locator: reading?.locator
    };
  }));
}

async function refresh() {
  state.books = await hydrateBookProgress(await getBooks());
  state.preferences = await getPreferences();
  state.storage = await storageSummary();
  state.lastBackup = await getMeta("lastSuccessfulBackupAt");
}

function statusStrip() {
  // An empty library has nothing to back up and nothing to lose, so the warnings
  // below would only be noise on a first launch. Show the strip once books exist.
  if (!state.books.length) return "";

  const backupText = state.lastBackup
    ? `Backup saved ${relativeDays(state.lastBackup)}`
    : "No backup yet";
  // The second item reports whether the browser granted persistent storage — that is
  // a different thing from backup age, so it gets its own wording.
  const storageText = state.storage.persisted
    ? "Storage protected"
    : "Storage can be evicted";
  return `<div class="status-strip" role="status">
    <div class="status-item ${state.lastBackup ? "good" : "warn"}">${icon(state.lastBackup ? "shield" : "warning")}<span>${escapeHtml(backupText)}</span></div>
    <div class="status-item ${state.storage.persisted ? "good" : "warn"}">${icon(state.storage.persisted ? "shield" : "database")}<span>${escapeHtml(storageText)}</span></div>
  </div>`;
}

function relativeDays(value) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
  return days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`;
}

async function renderLibrary() {
  if (state.reader) {
    await flushReadingState();
    await finishReadingSession("closed");
    await state.reader.close();
    state.reader = null;
  }
  state.currentBook = null;
  state.currentSelection = null;
  await refresh();
  const books = state.demo && !state.books.length ? demoBooks() : state.books;
  const header = `<header class="library-header shell-width">
    <div class="brand">${flowerMark()}<h1 class="brand-name">Petal Reader</h1></div>
    <div class="header-actions">
      <button class="icon-button" data-action="backup" aria-label="Backup and storage">${icon("upload")}</button>
      <button class="icon-button" data-action="app-settings" aria-label="App settings">${icon("settings")}</button>
    </div>
  </header>`;
  if (!books.length) {
    app.innerHTML = `<div class="app screen">${header}${statusStrip()}<main id="main" class="empty-state shell-width">
      <img class="empty-illustration" src="./assets/images/empty-library.png" alt="">
      <h2>Your quiet library</h2>
      <p>Import a DRM-free EPUB from Files to begin reading. Your book copy and reading records stay on this device.</p>
      <button class="button primary" data-action="import">${icon("import")}Import EPUB</button>
      <ol class="onboarding-steps">
        <li><span class="step-number">1</span>${icon("book")}<span>Choose from Files</span></li>
        <li><span class="step-number">2</span>${icon("book")}<span>Read and customize</span></li>
        <li><span class="step-number">3</span>${icon("upload")}<span>Back up your notes</span></li>
      </ol>
    </main></div>`;
    return;
  }
  const [recent, ...others] = books;
  const recentCover = await coverUrl(recent);
  const rows = await Promise.all(others.map(async book => {
    const cover = await coverUrl(book);
    const progress = progressOf(book);
    return `<article class="book-row" data-book-id="${escapeHtml(book.id)}">
      <button class="book-row-main" data-action="open-book" data-book-id="${escapeHtml(book.id)}" style="display:contents" aria-label="Open ${escapeHtml(book.title)}">
        <img class="book-cover" src="${escapeHtml(cover)}" alt="">
        <div class="book-copy">
          <h3 class="book-title">${escapeHtml(book.title)}</h3>
          <p class="book-author">${escapeHtml(book.author)}</p>
          <div class="progress-row"><span>${progress}%</span><div class="progress-track" aria-hidden="true"><div class="progress-fill" style="width:${progress}%"></div></div></div>
        </div>
      </button>
      <button class="icon-button" data-action="book-menu" data-book-id="${escapeHtml(book.id)}" aria-label="More options for ${escapeHtml(book.title)}">${icon("more")}</button>
    </article>`;
  }));
  const progress = progressOf(recent);
  app.innerHTML = `<div class="app screen">${header}${statusStrip()}<main id="main" class="library-main shell-width">
    <h2 class="section-title">Continue reading</h2>
    <article class="continue-card">
      <img class="book-cover" src="${escapeHtml(recentCover)}" alt="Cover of ${escapeHtml(recent.title)}">
      <div class="book-copy">
        <h3 class="book-title">${escapeHtml(recent.title)}</h3>
        <p class="book-author">${escapeHtml(recent.author)}</p>
        <p class="book-chapter">${escapeHtml(recent.chapterLabel)}</p>
        <div class="progress-row"><span>${progress}%</span><div class="progress-track" role="progressbar" aria-label="Reading progress" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${progress}%"></div></div></div>
        <button class="button primary" data-action="open-book" data-book-id="${escapeHtml(recent.id)}">Continue</button>
      </div>
    </article>
    ${others.length ? `<h2 class="subheading">Recent books</h2><div class="book-list">${rows.join("")}</div>` : ""}
  </main><div class="import-dock"><button class="button primary" data-action="import">${icon("import")}Import EPUB</button></div></div>`;
}

function renderImportProgress(fileName, progress, message = "Preparing your book…") {
  let overlay = document.querySelector(".import-progress");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "import-progress";
    app.append(overlay);
  }
  overlay.innerHTML = `<div class="import-progress-box">
    ${flowerMark()}<h2>Importing ${escapeHtml(fileName)}</h2><p>${escapeHtml(message)}</p>
    <div class="progress-track" role="progressbar" aria-label="Import progress" aria-valuenow="${Math.round(progress * 100)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${Math.round(progress * 100)}%"></div></div>
    <button class="button secondary" data-action="cancel-import">Cancel import</button>
  </div>`;
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./hash-worker.js", import.meta.url), { type: "module" });
    state.importWorker = worker;
    state.importReject = reject;
    worker.onmessage = event => {
      if (event.data.type === "progress") renderImportProgress(file.name, event.data.value, "Checking for duplicates…");
      if (event.data.type === "done") {
        resolve(event.data.hash);
        state.importWorker = null;
        state.importReject = null;
        worker.terminate();
      }
    };
    worker.onerror = error => {
      reject(error);
      state.importWorker = null;
      state.importReject = null;
      worker.terminate();
    };
    worker.postMessage({ file });
  });
}

async function importFiles(files) {
  state.importCancelled = false;
  for (const file of files) {
    try {
      renderImportProgress(file.name, .02);
      if (state.storage.quota && file.size * 1.3 > state.storage.quota - state.storage.usage) {
        throw new Error("There may not be enough device storage for this EPUB.");
      }
      const inspection = await inspectEpub(file);
      if (state.importCancelled) throw new DOMException("Import cancelled.", "AbortError");
      const fileHash = await hashFile(file);
      if (state.importCancelled) throw new DOMException("Import cancelled.", "AbortError");
      renderImportProgress(file.name, .98, "Saving on this device…");
      if (state.reconnectBookId) {
        const book = await reconnectPublication({ bookId: state.reconnectBookId, file, fileHash, metadata: inspection.metadata, coverBlob: inspection.coverBlob });
        toast(`${book.title} was reconnected.`);
        state.reconnectBookId = null;
      } else {
        const result = await importPublication({ file, fileHash, metadata: inspection.metadata, coverBlob: inspection.coverBlob });
        toast(result.duplicate ? "This EPUB is already in your library." : `${result.book.title} was added.`);
      }
    } catch (error) {
      if (error.name !== "AbortError") showError(error);
      else toast("Import cancelled.");
      if (state.importCancelled) break;
    }
  }
  state.importWorker?.terminate();
  state.importWorker = null;
  state.importReject = null;
  if (state.importCancelled) state.reconnectBookId = null;
  document.querySelector(".import-progress")?.remove();
  await refresh();
  location.hash = "#library";
  await renderRoute();
}

async function renderReader(bookId) {
  if (state.reader) {
    await flushReadingState();
    await finishReadingSession("switch");
    await state.reader.close();
    state.reader = null;
  }
  const book = state.books.find(item => item.id === bookId);
  if (!book) {
    if (String(bookId).startsWith("demo-")) {
      toast("Import an EPUB to use the real reader.");
      location.hash = "#library";
      return;
    }
    throw new Error("Book not found.");
  }
  const publication = await getBookFile(book);
  if (!publication) {
    toast("Reconnect the EPUB file before reading.");
    openBookMenu(book.id);
    return;
  }
  state.currentBook = book;
  state.currentSelection = null;
  state.readerToolsVisible = true;
  const readingState = await get("readingStates", book.id);
  const records = await getBookRecords(book.id);
  app.innerHTML = `<div class="app reader-screen">
    <header class="reader-toolbar" id="reader-toolbar">
      <button class="icon-button" data-action="close-reader" aria-label="Close book">${icon("close")}</button>
      <div class="reader-title">${escapeHtml(book.title)}</div>
      <nav class="reader-actions" aria-label="Reading tools">
        <button class="icon-button" data-action="contents" aria-label="Table of contents">${icon("menu")}</button>
        <button class="icon-button" data-action="search" aria-label="Search book">${icon("search")}</button>
        <button class="icon-button" data-action="records" aria-label="Reading records">${icon("note")}</button>
        <button class="icon-button" data-action="settings" aria-label="Reading settings"><span aria-hidden="true" style="font:24px Georgia">Aa</span></button>
      </nav>
    </header>
    <main id="main" class="reader-host" aria-label="Book content"></main>
    <footer class="reader-footer" id="reader-footer">
      <small id="chapter-label">${escapeHtml(readingState?.chapterLabel || "Opening…")}</small>
      <input class="reader-range" data-action="progress" type="range" min="0" max="1000" value="${Math.round((readingState?.progression || 0) * 1000)}" aria-label="Book progress">
      <span class="reader-percent" id="progress-label">${Math.round((readingState?.progression || 0) * 100)}%</span>
      <span class="reader-location" id="location-label" aria-live="polite">Location —</span>
      <button class="icon-button" data-action="bookmark" aria-label="Add bookmark">${icon("bookmark")}</button>
    </footer>
    <div id="selection-root"></div><div id="overlay-root"></div>
  </div>`;
  state.reader = new ReaderEngineAdapter(document.querySelector(".reader-host"));
  state.reader.addEventListener("relocate", onRelocate);
  state.reader.addEventListener("selection", event => showSelectionBar(event.detail));
  state.reader.addEventListener("annotation-activate", event => openExistingAnnotation(event.detail.value));
  state.reader.addEventListener("external-link-blocked", () => toast("External EPUB links are blocked for privacy."));
  state.reader.addEventListener("location-warning", event => toast(event.detail.message));
  state.reader.addEventListener("annotation-warning", async event => {
    const annotation = await get("annotations", event.detail.annotationId);
    if (annotation) {
      const updated = await addAnnotation({
        ...annotation,
        unresolved: true,
        revision: (annotation.revision || 0) + 1,
        updatedAt: now()
      });
      await queueArtifact("annotations", updated, state.currentBook, "updated");
    }
    toast("A saved annotation needs reconnection review.");
  });
  state.reader.addEventListener("annotation-recovered", async event => {
    const updated = await addAnnotation({
      ...event.detail,
      unresolved: false,
      revision: (event.detail.revision || 0) + 1,
      updatedAt: now()
    });
    await queueArtifact("annotations", updated, state.currentBook, "updated");
  });
  state.reader.addEventListener("page-tap", event => {
    const zone = event.detail.zone;
    if (zone === "previous") state.reader.previous();
    else if (zone === "next") state.reader.next();
    else toggleReaderTools();
  });
  await state.reader.open(publication, readingState?.locator, state.preferences, records.annotations);
  await updateBook(book.id, { lastOpenedAt: now() });
  await beginReadingSession(book, readingState || {});
}

async function onRelocate(event) {
  const location = event.detail;
  state.currentLocation = location;
  const fraction = Number(location.progression || location.raw?.fraction || 0);
  const progress = Math.max(0, Math.min(1, fraction));
  const range = document.querySelector(".reader-range");
  const label = document.querySelector("#progress-label");
  const chapter = document.querySelector("#chapter-label");
  const locationLabel = document.querySelector("#location-label");
  if (range) range.value = Math.round(progress * 1000);
  if (label) label.textContent = `${Math.round(progress * 100)}%`;
  if (chapter) chapter.textContent = location.chapterLabel || "Current chapter";
  if (locationLabel) {
    const current = Number(location.locationCurrent || 0) + 1;
    const total = Number(location.locationTotal || 0);
    locationLabel.textContent = total ? `Location ${current} / ${total}` : "Location —";
  }
  scheduleReadingState({
    locator: {
      cfi: location.cfi,
      spineHref: location.spineHref || "",
      spineIndex: location.spineIndex,
      chapterLabel: location.chapterLabel,
      progression: progress
    },
    chapterLabel: location.chapterLabel,
    progression: progress
  });
  await noteReaderActivity({ progression: progress, chapterLabel: location.chapterLabel });
}

function scheduleReadingState(patch) {
  state.pendingReadingState = { bookId: state.currentBook.id, patch };
  clearTimeout(state.locationSaveTimer);
  state.locationSaveTimer = setTimeout(() => flushReadingState().catch(showError), 220);
}

async function flushReadingState() {
  clearTimeout(state.locationSaveTimer);
  state.locationSaveTimer = null;
  const pending = state.pendingReadingState;
  state.pendingReadingState = null;
  if (pending) await saveReadingState(pending.bookId, pending.patch);
}

function toggleReaderTools() {
  state.readerToolsVisible = !state.readerToolsVisible;
  document.querySelector("#reader-toolbar")?.classList.toggle("hidden", !state.readerToolsVisible);
  document.querySelector("#reader-footer")?.classList.toggle("hidden", !state.readerToolsVisible);
}

function showSelectionBar(selection) {
  state.currentSelection = selection;
  const root = document.querySelector("#selection-root");
  if (!root) return;
  root.innerHTML = `<div class="selection-bar" role="toolbar" aria-label="Selected text actions">
    <button data-action="highlight">${icon("highlight")}<span>Highlight</span></button>
    <button data-action="selection-note">${icon("note")}<span>Note</span></button>
    <button data-action="dictionary">${icon("book")}<span>Dictionary</span></button>
    <button data-action="copy-selection">${icon("copy")}<span>Copy</span></button>
  </div>`;
}

function clearSelection() {
  state.currentSelection = null;
  state.reader?.deselect();
  const root = document.querySelector("#selection-root");
  if (root) root.replaceChildren();
}

function openHighlightColors() {
  const colors = [
    ["core", "Core", "#e95882"],
    ["agree", "Agree", "#6cbaa3"],
    ["question", "Question", "#d58d5f"],
    ["word", "Word", "#a58ad1"],
    ["quote", "Quote", "#7aa6c3"]
  ];
  const body = `<p class="dictionary-meta">Choose how you want to classify this highlight.</p><div class="highlight-colors">${colors.map(([key, label, color]) =>
    `<button class="highlight-color" style="--highlight-color:${color}" data-action="save-highlight" data-color="${key}"><i></i><span>${label}</span></button>`
  ).join("")}</div>`;
  overlay(sheetTemplate("Highlight color", body, `<button class="button secondary" data-action="close-overlay">Cancel</button>`));
}

async function createHighlight(kind = "highlight", note = "", semanticColor = "core") {
  const selection = state.currentSelection;
  if (!selection) return;
  const annotation = await addAnnotation({
    bookId: state.currentBook.id,
    kind,
    locator: {
      cfiRange: selection.cfiRange,
      spineIndex: selection.spineIndex,
      chapterLabel: state.currentLocation?.chapterLabel,
      progression: state.currentLocation?.progression || 0,
      textQuote: { exact: selection.exact, prefix: selection.prefix, suffix: selection.suffix }
    },
    quote: selection.exact,
    semanticColor,
    note
  });
  await queueArtifact("annotations", annotation, state.currentBook, "created");
  await state.reader.addAnnotation(annotation);
  clearSelection();
  toast(kind === "note" ? "Note saved." : "Highlight saved.");
}

function overlay(html, className = "sheet-backdrop") {
  const root = document.querySelector("#overlay-root")
    || app.appendChild(Object.assign(document.createElement("div"), { id: "overlay-root" }));
  state.overlayOpener = document.activeElement;
  root.innerHTML = `<div class="${className}" data-overlay>${html}</div>`;
  for (const sibling of [...root.parentElement.children]) {
    if (sibling === root) continue;
    sibling.inert = true;
    sibling.setAttribute("aria-hidden", "true");
    sibling.dataset.overlayHidden = "true";
  }
  const dialog = root.querySelector('[role="dialog"]');
  if (dialog) {
    setTimeout(() => dialog.querySelector("[autofocus], button, input, select, textarea")?.focus(), 0);
  }
}

function closeOverlay() {
  flushSettingWrite().catch(() => {});
  state.searchController?.abort();
  state.searchController = null;
  const root = document.querySelector("#overlay-root");
  for (const hidden of document.querySelectorAll("[data-overlay-hidden='true']")) {
    hidden.inert = false;
    hidden.removeAttribute("aria-hidden");
    delete hidden.dataset.overlayHidden;
  }
  root?.replaceChildren();
  if (state.overlayOpener?.isConnected) state.overlayOpener.focus();
  state.overlayOpener = null;
}

function sheetTemplate(title, body, footer = "", wide = false) {
  return `<section class="sheet ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
    <header class="sheet-header"><button class="icon-button" data-action="close-overlay" aria-label="Close">${icon("close")}</button><h2>${escapeHtml(title)}</h2><span></span></header>
    <div class="sheet-body">${body}</div>${footer ? `<footer class="sheet-footer">${footer}</footer>` : ""}
  </section>`;
}

function openSettings() {
  const p = state.preferences;
  const presetNames = ["original", "comfortable", "focus", "large", "custom"];
  const themes = [
    ["paper", "Paper", "#fffcf7"], ["rose", "Rose", "#fff0f4"], ["mint", "Mint", "#eef8f3"],
    ["sky", "Sky", "#f0f7fb"], ["lavender", "Lavender", "#f7f2fb"], ["beige", "Soft Beige", "#f4eadc"]
  ];
  // Sliders, not steppers: a stepper tap re-rendered the whole sheet, which reset
  // scroll position and stole focus. The range input updates in place instead.
  const slider = key => {
    const [min, max, step] = SETTING_RANGES[key];
    const value = state.preferences[key];
    return `<div class="setting-slider">
      <label for="set-${key}">${SETTING_LABELS[key]}</label>
      <output for="set-${key}" data-setting-output="${key}">${formatSettingValue(key, value)}</output>
      <input id="set-${key}" type="range" data-setting-range="${key}"
             min="${min}" max="${max}" step="${step}" value="${value}"
             aria-label="${SETTING_LABELS[key]}">
    </div>`;
  };
  const body = `<div class="segmented">${presetNames.map(name => `<button data-action="preset" data-preset="${name}" class="${p.preset === name ? "selected" : ""}">${name === "large" ? "Large Print" : name[0].toUpperCase() + name.slice(1)}</button>`).join("")}</div>
    <div class="settings-group"><h3>Theme</h3><div class="theme-grid">${themes.map(([key,label,color]) => `<button class="theme-button ${p.theme === key ? "selected" : ""}" style="--swatch:${color}" data-action="theme" data-theme="${key}">${p.theme === key ? icon("check") : ""}<span>${label}</span></button>`).join("")}</div></div>
    <div class="settings-group"><h3><label for="font-family">Font</label></h3><select id="font-family" data-setting="fontFamily" style="width:100%">
      ${READER_FONTS.map(font => `<option ${p.fontFamily === font.value ? "selected" : ""} value="${escapeHtml(font.value)}">${escapeHtml(font.label)}</option>`).join("")}
    </select></div>
    <div class="setting-preview" style="font-family:${escapeHtml(p.fontFamily)}">A quiet place to read.</div>
    ${["fontSize","lineHeight","letterSpacing","paragraphSpacing","horizontalMargin","verticalMargin","textWidth"].map(slider).join("")}
    <div class="settings-group"><h3>Alignment</h3><div class="segmented"><button data-action="setting-choice" data-key="alignment" data-value="left" class="${p.alignment === "left" ? "selected" : ""}">Left</button><button data-action="setting-choice" data-key="alignment" data-value="justify" class="${p.alignment === "justify" ? "selected" : ""}">Justified</button></div></div>
    <div class="settings-group"><h3>Page view</h3><div class="segmented">${["auto","1","2"].map(value => `<button data-action="setting-choice" data-key="spread" data-value="${value}" class="${p.spread === value ? "selected" : ""}">${value === "auto" ? "Auto" : `${value} Page`}</button>`).join("")}</div></div>
    <div class="settings-group"><h3>Reading style</h3><div class="segmented"><button data-action="setting-choice" data-key="flow" data-value="paginated" class="${p.flow === "paginated" ? "selected" : ""}">Paginated</button><button data-action="setting-choice" data-key="flow" data-value="scrolled" class="${p.flow === "scrolled" ? "selected" : ""}">Chapter Scroll</button></div></div>
    <div class="setting-row"><span>Page animation</span><button class="switch" data-action="setting-toggle" data-key="animation" role="switch" aria-checked="${p.animation}"></button></div>
    <div class="setting-row"><span>Keep publisher styles</span><button class="switch" data-action="setting-toggle" data-key="publisherStyles" role="switch" aria-checked="${p.publisherStyles}"></button></div>`;
  const footer = `<button class="button secondary" data-action="reset-settings">Reset</button><button class="button primary" data-action="save-settings">Save Custom</button>`;
  overlay(sheetTemplate("Reading settings", body, footer, true));
}

const formatSettingValue = (key, value) => {
  const decimals = SETTING_RANGES[key][2] < 1 ? 2 : 0;
  return `${Number(value).toFixed(decimals)}${SETTING_UNITS[key]}`;
};

const PRESETS = {
  original: {
    preset: "original", fontFamily: "Georgia, serif", fontSize: 16, lineHeight: 1.45,
    letterSpacing: 0, paragraphSpacing: .5, horizontalMargin: 32, verticalMargin: 24,
    textWidth: 68, alignment: "left", spread: "auto", flow: "paginated",
    theme: "paper", animation: false, publisherStyles: true
  },
  comfortable: {
    preset: "comfortable", fontFamily: "Georgia, serif",
    fontSize: 16, lineHeight: 1.6, letterSpacing: 0, paragraphSpacing: .5,
    horizontalMargin: 32, verticalMargin: 24, textWidth: 68, alignment: "left",
    spread: "auto", flow: "paginated", theme: "paper", animation: false,
    publisherStyles: false
  },
  focus: {
    preset: "focus", fontFamily: "Georgia, serif", fontSize: 15, lineHeight: 1.55,
    letterSpacing: 0, paragraphSpacing: .5, horizontalMargin: 40, verticalMargin: 28,
    textWidth: 52, alignment: "left", spread: "auto", flow: "paginated",
    theme: "paper", animation: false, publisherStyles: false
  },
  large: {
    preset: "large", fontFamily: "Atkinson Hyperlegible, Arial, sans-serif", fontSize: 24,
    lineHeight: 1.8, letterSpacing: 0, paragraphSpacing: .75, horizontalMargin: 24,
    verticalMargin: 24, textWidth: 60, alignment: "left", spread: "auto",
    flow: "paginated", theme: "beige", animation: false, publisherStyles: false
  }
};

async function updateSetting(key, value) {
  state.preferences = await savePreferences({ ...state.preferences, [key]: value, preset: "custom" });
  state.reader?.setLayout(state.preferences);
  state.reader?.setStyles(state.preferences);
}

// A range input fires `change` on every arrow-key press, not just at the end of a
// drag, so holding an arrow key would otherwise mean one IndexedDB write per
// repeat. Coalesce them; state.preferences is already current from previewSetting.
let settingWriteTimer = null;
let pendingSetting = null;
function persistSettingSoon(key, value) {
  pendingSetting = { key, value };
  clearTimeout(settingWriteTimer);
  settingWriteTimer = setTimeout(() => flushSettingWrite().catch(showError), 180);
}

async function flushSettingWrite() {
  clearTimeout(settingWriteTimer);
  settingWriteTimer = null;
  const pending = pendingSetting;
  pendingSetting = null;
  if (pending) await updateSetting(pending.key, pending.value);
}

// Re-rendering the whole sheet is acceptable for one-shot controls, but it must
// not throw the reader back to the top: the two switches sit at the very bottom.
function reopenSettings() {
  const scrollTop = document.querySelector(".sheet-body")?.scrollTop || 0;
  const active = document.activeElement;
  const data = active?.dataset;
  const selector = data?.action
    ? `[data-action="${data.action}"]`
      + (data.key ? `[data-key="${data.key}"]` : "")
      + (data.value ? `[data-value="${data.value}"]` : "")
      + (data.theme ? `[data-theme="${data.theme}"]` : "")
      + (data.preset ? `[data-preset="${data.preset}"]` : "")
    : null;
  openSettings();
  const restore = () => {
    const body = document.querySelector(".sheet-body");
    if (body) body.scrollTop = scrollTop;
    if (selector) document.querySelector(selector)?.focus({ preventScroll: true });
  };
  restore();
  // overlay() queues its own focus in a setTimeout(0); this one is queued after it.
  setTimeout(restore, 0);
}

// Slider drag fires `input` dozens of times per second, and both setStyles and
// setLayout repaginate the EPUB. So: update the readout immediately, coalesce
// the restyle into one animation frame, and leave setLayout plus the IndexedDB
// write to the `change` event at the end of the drag.
let previewFrame = null;
function previewSetting(key, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return;
  state.preferences = { ...state.preferences, [key]: number, preset: "custom" };
  const output = document.querySelector(`[data-setting-output="${key}"]`);
  if (output) output.textContent = formatSettingValue(key, number);
  if (previewFrame) return;
  previewFrame = requestAnimationFrame(() => {
    previewFrame = null;
    state.reader?.setStyles(state.preferences);
  });
}

async function applyPreset(preset) {
  const next = PRESETS[preset] || { ...state.preferences, preset: "custom" };
  state.preferences = await savePreferences(next);
  state.reader?.setLayout(state.preferences);
  state.reader?.setStyles(state.preferences);
  reopenSettings();
}

function flattenToc(items, depth = 0) {
  return (items || []).flatMap(item => [{ ...item, depth }, ...flattenToc(item.subitems, depth + 1)]);
}

function openContents() {
  const toc = flattenToc(state.reader.getTOC());
  const body = toc.length ? `<ul class="toc-list">${toc.map(item => `<li><button class="toc-row" style="padding-left:${12 + item.depth * 18}px" data-action="toc-go" data-href="${escapeHtml(item.href)}"><span>${escapeHtml(item.label || "Untitled section")}</span>${icon("chevronRight")}</button></li>`).join("")}</ul>` : `<div class="empty-list">This EPUB does not contain a table of contents.</div>`;
  overlay(sheetTemplate("Table of contents", body));
}

function openSearch() {
  const body = `<div class="segmented tabs"><button data-action="contents">Contents</button><button class="selected">Search</button></div>
    <div class="search-field">${icon("search")}<input id="book-search" type="search" placeholder="Search this book" autocomplete="off" aria-label="Search this book"><button class="icon-button" data-action="run-search" aria-label="Start search">${icon("search")}</button></div>
    <div class="search-status" id="search-status"><span>Enter a word or phrase.</span></div><div class="thin-progress" hidden><span style="width:0"></span></div>
    <ul class="result-list" id="search-results"></ul>`;
  overlay(sheetTemplate("Navigation and Search", body, "", true));
}

async function runSearch() {
  const input = document.querySelector("#book-search");
  const query = input?.value.trim();
  if (!query) return;
  state.searchController?.abort();
  state.searchController = new AbortController();
  const results = document.querySelector("#search-results");
  const status = document.querySelector("#search-status");
  const progress = document.querySelector(".thin-progress");
  const bar = progress.querySelector("span");
  results.replaceChildren();
  progress.hidden = false;
  status.innerHTML = `<span>Searching…</span><button class="text-button" data-action="cancel-search">Cancel search</button>`;
  let count = 0;
  try {
    for await (const result of state.reader.search(query, state.searchController.signal)) {
      if (typeof result === "string") break;
      if (typeof result.progress === "number") {
        bar.style.width = `${Math.round(result.progress * 100)}%`;
        status.querySelector("span").textContent = `Searching ${Math.round(result.progress * 100)}%…`;
      }
      for (const item of result.subitems || []) {
        count++;
        const li = document.createElement("li");
        const snippet = escapeHtml(item.excerpt || "").replace(new RegExp(escapeRegex(query), "gi"), match => `<mark>${match}</mark>`);
        li.innerHTML = `<button class="result-row" data-action="search-go" data-cfi="${escapeHtml(item.cfi)}"><span><strong>${escapeHtml(result.label || "Search result")}</strong><p>${snippet}</p></span>${icon("chevronRight")}</button>`;
        results.append(li);
      }
    }
    status.innerHTML = `<span>${count} result${count === 1 ? "" : "s"}</span>`;
    bar.style.width = "100%";
  } catch (error) {
    if (error.name !== "AbortError") status.textContent = error.message;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openRecords(tab = "highlights") {
  const records = await getBookRecords(state.currentBook.id);
  const tabs = ["bookmarks","highlights","notes","vocabulary"];
  // A highlight carrying a note appears in both tabs on purpose: Highlights
  // groups by colour, Notes collects everything you actually wrote on.
  let items = tab === "bookmarks" ? records.bookmarks
    : tab === "vocabulary" ? records.vocabulary
    : tab === "notes"
      ? records.annotations.filter(item => item.kind === "note" || (item.kind === "highlight" && item.note))
      : records.annotations.filter(item => item.kind === "highlight");
  const chapters = [...new Set(items.map(item => item.locator?.chapterLabel).filter(Boolean))];
  const body = `<div class="segmented tabs">${tabs.map(name => `<button data-action="record-tab" data-tab="${name}" class="${name === tab ? "selected" : ""}">${name[0].toUpperCase() + name.slice(1)}</button>`).join("")}</div>
    <label class="search-field">${icon("search")}<input type="search" placeholder="Search this book" data-record-filter></label>
    <div class="record-filters">
      <label><span>Chapter</span><select data-record-chapter><option value="">All chapters</option>${chapters.map(chapter => `<option value="${escapeHtml(chapter)}">${escapeHtml(chapter)}</option>`).join("")}</select></label>
      <label><span>Color</span><select data-record-color><option value="">All colors</option>${["core","agree","question","word","quote"].map(color => `<option value="${color}">${color[0].toUpperCase() + color.slice(1)}</option>`).join("")}</select></label>
      <label><span>Order</span><select data-record-order><option value="location">Book order</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
    </div>
    <ul class="record-list">${items.length ? items.map(record => {
      const text = record.word || record.quote || record.locator?.textQuote?.exact || record.locator?.chapterLabel || "Saved location";
      const searchText = `${text} ${record.note || ""} ${record.definition || ""} ${record.locator?.chapterLabel || ""}`.toLocaleLowerCase();
      // Highlights and notes get an inline note button so editing a note does not
      // require jumping into the book and tapping the highlight again.
      const noteButton = (tab === "highlights" || tab === "notes")
        ? `<button class="icon-button" data-action="edit-annotation-note" data-id="${escapeHtml(record.id)}" aria-label="${record.note ? "Edit note" : "Add note"}">${icon("note")}</button>`
        : "";
      return `<li data-record-item data-search="${escapeHtml(searchText)}" data-chapter="${escapeHtml(record.locator?.chapterLabel || "")}" data-color="${escapeHtml(record.semanticColor || "")}" data-created="${escapeHtml(record.createdAt || "")}" data-spine="${Number(record.locator?.spineIndex || 0)}" data-progression="${Number(record.locator?.progression || 0)}"><button class="record-row" data-action="record-go" data-cfi="${escapeHtml(record.locator?.cfiRange || record.locator?.cfi || "")}"><span><span class="record-meta"><i class="semantic-dot" style="--dot:${semanticColor(record.semanticColor)}"></i>${escapeHtml(record.locator?.chapterLabel || "Saved location")} · ${escapeHtml(formatDate(record.createdAt))}</span><strong>${escapeHtml(text)}</strong>${record.note || record.definition ? `<p>${escapeHtml(record.note || record.definition)}</p>` : ""}</span>${icon("chevronRight")}</button>${noteButton}</li>`;
    }).join("") : `<li class="empty-list">No ${escapeHtml(tab)} yet.</li>`}</ul>
    <p class="record-count" data-record-count>${items.length} saved item${items.length === 1 ? "" : "s"}</p>`;
  overlay(sheetTemplate("Reading records", body, "", true));
}

function filterRecordList() {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return;
  const query = (dialog.querySelector("[data-record-filter]")?.value || "").trim().toLocaleLowerCase();
  const chapter = dialog.querySelector("[data-record-chapter]")?.value || "";
  const color = dialog.querySelector("[data-record-color]")?.value || "";
  const order = dialog.querySelector("[data-record-order]")?.value || "location";
  const list = dialog.querySelector(".record-list");
  const items = [...dialog.querySelectorAll("[data-record-item]")];
  items.sort((a, b) => {
    if (order === "newest") return b.dataset.created.localeCompare(a.dataset.created);
    if (order === "oldest") return a.dataset.created.localeCompare(b.dataset.created);
    return Number(a.dataset.spine) - Number(b.dataset.spine)
      || Number(a.dataset.progression) - Number(b.dataset.progression);
  });
  let visible = 0;
  for (const item of items) {
    const matches = (!query || item.dataset.search.includes(query))
      && (!chapter || item.dataset.chapter === chapter)
      && (!color || item.dataset.color === color);
    item.hidden = !matches;
    if (matches) visible++;
    list.append(item);
  }
  const count = dialog.querySelector("[data-record-count]");
  if (count) count.textContent = `${visible} of ${items.length} saved item${items.length === 1 ? "" : "s"}`;
}

function semanticColor(name) {
  return ({ core:"#e95882", agree:"#6cbaa3", question:"#d58d5f", word:"#a58ad1", quote:"#7aa6c3" })[name] || "#e95882";
}

async function openDictionary() {
  const selection = state.currentSelection;
  if (!selection) return;
  const word = selection.exact.trim().split(/\s+/)[0].replace(/[^a-zA-Z'-]/g, "");
  overlay(sheetTemplate("Dictionary", `<div class="empty-list">Looking up “${escapeHtml(word)}” in the local dictionary…</div>`));
  try {
    const result = await lookup(word);
    const entry = result.entry;
    const definitions = entry?.s || [];
    const body = `<h2 class="dictionary-word">${escapeHtml(result.matched || result.word)}</h2>
      <p class="dictionary-meta">Open English WordNet 2025 · stored in Petal Reader</p>
      ${definitions.length ? definitions.slice(0, 8).map((sense, index) => `<article class="definition">
        <h3>${escapeHtml(formatPartOfSpeech(sense.p))}</h3><p>${escapeHtml(sense.d?.[0] || "No definition")}</p>
        ${sense.e?.[0] ? `<p><em>${escapeHtml(sense.e[0])}</em></p>` : ""}
        <button class="button secondary" data-action="save-word" data-index="${index}">Save this definition</button>
      </article>`).join("") : `<div class="notice">${icon("warning")}<span>No local definition found. You can still save the word with your own note.</span></div>`}
      <label for="korean-note"><strong>Korean meaning or memory note</strong></label><textarea id="korean-note" class="note-field" placeholder="직접 입력"></textarea>`;
    overlay(sheetTemplate("Dictionary", body, `<button class="button secondary" data-action="close-overlay">Cancel</button>${definitions.length ? "" : `<button class="button primary" data-action="save-word-manual">Save word</button>`}`, true));
    document.querySelector('[role="dialog"]').dataset.dictionary = JSON.stringify({ result, definitions });
  } catch (error) {
    overlay(sheetTemplate("Dictionary", `<div class="notice error">${icon("warning")}<span>${escapeHtml(error.message)}</span></div><label for="korean-note">Add your own note</label><textarea id="korean-note" class="note-field"></textarea>`, `<button class="button secondary" data-action="close-overlay">Cancel</button><button class="button primary" data-action="save-word-manual">Save word</button>`));
  }
}

async function saveWord(index = null) {
  const dialog = document.querySelector('[role="dialog"]');
  let data = {};
  try { data = JSON.parse(dialog?.dataset.dictionary || "{}"); } catch {}
  const sense = index == null ? null : data.definitions?.[index];
  const selection = state.currentSelection;
  const vocabulary = await addVocabulary({
    bookId: state.currentBook.id,
    word: data.result?.matched || data.result?.word || selection.exact,
    partOfSpeech: formatPartOfSpeech(sense?.p),
    definition: sense?.d?.[0] || "",
    example: sense?.e?.[0] || "",
    sentence: selection.exact,
    koreanNote: document.querySelector("#korean-note")?.value || "",
    dataset: "oewn",
    edition: "2025",
    synsetId: sense?.i,
    locator: {
      cfiRange: selection.cfiRange,
      spineIndex: selection.spineIndex,
      chapterLabel: state.currentLocation?.chapterLabel,
      progression: state.currentLocation?.progression || 0,
      textQuote: { exact: selection.exact, prefix: selection.prefix, suffix: selection.suffix }
    }
  });
  await queueArtifact("vocabulary", vocabulary, state.currentBook, "created");
  closeOverlay();
  clearSelection();
  toast("Word saved to Vocabulary.");
}

// Serves both a fresh selection (existing = null) and editing the note on a
// saved annotation. The save button is assembled before the template string so
// the data-id attribute never has to be built inside a nested ternary.
function openNoteEditor(existing = null) {
  const quote = existing
    ? (existing.quote || existing.locator?.textQuote?.exact || "")
    : (state.currentSelection?.exact || "");
  const saveButton = existing
    ? `<button class="button primary" data-action="save-annotation-note" data-id="${escapeHtml(existing.id)}">Save note</button>`
    : `<button class="button primary" data-action="save-note">Save note</button>`;
  const body = `<p class="dictionary-meta">${escapeHtml(quote)}</p>
    <label for="note-text"><strong>Your note</strong></label>
    <textarea id="note-text" class="note-field" autofocus>${escapeHtml(existing?.note || "")}</textarea>`;
  // Title tracks whether a note exists, not whether a record does — otherwise a
  // highlight with no note yet shows "Add note" on the button and "Edit note" here.
  overlay(sheetTemplate(
    existing?.note ? "Edit note" : "Add note",
    body,
    `<button class="button secondary" data-action="close-overlay">Cancel</button>${saveButton}`
  ));
}

async function addCurrentBookmark() {
  if (!state.currentLocation) return;
  const bookmark = await addBookmark({
    bookId: state.currentBook.id,
    locator: {
      cfi: state.currentLocation.cfi,
      spineIndex: state.currentLocation.spineIndex,
      chapterLabel: state.currentLocation.chapterLabel,
      progression: state.currentLocation.progression
    }
  });
  await queueArtifact("bookmarks", bookmark, state.currentBook, "created");
  toast("Bookmark added.");
}

function journalDateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 92);
  const value = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { from: value(from), to: value(to) };
}

async function openJournalSettings() {
  const [journal, context] = await Promise.all([refreshJournalState(), getJournalContext()]);
  const range = journalDateRange();
  const status = journal.enabled
    ? `${journal.status || "ready"}${journal.pendingCount ? ` · ${journal.pendingCount} pending` : ""}`
    : "Off — reading stays entirely local";
  const body = `<div class="settings-group">
      <h3>Private journal connection</h3>
      <label class="setting-row" for="journal-token"><span><strong>GitHub token</strong><small>${journal.hasToken ? "Stored securely in this browser; value is never shown" : "Required to write to your private webapp-data repository"}</small></span></label>
      <input id="journal-token" class="note-field" type="password" autocomplete="off" placeholder="${journal.hasToken ? "Token already stored" : "Paste token"}" aria-describedby="journal-privacy">
      <label class="setting-row" for="journal-device"><span><strong>Device name</strong><small>Creates a stable context for this Petal installation</small></span></label>
      <input id="journal-device" class="note-field" value="${escapeHtml(context.label)}" placeholder="iPhone Home Screen">
      <button class="button secondary" data-action="journal-save-connection">Save connection</button>
    </div>
    <div class="settings-group">
      <div class="setting-row"><span><strong>Include in journal</strong><small>Default off; independent from every other app setting</small></span><button class="switch" data-action="journal-toggle" role="switch" aria-checked="${journal.enabled}" aria-label="Include Petal in journal"></button></div>
      <div class="notice">${icon("warning")}<span>Petal sends book titles, reading progress, highlights, quotations, notes, bookmarks, and saved vocabulary only to your private webapp-data repository.</span></div>
      <p id="journal-privacy" class="dictionary-meta" role="status">Status: ${escapeHtml(status)}</p>
    </div>
    <div class="settings-group">
      <h3>Import past records</h3>
      <p class="dictionary-meta">Manual only. Petal can recover saved artifacts and the latest reading position, but not past reading time or progress history.</p>
      <div class="journal-range"><label>From<input id="journal-from" class="note-field" type="date" value="${range.from}"></label><label>To<input id="journal-to" class="note-field" type="date" value="${range.to}"></label></div>
      <button class="button secondary" data-action="journal-backfill">Preview and import</button>
    </div>`;
  overlay(sheetTemplate("Journal settings", body, `<button class="button primary" data-action="close-overlay">Done</button>`, true));
}

async function openExistingAnnotation(cfi) {
  const records = await getAll("annotations", "bookId", state.currentBook.id);
  const record = records.find(item => item.locator?.cfiRange === cfi || item.locator?.cfi === cfi);
  if (!record) return;
  const body = `<blockquote>${escapeHtml(record.quote || record.locator?.textQuote?.exact || "")}</blockquote>${record.note ? `<p>${escapeHtml(record.note)}</p>` : ""}`;
  const footer = `<button class="button secondary" data-action="edit-annotation-note" data-id="${escapeHtml(record.id)}">${icon("note")}${record.note ? "Edit note" : "Add note"}</button>`
    + `<button class="button danger" data-action="remove-annotation" data-id="${escapeHtml(record.id)}">${icon("trash")}Remove</button>`
    + `<button class="button secondary" data-action="close-overlay">Close</button>`;
  overlay(sheetTemplate("Saved annotation", body, footer));
}

async function renderBackup() {
  if (state.reader) {
    await flushReadingState();
    await finishReadingSession("closed");
    await state.reader.close();
    state.reader = null;
  }
  state.currentBook = null;
  const booksSize = state.storage.publicationBytes || 0;
  app.innerHTML = `<div class="app screen backup-screen">
    <header class="utility-header"><button class="icon-button" data-action="library" aria-label="Back to library">${icon("back")}</button><h1>Backup &amp; storage</h1><span></span></header>
    <main id="main" class="utility-main">
      <section class="storage-summary">${icon("shield")}<div><h2>${state.storage.persisted ? "Storage protected" : "Storage can be evicted"}</h2><p>${state.storage.persisted ? "This device keeps your library even when space runs low." : "iOS may clear this library if storage runs low — keep a backup."}</p><p>Last backup · ${formatDate(state.lastBackup)}</p><p>${formatBytes(state.storage.usage)} of ${formatBytes(state.storage.quota)} used</p></div></section>
      <section class="utility-section"><h2>Full backup</h2><p>Books are not included</p><div class="button-row">
        <button class="button secondary" data-action="export-json">${icon("export")}Export JSON</button>
        <button class="button secondary" data-action="import-json">${icon("import")}Import JSON</button>
      </div></section>
      <section class="utility-section"><h2>Obsidian</h2><p>One Markdown file per book</p><div class="button-row">
        ${state.books.map(book => `<button class="button secondary" data-action="export-markdown" data-book-id="${escapeHtml(book.id)}">${icon("note")}${escapeHtml(book.title)}</button>`).join("") || `<span class="dictionary-meta">Import a book before exporting notes.</span>`}
      </div></section>
      <section class="utility-section"><h2>Manage storage</h2><div class="storage-row"><span>Book copies</span><strong>${formatBytes(booksSize)}</strong></div>
        <div class="storage-row"><span>Reading records</span><strong>Stored locally</strong></div>
        <button class="text-button" data-action="request-storage">${icon("shield")}Request storage protection</button>
      </section>
      <section class="utility-section"><h2>Review stored books</h2><div class="stored-book-list">
        ${state.books.map(book => `<div class="storage-row"><span><strong>${escapeHtml(book.title)}</strong><small>${book.hasPublication ? "EPUB connected" : "EPUB needs reconnecting"}</small></span>${book.hasPublication ? "" : `<button class="button secondary" data-action="reconnect" data-book-id="${escapeHtml(book.id)}">Reconnect EPUB</button>`}</div>`).join("") || `<p class="dictionary-meta">No stored books.</p>`}
      </div></section>
      <section class="utility-section danger-zone"><h2>Reset Petal Reader</h2><p>Erase every stored EPUB copy, reading position, highlight, note, bookmark, word, and preference on this device.</p>
        <button class="button danger" data-action="reset-all">${icon("trash")}Erase all local data</button>
      </section>
      <p class="privacy-note">${icon("warning")}<span>Exported JSON and Markdown files are not encrypted. They contain quotations and personal notes.</span></p>
    </main><div id="overlay-root"></div>
  </div>`;
}

async function openRestorePreview(payload) {
  state.restorePayload = payload;
  const preview = await previewRestore(payload);
  const body = `<div class="preview-counts"><div><strong>${preview.books}</strong><span>books</span></div><div><strong>${preview.added}</strong><span>new</span></div><div><strong>${preview.updated}</strong><span>updated</span></div><div><strong>${preview.conflicts}</strong><span>conflicts</span></div></div>
    <div class="settings-group"><div class="segmented"><button class="selected" data-action="restore-mode" data-mode="merge">Merge</button><button data-action="restore-mode" data-mode="replace">Replace all</button></div></div>
    ${preview.conflicts ? `<div class="notice">${icon("warning")}<span>Both copies of conflicting notes will be kept for review.</span></div>` : ""}
    ${preview.orphaned ? `<div class="notice">${icon("book")}<span>${preview.orphaned} records need an EPUB file to reconnect.</span></div>` : ""}
    <p>Nothing changes until you confirm. EPUB book files already on this device will be kept.</p>`;
  overlay(`<section class="dialog" role="dialog" aria-modal="true" aria-label="Restore preview" data-restore-mode="merge">
    <header class="sheet-header"><button class="icon-button" data-action="close-overlay" aria-label="Close">${icon("close")}</button><h2>Restore preview</h2><span></span></header>
    <div class="dialog-body">${body}</div><footer class="sheet-footer"><button class="button secondary" data-action="close-overlay">Cancel</button><button class="button primary" data-action="restore-confirm">Restore ${preview.added + preview.updated} items</button></footer>
  </section>`, "dialog-backdrop");
}

function openBookMenu(bookId) {
  const book = state.books.find(item => item.id === bookId);
  if (!book) return;
  const body = `<h2 class="dictionary-word" style="font-size:1.6rem">${escapeHtml(book.title)}</h2><p class="dictionary-meta">${escapeHtml(book.author)}</p>
    <div class="button-row" style="display:grid">
      <button class="button secondary" data-action="open-book" data-book-id="${escapeHtml(book.id)}">${icon("book")}Continue reading</button>
      <button class="button secondary" data-action="export-markdown" data-book-id="${escapeHtml(book.id)}">${icon("note")}Export Obsidian Markdown</button>
      <button class="button secondary" data-action="reconnect" data-book-id="${escapeHtml(book.id)}">${icon("import")}Reconnect EPUB</button>
      <button class="button danger" data-action="delete-copy" data-book-id="${escapeHtml(book.id)}">${icon("trash")}Delete app copy only</button>
      <button class="button danger" data-action="delete-all" data-book-id="${escapeHtml(book.id)}">${icon("trash")}Delete book and all records</button>
    </div>`;
  const root = document.querySelector("#overlay-root") || app.appendChild(Object.assign(document.createElement("div"), { id: "overlay-root" }));
  overlay(sheetTemplate("Book options", body));
}

async function renderRoute() {
  closeOverlay();
  const hash = location.hash || "#library";
  try {
    if (hash.startsWith("#reader/")) await renderReader(hash.split("/")[1]);
    else if (hash === "#backup") await renderBackup();
    else await renderLibrary();
  } catch (error) {
    showError(error);
    location.hash = "#library";
    await renderLibrary();
  }
}

app.addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === "import") epubInput.click();
    else if (action === "backup") location.hash = "#backup";
    else if (action === "library" || action === "close-reader") location.hash = "#library";
    else if (action === "open-book") { closeOverlay(); location.hash = `#reader/${button.dataset.bookId}`; }
    else if (action === "book-menu") openBookMenu(button.dataset.bookId);
    else if (action === "settings") openSettings();
    else if (action === "contents") openContents();
    else if (action === "search") openSearch();
    else if (action === "records") openRecords();
    else if (action === "record-tab") openRecords(button.dataset.tab);
    else if (action === "close-overlay") closeOverlay();
    else if (action === "highlight") openHighlightColors();
    else if (action === "save-highlight") { await createHighlight("highlight", "", button.dataset.color); closeOverlay(); }
    else if (action === "selection-note") openNoteEditor();
    else if (action === "edit-annotation-note") {
      openNoteEditor(await get("annotations", button.dataset.id));
    }
    else if (action === "save-annotation-note") {
      const record = await get("annotations", button.dataset.id);
      // Same id, so this is an in-place update. updatedAt is refreshed by
      // addAnnotation itself since the spread now comes first.
      const updated = await addAnnotation({
        ...record,
        note: document.querySelector("#note-text")?.value || "",
        revision: (record.revision || 0) + 1
      });
      await queueArtifact("annotations", updated, state.currentBook, "updated");
      closeOverlay();
      toast("Note saved.");
    }
    else if (action === "save-note") { await createHighlight("note", document.querySelector("#note-text")?.value || ""); closeOverlay(); }
    else if (action === "dictionary") await openDictionary();
    else if (action === "copy-selection") { await navigator.clipboard.writeText(state.currentSelection?.exact || ""); clearSelection(); toast("Copied."); }
    else if (action === "save-word") await saveWord(Number(button.dataset.index));
    else if (action === "save-word-manual") await saveWord();
    else if (action === "bookmark") await addCurrentBookmark();
    else if (action === "run-search") await runSearch();
    else if (action === "cancel-search") {
      state.searchController?.abort();
      const searchStatus = document.querySelector("#search-status");
      if (searchStatus) searchStatus.textContent = "Search cancelled.";
    }
    else if (action === "search-go" || action === "record-go") { await state.reader.goTo(button.dataset.cfi); closeOverlay(); }
    else if (action === "toc-go") { await state.reader.goTo(button.dataset.href); closeOverlay(); }
    else if (action === "setting-choice") { await updateSetting(button.dataset.key, button.dataset.value); reopenSettings(); }
    else if (action === "setting-toggle") { await updateSetting(button.dataset.key, !state.preferences[button.dataset.key]); reopenSettings(); }
    else if (action === "theme") { await updateSetting("theme", button.dataset.theme); reopenSettings(); }
    else if (action === "preset") await applyPreset(button.dataset.preset);
    else if (action === "save-settings") { await savePreferences({ ...state.preferences, preset: "custom" }); closeOverlay(); toast("Custom settings saved."); }
    else if (action === "reset-settings") await applyPreset("comfortable");
    else if (action === "export-json") { await exportJsonBackup(); state.lastBackup = await getMeta("lastSuccessfulBackupAt"); toast("Backup exported."); await renderBackup(); }
    else if (action === "import-json") backupInput.click();
    else if (action === "restore-mode") {
      const dialog = button.closest("[data-restore-mode]");
      dialog.dataset.restoreMode = button.dataset.mode;
      dialog.querySelectorAll("[data-action=restore-mode]").forEach(item => item.classList.toggle("selected", item === button));
    }
    else if (action === "restore-confirm") {
      const mode = button.closest("[data-restore-mode]").dataset.restoreMode;
      if (mode === "replace") await exportJsonBackup();
      await restoreBackup(state.restorePayload, mode); closeOverlay(); await refresh(); toast("Backup restored."); await renderBackup();
    }
    else if (action === "export-markdown") {
      const book = state.books.find(item => item.id === button.dataset.bookId);
      await exportBookMarkdown(book); toast("Markdown exported.");
    }
    else if (action === "request-storage") {
      const result = await requestPersistentStorage();
      toast(result ? "Storage protection enabled." : "Storage protection was not granted. Keep regular backups.");
      await refresh(); await renderBackup();
    }
    else if (action === "remove-annotation") {
      const annotation = await get("annotations", button.dataset.id);
      if (annotation) await state.reader?.removeAnnotation(annotation);
      const deleted = await tombstone("annotations", button.dataset.id);
      if (deleted) await queueArtifactDeletion("annotations", deleted, state.currentBook);
      closeOverlay();
      toast("Annotation removed.");
    }
    else if (action === "app-settings") await openJournalSettings();
    else if (action === "journal-save-connection") {
      const token = document.querySelector("#journal-token")?.value || "";
      const device = document.querySelector("#journal-device")?.value || "";
      const result = await saveJournalConnection(token, device);
      toast(result.ok ? "Journal connection saved." : result.reason === "token" ? "Enter a GitHub token first." : "A device context could not be created.");
      await openJournalSettings();
    }
    else if (action === "journal-toggle") {
      const desired = button.getAttribute("aria-checked") !== "true";
      const token = document.querySelector("#journal-token")?.value || "";
      if (token) saveJournalToken(token);
      const device = document.querySelector("#journal-device")?.value || "";
      const result = await toggleJournal(desired, device);
      if (!result.ok) toast(result.reason === "token" ? "Enter and save a GitHub token first." : "A device context could not be created.");
      else toast(desired ? "Petal is now included in Daybook." : "Petal journal sharing is off.");
      await openJournalSettings();
    }
    else if (action === "journal-backfill") {
      if (!getJournalState().enabled) { toast("Turn on Include in journal first."); return; }
      const from = document.querySelector("#journal-from")?.value || journalDateRange().from;
      const to = document.querySelector("#journal-to")?.value || journalDateRange().to;
      if (from > to) { toast("Choose a valid date range."); return; }
      if (confirm(`Import Petal records from ${from} through ${to}? This writes saved artifacts and limited imported history to your private journal.`)) {
        const result = await backfillJournal({ from, to });
        toast(result.error ? `Import paused with ${result.pendingCount || 0} pending.` : `Imported ${result.records} records across ${result.dates} days.`);
        await openJournalSettings();
      }
    }
    else if (action === "delete-copy") {
      const book = state.books.find(item => item.id === button.dataset.bookId);
      if (confirm(`Delete only the stored EPUB copy of “${book.title}”? Reading records will stay.`)) {
        await deleteBookCopy(book.id); closeOverlay(); await refresh(); toast("EPUB app copy deleted."); await renderLibrary();
      }
    }
    else if (action === "delete-all") {
      const book = state.books.find(item => item.id === button.dataset.bookId);
      if (confirm(`Delete “${book.title}” and all of its reading records from this device? This cannot be undone.`)) {
        const [records, sessions] = await Promise.all([getBookRecords(book.id), getAll("readingSessions", "bookId", book.id)]);
        await deleteBookAndRecords(book.id);
        const deletedAt = now();
        for (const annotation of records.annotations) await queueArtifactDeletion("annotations", { ...annotation, deletedAt }, book);
        for (const bookmark of records.bookmarks) await queueArtifactDeletion("bookmarks", { ...bookmark, deletedAt }, book);
        for (const vocabulary of records.vocabulary) await queueArtifactDeletion("vocabulary", { ...vocabulary, deletedAt }, book);
        for (const session of sessions) await queueReadingSession({ ...session, deletedAt, updatedAt: deletedAt }, book, { deleted: true });
        closeOverlay(); await refresh(); toast("Book and records deleted."); await renderLibrary();
      }
    }
    else if (action === "reconnect") { state.reconnectBookId = button.dataset.bookId; epubInput.click(); }
    else if (action === "reset-all") {
      if (confirm("Erase all Petal Reader data stored on this device? This cannot be undone. Export a JSON backup first if you want to keep your records.")) {
        await resetAllLocalData();
        location.hash = "#library";
        location.reload();
      }
    }
    else if (action === "cancel-import") {
      state.importCancelled = true;
      state.importWorker?.terminate();
      state.importWorker = null;
      state.importReject?.(new DOMException("Import cancelled.", "AbortError"));
      state.importReject = null;
      document.querySelector(".import-progress")?.remove();
    }
    else if (action === "apply-update") {
      state.waitingWorker?.postMessage({ type: "SKIP_WAITING" });
    }
  } catch (error) {
    showError(error);
  }
});

app.addEventListener("change", async event => {
  const target = event.target;
  if (target.matches("[data-setting]")) {
    await updateSetting(target.dataset.setting, target.value);
    reopenSettings();
  }
  if (target.matches("[data-setting-range]")) {
    // Drag finished: cancel any pending preview frame, then persist and relayout once.
    if (previewFrame) { cancelAnimationFrame(previewFrame); previewFrame = null; }
    persistSettingSoon(target.dataset.settingRange, Number(target.value));
    const preset = document.querySelector('[data-action="preset"].selected');
    if (preset && preset.dataset.preset !== "custom") {
      preset.classList.remove("selected");
      document.querySelector('[data-action="preset"][data-preset="custom"]')?.classList.add("selected");
    }
  }
  if (target.matches(".reader-range")) {
    await state.reader?.goToFraction(Number(target.value) / 1000);
  }
  if (target.matches("[data-record-filter], [data-record-chapter], [data-record-color], [data-record-order]")) {
    filterRecordList();
  }
});

app.addEventListener("input", event => {
  const target = event.target;
  if (target.matches("[data-setting-range]")) {
    previewSetting(target.dataset.settingRange, target.value);
  }
  if (target.matches(".reader-range")) {
    const label = document.querySelector("#progress-label");
    if (label) label.textContent = `${Math.round(Number(target.value) / 10)}%`;
  }
  if (target.matches("[data-record-filter]")) filterRecordList();
});

app.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (document.querySelector("[data-overlay]")) closeOverlay();
    else if (state.currentSelection) clearSelection();
  }
  const target = event.target;
  const isEditing = target instanceof HTMLElement
    && (target.matches("input, textarea, select, button, [contenteditable='true']") || target.closest('[role="dialog"]'));
  if (state.reader && !isEditing && !event.metaKey && !event.ctrlKey && !event.altKey) {
    if (event.key === "ArrowRight") state.reader.next();
    if (event.key === "ArrowLeft") state.reader.previous();
  }
  if (event.key === "Tab") {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

epubInput.addEventListener("change", async () => {
  const files = [...epubInput.files];
  epubInput.value = "";
  if (files.length) await importFiles(files);
});

backupInput.addEventListener("change", async () => {
  const [file] = backupInput.files;
  backupInput.value = "";
  if (!file) return;
  try {
    const payload = await readBackupFile(file);
    await openRestorePreview(payload);
  } catch (error) {
    showError(error);
  }
});

window.addEventListener("hashchange", renderRoute);
window.addEventListener("orientationchange", () => setTimeout(() => state.reader?.setLayout(state.preferences), 250));
window.addEventListener("resize", () => state.reader?.setLayout(state.preferences));
window.addEventListener("pagehide", () => {
  flushReadingState().catch(() => {});
  flushSettingWrite().catch(() => {});
  finishReadingSession("pagehide").catch(() => {});
});
document.addEventListener("visibilitychange", () => {
  handleVisibility(state.currentBook, {
    progression: state.currentLocation?.progression,
    chapterLabel: state.currentLocation?.chapterLabel,
  }).catch(() => {});
});
for (const eventName of ["pointerdown", "keydown", "selectionchange"]) {
  document.addEventListener(eventName, () => {
    if (state.reader) noteReaderActivity({
      progression: state.currentLocation?.progression,
      chapterLabel: state.currentLocation?.chapterLabel,
    }).catch(() => {});
  }, { passive: true });
}
document.addEventListener("click", event => {
  const button = event.target.closest("[data-action='apply-update']");
  if (button) state.waitingWorker?.postMessage({ type: "SKIP_WAITING" });
});

async function start() {
  await openDatabase();
  await refresh();
  onJournalState(() => {});
  if (
    "serviceWorker" in navigator
    && location.protocol !== "file:"
    && !["localhost", "127.0.0.1"].includes(location.hostname)
  ) {
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js");
      // Cache cleanup moved into the worker's activate handler — asking the outgoing
      // worker to clean up from here raced with the incoming worker's install.
      const offerUpdate = worker => {
        state.waitingWorker = worker;
        if (document.querySelector(".update-banner")) return;
        const region = document.createElement("div");
        region.className = "update-banner";
        region.innerHTML = `<span>A new Petal Reader version is ready.</span><button class="button primary" data-action="apply-update">Update now</button>`;
        document.body.append(region);
      };
      if (registration.waiting) offerUpdate(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });
    } catch (error) {
      console.warn("Service worker registration failed.", error);
    }
  }
  if (!state.storage.persisted && !await getMeta("persistAsked")) {
    await setMeta("persistAsked", true);
  }
  await renderRoute();
}

start().catch(showError);
