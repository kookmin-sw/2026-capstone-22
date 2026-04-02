import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UploadProvider } from './context/UploadContext';
import { tenantAPI, superadminAPI } from './services/api';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import ChatPage from './pages/ChatPage';
import AdminPage from './pages/AdminPage';
import CalendarPage from './pages/CalendarPage';
import TenantAdminLayout from './pages/TenantAdminLayout';
import SuperAdminLayout from './pages/superadmin/SuperAdminLayout';
import DashboardPage from './pages/superadmin/DashboardPage';
import TenantsPage from './pages/superadmin/TenantsPage';
import TenantCreatePage from './pages/superadmin/TenantCreatePage';
import TenantDetailPage from './pages/superadmin/TenantDetailPage';
import SettingsPage from './pages/superadmin/SettingsPage';
import BillingPage from './pages/superadmin/BillingPage';
import SuperAdminLogin from './pages/superadmin/SuperAdminLogin';
import UploadProgress from './components/UploadProgress';
import { TenantProvider } from './context/TenantContext';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2563eb', // Sophisticated distinct blue
      light: '#60a5fa',
      dark: '#1d4ed8',
    },
    secondary: {
      main: '#4338ca', // Indigo
      light: '#818cf8',
      dark: '#312e81',
    },
    background: {
      default: '#f8fafc', // Very subtle cool gray
      paper: '#ffffff',
    },
    text: {
      primary: '#0f172a', // Slate 900
      secondary: '#64748b', // Slate 500
    },
  },
  typography: {
    fontFamily: '"Inter", "Pretendard", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700, letterSpacing: '-0.025em' },
    h2: { fontWeight: 700, letterSpacing: '-0.025em' },
    h3: { fontWeight: 700, letterSpacing: '-0.025em' },
    h4: { fontWeight: 600, letterSpacing: '-0.025em' },
    h5: { fontWeight: 600, letterSpacing: '-0.025em' },
    h6: { fontWeight: 600, letterSpacing: '-0.015em' },
    button: { fontWeight: 600, textTransform: 'none' },
  },
  shape: {
    borderRadius: 4, // MUI default
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          },
        },
        containedPrimary: {
          backgroundImage: 'linear-gradient(135deg, #2563eb, #3b82f6)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0px 2px 8px rgba(15, 23, 42, 0.04), 0px 8px 24px rgba(15, 23, 42, 0.04)', // Refined enterprise shadow
          border: '1px solid rgba(226, 232, 240, 0.8)',
          backgroundImage: 'none',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          color: '#0f172a',
          backdropFilter: 'blur(12px)', // Glassmorphism
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
          borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#ffffff',
          borderRight: '1px solid rgba(226, 232, 240, 0.8)',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          color: '#64748b',
          backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
        },
        root: {
          borderBottom: '1px solid #f1f5f9',
          padding: '16px 24px',
        },
      },
    },
  },
});

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const { slug } = useParams();

  if (loading) return <div>Loading...</div>;
  return user ? children : <Navigate to={`/${slug}/login`} />;
};

const AdminRoute = ({ children }) => {
  const { user, loading, impersonating } = useAuth();
  const { slug } = useParams();
  const [autoImpersonating, setAutoImpersonating] = useState(false);

  const needsAutoImpersonation = user && user.is_superadmin && !impersonating && slug;

  useEffect(() => {
    if (needsAutoImpersonation && !autoImpersonating) {
      setAutoImpersonating(true);
      (async () => {
        try {
          const tenantRes = await tenantAPI.getPublicInfo(slug);
          const tenantId = tenantRes.data.id;
          const impRes = await superadminAPI.impersonateTenant(tenantId);
          const { impersonation_token } = impRes.data;
          sessionStorage.setItem('access_token', impersonation_token);
          sessionStorage.setItem('impersonating', 'true');
          window.location.reload();
        } catch (e) {
          console.error('Auto-impersonation failed:', e);
          setAutoImpersonating(false);
        }
      })();
    }
  }, [needsAutoImpersonation, slug, autoImpersonating]);

  if (loading || needsAutoImpersonation || autoImpersonating) return <div>Loading...</div>;
  if (!user) return <Navigate to={`/${slug}/login`} />;
  if (!user.is_admin && !user.is_superadmin) return <Navigate to={`/${slug}`} />;
  return children;
};

const SuperAdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/superadmin/login" />;
  if (!user.is_superadmin) return <Navigate to="/" />;
  return children;
};

const TenantLayout = () => {
  return (
    <TenantProvider>
      <Outlet />
    </TenantProvider>
  );
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <UploadProvider>
            <Routes>
              {/* Root redirect to default tenant */}
              <Route path="/" element={<Navigate to="/superadmin/login" />} />
              
              {/* Super Admin Routes */}
              <Route path="/superadmin/login" element={<SuperAdminLogin />} />
              <Route
                path="/superadmin"
                element={
                  <SuperAdminRoute>
                    <SuperAdminLayout />
                  </SuperAdminRoute>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="tenants" element={<TenantsPage />} />
                <Route path="tenants/new" element={<TenantCreatePage />} />
                <Route path="tenants/:tenantId" element={<TenantDetailPage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              {/* Tenant Routes */}
              <Route path="/:slug" element={<TenantLayout />}>
                <Route path="login" element={<Login />} />
                <Route path="register" element={<Register />} />
                {/* Calendar is public (accessible without login, e.g. from KakaoTalk) */}
                <Route path="calendar" element={<CalendarPage />} />
                {/* All authenticated routes use TenantAdminLayout sidebar */}
                <Route element={<PrivateRoute><TenantAdminLayout /></PrivateRoute>}>
                  <Route index element={<ChatPage />} />
                  <Route path="admin" element={<AdminRoute><AdminPage section="dashboard" /></AdminRoute>} />
                  <Route path="admin/dashboard" element={<AdminRoute><AdminPage section="dashboard" /></AdminRoute>} />
                  <Route path="admin/hitl" element={<AdminRoute><AdminPage section="hitl" /></AdminRoute>} />
                  <Route path="admin/stores" element={<AdminRoute><AdminPage section="stores" /></AdminRoute>} />
                  <Route path="admin/users" element={<AdminRoute><AdminPage section="users" /></AdminRoute>} />
                  <Route path="admin/templates" element={<AdminRoute><AdminPage section="templates" /></AdminRoute>} />
                  <Route path="admin/calendar" element={<AdminRoute><AdminPage section="calendar" /></AdminRoute>} />
                  <Route path="admin/chatbot" element={<AdminRoute><AdminPage section="chatbot" /></AdminRoute>} />
                  <Route path="admin/chat-history" element={<AdminRoute><AdminPage section="chat-history" /></AdminRoute>} />
                </Route>
              </Route>
            </Routes>
            <UploadProgress />
          </UploadProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
