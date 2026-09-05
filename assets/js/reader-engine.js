import { Overlayer } from "../../vendor/foliate-js/overlayer.js";
import { fontFaceCss, DEFAULT_FONT_SIZE } from "./fonts.js";

const FONT_FACE_CSS = fontFaceCss(file => new URL(`../fonts/${file}`, import.meta.url).href);

const ENGINE_URL = new URL("../../vendor/foliate-js/view.js", import.meta.url);
const COLOR_MAP = {
  core: "#ef7fa0",
  agree: "#86cdb8",
  question: "#e6a77a",
  word: "#aa90d8",
  quote: "#92bad3"
};

// Converts the "Text width" slider (in ch, roughly average-character-widths)
// to a pixel cap. Shared by setLayout (which only narrows multi-column
// spreads) and setStyles (which narrows the body itself, since single-column
// layouts — the common case on phones — never split into extra columns no
// matter how small max-inline-size is, so that alone never visibly shrinks
// the reading column there).
function textWidthPixels(preferences) {
  return Math.round((preferences.textWidth || 68) * (preferences.fontSize || DEFAULT_FONT_SIZE) * .52);
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let engineModule;
async function loadEngine() {
  engineModule ||= import(ENGINE_URL.href);
  return engineModule;
}

export async function inspectEpub(file) {
  if (!file.name?.toLowerCase().endsWith(".epub")) throw new Error("Choose a DRM-free EPUB file.");
  if (file.size > 250 * 1024 * 1024) throw new Error("This EPUB is larger than the 250 MB safety limit.");
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error("This file is not a valid EPUB ZIP container.");
  }
  await preflightArchive(file);
  const { makeBook } = await loadEngine();
  const book = await makeBook(file);
  try {
    if (book.rendition?.layout === "pre-paginated") {
      throw new Error("Fixed-layout EPUBs are not supported in this version.");
    }
    const metadata = book.metadata || {};
    const coverBlob = await book.getCover?.();
    return {
      metadata: {
        title: normalizeMetadata(metadata.title),
        author: normalizeMetadata(metadata.author || metadata.creator),
        language: normalizeMetadata(metadata.language),
        identifier: normalizeMetadata(metadata.identifier)
      },
      coverBlob
    };
  } finally {
    book.destroy?.();
  }
}

