// Browser entry for /partners: the same matching and storage logic the
// My Krisper receipt flow uses, so a CSA guide never disagrees with the app.
export { extractItems } from '../api/_crisper/parser.js';
export { storageGuide, ZONES } from '../api/_crisper/storage.js';
export { BY_NAME } from '../api/_crisper/shelf.js';
export { default as PAGES } from '../produce/pages.json';
