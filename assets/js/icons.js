const paths = {
  petals: `<path d="M12 12C5 11 3 7 3 3c4 0 8 2 9 9Zm0 0c1-7 5-9 9-9 0 4-2 8-9 9Zm0 0c7 1 9 5 9 9-4 0-8-2-9-9Zm0 0c-1 7-5 9-9 9 0-4 2-8 9-9Z"/>`,
  upload: `<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 13v6h14v-6"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.4v-4h.1A1.7 1.7 0 0 0 4.2 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.6 4.2a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.4h4v.1a1.7 1.7 0 0 0 1 1.7 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.6a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7 1Z"/>`,
  close: `<path d="M5 5l14 14M19 5 5 19"/>`,
  back: `<path d="m15 18-6-6 6-6"/>`,
  menu: `<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".7" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r=".7" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r=".7" fill="currentColor" stroke="none"/>`,
  search: `<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>`,
  note: `<path d="M5 3h11l3 3v15H5z"/><path d="M15 3v4h4M8 11h8M8 15h6"/>`,
  bookmark: `<path d="M6 3h12v18l-6-4-6 4z"/>`,
  book: `<path d="M3 5.5A4.5 4.5 0 0 1 7.5 4H12v16H7.5A4.5 4.5 0 0 0 3 21.5z"/><path d="M21 5.5A4.5 4.5 0 0 0 16.5 4H12v16h4.5a4.5 4.5 0 0 1 4.5 1.5z"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  minus: `<path d="M5 12h14"/>`,
  check: `<path d="m5 12 4 4L19 6"/>`,
  shield: `<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>`,
  database: `<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>`,
  highlight: `<path d="m4 16 8-12 5 3-8 12H4z"/><path d="M3 21h18"/>`,
  copy: `<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>`,
  trash: `<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>`,
  export: `<path d="M12 15V3m0 0L7 8m5-5 5 5"/><path d="M5 13v8h14v-8"/>`,
  import: `<path d="M12 3v12m0 0-5-5m5 5 5-5"/><path d="M5 13v8h14v-8"/>`,
  warning: `<path d="m12 3 10 18H2z"/><path d="M12 9v5M12 18h.01"/>`,
  chevronRight: `<path d="m9 18 6-6-6-6"/>`,
  more: `<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>`
};

export function icon(name, label = "") {
  const path = paths[name] || paths.book;
  const aria = label ? `role="img" aria-label="${label}"` : `aria-hidden="true"`;
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${aria}>${path}</svg>`;
}
