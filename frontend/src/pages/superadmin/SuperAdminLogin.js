import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { glowButtonSx } from './styles';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
  Fade,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';

const SuperAdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await login(email.trim(), password);
      if (response && response.is_superadmin) {
        navigate('/superadmin');
      } else {
        setError('슈퍼 관리자 권한이 없습니다.');
      }
    } catch (err) {
      const msg = err.response?.data?.detail || '로그인에 실패했습니다.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: '12px',
      backgroundColor: '#111113',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      color: '#FAFAFA',
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
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: '#14B8A6',
    },
    '& .MuiInputBase-input': {
      color: '#FAFAFA',
      '&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus': {
        WebkitBoxShadow: '0 0 0 1000px #111113 inset',
        WebkitTextFillColor: '#FAFAFA',
        caretColor: '#FAFAFA',
        borderRadius: '12px',
      },
    },
    '& .MuiInputBase-input::placeholder': {
      color: '#52525B',
    },
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#09090B',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* Font import */}
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
          @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        `}
      </style>

      {/* Ambient orb - teal top-right */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '100%',
          height: '100%',
          background:
            'radial-gradient(600px circle at 85% 10%, rgba(20,184,166,0.07) 0%, transparent 50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Ambient orb - warm bottom-left */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background:
            'radial-gradient(500px circle at 15% 90%, rgba(245,158,11,0.03) 0%, transparent 50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Centered form */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 420,
          px: { xs: 3, sm: 0 },
        }}
      >
        {/* Signal light dot */}
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: '#14B8A6',
            boxShadow: '0 0 20px rgba(20,184,166,0.5)',
            mx: 'auto',
            mb: 3,
            opacity: 0,
            animation: 'fadeUp 0.5s ease forwards',
            animationDelay: '0.1s',
          }}
        />

        {/* Brand name */}
        <Typography
          variant="h3"
          sx={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 800,
            color: '#FAFAFA',
            letterSpacing: '-0.03em',
            textAlign: 'center',
            fontSize: { xs: '1.75rem', md: '2rem' },
            opacity: 0,
            animation: 'fadeUp 0.5s ease forwards',
            animationDelay: '0.2s',
          }}
        >
          ReadyTalk
        </Typography>

        {/* ADMIN CONSOLE overline */}
        <Typography
          sx={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.2em',
            color: '#14B8A6',
            textAlign: 'center',
            mt: 1,
            opacity: 0,
            animation: 'fadeUp 0.5s ease forwards',
            animationDelay: '0.3s',
          }}
        >
          ADMIN CONSOLE
        </Typography>

        {/* Divider */}
        <Box
          sx={{
            height: '1px',
            backgroundColor: 'rgba(255,255,255,0.06)',
            my: 4,
            opacity: 0,
            animation: 'fadeUp 0.5s ease forwards',
            animationDelay: '0.4s',
          }}
        />

        {/* Error Alert */}
        {error && (
          <Fade in>
            <Alert
              severity="error"
              icon={false}
              sx={{
                mb: 3,
                borderRadius: '12px',
                backgroundColor: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#FCA5A5',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: '0.875rem',
              }}
            >
              {error}
            </Alert>
          </Fade>
        )}

        {/* Login Form */}
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{
            opacity: 0,
            animation: 'fadeUp 0.5s ease forwards',
            animationDelay: '0.5s',
          }}
        >
          <TextField
            fullWidth
            label="이메일"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
            variant="outlined"
            sx={{ ...inputSx, mb: 2 }}
          />

          <TextField
            fullWidth
            label="비밀번호"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            variant="outlined"
            sx={{ ...inputSx, mb: 3 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                    size="small"
                    sx={{ color: '#52525B' }}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Button
            fullWidth
            type="submit"
            variant="contained"
            disabled={isLoading}
            disableElevation
            sx={{
              ...glowButtonSx,
              py: 1.5,
              borderRadius: '12px',
              fontSize: '1rem',
            }}
          >
            {isLoading ? (
              <CircularProgress size={24} sx={{ color: '#09090B' }} />
            ) : (
              '로그인'
            )}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default SuperAdminLogin;
