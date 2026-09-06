// Single source of truth for reader fonts and numeric setting ranges.
//
// Before v1.1.0 this list was duplicated in eight places (db.js, backup.js,
// app.js select + presets, reader-engine.js @font-face, app.css, service-worker
// SHELL). Any mismatch failed silently. JS modules now import from here; the two
// non-JS copies that cannot import — app.css @font-face and the service worker
// SHELL list — are marked with a "keep in sync with fonts.js" comment.

export const READER_FONTS = [
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Lexend", value: "Lexend, sans-serif" },
  { label: "Atkinson Hyperlegible", value: "Atkinson Hyperlegible, Arial, sans-serif" },
  { label: "OpenDyslexic", value: "OpenDyslexic, Verdana, sans-serif" },
  { label: "Comic Neue", value: '"Comic Neue", "Comic Sans MS", cursive' }
];

export const READER_FONT_VALUES = READER_FONTS.map(font => font.value);

// Values shipped in v1.0.1. They are no longer offered in the picker, but backup
// validation must still accept them or every older backup is rejected outright.
// normalizeReaderPreferences() then migrates them to DEFAULT_FONT silently.
export const LEGACY_FONT_VALUES = [
  "Iowan Old Style, Charter, Palatino, Georgia, serif",
  "Charter, Georgia, serif",
  "Palatino, Georgia, serif",
  "Literata, Georgia, serif"
];

export const ACCEPTED_FONT_VALUES = [...READER_FONT_VALUES, ...LEGACY_FONT_VALUES];

export const DEFAULT_FONT = "Georgia, serif";
export const DEFAULT_FONT_SIZE = 16;

// Bundled font files, relative to assets/fonts/. OpenDyslexic and Comic Neue are
// SIL OFL licensed; drop the files in and they are picked up automatically.
export const BUNDLED_FONT_FACES = [
  { family: "Lexend", file: "Lexend-Variable.woff2", weight: "100 900", style: "normal" },
  { family: "Atkinson Hyperlegible", file: "AtkinsonHyperlegible-Regular.ttf", weight: "400", style: "normal" },
  { family: "Atkinson Hyperlegible", file: "AtkinsonHyperlegible-Bold.ttf", weight: "700", style: "normal" },
  { family: "OpenDyslexic", file: "OpenDyslexic-Regular.woff2", weight: "400", style: "normal" },
  { family: "OpenDyslexic", file: "OpenDyslexic-Bold.woff2", weight: "700", style: "normal" },
  { family: "Comic Neue", file: "ComicNeue-Regular.woff2", weight: "400", style: "normal" },
  { family: "Comic Neue", file: "ComicNeue-Bold.woff2", weight: "700", style: "normal" }
];

const formatOf = file => (file.endsWith(".woff2") ? "woff2" : file.endsWith(".woff") ? "woff" : "truetype");

// resolve(file) -> absolute URL string. Kept as a callback so callers can use
// their own import.meta.url as the base.
export const fontFaceCss = resolve => BUNDLED_FONT_FACES.map(face =>
  `@font-face { font-family: "${face.family}"; src: url("${resolve(face.file)}") format("${formatOf(face.file)}");`
  + ` font-weight: ${face.weight}; font-style: ${face.style}; font-display: swap; }`
).join("\n");

// Numeric reader settings: [min, max, step]. Shared by the settings sliders,
// db.js clamping and backup.js range validation.
export const SETTING_RANGES = {
  fontSize: [12, 34, 1],
  lineHeight: [1.2, 2, .05],
  letterSpacing: [-.02, .08, .01],
  paragraphSpacing: [0, 1.5, .05],
  horizontalMargin: [12, 72, 2],
  verticalMargin: [12, 48, 2],
  textWidth: [36, 80, 1]
};

export const SETTING_UNITS = {
  fontSize: " px",
  lineHeight: "",
  letterSpacing: " em",
  paragraphSpacing: " em",
  horizontalMargin: " px",
  verticalMargin: " px",
  textWidth: " ch"
};

export const SETTING_LABELS = {
  fontSize: "Text size",
  lineHeight: "Line spacing",
  letterSpacing: "Letter spacing",
  paragraphSpacing: "Paragraph spacing",
  horizontalMargin: "Page margins",
  verticalMargin: "Top & bottom margins",
  textWidth: "Text width"
};

// [min, max] pairs, the shape db.js and backup.js validate against.
export const SETTING_LIMITS = Object.fromEntries(
  Object.entries(SETTING_RANGES).map(([key, [min, max]]) => [key, [min, max]])
);
