import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import Nav from '../components/Nav';
import StatusBadge from '../components/StatusBadge';

export default function Dashboard() {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    load();
  }, []);

  function load() {
    api
      .get('/projects')
      .then(({ data }) => setProjects(data.projects))
      .catch(() => setError('Could not load projects.'));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Projects</h1>
          <button
            onClick={() => setShowNew(true)}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800"
          >
            New project
          </button>
        </div>

        {error && <div className="text-red-600 mb-4">{error}</div>}

        {projects === null && !error && <div className="text-gray-400">Loading…</div>}
        {projects?.length === 0 && (
          <div className="text-gray-400 border border-dashed rounded-xl py-16 text-center">
            No projects yet. Create your first one to get started.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects?.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="bg-white border rounded-xl p-5 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between mb-2">
                <h2 className="font-medium">{p.title}</h2>
                {p.overdue && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    Overdue
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-3">{p.authorName || p.authorEmail}</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{p.stage}</span>
                <span className="text-gray-500">
                  {p.approvedCount}/{p.assetCount} approved
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {showNew && (
        <NewProjectModal
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

function NewProjectModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', authorName: '', authorEmail: '', publisher: '', dueDate: '', brandPrimaryColor: '#111111',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/projects', form);
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create project.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <form onSubmit={submit} className="bg-white rounded-xl p-6 w-full max-w-md space-y-3">
        <h2 className="font-semibold text-lg mb-1">New project</h2>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <Field label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} required />
        <Field label="Author name" value={form.authorName} onChange={(v) => setForm({ ...form, authorName: v })} />
        <Field label="Author email" type="email" value={form.authorEmail} onChange={(v) => setForm({ ...form, authorEmail: v })} required />
        <DepartmentField value={form.publisher} onChange={(v) => setForm({ ...form, publisher: v })} />
        <Field label="Due date" type="date" value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function DepartmentField({ value, onChange }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600">Department</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
        required
      >
        <option value="" disabled>Select a department…</option>
        <option value="Publishing">Publishing</option>
        <option value="Marketing">Marketing</option>
      </select>
      <p className="text-xs text-gray-400 mt-1">
        Publishing: book covers, illustrations, book interior, proofreading, and other book production
        proofs. Marketing: website design, book trailers, magazine, billboard/video promotion, and
        other promotional proofs. This determines which proof types are offered when uploading.
      </p>
    </label>
  );
}

function Field({ label, value, onChange, type = 'text', required }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
      />
    </label>
  );
}
