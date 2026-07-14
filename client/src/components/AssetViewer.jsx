import { useState } from 'react';
import api from '../lib/api';
import StatusBadge from './StatusBadge';
import PdfFlipbook from './PdfFlipbook';
import AnnotationMarker from './AnnotationMarker';
import useDragBox from '../lib/useDragBox';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FLIPBOOK_ASSET_TYPES = new Set(['manuscript', 'interior', 'proofreading']);

export default function AssetViewer({ asset, versions, comments, onChanged, role = 'author' }) {
  const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const current = sorted[0];
  const [selectedVersionId, setSelectedVersionId] = useState(current?.id);
  const version = sorted.find((v) => v.id === selectedVersionId) || current;

  const [note, setNote] = useState('');
  const [commentText, setCommentText] = useState('');
  const [zoom, setZoom] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const versionComments = comments.filter((c) => c.versionId === version?.id);
  const isEmbed = Boolean(version?.embedUrl);
  const isPdf = version?.mimeType === 'application/pdf';
  const isFlipbook = version && !isEmbed && isPdf && FLIPBOOK_ASSET_TYPES.has(asset.type);
  const isPreviewable = version && !isEmbed && !isFlipbook && (IMAGE_TYPES.has(version.mimeType) || isPdf);
  const isVideo = !isEmbed && version?.mimeType?.startsWith('video/');
  const isAudio = !isEmbed && version?.mimeType?.startsWith('audio/');

  async function decide(decision) {
    setSubmitting(true);
    try {
      const endpoint = role === 'reviewer'
        ? (decision === 'approved' ? `/assets/${asset.id}/reviewer-approve` : `/assets/${asset.id}/reviewer-request-changes`)
        : (decision === 'approved' ? `/assets/${asset.id}/approve` : `/assets/${asset.id}/request-changes`);
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

  async function dropBox(posX, posY, boxW, boxH) {
    const label = window.prompt('Add a note for this spot:');
    if (!label) return;
    await api.post(`/assets/${asset.id}/comments`, { body: label, versionId: version.id, posX, posY, boxW, boxH });
    onChanged();
  }

  async function dropPdfPin(page, posX, posY, boxW, boxH) {
    const label = window.prompt('Add a note for this spot:');
    if (!label) return;
    await api.post(`/assets/${asset.id}/comments`, { body: label, versionId: version.id, posX, posY, boxW, boxH, page });
    onChanged();
  }

  const { box: dragBox, onMouseDown: onImageMouseDown } = useDragBox(
    Boolean(isPreviewable && (IMAGE_TYPES.has(version?.mimeType) || version?.mimeType === 'application/pdf')),
    dropBox
  );

  if (!version) return <p className="text-gray-400">No versions uploaded yet.</p>;

  return (
    <div className="bg-white border rounded-xl p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-medium">{asset.title}</h2>
          <p className="text-xs text-gray-400">v{version.versionNumber} · {new Date(version.createdAt).toLocaleDateString()}</p>
        </div>
        <StatusBadge status={asset.status} />
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

      <div className="bg-gray-100 rounded-lg overflow-hidden mb-4 relative">
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
            <PdfFlipbook versionId={version.id} comments={versionComments} allowPin onDropPin={dropPdfPin} />
          </div>
        )}
        {isPreviewable && !isPdf && (
          <div className="overflow-auto max-h-[560px]">
            <div className="relative" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
              <img
                src={`/api/preview/${version.id}`}
                alt={asset.title}
                onMouseDown={onImageMouseDown}
                style={{ cursor: 'crosshair' }}
                className="w-full select-none block"
                draggable={false}
              />
              {versionComments.filter((c) => c.posX !== '').map((c) => (
                <AnnotationMarker key={c.id} comment={c} />
              ))}
              {dragBox && (
                <div
                  className="absolute border-2 border-dashed border-blue-500 bg-blue-500/10 pointer-events-none"
                  style={{ left: `${dragBox.left}%`, top: `${dragBox.top}%`, width: `${dragBox.width}%`, height: `${dragBox.height}%` }}
                />
              )}
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
        {isVideo && (
          <video controls className="w-full max-h-[560px]" src={`/api/preview/${version.id}`} />
        )}
        {isAudio && (
          <audio controls className="w-full p-4" src={`/api/preview/${version.id}`} />
        )}
        {!isEmbed && !isFlipbook && !isPreviewable && !isVideo && !isAudio && (
          <div className="p-10 text-center text-gray-400 text-sm">Preview not available for this file type.</div>
        )}
      </div>

      {isPreviewable && (
        <div className="flex gap-2 mb-4 text-xs">
          <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="border rounded px-2 py-1">−</button>
          <span className="px-2 py-1 text-gray-500">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="border rounded px-2 py-1">+</button>
          <span className="text-gray-400 ml-2">Drag a box around the spot that needs a correction</span>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-medium mb-2">Decision</h3>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note…"
            className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              disabled={submitting}
              onClick={() => decide('approved')}
              className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {role === 'reviewer' ? 'Confirm recommendation' : 'Approve'}
            </button>
            <button
              disabled={submitting}
              onClick={() => decide('changes_requested')}
              className="bg-red-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {role === 'reviewer' ? 'Flag for revision' : 'Request changes'}
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-2">Comments</h3>
          <div className="space-y-1 max-h-32 overflow-auto mb-2 text-sm">
            {versionComments.map((c) => (
              <p key={c.id} className="text-gray-600">
                <span className="font-medium">{c.authorType === 'team' ? c.authorName : c.authorType === 'reviewer' ? 'Reviewer' : 'You'}:</span> {c.body}
                {c.page !== '' && c.page !== undefined && <span className="text-gray-400"> (p. {c.page})</span>}
              </p>
            ))}
            {versionComments.length === 0 && <p className="text-gray-400 text-sm">No comments yet.</p>}
          </div>
          <div className="flex gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment…"
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
