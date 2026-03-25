import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Typography,
  CircularProgress,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Collapse,
} from '@mui/material';
import {
  Api as ApiIcon,
  Token as TokenIcon,
  AttachMoney as MoneyIcon,
  Storage as StorageIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { superadminAPI } from '../../services/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';

/* ── Design tokens (same as DashboardPage) ── */
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

/* ── Utilities ── */
function formatCost(usd) {
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function fillDailyData(rawData, days = 30) {
  const map = {};
  rawData.forEach((d) => { map[d.date] = d; });
  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split('T')[0];
    const shortLabel = `${date.getMonth() + 1}/${date.getDate()}`;
    const entry = map[key];
    result.push({
      date: key,
      label: shortLabel,
      api_calls: entry?.api_calls || 0,
      total_tokens: entry?.total_tokens || 0,
      estimated_cost_usd: entry?.estimated_cost_usd || 0,
    });
  }
  return result;
}

const CALL_TYPE_LABELS = {
  function_calling: 'Function Calling',
  rag_search: 'RAG 검색 (LLM)',
  rag_retrieval: 'RAG 검색 (Retrieval)',
  web_search: 'Web Search',
  synthesis: '답변 생성',
  file_chat: 'File Chat',
  file_chat_rag: 'File Chat + RAG',
  file_chat_web: 'File Chat + Web',
  embedding: '문서 임베딩',
};

const CALL_TYPE_COLORS = [T.accent, T.blue, T.amber, T.violet, T.green, T.accentCyan, T.red];

/* ── ChartPanel ── */
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
        flex: 1,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        '&::before': {
          content: '""', position: 'absolute', top: '-40%', left: '50%',
          transform: 'translateX(-50%)', width: '80%', height: '60%',
          background: 'radial-gradient(ellipse, rgba(20,184,166,0.04) 0%, transparent 70%)',
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
      <Box sx={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</Box>
    </Box>
  );
}

/* ── Dark Tooltip ── */
function DarkTooltip({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <Box
      sx={{
        bgcolor: 'rgba(12,12,13,0.95)',
        border: '1px solid rgba(20,184,166,0.25)',
        borderRadius: '10px',
        px: 1.8, py: 1.2,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <Typography sx={{ color: T.textDim, fontSize: '0.68rem', fontFamily: T.mono, mb: 0.3 }}>
        {label}
      </Typography>
      <Typography sx={{ color: T.text, fontSize: '1rem', fontWeight: 700, fontFamily: T.font }}>
        {typeof payload[0].value === 'number' && payload[0].value < 1 && suffix === ''
          ? formatCost(payload[0].value)
          : `${payload[0].value.toLocaleString()}${suffix}`}
      </Typography>
    </Box>
  );
}


/* ════════════════════════════════════════════════════════════
   BILLING PAGE
   ════════════════════════════════════════════════════════════ */
export default function BillingPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState(30);
  const [expandedTenant, setExpandedTenant] = useState(null);
  const [tenantDetail, setTenantDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await superadminAPI.getBillingSummary(period);
      setSummary(res.data);
    } catch (err) {
      setError('사용량 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const handleToggleTenant = async (tenantId) => {
    if (expandedTenant === tenantId) {
      setExpandedTenant(null);
      setTenantDetail(null);
      return;
    }
    setExpandedTenant(tenantId);
    setDetailLoading(true);
    try {
      const res = await superadminAPI.getTenantBilling(tenantId, period);
      setTenantDetail(res.data);
    } catch {
      setTenantDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

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

  const statCards = [
    { label: 'API 호출', value: summary?.total_api_calls ?? 0, format: (v) => v.toLocaleString(), icon: ApiIcon, color: T.accent },
    { label: '총 토큰', value: summary?.total_tokens ?? 0, format: formatTokens, icon: TokenIcon, color: T.blue },
    { label: 'AI 비용 (추정)', value: summary?.total_estimated_cost_usd ?? 0, format: formatCost, icon: MoneyIcon, color: T.amber },
    { label: '스토리지', value: summary?.total_storage_bytes ?? 0, format: formatBytes, icon: StorageIcon, color: T.violet },
    { label: '스토리지 비용', value: summary?.total_storage_cost_usd ?? 0, format: formatCost, icon: MoneyIcon, color: T.green },
  ];

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <style>
        {`@keyframes fadeUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
          @keyframes slideIn { from { opacity:0; transform:translateX(-12px) } to { opacity:1; transform:translateX(0) } }`}
      </style>

      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', animation: `fadeUp 0.5s ${T.ease} both` }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: T.text, fontFamily: T.font, letterSpacing: '-0.03em', mb: 0.5 }}>
            사용량 / 비용
          </Typography>
          <Typography sx={{ color: T.textMuted, fontSize: '0.85rem', fontFamily: T.font }}>
            Vertex AI API 사용량과 GCS 스토리지 비용을 확인하세요.
          </Typography>
        </Box>
        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={(e, v) => v && setPeriod(v)}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              color: T.textDim,
              borderColor: T.border,
              fontFamily: T.mono,
              fontSize: '0.72rem',
              fontWeight: 600,
              px: 1.5,
              py: 0.5,
              '&.Mui-selected': {
                bgcolor: 'rgba(20,184,166,0.1)',
                color: T.accent,
                borderColor: 'rgba(20,184,166,0.3)',
                '&:hover': { bgcolor: 'rgba(20,184,166,0.15)' },
              },
              '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
            },
          }}
        >
          <ToggleButton value={7}>7D</ToggleButton>
          <ToggleButton value={14}>14D</ToggleButton>
          <ToggleButton value={30}>30D</ToggleButton>
          <ToggleButton value={90}>90D</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Stat Cards */}
      <Grid container spacing={2.5} sx={{ mb: 5 }}>
        {statCards.map((stat, index) => {
          const IconComp = stat.icon;
          return (
            <Grid item xs={12} md={4} lg={12 / 5} key={stat.label}>
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
                    <IconComp sx={{ color: stat.color, fontSize: 20 }} />
                  </Box>
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: '1.8rem', color: T.text, fontFamily: T.font, lineHeight: 1 }}>
                  {stat.format(stat.value)}
                </Typography>
                <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', bgcolor: stat.color, opacity: 0.4 }} />
              </Box>
            </Grid>
          );
        })}
      </Grid>

      {/* Tenant Usage Table */}
      <Box sx={{ animation: `fadeUp 0.5s ${T.ease} both`, animationDelay: '0.3s' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
          <Typography sx={{ fontWeight: 700, color: T.text, fontSize: '1.1rem', fontFamily: T.font }}>
            테넌트별 사용량
          </Typography>
          <Typography sx={{ color: T.textGhost, fontSize: '0.75rem', fontFamily: T.mono, letterSpacing: '0.05em' }}>
            {summary?.start_date} ~ {summary?.end_date}
          </Typography>
        </Box>

        {/* Column Headers */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '32px 1fr 100px 100px 100px 100px', gap: 0, px: 2.5, pb: 1.5 }}>
          {['', '테넌트', 'API 호출', '토큰', 'AI 비용', '스토리지'].map((h) => (
            <Typography key={h} sx={{ color: T.textGhost, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: T.font, textAlign: h === '' || h === '테넌트' ? 'left' : 'right' }}>
              {h}
            </Typography>
          ))}
        </Box>

        {/* Rows */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {(summary?.tenants ?? []).length > 0 ? (
            summary.tenants.map((tenant, idx) => (
              <Box key={tenant.tenant_id}>
                <Box
                  onClick={() => handleToggleTenant(tenant.tenant_id)}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr 100px 100px 100px 100px',
                    alignItems: 'center',
                    px: 2.5,
                    py: 1.6,
                    borderRadius: '10px',
                    cursor: 'pointer',
                    position: 'relative',
                    bgcolor: expandedTenant === tenant.tenant_id ? 'rgba(20,184,166,0.04)' : 'transparent',
                    transition: `all 0.2s ${T.ease}`,
                    animation: `slideIn 0.4s ${T.ease} both`,
                    animationDelay: `${0.35 + idx * 0.04}s`,
                    '&::before': {
                      content: '""', position: 'absolute', left: 0, top: '20%', bottom: '20%',
                      width: '3px', borderRadius: '2px', bgcolor: T.accent, opacity: expandedTenant === tenant.tenant_id ? 1 : 0, transition: 'opacity 0.2s ease',
                    },
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.03)',
                      '&::before': { opacity: 1 },
                    },
                  }}
                >
                  <IconButton size="small" sx={{ color: T.textMuted, p: 0 }}>
                    {expandedTenant === tenant.tenant_id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                  <Box sx={{ minWidth: 0, pr: 2 }}>
                    <Typography sx={{ fontWeight: 600, color: '#E4E4E7', fontSize: '0.875rem', fontFamily: T.font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tenant.tenant_name}
                    </Typography>
                    <Typography sx={{ color: T.textMuted, fontSize: '0.7rem', fontFamily: T.mono }}>{tenant.tenant_slug}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: T.textDim, fontFamily: T.mono, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {tenant.total_api_calls.toLocaleString()}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: T.textDim, fontFamily: T.mono, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatTokens(tenant.total_tokens)}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: T.amber, fontFamily: T.mono, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCost(tenant.estimated_cost_usd)}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: T.textDim, fontFamily: T.mono, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatBytes(tenant.storage_bytes)}
                  </Typography>
                </Box>

                {/* Expanded Detail */}
                <Collapse in={expandedTenant === tenant.tenant_id} timeout="auto">
                  <Box sx={{ px: 2.5, py: 2, ml: 4 }}>
                    {detailLoading ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                        <CircularProgress size={24} sx={{ color: T.accent }} />
                      </Box>
                    ) : tenantDetail ? (
                      <TenantDetailView detail={tenantDetail} period={period} />
                    ) : null}
                  </Box>
                </Collapse>
              </Box>
            ))
          ) : (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography sx={{ color: T.textGhost, fontSize: '0.85rem', fontFamily: T.font }}>
                아직 사용량 데이터가 없습니다. 챗봇 사용 시 자동으로 기록됩니다.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}


