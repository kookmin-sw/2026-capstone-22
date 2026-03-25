import React from 'react';
import {
  Box,
  Paper,
  Typography,
  LinearProgress,
  IconButton,
  Chip,
  Collapse,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import {
  Close,
  CloudUpload,
  CheckCircle,
  Error,
  ExpandMore,
  ExpandLess
} from '@mui/icons-material';
import { useUpload } from '../context/UploadContext';

export default function UploadProgress() {
  const { uploads, stats, removeUpload, clearAll } = useUpload();
  const [expanded, setExpanded] = React.useState(true);

  console.log('[UploadProgress] Rendering with uploads:', uploads);
  console.log('[UploadProgress] Stats:', stats);

  if (uploads.length === 0) {
    console.log('[UploadProgress] No uploads, hiding component');
    return null;
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'processing':
        return <CloudUpload sx={{ color: '#667eea', fontSize: 20 }} />;
      case 'completed':
        return <CheckCircle sx={{ color: '#10b981', fontSize: 20 }} />;
      case 'error':
        return <Error sx={{ color: '#ef4444', fontSize: 20 }} />;
      default:
        return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'processing':
        return '#667eea';
      case 'completed':
        return '#10b981';
      case 'error':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 0,
        right: 20,
        width: 400,
        maxHeight: expanded ? 500 : 60,
        bgcolor: '#1a1d29',
        border: '1px solid rgba(167, 139, 250, 0.3)',
        borderRadius: '12px 12px 0 0',
        overflow: 'hidden',
        zIndex: 1300,
        transition: 'max-height 0.3s ease',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          borderBottom: expanded ? '1px solid rgba(255,255,255,0.1)' : 'none',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CloudUpload sx={{ color: '#a78bfa', fontSize: 24 }} />
          <Box>
            <Typography variant="body2" sx={{ color: 'white', fontWeight: 600 }}>
              업로드 진행 중
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
              {stats.processing > 0 && (
                <Chip
                  label={`${stats.processing} 진행중`}
                  size="small"
                  sx={{
                    bgcolor: 'rgba(102, 126, 234, 0.2)',
                    color: '#a78bfa',
                    height: 20,
                    fontSize: '0.7rem',
                  }}
                />
              )}
              {stats.completed > 0 && (
                <Chip
                  label={`${stats.completed} 완료`}
                  size="small"
                  sx={{
                    bgcolor: 'rgba(16, 185, 129, 0.2)',
                    color: '#10b981',
                    height: 20,
                    fontSize: '0.7rem',
                  }}
                />
              )}
              {stats.error > 0 && (
                <Chip
                  label={`${stats.error} 실패`}
                  size="small"
                  sx={{
                    bgcolor: 'rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                    height: 20,
                    fontSize: '0.7rem',
                  }}
                />
              )}
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            sx={{
              color: 'rgba(255,255,255,0.5)',
              '&:hover': { color: '#ef4444' },
            }}
          >
            <Close sx={{ fontSize: 18 }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            sx={{
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            {expanded ? <ExpandMore sx={{ fontSize: 20 }} /> : <ExpandLess sx={{ fontSize: 20 }} />}
          </IconButton>
        </Box>
      </Box>

      {/* Content */}
      <Collapse in={expanded}>
        <List
          sx={{
            maxHeight: 380,
            overflowY: 'auto',
            p: 0,
            '&::-webkit-scrollbar': {
              width: '6px',
            },
            '&::-webkit-scrollbar-track': {
              bgcolor: 'rgba(255,255,255,0.05)',
            },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: 'rgba(167, 139, 250, 0.3)',
              borderRadius: '3px',
            },
          }}
        >
          {uploads.map((upload) => (
            <ListItem
              key={upload.id}
              sx={{
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                flexDirection: 'column',
                alignItems: 'stretch',
                py: 1.5,
                px: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                {getStatusIcon(upload.status)}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'white',
                      fontSize: '0.875rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {upload.display_name}
                  </Typography>
                  {upload.error && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: '#ef4444',
                        fontSize: '0.75rem',
                      }}
                    >
                      {upload.error}
                    </Typography>
                  )}
                </Box>
                {upload.status !== 'processing' && (
                  <IconButton
                    size="small"
                    onClick={() => removeUpload(upload.id)}
                    sx={{
                      color: 'rgba(255,255,255,0.3)',
                      '&:hover': { color: 'white' },
                    }}
                  >
                    <Close sx={{ fontSize: 16 }} />
                  </IconButton>
                )}
              </Box>
              {upload.status === 'processing' && (
                <LinearProgress
                  sx={{
                    height: 3,
                    borderRadius: 1.5,
                    bgcolor: 'rgba(167, 139, 250, 0.1)',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: getStatusColor(upload.status),
                    },
                  }}
                />
              )}
            </ListItem>
          ))}
        </List>
      </Collapse>
    </Paper>
  );
}
