import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { getRole, isAuthenticated } from './lib/api';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const ReviewEntry = lazy(() => import('./pages/ReviewEntry'));
const ReviewPortal = lazy(() => import('./pages/ReviewPortal'));

function TeamRoute({ children }) {
  if (!isAuthenticated() || getRole() !== 'team') return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<TeamRoute><Dashboard /></TeamRoute>} />
        <Route path="/projects/:id" element={<TeamRoute><ProjectDetail /></TeamRoute>} />

        <Route path="/review/:token" element={<ReviewEntry />} />
        <Route path="/portal" element={<ReviewPortal />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
