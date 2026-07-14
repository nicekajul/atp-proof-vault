import { useEffect, useState } from 'react';
import api from '../lib/api';

export default function LinksManager({ assets }) {
  const [links, setLinks] = useState([]);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    load();
  }, []);

  function load() {
    api.get('/links').then(({ data }) => setLinks(data.links)).catch(() => {});
  }

  async function revoke(token) {
    await api.patch(`/links/${token}/revoke`);
    load();
  }

  return (
    <div className="bg-white border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">Secure download links</h3>
        <button onClick={() => setShowNew(true)} className="text-sm text-gray-900 font-medium hover:underline">
          + Generate link
        </button>
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-gray-400">No links generated yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 font-normal">File</th>
              <th className="font-normal">Downloads</th>
              <th className="font-normal">Expires</th>
              <th className="font-normal">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.token} className="border-b last:border-0">
                <td className="py-2">{l.friendlyName}{l.hasPassword && <span className="ml-1 text-xs text-gray-400">🔒</span>}</td>
                <td>{l.downloadsUsed}{l.maxDownloads ? ` / ${l.maxDownloads}` : ''}</td>
                <td>{l.expiresAt ? new Date(l.expiresAt).toLocaleDateString() : '—'}</td>
                <td>{l.active ? <span className="text-green-700">Active</span> : <span className="text-gray-400">Revoked</span>}</td>
                <td className="text-right">
                  {l.active && (
                    <button onClick={() => revoke(l.token)} className="text-red-600 hover:underline text-xs">
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showNew && (
        <NewLinkModal
          assets={assets}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewLinkModal({ assets, onClose, onCreated }) {
  const versionOptions = assets.flatMap((a) =>
    (a.versions || []).map((v) => ({
      versionId: v.id,
      mimeType: v.mimeType,
      label: `${a.title} — v${v.versionNumber}`,
    }))
  );

  const [selected, setSelected] = useState(versionOptions[0]?.versionId || '');
  const [friendlyName, setFriendlyName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxDownloads, setMaxDownloads] = useState('');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const opt = versionOptions.find((o) => o.versionId === selected);
    if (!opt) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/links', {
        versionId: opt.versionId,
        friendlyName: friendlyName || opt.label,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        maxDownloads: maxDownloads ? Number(maxDownloads) : undefined,
        password: password || undefined,
      });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create link.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        {result ? (
          <div className="space-y-3">
            <h3 className="font-semibold">Link created</h3>
            <div className="bg-gray-50 border rounded-lg p-3 text-sm break-all">{result.url}</div>
            <p className="text-xs text-gray-500">
              {result.expiresAt ? (
                <>Expires <strong>{new Date(result.expiresAt).toLocaleString()}</strong></>
              ) : (
                'No expiration set — this link stays active until revoked.'
              )}
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(result.url)}
              className="text-sm text-gray-900 font-medium hover:underline"
            >
              Copy link
            </button>
            <div className="flex justify-end pt-2">
              <button onClick={() => { onCreated(); }} className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <h3 className="font-semibold mb-1">Generate secure link</h3>
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <label className="block text-sm">
              <span className="text-gray-600">File</span>
              <select value={selected} onChange={(e) => setSelected(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
                {versionOptions.map((o) => (
                  <option key={o.versionId} value={o.versionId}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Display filename</span>
              <input value={friendlyName} onChange={(e) => setFriendlyName(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-gray-600">Expires</span>
                <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Max downloads</span>
                <input type="number" min="1" value={maxDownloads} onChange={(e) => setMaxDownloads(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-gray-600">Password (optional)</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
              <button type="submit" disabled={saving || !versionOptions.length} className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white disabled:opacity-50">
                {saving ? 'Creating…' : 'Generate'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
