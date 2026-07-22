import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../lib/api';
import Nav from '../components/Nav';
import StatusBadge from '../components/StatusBadge';
import AssetUploadForm from '../components/AssetUploadForm';
import TeamAssetViewer from '../components/TeamAssetViewer';
import AssetThumbnail from '../components/AssetThumbnail';
import LinksManager from '../components/LinksManager';
import { exportCertificate } from '../lib/certificate';

const STAGES = ['Manuscript', 'Editing', 'Cover Design', 'Interior Layout', 'Proof Review', 'Approved', 'Delivered'];

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [assets, setAssets] = useState([]);
  const [activity, setActivity] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showReviewerInvite, setShowReviewerInvite] = useState(false);
  const [invite, setInvite] = useState(null);
  const [tab, setTab] = useState('assets');

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (tab === 'activity') loadActivity();
  }, [tab, id]);

  // Full reload: project (title/stage/author) + assets. Used on first load
  // and after anything that could touch the project itself (stage change).
  function load() {
    api.get(`/projects/${id}`).then(({ data }) => setProject(data.project)).catch(() => setLoadError(true));
    loadAssets();
  }

  // Most actions (upload, delete, comment, approve) only change the assets
  // list, not the project record or activity log — refreshing just this
  // avoids two extra round trips on every single interaction.
  function loadAssets() {
    api.get(`/projects/${id}/assets`).then(({ data }) => setAssets(data.assets)).catch(() => {});
  }

  // Activity is its own tab and isn't shown anywhere else, so it's only
  // fetched when that tab is actually opened rather than on every load.
  function loadActivity() {
    api.get(`/projects/${id}/activity`).then(({ data }) => setActivity(data.activity)).catch(() => {});
  }

  async function downloadCertificate() {
    try {
      await exportCertificate(id);
    } catch {
      alert('Could not generate the certificate. Please try again.');
    }
  }

  async function updateStage(stage) {
    await api.patch(`/projects/${id}`, { stage });
    load();
  }

  async function generateInvite(expiresAt) {
    const { data } = await api.post(`/projects/${id}/invite`, expiresAt ? { expiresAt } : {});
    setShowInvite(false);
    setInvite({ ...data, label: 'Author review link' });
  }

  async function generateReviewerInvite(expiresAt) {
    const { data } = await api.post(`/projects/${id}/invite-reviewer`, expiresAt ? { expiresAt } : {});
    setShowReviewerInvite(false);
    setInvite({ ...data, label: 'Collaborator review link' });
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <div className="max-w-6xl mx-auto px-6 py-8 text-gray-400">
          {loadError ? 'Could not load this project.' : 'Loading…'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{project.title}</h1>
            <p className="text-gray-500 text-sm">{project.authorName} · {project.authorEmail}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowInvite(true)} className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-100">
              Generate author review link
            </button>
            <button onClick={() => setShowReviewerInvite(true)} className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-100">
              Generate collaborator link
            </button>
            <button onClick={downloadCertificate} className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-100">
              Export approval certificate
            </button>
          </div>
        </div>

        <StageTracker current={project.stage} onChange={updateStage} />

        <div className="flex gap-4 border-b mt-8 mb-5 text-sm">
          {['assets', 'links', 'activity'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 -mb-px capitalize ${tab === t ? 'border-b-2 border-gray-900 font-medium' : 'text-gray-500'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'assets' && (
          <div>
            <div className="flex justify-end mb-3">
              <button onClick={() => setShowUpload(true)} className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg">
                Upload proof
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {assets.map((a) => (
                <AssetCard key={a.id} asset={a} onUploaded={loadAssets} />
              ))}
              {assets.length === 0 && <p className="text-gray-400">No proofs uploaded yet.</p>}
            </div>
          </div>
        )}

        {tab === 'links' && <LinksManager assets={assets} />}

        {tab === 'activity' && (
          <div className="bg-white border rounded-xl divide-y">
            {activity.map((a) => (
              <div key={a.id} className="p-3 text-sm flex justify-between">
                <span>{a.message}</span>
                <span className="text-gray-400">{new Date(a.createdAt).toLocaleString()}</span>
              </div>
            ))}
            {activity.length === 0 && <p className="p-4 text-gray-400 text-sm">No activity yet.</p>}
          </div>
        )}
      </div>

      {showUpload && (
        <UploadModal
          projectId={id}
          department={project.publisher}
          onClose={() => setShowUpload(false)}
          onDone={() => { setShowUpload(false); loadAssets(); }}
        />
      )}

      {showInvite && (
        <InviteOptionsModal title="Generate author review link" onCancel={() => setShowInvite(false)} onGenerate={generateInvite} />
      )}
      {showReviewerInvite && (
        <InviteOptionsModal title="Generate collaborator review link" onCancel={() => setShowReviewerInvite(false)} onGenerate={generateReviewerInvite} />
      )}
      {invite && <InviteLinkModal invite={invite} onClose={() => setInvite(null)} />}
    </div>
  );
}

function InviteOptionsModal({ title, onCancel, onGenerate }) {
  const [days, setDays] = useState(14);

  function submit(e) {
    e.preventDefault();
    const expiresAt = new Date(Date.now() + Number(days) * 86400000).toISOString();
    onGenerate(expiresAt);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <form onSubmit={submit} className="bg-white rounded-xl p-6 w-full max-w-sm space-y-3">
        <h3 className="font-semibold">{title}</h3>
        <label className="block text-sm">
          <span className="text-gray-600">Expires in (days)</span>
          <input
            type="number"
            min="1"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            required
          />
        </label>
        <p className="text-xs text-gray-400">
          The link stops working after this — generate a new one if the recipient needs more time.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white">
            Generate
          </button>
        </div>
      </form>
    </div>
  );
}

function InviteLinkModal({ invite, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-3">
        <h3 className="font-semibold">Review link ready</h3>
        <p className="text-sm text-gray-500">
          Share this link with the recipient yourself (email, Slack, etc). It's private to this project.
        </p>
        <div className="bg-gray-50 border rounded-lg p-3 text-sm break-all">{invite.url}</div>
        <p className="text-xs text-gray-500 font-medium">{invite.label}</p>
        <p className="text-xs text-gray-500">
          Expires <strong>{new Date(invite.expiresAt).toLocaleString()}</strong>
        </p>
        <button
          onClick={() => {
            navigator.clipboard.writeText(invite.url);
            setCopied(true);
          }}
          className="text-sm text-gray-900 font-medium hover:underline"
        >
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function StageTracker({ current, onChange }) {
  const idx = STAGES.indexOf(current);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <h2 className="text-sm font-medium text-gray-700">Production stage</h2>
        <span className="text-xs text-gray-400">
          Whole-project pipeline, not tied to any single proof — skip stages that don't apply
        </span>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STAGES.map((s, i) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap border ${
              i <= idx ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function AssetCard({ asset, onUploaded }) {
  const [showVersion, setShowVersion] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [busy, setBusy] = useState(false);
  const sortedVersions = [...(asset.versions || [])].sort((a, b) => b.versionNumber - a.versionNumber);
  const latest = sortedVersions[0];

  async function deleteAsset() {
    if (!window.confirm(`Delete "${asset.title}" and all its versions? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api.delete(`/assets/${asset.id}`);
      onUploaded();
    } finally {
      setBusy(false);
    }
  }

  async function deleteVersion(versionId, versionNumber) {
    if (sortedVersions.length === 1) {
      window.alert('This is the only version — delete the whole proof instead.');
      return;
    }
    if (!window.confirm(`Delete v${versionNumber}? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api.delete(`/assets/${asset.id}/versions/${versionId}`);
      onUploaded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex items-start justify-between mb-2 cursor-pointer" onClick={() => setShowViewer(true)}>
        <div>
          <h3 className="font-medium">{asset.title}</h3>
          <p className="text-xs text-gray-400 uppercase tracking-wide">{asset.type}</p>
        </div>
        <StatusBadge status={asset.status} />
      </div>
      {latest && (
        <>
          <AssetThumbnail
            version={latest}
            comments={asset.comments}
            className="h-32 mb-2 cursor-pointer"
            onClick={() => setShowViewer(true)}
          />
          <p className="text-xs text-gray-500 mb-2 cursor-pointer" onClick={() => setShowViewer(true)}>
            v{latest.versionNumber} · {(latest.fileSize / 1024).toFixed(0)} KB · {new Date(latest.createdAt).toLocaleDateString()}
          </p>
        </>
      )}
      {asset.comments?.length > 0 && (
        <div className="text-xs text-gray-600 border-t pt-2 mt-2 space-y-1 cursor-pointer" onClick={() => setShowViewer(true)}>
          {asset.comments.slice(-2).map((c) => (
            <p key={c.id}>
              <span className="font-medium">{c.authorName}:</span> {c.body}
              {c.posX !== '' && (
                <span className="text-gray-400">
                  {' '}{c.page !== '' && c.page !== undefined ? `(p. ${c.page}, pinned — click to view)` : '(pinned on image — click to view)'}
                </span>
              )}
            </p>
          ))}
        </div>
      )}

      {showVersions && sortedVersions.length > 1 && (
        <div className="text-xs border-t pt-2 mt-2 space-y-1">
          {sortedVersions.map((v) => (
            <div key={v.id} className="flex items-center justify-between text-gray-500">
              <span>v{v.versionNumber} · {new Date(v.createdAt).toLocaleDateString()}</span>
              <button disabled={busy} onClick={() => deleteVersion(v.id, v.versionNumber)} className="text-red-600 hover:underline disabled:opacity-50">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <div className="flex gap-3">
          <button onClick={() => setShowVersion(true)} className="text-xs text-gray-900 font-medium hover:underline">
            Upload new version
          </button>
          {sortedVersions.length > 1 && (
            <button onClick={() => setShowVersions((s) => !s)} className="text-xs text-gray-500 hover:underline">
              {showVersions ? 'Hide versions' : 'Manage versions'}
            </button>
          )}
        </div>
        <button disabled={busy} onClick={deleteAsset} className="text-xs text-red-600 hover:underline disabled:opacity-50">
          Delete proof
        </button>
      </div>

      {showVersion && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <h3 className="font-semibold mb-3">New version — {asset.title}</h3>
            <AssetUploadForm
              projectId={asset.projectId}
              assetId={asset.id}
              onDone={() => { setShowVersion(false); onUploaded(); }}
            />
            <button onClick={() => setShowVersion(false)} className="text-sm text-gray-500 mt-3 hover:underline">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showViewer && (
        <TeamAssetViewer asset={asset} onClose={() => setShowViewer(false)} onChanged={onUploaded} />
      )}
    </div>
  );
}

function UploadModal({ projectId, department, onClose, onDone }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm">
        <h3 className="font-semibold mb-3">Upload proof</h3>
        <AssetUploadForm projectId={projectId} department={department} onDone={onDone} />
        <button onClick={onClose} className="text-sm text-gray-500 mt-3 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
