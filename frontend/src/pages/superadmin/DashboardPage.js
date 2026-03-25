import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Typography,
  CircularProgress,
  Alert,
  Button,
} from '@mui/material';
import {
  Business as BusinessIcon,
  CheckCircle as CheckCircleIcon,
  PeopleAlt as PeopleAltIcon,
  Article as ArticleIcon,
  ChatBubble as ChatBubbleIcon,
  East as EastIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { superadminAPI } from '../../services/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';

/* ── Design tokens ── */
const T = {
  bg: '#0C0C0D',
  card: '#18181B',
  cardHover: 'rgba(20,184,166,0.2)',
  border: 'rgba(255,255,255,0.06)',
  accent: '#14B8A6',
  accentCyan: '#06B6D4',
  text: '#FAFAFA',
  textDim: '#71717A',
  textMuted: '#52525B',
  textGhost: '#3F3F46',
  green: '#10B981',
  amber: '#F59E0B',
  violet: '#8B5CF6',
  blue: '#3B82F6',
  red: '#EF4444',
  font: "'Plus Jakarta Sans', sans-serif",
  mono: "'JetBrains Mono', monospace",
  radius: '16px',
  ease: 'cubic-bezier(0.16,1,0.3,1)',
};

const STATUS_COLORS = {
  active: T.green,
  suspended: T.amber,
  deactivated: T.red,
};
const STATUS_LABELS = {
  active: '운영중',
  suspended: '일시정지',
  deactivated: '비활성',
};

/* ── Panel wrapper for chart sections ── */
function ChartPanel({ title, tag, delay = '0s', children }) {
  return (
    <Box
      sx={{
        bgcolor: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        p: 3,
        position: 'relative',
        overflow: 'hidden',
        animation: `fadeUp 0.6s ${T.ease} both`,
        animationDelay: delay,
        // Subtle radial glow behind content
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '-40%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '80%',
          height: '60%',
          background: `radial-gradient(ellipse, rgba(20,184,166,0.04) 0%, transparent 70%)`,
          pointerEvents: 'none',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5, position: 'relative', zIndex: 1 }}>
        <Typography sx={{ fontWeight: 700, color: T.text, fontSize: '1rem', fontFamily: T.font }}>
          {title}
        </Typography>
        {tag && (
          <Typography sx={{ color: T.textGhost, fontSize: '0.7rem', fontFamily: T.mono, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {tag}
          </Typography>
        )}
      </Box>
      <Box sx={{ position: 'relative', zIndex: 1 }}>{children}</Box>
    </Box>
  );
}

/* ── Custom recharts tooltip ── */
function DarkTooltip({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <Box
      sx={{
        bgcolor: 'rgba(12,12,13,0.95)',
        border: `1px solid rgba(20,184,166,0.25)`,
        borderRadius: '10px',
        px: 1.8,
        py: 1.2,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <Typography sx={{ color: T.textDim, fontSize: '0.68rem', fontFamily: T.mono, mb: 0.3 }}>
        {label}
      </Typography>
      <Typography sx={{ color: T.text, fontSize: '1rem', fontWeight: 700, fontFamily: T.font }}>
        {payload[0].value.toLocaleString()}{suffix}
      </Typography>
    </Box>
  );
}

/* ── Donut center label ── */
function DonutCenter({ total }) {
  return (
    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central">
      <tspan x="50%" dy="-8" fill={T.text} fontSize="22" fontWeight="800" fontFamily="Plus Jakarta Sans, sans-serif">
        {total}
      </tspan>
      <tspan x="50%" dy="22" fill={T.textDim} fontSize="10" fontWeight="600" fontFamily="Plus Jakarta Sans, sans-serif" letterSpacing="0.08em">
        TENANTS
      </tspan>
    </text>
  );
}

/* ── Status dot ── */
function StatusDot({ status }) {
  const color = STATUS_COLORS[status] || T.red;
  const label = STATUS_LABELS[status] || status;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color, boxShadow: `0 0 8px ${color}99`, flexShrink: 0 }} />
      <Typography sx={{ color, fontSize: '0.75rem', fontWeight: 600, fontFamily: T.font, letterSpacing: '0.02em' }}>
        {label}
      </Typography>
    </Box>
  );
}

/* ── Fill 14-day date gaps ── */
function fillDailyData(rawData, days = 14) {
  const map = {};
  rawData.forEach((d) => { map[d.date] = d.count; });
  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split('T')[0];
    const shortLabel = `${date.getMonth() + 1}/${date.getDate()}`;
    result.push({ date: key, label: shortLabel, count: map[key] || 0 });
  }
  return result;
}

/* ── Stat cards config ── */
const statCards = [
  { key: 'total_tenants', label: '전체 테넌트', icon: BusinessIcon, color: T.accent },
  { key: 'active_tenants', label: '활성 테넌트', icon: CheckCircleIcon, color: T.green },
  { key: 'total_users', label: '전체 사용자', icon: PeopleAltIcon, color: T.amber },
  { key: 'total_documents', label: '전체 문서', icon: ArticleIcon, color: T.violet },
  { key: 'total_sessions', label: '전체 세션', icon: ChatBubbleIcon, color: T.blue },
];

/* ════════════════════════════════════════════════════════════
   DASHBOARD PAGE
   ════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchAll = useCallback(async () => {
    try {
      const [dashRes, analyticsRes] = await Promise.all([
        superadminAPI.getDashboard(),
        superadminAPI.getAnalytics().catch(() => ({ data: null })),
      ]);
      setData(dashRes.data);
      setAnalytics(analyticsRes.data);
    } catch (err) {
      setError('대시보드 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress sx={{ color: T.accent }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 2, borderRadius: '12px', bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.15)', '& .MuiAlert-icon': { color: T.red } }}>
        {error}
      </Alert>
    );
  }

  const recentTenants = data?.recent_tenants ?? [];
  const dailyMessages = fillDailyData(analytics?.daily_messages ?? []);
  const tenantUsage = analytics?.tenant_usage ?? [];
  const statusDist = analytics?.status_distribution ?? [];
  const maxMsg = Math.max(...dailyMessages.map((d) => d.count), 1);
  const totalTenants = statusDist.reduce((s, d) => s + d.count, 0);
  const maxTenantMsg = tenantUsage.length > 0 ? Math.max(...tenantUsage.map((t) => t.messages)) : 1;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <style>
        {`@keyframes fadeUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
          @keyframes slideIn { from { opacity:0; transform:translateX(-12px) } to { opacity:1; transform:translateX(0) } }
          @keyframes pulseGlow { 0%,100% { opacity:0.4 } 50% { opacity:0.8 } }`}
      </style>

      {/* ── Header ── */}
      <Box sx={{ mb: 4, animation: `fadeUp 0.5s ${T.ease} both` }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: T.text, fontFamily: T.font, letterSpacing: '-0.03em', mb: 0.5 }}>
          대시보드
        </Typography>
        <Typography sx={{ color: T.textMuted, fontSize: '0.85rem', fontFamily: T.font }}>
          플랫폼 현황을 한눈에 확인하세요.
        </Typography>
      </Box>

      {/* ── Stats Cards ── */}
      <Grid container spacing={2.5} sx={{ mb: 5 }}>
        {statCards.map((stat, index) => {
          const IconComponent = stat.icon;
          const value = data?.[stat.key] ?? 0;
          return (
            <Grid item xs={12} md={4} lg={12 / 5} key={stat.key}>
              <Box
                sx={{
                  bgcolor: T.card,
                  border: `1px solid ${T.border}`,
                  borderRadius: T.radius,
                  p: 3,
                  position: 'relative',
                  overflow: 'hidden',
                  transition: `all 0.3s ${T.ease}`,
                  animation: `fadeUp 0.5s ${T.ease} both`,
                  animationDelay: `${0.05 + index * 0.04}s`,
                  '&:hover': { border: `1px solid ${T.cardHover}`, transform: 'translateY(-2px)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' },
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', color: T.textDim, textTransform: 'uppercase', fontFamily: T.font }}>
                    {stat.label}
                  </Typography>
                  <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: `${stat.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <IconComponent sx={{ color: stat.color, fontSize: 20 }} />
                  </Box>
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: '2rem', color: T.text, fontFamily: T.font, lineHeight: 1 }}>
                  {value.toLocaleString()}
                </Typography>
                <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', bgcolor: stat.color, opacity: 0.4 }} />
              </Box>
            </Grid>
          );
        })}
      </Grid>

      {/* ── Analytics Charts ── */}
      {analytics && (
        <Grid container spacing={2.5} sx={{ mb: 5 }}>
          {/* Daily Messages — takes 8/12 cols */}
          <Grid item xs={12} lg={8}>
            <ChartPanel title="일별 응답 수" tag="LAST 14 DAYS" delay="0.3s">
              <Box sx={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={dailyMessages} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={T.accent} stopOpacity={0.9} />
                        <stop offset="100%" stopColor={T.accentCyan} stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: T.textGhost, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                      interval={1}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: T.textGhost, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                      allowDecimals={false}
                    />
                    <Tooltip content={<DarkTooltip suffix="건" />} cursor={{ fill: 'rgba(20,184,166,0.06)', radius: 6 }} />
                    <Bar dataKey="count" radius={[6, 6, 2, 2]} maxBarSize={36}>
                      {dailyMessages.map((entry, i) => {
                        const intensity = entry.count / maxMsg;
                        return (
                          <Cell
                            key={i}
                            fill={entry.count > 0 ? 'url(#barGrad)' : 'rgba(255,255,255,0.03)'}
                            style={{
                              filter: intensity > 0.8 ? `drop-shadow(0 0 8px rgba(20,184,166,0.5))` : 'none',
                            }}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </ChartPanel>
          </Grid>

          {/* Status Distribution Donut — takes 4/12 cols */}
          <Grid item xs={12} lg={4}>
            <ChartPanel title="테넌트 상태" tag="STATUS" delay="0.38s">
              <Box sx={{ width: '100%', height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {statusDist.length > 0 ? (
                  <ResponsiveContainer>
                    <PieChart>
                      <defs>
                        {statusDist.map((entry) => {
                          const c = STATUS_COLORS[entry.status] || T.textGhost;
                          return (
                            <linearGradient key={entry.status} id={`pie-${entry.status}`} x1="0" y1="0" x2="1" y2="1">
                              <stop offset="0%" stopColor={c} stopOpacity={1} />
                              <stop offset="100%" stopColor={c} stopOpacity={0.5} />
                            </linearGradient>
                          );
                        })}
                      </defs>
                      <Pie
                        data={statusDist}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                        strokeWidth={0}
                        cornerRadius={4}
                      >
                        {statusDist.map((entry) => (
                          <Cell key={entry.status} fill={`url(#pie-${entry.status})`} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <Box sx={{ bgcolor: 'rgba(12,12,13,0.95)', border: `1px solid ${STATUS_COLORS[d.status] || T.textGhost}40`, borderRadius: '10px', px: 1.8, py: 1.2, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                              <Typography sx={{ color: STATUS_COLORS[d.status] || T.textDim, fontSize: '0.72rem', fontWeight: 600, fontFamily: T.font }}>
                                {STATUS_LABELS[d.status] || d.status}
                              </Typography>
                              <Typography sx={{ color: T.text, fontSize: '1rem', fontWeight: 700, fontFamily: T.font }}>
                                {d.count}개
                              </Typography>
                            </Box>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <Typography sx={{ color: T.textGhost, fontSize: '0.8rem', fontFamily: T.font }}>데이터 없음</Typography>
                )}
                {/* Center label overlay */}
                {statusDist.length > 0 && (
                  <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color: T.text, fontFamily: T.font, lineHeight: 1 }}>
                      {totalTenants}
                    </Typography>
                    <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: T.textDim, fontFamily: T.mono, letterSpacing: '0.1em', mt: 0.3 }}>
                      TENANTS
                    </Typography>
                  </Box>
                )}
              </Box>
              {/* Legend */}
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 1 }}>
                {statusDist.map((entry) => (
                  <Box key={entry.status} sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '3px', bgcolor: STATUS_COLORS[entry.status] || T.textGhost }} />
                    <Typography sx={{ color: T.textDim, fontSize: '0.7rem', fontFamily: T.font, fontWeight: 500 }}>
                      {STATUS_LABELS[entry.status] || entry.status} {entry.count}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </ChartPanel>
          </Grid>

          {/* Tenant Usage Ranking — full width */}
          <Grid item xs={12}>
            <ChartPanel title="테넌트별 사용량" tag="LAST 30 DAYS · TOP 10" delay="0.45s">
              {tenantUsage.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                  {tenantUsage.map((t, i) => {
                    const pct = (t.messages / maxTenantMsg) * 100;
                    return (
                      <Box
                        key={t.slug}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: '140px 1fr 72px',
                          alignItems: 'center',
                          gap: 2,
                          animation: `slideIn 0.4s ${T.ease} both`,
                          animationDelay: `${0.5 + i * 0.04}s`,
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: i === 0 ? T.accent : T.text,
                            fontFamily: T.font,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t.name}
                        </Typography>
                        <Box sx={{ position: 'relative', height: 28, borderRadius: '8px', bgcolor: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
                          <Box
                            sx={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: `${Math.max(pct, 2)}%`,
                              borderRadius: '8px',
                              background: i === 0
                                ? `linear-gradient(90deg, ${T.accent}, ${T.accentCyan})`
                                : `linear-gradient(90deg, rgba(20,184,166,0.5), rgba(6,182,212,0.2))`,
                              transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)',
                              ...(i === 0 && { boxShadow: `0 0 20px rgba(20,184,166,0.3)` }),
                            }}
                          />
                          {/* Glass sheen overlay */}
                          <Box
                            sx={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              width: `${Math.max(pct, 2)}%`,
                              height: '50%',
                              borderRadius: '8px 8px 0 0',
                              background: 'linear-gradient(180deg, rgba(255,255,255,0.08), transparent)',
                              pointerEvents: 'none',
                            }}
                          />
                        </Box>
                        <Typography
                          sx={{
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            color: i === 0 ? T.accent : T.textDim,
                            fontFamily: T.mono,
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {t.messages.toLocaleString()}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              ) : (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Typography sx={{ color: T.textGhost, fontSize: '0.82rem', fontFamily: T.font }}>
                    아직 메시지 데이터가 없습니다
                  </Typography>
                </Box>
              )}
            </ChartPanel>
          </Grid>
        </Grid>
      )}

      {/* ── Recent Tenants Section ── */}
      <Box sx={{ animation: `fadeUp 0.5s ${T.ease} both`, animationDelay: '0.55s' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
          <Typography sx={{ fontWeight: 700, color: T.text, fontSize: '1.1rem', fontFamily: T.font }}>
            최근 테넌트
          </Typography>
          <Typography sx={{ color: T.textGhost, fontSize: '0.75rem', fontFamily: T.mono, letterSpacing: '0.05em' }}>
            RECENT 5
          </Typography>
        </Box>

        {/* Column Headers */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 140px', gap: 0, px: 2.5, pb: 1.5 }}>
          {['이름', 'SLUG', '상태', '생성일'].map((h) => (
            <Typography key={h} sx={{ color: T.textGhost, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: T.font }}>
              {h}
            </Typography>
          ))}
        </Box>

        {/* Rows */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {recentTenants.length > 0 ? (
            recentTenants.map((tenant, idx) => (
              <Box
                key={tenant.id}
                onClick={() => navigate(`/superadmin/tenants/${tenant.id}`)}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 120px 140px',
                  alignItems: 'center',
                  px: 2.5,
                  py: 1.6,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  position: 'relative',
                  bgcolor: 'transparent',
                  transition: `all 0.2s ${T.ease}`,
                  animation: `slideIn 0.4s ${T.ease} both`,
                  animationDelay: `${0.6 + idx * 0.06}s`,
                  '&::before': {
                    content: '""', position: 'absolute', left: 0, top: '20%', bottom: '20%',
                    width: '3px', borderRadius: '2px', bgcolor: T.accent, opacity: 0, transition: 'opacity 0.2s ease',
                  },
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.03)',
                    '&::before': { opacity: 1 },
                    '& .tenant-name': { color: T.accent },
                    '& .tenant-arrow': { opacity: 1, transform: 'translateX(0)' },
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, pr: 2 }}>
                  <Typography
                    className="tenant-name"
                    sx={{ fontWeight: 600, color: '#E4E4E7', fontSize: '0.875rem', fontFamily: T.font, transition: 'color 0.2s ease', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {tenant.name}
                  </Typography>
                  <EastIcon className="tenant-arrow" sx={{ fontSize: 14, color: T.accent, opacity: 0, transform: 'translateX(-4px)', transition: 'all 0.2s ease', flexShrink: 0 }} />
                </Box>
                <Typography sx={{ fontFamily: T.mono, color: T.textMuted, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tenant.slug}
                </Typography>
                <StatusDot status={tenant.status} />
                <Typography sx={{ color: T.textMuted, fontSize: '0.78rem', fontFamily: T.mono, fontVariantNumeric: 'tabular-nums' }}>
                  {new Date(tenant.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}
                </Typography>
              </Box>
            ))
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 2 }}>
              <Box sx={{ width: 64, height: 64, borderRadius: '16px', bgcolor: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BusinessIcon sx={{ fontSize: 28, color: T.textGhost }} />
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography sx={{ color: T.textMuted, fontWeight: 600, fontSize: '0.9rem', mb: 0.5, fontFamily: T.font }}>
                  아직 등록된 테넌트가 없습니다
                </Typography>
                <Typography sx={{ color: T.textGhost, fontSize: '0.8rem', fontFamily: T.font }}>
                  새로운 교회를 위한 환경을 구성해 보세요.
                </Typography>
              </Box>
              <Button
                variant="outlined"
                onClick={() => navigate('/superadmin/tenants/new')}
                sx={{
                  mt: 0.5, textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', borderRadius: '8px',
                  borderColor: 'rgba(20,184,166,0.3)', color: T.accent, px: 2.5, py: 0.8, fontFamily: T.font,
                  '&:hover': { borderColor: T.accent, bgcolor: 'rgba(20,184,166,0.06)' },
                }}
              >
                새 테넌트 생성
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