async function preflightArchive(file) {
  const { configure, ZipReader, BlobReader, TextWriter } =
    await import("../../vendor/foliate-js/vendor/zip.js");
  configure({ useWebWorkers: false });
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = await reader.getEntries();
    if (entries.length > 10_000) throw new Error("This EPUB contains too many files.");
    let total = 0;
    for (const entry of entries) {
      const size = entry.uncompressedSize || 0;
      const compressed = Math.max(1, entry.compressedSize || 1);
      total += size;
      if (size > 150 * 1024 * 1024) throw new Error("This EPUB contains an unusually large internal file.");
      if (size / compressed > 1_000) throw new Error("This EPUB has an unsafe compression ratio.");
      if (total > 1_024 * 1024 * 1024) throw new Error("This EPUB expands beyond the 1 GB safety limit.");
    }
    const encryption = entries.find(entry => entry.filename === "META-INF/encryption.xml");
    if (encryption) {
      const xml = await encryption.getData(new TextWriter());
      const algorithms = [...xml.matchAll(/Algorithm\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
      const allowed = new Set([
        "http://www.idpf.org/2008/embedding",
        "http://ns.adobe.com/pdf/enc#RC"
      ]);
      if (algorithms.some(algorithm => !allowed.has(algorithm))) {
        throw new Error("This EPUB appears to use DRM or unsupported encryption.");
      }
    }
  } finally {
    await reader.close();
  }
}

function normalizeMetadata(value) {
  if (Array.isArray(value)) return value.map(normalizeMetadata).filter(Boolean).join(", ");
  if (value && typeof value === "object") return value.value || value.name || value.label || "";
  return value == null ? "" : String(value);
}

function securePublicationMarkup(data, type) {
  return Promise.resolve(data).then(value => {
    if (typeof value !== "string") return value;
    if (type === "text/css") {
      return value
        .replace(/@import\s+(?:url\()?["']?(?:https?:)?\/\/[^;]+;?/gi, "")
        .replace(/url\(\s*["']?(?:https?:)?\/\/[^)]+\)/gi, "none");
    }
    if (!/html|xhtml|svg/i.test(type || "")) return value;
    const origin = location.origin;
    const policy = `default-src 'none'; img-src blob: data: ${origin}; style-src 'unsafe-inline' blob:; font-src blob: data: ${origin}; media-src blob: data:; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'`;
    let secured = value
      .replace(/<meta\b[^>]*http-equiv\s*=\s*(["'])?Content-Security-Policy\1?[^>]*\/?>/gi, "")
      .replace(/<meta\b[^>]*http-equiv\s*=\s*(["'])?refresh\1?[^>]*\/?>/gi, "")
      .replace(/<\s*(script|iframe|object|embed|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/<\s*(script|iframe|object|embed|form)\b[^>]*\/?>/gi, "")
      .replace(/\s+on[a-z]+\s*=\s*(["'])[\s\S]*?\1/gi, "")
      .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, "")
      .replace(/\s+(?:src|srcset|poster|href|xlink:href)\s*=\s*(["'])\s*(?:https?:)?\/\/[\s\S]*?\1/gi, "")
      .replace(/\s+(?:src|srcset|poster|href|xlink:href)\s*=\s*(?:https?:)?\/\/[^\s>]+/gi, "")
      .replace(/\s+(?:src|srcset|poster|href|xlink:href)\s*=\s*(["'])\s*(?:javascript:|data:text\/html)[\s\S]*?\1/gi, "")
      .replace(/\s+(?:src|srcset|poster|href|xlink:href)\s*=\s*(?:javascript:|data:text\/html)[^\s>]+/gi, "");
    if (/html|xhtml/i.test(type || "")) {
      // The CSP meta tag is the only layer that actually blocks network requests,
      // so a silent replace failure must never let the document render.
      const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}"/>`;
      let injected = secured.replace(/<head(\s[^>]*)?>/i, match => `${match}${meta}`);
      if (injected === secured) {
        injected = secured.replace(/<html(\s[^>]*)?>/i, match => `${match}<head>${meta}</head>`);
      }
      if (injected === secured) return "";
      secured = injected;
    }
    return secured;
  });
}

export class ReaderEngineAdapter extends EventTarget {
  constructor(host) {
    super();
    this.host = host;
    this.view = null;
    this.book = null;
    this.preferences = null;
    this.currentSelection = null;
    this.cleanups = [];
  }

  async open(fileRecord, initialLocator, preferences, annotations = []) {
    await this.close();
    const { makeBook } = await loadEngine();
    const sourceBlob = fileRecord.epubBlob;
    const file = sourceBlob instanceof File
      ? sourceBlob
      : new File([sourceBlob], fileRecord.fileName || "book.epub", { type: "application/epub+zip" });
    const book = await withTimeout(makeBook(file), 15_000, "This EPUB took too long to open.");
    if (book.rendition?.layout === "pre-paginated") {
      book.destroy?.();
      throw new Error("Fixed-layout EPUBs are not supported.");
    }
    this.book = book;
    book.transformTarget?.addEventListener("data", event => {
      event.detail.data = securePublicationMarkup(event.detail.data, event.detail.type);
    });
    book.transformTarget?.addEventListener("load", event => {
      if (event.detail.isScript) event.detail.allow = false;
    });
    this.preferences = preferences;
    this.view = document.createElement("foliate-view");
    this.view.className = "foliate-reader";
    this.host.replaceChildren(this.view);

    const onRelocate = event => {
      const location = event.detail;
      this.dispatchEvent(new CustomEvent("relocate", {
        detail: {
          cfi: location.cfi,
          spineIndex: location.index ?? location.section?.current ?? 0,
          spineHref: this.book?.sections?.[location.index ?? location.section?.current ?? 0]?.id || "",
          chapterLabel: location.tocItem?.label || "",
          progression: location.fraction ?? location.section?.fraction ?? 0,
          pageLabel: location.pageItem?.label || "",
          locationCurrent: location.location?.current ?? 0,
          locationTotal: location.location?.total ?? 0,
          raw: location
        }
      }));
    };
    const onLoad = event => {
      this.#prepareDocument(event.detail);
      // The paginator's own columnize() runs synchronously right after this
      // "load" handler returns, and it unconditionally resets body's
      // max-width/margin to nothing (`!important` inline styles, needed so a
      // book's own CSS can't break pagination). Applying our text-width cap
      // in the same tick would just get wiped a moment later, so defer one
      // microtask — after columnize() has already run — and reapply.
      queueMicrotask(() => this.#applyTextWidthOverride());
    };
    const onExternal = event => {
      event.preventDefault();
      this.dispatchEvent(new CustomEvent("external-link-blocked", { detail: event.detail }));
    };
    const onDraw = event => {
      const { draw, annotation } = event.detail;
      draw(Overlayer.highlight, { color: COLOR_MAP[annotation.color] || COLOR_MAP.core });
    };
    const onShow = event => this.dispatchEvent(new CustomEvent("annotation-activate", { detail: event.detail }));

    this.view.addEventListener("relocate", onRelocate);
    this.view.addEventListener("load", onLoad);
    this.view.addEventListener("external-link", onExternal);
    this.view.addEventListener("draw-annotation", onDraw);
    this.view.addEventListener("show-annotation", onShow);
    this.cleanups.push(
      () => this.view?.removeEventListener("relocate", onRelocate),
      () => this.view?.removeEventListener("load", onLoad),
      () => this.view?.removeEventListener("external-link", onExternal),
      () => this.view?.removeEventListener("draw-annotation", onDraw),
      () => this.view?.removeEventListener("show-annotation", onShow)
    );

    await withTimeout(this.view.open(book), 15_000, "The EPUB renderer did not start in time.");
    this.setLayout(preferences);
    this.setStyles(preferences);
    if (initialLocator?.cfi) {
      try {
        await withTimeout(
          this.view.init({ lastLocation: initialLocator.cfi, showTextStart: false }),
          8_000,
          "The saved reading position could not be restored."
        );
      } catch (error) {
        this.dispatchEvent(new CustomEvent("location-warning", { detail: error }));
        await this.view.init({ showTextStart: true });
        try {
          if (Number.isFinite(initialLocator.progression)) {
            await this.view.goToFraction(initialLocator.progression);
          } else if (initialLocator.spineHref) {
            await this.view.goTo(initialLocator.spineHref);
          }
        } catch {
          // Keep the safe first readable location when approximation also fails.
        }
      }
    } else {
      try {
        await withTimeout(
          this.view.init({ showTextStart: true }),
          8_000,
          "The EPUB body-matter landmark could not be opened."
        );
      } catch {
        await this.view.init({ showTextStart: false });
      }
    }
    for (const annotation of annotations) {
      if (!annotation.deletedAt && annotation.locator?.cfiRange) {
        try {
          await withTimeout(
            this.view.addAnnotation({ value: annotation.locator.cfiRange, color: annotation.semanticColor, id: annotation.id }),
            3_000,
            "Annotation restore timed out."
          );
        } catch (error) {
          // One broken annotation must never abort opening the whole book —
          // the recovery search itself can throw (e.g. mid-render), and that
          // used to propagate out of open() uncaught.
          try {
            const recovered = await this.#findUniqueTextQuote(annotation.locator?.textQuote);
            if (recovered) {
              const replacement = {
                ...annotation,
                locator: { ...annotation.locator, cfiRange: recovered }
              };
              await this.view.addAnnotation({
                value: recovered,
                color: annotation.semanticColor,
                id: annotation.id
              });
              this.dispatchEvent(new CustomEvent("annotation-recovered", { detail: replacement }));
              continue;
            }
          } catch {
            // Fall through to the warning below.
          }
          this.dispatchEvent(new CustomEvent("annotation-warning", {
            detail: { annotationId: annotation.id, error }
          }));
        }
      }
    }
  }

  async #findUniqueTextQuote(textQuote) {
    const exact = textQuote?.exact?.trim();
    if (!exact || exact.length < 8) return null;
    const matches = [];
    try {
      for await (const result of this.view.search({ query: exact })) {
        for (const item of result.subitems || [result]) {
          if (item.cfi) matches.push(item.cfi);
          if (matches.length > 1) break;
        }
        if (matches.length > 1) break;
      }
    } finally {
      this.view.clearSearch?.();
    }
    return matches.length === 1 ? matches[0] : null;
  }

  #prepareDocument({ doc, index }) {
    const block = event => {
      event.preventDefault();
      event.stopPropagation();
    };
    doc.querySelectorAll("script, form, iframe, object, embed, meta[http-equiv='refresh' i]").forEach(element => element.remove());
    doc.querySelectorAll("*").forEach(element => {
      for (const attribute of [...element.attributes]) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();
        if (
          name.startsWith("on")
          || (["src", "srcset", "poster", "href", "xlink:href"].includes(name)
            && (/^(?:https?:)?\/\//.test(value) || /^javascript:/.test(value) || /^data:text\/html/.test(value)))
          || (name === "style" && /(?:@import|url\s*\()\s*["']?\s*(?:https?:)?\/\//i.test(attribute.value))
        ) {
          element.removeAttribute(attribute.name);
        }
      }
    });
    doc.addEventListener("submit", block, true);
    doc.addEventListener("dragstart", event => {
      if (event.target.closest("a, img")) event.preventDefault();
    }, true);

    // Arrow-key events fire inside this iframe's own document and never
    // bubble out to the host page, so the reader needs its own listener
    // rather than relying on the outer app's keydown handler.
    doc.addEventListener("keydown", event => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target?.closest?.("a, button, input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        this.dispatchEvent(new CustomEvent("page-tap", { detail: { zone: "next", index } }));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.dispatchEvent(new CustomEvent("page-tap", { detail: { zone: "previous", index } }));
      }
    });

    let pointerStart;
    doc.addEventListener("pointerdown", event => {
      pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() };
    }, true);
    doc.addEventListener("pointerup", event => {
      const start = pointerStart;
      pointerStart = null;
      if (!start || event.target.closest("a, button, input, textarea, select")) return;
      const selection = doc.getSelection();
      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (!selection?.isCollapsed || distance > 10 || performance.now() - start.time > 250) return;
      // The iframe is sized to the whole scrollable spread (often thousands of
      // pixels wide), not the visible page, so clientX / iframe width is
      // meaningless. Re-anchor the tap to the reader's on-screen viewport.
      const frame = doc.defaultView.frameElement;
      const hostRect = this.host.getBoundingClientRect();
      const frameRect = frame?.getBoundingClientRect();
      const pageX = (frameRect?.left ?? hostRect.left) + event.clientX;
      const fraction = (pageX - hostRect.left) / Math.max(1, hostRect.width);
      const zone = fraction < .3 ? "previous" : fraction > .7 ? "next" : "center";
      this.dispatchEvent(new CustomEvent("page-tap", { detail: { zone, index } }));
    }, true);

    let selectionTimer;
    const emitSelection = () => {
      clearTimeout(selectionTimer);
      selectionTimer = setTimeout(() => {
        const selection = doc.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) {
          // A tap elsewhere (or pressing Escape's browser-native equivalent)
          // collapses the selection, but nothing else observes that — without
          // this, the selection action bar stays on screen forever pointing
          // at text that is no longer selected.
          if (this.currentSelection) {
            this.currentSelection = null;
            this.dispatchEvent(new CustomEvent("selection", { detail: null }));
          }
          return;
        }
        const range = selection.getRangeAt(0);
        const exact = selection.toString().replace(/\s+/g, " ").trim();
        if (!exact) return;
        const cfiRange = this.view.getCFI(index, range);
        const context = this.#selectionContext(doc, range, exact);
        this.currentSelection = {
          exact,
          cfiRange,
          spineIndex: index,
          spineHref: this.book?.sections?.[index]?.id || "",
          ...context
        };
        this.dispatchEvent(new CustomEvent("selection", { detail: this.currentSelection }));
      }, 80);
    };
    doc.addEventListener("selectionchange", emitSelection);
    doc.addEventListener("pointerup", emitSelection);
  }

  #selectionContext(doc, range, exact) {
    const before = doc.createRange();
    before.selectNodeContents(doc.body);
    before.setEnd(range.startContainer, range.startOffset);
    const after = doc.createRange();
    after.selectNodeContents(doc.body);
    after.setStart(range.endContainer, range.endOffset);
    const prefix = before.toString().replace(/\s+/g, " ").trimEnd();
    const suffix = after.toString().replace(/\s+/g, " ").trimStart();
    return {
      prefix: prefix.slice(-64),
      suffix: suffix.slice(0, 64)
    };
  }

  setLayout(preferences = this.preferences) {
    if (!this.view?.renderer) return;
    this.preferences = { ...this.preferences, ...preferences };
    const renderer = this.view.renderer;
    const compactLandscape = matchMedia("(orientation: landscape)").matches && innerHeight <= 500;
    const pageWidth = innerWidth >= 720 ? Math.floor((innerWidth - 80) / 2) : innerWidth;
    const canSpread = pageWidth >= (this.preferences.spread === "auto" ? 360 : 300);
    const columns = this.preferences.spread === "1" ? 1
      : this.preferences.spread === "2" && canSpread ? 2
      : this.preferences.spread === "auto" && !compactLandscape
        && matchMedia("(orientation: landscape)").matches && canSpread ? 2
      : 1;
    renderer.setAttribute("flow", this.preferences.flow === "scrolled" ? "scrolled" : "paginated");
    renderer.setAttribute("margin", `${this.preferences.horizontalMargin || 32}px`);
    renderer.setAttribute("gap", "4%");
    renderer.setAttribute("max-inline-size", `${textWidthPixels(this.preferences)}px`);
    renderer.setAttribute("max-column-count", String(columns));
    renderer.toggleAttribute(
      "animated",
      Boolean(this.preferences.animation) && !matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    // The attribute changes above just made the paginator synchronously
    // re-render (columnize() resets body's width every time), so reapply now.
    this.#applyTextWidthOverride();
  }

  // Both flows the paginator supports handle text width differently, and
  // neither leaves room for our own CSS to win by normal means:
  //  - scrolled(): sets body's max-width itself (inline, !important) —
  //    already correct, reapplying here is a harmless no-op.
  //  - columnize() (paginated): unconditionally *resets* body's max-width to
  //    none (inline, !important) every render, specifically so a book's own
  //    CSS can't break pagination. An inline style always beats a stylesheet
  //    rule on the same element regardless of !important on both sides, so
  //    our setStyles() rule alone can never win there — we have to set the
  //    same inline property ourselves, after each render, to get the same
  //    priority the library's own reset has.
  #applyTextWidthOverride() {
    if (!this.view?.renderer?.getContents) return;
    const maxWidth = `${textWidthPixels(this.preferences)}px`;
    for (const { doc } of this.view.renderer.getContents()) {
      if (!doc?.body) continue;
      doc.body.style.setProperty("max-width", maxWidth, "important");
      doc.body.style.setProperty("margin-inline", "auto", "important");
    }
  }

  setStyles(preferences = this.preferences) {
    if (!this.view?.renderer) return;
    this.preferences = { ...this.preferences, ...preferences };
    const p = this.preferences;
    const themes = {
      paper: ["#fffcf7", "#351b25"],
      rose: ["#fff5f7", "#351b25"],
      mint: ["#f1faf6", "#283b34"],
      sky: ["#f3f8fc", "#263740"],
      lavender: ["#f8f5fc", "#342d3d"],
      beige: ["#f6efe4", "#372f28"]
    };
    const [background, color] = themes[p.theme] || themes.paper;
    // The paginator's own max-inline-size only limits how wide a *column*
    // gets when there's room to split into more of them — on a single-column
    // layout (any portrait phone) it's always ignored, so Text width would
    // otherwise do nothing there. Capping the body itself makes it work
    // regardless of column count.
    const maxWidth = `${textWidthPixels(p)}px`;
    const typography = p.publisherStyles ? `
      body { background: ${background} !important; color: ${color} !important; padding-block: ${p.verticalMargin || 24}px !important; overflow-wrap: break-word; }
    ` : `
      body, p { font-family: inherit !important; color: inherit !important; font-size: inherit !important;
        line-height: inherit !important; letter-spacing: inherit !important; text-align: inherit !important; }
      p { margin-block: 0 ${p.paragraphSpacing}em !important; }
      body {
        background: ${background} !important;
        color: ${color} !important;
        font-family: ${p.fontFamily} !important;
        font-size: ${p.fontSize}px !important;
        line-height: ${p.lineHeight} !important;
        letter-spacing: ${p.letterSpacing}em !important;
        text-align: ${p.alignment} !important;
        padding-block: ${p.verticalMargin || 24}px !important;
        max-width: ${maxWidth} !important;
        margin-inline: auto !important;
        overflow-wrap: break-word;
      }
    `;
    this.view.renderer.setStyles(`
      :root { color-scheme: light !important; background: ${background} !important; }
      ${FONT_FACE_CSS}
      ${typography}
      a { color: #9f244a !important; text-decoration-thickness: .08em; }
      img, svg { max-width: 100% !important; height: auto !important; }
      ::selection { background: rgba(239,127,160,.32); }
    `);
    // setStyles() alone (no setLayout()) is what runs on every frame while
    // dragging the Text width slider, so the inline override has to be kept
    // in sync here too, or live preview would only work in scrolled mode.
    this.#applyTextWidthOverride();
  }

  async next() { return this.view?.next(); }
  async previous() { return this.view?.prev(); }
  async goTo(target) { return this.view?.goTo(target?.cfi || target); }
  async goToFraction(fraction) { return this.view?.goToFraction(fraction); }
  getTOC() { return this.book?.toc || []; }
  getMetadata() { return this.book?.metadata || {}; }

  async *search(query, signal) {
    if (!this.view || !query) return;
    for await (const result of this.view.search({ query })) {
      if (signal?.aborted) {
        this.view.clearSearch();
        return;
      }
      yield result;
    }
  }

  async addAnnotation(annotation) {
    return this.view?.addAnnotation({
      value: annotation.locator.cfiRange || annotation.locator.cfi,
      color: annotation.semanticColor,
      id: annotation.id
    });
  }

  async removeAnnotation(annotation) {
    return this.view?.deleteAnnotation({
      value: annotation.locator.cfiRange || annotation.locator.cfi,
      id: annotation.id
    });
  }

  deselect() {
    this.view?.deselect();
    this.currentSelection = null;
  }

  async close() {
    this.cleanups.splice(0).forEach(cleanup => cleanup());
    if (this.view) {
      const book = this.view.book || this.book;
      this.view.close();
      book?.destroy?.();
      this.view.remove();
    }
    this.view = null;
    this.book = null;
    this.currentSelection = null;
    this.host?.replaceChildren();
  }
}
