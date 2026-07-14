import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import StatusBadge from './StatusBadge';
import PdfFlipbook from './PdfFlipbook';
import AnnotationMarker from './AnnotationMarker';
import RevisionChecklist from './RevisionChecklist';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FLIPBOOK_ASSET_TYPES = new Set(['manuscript', 'interior', 'proofreading']);

export default function TeamAssetViewer({ asset, onClose, onChanged }) {
  const sorted = [...(asset.versions || [])].sort((a, b) => b.versionNumber - a.versionNumber);
  const [selectedVersionId, setSelectedVersionId] = useState(sorted[0]?.id);
  const version = sorted.find((v) => v.id === selectedVersionId) || sorted[0];

  const [replyText, setReplyText] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [zoom, setZoom] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCommentId, setSelectedCommentId] = useState(null);
  const viewerRef = useRef(null);

  const comments = (asset.comments || []).filter((c) => c.versionId === version?.id);

  useEffect(() => {
    if (!selectedCommentId) return;
    const timer = setTimeout(() => {
      viewerRef.current
        ?.querySelector(`[data-comment-id="${selectedCommentId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, 120);
    return () => clearTimeout(timer);
  }, [selectedCommentId]);
  const isEmbed = Boolean(version?.embedUrl);
  const isPdf = version?.mimeType === 'application/pdf';
  const isFlipbook = version && !isEmbed && isPdf && FLIPBOOK_ASSET_TYPES.has(asset.type);
  const isPreviewable = version && !isEmbed && !isFlipbook && (IMAGE_TYPES.has(version.mimeType) || isPdf);
  const isVideo = !isEmbed && version?.mimeType?.startsWith('video/');
  const isAudio = !isEmbed && version?.mimeType?.startsWith('audio/');

  async function reply() {
    if (!replyText.trim()) return;
    await api.post(`/assets/${asset.id}/team-comments`, { body: replyText, versionId: version.id });
    setReplyText('');
    onChanged();
  }

  async function resolve(commentId) {
    await api.patch(`/comments/${commentId}/resolve`);
    onChanged();
  }

  async function decide(decision) {
    setSubmitting(true);
    try {
      const endpoint = decision === 'acknowledge' ? 'acknowledge-changes' : 'final-request-changes';
      await api.post(`/assets/${asset.id}/${endpoint}`, { note: decisionNote });
      setDecisionNote('');
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  if (!version) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-medium">{asset.title}</h2>
            <p className="text-xs text-gray-400">v{version.versionNumber} · {new Date(version.createdAt).toLocaleDateString()}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={asset.status} />
            <button onClick={onClose} className="text-sm text-gray-500 hover:underline">Close</button>
          </div>
        </div>

        {sorted.length > 1 && (
          <div className="flex gap-1 mb-4 text-xs">
            {sorted.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVersionId(v.id)}
                className={`px-2 py-1 rounded border ${v.id === version.id ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-500 hover:border-gray-400'}`}
              >
                v{v.versionNumber}
              </button>
            ))}
          </div>
        )}

        <div ref={viewerRef} className="bg-gray-100 rounded-lg overflow-hidden mb-4 relative">
          {isEmbed && version.embedKind === 'video' && (
            <video controls className="w-full max-h-[560px]" src={version.embedUrl} />
          )}
          {isEmbed && version.embedKind !== 'video' && (
            <iframe
              src={version.embedUrl}
              className="w-full aspect-video"
              allow="autoplay; encrypted-media"
              allowFullScreen
              title={asset.title}
            />
          )}
          {isFlipbook && (
            <div className="p-2">
              <PdfFlipbook versionId={version.id} comments={comments} allowPin={false} focusCommentId={selectedCommentId} />
            </div>
          )}
          {isPreviewable && !isPdf && (
            <div className="overflow-auto max-h-[560px]">
              <div className="relative" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                <img
                  src={`/api/preview/${version.id}`}
                  alt={asset.title}
                  className="w-full select-none block"
                />
                {comments.filter((c) => c.posX !== '').map((c) => (
                  <AnnotationMarker key={c.id} comment={c} selected={c.id === selectedCommentId} />
                ))}
              </div>
            </div>
          )}
          {isPreviewable && isPdf && !isFlipbook && (
            <div className="overflow-auto max-h-[560px]">
              <iframe
                src={`/api/preview/${version.id}`}
                className="w-full min-h-[560px]"
                title={asset.title}
              />
            </div>
          )}
          {isVideo && <video controls className="w-full max-h-[560px]" src={`/api/preview/${version.id}`} />}
          {isAudio && <audio controls className="w-full p-4" src={`/api/preview/${version.id}`} />}
          {!isEmbed && !isFlipbook && !isPreviewable && !isVideo && !isAudio && (
            <div className="p-10 text-center text-gray-400 text-sm">Preview not available for this file type.</div>
          )}
        </div>

        {isPreviewable && (
          <div className="flex gap-2 mb-4 text-xs">
            <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="border rounded px-2 py-1">−</button>
            <span className="px-2 py-1 text-gray-500">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="border rounded px-2 py-1">+</button>
            <span className="text-gray-400 ml-2">Red boxes mark where the author flagged a correction</span>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div className="space-y-3">
            <RevisionChecklist
              comments={comments}
              title="Author notes to review"
              selectedId={selectedCommentId}
              onSelectComment={setSelectedCommentId}
            />
            <div>
              <h3 className="text-sm font-medium mb-2">Team review</h3>
              <p className="text-xs text-gray-400 mb-2">
                Only the author can give final approval on the project. Use this to flag issues back to whoever
                uploaded, or to confirm a collaborator's requested changes have been addressed.
              </p>
            <textarea
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder="Optional note for the author/reviewer…"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
              rows={2}
            />
              <div className="flex gap-2">
                <button disabled={submitting} onClick={() => decide('acknowledge')} className="bg-sky-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">
                  Acknowledge collaborator's changes
                </button>
                <button disabled={submitting} onClick={() => decide('request-changes')} className="bg-red-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">
                  Request changes
                </button>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">Comments</h3>
            <div className="space-y-2 max-h-48 overflow-auto mb-3 text-sm">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-2">
              <p className={c.resolved ? 'text-gray-400 line-through' : c.reviewerChecked === 'true' ? 'text-gray-500 line-through' : 'text-gray-600'}>
                <span className="font-medium">{c.authorType === 'team' ? c.authorName : c.authorName || 'Author'}:</span> {c.body}
                {c.posX !== '' && (
                  <span className="text-gray-400"> {c.page !== '' && c.page !== undefined ? `(p. ${c.page}, pinned)` : '(pinned on image)'}</span>
                )}
                {c.reviewerChecked === 'true' && !c.resolved && (
                  <span className="ml-2 text-xs text-slate-500">Reviewer checked</span>
                )}
              </p>
              {!c.resolved && (
                <button onClick={() => resolve(c.id)} className="text-xs text-gray-500 hover:underline shrink-0">
                  Resolve
                </button>
              )}
            </div>
          ))}
          {comments.length === 0 && <p className="text-gray-400 text-sm">No comments yet.</p>}
        </div>
            <div className="flex gap-2">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Reply to the author…"
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
              />
              <button onClick={reply} className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-100">
                Post
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
