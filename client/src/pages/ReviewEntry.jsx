import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { clearSession, setSession } from '../lib/api';

export default function ReviewEntry() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    clearSession();
    api
      .get(`/auth/review/${token}`)
      .then(({ data }) => {
        setSession(data.token, data.role || 'author');
        navigate('/portal', { replace: true });
      })
      .catch((err) => setError(err.response?.data?.error || 'This link is invalid or has expired.'));
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      {error ? (
        <div className="text-center">
          <p className="text-red-600 mb-1">{error}</p>
          <p className="text-gray-400 text-sm">Please ask the production team to resend your invite.</p>
        </div>
      ) : (
        <p className="text-gray-500">Opening your review portal…</p>
      )}
    </div>
  );
}
