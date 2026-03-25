import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { Check, CheckCircle } from '@mui/icons-material';

const steps = [
  '테넌트 레코드 생성',
  '기본 그룹 생성',
  '관리자 계정 생성',
];

export default function ProvisioningProgress({ isCreating, isSuccess }) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (isSuccess) {
      setCurrentStep(steps.length);
      return;
    }

    if (!isCreating) {
      setCurrentStep(0);
      return;
    }

    setCurrentStep(0);

    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      if (step > 2) {
        clearInterval(timer);
        return;
      }
      setCurrentStep(step);
    }, 600);

    return () => clearInterval(timer);
  }, [isCreating, isSuccess]);

  const getStepState = (index) => {
    if (isSuccess) return 'done';
    if (!isCreating) return 'idle';
    if (index < currentStep) return 'done';
    if (index === currentStep) return 'active';
    return 'idle';
  };

  const getLineState = (index) => {
    if (isSuccess) return 'done';
    if (!isCreating) return 'idle';
    if (index < currentStep) return 'done';
    if (index === currentStep) return 'active';
    return 'idle';
  };

  return (
    <Box sx={{ py: 2 }}>
      {steps.map((label, index) => {
        const state = getStepState(index);
        const lineState = getLineState(index);
        const isLast = index === steps.length - 1;

        return (
          <Box key={label}>
            {/* Step row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {/* Circle */}
              {state === 'done' && (
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    bgcolor: '#10B981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Check sx={{ color: '#09090B', fontSize: 16 }} />
                </Box>
              )}
              {state === 'active' && (
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    bgcolor: '#14B8A6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 0 16px rgba(20,184,166,0.3)',
                  }}
                >
                  <CircularProgress size={16} sx={{ color: '#09090B' }} />
                </Box>
              )}
              {state === 'idle' && (
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    bgcolor: 'transparent',
                    border: '2px solid #27272A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#52525B',
                      lineHeight: 1,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {index + 1}
                  </Typography>
                </Box>
              )}

              {/* Label */}
              <Typography
                sx={{
                  fontSize: 14,
                  fontWeight: state === 'active' ? 600 : 400,
                  color:
                    state === 'done'
                      ? '#A1A1AA'
                      : state === 'active'
                        ? '#14B8A6'
                        : '#52525B',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                {label}
              </Typography>
            </Box>

            {/* Connecting line */}
            {!isLast && (
              <Box
                sx={{
                  width: 2,
                  height: 20,
                  ml: '13px',
                  background:
                    lineState === 'done'
                      ? '#10B981'
                      : lineState === 'active'
                        ? 'linear-gradient(to bottom, #10B981, #27272A)'
                        : '#27272A',
                }}
              />
            )}
          </Box>
        );
      })}

      {/* Status message */}
      {isSuccess && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 2.5,
            ml: '2px',
          }}
        >
          <CheckCircle sx={{ color: '#10B981', fontSize: 20 }} />
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 600,
              color: '#10B981',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            프로비저닝 완료
          </Typography>
        </Box>
      )}

      {!isCreating && !isSuccess && (
        <Box sx={{ mt: 2.5, ml: '2px' }}>
          <Typography
            sx={{
              fontSize: 14,
              color: '#52525B',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            생성 대기 중
          </Typography>
        </Box>
      )}
    </Box>
  );
}
