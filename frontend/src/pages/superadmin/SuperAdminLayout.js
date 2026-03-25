import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Avatar,
  Divider,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  SpaceDashboard as SpaceDashboardIcon,
  Business as BusinessIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  Menu as MenuIcon,
  ReceiptLong as ReceiptLongIcon,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';

const DRAWER_WIDTH = 260;

const navSections = [
  {
    label: 'OVERVIEW',
    items: [
      { text: '대시보드', icon: <SpaceDashboardIcon />, path: '/superadmin' },
      { text: '사용량/비용', icon: <ReceiptLongIcon />, path: '/superadmin/billing' },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      { text: '테넌트 관리', icon: <BusinessIcon />, path: '/superadmin/tenants' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { text: '플랫폼 설정', icon: <SettingsIcon />, path: '/superadmin/settings' },
    ],
  },
];

function getInitials(email) {
  if (!email) return '?';
  return email.charAt(0).toUpperCase();
}

export default function SuperAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/superadmin/login');
  };

  const handleNavClick = (path) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const isActive = (path) => {
    if (path === '/superadmin') return location.pathname === '/superadmin';
    return location.pathname.startsWith(path);
  };

  const sidebarContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: '#111113',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* Font import */}
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
          @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        `}
      </style>

      {/* Brand */}
      <Box sx={{ px: 3, py: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {/* Teal signal dot */}
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: '#14B8A6',
            boxShadow: '0 0 12px rgba(20,184,166,0.5)',
            flexShrink: 0,
          }}
        />
        <Typography
          sx={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            color: '#FAFAFA',
            fontWeight: 800,
            fontSize: '1.1rem',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          ReadyTalk
        </Typography>
        <Box
          sx={{
            backgroundColor: 'rgba(20,184,166,0.15)',
            color: '#14B8A6',
            fontSize: '0.6rem',
            fontWeight: 700,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            borderRadius: '4px',
            px: 1,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            letterSpacing: '0.05em',
          }}
        >
          ADMIN
        </Box>
      </Box>

      {/* Navigation */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {navSections.map((section, sIdx) => (
          <Box key={section.label}>
            <Typography
              sx={{
                color: '#52525B',
                fontSize: '0.65rem',
                fontWeight: 700,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                px: 3,
                pt: sIdx > 0 ? 3 : 2,
                pb: 1,
              }}
            >
              {section.label}
            </Typography>
            <List disablePadding>
              {section.items.map((item) => {
                const active = isActive(item.path);
                return (
                  <ListItemButton
                    key={item.text}
                    onClick={() => handleNavClick(item.path)}
                    sx={{
                      borderRadius: '10px',
                      mx: 1.5,
                      mb: 0.5,
                      py: 1,
                      px: 1.5,
                      borderLeft: active
                        ? '3px solid #14B8A6'
                        : '3px solid transparent',
                      bgcolor: active
                        ? 'rgba(20,184,166,0.08)'
                        : 'transparent',
                      color: active ? '#14B8A6' : '#71717A',
                      '&:hover': {
                        bgcolor: active
                          ? 'rgba(20,184,166,0.12)'
                          : 'rgba(255,255,255,0.03)',
                        color: active ? '#14B8A6' : '#A1A1AA',
                        '& .MuiListItemIcon-root': {
                          color: active ? '#14B8A6' : '#A1A1AA',
                        },
                      },
                      '& .MuiListItemIcon-root': {
                        color: active ? '#14B8A6' : '#52525B',
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{
                        fontWeight: active ? 600 : 500,
                        fontSize: '0.875rem',
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                      }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      {/* User info */}
      <Box>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />
        <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            sx={{
              bgcolor: '#14B8A6',
              width: 28,
              height: 28,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#09090B',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            {getInitials(user?.email)}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                color: '#71717A',
                fontSize: '0.8rem',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.email}
            </Typography>
          </Box>
          <IconButton
            onClick={handleLogout}
            title="로그아웃"
            size="small"
            sx={{
              color: '#52525B',
              '&:hover': { color: '#EF4444', bgcolor: 'rgba(239,68,68,0.1)' },
            }}
          >
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      {/* Mobile top bar */}
      {isMobile && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 56,
            bgcolor: '#111113',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            px: 2,
            gap: 1.5,
            zIndex: (t) => t.zIndex.drawer + 1,
          }}
        >
          <IconButton
            onClick={() => setMobileOpen(true)}
            sx={{ color: '#FAFAFA' }}
          >
            <MenuIcon />
          </IconButton>
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#14B8A6',
              boxShadow: '0 0 12px rgba(20,184,166,0.5)',
            }}
          />
          <Typography
            sx={{
              color: '#FAFAFA',
              fontWeight: 700,
              fontSize: '1rem',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              letterSpacing: '-0.02em',
            }}
          >
            ReadyTalk
          </Typography>
        </Box>
      )}

      {/* Sidebar */}
      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              bgcolor: '#111113',
              borderRight: '1px solid rgba(255,255,255,0.06)',
            },
          }}
        >
          {sidebarContent}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              bgcolor: '#111113',
              borderRight: '1px solid rgba(255,255,255,0.06)',
            },
          }}
        >
          {sidebarContent}
        </Drawer>
      )}

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: '40px',
          mt: isMobile ? '56px' : 0,
          minHeight: '100vh',
          bgcolor: '#09090B',
          position: 'relative',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        {/* Ambient orb */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '100%',
            height: '100%',
            background:
              'radial-gradient(600px circle at 100% 0%, rgba(20,184,166,0.04) 0%, transparent 50%)',
            pointerEvents: 'none',
          }}
        />
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
