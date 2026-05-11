import React, { useState, useEffect, useCallback } from 'react';
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
  Button,
  TextField,
} from '@mui/material';
import {
  Science as ScienceIcon,
  Folder as FolderIcon,
  People as PeopleIcon,
  Article as ArticleIcon,
  CalendarMonth as CalendarIcon,
  SmartToy as SmartToyIcon,
  Logout as LogoutIcon,
  Menu as MenuIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Search as SearchIcon,
  Close as CloseIcon,
  ChatBubbleOutline as ChatBubbleOutlineIcon,
  History as HistoryIcon,
  Dashboard as DashboardIcon,
  SupportAgent as SupportAgentIcon,
  School as SchoolIcon,
  Quiz as QuizIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { chatAPI } from '../services/api';

const DRAWER_WIDTH = 260;

function getInitials(email) {
  if (!email) return '?';
  return email.charAt(0).toUpperCase();
}

export default function TenantAdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, impersonating, exitImpersonation } = useAuth();
  const { currentSlug } = useTenant();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  // Chat sidebar state
  const [chatSessions, setChatSessions] = useState([]);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [hoveredSessionId, setHoveredSessionId] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  const basePath = `/${currentSlug}`;

  const isChatPage = location.pathname === basePath || location.pathname === basePath + '/';

  const navSections = [
    {
      label: 'PLAYGROUND',
      items: [
        { text: '채팅', icon: <ScienceIcon />, path: basePath },
      ],
    },
    {
      label: 'MANAGEMENT',
      items: [
        { text: '대시보드', icon: <DashboardIcon />, path: `${basePath}/admin/dashboard` },
        { text: '상담 대기', icon: <SupportAgentIcon />, path: `${basePath}/admin/hitl` },
        { text: '채팅 내역', icon: <HistoryIcon />, path: `${basePath}/admin/chat-history` },
        { text: '문서 저장소', icon: <FolderIcon />, path: `${basePath}/admin/stores` },
        { text: '그룹 & 유저', icon: <PeopleIcon />, path: `${basePath}/admin/users` },
        { text: '학생 관리', icon: <SchoolIcon />, path: `${basePath}/admin/students/classes` },
        { text: '문제 분석', icon: <QuizIcon />, path: `${basePath}/admin/exam-analysis` },
        { text: '프롬프트 템플릿', icon: <ArticleIcon />, path: `${basePath}/admin/templates` },
      ],
    },
    {
      label: 'SETTINGS',
      items: [
        { text: '캘린더 연동', icon: <CalendarIcon />, path: `${basePath}/admin/calendar` },
        { text: '챗봇 설정', icon: <SmartToyIcon />, path: `${basePath}/admin/chatbot` },
      ],
    },
  ];

  const loadChatSessions = useCallback(async () => {
    try {
      const response = await chatAPI.getSessions();
      setChatSessions(response.data);
    } catch (error) {
      console.error('세션 로딩 오류:', error);
    }
  }, []);

  useEffect(() => {
    if (isChatPage) {
      loadChatSessions();
    }
  }, [isChatPage, loadChatSessions]);

  const createNewChat = () => {
    setCurrentSessionId(null);
  };

  const loadChatSession = (sessionId) => {
    setCurrentSessionId(sessionId);
    if (isMobile) setMobileOpen(false);
  };

  const deleteChatSession = async (sessionId, e) => {
    e.stopPropagation();
    if (!window.confirm('이 대화를 삭제하시겠습니까?')) return;

    try {
      await chatAPI.deleteSession(sessionId);
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
      }
      loadChatSessions();
    } catch (error) {
      console.error('세션 삭제 오류:', error);
      alert('대화 삭제에 실패했습니다.');
    }
  };

  const handleLogout = () => {
    logout();
    navigate(`${basePath}/login`);
  };

  const handleNavClick = (path) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const isActive = (path) => {
    if (path === basePath) return location.pathname === basePath || location.pathname === `${basePath}/`;
    if (path === `${basePath}/admin/students/classes`) {
      return location.pathname.startsWith(`${basePath}/admin/students`);
    }
    return location.pathname.startsWith(path);
  };

  const isAdmin = user?.is_admin || user?.is_superadmin;

  const filteredSessions = chatSearchQuery
    ? chatSessions.filter(s => s.title?.toLowerCase().includes(chatSearchQuery.toLowerCase()))
    : chatSessions;

  const chatSidebarContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: '#FFFFFF',
        borderRight: '1px solid rgba(0,0,0,0.08)',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* Font import */}
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
          @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        `}
      </style>

      {/* Back button + Brand */}
      <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
        {isAdmin && (
          <Box
            onClick={() => handleNavClick(`${basePath}/admin/stores`)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              cursor: 'pointer',
              px: 1,
              py: 0.75,
              borderRadius: '8px',
              mb: 1.5,
              '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
            }}
          >
            <ArrowBackIcon sx={{ fontSize: 16, color: '#64748B' }} />
            <Typography
              sx={{
                color: '#64748B',
                fontSize: '0.75rem',
                fontWeight: 600,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              콘솔로 돌아가기
            </Typography>
          </Box>
        )}

        {/* New Chat Button */}
        <Button
          fullWidth
          variant="contained"
          startIcon={<AddIcon sx={{ fontSize: 18 }} />}
          onClick={createNewChat}
          sx={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8a 100%)',
            },
            fontWeight: 600,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            py: 1,
            borderRadius: '10px',
            textTransform: 'none',
            fontSize: '0.875rem',
            boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
          }}
        >
          New Chat
        </Button>

        {/* Search */}
        <Box
          sx={{
            mt: 1.5,
            px: 1.5,
            py: 1,
            bgcolor: 'rgba(0,0,0,0.04)',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            transition: 'all 0.2s ease',
            '&:focus-within': {
              borderColor: 'rgba(167, 139, 250, 0.3)',
              bgcolor: 'rgba(0,0,0,0.03)',
            },
          }}
        >
          <SearchIcon sx={{ color: '#94A3B8', fontSize: 18 }} />
          <TextField
            fullWidth
            placeholder="Search conversations..."
            value={chatSearchQuery}
            onChange={(e) => setChatSearchQuery(e.target.value)}
            variant="standard"
            InputProps={{
              disableUnderline: true,
            }}
            sx={{
              '& .MuiInputBase-input': {
                color: '#1E293B',
                fontSize: '0.8125rem',
                fontWeight: 400,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                padding: 0,
                '&::placeholder': {
                  color: '#94A3B8',
                  opacity: 1,
                },
              },
            }}
          />
        </Box>
      </Box>

      {/* Session List */}
      <Box sx={{
        flex: 1,
        overflow: 'auto',
        py: 1,
        px: 1,
        '&::-webkit-scrollbar': {
          width: '6px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'rgba(167, 139, 250, 0.05)',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '3px',
          '&:hover': {
            background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8a 100%)',
          },
        },
      }}>
        {/* RECENT Section */}
        {filteredSessions.filter((s, i) => i < 3).length > 0 && (
          <>
            <Box
              sx={{
                px: 1.5,
                py: 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <HistoryIcon sx={{ fontSize: 12, color: '#94A3B8' }} />
              <Typography
                sx={{
                  color: '#94A3B8',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                }}
              >
                RECENT
              </Typography>
            </Box>
            <List disablePadding sx={{ mb: 1 }}>
              {filteredSessions.slice(0, 3).map((session) => {
                const active = currentSessionId === session.id;
                return (
                  <ListItemButton
                    key={session.id}
                    onClick={() => loadChatSession(session.id)}
                    onMouseEnter={() => setHoveredSessionId(session.id)}
                    onMouseLeave={() => setHoveredSessionId(null)}
                    sx={{
                      borderRadius: '10px',
                      mx: 0.5,
                      mb: 0.5,
                      py: 0.75,
                      px: 1.5,
                      minHeight: 'auto',
                      position: 'relative',
                      borderLeft: active ? '3px solid #a78bfa' : '3px solid transparent',
                      bgcolor: active ? 'rgba(167,139,250,0.08)' : 'transparent',
                      '&:hover': {
                        bgcolor: active ? 'rgba(167,139,250,0.12)' : 'rgba(0,0,0,0.04)',
                      },
                    }}
                  >
                    <ChatBubbleOutlineIcon sx={{ fontSize: 14, color: '#a78bfa', mr: 1, flexShrink: 0 }} />
                    <ListItemText
                      primary={session.title}
                      primaryTypographyProps={{
                        fontSize: '0.75rem',
                        fontWeight: active ? 600 : 500,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        color: active ? '#a78bfa' : '#475569',
                        noWrap: true,
                      }}
                      sx={{ pr: hoveredSessionId === session.id ? 4 : 0 }}
                    />
                    {hoveredSessionId === session.id && (
                      <IconButton
                        size="small"
                        onClick={(e) => deleteChatSession(session.id, e)}
                        sx={{
                          position: 'absolute',
                          right: 4,
                          width: 24,
                          height: 24,
                          color: 'rgba(0,0,0,0.4)',
                          '&:hover': {
                            color: '#ef4444',
                            bgcolor: 'rgba(239, 68, 68, 0.1)',
                          },
                        }}
                      >
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                  </ListItemButton>
                );
              })}
            </List>
          </>
        )}

        {/* LAST 7 DAYS Section */}
        {filteredSessions.length > 3 && (
          <>
            <Typography
              sx={{
                color: '#94A3B8',
                fontSize: '0.65rem',
                fontWeight: 700,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                px: 1.5,
                py: 0.5,
                mt: 1,
              }}
            >
              LAST 7 DAYS
            </Typography>
            <List disablePadding>
              {filteredSessions.slice(3).map((session) => {
                const active = currentSessionId === session.id;
                return (
                  <ListItemButton
                    key={session.id}
                    onClick={() => loadChatSession(session.id)}
                    onMouseEnter={() => setHoveredSessionId(session.id)}
                    onMouseLeave={() => setHoveredSessionId(null)}
                    sx={{
                      borderRadius: '10px',
                      mx: 0.5,
                      mb: 0.5,
                      py: 0.75,
                      px: 1.5,
                      minHeight: 'auto',
                      position: 'relative',
                      borderLeft: active ? '3px solid #a78bfa' : '3px solid transparent',
                      bgcolor: active ? 'rgba(167,139,250,0.08)' : 'transparent',
                      '&:hover': {
                        bgcolor: active ? 'rgba(167,139,250,0.12)' : 'rgba(0,0,0,0.04)',
                      },
                    }}
                  >
                    <ChatBubbleOutlineIcon sx={{ fontSize: 14, color: '#a78bfa', mr: 1, flexShrink: 0 }} />
                    <ListItemText
                      primary={session.title}
                      primaryTypographyProps={{
                        fontSize: '0.75rem',
                        fontWeight: active ? 600 : 500,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        color: active ? '#a78bfa' : '#475569',
                        noWrap: true,
                      }}
                      sx={{ pr: hoveredSessionId === session.id ? 4 : 0 }}
                    />
                    {hoveredSessionId === session.id && (
                      <IconButton
                        size="small"
                        onClick={(e) => deleteChatSession(session.id, e)}
                        sx={{
                          position: 'absolute',
                          right: 4,
                          width: 24,
                          height: 24,
                          color: 'rgba(0,0,0,0.4)',
                          '&:hover': {
                            color: '#ef4444',
                            bgcolor: 'rgba(239, 68, 68, 0.1)',
                          },
                        }}
                      >
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                  </ListItemButton>
                );
              })}
            </List>
          </>
        )}
      </Box>

      {/* User info */}
      <Box>
        <Divider sx={{ borderColor: 'rgba(0,0,0,0.08)' }} />
        <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            sx={{
              bgcolor: '#a78bfa',
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
                color: '#64748B',
                fontSize: '0.8rem',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.username || user?.email}
            </Typography>
          </Box>
          <IconButton
            onClick={handleLogout}
            title="로그아웃"
            size="small"
            sx={{
              color: '#94A3B8',
              '&:hover': { color: '#EF4444', bgcolor: 'rgba(239,68,68,0.1)' },
            }}
          >
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );

  const navSidebarContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: '#FFFFFF',
        borderRight: '1px solid rgba(0,0,0,0.08)',
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
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: '#a78bfa',
            boxShadow: '0 0 12px rgba(167,139,250,0.5)',
            flexShrink: 0,
          }}
        />
        <Typography
          sx={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            color: '#1E293B',
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
            backgroundColor: 'rgba(167,139,250,0.15)',
            color: '#a78bfa',
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
          CONSOLE
        </Box>
      </Box>

      {/* Impersonation banner */}
      {impersonating && (
        <Box
          sx={{
            mx: 1.5,
            mb: 1,
            px: 2,
            py: 1,
            borderRadius: '10px',
            bgcolor: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            cursor: 'pointer',
            '&:hover': { bgcolor: 'rgba(245,158,11,0.12)' },
          }}
          onClick={exitImpersonation}
        >
          <ArrowBackIcon sx={{ fontSize: 16, color: '#F59E0B' }} />
          <Typography sx={{
            color: '#92400E',
            fontSize: '0.7rem',
            fontWeight: 600,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            슈퍼어드민으로 돌아가기
          </Typography>
        </Box>
      )}

      {/* Navigation */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {navSections.map((section, sIdx) => {
          // Non-admin users only see PLAYGROUND
          if (!isAdmin && section.label !== 'PLAYGROUND') return null;
          return (
            <Box key={section.label}>
              <Typography
                sx={{
                  color: '#94A3B8',
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
                          ? '3px solid #a78bfa'
                          : '3px solid transparent',
                        bgcolor: active
                          ? 'rgba(167,139,250,0.08)'
                          : 'transparent',
                        color: active ? '#a78bfa' : '#64748B',
                        '&:hover': {
                          bgcolor: active
                            ? 'rgba(167,139,250,0.12)'
                            : 'rgba(0,0,0,0.04)',
                          color: active ? '#a78bfa' : '#475569',
                          '& .MuiListItemIcon-root': {
                            color: active ? '#a78bfa' : '#475569',
                          },
                        },
                        '& .MuiListItemIcon-root': {
                          color: active ? '#a78bfa' : '#94A3B8',
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
          );
        })}
      </Box>

      {/* User info */}
      <Box>
        <Divider sx={{ borderColor: 'rgba(0,0,0,0.08)' }} />
        <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            sx={{
              bgcolor: '#a78bfa',
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
                color: '#64748B',
                fontSize: '0.8rem',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.username || user?.email}
            </Typography>
          </Box>
          <IconButton
            onClick={handleLogout}
            title="로그아웃"
            size="small"
            sx={{
              color: '#94A3B8',
              '&:hover': { color: '#EF4444', bgcolor: 'rgba(239,68,68,0.1)' },
            }}
          >
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );

  const sidebarContent = isChatPage ? chatSidebarContent : navSidebarContent;

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
            bgcolor: '#FFFFFF',
            borderBottom: '1px solid rgba(0,0,0,0.08)',
            display: 'flex',
            alignItems: 'center',
            px: 2,
            gap: 1.5,
            zIndex: (t) => t.zIndex.drawer + 1,
          }}
        >
          <IconButton
            onClick={() => setMobileOpen(true)}
            sx={{ color: '#1E293B' }}
          >
            <MenuIcon />
          </IconButton>
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#a78bfa',
              boxShadow: '0 0 12px rgba(167,139,250,0.5)',
            }}
          />
          <Typography
            sx={{
              color: '#1E293B',
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
              bgcolor: '#FFFFFF',
              borderRight: '1px solid rgba(0,0,0,0.08)',
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
              bgcolor: '#FFFFFF',
              borderRight: '1px solid rgba(0,0,0,0.08)',
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
          mt: isMobile ? '56px' : 0,
          minHeight: '100vh',
          bgcolor: '#F8FAFC',
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
              'radial-gradient(600px circle at 100% 0%, rgba(167,139,250,0.04) 0%, transparent 50%)',
            pointerEvents: 'none',
          }}
        />
        <Box sx={{ position: 'relative', zIndex: 1, height: '100%' }}>
          <Outlet context={{ currentSessionId, setCurrentSessionId, onSessionCreated: loadChatSessions }} />
        </Box>
      </Box>
    </Box>
  );
}
