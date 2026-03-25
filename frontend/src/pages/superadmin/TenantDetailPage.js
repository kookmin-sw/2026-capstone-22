import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  TextField,
  Button,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Chip,
  Avatar,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  PeopleAlt as PeopleAltIcon,
  Article as ArticleIcon,
  Storage as StorageIcon,
  ChatBubble as ChatBubbleIcon,
  Message as MessageIcon,
  ContentCopy as ContentCopyIcon,
  Warning as WarningIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { superadminAPI } from '../../services/api';
import { glowButtonSx, dangerButtonSx } from './styles';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
} from 'recharts';

function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ pt: 4 }}>{children}</Box> : null;
}

const STATUS_CHIP_STYLES = {
  active: {
    color: '#10B981',
    bgcolor: 'rgba(16,185,129,0.1)',
    border: '1px solid rgba(16,185,129,0.2)',
    fontWeight: 700,
  },
  suspended: {
    color: '#F59E0B',
    bgcolor: 'rgba(245,158,11,0.1)',
    border: '1px solid rgba(245,158,11,0.2)',
    fontWeight: 700,
  },
  deactivated: {
    color: '#EF4444',
    bgcolor: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.2)',
    fontWeight: 700,
  },
};

const STATUS_LABELS = {
  active: 'Active',
  suspended: 'Suspended',
  deactivated: 'Deactivated',
};

function getInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const darkInputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '12px',
    bgcolor: '#111113',
    color: '#FAFAFA',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    '& fieldset': {
      borderColor: 'rgba(255,255,255,0.06)',
    },
    '&:hover fieldset': {
      borderColor: 'rgba(255,255,255,0.12)',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#14B8A6',
    },
  },
  '& .MuiInputLabel-root': {
    color: '#71717A',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    '&.Mui-focused': {
      color: '#14B8A6',
    },
  },
  '& .MuiOutlinedInput-input': {
    color: '#FAFAFA',
  },
  '& .MuiOutlinedInput-input::placeholder': {
    color: '#52525B',
    opacity: 1,
  },
};

const disabledInputSx = {
  ...darkInputSx,
  '& .MuiOutlinedInput-root': {
    ...darkInputSx['& .MuiOutlinedInput-root'],
    fontFamily: "'JetBrains Mono', monospace",
    '&.Mui-disabled': {
      bgcolor: '#111113',
    },
    '&.Mui-disabled fieldset': {
      borderColor: 'rgba(255,255,255,0.06)',
    },
  },
  '& .MuiOutlinedInput-input.Mui-disabled': {
    color: '#52525B',
    WebkitTextFillColor: '#52525B',
  },
};

