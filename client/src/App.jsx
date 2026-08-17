import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Explore from './pages/Explore.jsx';
import PromptDetail from './pages/PromptDetail.jsx';
import PromptEdit from './pages/PromptEdit.jsx';
import Profile from './pages/Profile.jsx';
import Mine from './pages/Mine.jsx';
import AuthPage from './pages/AuthPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import Feed from './pages/Feed.jsx';
import Notifications from './pages/Notifications.jsx';
import { useAuth } from './AuthContext.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Explore />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/prompt/:id" element={<PromptDetail />} />
        <Route path="/create" element={<RequireAuth><PromptEdit /></RequireAuth>} />
        <Route path="/edit/:id" element={<RequireAuth><PromptEdit /></RequireAuth>} />
        <Route path="/u/:username" element={<Profile />} />
        <Route path="/mine" element={<RequireAuth><Mine /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
