import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Fade,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import {
  CheckCircle,
  PhoneAndroid,
  VerifiedUser,
} from '@mui/icons-material';
import { useTenant } from '../context/TenantContext';
import { verifyAPI } from '../services/api';

const STEP = { PHONE: 'phone', OTP: 'otp', DONE: 'done' };

const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: '#0f1419',
    color: 'white',
    borderRadius: 2,
    '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
    '&:hover fieldset': { borderColor: 'rgba(167, 139, 250, 0.5)' },
    '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
  },
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
};

export default function VerifyPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { tenant } = useTenant();

  const [step, setStep] = useState(STEP.PHONE);
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [issuedOtp, setIssuedOtp] = useState('');
  const [linkedStudents, setLinkedStudents] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // token이 없으면 잘못된 접근으로 안내
  if (!token) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f1419 0%, #1a1f2e 50%, #2d1b3d 100%)',
        }}
      >
        <Alert severity="error" sx={{ maxWidth: 400 }}>
          유효하지 않은 접근입니다. 카카오 채팅에서 본인 확인 링크를 다시 받아주세요.
        </Alert>
      </Box>
    );
  }

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await verifyAPI.request(slug, token, phone);
      setIssuedOtp(res.data.otp_code);
      setStep(STEP.OTP);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || 'OTP 요청 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await verifyAPI.confirm(slug, token, phone, otpCode);
      setLinkedStudents(res.data.linked_students);
      localStorage.setItem('verification_done', '1');
      setStep(STEP.DONE);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || 'OTP 확인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f1419 0%, #1a1f2e 50%, #2d1b3d 100%)',
      }}
    >
      <Container maxWidth="sm">
        <Fade in timeout={600}>
          <Box>
            {/* 헤더 */}
            <Box sx={{ textAlign: 'center', mb: 5 }}>
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                  mb: 3,
                  boxShadow: '0 12px 40px rgba(102, 126, 234, 0.4)',
                }}
              >
                <VerifiedUser sx={{ color: 'white', fontSize: 36 }} />
              </Box>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  mb: 1,
                }}
              >
                {tenant ? tenant.name : '학원'} 본인 확인
              </Typography>
              <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                학생 정보 조회를 위한 학부모 인증
              </Typography>
            </Box>

            <Paper
              elevation={0}
              sx={{
                p: 5,
                borderRadius: 4,
                bgcolor: '#1a1f2e',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {/* STEP 1: 전화번호 입력 */}
              {step === STEP.PHONE && (
                <Fade in>
                  <Box component="form" onSubmit={handleRequestOtp}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                      <PhoneAndroid sx={{ color: '#a78bfa' }} />
                      <Typography variant="h6" fontWeight={700} sx={{ color: 'white' }}>
                        학부모 전화번호 입력
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 3 }}>
                      학원에 등록된 학부모 전화번호를 입력하세요.
                    </Typography>

                    {error && (
                      <Alert
                        severity="error"
                        sx={{
                          mb: 3,
                          borderRadius: 2,
                          bgcolor: 'rgba(239,68,68,0.1)',
                          border: '1px solid rgba(239,68,68,0.3)',
                          color: '#fca5a5',
                          '& .MuiAlert-icon': { color: '#ef4444' },
                        }}
                      >
                        {error}
                      </Alert>
                    )}

                    <TextField
                      fullWidth
                      required
                      label="전화번호"
                      placeholder="010-1234-5678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      sx={{ ...inputSx, mb: 3 }}
                    />

                    <Button
                      type="submit"
                      fullWidth
                      variant="contained"
                      size="large"
                      disabled={loading}
                      sx={{
                        py: 1.8,
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8a 100%)',
                          transform: 'translateY(-2px)',
                          boxShadow: '0 12px 32px rgba(102,126,234,0.5)',
                        },
                        fontWeight: 700,
                        borderRadius: 2,
                        transition: 'all 0.3s ease',
                      }}
                    >
                      {loading ? <CircularProgress size={24} color="inherit" /> : '인증번호 받기'}
                    </Button>
                  </Box>
                </Fade>
              )}

              {/* STEP 2: OTP 확인 */}
              {step === STEP.OTP && (
                <Fade in>
                  <Box component="form" onSubmit={handleConfirmOtp}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                      <PhoneAndroid sx={{ color: '#a78bfa' }} />
                      <Typography variant="h6" fontWeight={700} sx={{ color: 'white' }}>
                        인증번호 확인
                      </Typography>
                    </Box>

                    {/* 개발용 OTP 코드 표시 */}
                    <Box
                      sx={{
                        p: 2,
                        mb: 3,
                        borderRadius: 2,
                        bgcolor: 'rgba(167,139,250,0.1)',
                        border: '1px solid rgba(167,139,250,0.3)',
                        textAlign: 'center',
                      }}
                    >
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 0.5 }}>
                        인증 코드
                      </Typography>
                      <Typography
                        variant="h4"
                        sx={{ color: '#a78bfa', fontWeight: 800, letterSpacing: 4 }}
                      >
                        {issuedOtp}
                      </Typography>
                    </Box>

                    {error && (
                      <Alert
                        severity="error"
                        sx={{
                          mb: 3,
                          borderRadius: 2,
                          bgcolor: 'rgba(239,68,68,0.1)',
                          border: '1px solid rgba(239,68,68,0.3)',
                          color: '#fca5a5',
                          '& .MuiAlert-icon': { color: '#ef4444' },
                        }}
                      >
                        {error}
                      </Alert>
                    )}

                    <TextField
                      fullWidth
                      required
                      label="인증번호 입력"
                      placeholder="6자리 숫자"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      inputProps={{ maxLength: 6 }}
                      sx={{ ...inputSx, mb: 3 }}
                    />

                    <Button
                      type="submit"
                      fullWidth
                      variant="contained"
                      size="large"
                      disabled={loading}
                      sx={{
                        py: 1.8,
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8a 100%)',
                          transform: 'translateY(-2px)',
                          boxShadow: '0 12px 32px rgba(102,126,234,0.5)',
                        },
                        fontWeight: 700,
                        borderRadius: 2,
                        transition: 'all 0.3s ease',
                        mb: 2,
                      }}
                    >
                      {loading ? <CircularProgress size={24} color="inherit" /> : '확인'}
                    </Button>

                    <Button
                      fullWidth
                      variant="text"
                      size="small"
                      onClick={() => { setStep(STEP.PHONE); setError(''); setIssuedOtp(''); }}
                      sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: 'rgba(255,255,255,0.7)' } }}
                    >
                      전화번호 다시 입력
                    </Button>
                  </Box>
                </Fade>
              )}

              {/* STEP 3: 완료 */}
              {step === STEP.DONE && (
                <Fade in>
                  <Box sx={{ textAlign: 'center' }}>
                    <CheckCircle sx={{ fontSize: 64, color: '#4ade80', mb: 2 }} />
                    <Typography variant="h5" fontWeight={700} sx={{ color: 'white', mb: 1 }}>
                      인증이 완료되었습니다!
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 3 }}>
                      아래 학생 정보 조회가 허용되었습니다.
                    </Typography>

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', mb: 4 }}>
                      {linkedStudents.map((name) => (
                        <Chip
                          key={name}
                          label={name}
                          sx={{
                            bgcolor: 'rgba(74,222,128,0.15)',
                            color: '#4ade80',
                            border: '1px solid rgba(74,222,128,0.3)',
                            fontWeight: 600,
                          }}
                        />
                      ))}
                    </Box>

                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                      카카오 채팅으로 돌아가서 다시 질문해 주세요.
                    </Typography>
                  </Box>
                </Fade>
              )}
            </Paper>
          </Box>
        </Fade>
      </Container>
    </Box>
  );
}
