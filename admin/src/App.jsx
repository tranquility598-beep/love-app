import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { useAuth } from './auth/useAuth.js';
import AppLayout from './components/AppLayout.jsx';
import PageLoader from './components/PageLoader.jsx';
import GlobalTooltips from './components/GlobalTooltips.jsx';
import { LocaleProvider } from './i18n/LocaleContext.jsx';
import AdminSocketProvider from './realtime/AdminSocketProvider.jsx';

const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const SecuritySetupPage = lazy(() => import('./pages/SecuritySetupPage.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));
const ModerationPage = lazy(() => import('./pages/ModerationPage.jsx'));
const CasesPage = lazy(() => import('./pages/CasesPage.jsx'));
const CommunityPage = lazy(() => import('./pages/CommunityPage.jsx'));
const TeamPage = lazy(() => import('./pages/TeamPage.jsx'));
const ServersPage = lazy(() => import('./pages/ServersPage.jsx'));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage.jsx'));
const AuditPage = lazy(() => import('./pages/AuditPage.jsx'));
const InfrastructurePage = lazy(() => import('./pages/InfrastructurePage.jsx'));
const DocumentationPage = lazy(() => import('./pages/DocumentationPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const StaffCommsPage = lazy(() => import('./pages/StaffCommsPage.jsx'));

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader label="Проверяем сессию" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.adminTotpEnabled) return <Navigate to="/security-setup" replace />;
  const policyPending = user.adminPolicyRequiredVersion && user.adminPolicyAcceptedVersion !== user.adminPolicyRequiredVersion;
  if (policyPending && !location.pathname.startsWith('/documentation')) return <Navigate to="/documentation/start" replace />;
  return <AppLayout />;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  return (
    <Suspense fallback={<PageLoader label="Загружаем раздел" />}>
      <Routes>
        <Route path="/login" element={loading ? <PageLoader /> : user ? <Navigate to={user.adminTotpEnabled ? '/' : '/security-setup'} replace /> : <LoginPage />} />
        <Route path="/security-setup" element={loading ? <PageLoader /> : !user ? <Navigate to="/login" replace /> : user.adminTotpEnabled ? <Navigate to="/" replace /> : <SecuritySetupPage />} />
        <Route element={<ProtectedRoutes />}>
          <Route index element={<DashboardPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="moderation" element={<ModerationPage />} />
          <Route path="cases" element={<CasesPage />} />
          <Route path="community" element={<CommunityPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="staff-comms" element={<StaffCommsPage />} />
          <Route path="servers" element={<ServersPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="infrastructure" element={<InfrastructurePage />} />
          <Route path="documentation/*" element={<DocumentationPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <LocaleProvider>
        <AuthProvider>
          <AdminSocketProvider>
            <GlobalTooltips />
            <AppRoutes />
          </AdminSocketProvider>
        </AuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  );
}
