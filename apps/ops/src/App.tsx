import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { http, type Me } from './lib/api';
import { homeFor, useAuth, useBranch } from './lib/auth';
import { Spinner, Toaster } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { PosPage } from './pages/PosPage';
import { KdsPage } from './pages/KdsPage';
import { WaiterPage } from './pages/WaiterPage';
import { AdminLayout } from './layouts/AdminLayout';
import { DashboardPage } from './pages/admin/DashboardPage';
import { FloorPage } from './pages/admin/FloorPage';
import { MenuPage } from './pages/admin/MenuPage';
import { StaffPage } from './pages/admin/StaffPage';
import { QrPage } from './pages/admin/QrPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { InventoryPage } from './pages/admin/InventoryPage';
import { ReportsPage } from './pages/admin/ReportsPage';
import { OrdersPage } from './pages/admin/OrdersPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { PlatformPage } from './pages/PlatformPage';
import { RegisterPage } from './pages/RegisterPage';

export function App() {
  const token = useAuth((s) => s.token);
  const me = useAuth((s) => s.me);
  const setMe = useAuth((s) => s.setMe);
  const logout = useAuth((s) => s.logout);
  const [booting, setBooting] = useState(!!token && !me);

  useEffect(() => {
    if (!token || me) {
      setBooting(false);
      return;
    }
    setBooting(true);
    http<{ user: Me }>('/auth/me')
      .then((r) => setMe(r.user))
      .catch(() => logout())
      .finally(() => setBooting(false));
  }, [token, me, setMe, logout]);

  if (booting) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={token && me ? <Home /> : <LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<Guard><Home /></Guard>} />
        <Route path="/onboarding" element={<Guard perm="branch.manage"><OnboardingPage /></Guard>} />
        <Route path="/pos" element={<Guard perm="orders.view"><PosPage /></Guard>} />
        <Route path="/kitchen" element={<Guard perm="kds.kitchen"><KdsPage display="kitchen" /></Guard>} />
        <Route path="/bar" element={<Guard perm="kds.bar"><KdsPage display="bar" /></Guard>} />
        <Route path="/waiter" element={<Guard perm="orders.view"><WaiterPage /></Guard>} />
        <Route path="/platform" element={<Guard platform><PlatformPage /></Guard>} />
        <Route path="/admin" element={<Guard><AdminLayout /></Guard>}>
          <Route index element={<Guard perm="reports.view"><DashboardPage /></Guard>} />
          <Route path="orders" element={<Guard perm="orders.view"><OrdersPage /></Guard>} />
          <Route path="floor" element={<Guard perm="floor.manage"><FloorPage /></Guard>} />
          <Route path="menu" element={<Guard perm="menu.manage"><MenuPage /></Guard>} />
          <Route path="staff" element={<Guard perm="staff.manage"><StaffPage /></Guard>} />
          <Route path="qr" element={<Guard perm="qr.manage"><QrPage /></Guard>} />
          <Route path="inventory" element={<Guard perm="inventory.view"><InventoryPage /></Guard>} />
          <Route path="reports" element={<Guard perm="reports.view"><ReportsPage /></Guard>} />
          <Route path="settings" element={<Guard perm="settings.manage"><SettingsPage /></Guard>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}

function Home() {
  const me = useAuth((s) => s.me);
  const branch = useBranch();
  if (!me) return <Navigate to="/login" replace />;
  if (branch && !branch.onboarding_completed && branch.permissions.includes('branch.manage')) return <Navigate to="/onboarding" replace />;
  return <Navigate to={homeFor(branch?.role, me.is_platform_admin)} replace />;
}

function Guard({ children, perm, platform }: { children: React.ReactNode; perm?: string; platform?: boolean }) {
  const token = useAuth((s) => s.token);
  const me = useAuth((s) => s.me);
  const branch = useBranch();
  const loc = useLocation();
  if (!token || !me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (platform && !me.is_platform_admin) return <Forbidden />;
  if (perm && !branch?.permissions.includes(perm)) return <Forbidden />;
  return <>{children}</>;
}

function Forbidden() {
  const me = useAuth((s) => s.me);
  const branch = useBranch();
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
      <div>
        <div className="text-lg font-semibold">Нямате достъп до този модул</div>
        <p className="mt-1 text-sm text-muted">Вашата роля ({branch?.role_label ?? '—'}) няма нужните права.</p>
        <a href={homeFor(branch?.role, !!me?.is_platform_admin)} className="mt-4 inline-block text-sm font-semibold text-accent">
          Към моя модул →
        </a>
      </div>
    </div>
  );
}
