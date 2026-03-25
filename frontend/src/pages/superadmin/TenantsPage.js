import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Business as BusinessIcon,
  Search as SearchIcon,
  East as EastIcon,
} from '@mui/icons-material';
import { superadminAPI } from '../../services/api';
import { glowButtonSx } from './styles';

const statusConfig = {
  active: { label: 'Active', color: '#10B981', glow: 'rgba(16,185,129,0.6)' },
  suspended: { label: 'Suspended', color: '#F59E0B', glow: 'rgba(245,158,11,0.6)' },
  deactivated: { label: 'Inactive', color: '#EF4444', glow: 'rgba(239,68,68,0.6)' },
};

const TAB_FILTERS = ['all', 'active', 'suspended', 'deactivated'];
const TAB_LABELS = ['전체', 'Active', 'Suspended', 'Inactive'];

function StatusDot({ status }) {
  const cfg = statusConfig[status] || statusConfig.deactivated;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
      <Box
        sx={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          bgcolor: cfg.color,
          boxShadow: `0 0 8px ${cfg.glow}`,
          flexShrink: 0,
        }}
      />
      <Typography
        sx={{
          color: cfg.color,
          fontSize: '0.75rem',
          fontWeight: 600,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        {cfg.label}
      </Typography>
    </Box>
  );
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTenants = async () => {
      try {
        const res = await superadminAPI.listTenants();
        setTenants(res.data);
      } catch (err) {
        setError('테넌트 목록을 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };
    fetchTenants();
  }, []);

  const filteredTenants = useMemo(() => {
    let result = tenants;
    if (activeFilter !== 'all') {
      result = result.filter((t) => t.status === activeFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)
      );
    }
    return result;
  }, [tenants, activeFilter, search]);

  const tabCounts = useMemo(() => {
    const counts = { all: tenants.length, active: 0, suspended: 0, deactivated: 0 };
    tenants.forEach((t) => {
      if (counts[t.status] !== undefined) counts[t.status]++;
    });
    return counts;
  }, [tenants]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress sx={{ color: '#14B8A6' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <style>
        {`@keyframes fadeUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
          @keyframes slideIn { from { opacity:0; transform:translateX(-12px) } to { opacity:1; transform:translateX(0) } }`}
      </style>

      {/* Header row */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 4,
          animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              color: '#FAFAFA',
              letterSpacing: '-0.03em',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            테넌트 관리
          </Typography>
          <Typography
            sx={{
              color: '#3F3F46',
              fontSize: '0.8rem',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {tenants.length} total
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <TextField
            size="small"
            variant="outlined"
            placeholder="검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: '#3F3F46', fontSize: 18 }} />
                </InputAdornment>
              ),
            }}
            sx={{
              width: 220,
              '& .MuiOutlinedInput-root': {
                borderRadius: '10px',
                bgcolor: '#111113',
                color: '#FAFAFA',
                height: 38,
                border: '1px solid rgba(255,255,255,0.06)',
                '& fieldset': { border: 'none' },
                '&:hover': { border: '1px solid rgba(255,255,255,0.1)' },
                '&.Mui-focused': { border: '1px solid rgba(20,184,166,0.4)' },
              },
              '& .MuiInputBase-input': {
                color: '#FAFAFA',
                fontSize: '0.85rem',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                '&::placeholder': { color: '#3F3F46', opacity: 1 },
              },
            }}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            onClick={() => navigate('/superadmin/tenants/new')}
            disableElevation
            sx={{
              ...glowButtonSx,
              px: 2.5,
              height: 38,
              fontSize: '0.85rem',
            }}
          >
            새 테넌트
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 3,
            borderRadius: '12px',
            bgcolor: 'rgba(239,68,68,0.08)',
            color: '#FCA5A5',
            border: '1px solid rgba(239,68,68,0.15)',
            '& .MuiAlert-icon': { color: '#EF4444' },
          }}
        >
          {error}
        </Alert>
      )}

      {/* Filter pills */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          mb: 3,
          animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
          animationDelay: '0.05s',
        }}
      >
        {TAB_FILTERS.map((filter, i) => {
          const isActive = activeFilter === filter;
          const count = tabCounts[filter];
          return (
            <Box
              key={filter}
              onClick={() => setActiveFilter(filter)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.8,
                px: 2,
                py: 0.8,
                borderRadius: '8px',
                cursor: 'pointer',
                bgcolor: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                border: isActive ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
                transition: 'all 0.15s ease',
                '&:hover': {
                  bgcolor: isActive ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                },
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.8rem',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#E4E4E7' : '#52525B',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  transition: 'color 0.15s ease',
                }}
              >
                {TAB_LABELS[i]}
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: isActive ? '#71717A' : '#3F3F46',
                  fontFamily: "'JetBrains Mono', monospace",
                  transition: 'color 0.15s ease',
                }}
              >
                {count}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Data grid */}
      <Box
        sx={{
          animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
          animationDelay: '0.1s',
        }}
      >
        {/* Column headers */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '48px 1.4fr 1.2fr 110px 130px 32px',
            gap: 0,
            px: 2.5,
            pb: 1.5,
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          {['#', '교회 이름', 'SLUG', '상태', '생성일', ''].map((h) => (
            <Typography
              key={h}
              sx={{
                color: '#3F3F46',
                fontSize: '0.62rem',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {h}
            </Typography>
          ))}
        </Box>

        {/* Rows */}
        <Box sx={{ display: 'flex', flexDirection: 'column', mt: 0.5 }}>
          {filteredTenants.length > 0 ? (
            filteredTenants.map((tenant, idx) => (
              <Box
                key={tenant.id}
                onClick={() => navigate(`/superadmin/tenants/${tenant.id}`)}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '48px 1.4fr 1.2fr 110px 130px 32px',
                  alignItems: 'center',
                  px: 2.5,
                  py: 1.5,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  position: 'relative',
                  bgcolor: 'transparent',
                  transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
                  animation: 'slideIn 0.35s cubic-bezier(0.16,1,0.3,1) both',
                  animationDelay: `${0.12 + idx * 0.04}s`,
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    top: '18%',
                    bottom: '18%',
                    width: '3px',
                    borderRadius: '2px',
                    bgcolor: '#14B8A6',
                    opacity: 0,
                    transition: 'opacity 0.2s ease',
                  },
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.025)',
                    '&::before': { opacity: 1 },
                    '& .row-name': { color: '#14B8A6' },
                    '& .row-arrow': { opacity: 1, transform: 'translateX(0)' },
                  },
                  '&:not(:last-child)::after': {
                    content: '""',
                    position: 'absolute',
                    bottom: 0,
                    left: 48,
                    right: 24,
                    height: '1px',
                    bgcolor: 'rgba(255,255,255,0.03)',
                  },
                }}
              >
                {/* ID */}
                <Typography
                  sx={{
                    color: '#3F3F46',
                    fontSize: '0.75rem',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {tenant.id}
                </Typography>

                {/* Name */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, pr: 2 }}>
                  <Typography
                    className="row-name"
                    sx={{
                      fontWeight: 600,
                      color: '#E4E4E7',
                      fontSize: '0.875rem',
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      transition: 'color 0.2s ease',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tenant.name}
                  </Typography>
                  <EastIcon
                    className="row-arrow"
                    sx={{
                      fontSize: 13,
                      color: '#14B8A6',
                      opacity: 0,
                      transform: 'translateX(-4px)',
                      transition: 'all 0.2s ease',
                      flexShrink: 0,
                    }}
                  />
                </Box>

                {/* Slug */}
                <Typography
                  sx={{
                    fontFamily: "'JetBrains Mono', monospace",
                    color: '#52525B',
                    fontSize: '0.78rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    pr: 1,
                  }}
                >
                  {tenant.slug}
                </Typography>

                {/* Status */}
                <StatusDot status={tenant.status} />

                {/* Date */}
                <Typography
                  sx={{
                    color: '#3F3F46',
                    fontSize: '0.75rem',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {new Date(tenant.created_at).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Typography>

                {/* Arrow placeholder for alignment */}
                <Box />
              </Box>
            ))
          ) : (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                py: 10,
                gap: 2,
              }}
            >
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: '20px',
                  bgcolor: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <BusinessIcon sx={{ fontSize: 32, color: '#3F3F46' }} />
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography
                  sx={{
                    color: '#52525B',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    mb: 0.5,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  {search ? '검색 결과가 없습니다' : '등록된 테넌트가 없습니다'}
                </Typography>
                <Typography
                  sx={{
                    color: '#3F3F46',
                    fontSize: '0.8rem',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  {search ? '다른 키워드로 검색해 보세요.' : '새로운 교회를 위한 환경을 구성해 보세요.'}
                </Typography>
              </Box>
              {!search && (
                <Button
                  variant="outlined"
                  startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                  onClick={() => navigate('/superadmin/tenants/new')}
                  sx={{
                    mt: 0.5,
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    borderRadius: '8px',
                    borderColor: 'rgba(20,184,166,0.3)',
                    color: '#14B8A6',
                    px: 2.5,
                    py: 0.8,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    '&:hover': {
                      borderColor: '#14B8A6',
                      bgcolor: 'rgba(20,184,166,0.06)',
                    },
                  }}
                >
                  새 테넌트 생성
                </Button>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
