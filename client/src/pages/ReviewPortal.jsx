import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { isAuthenticated } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import AssetViewer from '../components/AssetViewer';
import ReviewerAssetViewer from '../components/ReviewerAssetViewer';
import AssetThumbnail from '../components/AssetThumbnail';

const TYPE_LABELS = {
  cover: 'Cover Art',
  interior: 'Interior Layout',
  trailer: 'Trailers',
  audio: 'Audiobook Samples',
  marketing: 'Marketing Assets',
  manuscript: 'Manuscript',
  other: 'Other',
};

export default function ReviewPortal() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [activeAssetId, setActiveAssetId] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }

    api
      .get('/auth/me')
      .then(({ data }) => {
        if (!['author', 'reviewer'].includes(data.role)) {
          navigate('/login');
          return;
        }
        setRole(data.role);
        load();
      })
      .catch(() => {
        setError('Unable to verify review session.');
      });
  }, [navigate]);

  function load() {
    api
      .get('/review/project')
      .then(({ data }) => {
        setData(data);
        setActiveAssetId((prev) => prev || data.assets[0]?.id || null);
      })
      .catch(() => setError('Could not load your review portal.'));
  }

  const groups = useMemo(() => {
    if (!data) return [];
    const byType = {};
    for (const a of data.assets) {
      (byType[a.type] ||= []).push(a);
    }
    return Object.entries(byType);
  }, [data]);

  const activeAsset = data?.assets.find((a) => a.id === activeAssetId);

  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600">{error}</div>;
  if (role === null || !data) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;

  const isReviewer = role === 'reviewer';
  const brandColor = data.project.brandPrimaryColor || '#111111';

  return (
    <div className="min-h-screen bg-gray-50" style={{ '--brand-color': brandColor }}>
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-3">
          {data.project.brandLogoUrl && (
            <img src={data.project.brandLogoUrl} alt="" className="h-8" />
          )}
          <div>
            <h1 className="font-semibold">{data.project.title}</h1>
            <p className="text-xs text-gray-500">{data.project.publisher}</p>
            <p className="text-[11px] text-gray-400 mt-1">{isReviewer ? 'Collaborator review view' : 'Author review view'}</p>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        <aside className="space-y-5">
          {groups.map(([type, assets]) => (
            <div key={type}>
              <h2 className="text-xs font-semibold uppercase text-gray-400 mb-2">{TYPE_LABELS[type] || type}</h2>
              <div className="space-y-1">
                {assets.map((a) => {
                  const latest = [...data.versions.filter((v) => v.assetId === a.id)].sort(
                    (x, y) => y.versionNumber - x.versionNumber
                  )[0];
                  return (
                    <button
                      key={a.id}
                      onClick={() => setActiveAssetId(a.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                        activeAssetId === a.id ? 'bg-white shadow-sm border' : 'hover:bg-white/60'
                      }`}
                    >
                      <AssetThumbnail
                        version={latest}
                        comments={data.comments.filter((c) => c.assetId === a.id)}
                        className="w-10 h-10 shrink-0"
                      />
                      <span className="truncate flex-1">{a.title}</span>
                      <StatusBadge status={a.status} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        <main>
          {activeAsset ? (
            isReviewer ? (
              <ReviewerAssetViewer
                asset={activeAsset}
                versions={data.versions.filter((v) => v.assetId === activeAsset.id)}
                comments={data.comments.filter((c) => c.assetId === activeAsset.id)}
                onChanged={load}
              />
            ) : (
              <AssetViewer
                asset={activeAsset}
                versions={data.versions.filter((v) => v.assetId === activeAsset.id)}
                comments={data.comments.filter((c) => c.assetId === activeAsset.id)}
                onChanged={load}
                role="author"
              />
            )
          ) : (
            <p className="text-gray-400">No proofs have been shared yet.</p>
          )}
        </main>
      </div>
    </div>
  );
}
