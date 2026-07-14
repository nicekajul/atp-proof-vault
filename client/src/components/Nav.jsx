import { Link, useNavigate } from 'react-router-dom';
import { clearSession, getEmail } from '../lib/api';

export default function Nav() {
  const navigate = useNavigate();
  const email = getEmail();
  return (
    <nav className="border-b bg-white">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="font-semibold tracking-tight">
          Proof Vault
        </Link>
        <div className="flex items-center gap-3">
          {email && <span className="text-sm text-gray-500">{email}</span>}
          <button
            onClick={() => {
              clearSession();
              navigate('/login');
            }}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
