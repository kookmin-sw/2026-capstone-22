/**
 * Superadmin shared button styles — teal gradient glow system
 */

export const glowButtonSx = {
  background: 'linear-gradient(135deg, #14B8A6 0%, #0EA5E9 100%)',
  color: '#09090B',
  fontWeight: 700,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  textTransform: 'none',
  borderRadius: '10px',
  boxShadow: '0 0 20px rgba(20,184,166,0.25), 0 4px 12px rgba(20,184,166,0.15)',
  transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
  '&:hover': {
    background: 'linear-gradient(135deg, #0D9488 0%, #0284C7 100%)',
    boxShadow: '0 0 28px rgba(20,184,166,0.4), 0 6px 20px rgba(20,184,166,0.2)',
    transform: 'translateY(-1px)',
  },
  '&:active': {
    transform: 'translateY(0)',
    boxShadow: '0 0 16px rgba(20,184,166,0.2), 0 2px 8px rgba(20,184,166,0.1)',
  },
  '&.Mui-disabled': {
    background: 'linear-gradient(135deg, rgba(20,184,166,0.3) 0%, rgba(14,165,233,0.3) 100%)',
    color: 'rgba(9,9,11,0.5)',
    boxShadow: 'none',
  },
};

export const outlineButtonSx = {
  color: '#A1A1AA',
  fontWeight: 600,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  textTransform: 'none',
  borderRadius: '10px',
  borderColor: 'rgba(255,255,255,0.08)',
  transition: 'all 0.2s ease',
  '&:hover': {
    borderColor: 'rgba(20,184,166,0.4)',
    color: '#14B8A6',
    bgcolor: 'rgba(20,184,166,0.04)',
  },
};

export const dangerButtonSx = {
  background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
  color: '#FAFAFA',
  fontWeight: 700,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  textTransform: 'none',
  borderRadius: '10px',
  boxShadow: '0 0 16px rgba(239,68,68,0.2), 0 4px 12px rgba(239,68,68,0.1)',
  transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
  '&:hover': {
    background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
    boxShadow: '0 0 24px rgba(239,68,68,0.35), 0 6px 20px rgba(239,68,68,0.15)',
    transform: 'translateY(-1px)',
  },
};
