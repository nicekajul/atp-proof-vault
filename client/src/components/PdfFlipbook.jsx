import { useEffect, useState } from 'react';
import api from '../lib/api';
import AnnotationMarker from './AnnotationMarker';
import useDragBox from '../lib/useDragBox';

/**
 * Page-by-page PDF viewer for manuscript/interior/proofreading proofs.
 * Renders one rasterized page at a time (via /api/preview/:versionId/pdf-page/:n)
 * so reviewers can flip through and drag a box around the exact spot a
 * correction applies to, the same interaction used for image proofs.
 */
export default function PdfFlipbook({ versionId, comments, allowPin, onDropPin, focusCommentId }) {
  const [pageCount, setPageCount] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setPage(1);
    setLoading(true);
    setError('');
    api
      .get(`/preview/${versionId}/pdf-meta`)
      .then(({ data }) => setPageCount(data.pageCount))
      .catch(() => setError('Could not load this document.'))
      .finally(() => setLoading(false));
  }, [versionId]);

  // Warm the browser + server cache for the neighboring pages so Prev/Next
  // feels instant instead of re-parsing the PDF on every click.
  useEffect(() => {
    if (!pageCount) return;
    [page - 1, page + 1].forEach((p) => {
      if (p >= 1 && p <= pageCount) {
        const img = new Image();
        img.src = `/api/preview/${versionId}/pdf-page/${p}`;
      }
    });
  }, [versionId, page, pageCount]);

  // Jump to whichever page the selected comment lives on (e.g. clicked from a checklist elsewhere in the viewer).
  useEffect(() => {
    if (!focusCommentId) return;
    const target = comments.find((c) => c.id === focusCommentId);
    if (target && target.page !== '' && target.page !== undefined) {
      const p = Number(target.page);
      if (Number.isInteger(p) && p >= 1) setPage(p);
    }
  }, [focusCommentId, comments]);

  const { box, onMouseDown } = useDragBox(allowPin, (x, y, w, h) => onDropPin(page, x, y, w, h));
  const pageComments = comments.filter((c) => c.posX !== '' && Number(c.page) === page);

  if (loading) return <div className="p-10 text-center text-gray-400 text-sm">Loading document…</div>;
  if (error || !pageCount) return <div className="p-10 text-center text-gray-400 text-sm">{error || 'Preview not available.'}</div>;

  return (
    <div>
      <div className="bg-gray-100 overflow-auto max-h-[560px]">
        <div className="relative">
          <img
            key={page}
            src={`/api/preview/${versionId}/pdf-page/${page}`}
            alt={`Page ${page}`}
            onMouseDown={onMouseDown}
            style={{ cursor: allowPin ? 'crosshair' : 'default' }}
            className="w-full select-none block"
            draggable={false}
          />
          {pageComments.map((c) => (
            <AnnotationMarker key={c.id} comment={c} selected={c.id === focusCommentId} />
          ))}
          {box && (
            <div
              className="absolute border-2 border-dashed border-blue-500 bg-blue-500/10 pointer-events-none"
              style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
            />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 text-xs">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="border rounded px-2 py-1 disabled:opacity-40"
        >
          ‹ Prev
        </button>
        <span className="text-gray-500">Page {page} of {pageCount}</span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => setPage((p) => p + 1)}
          className="border rounded px-2 py-1 disabled:opacity-40"
        >
          Next ›
        </button>
      </div>
      {allowPin && <p className="text-xs text-gray-400 mt-1">Drag a box around the spot that needs a correction.</p>}
    </div>
  );
}
