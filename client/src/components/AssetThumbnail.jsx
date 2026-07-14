import AnnotationMarker from './AnnotationMarker';

const PREVIEWABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

/**
 * Small preview thumbnail with correction boxes overlaid, so a box is visible
 * from the list view instead of only after opening the full viewer. Only
 * boxes on the thumbnail's own page (page 1, since that's what the underlying
 * /api/preview image is — the first page for PDFs) are shown; boxes pinned to
 * other pages of a flipbook only show up in the full page-by-page viewer.
 */
export default function AssetThumbnail({ version, comments, className, onClick }) {
  if (!version || version.embedUrl || !PREVIEWABLE_TYPES.has(version.mimeType)) return null;

  const boxes = (comments || []).filter(
    (c) => c.posX !== '' && (c.page === '' || c.page === undefined || Number(c.page) === 1)
  );

  return (
    <div className={`relative bg-gray-100 rounded-lg overflow-hidden ${className || ''}`} onClick={onClick}>
      <img src={`/api/preview/${version.id}`} alt="" className="w-full h-full object-cover" />
      {boxes.map((c) => (
        <AnnotationMarker key={c.id} comment={c} />
      ))}
    </div>
  );
}
