import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Dialog,
  DialogContent,
  DialogActions,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Business as BusinessIcon,
  Cloud as CloudIcon,
  CheckCircle as CheckCircleIcon,
  ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import { superadminAPI } from '../../services/api';
import { glowButtonSx, outlineButtonSx } from './styles';
import ProvisioningProgress from '../../components/superadmin/ProvisioningProgress';

const fadeUp = {
  '@keyframes fadeUp': {
    from: { opacity: 0, transform: 'translateY(16px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
};

const darkInputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '12px',
    bgcolor: '#111113',
    color: '#FAFAFA',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.06)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
    '&.Mui-focused fieldset': { borderColor: '#14B8A6' },
  },
  '& .MuiInputBase-input:-webkit-autofill': {
    WebkitBoxShadow: '0 0 0 100px #111113 inset',
    WebkitTextFillColor: '#FAFAFA',
    caretColor: '#FAFAFA',
    borderRadius: 'inherit',
  },
  '& .MuiInputBase-input': {
    color: '#FAFAFA',
    '&::placeholder': { color: '#52525B', opacity: 1 },
  },
  '& .MuiInputLabel-root': {
    color: '#A1A1AA',
    '&.Mui-focused': { color: '#14B8A6' },
  },
  '& .MuiFormHelperText-root': {
    color: '#52525B',
  },
};

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function TenantCreatePage() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [searchBackend, setSearchBackend] = useState('vertex_ai_search');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdInfo, setCreatedInfo] = useState(null);
  const [copiedField, setCopiedField] = useState('');
  const navigate = useNavigate();

  const handleNameChange = (e) => {
    const val = e.target.value;
    setName(val);
    setSlug(slugify(val));
  };

  const handleCopy = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    setLoading(true);
    setError('');
    try {
      const res = await superadminAPI.createTenant({ name: name.trim(), slug: slug.trim(), search_backend: searchBackend });
      setCreatedInfo({
        tenant: res.data,
        email: `admin@readytalk-${slug.trim()}.com`,
        password: `readytalk-${slug.trim()}-2026!`,
      });
    } catch (err) {
      setError(err.response?.data?.detail || '테넌트 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', py: 2, ...fadeUp }}>
      {/* Header */}
      <Box
        sx={{
          mb: 4,
          animation: 'fadeUp 0.4s ease both',
          animationDelay: '0s',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <IconButton
            onClick={() => navigate('/superadmin/tenants')}
            sx={{
              color: '#71717A',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', color: '#FAFAFA' },
            }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              color: '#FAFAFA',
              letterSpacing: '-0.03em',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            새 테넌트 생성
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ color: '#71717A', ml: 6.5 }}>
          새로운 테넌트를 위한 독립 환경을 구성합니다.
        </Typography>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 3,
            borderRadius: 3,
            bgcolor: 'rgba(239,68,68,0.1)',
            color: '#EF4444',
            border: '1px solid rgba(239,68,68,0.2)',
            '& .MuiAlert-icon': { color: '#EF4444' },
          }}
        >
          {error}
        </Alert>
      )}

      {/* Form Card */}
      <Box
        sx={{
          bgcolor: '#18181B',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.06)',
          p: 5,
          animation: 'fadeUp 0.4s ease both',
          animationDelay: '0.1s',
        }}
      >
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

            {/* Section 1 - 기본 정보 */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
                <BusinessIcon sx={{ color: '#14B8A6', fontSize: 20 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#A1A1AA' }}>
                  기본 정보
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <TextField
                  label="테넌트 이름"
                  value={name}
                  onChange={handleNameChange}
                  fullWidth
                  required
                  disabled={loading}
                  placeholder="예: ReadyTalk"
                  variant="outlined"
                  sx={darkInputSx}
                />
                <TextField
                  label="Slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  fullWidth
                  required
                  disabled={loading}
                  variant="outlined"
                  helperText="URL 및 리소스 생성에 사용되는 고유 식별자"
                  InputProps={{
                    sx: { fontFamily: "'JetBrains Mono', monospace" },
                    startAdornment: (
                      <InputAdornment position="start">
                        <Typography
                          variant="body2"
                          sx={{
                            color: '#52525B',
                            fontFamily: "'JetBrains Mono', monospace",
                            whiteSpace: 'nowrap',
                          }}
                        >
                          readytalk.com/
                        </Typography>
                      </InputAdornment>
                    ),
                  }}
                  sx={darkInputSx}
                />

                {/* Search Backend Selection */}
                <Box>
                  <Typography variant="body2" sx={{ color: '#A1A1AA', mb: 1, fontWeight: 600 }}>
                    검색 엔진
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1.5 }}>
                    {[
                      { value: 'vertex_ai_search', label: 'Vertex AI Search', desc: 'Google 관리형 · 하이브리드 검색 내장' },
                      { value: 'rag_engine', label: 'RAG Engine + Weaviate', desc: '자체 호스팅 · 커스터마이징 가능' },
                    ].map((opt) => (
                      <Box
                        key={opt.value}
                        onClick={() => !loading && setSearchBackend(opt.value)}
                        sx={{
                          flex: 1,
                          p: 2,
                          borderRadius: '12px',
                          border: searchBackend === opt.value ? '1.5px solid #14B8A6' : '1px solid rgba(255,255,255,0.06)',
                          bgcolor: searchBackend === opt.value ? 'rgba(20,184,166,0.05)' : '#111113',
                          cursor: loading ? 'default' : 'pointer',
                          transition: 'all 0.2s',
                          '&:hover': loading ? {} : { borderColor: 'rgba(255,255,255,0.15)' },
                        }}
                      >
                        <Typography sx={{ color: searchBackend === opt.value ? '#14B8A6' : '#FAFAFA', fontWeight: 700, fontSize: '0.85rem', mb: 0.5 }}>
                          {opt.label}
                        </Typography>
                        <Typography sx={{ color: '#52525B', fontSize: '0.75rem' }}>
                          {opt.desc}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                  <Typography sx={{ color: '#F97316', fontSize: '0.7rem', mt: 0.75, fontWeight: 600 }}>
                    ⚠ 생성 후 변경 불가
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Section 2 - 프로비저닝 */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
                <CloudIcon sx={{ color: '#14B8A6', fontSize: 20 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#A1A1AA' }}>
                  프로비저닝
                </Typography>
              </Box>
              <ProvisioningProgress isCreating={loading} isSuccess={!!createdInfo} />
            </Box>

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 1 }}>
              <Button
                variant="outlined"
                onClick={() => navigate('/superadmin/tenants')}
                disabled={loading}
                sx={{
                  px: 3,
                  py: 1.2,
                  borderRadius: '10px',
                  borderColor: 'rgba(255,255,255,0.1)',
                  color: '#A1A1AA',
                  textTransform: 'none',
                  '&:hover': {
                    borderColor: '#FAFAFA',
                    color: '#FAFAFA',
                    bgcolor: 'transparent',
                  },
                }}
              >
                취소
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={loading || !name || !slug}
                disableElevation
                startIcon={loading ? <CircularProgress size={20} sx={{ color: '#09090B' }} /> : null}
                sx={{
                  ...glowButtonSx,
                  px: 4,
                  py: 1.2,
                }}
              >
                {loading ? '생성 중...' : '테넌트 생성하기'}
              </Button>
            </Box>

          </Box>
        </Box>
      </Box>

      {/* Success Dialog */}
      <Dialog
        open={!!createdInfo}
        onClose={() => {}}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#18181B',
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.06)',
            p: 1,
          },
        }}
      >
        <DialogContent sx={{ textAlign: 'center', pt: 5, px: 4, pb: 2 }}>
          <CheckCircleIcon sx={{ fontSize: 64, color: '#10B981', mb: 2 }} />
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              color: '#FAFAFA',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
            gutterBottom
          >
            생성 완료!
          </Typography>
          <Typography variant="body2" sx={{ color: '#71717A', mb: 3 }}>
            새로운 테넌트 환경이 성공적으로 구성되었습니다.
          </Typography>

          {/* Info Card */}
          <Box
            sx={{
              bgcolor: '#111113',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.06)',
              p: 3,
              textAlign: 'left',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" sx={{ color: '#71717A' }}>교회 이름</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#FAFAFA' }}>
                {createdInfo?.tenant?.name}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" sx={{ color: '#71717A' }}>Slug</Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: '#FAFAFA',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {createdInfo?.tenant?.slug}
              </Typography>
            </Box>

            <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.06)' }} />

            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#14B8A6', mb: 2 }}>
              관리자 초기 계정
            </Typography>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" sx={{ color: '#71717A' }}>Email</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    color: '#FAFAFA',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {createdInfo?.email}
                </Typography>
                <Tooltip title={copiedField === 'email' ? '복사됨!' : '복사'}>
                  <IconButton
                    size="small"
                    onClick={() => handleCopy(createdInfo?.email, 'email')}
                    sx={{ color: '#52525B', '&:hover': { color: '#14B8A6' } }}
                  >
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: '#71717A' }}>Password</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    color: '#FAFAFA',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {createdInfo?.password}
                </Typography>
                <Tooltip title={copiedField === 'password' ? '복사됨!' : '복사'}>
                  <IconButton
                    size="small"
                    onClick={() => handleCopy(createdInfo?.password, 'password')}
                    sx={{ color: '#52525B', '&:hover': { color: '#14B8A6' } }}
                  >
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            <Typography variant="caption" sx={{ color: '#71717A', display: 'block', mt: 2 }}>
              * 생성 후 반드시 비밀번호를 변경하세요.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 4, pb: 4, gap: 1.5 }}>
          <Button
            variant="outlined"
            fullWidth
            onClick={() => navigate(`/superadmin/tenants/${createdInfo?.tenant?.id}`)}
            sx={{
              ...outlineButtonSx,
              py: 1.2,
              borderColor: 'rgba(20,184,166,0.3)',
              color: '#14B8A6',
            }}
          >
            테넌트 상세보기
          </Button>
          <Button
            variant="contained"
            fullWidth
            disableElevation
            onClick={() => navigate('/superadmin/tenants')}
            sx={{
              ...glowButtonSx,
              py: 1.2,
            }}
          >
            목록으로
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
