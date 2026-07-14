import sharp from 'sharp';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_TYPE = 'application/pdf';

export function isPreviewable(mimeType) {
  return IMAGE_TYPES.has(mimeType) || mimeType === PDF_TYPE;
}

/**
 * Generates a lightweight web preview buffer for supported types.
 * Returns null when no preview is applicable (video/audio are streamed as-is).
 */
export async function generatePreview(buffer, mimeType) {
  if (IMAGE_TYPES.has(mimeType)) {
    const resized = await sharp(buffer)
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return { buffer: resized, mimeType: 'image/jpeg' };
  }

  if (mimeType === PDF_TYPE) {
    // First-page raster thumbnail. Uses pdf-to-img (pdf.js under the hood).
    const { pdf } = await import('pdf-to-img');
    const doc = await pdf(buffer, { scale: 2 });
    for await (const page of doc) {
      const resized = await sharp(page).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      return { buffer: resized, mimeType: 'image/jpeg' };
    }
    return null;
  }

  return null;
}

// --- Flipbook caching --------------------------------------------------------
// Parsing a PDF (pdf-to-img/pdf.js) and downloading it from Drive are both
// expensive, and a naive per-request implementation redid both on every single
// page flip. Cache the parsed document (keyed by the immutable versionId, so
// there's no staleness risk — a new upload always gets a new versionId) and
// the rendered JPEG per page, so navigating pages after the first is instant.
const TTL_MS = 20 * 60 * 1000;
const MAX_DOCS = 10;
const MAX_RENDERED_PAGES = 300;

const docCache = new Map(); // versionId -> { doc, pageCount, at }
const pageCache = new Map(); // "versionId:page" -> { buffer, at }

function pruneCache(map, max) {
  const now = Date.now();
  for (const [key, entry] of map) {
    if (now - entry.at > TTL_MS) map.delete(key);
  }
  while (map.size > max) {
    map.delete(map.keys().next().value);
  }
}

async function getDoc_(versionId, fetchBuffer) {
  const cached = docCache.get(versionId);
  if (cached) {
    cached.at = Date.now();
    return cached;
  }
  const buffer = await fetchBuffer();
  const { pdf } = await import('pdf-to-img');
  const doc = await pdf(buffer, { scale: 2 });
  const entry = { doc, pageCount: doc.length, at: Date.now() };
  docCache.set(versionId, entry);
  pruneCache(docCache, MAX_DOCS);
  return entry;
}

/**
 * Page count for the flipbook viewer. `fetchBuffer` is only invoked on a cache
 * miss (first request for this version), so repeat calls are effectively free.
 */
export async function getPdfPageCount(versionId, fetchBuffer) {
  const entry = await getDoc_(versionId, fetchBuffer);
  return entry.pageCount;
}

/** Rasterizes a single 1-indexed page for the flipbook viewer, cached per version+page. */
export async function renderPdfPage(versionId, pageNumber, fetchBuffer) {
  const cacheKey = `${versionId}:${pageNumber}`;
  const cached = pageCache.get(cacheKey);
  if (cached) {
    cached.at = Date.now();
    return cached.buffer;
  }
  const entry = await getDoc_(versionId, fetchBuffer);
  const page = await entry.doc.getPage(pageNumber);
  const jpeg = await sharp(page).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  pageCache.set(cacheKey, { buffer: jpeg, at: Date.now() });
  pruneCache(pageCache, MAX_RENDERED_PAGES);
  return jpeg;
}