/* ── Tenant Detail View (expanded row) ── */
function TenantDetailView({ detail, period }) {
  const dailyData = fillDailyData(detail.daily_usage, period);
  const maxCost = Math.max(...dailyData.map((d) => d.estimated_cost_usd), 0.001);
  const callTypes = detail.call_type_breakdown || [];
  const models = detail.model_breakdown || [];

  return (
    <Grid container spacing={2}>
      {/* Daily Cost Chart */}
      <Grid item xs={12} lg={8} sx={{ display: 'flex' }}>
        <ChartPanel title="일별 비용" tag={`LAST ${period} DAYS`} delay="0s">
          <Box sx={{ width: '100%', flex: 1, minHeight: 200 }}>
            <ResponsiveContainer>
              <BarChart data={dailyData} margin={{ top: 8, right: 4, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.amber} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={T.amber} stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: T.textGhost, fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
                  interval={period > 14 ? 3 : 1}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: T.textGhost, fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
                  tickFormatter={(v) => `$${v < 0.01 ? v.toFixed(4) : v.toFixed(2)}`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <Box sx={{ bgcolor: 'rgba(12,12,13,0.95)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', px: 1.8, py: 1.2, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                        <Typography sx={{ color: T.textDim, fontSize: '0.68rem', fontFamily: T.mono, mb: 0.3 }}>{label}</Typography>
                        <Typography sx={{ color: T.amber, fontSize: '0.95rem', fontWeight: 700, fontFamily: T.font }}>{formatCost(d.estimated_cost_usd)}</Typography>
                        <Typography sx={{ color: T.textDim, fontSize: '0.7rem', fontFamily: T.mono, mt: 0.3 }}>{d.api_calls} calls / {formatTokens(d.total_tokens)} tokens</Typography>
                      </Box>
                    );
                  }}
                  cursor={{ fill: 'rgba(245,158,11,0.06)', radius: 6 }}
                />
                <Bar dataKey="estimated_cost_usd" radius={[4, 4, 1, 1]} maxBarSize={24}>
                  {dailyData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.estimated_cost_usd > 0 ? 'url(#costGrad)' : 'rgba(255,255,255,0.03)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </ChartPanel>
      </Grid>

      {/* Call Type Distribution */}
      <Grid item xs={12} lg={4} sx={{ display: 'flex' }}>
        <ChartPanel title="호출 유형" tag="DISTRIBUTION" delay="0.1s">
          <Box sx={{ width: '100%', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {callTypes.length > 0 ? (
              <>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={callTypes}
                      dataKey="count"
                      nameKey="call_type"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                      strokeWidth={0}
                      cornerRadius={3}
                    >
                      {callTypes.map((_, i) => (
                        <Cell key={i} fill={CALL_TYPE_COLORS[i % CALL_TYPE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <Box sx={{ bgcolor: 'rgba(12,12,13,0.95)', border: `1px solid ${T.border}`, borderRadius: '10px', px: 1.8, py: 1.2, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                            <Typography sx={{ color: T.textDim, fontSize: '0.7rem', fontFamily: T.font }}>{CALL_TYPE_LABELS[d.call_type] || d.call_type}</Typography>
                            <Typography sx={{ color: T.text, fontSize: '0.9rem', fontWeight: 700, fontFamily: T.font }}>{d.count.toLocaleString()} calls</Typography>
                            <Typography sx={{ color: T.amber, fontSize: '0.75rem', fontFamily: T.mono }}>{formatCost(d.estimated_cost_usd)}</Typography>
                          </Box>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center */}
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: T.text, fontFamily: T.font, lineHeight: 1 }}>
                    {callTypes.reduce((s, c) => s + c.count, 0).toLocaleString()}
                  </Typography>
                  <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, color: T.textDim, fontFamily: T.mono, letterSpacing: '0.1em', mt: 0.3 }}>
                    CALLS
                  </Typography>
                </Box>
              </>
            ) : (
              <Typography sx={{ color: T.textGhost, fontSize: '0.8rem', fontFamily: T.font }}>데이터 없음</Typography>
            )}
          </Box>
          {/* Legend */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1, justifyContent: 'center' }}>
            {callTypes.map((ct, i) => (
              <Box key={ct.call_type} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '2px', bgcolor: CALL_TYPE_COLORS[i % CALL_TYPE_COLORS.length] }} />
                <Typography sx={{ color: T.textDim, fontSize: '0.65rem', fontFamily: T.font, fontWeight: 500 }}>
                  {CALL_TYPE_LABELS[ct.call_type] || ct.call_type}
                </Typography>
              </Box>
            ))}
          </Box>
        </ChartPanel>
      </Grid>

      {/* Model Breakdown */}
      <Grid item xs={12}>
        <ChartPanel title="모델별 사용량" tag="BREAKDOWN" delay="0.2s">
          {models.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {models.map((m, i) => {
                const maxTokens = Math.max(...models.map((x) => x.total_tokens), 1);
                const pct = (m.total_tokens / maxTokens) * 100;
                return (
                  <Box key={m.model_name} sx={{ display: 'grid', gridTemplateColumns: '200px 1fr 80px 80px', alignItems: 'center', gap: 2 }}>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: i === 0 ? T.accent : T.text, fontFamily: T.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.model_name}
                    </Typography>
                    <Box sx={{ position: 'relative', height: 20, borderRadius: '6px', bgcolor: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
                      <Box
                        sx={{
                          position: 'absolute', left: 0, top: 0, bottom: 0,
                          width: `${Math.max(pct, 2)}%`, borderRadius: '6px',
                          background: i === 0
                            ? `linear-gradient(90deg, ${T.accent}, ${T.accentCyan})`
                            : 'linear-gradient(90deg, rgba(20,184,166,0.4), rgba(6,182,212,0.15))',
                          transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)',
                        }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: T.textDim, fontFamily: T.mono, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatTokens(m.total_tokens)}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: T.amber, fontFamily: T.mono, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCost(m.estimated_cost_usd)}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Typography sx={{ color: T.textGhost, fontSize: '0.8rem', fontFamily: T.font, py: 2, textAlign: 'center' }}>데이터 없음</Typography>
          )}
        </ChartPanel>
      </Grid>

      {/* Token Breakdown Summary */}
      <Grid item xs={12}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
          {[
            { label: '입력 토큰', value: formatTokens(detail.total_prompt_tokens), color: T.blue },
            { label: '출력 토큰', value: formatTokens(detail.total_completion_tokens), color: T.accentCyan },
            { label: 'AI 비용 합계', value: formatCost(detail.estimated_cost_usd), color: T.amber },
            { label: '스토리지 비용', value: formatCost(detail.storage_cost_usd), color: T.green },
          ].map((item) => (
            <Box
              key={item.label}
              sx={{
                bgcolor: T.card, border: `1px solid ${T.border}`, borderRadius: '12px',
                p: 2, textAlign: 'center',
              }}
            >
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: T.textMuted, fontFamily: T.font, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5 }}>
                {item.label}
              </Typography>
              <Typography sx={{ fontSize: '1.2rem', fontWeight: 800, color: item.color, fontFamily: T.font }}>
                {item.value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Grid>
    </Grid>
  );
}
