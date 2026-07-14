import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { setSession } from '../lib/api';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function signIn(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, passcode });
      setSession(data.token, 'team');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={signIn} className="bg-white shadow-sm border rounded-xl p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-1 text-center">Proof Vault</h1>
        <p className="text-gray-500 text-sm mb-6 text-center">Team sign-in</p>
        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
        <label className="block text-sm text-gray-600 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
        />
        <label className="block text-sm text-gray-600 mb-1">Passcode</label>
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          required
          className="w-full border rounded-lg px-3 py-2 text-sm mb-5"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gray-900 text-white rounded-lg py-2.5 font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
