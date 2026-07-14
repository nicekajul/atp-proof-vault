import { useState } from 'react';
import api from '../lib/api';

const TYPES_BY_DEPARTMENT = {
  Publishing: [
    { value: 'cover', label: 'Book cover' },
    { value: 'illustration', label: 'Illustration' },
    { value: 'interior', label: 'Book interior' },
    { value: 'proofreading', label: 'Proofreading' },
    { value: 'manuscript', label: 'Manuscript' },
    { value: 'audio', label: 'Audiobook' },
    { value: 'other', label: 'Other' },
  ],
  Marketing: [
    { value: 'website', label: 'Website design' },
    { value: 'trailer', label: 'Book trailer' },
    { value: 'magazine', label: 'Magazine' },
    { value: 'billboard', label: 'Billboard / video promotion' },
    { value: 'other', label: 'Other' },
  ],
};
const ALL_TYPES = [...TYPES_BY_DEPARTMENT.Publishing, ...TYPES_BY_DEPARTMENT.Marketing.filter((t) => t.value !== 'other')];
const MAX_DIRECT_UPLOAD_BYTES = 40 * 1024 * 1024;

export default function AssetUploadForm({ projectId, assetId, department, onDone }) {
  const TYPES = TYPES_BY_DEPARTMENT[department] || ALL_TYPES;
  const [mode, setMode] = useState('upload'); // 'upload' | 'link'
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [type, setType] = useState(TYPES[0].value);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setUploading(true);
    setError('');

    try {
      if (mode === 'upload') {
        if (!file) return;
        if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
          setError(`File is too large for direct upload (${(file.size / (1024 * 1024)).toFixed(1)}MB, limit ${MAX_DIRECT_UPLOAD_BYTES / (1024 * 1024)}MB). Use "Link a file" instead — upload it to Google Drive, share "Anyone with the link", and paste the link.`);
          setUploading(false);
          return;
        }
        const form = new FormData();
        form.append('file', file);
        if (assetId) form.append('assetId', assetId);
        else {
          form.append('type', type);
          form.append('title', title || file.name);
        }
        form.append('uploadNote', note);
        await api.post(`/projects/${projectId}/assets/upload`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        if (!videoUrl) return;
        const body = { videoUrl, uploadNote: note };
        if (assetId) body.assetId = assetId;
        else {
          body.type = type;
          body.title = title;
        }
        await api.post(`/projects/${projectId}/assets/link`, body);
      }
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || (mode === 'upload' ? 'Upload failed.' : 'Could not link that file.'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="flex gap-4 text-sm border-b pb-2">
        <button type="button" onClick={() => setMode('upload')} className={mode === 'upload' ? 'font-medium border-b-2 border-gray-900 -mb-2 pb-2' : 'text-gray-500'}>
          Upload file
        </button>
        <button type="button" onClick={() => setMode('link')} className={mode === 'link' ? 'font-medium border-b-2 border-gray-900 -mb-2 pb-2' : 'text-gray-500'}>
          Link a file
        </button>
      </div>

      {mode === 'upload' ? (
        <div>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
            className="block w-full text-sm"
            required
          />
          <p className="text-xs text-gray-400 mt-1">
            Direct upload is limited to about 40MB. For larger videos or manuscripts, use "Link a file" instead.
          </p>
        </div>
      ) : (
        <div>
          <input
            placeholder="Google Drive, YouTube, or a direct file URL"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-full"
            required
          />
          <p className="text-xs text-gray-400 mt-1">
            Best for large videos or documents — plays/opens through the source's own viewer instead
            of going through our upload pipeline, so there's no size cap. Google Drive files must be
            shared "Anyone with the link". Note: unlike uploaded files, the linked URL is visible to
            whoever views the review portal, and the page-by-page flipbook/pinning view (PDFs) only
            works for directly uploaded files, not linked ones.
          </p>
        </div>
      )}

      {!assetId && (
        <>
          <select value={type} onChange={(e) => setType(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-full">
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <input
            placeholder="Title (optional — defaults to filename)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-full"
          />
        </>
      )}
      <input
        placeholder="Upload note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="border rounded-lg px-3 py-2 text-sm w-full"
      />
      <button
        type="submit"
        disabled={uploading || (mode === 'upload' ? !file : !videoUrl)}
        className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
      >
        {uploading ? (mode === 'upload' ? 'Uploading…' : 'Linking…') : assetId ? 'Add new version' : mode === 'upload' ? 'Upload' : 'Link'}
      </button>
    </form>
  );
}
