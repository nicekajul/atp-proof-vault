import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import StatusBadge from './StatusBadge';
import PdfFlipbook from './PdfFlipbook';
import AnnotationMarker from './AnnotationMarker';
import RevisionChecklist from './RevisionChecklist';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FLIPBOOK_ASSET_TYPES = new Set(['manuscript', 'interior', 'proofreading']);

export default function ReviewerAssetViewer({ asset, versions, comments, onChanged }) {
  const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const [selectedVersionId, setSelectedVersionId] = useState(sorted[0]?.id);
  const version = sorted.find((v) => v.id === selectedVersionId) || sorted[0];

  const [note, setNote] = useState('');
  const [commentText, setCommentText] = useState('');
  const [zoom, setZoom] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCommentId, setSelectedCommentId] = useState(null);
  const viewerRef = useRef(null);

  const versionComments = comments.filter((c) => c.versionId === version?.id);

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

  async function decide(decision) {
    setSubmitting(true);
    try {
      const endpoint = decision === 'approved'
        ? `/assets/${asset.id}/reviewer-approve`
        : `/assets/${asset.id}/reviewer-request-changes`;
      await api.post(endpoint, { note });
      setNote('');
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  async function submitComment() {
    if (!commentText.trim()) return;
    await api.post(`/assets/${asset.id}/comments`, { body: commentText, versionId: version.id });
    setCommentText('');
    onChanged();
  }

  if (!version) return <p className="text-gray-400">No versions uploaded yet.</p>;

  return (
    <div className="bg-white border rounded-xl p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-medium">{asset.title}</h2>
          <p className="text-xs text-gray-400">v{version.versionNumber} · {new Date(version.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={asset.status} />
          <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Reviewer recommendation</span>
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
            <PdfFlipbook versionId={version.id} comments={versionComments} allowPin={false} focusCommentId={selectedCommentId} />
          </div>
        )}
        {isPreviewable && !isPdf && (
          <div className="overflow-auto max-h-[560px]">
            <div className="relative" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
              <img src={`/api/preview/${version.id}`} alt={asset.title} className="w-full select-none block" />
              {versionComments.filter((c) => c.posX !== '').map((c) => (
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
          <span className="text-gray-400 ml-2">Leave notes or recommendations for the team lead.</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <RevisionChecklist
            comments={versionComments}
            title="Author notes to review"
            selectedId={selectedCommentId}
            onSelectComment={setSelectedCommentId}
            onToggleComment={async (commentId, checked) => {
              await api.patch(`/comments/${commentId}/reviewer-check`, { checked });
              onChanged();
            }}
          />
          <h3 className="text-sm font-medium mb-2">Your recommendation</h3>
          <p className="text-xs text-gray-500 mb-2">The team lead will review this recommendation and make the final approve or request-changes decision.</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the lead…"
            className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
            rows={2}
          />
          <div className="flex gap-2">
            <button disabled={submitting} onClick={() => decide('approved')} className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">
              Confirm recommendation
            </button>
            <button disabled={submitting} onClick={() => decide('changes_requested')} className="bg-red-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">
              Flag for revision
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-2">Comments</h3>
          <div className="space-y-1 max-h-32 overflow-auto mb-2 text-sm">
            {versionComments.map((c) => (
              <p key={c.id} className="text-gray-600">
                <span className="font-medium">{c.authorType === 'team' ? c.authorName : c.authorType === 'reviewer' ? 'You' : 'Author'}:</span> {c.body}
                {c.page !== '' && c.page !== undefined && <span className="text-gray-400"> (p. {c.page})</span>}
              </p>
            ))}
            {versionComments.length === 0 && <p className="text-gray-400 text-sm">No comments yet.</p>}
          </div>
          <div className="flex gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a note…"
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={submitComment} className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-100">
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
