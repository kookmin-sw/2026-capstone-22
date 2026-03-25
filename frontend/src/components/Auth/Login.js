import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  Paper,
  Link,
  InputAdornment,
  IconButton,
  Fade,
  Slide
} from '@mui/material';
import { Email, Lock, Visibility, VisibilityOff, Login as LoginIcon } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { authAPI } from '../../services/api';
import masLogo from '../../assets/mas-logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const { currentSlug, tenant } = useTenant();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      // Check user role after login for redirect
      const meRes = await authAPI.me();
      const loggedInUser = meRes.data;
      if (loggedInUser.is_superadmin) {
        navigate('/superadmin');
      } else if (loggedInUser.is_admin) {
        navigate(`/${currentSlug}/admin`);
      } else {
        navigate(`/${currentSlug}`);
      }
    } catch (err) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#0f1419',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f1419 0%, #1a1f2e 50%, #2d1b3d 100%)',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '-50%',
          right: '-50%',
          width: '100%',
          height: '100%',
          background: 'radial-gradient(circle, rgba(167, 139, 250, 0.1) 0%, transparent 70%)',
          animation: 'pulse 8s ease-in-out infinite',
        },
        '@keyframes pulse': {
          '0%, 100%': { opacity: 0.5 },
          '50%': { opacity: 1 },
        },
      }}
    >
      <Container maxWidth="sm">
        <Fade in={true} timeout={800}>
          <Box>
            {/* Hero Section */}
            <Box sx={{ textAlign: 'center', mb: 6 }}>
              <Slide direction="down" in={true} timeout={600}>
                <Box
                  sx={{
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto',
                    mb: 3,
                    boxShadow: '0 12px 40px rgba(102, 126, 234, 0.4)',
                    animation: 'float 3s ease-in-out infinite',
                    '@keyframes float': {
                      '0%, 100%': { transform: 'translateY(0px)' },
                      '50%': { transform: 'translateY(-10px)' },
                    },
                  }}
                >
                  <img
                    src={masLogo}
                    alt="MAS Logo"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                </Box>
              </Slide>
              <Typography
                variant="h3"
                sx={{
                  color: 'white',
                  fontWeight: 800,
                  letterSpacing: -1,
                  mb: 1,
                  background: 'linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {tenant ? tenant.name : 'ReadyTalk'}
              </Typography>
              <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 400 }}>
                문서 검색 기반 지능형 챗봇
              </Typography>
            </Box>

            {/* Login Card */}
            <Paper
              elevation={0}
              sx={{
                p: 5,
                borderRadius: 4,
                bgcolor: '#1a1f2e',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 4 }}>
                <LoginIcon sx={{ color: '#a78bfa', fontSize: 28 }} />
                <Typography variant="h5" fontWeight="700" sx={{ color: 'white' }}>
                  {tenant ? `${tenant.name} 로그인` : '로그인'}
                </Typography>
              </Box>

              {error && (
                <Fade in={true}>
                  <Alert
                    severity="error"
                    sx={{
                      mb: 3,
                      borderRadius: 2,
                      bgcolor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#fca5a5',
                      '& .MuiAlert-icon': { color: '#ef4444' },
                    }}
                  >
                    {error}
                  </Alert>
                </Fade>
              )}

              <Box component="form" onSubmit={handleSubmit}>
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  label="이메일"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Email sx={{ color: '#a78bfa' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    mb: 3,
                    '& .MuiOutlinedInput-root': {
                      bgcolor: '#0f1419',
                      color: 'white',
                      borderRadius: 2,
                      '& fieldset': {
                        borderColor: 'rgba(255,255,255,0.1)',
                      },
                      '&:hover fieldset': {
                        borderColor: 'rgba(167, 139, 250, 0.5)',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#a78bfa',
                      },
                      // Autofill 스타일 방지
                      '& input:-webkit-autofill': {
                        WebkitBoxShadow: '0 0 0 100px #0f1419 inset',
                        WebkitTextFillColor: 'white',
                        caretColor: 'white',
                      },
                      '& input:-webkit-autofill:hover': {
                        WebkitBoxShadow: '0 0 0 100px #0f1419 inset',
                        WebkitTextFillColor: 'white',
                      },
                      '& input:-webkit-autofill:focus': {
                        WebkitBoxShadow: '0 0 0 100px #0f1419 inset',
                        WebkitTextFillColor: 'white',
                      },
                      '& input:-webkit-autofill:active': {
                        WebkitBoxShadow: '0 0 0 100px #0f1419 inset',
                        WebkitTextFillColor: 'white',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: 'rgba(255,255,255,0.7)',
                    },
                    '& .MuiInputLabel-root.Mui-focused': {
                      color: '#a78bfa',
                    },
                  }}
                />

                <TextField
                  margin="normal"
                  required
                  fullWidth
                  label="비밀번호"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Lock sx={{ color: '#a78bfa' }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          sx={{ color: 'rgba(255,255,255,0.5)' }}
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    mb: 4,
                    '& .MuiOutlinedInput-root': {
                      bgcolor: '#0f1419',
                      color: 'white',
                      borderRadius: 2,
                      '& fieldset': {
                        borderColor: 'rgba(255,255,255,0.1)',
                      },
                      '&:hover fieldset': {
                        borderColor: 'rgba(167, 139, 250, 0.5)',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#a78bfa',
                      },
                      // Autofill 스타일 방지
                      '& input:-webkit-autofill': {
                        WebkitBoxShadow: '0 0 0 100px #0f1419 inset',
                        WebkitTextFillColor: 'white',
                        caretColor: 'white',
                      },
                      '& input:-webkit-autofill:hover': {
                        WebkitBoxShadow: '0 0 0 100px #0f1419 inset',
                        WebkitTextFillColor: 'white',
                      },
                      '& input:-webkit-autofill:focus': {
                        WebkitBoxShadow: '0 0 0 100px #0f1419 inset',
                        WebkitTextFillColor: 'white',
                      },
                      '& input:-webkit-autofill:active': {
                        WebkitBoxShadow: '0 0 0 100px #0f1419 inset',
                        WebkitTextFillColor: 'white',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: 'rgba(255,255,255,0.7)',
                    },
                    '& .MuiInputLabel-root.Mui-focused': {
                      color: '#a78bfa',
                    },
                  }}
                />

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  sx={{
                    py: 1.8,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8a 100%)',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 12px 32px rgba(102, 126, 234, 0.5)',
                    },
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    borderRadius: 2,
                    transition: 'all 0.3s ease',
                    boxShadow: '0 6px 20px rgba(102, 126, 234, 0.4)',
                  }}
                >
                  로그인
                </Button>

                <Box sx={{ textAlign: 'center', mt: 4 }}>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 1 }}>
                    계정이 없으신가요?
                  </Typography>
                  <Link
                    component={RouterLink}
                    to={`/${currentSlug}/register`}
                    sx={{
                      color: '#a78bfa',
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontSize: '1rem',
                      '&:hover': {
                        color: '#c4b5fd',
                        textDecoration: 'underline',
                      },
                    }}
                  >
                    회원가입하기 →
                  </Link>
                </Box>
              </Box>
            </Paper>

            <Typography
              variant="caption"
              sx={{
                display: 'block',
                textAlign: 'center',
                color: 'rgba(255,255,255,0.3)',
                mt: 4,
              }}
            >
              © 2025 ReadyTalk Assistant. Powered by Google Gemini.
            </Typography>
          </Box>
        </Fade>
      </Container>
    </Box>
  );
}