export default function TenantDetailPage() {
  const { tenantId } = useParams();
  const navigate = useNavigate();

  const [tenant, setTenant] = useState(null);
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [saving, setSaving] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({ name: '', status: '', logo_url: '' });
  const [kakaoForm, setKakaoForm] = useState({ bot_id: '', channel_id: '' });
  const [gcpForm, setGcpForm] = useState({});

  useEffect(() => {
    fetchTenant();
  }, [tenantId]);

  useEffect(() => {
    if (tab === 0 && !stats) {
      fetchStats();
    }
  }, [tab]);

  const fetchTenant = async () => {
    setLoading(true);
    try {
      const res = await superadminAPI.getTenant(tenantId);
      const t = res.data;
      setTenant(t);
      setForm({
        name: t.name || '',
        status: t.status || 'active',
        logo_url: t.logo_url || '',
      });
      setKakaoForm({
        bot_id: t.kakao_config?.bot_id || '',
        channel_id: t.kakao_config?.channel_id || '',
      });
    } catch (err) {
      setError('테넌트 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const [statsRes, analyticsRes] = await Promise.all([
        superadminAPI.getTenantStats(tenantId),
        superadminAPI.getTenantAnalytics(tenantId).catch(() => ({ data: null })),
      ]);
      setStats(statsRes.data);
      setAnalytics(analyticsRes.data);
    } catch (err) {
      setSnackbar({ open: true, message: '통계 조회에 실패했습니다.', severity: 'error' });
    }
  };

  const handleSaveBasic = async () => {
    setSaving(true);
    try {
      await superadminAPI.updateTenant(tenantId, form);
      setSnackbar({ open: true, message: '저장되었습니다.', severity: 'success' });
      fetchTenant();
    } catch (err) {
      setSnackbar({ open: true, message: '저장에 실패했습니다.', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKakao = async () => {
    setSaving(true);
    try {
      await superadminAPI.updateKakaoConfig(tenantId, kakaoForm);
      setSnackbar({ open: true, message: '카카오톡 설정이 저장되었습니다.', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: '저장에 실패했습니다.', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGcp = async () => {
    // GCP config is now read-only (Vertex AI uses shared service account)
  };

  const handleDeactivate = async () => {
    try {
      await superadminAPI.deactivateTenant(tenantId);
      setDeactivateOpen(false);
      setSnackbar({ open: true, message: '테넌트가 비활성화되었습니다.', severity: 'success' });
      navigate('/superadmin/tenants');
    } catch (err) {
      setSnackbar({ open: true, message: '비활성화에 실패했습니다.', severity: 'error' });
    }
  };

  const handlePermanentDelete = async () => {
    setDeleting(true);
    try {
      await superadminAPI.permanentlyDeleteTenant(tenantId);
      setDeleteOpen(false);
      setSnackbar({ open: true, message: '테넌트가 영구 삭제되었습니다.', severity: 'success' });
      navigate('/superadmin/tenants');
    } catch (err) {
      const msg = err.response?.data?.detail || '영구 삭제에 실패했습니다.';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setSnackbar({ open: true, message: '클립보드에 복사되었습니다.', severity: 'success' });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', bgcolor: '#09090B' }}>
        <CircularProgress sx={{ color: '#14B8A6' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        sx={{
          borderRadius: 2,
          bgcolor: 'rgba(239,68,68,0.1)',
          color: '#EF4444',
          border: '1px solid rgba(239,68,68,0.2)',
        }}
      >
        {error}
      </Alert>
    );
  }

  const statusKey = tenant?.status || 'active';
  const chipStyle = STATUS_CHIP_STYLES[statusKey] || STATUS_CHIP_STYLES.active;

  const statCards = [
    { label: '사용자', value: stats?.user_count ?? tenant?.user_count ?? 0, icon: PeopleAltIcon, color: '#14B8A6' },
    { label: '문서', value: stats?.document_count ?? tenant?.document_count ?? 0, icon: ArticleIcon, color: '#8B5CF6' },
    { label: 'CORPUS', value: stats?.corpus_count ?? 0, icon: StorageIcon, color: '#3B82F6' },
    { label: '세션', value: stats?.session_count ?? tenant?.session_count ?? 0, icon: ChatBubbleIcon, color: '#10B981' },
    { label: '메시지', value: stats?.message_count ?? 0, icon: MessageIcon, color: '#F59E0B' },
  ];

  const skillUrl = 'https://api.readytalk.com/api/kakao/chat';

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', py: 2 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <IconButton
          onClick={() => navigate('/superadmin/tenants')}
          sx={{
            mb: 2,
            color: '#71717A',
            '&:hover': { color: '#FAFAFA', bgcolor: 'rgba(255,255,255,0.06)' },
          }}
        >
          <ArrowBackIcon />
        </IconButton>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar
            sx={{
              width: 56,
              height: 56,
              bgcolor: '#14B8A6',
              color: '#09090B',
              fontSize: '1.25rem',
              fontWeight: 700,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            {getInitials(tenant?.name)}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 800,
                  color: '#FAFAFA',
                  letterSpacing: '-0.02em',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                {tenant?.name}
              </Typography>
              <Chip
                label={STATUS_LABELS[statusKey] || statusKey}
                size="small"
                sx={{
                  ...chipStyle,
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  height: 24,
                }}
              />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
              <Typography
                variant="body2"
                sx={{
                  color: '#71717A',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.85rem',
                }}
              >
                {tenant?.slug}
              </Typography>
              <Box sx={{ width: '1px', height: 14, bgcolor: 'rgba(255,255,255,0.08)' }} />
              <Button
                size="small"
                endIcon={<OpenInNewIcon sx={{ fontSize: '14px !important' }} />}
                onClick={async () => {
                  try {
                    const res = await superadminAPI.impersonateTenant(tenantId);
                    const { impersonation_token, tenant_slug } = res.data;
                    window.open(`/${tenant_slug}/admin?impersonate_token=${impersonation_token}`, '_blank');
                  } catch (err) {
                    console.error('Impersonation error:', err.response?.data || err.message);
                    setSnackbar({ open: true, message: `임퍼소네이션 실패: ${err.response?.data?.detail || err.message}`, severity: 'error' });
                  }
                }}
                sx={{
                  color: '#14B8A6',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  px: 1,
                  py: 0.3,
                  minWidth: 0,
                  borderRadius: '6px',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  '&:hover': { bgcolor: 'rgba(20,184,166,0.08)' },
                }}
              >
                어드민
              </Button>
              <Button
                size="small"
                endIcon={<OpenInNewIcon sx={{ fontSize: '14px !important' }} />}
                onClick={async () => {
                  try {
                    const res = await superadminAPI.impersonateTenant(tenantId);
                    const { impersonation_token, tenant_slug } = res.data;
                    window.open(`/${tenant_slug}?impersonate_token=${impersonation_token}`, '_blank');
                  } catch (err) {
                    console.error('Impersonation error:', err.response?.data || err.message);
                    setSnackbar({ open: true, message: `임퍼소네이션 실패: ${err.response?.data?.detail || err.message}`, severity: 'error' });
                  }
                }}
                sx={{
                  color: '#71717A',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  px: 1,
                  py: 0.3,
                  minWidth: 0,
                  borderRadius: '6px',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.04)', color: '#A1A1AA' },
                }}
              >
                채팅
              </Button>
              {tenant?.gcp_config?.gcs_bucket_name && (
                <>
                  <Box sx={{ width: '1px', height: 14, bgcolor: 'rgba(255,255,255,0.08)' }} />
                  <Button
                    size="small"
                    endIcon={<OpenInNewIcon sx={{ fontSize: '14px !important' }} />}
                    onClick={() => window.open(`https://console.cloud.google.com/storage/browser/${tenant.gcp_config.gcs_bucket_name}/tenants/${tenant.slug}/`, '_blank')}
                    sx={{
                      color: '#71717A',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'none',
                      px: 1,
                      py: 0.3,
                      minWidth: 0,
                      borderRadius: '6px',
                      fontFamily: "'JetBrains Mono', monospace",
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.04)', color: '#A1A1AA' },
                    }}
                  >
                    GCS
                  </Button>
                </>
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 1,
          bgcolor: '#18181B',
          borderRadius: '12px',
          p: 0.5,
          minHeight: 'auto',
          '& .MuiTabs-indicator': {
            display: 'none',
          },
          '& .MuiTabs-flexContainer': {
            gap: '4px',
          },
          '& .MuiTab-root': {
            fontWeight: 600,
            textTransform: 'none',
            fontSize: '0.85rem',
            color: '#71717A',
            borderRadius: '8px',
            minHeight: 36,
            py: 0.75,
            px: 2,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            transition: 'all 0.15s ease',
            '&.Mui-selected': {
              color: '#FAFAFA',
              bgcolor: '#27272A',
            },
          },
        }}
      >
        <Tab label="개요" />
        <Tab label="설정" />
        <Tab label="카카오톡" />
      </Tabs>

      {/* Tab 0: Overview */}
      <TabPanel value={tab} index={0}>
        {!stats ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress sx={{ color: '#14B8A6' }} />
          </Box>
        ) : (
          <>
            {/* Stat Cards */}
            <Grid container spacing={2.5}>
              {statCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Grid item xs={6} md={2.4} key={card.label}>
                    <Box
                      sx={{
                        bgcolor: '#18181B',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '16px',
                        p: 3,
                      }}
                    >
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          bgcolor: `${card.color}1A`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          mb: 2,
                        }}
                      >
                        <Icon sx={{ fontSize: 20, color: card.color }} />
                      </Box>
                      <Typography
                        variant="h4"
                        sx={{
                          fontWeight: 800,
                          color: '#FAFAFA',
                          mb: 0.5,
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                        }}
                      >
                        {(card.value ?? 0).toLocaleString()}
                      </Typography>
                      <Typography
                        variant="overline"
                        sx={{
                          color: '#71717A',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                        }}
                      >
                        {card.label}
                      </Typography>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>

            {/* Analytics Charts */}
            {analytics && (
              <Grid container spacing={2.5} sx={{ mt: 1 }}>
                {/* Daily Messages Bar Chart */}
                <Grid item xs={12} lg={8}>
                  <Box sx={{
                    bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '16px', p: 3, position: 'relative', overflow: 'hidden',
                    '&::before': {
                      content: '""', position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)',
                      width: '80%', height: '60%', background: 'radial-gradient(ellipse, rgba(20,184,166,0.04) 0%, transparent 70%)', pointerEvents: 'none',
                    },
                  }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, position: 'relative', zIndex: 1 }}>
                      <Typography sx={{ fontWeight: 700, color: '#FAFAFA', fontSize: '1rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        일별 응답 수
                      </Typography>
                      <Typography sx={{ color: '#3F3F46', fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
                        LAST 14 DAYS
                      </Typography>
                    </Box>
                    <Box sx={{ width: '100%', height: 240, position: 'relative', zIndex: 1 }}>
                      <ResponsiveContainer>
                        <BarChart data={(() => {
                          const map = {};
                          (analytics.daily_messages || []).forEach(d => { map[d.date] = d.count; });
                          const result = [];
                          const now = new Date();
                          for (let i = 13; i >= 0; i--) {
                            const date = new Date(now); date.setDate(date.getDate() - i);
                            const key = date.toISOString().split('T')[0];
                            result.push({ label: `${date.getMonth() + 1}/${date.getDate()}`, count: map[key] || 0 });
                          }
                          return result;
                        })()} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                          <defs>
                            <linearGradient id="tenantBarGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#14B8A6" stopOpacity={0.9} />
                              <stop offset="100%" stopColor="#06B6D4" stopOpacity={0.4} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#3F3F46', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} interval={1} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#3F3F46', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} allowDecimals={false} />
                          <RechartsTooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <Box sx={{ bgcolor: 'rgba(12,12,13,0.95)', border: '1px solid rgba(20,184,166,0.25)', borderRadius: '10px', px: 1.8, py: 1.2, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                                  <Typography sx={{ color: '#71717A', fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", mb: 0.3 }}>{label}</Typography>
                                  <Typography sx={{ color: '#FAFAFA', fontSize: '1rem', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{payload[0].value.toLocaleString()}건</Typography>
                                </Box>
                              );
                            }}
                            cursor={{ fill: 'rgba(20,184,166,0.06)', radius: 6 }}
                          />
                          <Bar dataKey="count" radius={[6, 6, 2, 2]} maxBarSize={32}>
                            {Array.from({ length: 14 }).map((_, i) => (
                              <Cell key={i} fill="url(#tenantBarGrad)" />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  </Box>
                </Grid>

                {/* Hourly Activity Distribution */}
                <Grid item xs={12} lg={4}>
                  <Box sx={{
                    bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '16px', p: 3, position: 'relative', overflow: 'hidden',
                    '&::before': {
                      content: '""', position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)',
                      width: '80%', height: '60%', background: 'radial-gradient(ellipse, rgba(139,92,246,0.04) 0%, transparent 70%)', pointerEvents: 'none',
                    },
                  }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, position: 'relative', zIndex: 1 }}>
                      <Typography sx={{ fontWeight: 700, color: '#FAFAFA', fontSize: '1rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        시간대별 활동
                      </Typography>
                      <Typography sx={{ color: '#3F3F46', fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
                        30 DAYS
                      </Typography>
                    </Box>
                    <Box sx={{ width: '100%', height: 240, position: 'relative', zIndex: 1 }}>
                      <ResponsiveContainer>
                        <AreaChart data={(() => {
                          const map = {};
                          (analytics.hourly_distribution || []).forEach(d => { map[d.hour] = d.count; });
                          return Array.from({ length: 24 }, (_, h) => ({
                            label: `${h}시`,
                            hour: h,
                            count: map[h] || 0,
                          }));
                        })()} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                          <defs>
                            <linearGradient id="hourlyGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.4} />
                              <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="label"
                            axisLine={false} tickLine={false}
                            tick={{ fill: '#3F3F46', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
                            interval={5}
                          />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#3F3F46', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} allowDecimals={false} />
                          <RechartsTooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <Box sx={{ bgcolor: 'rgba(12,12,13,0.95)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '10px', px: 1.8, py: 1.2, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                                  <Typography sx={{ color: '#71717A', fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", mb: 0.3 }}>{label}</Typography>
                                  <Typography sx={{ color: '#FAFAFA', fontSize: '1rem', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{payload[0].value.toLocaleString()}건</Typography>
                                </Box>
                              );
                            }}
                            cursor={{ stroke: 'rgba(139,92,246,0.3)' }}
                          />
                          <Area type="monotone" dataKey="count" stroke="#8B5CF6" strokeWidth={2} fill="url(#hourlyGrad)" dot={false} activeDot={{ r: 4, fill: '#8B5CF6', stroke: '#18181B', strokeWidth: 2 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </Box>
                  </Box>
                </Grid>

                {/* Daily Sessions + Users (combined area chart) */}
                <Grid item xs={12}>
                  <Box sx={{
                    bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '16px', p: 3, position: 'relative', overflow: 'hidden',
                    '&::before': {
                      content: '""', position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)',
                      width: '80%', height: '60%', background: 'radial-gradient(ellipse, rgba(16,185,129,0.03) 0%, transparent 70%)', pointerEvents: 'none',
                    },
                  }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, position: 'relative', zIndex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Typography sx={{ fontWeight: 700, color: '#FAFAFA', fontSize: '1rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                          일별 세션 & 신규 사용자
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                            <Box sx={{ width: 10, height: 3, borderRadius: 2, bgcolor: '#10B981' }} />
                            <Typography sx={{ color: '#71717A', fontSize: '0.7rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>세션</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                            <Box sx={{ width: 10, height: 3, borderRadius: 2, bgcolor: '#F59E0B' }} />
                            <Typography sx={{ color: '#71717A', fontSize: '0.7rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>신규 사용자</Typography>
                          </Box>
                        </Box>
                      </Box>
                      <Typography sx={{ color: '#3F3F46', fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
                        LAST 14 DAYS
                      </Typography>
                    </Box>
                    <Box sx={{ width: '100%', height: 200, position: 'relative', zIndex: 1 }}>
                      <ResponsiveContainer>
                        <AreaChart data={(() => {
                          const sessMap = {}, userMap = {};
                          (analytics.daily_sessions || []).forEach(d => { sessMap[d.date] = d.count; });
                          (analytics.daily_users || []).forEach(d => { userMap[d.date] = d.count; });
                          const result = [];
                          const now = new Date();
                          for (let i = 13; i >= 0; i--) {
                            const date = new Date(now); date.setDate(date.getDate() - i);
                            const key = date.toISOString().split('T')[0];
                            result.push({ label: `${date.getMonth() + 1}/${date.getDate()}`, sessions: sessMap[key] || 0, users: userMap[key] || 0 });
                          }
                          return result;
                        })()} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                          <defs>
                            <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#3F3F46', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} interval={1} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#3F3F46', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} allowDecimals={false} />
                          <RechartsTooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <Box sx={{ bgcolor: 'rgba(12,12,13,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', px: 1.8, py: 1.2, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                                  <Typography sx={{ color: '#71717A', fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", mb: 0.5 }}>{label}</Typography>
                                  {payload.map((p) => (
                                    <Box key={p.dataKey} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <Box sx={{ width: 8, height: 8, borderRadius: '3px', bgcolor: p.color }} />
                                      <Typography sx={{ color: '#FAFAFA', fontSize: '0.82rem', fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                                        {p.dataKey === 'sessions' ? '세션' : '사용자'} {p.value}
                                      </Typography>
                                    </Box>
                                  ))}
                                </Box>
                              );
                            }}
                            cursor={{ stroke: 'rgba(255,255,255,0.06)' }}
                          />
                          <Area type="monotone" dataKey="sessions" stroke="#10B981" strokeWidth={2} fill="url(#sessGrad)" dot={false} activeDot={{ r: 4, fill: '#10B981', stroke: '#18181B', strokeWidth: 2 }} />
                          <Area type="monotone" dataKey="users" stroke="#F59E0B" strokeWidth={2} fill="url(#userGrad)" dot={false} activeDot={{ r: 4, fill: '#F59E0B', stroke: '#18181B', strokeWidth: 2 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            )}
          </>
        )}
      </TabPanel>

      {/* Tab 1: Settings */}
      <TabPanel value={tab} index={1}>
        <Box
          sx={{
            bgcolor: '#18181B',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '16px',
            p: 5,
            maxWidth: 640,
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              label="교회 이름"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              fullWidth
              sx={darkInputSx}
            />
            <TextField
              label="Slug"
              value={tenant?.slug || ''}
              fullWidth
              disabled
              sx={disabledInputSx}
            />
            <FormControl fullWidth>
              <InputLabel sx={{ color: '#71717A', '&.Mui-focused': { color: '#14B8A6' } }}>
                상태
              </InputLabel>
              <Select
                value={form.status}
                label="상태"
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                sx={{
                  borderRadius: '12px',
                  bgcolor: '#111113',
                  color: '#FAFAFA',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.06)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
                  '&.Mui-focused fieldset': { borderColor: '#14B8A6' },
                  '& .MuiSelect-icon': { color: '#52525B' },
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      bgcolor: '#18181B',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '12px',
                      '& .MuiMenuItem-root': {
                        color: '#FAFAFA',
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        '&:hover': { bgcolor: '#27272A' },
                        '&.Mui-selected': { bgcolor: '#27272A' },
                        '&.Mui-selected:hover': { bgcolor: '#27272A' },
                      },
                    },
                  },
                }}
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="suspended">Suspended</MenuItem>
                <MenuItem value="deactivated">Deactivated</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="로고 URL"
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              fullWidth
              placeholder="https://example.com/logo.png"
              sx={darkInputSx}
            />
            <Box sx={{ mt: 1 }}>
              <Button
                variant="contained"
                onClick={handleSaveBasic}
                disabled={saving}
                disableElevation
                sx={{
                  ...glowButtonSx,
                  px: 4,
                  py: 1.2,
                }}
              >
                {saving ? <CircularProgress size={20} sx={{ color: '#09090B', mr: 1 }} /> : null}
                저장
              </Button>
            </Box>
          </Box>
        </Box>

        {/* Danger Zone */}
        <Box
          sx={{
            border: '1px solid rgba(239,68,68,0.3)',
            bgcolor: 'rgba(239,68,68,0.03)',
            borderRadius: '16px',
            p: 4,
            maxWidth: 640,
            mt: 4,
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{
              color: '#EF4444',
              fontWeight: 700,
              mb: 1,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            위험 구역
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: '#A1A1AA',
              mb: 3,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            테넌트를 비활성화하면 해당 테넌트의 모든 사용자가 접속할 수 없게 되며 모든 챗봇 기능이 중지됩니다.
            이 작업은 되돌릴 수 있지만, 비활성화 기간 동안 서비스가 완전히 정지됩니다.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={() => setDeactivateOpen(true)}
              sx={{
                borderRadius: '10px',
                fontWeight: 600,
                color: '#EF4444',
                borderColor: 'rgba(239,68,68,0.3)',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                '&:hover': {
                  borderColor: 'rgba(239,68,68,0.5)',
                  bgcolor: 'rgba(239,68,68,0.06)',
                },
              }}
            >
              테넌트 비활성화
            </Button>
            <Button
              variant="contained"
              onClick={() => { setDeleteConfirmText(''); setDeleteOpen(true); }}
              disableElevation
              sx={{
                ...dangerButtonSx,
                borderRadius: '10px',
                fontWeight: 600,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              테넌트 영구 삭제
            </Button>
          </Box>
        </Box>
      </TabPanel>

      {/* Tab 2: Kakao */}
      <TabPanel value={tab} index={2}>
        <Box
          sx={{
            bgcolor: '#18181B',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '16px',
            p: 5,
            maxWidth: 640,
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              label="봇 ID"
              value={kakaoForm.bot_id}
              onChange={(e) => setKakaoForm({ ...kakaoForm, bot_id: e.target.value })}
              fullWidth
              sx={darkInputSx}
            />

            <TextField
              label="채널 ID"
              value={kakaoForm.channel_id}
              onChange={(e) => setKakaoForm({ ...kakaoForm, channel_id: e.target.value })}
              fullWidth
              placeholder="_xeIushX (채널 URL에서 확인)"
              helperText="카카오톡 채널 URL의 ID (예: pf.kakao.com/_xeIushX → _xeIushX). 상담원 연결에 사용됩니다."
              sx={darkInputSx}
            />

            {/* Skill URL (read-only) */}
            <Box>
              <Typography
                variant="body2"
                sx={{
                  color: '#71717A',
                  mb: 1,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                스킬 URL
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  bgcolor: '#111113',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  px: 3,
                  py: 2,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 500,
                    color: '#FAFAFA',
                  }}
                >
                  {skillUrl}
                </Typography>
                <Tooltip title="복사">
                  <IconButton
                    size="small"
                    onClick={() => copyToClipboard(skillUrl)}
                    sx={{
                      color: '#52525B',
                      '&:hover': { color: '#14B8A6', bgcolor: 'rgba(20,184,166,0.1)' },
                    }}
                  >
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            <Box sx={{ mt: 1 }}>
              <Button
                variant="contained"
                onClick={handleSaveKakao}
                disabled={saving}
                disableElevation
                sx={{
                  ...glowButtonSx,
                  px: 4,
                  py: 1.2,
                }}
              >
                {saving ? <CircularProgress size={20} sx={{ color: '#09090B', mr: 1 }} /> : null}
                저장
              </Button>
            </Box>
          </Box>
        </Box>
      </TabPanel>

      {/* Deactivate Dialog */}
      <Dialog
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: '16px',
            p: 1,
            bgcolor: '#18181B',
            border: '1px solid rgba(255,255,255,0.06)',
            backgroundImage: 'none',
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            color: '#EF4444',
            fontWeight: 700,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          <WarningIcon /> 테넌트 비활성화 경고
        </DialogTitle>
        <DialogContent>
          <DialogContentText
            sx={{
              color: '#A1A1AA',
              mt: 1,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            정말로 <strong style={{ color: '#FAFAFA' }}>{tenant?.name}</strong> 테넌트를 비활성화하시겠습니까?
            <br /><br />
            이 작업은 나중에 되돌릴 수 있지만, 비활성화 동안 모든 사용자가 챗봇을 사용할 수 없게 됩니다.
            카카오톡 연동 응답도 정지됩니다.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setDeactivateOpen(false)}
            sx={{
              fontWeight: 600,
              color: '#A1A1AA',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
            }}
          >
            취소
          </Button>
          <Button
            onClick={handleDeactivate}
            variant="contained"
            disableElevation
            sx={{
              ...dangerButtonSx,
            }}
          >
            네, 비활성화합니다
          </Button>
        </DialogActions>
      </Dialog>

      {/* Permanent Delete Dialog */}
      <Dialog
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: '16px',
            p: 1,
            bgcolor: '#18181B',
            border: '1px solid rgba(239,68,68,0.3)',
            backgroundImage: 'none',
            minWidth: 440,
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            color: '#EF4444',
            fontWeight: 700,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          <WarningIcon /> 테넌트 영구 삭제
        </DialogTitle>
        <DialogContent>
          <DialogContentText
            sx={{
              color: '#A1A1AA',
              mt: 1,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            <strong style={{ color: '#FAFAFA' }}>{tenant?.name}</strong> 테넌트를 영구적으로 삭제합니다.
            <br /><br />
            다음 항목이 <strong style={{ color: '#EF4444' }}>모두 삭제</strong>됩니다:
          </DialogContentText>
          <Box component="ul" sx={{ color: '#A1A1AA', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.875rem', pl: 2, mt: 1 }}>
            <li>모든 RAG 문서 저장소 (Vertex AI)</li>
            <li>모든 GCS 파일</li>
            <li>모든 사용자, 그룹, 채팅 기록</li>
            <li>모든 설정 및 프롬프트 템플릿</li>
          </Box>
          <DialogContentText
            sx={{
              color: '#EF4444',
              mt: 2,
              fontWeight: 600,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '0.875rem',
            }}
          >
            이 작업은 되돌릴 수 없습니다.
          </DialogContentText>
          <TextField
            fullWidth
            placeholder={`확인을 위해 "${tenant?.name}" 를 입력하세요`}
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            sx={{
              mt: 2,
              '& .MuiOutlinedInput-root': {
                borderRadius: '10px',
                bgcolor: '#111113',
                color: '#FAFAFA',
                fontFamily: "'JetBrains Mono', monospace",
                '& fieldset': { borderColor: 'rgba(239,68,68,0.3)' },
                '&:hover fieldset': { borderColor: 'rgba(239,68,68,0.5)' },
                '&.Mui-focused fieldset': { borderColor: '#EF4444' },
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setDeleteOpen(false)}
            disabled={deleting}
            sx={{
              fontWeight: 600,
              color: '#A1A1AA',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
            }}
          >
            취소
          </Button>
          <Button
            onClick={handlePermanentDelete}
            variant="contained"
            disableElevation
            disabled={deleteConfirmText !== tenant?.name || deleting}
            sx={{
              ...dangerButtonSx,
            }}
          >
            {deleting ? <CircularProgress size={18} sx={{ color: '#fff', mr: 1 }} /> : null}
            영구 삭제
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
          sx={{
            width: '100%',
            borderRadius: '10px',
            bgcolor: '#18181B',
            color: '#FAFAFA',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            '& .MuiAlert-icon': {
              color: snackbar.severity === 'success' ? '#10B981' : '#EF4444',
            },
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
