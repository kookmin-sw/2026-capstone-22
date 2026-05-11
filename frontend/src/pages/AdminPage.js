import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Typography, Button, TextField,
  Paper, Table, TableBody, TableCell, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  Chip, Fade, Grow, Card, CardContent,
  Select, MenuItem, FormControl, Grid, CircularProgress,
  Checkbox, Pagination, Menu, Switch, FormControlLabel, Tooltip, Avatar, Divider
} from '@mui/material';
import {
  DeleteOutline, Folder, Description, Add, Download, Visibility,
  CloudUpload, UploadFile,
  Group, People, Security, MoreVert, KeyboardArrowDown, Search, Clear,
  Storage, AccessTime, Article, Assignment, EventNote, Notes, Edit, DragIndicator,
  VpnKey, PersonRemove, Lock, LockOpen
} from '@mui/icons-material';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CalendarMonth as CalendarMonthIcon,
  LinkOff as LinkOffIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
} from '@mui/icons-material';
import CalendarPage from './CalendarPage';
import ExamAnalysisPage from './ExamAnalysisPage';
import AttendanceTab from './AttendanceTab';
import AssignmentTab from './AssignmentTab';
import ExamTab from './ExamTab';
import { useUpload } from '../context/UploadContext';
import { useTenant } from '../context/TenantContext';
import { corpusAPI, adminAPI, promptTemplateAPI, calendarAPI, chatbotSettingsAPI, chatAPI, hitlAPI, studentAPI } from '../services/api';
import {
  SmartToy as SmartToyIcon,
  TuneOutlined as TuneIcon,
  ChatBubbleOutline as ChatBubbleIcon,
  AutoAwesome as AutoAwesomeIcon,
  RecordVoiceOver as RecordVoiceOverIcon,
  BusinessCenter as BusinessCenterIcon,
  Gavel as GavelIcon,
  EmojiEmotions as EmojiEmotionsIcon,
  SaveOutlined as SaveIcon,
  PeopleAlt as PeopleAltIcon,
  Storage as StorageIcon2,
  Message as MessageIcon,
  ChatBubble as ChatBubbleIcon2,
  Visibility as VisibilityIcon,
  ArrowBack as ArrowBackIcon,
  History as HistoryIcon,
  SupportAgent as SupportAgentIcon,
  School,
  Groups,
  Class,
  Person,
  ExpandMore,
  ExpandLess,
} from '@mui/icons-material';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';

// Sortable Template Row Component
function SortableTemplateRow({ template, index, isLast, getTemplateIcon, openTemplateDialog, deleteTemplate }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: template.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr 1fr 80px 80px',
        gap: 2,
        px: 2,
        py: 1.25,
        alignItems: 'center',
        transition: 'background 0.15s',
        bgcolor: isDragging ? 'rgba(167, 139, 250, 0.1)' : 'transparent',
        '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' },
        borderBottom: !isLast ? '1px solid rgba(0,0,0,0.15)' : 'none',
      }}
    >
      {/* 드래그 핸들 */}
      <Box
        {...attributes}
        {...listeners}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <DragIndicator sx={{ fontSize: 18, color: '#8A8190' }} />
      </Box>

      {/* 제목 + 아이콘 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
        <Box sx={{
          width: 32,
          height: 32,
          borderRadius: 1,
          bgcolor: 'rgba(167, 139, 250, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Box sx={{
            color: '#a78bfa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            '& .MuiSvgIcon-root': { fontSize: 18 }
          }}>
            {getTemplateIcon(template.icon)}
          </Box>
        </Box>
        <Typography sx={{
          color: '#1E293B',
          fontSize: '0.8125rem',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {template.title}
        </Typography>
      </Box>

      {/* 설명 */}
      <Typography sx={{
        color: '#334155',
        fontSize: '0.75rem',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {template.description || '-'}
      </Typography>

      {/* 상태 */}
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <Chip
          label={template.is_active ? '활성' : '비활성'}
          size="small"
          sx={{
            height: 20,
            bgcolor: template.is_active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: template.is_active ? '#15803d' : '#dc2626',
            fontWeight: 600,
            fontSize: '0.625rem',
            border: `1px solid ${template.is_active ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            '& .MuiChip-label': { px: 0.75 },
          }}
        />
      </Box>

      {/* 작업 버튼 */}
      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
        <Box
          onClick={() => openTemplateDialog(template)}
          sx={{
            bgcolor: 'transparent',
            borderRadius: 1,
            p: 0.75,
            display: 'inline-flex',
            cursor: 'pointer',
            transition: 'all 0.2s',
            '&:hover': {
              bgcolor: 'rgba(167, 139, 250, 0.1)',
              '& .MuiSvgIcon-root': { color: '#a78bfa' },
            },
          }}
        >
          <Edit sx={{ fontSize: 16, color: '#94a3b8' }} />
        </Box>
        <Box
          onClick={() => deleteTemplate(template.id)}
          sx={{
            bgcolor: 'transparent',
            borderRadius: 1,
            p: 0.75,
            display: 'inline-flex',
            cursor: 'pointer',
            transition: 'all 0.2s',
            '&:hover': {
              bgcolor: 'rgba(239, 68, 68, 0.1)',
              '& .MuiSvgIcon-root': { color: '#DC2626' },
            },
          }}
        >
          <DeleteOutline sx={{ fontSize: 16, color: '#94a3b8' }} />
        </Box>
      </Box>
    </Box>
  );
}

// ==================== Chatbot Settings Panel ====================
const TONE_LABELS = {
  friendly: '친근한 반말',
  polite: '정중한 존댓말',
  professional: '전문적인 어투',
  formal: '격식있는 문체',
};
const STYLE_LABELS = {
  concise: '간결하게',
  detailed: '상세하게',
  balanced: '균형있게',
};

// Static sample responses per tone x style for instant preview (no API call)
const SAMPLE_RESPONSES = {
  friendly: {
    concise: '아 그거요! 문서 찾아보니까 이번 주 수요일에 행사가 있어요~',
    detailed: '아 궁금하셨구나! 문서를 찾아봤는데요, 이번 주 수요일 오후 2시에 대강당에서 행사가 예정되어 있어요. 참석 신청은 내부 게시판에서 할 수 있고, 준비물은 따로 없대요!',
    balanced: '이번 주 행사 일정 찾아봤어요! 수요일 오후 2시에 대강당에서 진행되고, 참석 신청은 게시판에서 하면 돼요.',
  },
  polite: {
    concise: '이번 주 수요일 오후 2시에 대강당에서 행사가 예정되어 있습니다.',
    detailed: '이번 주 행사 일정을 안내드립니다. 수요일 오후 2시에 대강당에서 행사가 예정되어 있습니다. 참석을 원하시면 내부 게시판에서 신청하실 수 있으며, 별도 준비물은 필요하지 않습니다.',
    balanced: '이번 주 수요일 오후 2시에 대강당에서 행사가 예정되어 있습니다. 참석 신청은 게시판에서 가능합니다.',
  },
  professional: {
    concise: '확인 결과, 금주 수요일 14:00 대강당에서 행사가 예정되어 있습니다.',
    detailed: '문서를 확인한 결과, 다음과 같은 행사 정보를 안내드립니다. 일시는 금주 수요일 14:00이며, 장소는 본관 대강당입니다. 참석 신청은 내부 게시판을 통해 진행되며, 별도 준비물은 요구되지 않습니다.',
    balanced: '확인 결과, 금주 수요일 14:00에 대강당에서 행사가 예정되어 있습니다. 참석 신청은 내부 게시판에서 가능합니다.',
  },
  formal: {
    concise: '금주 수요일 14시, 대강당에서 행사가 예정되어 있사오니 참고하여 주십시오.',
    detailed: '행사 일정을 아래와 같이 안내드리겠습니다. 금주 수요일 14시에 본관 대강당에서 행사가 진행될 예정이오니, 참석을 희망하시는 분께서는 내부 게시판을 통해 신청하여 주시기 바랍니다.',
    balanced: '금주 수요일 14시 대강당에서 행사가 예정되어 있습니다. 참석 신청은 게시판을 통해 진행하여 주십시오.',
  },
};

const PRESET_ICONS = {
  default: <SmartToyIcon sx={{ fontSize: 22 }} />,
  friendly_helper: <EmojiEmotionsIcon sx={{ fontSize: 22 }} />,
  professional: <BusinessCenterIcon sx={{ fontSize: 22 }} />,
  formal: <GavelIcon sx={{ fontSize: 22 }} />,
  casual: <RecordVoiceOverIcon sx={{ fontSize: 22 }} />,
};

function ChatbotSettingsPanel() {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackOpen, setSnackOpen] = useState(false);
  const [snackMessage, setSnackMessage] = useState('');

  const [form, setForm] = useState({
    chatbot_name: '',
    greeting_message: '',
    tone: 'polite',
    response_style: 'concise',
    custom_instructions: '',
    preset_id: 'default',
  });

  // Load presets and current settings
  useEffect(() => {
    const load = async () => {
      try {
        const [presetsRes, settingsRes] = await Promise.allSettled([
          chatbotSettingsAPI.getPresets(),
          chatbotSettingsAPI.get(),
        ]);
        if (presetsRes.status === 'fulfilled') setPresets(presetsRes.value.data);
        if (settingsRes.status === 'fulfilled' && settingsRes.value.data) {
          const s = settingsRes.value.data;
          setForm({
            chatbot_name: s.chatbot_name || '',
            greeting_message: s.greeting_message || '',
            tone: s.tone || 'polite',
            response_style: s.response_style || 'concise',
            custom_instructions: s.custom_instructions || '',
            preset_id: s.preset_id || 'default',
          });
        }
      } catch { /* first time — no settings yet */ }
      setLoading(false);
    };
    load();
  }, []);

  const applyPreset = (preset) => {
    setForm({
      chatbot_name: preset.chatbot_name || '',
      greeting_message: preset.greeting_message || '',
      tone: preset.tone || 'polite',
      response_style: preset.response_style || 'concise',
      custom_instructions: '',
      preset_id: preset.id,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await chatbotSettingsAPI.update(form);
      setSnackMessage('챗봇 설정이 저장되었습니다.');
      setSnackOpen(true);
    } catch {
      setSnackMessage('저장에 실패했습니다.');
      setSnackOpen(true);
    }
    setSaving(false);
  };

  const sampleGreeting = form.greeting_message || '안녕하세요, 무엇을 도와드릴까요?';
  const sampleResponse = SAMPLE_RESPONSES[form.tone]?.[form.response_style]
    || SAMPLE_RESPONSES.polite.concise;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} sx={{ color: '#a78bfa' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 3 }}>
      {/* ── Section 1: Preset Cards ── */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AutoAwesomeIcon sx={{ color: '#a78bfa', fontSize: 20 }} />
          <Typography sx={{ color: '#1E293B', fontWeight: 700, fontSize: '0.9375rem' }}>
            프리셋 선택
          </Typography>
          <Typography sx={{ color: '#8A8190', fontSize: '0.75rem', ml: 0.5 }}>
            클릭하면 아래 설정이 자동으로 채워집니다
          </Typography>
        </Box>

        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: `repeat(${presets.length || 5}, 1fr)` },
          gap: 1.5,
        }}>
          {presets.map((preset) => {
            const isSelected = form.preset_id === preset.id;
            return (
              <Box
                key={preset.id}
                onClick={() => applyPreset(preset)}
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  cursor: 'pointer',
                  bgcolor: isSelected ? 'rgba(167, 139, 250, 0.08)' : '#FFFFFF',
                  border: isSelected
                    ? '1.5px solid #a78bfa'
                    : '1px solid rgba(0,0,0,0.15)',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: isSelected ? 'rgba(167, 139, 250, 0.12)' : 'rgba(0,0,0,0.04)',
                    borderColor: isSelected ? '#a78bfa' : 'rgba(0,0,0,0.2)',
                    transform: 'translateY(-1px)',
                  },
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Preset icon */}
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  mb: 1.5,
                  color: isSelected ? '#a78bfa' : '#64748B',
                }}>
                  {PRESET_ICONS[preset.id] || <SmartToyIcon sx={{ fontSize: 22 }} />}
                  <Typography sx={{
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                    color: isSelected ? '#c4b5fd' : '#334155',
                  }}>
                    {preset.name}
                  </Typography>
                </Box>

                <Typography sx={{
                  color: '#8A8190',
                  fontSize: '0.6875rem',
                  lineHeight: 1.5,
                  mb: 1.5,
                  minHeight: 32,
                }}>
                  {preset.description}
                </Typography>

                {/* Mini speech bubble */}
                <Box sx={{
                  bgcolor: isSelected ? 'rgba(167,139,250,0.06)' : 'rgba(0,0,0,0.02)',
                  borderRadius: '10px',
                  px: 1.5,
                  py: 1,
                  borderLeft: `2px solid ${isSelected ? '#a78bfa' : 'rgba(0,0,0,0.1)'}`,
                }}>
                  <Typography sx={{
                    color: isSelected ? '#475569' : '#94A3B8',
                    fontSize: '0.625rem',
                    fontStyle: 'italic',
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    "{preset.sample_response}"
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* ── Main content: Form + Preview side by side ── */}
      <Box sx={{ display: 'flex', gap: 2.5, flexDirection: { xs: 'column', md: 'row' } }}>

        {/* ── Section 2: Settings Form ── */}
        <Paper sx={{
          flex: 1,
          borderRadius: '16px',
          bgcolor: '#FFFFFF',
          border: '1px solid rgba(0,0,0,0.20)',
          p: 3,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <TuneIcon sx={{ color: '#a78bfa', fontSize: 20 }} />
            <Typography sx={{ fontWeight: 700, color: '#111827', fontSize: '0.9375rem' }}>
              세부 설정
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* 챗봇 이름 */}
            <Box>
              <Typography sx={{ color: '#334155', fontSize: '0.75rem', fontWeight: 600, mb: 0.75 }}>
                챗봇 이름
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="AI 어시스턴트"
                value={form.chatbot_name}
                onChange={(e) => setForm({ ...form, chatbot_name: e.target.value, preset_id: '' })}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: 'rgba(0,0,0,0.03)',
                    borderRadius: '10px',
                    color: '#111827',
                    fontSize: '0.8125rem',
                    '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' },
                    '&:hover fieldset': { borderColor: 'rgba(0,0,0,0.2)' },
                    '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
                  },
                }}
              />
            </Box>

            {/* 인삿말 */}
            <Box>
              <Typography sx={{ color: '#334155', fontSize: '0.75rem', fontWeight: 600, mb: 0.75 }}>
                인삿말 / 자기소개
              </Typography>
              <TextField
                fullWidth
                size="small"
                multiline
                rows={3}
                placeholder="안녕하세요, 무엇을 도와드릴까요?"
                value={form.greeting_message}
                onChange={(e) => setForm({ ...form, greeting_message: e.target.value, preset_id: '' })}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: 'rgba(0,0,0,0.03)',
                    borderRadius: '10px',
                    color: '#111827',
                    fontSize: '0.8125rem',
                    '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' },
                    '&:hover fieldset': { borderColor: 'rgba(0,0,0,0.2)' },
                    '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
                  },
                }}
              />
            </Box>

            {/* 어투 + 응답 스타일 row */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ color: '#334155', fontSize: '0.75rem', fontWeight: 600, mb: 0.75 }}>
                  어투 / 말투
                </Typography>
                <FormControl fullWidth size="small">
                  <Select
                    value={form.tone}
                    onChange={(e) => setForm({ ...form, tone: e.target.value, preset_id: '' })}
                    sx={{
                      bgcolor: 'rgba(0,0,0,0.03)',
                      borderRadius: '10px',
                      color: 'white',
                      fontSize: '0.8125rem',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.15)' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.2)' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a78bfa' },
                      '& .MuiSvgIcon-root': { color: '#8A8190' },
                    }}
                    MenuProps={{
                      PaperProps: {
                        sx: { bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: 1.5 },
                      },
                    }}
                  >
                    {Object.entries(TONE_LABELS).map(([val, label]) => (
                      <MenuItem key={val} value={val} sx={{ color: '#111827', fontSize: '0.8125rem', '&:hover': { bgcolor: 'rgba(167,139,250,0.1)' } }}>
                        {label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ flex: 1 }}>
                <Typography sx={{ color: '#334155', fontSize: '0.75rem', fontWeight: 600, mb: 0.75 }}>
                  응답 스타일
                </Typography>
                <FormControl fullWidth size="small">
                  <Select
                    value={form.response_style}
                    onChange={(e) => setForm({ ...form, response_style: e.target.value, preset_id: '' })}
                    sx={{
                      bgcolor: 'rgba(0,0,0,0.03)',
                      borderRadius: '10px',
                      color: 'white',
                      fontSize: '0.8125rem',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.15)' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.2)' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a78bfa' },
                      '& .MuiSvgIcon-root': { color: '#8A8190' },
                    }}
                    MenuProps={{
                      PaperProps: {
                        sx: { bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: 1.5 },
                      },
                    }}
                  >
                    {Object.entries(STYLE_LABELS).map(([val, label]) => (
                      <MenuItem key={val} value={val} sx={{ color: '#111827', fontSize: '0.8125rem', '&:hover': { bgcolor: 'rgba(167,139,250,0.1)' } }}>
                        {label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Box>

            {/* 추가 지시사항 */}
            <Box>
              <Typography sx={{ color: '#334155', fontSize: '0.75rem', fontWeight: 600, mb: 0.75 }}>
                추가 지시사항
                <Typography component="span" sx={{ color: '#8A8190', fontSize: '0.6875rem', ml: 0.5 }}>
                  (선택)
                </Typography>
              </Typography>
              <TextField
                fullWidth
                size="small"
                multiline
                rows={4}
                placeholder="챗봇에게 추가적인 지시사항을 입력하세요.&#10;예: 답변 마지막에 관련 문서 제목을 안내해 주세요."
                value={form.custom_instructions}
                onChange={(e) => setForm({ ...form, custom_instructions: e.target.value })}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: 'rgba(0,0,0,0.03)',
                    borderRadius: '10px',
                    color: '#111827',
                    fontSize: '0.8125rem',
                    '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' },
                    '&:hover fieldset': { borderColor: 'rgba(0,0,0,0.2)' },
                    '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
                  },
                }}
              />
            </Box>
          </Box>

          {/* Save Button */}
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              onClick={handleSave}
              disabled={saving}
              startIcon={saving ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <SaveIcon />}
              sx={{
                background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
                boxShadow: '0 0 20px rgba(167,139,250,0.25), 0 4px 12px rgba(167,139,250,0.15)',
                color: 'white',
                fontWeight: 700,
                px: 4,
                py: 1,
                borderRadius: '12px',
                fontSize: '0.8125rem',
                textTransform: 'none',
                '&:hover': {
                  background: 'linear-gradient(135deg, #9370f0 0%, #6d28d9 100%)',
                },
                '&.Mui-disabled': {
                  background: 'rgba(0,0,0,0.12)',
                  color: '#8A8190',
                },
              }}
            >
              {saving ? '저장 중...' : '설정 저장'}
            </Button>
          </Box>
        </Paper>

        {/* ── Section 3: Live Preview ── */}
        <Paper sx={{
          width: { xs: '100%', md: 340 },
          flexShrink: 0,
          borderRadius: '16px',
          bgcolor: '#FFFFFF',
          border: '1px solid rgba(0,0,0,0.20)',
          p: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Preview header */}
          <Box sx={{
            px: 2.5,
            py: 1.5,
            borderBottom: '1px solid rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'rgba(167,139,250,0.03)',
          }}>
            <ChatBubbleIcon sx={{ color: '#a78bfa', fontSize: 18 }} />
            <Typography sx={{ color: '#334155', fontWeight: 700, fontSize: '0.8125rem' }}>
              미리보기
            </Typography>
          </Box>

          {/* Chat mockup */}
          <Box sx={{
            flex: 1,
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            minHeight: 320,
            bgcolor: '#F8FAFC',
          }}>
            {/* Bot greeting */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <Box sx={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
                boxShadow: '0 0 20px rgba(167,139,250,0.25), 0 4px 12px rgba(167,139,250,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                mt: 0.25,
              }}>
                <SmartToyIcon sx={{ fontSize: 15, color: 'white' }} />
              </Box>
              <Box sx={{
                bgcolor: 'rgba(0,0,0,0.04)',
                borderRadius: '4px 14px 14px 14px',
                px: 2,
                py: 1.25,
                maxWidth: '85%',
              }}>
                <Typography sx={{
                  color: '#1E293B',
                  fontSize: '0.75rem',
                  lineHeight: 1.6,
                  wordBreak: 'keep-all',
                }}>
                  {sampleGreeting}
                </Typography>
              </Box>
            </Box>

            {/* User message */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Box sx={{
                background: 'linear-gradient(135deg, rgba(102,126,234,0.25), rgba(118,75,162,0.25))',
                border: '1px solid rgba(167,139,250,0.15)',
                borderRadius: '14px 4px 14px 14px',
                px: 2,
                py: 1.25,
                maxWidth: '85%',
              }}>
                <Typography sx={{
                  color: '#1E293B',
                  fontSize: '0.75rem',
                  lineHeight: 1.6,
                }}>
                  이번 주 행사 일정 알려줘
                </Typography>
              </Box>
            </Box>

            {/* Bot response */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <Box sx={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
                boxShadow: '0 0 20px rgba(167,139,250,0.25), 0 4px 12px rgba(167,139,250,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                mt: 0.25,
              }}>
                <SmartToyIcon sx={{ fontSize: 15, color: 'white' }} />
              </Box>
              <Box sx={{
                bgcolor: 'rgba(0,0,0,0.04)',
                borderRadius: '4px 14px 14px 14px',
                px: 2,
                py: 1.25,
                maxWidth: '85%',
              }}>
                <Typography sx={{
                  color: '#1E293B',
                  fontSize: '0.75rem',
                  lineHeight: 1.6,
                  wordBreak: 'keep-all',
                }}>
                  {sampleResponse}
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Preview footer — current settings label */}
          <Box sx={{
            px: 2.5,
            py: 1.25,
            borderTop: '1px solid rgba(0,0,0,0.15)',
            display: 'flex',
            gap: 0.75,
            flexWrap: 'wrap',
          }}>
            <Chip
              label={TONE_LABELS[form.tone] || form.tone}
              size="small"
              sx={{
                height: 20,
                bgcolor: 'rgba(167,139,250,0.1)',
                color: '#c4b5fd',
                fontSize: '0.625rem',
                fontWeight: 600,
                border: '1px solid rgba(167,139,250,0.2)',
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
            <Chip
              label={STYLE_LABELS[form.response_style] || form.response_style}
              size="small"
              sx={{
                height: 20,
                bgcolor: 'rgba(102,126,234,0.1)',
                color: '#93b4fd',
                fontSize: '0.625rem',
                fontWeight: 600,
                border: '1px solid rgba(102,126,234,0.2)',
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          </Box>
        </Paper>
      </Box>

      {/* Snackbar */}
      {snackOpen && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 24,
            left: { xs: '50%', md: 'calc(50% + 130px)' },
            transform: 'translateX(-50%)',
            bgcolor: snackMessage.includes('실패') ? 'rgba(239,68,68,0.9)' : 'rgba(34,197,94,0.9)',
            color: 'white',
            px: 3,
            py: 1.25,
            borderRadius: '12px',
            fontSize: '0.8125rem',
            fontWeight: 600,
            zIndex: 9999,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            animation: 'fadeInUp 0.3s ease',
            '@keyframes fadeInUp': {
              from: { opacity: 0, transform: 'translateX(-50%) translateY(10px)' },
              to: { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
            },
          }}
          onClick={() => setSnackOpen(false)}
        >
          {snackMessage}
        </Box>
      )}
      {snackOpen && setTimeout(() => setSnackOpen(false), 3000) && null}
    </Box>
  );
}

function CalendarSettingsPanel() {
  const [calStatus, setCalStatus] = useState(null);
  const [calLoading, setCalLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    calendarAPI.getStatus()
      .then(res => setCalStatus(res.data))
      .catch(() => setCalStatus({ connected: false }))
      .finally(() => setCalLoading(false));
  }, []);

  const handleConnect = async () => {
    try {
      const res = await calendarAPI.getAuthUrl();
      window.location.href = res.data.auth_url;
    } catch {
      alert('캘린더 연동 URL 생성에 실패했습니다.');
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('캘린더 연동을 해제하시겠습니까?')) return;
    setDisconnecting(true);
    try {
      await calendarAPI.disconnect();
      setCalStatus({ connected: false });
    } catch {
      alert('연동 해제에 실패했습니다.');
    } finally {
      setDisconnecting(false);
    }
  };

  // Check URL params for callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar') === 'connected') {
      setCalStatus({ connected: true, email: params.get('email') || '' });
      setCalLoading(false);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  if (calLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} sx={{ color: '#a78bfa' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
      {calStatus?.connected ? (
        <>
          {/* Connected Header - compact */}
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            mb: 3, p: 2, borderRadius: '14px',
            bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{
                width: 36, height: 36, borderRadius: '10px',
                bgcolor: '#DCFCE7', border: '1px solid #86EFAC',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CheckCircleOutlineIcon sx={{ color: '#15803D', fontSize: 20 }} />
              </Box>
              <Box>
                <Typography sx={{ color: '#15803D', fontWeight: 700, fontSize: '0.875rem' }}>
                  Google 캘린더 연동 완료
                </Typography>
                {calStatus.email && (
                  <Typography sx={{ color: '#334155', fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace" }}>
                    {calStatus.email}
                  </Typography>
                )}
              </Box>
            </Box>
            <Button
              onClick={handleDisconnect}
              disabled={disconnecting}
              size="small"
              startIcon={disconnecting ? <CircularProgress size={14} /> : <LinkOffIcon sx={{ fontSize: 14 }} />}
              sx={{
                color: '#334155', fontSize: '0.75rem', fontWeight: 600,
                textTransform: 'none', borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.20)',
                '&:hover': { borderColor: '#FCA5A5', color: '#DC2626', bgcolor: 'rgba(239,68,68,0.06)' },
              }}
            >
              {disconnecting ? '해제 중...' : '연동 해제'}
            </Button>
          </Box>

          {/* Calendar View - reuse existing CalendarPage component */}
          <Box sx={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}>
            <CalendarPage />
          </Box>
        </>
      ) : (
        /* Not connected */
        <Box sx={{
          bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)',
          borderRadius: '16px', p: 5, textAlign: 'center',
        }}>
          <Box sx={{
            width: 64, height: 64, borderRadius: '16px', mx: 'auto', mb: 3,
            bgcolor: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CalendarMonthIcon sx={{ color: '#a78bfa', fontSize: 32 }} />
          </Box>
          <Typography sx={{ color: '#111827', fontWeight: 800, fontSize: '1.25rem', mb: 1 }}>
            Google 캘린더 연동
          </Typography>
          <Typography sx={{ color: '#334155', fontSize: '0.875rem', mb: 4, maxWidth: 400, mx: 'auto', lineHeight: 1.6 }}>
            Google 캘린더를 연동하면 챗봇에서 자연어로 일정을 조회, 생성, 수정, 삭제할 수 있습니다.
          </Typography>
          <Button
            onClick={handleConnect}
            startIcon={<CalendarMonthIcon />}
            sx={{
              background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
              boxShadow: '0 0 20px rgba(167,139,250,0.25)',
              color: 'white', fontWeight: 700, fontSize: '0.875rem',
              px: 4, py: 1.2, borderRadius: '12px', textTransform: 'none',
              '&:hover': { background: 'linear-gradient(135deg, #9370f0 0%, #6d28d9 100%)' },
            }}
          >
            Google 캘린더 연동하기
          </Button>
        </Box>
      )}
    </Box>
  );
}

// 줄 전체가 정확히 [사용자] 또는 [AI]인 경우만 마커로 인식 (본문에 해당 문자열이 포함돼도 오파싱 방지)
const HITL_MARKER_RE = /^\[(사용자|AI)\]$/;

function extractLatestUserQuestion(userMessage) {
  if (!userMessage) return '';
  const lines = userMessage.split('\n');

  // 마지막 [사용자] 마커 줄 인덱스 탐색
  let lastUserIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '[사용자]') lastUserIdx = i;
  }
  if (lastUserIdx === -1) return userMessage.trim(); // 태그 없는 예전 데이터

  // 마커 다음 줄부터 다음 마커 전까지 수집
  const contentLines = [];
  for (let i = lastUserIdx + 1; i < lines.length; i++) {
    if (HITL_MARKER_RE.test(lines[i].trim())) break;
    contentLines.push(lines[i]);
  }
  return contentLines.join('\n').trim() || userMessage.trim();
}

function HITLPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState({}); // { id: true/false }
  const [expandedHitl, setExpandedHitl] = useState({}); // { [id]: bool }
  const [replyDraft, setReplyDraft] = useState({}); // { [id]: string }
  const [replying, setReplying] = useState({}); // { [id]: bool }

  const toggleExpand = (id) =>
    setExpandedHitl((prev) => ({ ...prev, [id]: !prev[id] }));

  const loadHITL = async () => {
    setLoading(true);
    try {
      const res = await hitlAPI.list();
      setItems(res.data.items);
    } catch (err) {
      console.error('HITL 목록 로딩 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHITL();
  }, []);

  const handleResolve = async (id) => {
    setResolving((prev) => ({ ...prev, [id]: true }));
    try {
      await hitlAPI.resolve(id);
      loadHITL();
    } catch (err) {
      alert('처리 실패: ' + err.message);
    } finally {
      setResolving((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleReply = async (id) => {
    const text = (replyDraft[id] || '').trim();
    if (!text) return;
    setReplying((prev) => ({ ...prev, [id]: true }));
    try {
      await hitlAPI.reply(id, { message: text });
      setReplyDraft((prev) => { const n = { ...prev }; delete n[id]; return n; });
      loadHITL();
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      alert('답변 처리 실패: ' + detail);
    } finally {
      setReplying((prev) => ({ ...prev, [id]: false }));
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} sx={{ color: '#a78bfa' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both', maxWidth: 1000, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '12px',
            bgcolor: 'rgba(167, 139, 250, 0.1)', border: '1px solid rgba(167, 139, 250, 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <SupportAgentIcon sx={{ color: '#a78bfa', fontSize: 24 }} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
              상담 대기 (HITL)
            </Typography>
            <Typography sx={{ color: '#1E293B', fontSize: '0.8125rem' }}>
              AI가 답변하기 어려운 질문 목록입니다. (오래된 순 / pending 우선)
            </Typography>
          </Box>
        </Box>
        <Button
          onClick={loadHITL}
          size="small"
          startIcon={<HistoryIcon sx={{ fontSize: 16 }} />}
          sx={{ color: '#a78bfa', fontWeight: 600, textTransform: 'none' }}
        >
          새로고침
        </Button>
      </Box>

      {items.length === 0 ? (
        <Paper sx={{
          p: 8, textAlign: 'center', bgcolor: '#FFFFFF', borderRadius: '20px',
          border: '1px solid rgba(0,0,0,0.20)', boxShadow: '0 1px 4px rgba(0,0,0,0.12)'
        }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 48, color: 'rgba(0,0,0,0.12)', mb: 2 }} />
          <Typography sx={{ color: '#1E293B', fontSize: '1rem', fontWeight: 500 }}>
            처리 대기 중인 항목이 없습니다.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {items.map((item) => (
            <Card key={item.id} sx={{
              bgcolor: '#FFFFFF', borderRadius: '16px',
              border: `1px solid ${item.status === 'pending' ? '#FCA5A5' : 'rgba(0,0,0,0.14)'}`,
              overflow: 'visible', position: 'relative',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'all 0.2s ease',
              opacity: item.status === 'resolved' ? 0.75 : 1,
              '&:hover': { borderColor: item.status === 'pending' ? '#FCA5A5' : 'rgba(0,0,0,0.20)', transform: 'translateY(-2px)' }
            }}>
              <CardContent sx={{ p: 3 }}>
                {/* 상단: 상태 + 접수 시각 */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    {item.status === 'pending' ? (
                      <Chip label="대기중" size="small" sx={{ bgcolor: '#FEE2E2', color: '#DC2626', fontWeight: 700, fontSize: '0.65rem' }} />
                    ) : (
                      <Chip label="처리완료" size="small" sx={{ bgcolor: '#DCFCE7', color: '#15803D', fontWeight: 700, fontSize: '0.65rem' }} />
                    )}
                    {item.hitl_reason && (
                      <Chip label={item.hitl_reason} size="small" sx={{ bgcolor: '#FEF3C7', color: '#A16207', fontWeight: 700, fontSize: '0.65rem', maxWidth: 240, border: '1px solid #FACC15' }} />
                    )}
                  </Box>
                  <Typography sx={{ color: '#1E293B', fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace' }}>
                    {item.created_at ? new Date(item.created_at).toLocaleString('ko-KR') : '-'}
                  </Typography>
                </Box>

                {/* 사용자 질문 */}
                {(() => {
                  const extracted = extractLatestUserQuestion(item.user_message);
                  const hasContext = item.user_message &&
                    item.user_message.split('\n').some((l) => l.trim() === '[사용자]');
                  const isExpanded = !!expandedHitl[item.id];
                  return (
                    <Box sx={{ bgcolor: '#F1F5F9', borderRadius: '10px', p: 2, mb: 1.5, border: '1px solid rgba(0,0,0,0.15)' }}>
                      <Typography sx={{ color: '#a78bfa', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', mb: 0.75, letterSpacing: '0.05em' }}>
                        질문
                      </Typography>
                      <Typography sx={{ color: '#000000', fontSize: '0.875rem', lineHeight: 1.6 }}>
                        {extracted || '-'}
                      </Typography>
                      {hasContext && (
                        <Box sx={{ mt: 1 }}>
                          <Button
                            size="small"
                            onClick={() => toggleExpand(item.id)}
                            sx={{
                              color: '#1E293B', fontSize: '0.72rem', textTransform: 'none',
                              fontWeight: 600, p: 0, minWidth: 0,
                              '&:hover': { bgcolor: 'transparent', color: '#a78bfa' },
                            }}
                          >
                            {isExpanded ? '접기' : '자세히 보기'}
                          </Button>
                        </Box>
                      )}
                      {hasContext && isExpanded && (
                        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid rgba(0,0,0,0.15)' }}>
                          <Typography sx={{ color: '#000000', fontSize: '0.8125rem', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                            {item.user_message}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  );
                })()}

                {/* AI 답변 */}
                {item.ai_response && (
                  <Box sx={{ bgcolor: '#E9EEF4', borderRadius: '10px', p: 2, mb: 2, border: '1px solid rgba(0,0,0,0.15)' }}>
                    <Typography sx={{ color: '#15803D', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', mb: 0.75, letterSpacing: '0.05em' }}>
                      AI
                    </Typography>
                    <Typography sx={{ color: '#1E293B', fontSize: '0.875rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {item.ai_response}
                    </Typography>
                  </Box>
                )}

                {/* 완료 처리 / 답변 후 완료 버튼 영역 */}
                {item.status === 'pending' && (
                  <Box>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        flexWrap: { xs: 'wrap', md: 'nowrap' },
                        gap: 1,
                      }}
                    >
                      <TextField
                        size="small"
                        placeholder={
                          item.session_id
                            ? '사용자에게 전달할 답변을 입력하세요...'
                            : '연결된 채팅 세션이 없어 답변을 보낼 수 없습니다.'
                        }
                        value={replyDraft[item.id] || ''}
                        onChange={(e) =>
                          setReplyDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        disabled={replying[item.id] || !item.session_id}
                        sx={{
                          flex: '1 1 0',
                          minWidth: { xs: '100%', md: 0 },
                          '& .MuiOutlinedInput-root': {
                            bgcolor: '#F8FAFC',
                            borderRadius: '10px',
                            fontSize: '0.875rem',
                            color: '#1E293B',
                            minHeight: 40,
                            '& input::placeholder': { color: '#1E293B', opacity: 1 },
                            '& fieldset': { borderColor: 'rgba(167,139,250,0.3)' },
                            '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.5)' },
                            '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
                            '&.Mui-disabled': {
                              color: '#8A8190',
                            },
                            '&.Mui-disabled fieldset': {
                              borderColor: 'rgba(0,0,0,0.15)',
                            },
                          },
                        }}
                      />
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                        }}
                      >
                        {/* 답변 후 완료 버튼 */}
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={
                            !item.session_id ||
                            replying[item.id] ||
                            !(replyDraft[item.id] || '').trim()
                          }
                          title={!item.session_id ? '연결된 채팅 세션이 없습니다' : ''}
                          onClick={() => handleReply(item.id)}
                          sx={{
                            minWidth: 118,
                            borderRadius: '10px',
                            fontWeight: 700,
                            textTransform: 'none',
                            fontSize: '0.8rem',
                            borderColor: 'rgba(167,139,250,0.3)',
                            color: '#a78bfa',
                            '&:hover': {
                              borderColor: '#a78bfa',
                              bgcolor: 'rgba(167,139,250,0.05)',
                            },
                            '&.Mui-disabled': {
                              borderColor: 'rgba(0,0,0,0.15)',
                              color: '#8A8190',
                              bgcolor: 'rgba(0,0,0,0.02)',
                            },
                          }}
                        >
                          {replying[item.id] ? <CircularProgress size={16} color="inherit" /> : '답변 전송'}
                        </Button>

                        {/* 기존 완료 처리 버튼 (유지) */}
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={resolving[item.id]}
                          onClick={() => handleResolve(item.id)}
                          sx={{
                            minWidth: 118,
                            borderColor: '#86EFAC',
                            color: '#15803D',
                            borderRadius: '10px',
                            fontWeight: 700,
                            textTransform: 'none',
                            fontSize: '0.8rem',
                            '&:hover': { borderColor: '#86EFAC', bgcolor: '#DCFCE7' },
                            '&.Mui-disabled': { opacity: 0.3 },
                          }}
                        >
                          {resolving[item.id] ? <CircularProgress size={16} color="inherit" /> : '✓ 완료 처리'}
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}


const STUDENT_STATUS_MAP = {
  active: { label: '재원', bgcolor: '#DCFCE7', color: '#15803D', border: '#86EFAC' },
  inactive: { label: '휴원', bgcolor: '#FEE2E2', color: '#DC2626', border: '#FCA5A5' },
  graduated: { label: '졸업', bgcolor: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
};

const CLASS_STATUS_MAP = {
  active: { label: '운영중', bgcolor: '#DCFCE7', color: '#15803D' },
  closed: { label: '종료', bgcolor: '#FEE2E2', color: '#DC2626' },
};

const EMPTY_CLASS_FORM = { name: '', code: '', grade_level: '', subject: '', teacher_name: '', day_of_week: '', start_time: '', end_time: '', capacity: '', status: 'active', memo: '' };
const EMPTY_STUDENT_FORM = { name: '', birth_date: '', school_name: '', grade: '', class_id: null, phone: '', parent_name: '', parent_phone: '', status: 'active', memo: '' };

function StudentStatusChip({ status }) {
  const s = STUDENT_STATUS_MAP[status] || STUDENT_STATUS_MAP.active;
  return (
    <Chip label={s.label} size="small" sx={{ bgcolor: s.bgcolor, color: s.color, border: `1px solid ${s.border}`, fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
  );
}

function ClassStatusChip({ status }) {
  const s = CLASS_STATUS_MAP[status] || CLASS_STATUS_MAP.active;
  return (
    <Chip label={s.label} size="small" sx={{ bgcolor: s.bgcolor, color: s.color, fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
  );
}

function StudentManagementPanel({ initialSubTab = 0 }) {
  const navigate = useNavigate();
  const { currentSlug } = useTenant();
  const basePath = `/${currentSlug}/admin/students`;

  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [studentSubTab, setStudentSubTab] = useState(initialSubTab);

  // Sync state with prop if it changes (for direct URL navigation)
  useEffect(() => {
    setStudentSubTab(initialSubTab);
  }, [initialSubTab]);

  const handleSubTabChange = (index) => {
    setStudentSubTab(index);
    const paths = {
      0: '/classes',
      1: '/list',
      2: '/attendance',
      3: '/assignments',
      4: '/exams'
    };
    navigate(`${basePath}${paths[index]}`);
  };
  const [expandedClasses, setExpandedClasses] = useState(new Set());

  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [classForm, setClassForm] = useState(EMPTY_CLASS_FORM);

  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [studentForm, setStudentForm] = useState(EMPTY_STUDENT_FORM);

  const [studentSearch, setStudentSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');

  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });
  const [deleteClassId, setDeleteClassId] = useState(null);
  const [deleteStudentId, setDeleteStudentId] = useState(null);

  const showSnack = (message, severity = 'success') => setSnack({ open: true, message, severity });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [classRes, studentRes] = await Promise.all([
          studentAPI.listClasses(),
          studentAPI.listStudents(),
        ]);
        setClasses(classRes.data);
        setStudents(studentRes.data);
        setExpandedClasses(new Set(classRes.data.map(c => c.id)));
      } catch (err) {
        showSnack('데이터를 불러오지 못했습니다.', 'error');
      }
    };
    fetchData();
  }, []);

  const toggleClassExpanded = (id) => {
    setExpandedClasses(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openAddClass = () => { setEditingClass(null); setClassForm(EMPTY_CLASS_FORM); setClassDialogOpen(true); };
  const openEditClass = (cls) => { setEditingClass(cls); setClassForm({ ...cls }); setClassDialogOpen(true); };

  const saveClass = async () => {
    if (!classForm.name.trim()) { showSnack('분반명을 입력해주세요.', 'error'); return; }
    const payload = { ...classForm, capacity: classForm.capacity === '' ? null : Number(classForm.capacity) };
    try {
      if (editingClass) {
        const res = await studentAPI.updateClass(editingClass.id, payload);
        setClasses(prev => prev.map(c => c.id === editingClass.id ? res.data : c));
        showSnack('분반이 수정되었습니다.');
      } else {
        const res = await studentAPI.createClass(payload);
        setClasses(prev => [...prev, res.data]);
        setExpandedClasses(prev => new Set([...prev, res.data.id]));
        showSnack('분반이 추가되었습니다.');
      }
      setClassDialogOpen(false);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = Array.isArray(detail) ? detail.map(d => d.msg).join(', ') : (detail || '저장에 실패했습니다.');
      showSnack(msg, 'error');
    }
  };

  const confirmDeleteClass = async () => {
    try {
      await studentAPI.deleteClass(deleteClassId);
      setClasses(prev => prev.filter(c => c.id !== deleteClassId));
      setStudents(prev => prev.map(s => s.class_id === deleteClassId ? { ...s, class_id: null } : s));
      setDeleteClassId(null);
      showSnack('분반이 삭제되었습니다.');
    } catch (err) {
      showSnack('삭제에 실패했습니다.', 'error');
    }
  };

  const openAddStudent = () => { setEditingStudent(null); setStudentForm(EMPTY_STUDENT_FORM); setStudentDialogOpen(true); };
  const openEditStudent = (stu) => { setEditingStudent(stu); setStudentForm({ ...stu }); setStudentDialogOpen(true); };

  const saveStudent = async () => {
    if (!studentForm.name.trim()) { showSnack('이름을 입력해주세요.', 'error'); return; }
    if (!studentForm.birth_date) { showSnack('생년월일을 입력해주세요.', 'error'); return; }
    try {
      if (editingStudent) {
        const res = await studentAPI.updateStudent(editingStudent.id, studentForm);
        setStudents(prev => prev.map(s => s.id === editingStudent.id ? res.data : s));
        showSnack('학생 정보가 수정되었습니다.');
      } else {
        const res = await studentAPI.createStudent(studentForm);
        setStudents(prev => [...prev, res.data]);
        showSnack('학생이 추가되었습니다.');
      }
      setStudentDialogOpen(false);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = Array.isArray(detail) ? detail.map(d => d.msg).join(', ') : (detail || '저장에 실패했습니다.');
      showSnack(msg, 'error');
    }
  };

  const confirmDeleteStudent = async () => {
    try {
      await studentAPI.deleteStudent(deleteStudentId);
      setStudents(prev => prev.filter(s => s.id !== deleteStudentId));
      setDeleteStudentId(null);
      showSnack('학생이 삭제되었습니다.');
    } catch (err) {
      showSnack('삭제에 실패했습니다.', 'error');
    }
  };

  const toggleStudentStatus = async (stu) => {
    if (stu.status === 'graduated') return;
    const next = stu.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await studentAPI.updateStudent(stu.id, { status: next });
      setStudents(prev => prev.map(s => s.id === stu.id ? res.data : s));
    } catch (err) {
      showSnack('상태 변경에 실패했습니다.', 'error');
    }
  };

  const filteredStudents = students.filter(s => {
    const searchLower = studentSearch.toLowerCase();
    const searchDigits = studentSearch.replace(/[^0-9]/g, '');

    const matchSearch = !studentSearch ||
      s.name.toLowerCase().includes(searchLower) ||
      (s.school_name && s.school_name.toLowerCase().includes(searchLower)) ||
      (searchDigits && s.phone && s.phone.replace(/[^0-9]/g, '').includes(searchDigits));

    const matchClass = classFilter === 'all' || s.class_id === Number(classFilter);
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchGrade = gradeFilter === 'all' || s.grade === gradeFilter;
    return matchSearch && matchClass && matchStatus && matchGrade;
  });

  const allGrades = [...new Set(students.map(s => s.grade).filter(Boolean))].sort();

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: 'rgba(0,0,0,0.03)',
      borderRadius: '10px',
      fontSize: '0.8125rem',
      color: '#111827',
      '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' },
      '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' },
      '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
    },
    '& .MuiInputLabel-root': { color: '#1E293B', fontSize: '0.8125rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
  };

  const selectSx = {
    bgcolor: 'rgba(0,0,0,0.03)',
    borderRadius: '10px',
    fontSize: '0.8125rem',
    color: '#111827',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.15)' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(167,139,250,0.3)' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a78bfa' },
    '& .MuiSvgIcon-root': { color: '#1E293B' },
  };

  const menuProps = {
    PaperProps: {
      sx: { bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', '& .MuiMenuItem-root': { fontSize: '0.8125rem', color: '#1E293B', '&:hover': { bgcolor: 'rgba(167,139,250,0.08)', color: '#a78bfa' }, '&.Mui-selected': { bgcolor: 'rgba(167,139,250,0.12)', color: '#a78bfa' } } },
    },
  };

  const colHeaderSx = { fontSize: '0.7rem', fontWeight: 700, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.05em' };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <School sx={{ fontSize: 18, color: '#fff' }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>학생 관리</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#1E293B' }}>분반 · 학생 · 출결 · 과제 · 시험을 관리합니다</Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
        {['분반', '학생', '출결', '과제', '시험'].map((label, i) => (
          <Box key={i} onClick={() => handleSubTabChange(i)} sx={{
            px: 2.5, py: 1, borderRadius: '10px', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600,
            bgcolor: studentSubTab === i ? 'rgba(167,139,250,0.12)' : 'transparent',
            color: studentSubTab === i ? '#a78bfa' : '#475569',
            border: studentSubTab === i ? '1px solid rgba(167,139,250,0.25)' : '1px solid transparent',
            transition: 'all 0.2s',
            '&:hover': { bgcolor: 'rgba(167,139,250,0.08)', color: '#c4b5fd' },
          }}>{label}</Box>
        ))}
      </Box>

      {studentSubTab === 0 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button onClick={openAddClass} startIcon={<Add />} sx={{ background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', px: 2.5, borderRadius: '10px', textTransform: 'none', '&:hover': { opacity: 0.9 } }}>
              분반 추가
            </Button>
          </Box>

          <Box sx={{ bgcolor: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.20)', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 60px 80px 90px', px: 2.5, py: 1.2, borderBottom: '1px solid rgba(0,0,0,0.15)', bgcolor: '#F8FAFC' }}>
              {['분반명/코드', '대상/과목', '담당자', '요일/시간', '정원', '상태', '액션'].map(h => (
                <Typography key={h} sx={colHeaderSx}>{h}</Typography>
              ))}
            </Box>
            {classes.length === 0 && (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <Typography sx={{ color: '#1E293B', fontSize: '0.875rem' }}>등록된 분반이 없습니다.</Typography>
              </Box>
            )}
            {classes.map((cls, idx) => (

              <Box key={cls.id} sx={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 60px 80px 90px', px: 2.5, py: 1.6, borderBottom: idx < classes.length - 1 ? '1px solid rgba(0,0,0,0.12)' : 'none', alignItems: 'center', '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' } }}>

                <Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{cls.name}</Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: '#1E293B', fontFamily: 'JetBrains Mono, monospace' }}>{cls.code}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.8125rem', color: '#1E293B' }}>{cls.grade_level}</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#1E293B' }}>{cls.subject}</Typography>
                </Box>
                <Typography sx={{ fontSize: '0.8125rem', color: '#1E293B' }}>{cls.teacher_name}</Typography>
                <Box>
                  <Typography sx={{ fontSize: '0.8125rem', color: '#1E293B' }}>{cls.day_of_week}</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#1E293B' }}>{cls.start_time} ~ {cls.end_time}</Typography>
                </Box>
                <Typography sx={{ fontSize: '0.8125rem', color: '#1E293B', textAlign: 'center' }}>{cls.capacity}명</Typography>
                <ClassStatusChip status={cls.status} />
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton size="small" onClick={() => openEditClass(cls)} sx={{ color: '#334155', '&:hover': { color: '#a78bfa', bgcolor: 'rgba(167,139,250,0.08)' } }}><Edit sx={{ fontSize: 15 }} /></IconButton>
                  <IconButton size="small" onClick={() => setDeleteClassId(cls.id)} sx={{ color: '#334155', '&:hover': { color: '#DC2626', bgcolor: 'rgba(239,68,68,0.08)' } }}><DeleteOutline sx={{ fontSize: 15 }} /></IconButton>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {studentSubTab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="이름, 학교명 또는 연락처 검색"
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              InputProps={{ startAdornment: <Search sx={{ fontSize: 16, color: '#1E293B', mr: 0.5 }} /> }}
              sx={{ ...inputSx, width: 200 }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <Select value={classFilter} onChange={e => setClassFilter(e.target.value)} displayEmpty sx={selectSx} MenuProps={menuProps}>
                <MenuItem value="all">전체 분반</MenuItem>
                {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} displayEmpty sx={selectSx} MenuProps={menuProps}>
                <MenuItem value="all">전체 상태</MenuItem>
                <MenuItem value="active">재원</MenuItem>
                <MenuItem value="inactive">휴원</MenuItem>
                <MenuItem value="graduated">졸업</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <Select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)} displayEmpty sx={selectSx} MenuProps={menuProps}>
                <MenuItem value="all">전체 학년</MenuItem>
                {allGrades.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
              </Select>
            </FormControl>
            <Box sx={{ flex: 1 }} />
            <Button onClick={openAddStudent} startIcon={<Add />} sx={{ background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', px: 2.5, borderRadius: '10px', textTransform: 'none', '&:hover': { opacity: 0.9 } }}>
              학생 추가
            </Button>          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {classes.map(cls => {
              const clsStudents = filteredStudents.filter(s => s.class_id === cls.id);
              if (classFilter !== 'all' && cls.id !== Number(classFilter)) return null;
              const isExpanded = expandedClasses.has(cls.id);
              return (
                <Box key={cls.id} sx={{ bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 1.5, bgcolor: '#F8FAFC', borderRadius: isExpanded ? '10px 10px 0 0' : '10px', cursor: 'pointer' }} onClick={() => toggleClassExpanded(cls.id)}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{ width: 30, height: 30, borderRadius: '8px', background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Groups sx={{ fontSize: 15, color: '#fff' }} />
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>{cls.name}</Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: '#1E293B' }}>{cls.teacher_name} · {cls.day_of_week} {cls.start_time}~{cls.end_time}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label={`${clsStudents.length}명`} size="small" sx={{ bgcolor: 'rgba(167,139,250,0.12)', color: '#a78bfa', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
                      <ClassStatusChip status={cls.status} />
                      {isExpanded ? <ExpandLess sx={{ fontSize: 18, color: '#1E293B' }} /> : <ExpandMore sx={{ fontSize: 18, color: '#1E293B' }} />}
                    </Box>
                  </Box>

                  {isExpanded && (
                    <Box>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px 70px 90px 80px', px: 2.5, py: 1, bgcolor: '#F8FAFC', borderTop: '1px solid rgba(0,0,0,0.15)' }}>
                        {['이름', '학교/학년', '분반', '연락처', '상태', '수정일', '액션'].map(h => (
                          <Typography key={h} sx={colHeaderSx}>{h}</Typography>
                        ))}
                      </Box>
                      {clsStudents.length === 0 && (

                        <Box sx={{ py: 4, textAlign: 'center', borderTop: '1px solid rgba(0,0,0,0.12)' }}>
                          <Typography sx={{ color: '#1E293B', fontSize: '0.8125rem' }}>조건에 맞는 학생이 없습니다.</Typography>
                        </Box>
                      )}
                      {clsStudents.map((stu) => (
                        <Box key={stu.id} sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px 70px 90px 80px', px: 2.5, py: 1.6, borderTop: '1px solid rgba(0,0,0,0.09)', alignItems: 'center', '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' } }}>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar sx={{ width: 26, height: 26, bgcolor: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontSize: '0.65rem', fontWeight: 700 }}>{stu.name[0]}</Avatar>
                            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{stu.name}</Typography>
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize: '0.8125rem', color: '#1E293B' }}>{stu.school_name}</Typography>
                            <Typography sx={{ fontSize: '0.7rem', color: '#1E293B' }}>{stu.grade}</Typography>
                          </Box>
                          <Typography sx={{ fontSize: '0.8125rem', color: '#1E293B' }}>{cls.name}</Typography>
                          <Typography sx={{ fontSize: '0.8125rem', color: '#1E293B' }}>{stu.phone}</Typography>
                          <Box onClick={() => toggleStudentStatus(stu)} sx={{ cursor: stu.status !== 'graduated' ? 'pointer' : 'default' }}>
                            <StudentStatusChip status={stu.status} />
                          </Box>
                          <Typography sx={{ fontSize: '0.75rem', color: '#1E293B' }}>{stu.updated_at ? stu.updated_at.slice(0, 10) : '-'}</Typography>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <IconButton size="small" onClick={() => openEditStudent(stu)} sx={{ color: '#334155', '&:hover': { color: '#a78bfa', bgcolor: 'rgba(167,139,250,0.08)' } }}><Edit sx={{ fontSize: 15 }} /></IconButton>
                            <IconButton size="small" onClick={() => setDeleteStudentId(stu.id)} sx={{ color: '#334155', '&:hover': { color: '#DC2626', bgcolor: 'rgba(239,68,68,0.08)' } }}><DeleteOutline sx={{ fontSize: 15 }} /></IconButton>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              );
            })}
            {(() => {
              const unassigned = filteredStudents.filter(s => s.class_id === null);
              if (classFilter !== 'all' || unassigned.length === 0) return null;
              const isExpanded = expandedClasses.has('unassigned');
              return (
                <Box sx={{ bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.10)', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 1.5, bgcolor: '#F8FAFC', cursor: 'pointer' }} onClick={() => toggleClassExpanded('unassigned')}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{ width: 30, height: 30, borderRadius: '8px', bgcolor: 'rgba(113,113,122,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Groups sx={{ fontSize: 15, color: '#1E293B' }} />
                      </Box>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#1E293B' }}>미배정</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label={`${unassigned.length}명`} size="small" sx={{ bgcolor: 'rgba(113,113,122,0.15)', color: '#1E293B', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
                      {isExpanded ? <ExpandLess sx={{ fontSize: 18, color: '#1E293B' }} /> : <ExpandMore sx={{ fontSize: 18, color: '#1E293B' }} />}
                    </Box>
                  </Box>
                  {isExpanded && (
                    <Box>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px 70px 90px 80px', px: 2.5, py: 1, bgcolor: '#F8FAFC', borderTop: '1px solid rgba(0,0,0,0.15)' }}>
                        {['이름', '학교/학년', '분반', '연락처', '상태', '수정일', '액션'].map(h => (
                          <Typography key={h} sx={colHeaderSx}>{h}</Typography>
                        ))}
                      </Box>
                      {unassigned.map(stu => (

                        <Box key={stu.id} sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px 70px 90px 80px', px: 2.5, py: 1.6, borderTop: '1px solid rgba(0,0,0,0.12)', alignItems: 'center', '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' } }}>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar sx={{ width: 26, height: 26, bgcolor: 'rgba(113,113,122,0.15)', color: '#1E293B', fontSize: '0.65rem', fontWeight: 700 }}>{stu.name[0]}</Avatar>
                            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{stu.name}</Typography>
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize: '0.8125rem', color: '#1E293B' }}>{stu.school_name}</Typography>
                            <Typography sx={{ fontSize: '0.7rem', color: '#1E293B' }}>{stu.grade}</Typography>
                          </Box>
                          <Typography sx={{ fontSize: '0.8125rem', color: '#1E293B' }}>-</Typography>
                          <Typography sx={{ fontSize: '0.8125rem', color: '#1E293B' }}>{stu.phone}</Typography>
                          <Box onClick={() => toggleStudentStatus(stu)} sx={{ cursor: stu.status !== 'graduated' ? 'pointer' : 'default' }}>
                            <StudentStatusChip status={stu.status} />
                          </Box>
                          <Typography sx={{ fontSize: '0.75rem', color: '#1E293B' }}>{stu.updated_at ? stu.updated_at.slice(0, 10) : '-'}</Typography>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <IconButton size="small" onClick={() => openEditStudent(stu)} sx={{ color: '#334155', '&:hover': { color: '#a78bfa', bgcolor: 'rgba(167,139,250,0.08)' } }}><Edit sx={{ fontSize: 15 }} /></IconButton>
                            <IconButton size="small" onClick={() => setDeleteStudentId(stu.id)} sx={{ color: '#334155', '&:hover': { color: '#DC2626', bgcolor: 'rgba(239,68,68,0.08)' } }}><DeleteOutline sx={{ fontSize: 15 }} /></IconButton>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              );
            })()}
          </Box>
        </Box>
      )}

      <Dialog open={classDialogOpen} onClose={() => setClassDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px' } }}>
        <DialogTitle sx={{ color: '#111827', fontWeight: 700, fontSize: '1rem', pb: 1, borderBottom: '1px solid rgba(0,0,0,0.15)' }}>
          {editingClass ? '분반 수정' : '분반 추가'}
        </DialogTitle>
        <DialogContent sx={{ '&&': { pt: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="분반명 *" size="small" value={classForm.name} onChange={e => setClassForm(p => ({ ...p, name: e.target.value }))} sx={inputSx} />
            <TextField label="분반코드" size="small" value={classForm.code} onChange={e => setClassForm(p => ({ ...p, code: e.target.value }))} sx={inputSx} />
            <TextField label="대상학년" size="small" value={classForm.grade_level} onChange={e => setClassForm(p => ({ ...p, grade_level: e.target.value }))} sx={inputSx} />
            <TextField label="과목" size="small" value={classForm.subject} onChange={e => setClassForm(p => ({ ...p, subject: e.target.value }))} sx={inputSx} />
            <TextField label="담당자" size="small" value={classForm.teacher_name} onChange={e => setClassForm(p => ({ ...p, teacher_name: e.target.value }))} sx={inputSx} />
            <TextField label="수업요일" size="small" value={classForm.day_of_week} onChange={e => setClassForm(p => ({ ...p, day_of_week: e.target.value }))} sx={inputSx} />
            <TextField label="시작시간" size="small" type="time" value={classForm.start_time} onChange={e => setClassForm(p => ({ ...p, start_time: e.target.value }))} InputLabelProps={{ shrink: true }} sx={inputSx} />
            <TextField label="종료시간" size="small" type="time" value={classForm.end_time} onChange={e => setClassForm(p => ({ ...p, end_time: e.target.value }))} InputLabelProps={{ shrink: true }} sx={inputSx} />
            <TextField label="정원" size="small" type="number" value={classForm.capacity} onChange={e => setClassForm(p => ({ ...p, capacity: e.target.value }))} sx={inputSx} />
            <FormControl size="small">
              <Select value={classForm.status} onChange={e => setClassForm(p => ({ ...p, status: e.target.value }))} sx={selectSx} MenuProps={menuProps}>
                <MenuItem value="active">운영중</MenuItem>
                <MenuItem value="closed">종료</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <TextField label="비고" size="small" multiline rows={2} value={classForm.memo} onChange={e => setClassForm(p => ({ ...p, memo: e.target.value }))} sx={inputSx} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setClassDialogOpen(false)} sx={{ color: '#1E293B', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', px: 2.5, textTransform: 'none', fontSize: '0.8125rem' }}>취소</Button>
          <Button onClick={saveClass} sx={{ background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', color: '#fff', fontWeight: 700, borderRadius: '10px', px: 2.5, textTransform: 'none', fontSize: '0.8125rem', '&:hover': { opacity: 0.9 } }}>저장</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteClassId} onClose={() => setDeleteClassId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px' } }}>
        <DialogTitle sx={{ color: '#111827', fontWeight: 700, fontSize: '1rem' }}>분반 삭제</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#1E293B', fontSize: '0.875rem' }}>해당 분반과 소속 학생 데이터가 모두 삭제됩니다. 계속하시겠습니까?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setDeleteClassId(null)} sx={{ color: '#1E293B', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', px: 2.5, textTransform: 'none', fontSize: '0.8125rem' }}>취소</Button>
          <Button onClick={confirmDeleteClass} sx={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#fff', fontWeight: 700, borderRadius: '10px', px: 2.5, textTransform: 'none', fontSize: '0.8125rem', '&:hover': { opacity: 0.9 } }}>삭제</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={studentDialogOpen} onClose={() => setStudentDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px' } }}>
        <DialogTitle sx={{ color: '#111827', fontWeight: 700, fontSize: '1rem', pb: 1, borderBottom: '1px solid rgba(0,0,0,0.15)' }}>
          {editingStudent ? '학생 수정' : '학생 추가'}
        </DialogTitle>
        <DialogContent sx={{ '&&': { pt: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label="학생 ID"
              size="small"
              value={editingStudent ? editingStudent.id : '자동 부여'}
              disabled
              sx={{
                ...inputSx,
                '& .MuiOutlinedInput-root': {
                  ...inputSx['& .MuiOutlinedInput-root'],
                  opacity: 1,
                },
                '& .MuiInputBase-input.Mui-disabled': {
                  color: '#1E293B',
                  WebkitTextFillColor: '#64748B',
                },
                '& .MuiInputLabel-root.Mui-disabled': {
                  color: '#1E293B',
                },
              }}
            />
            <TextField label="이름 *" size="small" value={studentForm.name} onChange={e => setStudentForm(p => ({ ...p, name: e.target.value }))} sx={inputSx} />
            <TextField label="생년월일 *" size="small" type="date" value={studentForm.birth_date} onChange={e => setStudentForm(p => ({ ...p, birth_date: e.target.value }))} InputLabelProps={{ shrink: true }} sx={inputSx} />
            <TextField label="학교명" size="small" value={studentForm.school_name} onChange={e => setStudentForm(p => ({ ...p, school_name: e.target.value }))} sx={inputSx} />
            <TextField label="학년" size="small" value={studentForm.grade} onChange={e => setStudentForm(p => ({ ...p, grade: e.target.value }))} sx={inputSx} />
            <TextField label="연락처" size="small" value={studentForm.phone} onChange={e => setStudentForm(p => ({ ...p, phone: e.target.value }))} sx={inputSx} />
            <TextField label="학부모 이름" size="small" value={studentForm.parent_name} onChange={e => setStudentForm(p => ({ ...p, parent_name: e.target.value }))} sx={inputSx} />
            <TextField label="학부모 연락처" size="small" value={studentForm.parent_phone} onChange={e => setStudentForm(p => ({ ...p, parent_phone: e.target.value }))} sx={inputSx} />
            <FormControl size="small">
              <Select value={studentForm.class_id ?? ''} onChange={e => setStudentForm(p => ({ ...p, class_id: e.target.value || null }))} displayEmpty sx={selectSx} MenuProps={menuProps}>
                <MenuItem value="">분반 선택</MenuItem>
                {classes.filter(c => c.status !== 'closed').map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small">
              <Select value={studentForm.status} onChange={e => setStudentForm(p => ({ ...p, status: e.target.value }))} sx={selectSx} MenuProps={menuProps}>
                <MenuItem value="active">재원</MenuItem>
                <MenuItem value="inactive">휴원</MenuItem>
                <MenuItem value="graduated">졸업</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <TextField label="비고" size="small" multiline rows={2} value={studentForm.memo} onChange={e => setStudentForm(p => ({ ...p, memo: e.target.value }))} sx={inputSx} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setStudentDialogOpen(false)} sx={{ color: '#1E293B', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', px: 2.5, textTransform: 'none', fontSize: '0.8125rem' }}>취소</Button>
          <Button onClick={saveStudent} sx={{ background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', color: '#fff', fontWeight: 700, borderRadius: '10px', px: 2.5, textTransform: 'none', fontSize: '0.8125rem', '&:hover': { opacity: 0.9 } }}>저장</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteStudentId} onClose={() => setDeleteStudentId(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px' } }}>
        <DialogTitle sx={{ color: '#111827', fontWeight: 700, fontSize: '1rem' }}>학생 삭제</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#1E293B', fontSize: '0.875rem' }}>학생 데이터가 삭제됩니다. 계속하시겠습니까?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setDeleteStudentId(null)} sx={{ color: '#1E293B', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', px: 2.5, textTransform: 'none', fontSize: '0.8125rem' }}>취소</Button>
          <Button onClick={confirmDeleteStudent} sx={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#fff', fontWeight: 700, borderRadius: '10px', px: 2.5, textTransform: 'none', fontSize: '0.8125rem', '&:hover': { opacity: 0.9 } }}>삭제</Button>
        </DialogActions>
      </Dialog>

      {studentSubTab === 2 && <AttendanceTab />}
      {studentSubTab === 3 && <AssignmentTab />}
      {studentSubTab === 4 && <ExamTab />}

      {snack.open && (
        <Box sx={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, bgcolor: snack.severity === 'error' ? '#FEE2E2' : '#DCFCE7', border: `1px solid ${snack.severity === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`, color: snack.severity === 'error' ? '#DC2626' : '#15803D', px: 3, py: 1.2, borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600 }}
          onClick={() => setSnack(p => ({ ...p, open: false }))}>
          {snack.message}
        </Box>
      )}
    </Box>
  );
}

const SECTION_TAB_MAP = {
  dashboard: 0,
  hitl: 7,
  'chat-history': 6,
  stores: 1,
  users: 2,
  templates: 3,
  calendar: 4,
  chatbot: 5,
  students: 8,
  'exam-analysis': 9,
};

export default function AdminPage({ section = 'stores', initialStudentSubTab = 0 }) {
  const { currentSlug } = useTenant();
  const { addUpload } = useUpload();
  const tabValue = SECTION_TAB_MAP[section] ?? 0;

  // Document Store States (existing)
  const [corpora, setCorpora] = useState([]);
  const [selectedCorpus, setSelectedCorpus] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCorpusName, setNewCorpusName] = useState('');
  const [newCorpusIsPublic, setNewCorpusIsPublic] = useState(true);
  const [newCorpusGroupIds, setNewCorpusGroupIds] = useState([]);
  const [creatingCorpus, setCreatingCorpus] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  // API Pagination States
  const [totalDocumentCount, setTotalDocumentCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageTokens, setPageTokens] = useState([null]); // Stack of page tokens for navigation
  const [documentSearchQuery, setDocumentSearchQuery] = useState(''); // 문서 검색어

  // Groups & Users States (new)
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('all'); // 'all', 'unassigned', or group.id
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // User Management States (new)
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);
  const [selectedUserForAction, setSelectedUserForAction] = useState(null);
  const [userEditDialogOpen, setUserEditDialogOpen] = useState(false);
  const [userPasswordDialogOpen, setUserPasswordDialogOpen] = useState(false);
  const [userEditForm, setUserEditForm] = useState({ username: '', email: '' });
  const [newUserPassword, setNewUserPassword] = useState('');

  // Store Permissions States (new)
  const [permissions, setPermissions] = useState([]);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [selectedCorpusForPermission, setSelectedCorpusForPermission] = useState(null); // 권한 관리할 저장소
  const [isDragging, setIsDragging] = useState(false);

  // Prompt Templates States
  const [promptTemplates, setPromptTemplates] = useState([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    title: '',
    description: '',
    content: '',
    icon: 'description',
    is_active: true,
    display_order: 0
  });

  // Visibility Toggle Confirmation
  const [visibilityDialogOpen, setVisibilityDialogOpen] = useState(false);
  const [visibilityTarget, setVisibilityTarget] = useState(null); // { corpusName, newValue }

  // Password Verification States (for corpus deletion)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [deletingCorpusName, setDeletingCorpusName] = useState(null);
  const [deletingCorpus, setDeletingCorpus] = useState(false);
  const [password, setPassword] = useState('');

  // Bulk Delete States (for documents)
  const [selectedDocuments, setSelectedDocuments] = useState([]); // 선택된 문서 목록
  const [docMenuAnchor, setDocMenuAnchor] = useState(null);
  const [docMenuTarget, setDocMenuTarget] = useState(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkDeletePassword, setBulkDeletePassword] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Dashboard States
  const [dashStats, setDashStats] = useState(null);
  const [dashAnalytics, setDashAnalytics] = useState(null);

  // Chat History States
  const [chatSessions, setChatSessions] = useState([]);
  const [chatSessionsTotal, setChatSessionsTotal] = useState(0);
  const [chatSessionsPage, setChatSessionsPage] = useState(1);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionMessages, setSessionMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatHistorySearch, setChatHistorySearch] = useState('');
  const [chatHistoryUserFilter, setChatHistoryUserFilter] = useState('all');
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);

  const loadDashboard = async () => {
    try {
      const [statsRes, analyticsRes] = await Promise.all([
        adminAPI.getStats(),
        adminAPI.getAnalytics(),
      ]);
      setDashStats(statsRes.data);
      setDashAnalytics(analyticsRes.data);
    } catch (err) {
      console.error('Dashboard load error:', err);
    }
  };

  const loadChatHistory = async (page = 1, userId = null) => {
    setChatHistoryLoading(true);
    try {
      const params = { page, page_size: 20 };
      if (userId && userId !== 'all') params.user_id = userId;
      const res = await adminAPI.listChatSessions(params);
      setChatSessions(res.data.sessions);
      setChatSessionsTotal(res.data.total);
      setChatSessionsPage(page);
    } catch (err) {
      console.error('Chat history load error:', err);
    } finally {
      setChatHistoryLoading(false);
    }
  };

  const loadChatSessionsPage = async (page) => {
    loadChatHistory(page, chatHistoryUserFilter);
  };

  const viewSessionMessages = async (sessionId) => {
    setLoadingMessages(true);
    try {
      const res = await adminAPI.getSessionMessages(sessionId);
      setSelectedSession(res.data.session);
      setSessionMessages(res.data.messages);
    } catch (err) {
      alert('메시지 로드 실패: ' + err.message);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    loadCorpora();
    loadGroups();
    loadUsers();
    loadPermissions();
    loadPromptTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load tab-specific data when section changes
  useEffect(() => {
    if (tabValue === 0) loadDashboard();
    if (tabValue === 6) loadChatHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabValue]);

  // ========== Document Store Functions (existing) ==========
  const loadCorpora = async () => {
    try {
      const response = await corpusAPI.list();
      setCorpora(response.data);
    } catch (error) {
      console.error('문서 저장소 로딩 오류:', error);
      alert('문서 저장소를 불러오는데 실패했습니다: ' + error.message);
    }
  };


  const loadCorpusDocuments = async (corpusName, page = 1, isNewStore = true, searchQuery = '') => {
    // 새 저장소 선택 시 즉시 UI 반응
    if (isNewStore) {
      const corpus = corpora.find(c => c.corpus_name === corpusName);
      if (corpus) {
        setSelectedCorpus({ ...corpus, documents: [] });
      }
      // Reset pagination and search state
      setCurrentPage(0);
      setPageTokens([null]);
      setDocumentSearchQuery('');
    }

    // 문서 로딩 시작
    setLoadingDocuments(true);
    setDocuments([]);

    try {
      // Call API with pagination and search parameters
      const params = { page_size: 10, page: page };
      if (searchQuery) {
        params.search = searchQuery;
      }

      const response = await corpusAPI.get(corpusName, params);

      console.log('API Response:', response.data);
      console.log('Total Count:', response.data.total_count);
      console.log('Has Next Page:', response.data.has_next_page);
      console.log('Documents Length:', response.data.documents?.length);

      setSelectedCorpus(response.data);
      setDocuments(response.data.documents || []);
      setTotalDocumentCount(response.data.total_count || 0);
    } catch (error) {
      console.error('문서 로딩 오류:', error);
      alert('문서를 불러오는데 실패했습니다: ' + error.message);
    } finally {
      setLoadingDocuments(false);
    }
  };

  // 문서 검색 핸들러
  const handleDocumentSearch = () => {
    if (selectedCorpus) {
      setCurrentPage(0);
      loadCorpusDocuments(selectedCorpus.corpus_name, 1, false, documentSearchQuery);
    }
  };

  // 검색 초기화
  const clearDocumentSearch = () => {
    setDocumentSearchQuery('');
    if (selectedCorpus) {
      setCurrentPage(0);
      loadCorpusDocuments(selectedCorpus.corpus_name, 1, false, '');
    }
  };

  const createCorpus = async () => {
    if (!newCorpusName.trim()) {
      alert('저장소 이름을 입력해주세요');
      return;
    }

    setCreatingCorpus(true);
    try {
      const res = await corpusAPI.create({ display_name: newCorpusName, is_public: newCorpusIsPublic });
      const corpusName = res.data.corpus_name;

      // Grant permissions to selected groups
      if (newCorpusGroupIds.length > 0 && corpusName) {
        for (const groupId of newCorpusGroupIds) {
          try {
            await adminAPI.grantStorePermission({ store_name: corpusName, group_id: groupId, can_read: true });
          } catch (permErr) {
            console.error(`Failed to grant permission for group ${groupId}:`, permErr);
          }
        }
      }

      setCreateDialogOpen(false);
      setNewCorpusName('');
      setNewCorpusIsPublic(true);
      setNewCorpusGroupIds([]);
      loadCorpora();
      alert('문서 저장소가 성공적으로 생성되었습니다!');
    } catch (error) {
      alert('저장소 생성 오류: ' + (error.response?.data?.detail || error.message));
    } finally {
      setCreatingCorpus(false);
    }
  };

  const uploadDocuments = async () => {
    console.log('[AdminPage] uploadDocuments called');
    console.log('[AdminPage] selectedFiles:', selectedFiles);
    console.log('[AdminPage] selectedCorpus:', selectedCorpus);

    if (selectedFiles.length === 0 || !selectedCorpus) {
      alert('파일을 선택해주세요');
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: selectedFiles.length });

    let startedCount = 0;
    let failedFiles = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      console.log(`[AdminPage] Uploading file ${i + 1}/${selectedFiles.length}:`, file.name);
      try {
        setUploadProgress({ current: i + 1, total: selectedFiles.length });

        // Start upload (returns immediately with operation ID)
        console.log('[AdminPage] Calling corpusAPI.uploadDocument...');
        const response = await corpusAPI.uploadDocument(selectedCorpus.corpus_name, file);
        console.log('[AdminPage] Upload API response:', response.data);

        // Add to upload context for background polling
        console.log('[AdminPage] Calling addUpload with:', {
          operation_name: response.data.operation_name,
          display_name: response.data.display_name,
          corpus_name: selectedCorpus.corpus_name,
          gcs_path: response.data.gcs_path
        });
        addUpload(
          response.data.operation_name,
          response.data.display_name,
          selectedCorpus.corpus_name,
          response.data.gcs_path
        );

        startedCount++;
      } catch (error) {
        console.error(`[AdminPage] Failed to start upload for ${file.name}:`, error);
        const errorMsg = error.response?.data?.detail || error.message || '알 수 없는 오류';
        failedFiles.push(`${file.name} (${errorMsg})`);
      }
    }

    setUploading(false);
    setSelectedFiles([]);
    setUploadProgress({ current: 0, total: 0 });

    if (failedFiles.length > 0) {
      alert(
        `❌ 업로드 실패\n\n성공: ${startedCount}개\n실패: ${failedFiles.length}개\n\n실패한 파일:\n${failedFiles.join('\n')}`
      );
    } else if (startedCount > 0) {
      alert(
        `✅ ${startedCount}개 파일이 업로드되었습니다.\n\n인덱싱이 진행 중이며, 챗봇에 반영되기까지 수 분이 소요될 수 있습니다.`
      );
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
  };

  const handleFolderSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
  };

  const removeFile = (index) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setSelectedFiles(files);
    }
  };

  const deleteCorpus = async (corpusName) => {
    // Open password dialog
    setDeletingCorpusName(corpusName);
    setPasswordDialogOpen(true);
  };

  const confirmDeleteCorpus = async () => {
    if (!password.trim()) {
      alert('비밀번호를 입력해주세요');
      return;
    }

    setDeletingCorpus(true);
    try {
      await corpusAPI.delete(deletingCorpusName, password);
      setPasswordDialogOpen(false);
      setPassword('');
      setDeletingCorpusName(null);
      setSelectedCorpus(null);
      setDocuments([]);
      loadCorpora();
      alert('저장소가 삭제되었습니다');
    } catch (error) {
      if (error.response?.status === 401) {
        alert('비밀번호가 일치하지 않습니다');
      } else {
        alert('저장소 삭제 오류: ' + (error.response?.data?.detail || error.message));
      }
    } finally {
      setDeletingCorpus(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '-';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) {
      return `${mb.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} MB`;
    }
    const kb = bytes / 1024;
    return `${kb.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} KB`;
  };

  const deleteDocument = async (documentName) => {
    if (!window.confirm('이 문서를 삭제하시겠습니까?')) return;

    try {
      // Extract document ID from full path
      // documentName format: "fileSearchStores/xxx/documents/yyy"
      // We need only "yyy"
      const documentId = documentName.split('/').pop();
      await corpusAPI.deleteDocument(selectedCorpus.corpus_name, documentId);

      // 왼쪽 저장소 목록의 문서 count 업데이트
      setCorpora(prevCorpora =>
        prevCorpora.map(corpus =>
          corpus.corpus_name === selectedCorpus.corpus_name
            ? { ...corpus, document_count: corpus.document_count - 1 }
            : corpus
        )
      );

      // 선택된 저장소의 document_count도 업데이트
      setSelectedCorpus(prev => prev ? { ...prev, document_count: prev.document_count - 1 } : prev);

      // 총 문서 수 업데이트
      setTotalDocumentCount(prev => prev - 1);

      // 문서 목록에서 삭제된 항목 제거 (API 재호출 없이 즉시 반영)
      setDocuments(prevDocs => prevDocs.filter(doc => doc.document_name !== documentName));

      alert('문서가 삭제되었습니다');
    } catch (error) {
      alert('문서 삭제 오류: ' + (error.response?.data?.detail || error.message));
    }
  };

  // ========== Bulk Delete Functions ==========
  // 단일 문서 선택/해제
  const toggleDocumentSelection = (documentName) => {
    setSelectedDocuments(prev =>
      prev.includes(documentName)
        ? prev.filter(name => name !== documentName)
        : [...prev, documentName]
    );
  };

  // 전체 선택/해제
  const toggleAllDocuments = () => {
    if (selectedDocuments.length === documents.length) {
      setSelectedDocuments([]);
    } else {
      setSelectedDocuments(documents.map(doc => doc.document_name));
    }
  };

  // 일괄 삭제 다이얼로그 열기
  const openBulkDeleteDialog = () => {
    if (selectedDocuments.length === 0) {
      alert('삭제할 문서를 선택해주세요');
      return;
    }
    setBulkDeleteDialogOpen(true);
  };

  // 일괄 삭제 실행
  const executeBulkDelete = async () => {
    if (!bulkDeletePassword) {
      alert('비밀번호를 입력해주세요');
      return;
    }

    setBulkDeleting(true);
    try {
      // display_name 목록 생성
      const displayNames = selectedDocuments.map(docName => {
        const doc = documents.find(d => d.document_name === docName);
        return doc?.display_name || docName.split('/').pop();
      });

      // API 호출
      const response = await corpusAPI.bulkDelete(selectedCorpus.corpus_name, {
        display_names: displayNames,
        password: bulkDeletePassword
      });

      const result = response.data;

      // 삭제 성공한 문서들의 document_name 찾기
      const deletedDocNames = selectedDocuments.filter(docName => {
        const doc = documents.find(d => d.document_name === docName);
        return doc && result.deleted.includes(doc.display_name);
      });

      // 상태 업데이트
      const deletedCount = deletedDocNames.length;
      if (deletedCount > 0) {
        // 문서 목록에서 제거
        setDocuments(prev => prev.filter(doc => !deletedDocNames.includes(doc.document_name)));

        // 왼쪽 저장소 count 업데이트
        setCorpora(prev =>
          prev.map(corpus =>
            corpus.corpus_name === selectedCorpus.corpus_name
              ? { ...corpus, document_count: corpus.document_count - deletedCount }
              : corpus
          )
        );

        // 선택된 저장소 count 업데이트
        setSelectedCorpus(prev => prev ? { ...prev, document_count: prev.document_count - deletedCount } : prev);

        // 총 문서 수 업데이트
        setTotalDocumentCount(prev => prev - deletedCount);
      }

      // 선택 초기화
      setSelectedDocuments([]);
      setBulkDeleteDialogOpen(false);
      setBulkDeletePassword('');

      // 결과 메시지
      let message = `✅ ${result.total_deleted}개 삭제 완료`;
      if (result.not_found.length > 0) {
        message += `\n⚠️ ${result.not_found.length}개 찾을 수 없음`;
      }
      if (result.errors.length > 0) {
        message += `\n❌ ${result.errors.length}개 오류 발생`;
      }
      alert(message);

    } catch (error) {
      alert('일괄 삭제 오류: ' + (error.response?.data?.detail || error.message));
    } finally {
      setBulkDeleting(false);
    }
  };

  // 페이지 변경 시 선택 초기화
  const handlePageChange = (event, newPage) => {
    setSelectedDocuments([]); // 선택 초기화
    setCurrentPage(newPage - 1);
    loadCorpusDocuments(selectedCorpus.corpus_name, newPage, false, documentSearchQuery);
  };

  // ========== Groups & Users Functions (new) ==========
  const loadGroups = async () => {
    try {
      const response = await adminAPI.listGroups();
      setGroups(response.data);
    } catch (error) {
      console.error('그룹 로딩 오류:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await adminAPI.listUsers();
      setUsers(response.data);
    } catch (error) {
      console.error('유저 로딩 오류:', error);
    }
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) {
      alert('그룹 이름을 입력해주세요');
      return;
    }

    try {
      await adminAPI.createGroup({
        name: newGroupName,
        description: newGroupDescription
      });
      setGroupDialogOpen(false);
      setNewGroupName('');
      setNewGroupDescription('');
      loadGroups();
      alert('그룹이 생성되었습니다');
    } catch (error) {
      alert('그룹 생성 오류: ' + (error.response?.data?.detail || error.message));
    }
  };

  const deleteGroup = async (groupId) => {
    if (!window.confirm('이 그룹을 삭제하시겠습니까?')) return;

    try {
      await adminAPI.deleteGroup(groupId);
      loadGroups();
      loadUsers(); // Refresh users to update group info
      alert('그룹이 삭제되었습니다');
    } catch (error) {
      alert('그룹 삭제 오류: ' + (error.response?.data?.detail || error.message));
    }
  };

  const updateUserGroup = async (userId, groupId) => {
    try {
      await adminAPI.updateUser(userId, { group_id: groupId });
      loadUsers();
      alert('유저 그룹이 변경되었습니다');
    } catch (error) {
      alert('유저 그룹 변경 오류: ' + (error.response?.data?.detail || error.message));
    }
  };

  const updateUserRole = async (userId, isAdmin) => {
    try {
      await adminAPI.updateUser(userId, { is_admin: isAdmin });
      loadUsers();
      alert('유저 권한이 변경되었습니다');
    } catch (error) {
      alert('유저 권한 변경 오류: ' + (error.response?.data?.detail || error.message));
    }
  };

  // User Menu Functions
  const handleUserMenuOpen = (event, user) => {
    setUserMenuAnchor(event.currentTarget);
    setSelectedUserForAction(user);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  const openUserEditDialog = () => {
    if (selectedUserForAction) {
      setUserEditForm({
        username: selectedUserForAction.username,
        email: selectedUserForAction.email
      });
      setUserEditDialogOpen(true);
    }
    handleUserMenuClose();
  };

  const openUserPasswordDialog = () => {
    setNewUserPassword('');
    setUserPasswordDialogOpen(true);
    handleUserMenuClose();
  };

  const handleUserEdit = async () => {
    if (!selectedUserForAction) return;

    try {
      await adminAPI.updateUser(selectedUserForAction.id, userEditForm);
      loadUsers();
      setUserEditDialogOpen(false);
      alert('유저 정보가 수정되었습니다');
    } catch (error) {
      alert('유저 정보 수정 오류: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleUserPasswordChange = async () => {
    if (!selectedUserForAction || !newUserPassword) return;

    if (newUserPassword.length < 4) {
      alert('비밀번호는 최소 4자 이상이어야 합니다');
      return;
    }

    try {
      await adminAPI.updateUserPassword(selectedUserForAction.id, newUserPassword);
      setUserPasswordDialogOpen(false);
      setNewUserPassword('');
      alert('비밀번호가 변경되었습니다');
    } catch (error) {
      alert('비밀번호 변경 오류: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleUserDelete = async () => {
    if (!selectedUserForAction) return;

    if (!window.confirm(`정말로 "${selectedUserForAction.username}" 유저를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
      handleUserMenuClose();
      return;
    }

    try {
      await adminAPI.deleteUser(selectedUserForAction.id);
      loadUsers();
      handleUserMenuClose();
      alert('유저가 삭제되었습니다');
    } catch (error) {
      alert('유저 삭제 오류: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Filter users based on selected group and search query
  const getFilteredUsers = () => {
    let filtered = users;

    // Filter by group
    if (selectedGroupFilter === 'all') {
      // All users
    } else if (selectedGroupFilter === 'unassigned') {
      filtered = filtered.filter(user => !user.group_id);
    } else {
      filtered = filtered.filter(user => user.group_id === parseInt(selectedGroupFilter));
    }

    // Filter by search query
    if (userSearchQuery.trim()) {
      const query = userSearchQuery.toLowerCase();
      filtered = filtered.filter(user =>
        user.username.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const filteredUsers = getFilteredUsers();

  // ========== Store Permissions Functions (new) ==========
  const loadPermissions = async () => {
    try {
      const response = await adminAPI.listStorePermissions();
      setPermissions(response.data);
    } catch (error) {
      console.error('권한 로딩 오류:', error);
    }
  };

  const grantPermissionToGroup = async (groupId) => {
    if (!selectedCorpusForPermission) return;

    try {
      await adminAPI.grantStorePermission({
        store_name: selectedCorpusForPermission.corpus_name,
        group_id: groupId,
        can_read: true
      });
      loadPermissions();
      alert('권한이 부여되었습니다');
    } catch (error) {
      alert('권한 부여 오류: ' + (error.response?.data?.detail || error.message));
    }
  };

  const revokePermission = async (permissionId) => {
    if (!window.confirm('이 권한을 삭제하시겠습니까?')) return;

    try {
      await adminAPI.revokeStorePermission(permissionId);
      loadPermissions();
      alert('권한이 삭제되었습니다');
    } catch (error) {
      alert('권한 삭제 오류: ' + (error.response?.data?.detail || error.message));
    }
  };

  // ========== Prompt Templates Functions ==========
  const loadPromptTemplates = async () => {
    try {
      const response = await promptTemplateAPI.listAll();
      setPromptTemplates(response.data);
    } catch (error) {
      console.error('프롬프트 템플릿 로딩 오류:', error);
    }
  };

  const openTemplateDialog = (template = null) => {
    if (template) {
      setEditingTemplate(template);
      setTemplateForm({
        title: template.title,
        description: template.description || '',
        content: template.content,
        icon: template.icon || 'description',
        is_active: template.is_active,
        display_order: template.display_order || 0
      });
    } else {
      setEditingTemplate(null);
      setTemplateForm({
        title: '',
        description: '',
        content: '',
        icon: 'description',
        is_active: true,
        display_order: promptTemplates.length + 1
      });
    }
    setTemplateDialogOpen(true);
  };

  const closeTemplateDialog = () => {
    setTemplateDialogOpen(false);
    setEditingTemplate(null);
    setTemplateForm({
      title: '',
      description: '',
      content: '',
      icon: 'description',
      is_active: true,
      display_order: 0
    });
  };

  const saveTemplate = async () => {
    if (!templateForm.title.trim() || !templateForm.content.trim()) {
      alert('제목과 프롬프트 내용은 필수입니다');
      return;
    }

    try {
      if (editingTemplate) {
        await promptTemplateAPI.update(editingTemplate.id, templateForm);
        alert('템플릿이 수정되었습니다');
      } else {
        await promptTemplateAPI.create(templateForm);
        alert('템플릿이 생성되었습니다');
      }
      closeTemplateDialog();
      loadPromptTemplates();
    } catch (error) {
      alert('템플릿 저장 오류: ' + (error.response?.data?.detail || error.message));
    }
  };

  const deleteTemplate = async (templateId) => {
    if (!window.confirm('이 템플릿을 삭제하시겠습니까?')) return;

    try {
      await promptTemplateAPI.delete(templateId);
      alert('템플릿이 삭제되었습니다');
      loadPromptTemplates();
    } catch (error) {
      alert('템플릿 삭제 오류: ' + (error.response?.data?.detail || error.message));
    }
  };

  const getTemplateIcon = (iconName) => {
    const iconMap = {
      'assignment': <Assignment sx={{ fontSize: 18 }} />,
      'event_note': <EventNote sx={{ fontSize: 18 }} />,
      'article': <Article sx={{ fontSize: 18 }} />,
      'notes': <Notes sx={{ fontSize: 18 }} />,
      'description': <Description sx={{ fontSize: 18 }} />,
    };
    return iconMap[iconName] || <Description sx={{ fontSize: 18 }} />;
  };

  // 드래그앤드롭 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 드래그 종료 핸들러
  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = promptTemplates.findIndex((t) => t.id === active.id);
      const newIndex = promptTemplates.findIndex((t) => t.id === over.id);

      const newOrder = arrayMove(promptTemplates, oldIndex, newIndex);
      setPromptTemplates(newOrder);

      // 서버에 새 순서 저장
      try {
        const orderIds = newOrder.map((t) => t.id);
        await promptTemplateAPI.reorder(orderIds);
      } catch (error) {
        console.error('순서 저장 오류:', error);
        // 실패 시 원래 순서로 복구
        loadPromptTemplates();
      }
    }
  };


  return (
    <Box sx={{ p: { xs: 2, md: '40px' }, minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
          @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        `}
      </style>

      {/* ============ Tab Panel 0: Dashboard ============ */}
      {tabValue === 0 && (
        <Box sx={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both', maxWidth: 1200, mx: 'auto' }}>
          {/* Stat Cards - same as superadmin */}
          <Grid container spacing={2.5}>
            {[
              { label: '사용자', value: dashStats?.user_count ?? 0, Icon: PeopleAltIcon, color: '#a78bfa' },
              { label: '문서', value: dashStats?.document_count ?? 0, Icon: Description, color: '#8B5CF6' },
              { label: 'CORPUS', value: dashStats?.corpus_count ?? 0, Icon: StorageIcon2, color: '#3B82F6' },
              { label: '세션', value: dashStats?.session_count ?? 0, Icon: ChatBubbleIcon2, color: '#10B981' },
              { label: '메시지', value: dashStats?.message_count ?? 0, Icon: MessageIcon, color: '#F59E0B' },
            ].map((card) => (
              <Grid item xs={6} md={2.4} key={card.label}>
                <Box sx={{ bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px', p: 3 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: `${card.color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                    <card.Icon sx={{ fontSize: 20, color: card.color }} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 800, color: '#111827', mb: 0.5, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    {(card.value ?? 0).toLocaleString()}
                  </Typography>
                  <Typography variant="overline" sx={{ color: '#334155', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.08em', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    {card.label}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>

          {/* Analytics Charts - same layout as superadmin */}
          {dashAnalytics && (
            <Grid container spacing={2.5} sx={{ mt: 1 }}>
              {/* Daily Messages Bar Chart (8/12) */}
              <Grid item xs={12} lg={8}>
                <Box sx={{
                  bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px', p: 3,
                  position: 'relative', overflow: 'hidden',
                  '&::before': { content: '""', position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)', width: '80%', height: '60%', background: 'radial-gradient(ellipse, rgba(167,139,250,0.04) 0%, transparent 70%)', pointerEvents: 'none' },
                }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, position: 'relative', zIndex: 1 }}>
                    <Typography sx={{ fontWeight: 700, color: '#111827', fontSize: '1rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>일별 응답 수</Typography>
                    <Typography sx={{ color: '#8A8190', fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>LAST 14 DAYS</Typography>
                  </Box>
                  <Box sx={{ width: '100%', height: 240, position: 'relative', zIndex: 1 }}>
                    <ResponsiveContainer>
                      <BarChart data={(() => {
                        const map = {}; (dashAnalytics.daily_messages || []).forEach(d => { map[d.date] = d.count; });
                        const result = []; const now = new Date();
                        for (let i = 13; i >= 0; i--) { const date = new Date(now); date.setDate(date.getDate() - i); const key = date.toISOString().split('T')[0]; result.push({ label: `${date.getMonth() + 1}/${date.getDate()}`, count: map[key] || 0 }); }
                        return result;
                      })()} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                        <defs>
                          <linearGradient id="adminBarGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.4} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#8A8190', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} interval={1} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8A8190', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} allowDecimals={false} />
                        <RechartsTooltip content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (<Box sx={{ bgcolor: 'rgba(255,255,255,0.97)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: '10px', px: 1.8, py: 1.2, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                            <Typography sx={{ color: '#334155', fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", mb: 0.3 }}>{label}</Typography>
                            <Typography sx={{ color: '#111827', fontSize: '1rem', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{payload[0].value.toLocaleString()}건</Typography>
                          </Box>);
                        }} cursor={{ fill: 'rgba(167,139,250,0.06)', radius: 6 }} />
                        <Bar dataKey="count" radius={[6, 6, 2, 2]} maxBarSize={32}>
                          {Array.from({ length: 14 }).map((_, i) => (<Cell key={i} fill="url(#adminBarGrad)" />))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Box>
              </Grid>

              {/* Hourly Activity (4/12) */}
              <Grid item xs={12} lg={4}>
                <Box sx={{
                  bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px', p: 3,
                  position: 'relative', overflow: 'hidden',
                  '&::before': { content: '""', position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)', width: '80%', height: '60%', background: 'radial-gradient(ellipse, rgba(139,92,246,0.04) 0%, transparent 70%)', pointerEvents: 'none' },
                }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, position: 'relative', zIndex: 1 }}>
                    <Typography sx={{ fontWeight: 700, color: '#111827', fontSize: '1rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>시간대별 활동</Typography>
                    <Typography sx={{ color: '#8A8190', fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>30 DAYS</Typography>
                  </Box>
                  <Box sx={{ width: '100%', height: 240, position: 'relative', zIndex: 1 }}>
                    <ResponsiveContainer>
                      <AreaChart data={(() => {
                        const map = {}; (dashAnalytics.hourly_distribution || []).forEach(d => { map[d.hour] = d.count; });
                        return Array.from({ length: 24 }, (_, h) => ({ label: `${h}시`, hour: h, count: map[h] || 0 }));
                      })()} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                        <defs>
                          <linearGradient id="adminHourlyGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#8A8190', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }} interval={5} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8A8190', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} allowDecimals={false} />
                        <RechartsTooltip content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (<Box sx={{ bgcolor: 'rgba(255,255,255,0.97)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '10px', px: 1.8, py: 1.2, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                            <Typography sx={{ color: '#334155', fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", mb: 0.3 }}>{label}</Typography>
                            <Typography sx={{ color: '#111827', fontSize: '1rem', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{payload[0].value.toLocaleString()}건</Typography>
                          </Box>);
                        }} cursor={{ stroke: 'rgba(139,92,246,0.3)' }} />
                        <Area type="monotone" dataKey="count" stroke="#8B5CF6" strokeWidth={2} fill="url(#adminHourlyGrad)" dot={false} activeDot={{ r: 4, fill: '#8B5CF6', stroke: '#FFFFFF', strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                </Box>
              </Grid>

              {/* Daily Sessions + Users (full width) */}
              <Grid item xs={12}>
                <Box sx={{
                  bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px', p: 3,
                  position: 'relative', overflow: 'hidden',
                  '&::before': { content: '""', position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)', width: '80%', height: '60%', background: 'radial-gradient(ellipse, rgba(16,185,129,0.03) 0%, transparent 70%)', pointerEvents: 'none' },
                }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, position: 'relative', zIndex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Typography sx={{ fontWeight: 700, color: '#111827', fontSize: '1rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>일별 세션 & 신규 사용자</Typography>
                      <Box sx={{ display: 'flex', gap: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                          <Box sx={{ width: 10, height: 3, borderRadius: 2, bgcolor: '#10B981' }} />
                          <Typography sx={{ color: '#334155', fontSize: '0.7rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>세션</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                          <Box sx={{ width: 10, height: 3, borderRadius: 2, bgcolor: '#F59E0B' }} />
                          <Typography sx={{ color: '#334155', fontSize: '0.7rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>신규 사용자</Typography>
                        </Box>
                      </Box>
                    </Box>
                    <Typography sx={{ color: '#8A8190', fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>LAST 14 DAYS</Typography>
                  </Box>
                  <Box sx={{ width: '100%', height: 200, position: 'relative', zIndex: 1 }}>
                    <ResponsiveContainer>
                      <AreaChart data={(() => {
                        const sessMap = {}, userMap = {};
                        (dashAnalytics.daily_sessions || []).forEach(d => { sessMap[d.date] = d.count; });
                        (dashAnalytics.daily_users || []).forEach(d => { userMap[d.date] = d.count; });
                        const result = []; const now = new Date();
                        for (let i = 13; i >= 0; i--) { const date = new Date(now); date.setDate(date.getDate() - i); const key = date.toISOString().split('T')[0]; result.push({ label: `${date.getMonth() + 1}/${date.getDate()}`, sessions: sessMap[key] || 0, users: userMap[key] || 0 }); }
                        return result;
                      })()} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                        <defs>
                          <linearGradient id="adminSessGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="adminUserGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#8A8190', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} interval={1} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8A8190', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} allowDecimals={false} />
                        <RechartsTooltip content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;

                          return (<Box sx={{ bgcolor: 'rgba(255,255,255,0.97)', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '10px', px: 1.8, py: 1.2, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                            <Typography sx={{ color: '#334155', fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", mb: 0.5 }}>{label}</Typography>

                            {payload.map((p) => (<Box key={p.dataKey} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box sx={{ width: 8, height: 8, borderRadius: '3px', bgcolor: p.color }} />
                              <Typography sx={{ color: '#111827', fontSize: '0.82rem', fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{p.dataKey === 'sessions' ? '세션' : '사용자'} {p.value}</Typography>
                            </Box>))}
                          </Box>);
                        }} cursor={{ stroke: 'rgba(0,0,0,0.15)' }} />
                        <Area type="monotone" dataKey="sessions" stroke="#10B981" strokeWidth={2} fill="url(#adminSessGrad)" dot={false} activeDot={{ r: 4, fill: '#10B981', stroke: '#FFFFFF', strokeWidth: 2 }} />
                        <Area type="monotone" dataKey="users" stroke="#F59E0B" strokeWidth={2} fill="url(#adminUserGrad)" dot={false} activeDot={{ r: 4, fill: '#F59E0B', stroke: '#FFFFFF', strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                </Box>
              </Grid>
            </Grid>
          )}

        </Box>
      )}

      {/* ============ Tab Panel 1: Document Stores ============ */}
      {tabValue === 1 && (
        <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
          {/* Header */}
          <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="h4" sx={{ fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', fontSize: '1.5rem' }}>
                  Document Stores
                </Typography>
                <Box sx={{
                  px: 1.2, py: 0.3, borderRadius: '8px',
                  bgcolor: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)',
                }}>
                  <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', fontWeight: 600, color: '#a78bfa' }}>
                    {corpora.length}
                  </Typography>
                </Box>
              </Box>
              <Typography sx={{ color: '#334155', fontSize: '0.8125rem', mt: 0.5 }}>
                AI 검색을 위한 문서 저장소를 관리합니다
              </Typography>
            </Box>
            <Button
              onClick={() => { setNewCorpusGroupIds(groups.map(g => g.id)); setCreateDialogOpen(true); }}
              startIcon={<Add sx={{ fontSize: 18 }} />}
              sx={{
                background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
                boxShadow: '0 0 20px rgba(167,139,250,0.25)',
                color: 'white', fontWeight: 700, fontSize: '0.8125rem',
                px: 2.5, py: 1, borderRadius: '10px', textTransform: 'none',
                '&:hover': { background: 'linear-gradient(135deg, #9370f0 0%, #6d28d9 100%)' },
              }}
            >
              새 저장소
            </Button>
          </Box>

          {/* Store Cards Grid */}
          <Box sx={{
            maxHeight: '320px', overflowY: 'auto', mb: 3,
            animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.05s both',
            '&::-webkit-scrollbar': { width: 5 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(167,139,250,0.2)', borderRadius: 3, '&:hover': { bgcolor: 'rgba(167,139,250,0.35)' } },
          }}>
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
              gap: 1.5,
            }}>
              {corpora.length === 0 ? (
                <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 8, bgcolor: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.20)' }}>
                  <Folder sx={{ fontSize: 48, color: '#8A8190', mb: 1.5 }} />
                  <Typography sx={{ color: '#334155', fontSize: '0.8125rem' }}>생성된 저장소가 없습니다</Typography>
                </Box>
              ) : (
                corpora.map((corpus, index) => {
                  const isSelected = selectedCorpus?.corpus_name === corpus.corpus_name;
                  const docCount = corpus.document_count || 0;
                  const isPrivate = corpus.is_public === false;
                  return (
                    <Box
                      key={corpus.corpus_name}
                      onClick={() => loadCorpusDocuments(corpus.corpus_name)}
                      sx={{
                        position: 'relative', overflow: 'hidden',
                        bgcolor: isSelected ? 'rgba(167,139,250,0.05)' : '#FFFFFF',
                        border: isSelected ? '1px solid rgba(167,139,250,0.35)' : '1px solid rgba(0,0,0,0.15)',
                        borderRadius: '14px', cursor: 'pointer',
                        transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
                        animation: `fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${0.04 + index * 0.025}s both`,
                        '&:hover': {
                          borderColor: 'rgba(167,139,250,0.3)',
                          transform: 'translateY(-1px)',
                          boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
                        },
                        // Top accent bar
                        '&::before': {
                          content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
                          background: isSelected
                            ? 'linear-gradient(90deg, #a78bfa, #c4b5fd)'
                            : 'linear-gradient(90deg, rgba(167,139,250,0.3), transparent)',
                          opacity: isSelected ? 1 : 0,
                          transition: 'opacity 0.3s',
                        },
                        '&:hover::before': { opacity: 1 },
                      }}
                    >
                      {/* Card Content */}
                      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {/* Top row: icon + name + actions */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{
                            width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
                            background: isSelected
                              ? 'linear-gradient(135deg, rgba(167,139,250,0.2), rgba(124,58,237,0.15))'
                              : 'linear-gradient(135deg, rgba(167,139,250,0.08), rgba(124,58,237,0.04))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '1px solid rgba(167,139,250,0.12)',
                          }}>
                            <Folder sx={{ color: isSelected ? '#c4b5fd' : '#a78bfa', fontSize: 18 }} />
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{
                              color: '#111827', fontSize: '0.95rem', fontWeight: 700,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              lineHeight: 1.3,
                            }}>
                              {corpus.display_name}
                            </Typography>
                            <Typography sx={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: '0.75rem', color: '#334155', mt: 0.25,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {corpus.corpus_name.split('/')[1]?.substring(0, 12) || 'store'}
                            </Typography>
                          </Box>
                        </Box>

                        {/* Stats row */}
                        <Box sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',

                          pt: 1, borderTop: '1px solid rgba(0,0,0,0.12)',

                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Description sx={{ fontSize: 14, color: '#334155' }} />
                              <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: '#334155', fontWeight: 500 }}>
                                {docCount}
                              </Typography>
                            </Box>
                            <Box sx={{
                              width: 3, height: 3, borderRadius: '50%', bgcolor: '#8A8190',
                            }} />
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                              <Box sx={{
                                width: 7, height: 7, borderRadius: '50%',
                                bgcolor: docCount > 0 ? '#22c55e' : '#52525B',
                                boxShadow: docCount > 0 ? '0 0 6px rgba(34,197,94,0.4)' : 'none',
                              }} />
                              <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#334155' }}>
                                {docCount > 0 ? 'active' : 'empty'}
                              </Typography>
                            </Box>
                          </Box>
                          <Tooltip title={isPrivate ? '비공개: 문서 링크 미제공' : '공개: 문서 링크 제공'} arrow>
                            <Box
                              onClick={(e) => {
                                e.stopPropagation();
                                setVisibilityTarget({ corpusName: corpus.corpus_name, displayName: corpus.display_name, newValue: !isPrivate ? false : true });
                                setVisibilityDialogOpen(true);
                              }}
                              sx={{
                                display: 'flex', alignItems: 'center', gap: 0.75,
                                px: 1, py: 0.4, borderRadius: '20px', cursor: 'pointer',
                                bgcolor: isPrivate ? 'rgba(245,158,11,0.06)' : 'rgba(34,197,94,0.06)',
                                border: isPrivate ? '1px solid rgba(245,158,11,0.15)' : '1px solid rgba(34,197,94,0.15)',
                                transition: 'all 0.2s',
                                '&:hover': {
                                  bgcolor: isPrivate ? 'rgba(245,158,11,0.12)' : '#DCFCE7',
                                },
                              }}
                            >
                              {/* Mini toggle track */}
                              <Box sx={{
                                width: 24, height: 14, borderRadius: '7px', position: 'relative',
                                bgcolor: isPrivate ? 'rgba(245,158,11,0.25)' : 'rgba(34,197,94,0.3)',
                                transition: 'background 0.2s',
                              }}>
                                <Box sx={{
                                  width: 10, height: 10, borderRadius: '50%',
                                  bgcolor: isPrivate ? '#fbbf24' : '#22c55e',
                                  position: 'absolute', top: 2,
                                  left: isPrivate ? 2 : 12,
                                  transition: 'left 0.2s cubic-bezier(0.16,1,0.3,1)',
                                  boxShadow: isPrivate ? '0 0 6px rgba(251,191,36,0.4)' : '0 0 6px rgba(34,197,94,0.4)',
                                }} />
                              </Box>
                              <Typography sx={{
                                fontSize: '0.75rem', fontWeight: 600,
                                color: isPrivate ? '#fbbf24' : '#86efac',
                                lineHeight: 1,
                              }}>
                                {isPrivate ? '비공개' : '공개'}
                              </Typography>
                            </Box>
                          </Tooltip>
                        </Box>

                        {/* Action buttons - always visible */}
                        <Box sx={{

                          display: 'flex', gap: 1, pt: 1.5, borderTop: '1px solid rgba(0,0,0,0.12)',

                        }}>
                          <Box
                            onClick={(e) => { e.stopPropagation(); setSelectedCorpusForPermission(corpus); setPermissionDialogOpen(true); }}
                            sx={{
                              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
                              py: 0.75, borderRadius: '8px', cursor: 'pointer',
                              bgcolor: 'rgba(167,139,250,0.04)',
                              border: '1px solid rgba(167,139,250,0.1)',
                              transition: 'all 0.2s',
                              '&:hover': { bgcolor: 'rgba(167,139,250,0.1)', borderColor: 'rgba(167,139,250,0.25)' },
                            }}
                          >
                            <Security sx={{ fontSize: 13, color: '#334155' }} />
                            <Typography sx={{ fontSize: '0.7rem', color: '#334155', fontWeight: 600 }}>권한</Typography>
                          </Box>
                          <Box
                            onClick={(e) => { e.stopPropagation(); deleteCorpus(corpus.corpus_name); }}
                            sx={{
                              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
                              py: 0.75, borderRadius: '8px', cursor: 'pointer',
                              bgcolor: 'rgba(239,68,68,0.03)',
                              border: '1px solid rgba(239,68,68,0.08)',
                              transition: 'all 0.2s',
                              '&:hover': { bgcolor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', '& .MuiTypography-root': { color: '#DC2626' }, '& .MuiSvgIcon-root': { color: '#DC2626' } },
                            }}
                          >
                            <DeleteOutline sx={{ fontSize: 13, color: '#334155' }} />
                            <Typography sx={{ fontSize: '0.7rem', color: '#334155', fontWeight: 600 }}>삭제</Typography>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  );
                })
              )}
            </Box>
          </Box>

          {/* Selected Store Details (Full Width) */}
          {selectedCorpus ? (
            <Box sx={{
              bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px',
              overflow: 'hidden', animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both',
            }}>
              {/* Detail Header */}
              <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid rgba(0,0,0,0.15)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Description sx={{ color: '#a78bfa', fontSize: 22 }} />
                  <Typography sx={{ color: '#111827', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>
                    {selectedCorpus.display_name}
                  </Typography>
                  <Box sx={{
                    px: 1, py: 0.2, borderRadius: '6px',
                    bgcolor: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)',
                  }}>
                    <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', fontWeight: 600, color: '#a78bfa' }}>
                      {selectedCorpus.corpus_name.split('/')[1] || 'store'}
                    </Typography>
                  </Box>
                </Box>
                <Typography sx={{ color: '#334155', fontSize: '0.75rem', mt: 0.5 }}>문서 목록 임베드 관리</Typography>
              </Box>

              {/* Content */}
              <Box sx={{ p: 3 }}>
                {/* Upload Section */}
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#334155', mb: 1.5 }}>
                  UPLOAD
                </Typography>

                <Box
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  sx={{
                    mb: 3, p: 2.5,
                    bgcolor: isDragging ? 'rgba(167,139,250,0.08)' : 'rgba(0,0,0,0.02)',
                    border: isDragging ? '2px dashed rgba(167,139,250,0.5)' : '2px dashed rgba(0,0,0,0.1)',
                    borderRadius: '12px', transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
                    '&:hover': { borderColor: 'rgba(167,139,250,0.3)', bgcolor: 'rgba(167,139,250,0.04)' },
                  }}
                >
                  {isDragging ? (
                    <Box sx={{ textAlign: 'center', py: 3 }}>
                      <CloudUpload sx={{ fontSize: 48, color: '#a78bfa', mb: 1 }} />
                      <Typography sx={{ color: '#a78bfa', fontWeight: 700, fontSize: '0.875rem' }}>여기에 파일을 드롭하세요</Typography>
                    </Box>
                  ) : selectedFiles.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <CloudUpload sx={{ fontSize: 36, color: '#8A8190', mb: 1 }} />
                      <Typography sx={{ color: '#334155', fontSize: '0.75rem' }}>파일을 드래그하거나 버튼을 클릭하세요</Typography>
                      <Typography sx={{ color: '#8A8190', fontSize: '0.65rem', mt: 0.5 }}>PDF, TXT, DOCX (최대 50MB)</Typography>
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', mt: selectedFiles.length === 0 ? 1 : 0 }}>
                    <input type="file" id="file-upload" onChange={handleFileSelect} accept=".pdf,.doc,.docx,.txt,.md" multiple style={{ display: 'none' }} />
                    <input type="file" id="folder-upload" onChange={handleFolderSelect} webkitdirectory="" directory="" multiple style={{ display: 'none' }} />

                    <label htmlFor="file-upload">
                      <Button component="span" startIcon={<UploadFile sx={{ fontSize: 16 }} />}
                        sx={{
                          border: '1px solid rgba(0,0,0,0.1)', color: '#334155', fontWeight: 600, fontSize: '0.75rem',
                          borderRadius: '10px', textTransform: 'none',
                          '&:hover': { borderColor: '#a78bfa', color: '#a78bfa', bgcolor: 'rgba(167,139,250,0.05)' },
                        }}
                      >파일 선택</Button>
                    </label>
                    <label htmlFor="folder-upload">
                      <Button component="span" startIcon={<Folder sx={{ fontSize: 16 }} />}
                        sx={{
                          border: '1px solid rgba(0,0,0,0.1)', color: '#334155', fontWeight: 600, fontSize: '0.75rem',
                          borderRadius: '10px', textTransform: 'none',
                          '&:hover': { borderColor: '#a78bfa', color: '#a78bfa', bgcolor: 'rgba(167,139,250,0.05)' },
                        }}
                      >폴더 선택</Button>
                    </label>
                    <Button
                      onClick={uploadDocuments}
                      startIcon={uploading ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <CloudUpload sx={{ fontSize: 16 }} />}
                      disabled={selectedFiles.length === 0 || uploading}
                      sx={{
                        background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
                        boxShadow: '0 0 20px rgba(167,139,250,0.25)',
                        color: 'white', fontWeight: 700, fontSize: '0.75rem',
                        px: 2.5, borderRadius: '10px', textTransform: 'none',
                        '&:hover': { background: 'linear-gradient(135deg, #9370f0 0%, #6d28d9 100%)' },
                        '&:disabled': { background: 'rgba(167,139,250,0.2)', color: '#8A8190' },
                      }}
                    >
                      {uploading ? `업로드 중 (${uploadProgress.current}/${uploadProgress.total})` : '업로드'}
                    </Button>
                  </Box>

                  {/* Selected Files List */}
                  {selectedFiles.length > 0 && (
                    <Box sx={{
                      mt: 2, maxHeight: 180, overflowY: 'auto',
                      bgcolor: '#F8FAFC', borderRadius: '10px', p: 1.5, border: '1px solid rgba(0,0,0,0.20)',
                      '&::-webkit-scrollbar': { width: 6 },
                      '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(167,139,250,0.3)', borderRadius: 3 },
                    }}>
                      <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", color: '#a78bfa', mb: 1, fontWeight: 600, fontSize: '0.7rem' }}>
                        {selectedFiles.length} files selected
                      </Typography>
                      {selectedFiles.map((file, index) => (
                        <Box key={index} sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          py: 0.5, px: 1, mb: 0.5, borderRadius: '6px',
                          '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' },
                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                            <Description sx={{ fontSize: 14, color: '#334155', flexShrink: 0 }} />
                            <Typography sx={{ color: '#111827', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {file.name}
                            </Typography>
                            <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", color: '#334155', fontSize: '0.65rem', flexShrink: 0 }}>
                              {formatFileSize(file.size)}
                            </Typography>
                          </Box>
                          <Box onClick={() => !uploading && removeFile(index)}
                            sx={{
                              p: 0.5, borderRadius: '4px', cursor: uploading ? 'not-allowed' : 'pointer',
                              opacity: uploading ? 0.3 : 1, display: 'inline-flex', transition: 'all 0.2s',
                              '&:hover': !uploading ? { bgcolor: '#FEE2E2', '& .MuiSvgIcon-root': { color: '#DC2626' } } : {},
                            }}
                          >
                            <DeleteOutline sx={{ fontSize: 14, color: '#334155' }} />
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>

                {/* Documents Section */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#334155' }}>
                    DOCUMENTS
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TextField
                      size="small" placeholder="파일명 검색..."
                      value={documentSearchQuery}
                      onChange={(e) => setDocumentSearchQuery(e.target.value)}
                      onKeyPress={(e) => { if (e.key === 'Enter') handleDocumentSearch(); }}
                      InputProps={{
                        startAdornment: <Search sx={{ fontSize: 16, color: '#334155', mr: 0.5 }} />,
                        endAdornment: documentSearchQuery && (
                          <IconButton size="small" onClick={clearDocumentSearch} sx={{ p: 0.25, color: '#64748B', '&:hover': { color: '#64748B' } }}>
                            <Clear sx={{ fontSize: 14 }} />
                          </IconButton>
                        ),
                      }}
                      sx={{
                        width: 200,
                        '& .MuiOutlinedInput-root': {
                          bgcolor: '#F8FAFC', borderRadius: '10px', fontSize: '0.75rem', color: '#111827',
                          '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' },
                          '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' },
                          '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
                        },
                        '& .MuiOutlinedInput-input': { py: 0.75, '&::placeholder': { color: '#334155', opacity: 1 } },
                      }}
                    />
                    <Button size="small" onClick={handleDocumentSearch}
                      sx={{
                        bgcolor: 'rgba(167,139,250,0.1)', color: '#a78bfa', fontSize: '0.7rem', py: 0.6, minWidth: 'auto',
                        borderRadius: '8px', textTransform: 'none', fontWeight: 600,
                        '&:hover': { bgcolor: 'rgba(167,139,250,0.2)' },
                      }}
                    >검색</Button>
                  </Box>
                </Box>

                {/* Bulk Delete Bar */}
                {selectedDocuments.length > 0 && (
                  <Box sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    mb: 1.5, px: 2, py: 1.2,
                    bgcolor: 'rgba(239,68,68,0.06)', borderRadius: '10px',
                    border: '1px solid #FCA5A5',
                    animation: 'fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both',
                  }}>
                    <Typography sx={{ color: '#111827', fontSize: '0.8125rem' }}>
                      <strong style={{ color: '#DC2626' }}>{selectedDocuments.length}</strong> selected
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button size="small" onClick={() => setSelectedDocuments([])}
                        sx={{ color: '#64748B', fontSize: '0.7rem', textTransform: 'none', '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' } }}
                      >해제</Button>
                      <Button size="small" onClick={openBulkDeleteDialog}
                        sx={{
                          background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                          color: 'white', fontSize: '0.7rem', fontWeight: 700, textTransform: 'none',
                          borderRadius: '8px', px: 1.5,
                        }}
                      >삭제</Button>
                    </Box>
                  </Box>
                )}

                {/* Documents Grid Table */}
                <Box sx={{ bgcolor: '#F8FAFC', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.20)' }}>
                  {/* Header Row */}
                  <Box sx={{
                    display: 'grid', gridTemplateColumns: '40px 1fr 90px 100px 32px',
                    px: 2.5, py: 1.2, borderBottom: '1px solid rgba(0,0,0,0.12)',
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Checkbox size="small"
                        checked={selectedDocuments.length === documents.length && documents.length > 0}
                        indeterminate={selectedDocuments.length > 0 && selectedDocuments.length < documents.length}
                        onChange={toggleAllDocuments}
                        sx={{ p: 0, color: '#8A8190', '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: '#a78bfa' } }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155' }}>File</Typography>
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', textAlign: 'right' }}>Size</Typography>
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', textAlign: 'right' }}>Uploaded</Typography>
                  </Box>

                  {/* Body */}
                  {loadingDocuments ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                      <CircularProgress size={22} sx={{ color: '#334155' }} />
                    </Box>
                  ) : documents.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                      <Description sx={{ fontSize: 40, color: '#8A8190', mb: 1 }} />
                      <Typography sx={{ color: '#334155', fontSize: '0.8125rem' }}>문서가 없습니다</Typography>
                    </Box>
                  ) : (
                    documents.map((doc, index) => (
                      <Box key={doc.document_name} sx={{
                        display: 'grid', gridTemplateColumns: '40px 1fr 90px 100px 32px',
                        px: 2.5, py: 1.6, alignItems: 'center',
                        borderBottom: index < documents.length - 1 ? '1px solid rgba(0,0,0,0.15)' : 'none',
                        transition: 'all 0.2s', cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.02)', borderLeft: '3px solid #a78bfa' },
                      }}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Checkbox size="small"
                            checked={selectedDocuments.includes(doc.document_name)}
                            onChange={() => toggleDocumentSelection(doc.document_name)}
                            sx={{ p: 0, color: '#8A8190', '&.Mui-checked': { color: '#a78bfa' } }}
                          />
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                          <Box sx={{
                            width: 30, height: 30, borderRadius: '8px',
                            bgcolor: 'rgba(167,139,250,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <Description sx={{ fontSize: 14, color: '#a78bfa' }} />
                          </Box>
                          <Typography sx={{ color: '#111827', fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.display_name}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", color: '#334155', fontSize: '0.7rem', textAlign: 'right' }}>
                          {formatFileSize(doc.file_size)}
                        </Typography>
                        <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", color: '#334155', fontSize: '0.7rem', textAlign: 'right' }}>
                          {doc.uploaded_at ? (() => { const d = new Date(doc.uploaded_at); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; })() : '-'}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDocMenuAnchor(e.currentTarget);
                            setDocMenuTarget(doc);
                          }}
                          sx={{ color: '#64748B', '&:hover': { color: '#a78bfa' }, p: 0.5 }}
                        >
                          <MoreVert sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Box>
                    ))
                  )}
                </Box>

                {/* Pagination */}
                {documents.length > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, px: 0.5 }}>
                    <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", color: '#334155', fontSize: '0.7rem' }}>
                      {currentPage * 10 + 1}-{Math.min((currentPage + 1) * 10, totalDocumentCount || 0)} / {totalDocumentCount || 0}
                    </Typography>
                    <Pagination
                      count={Math.ceil(totalDocumentCount / 10)} page={currentPage + 1}
                      onChange={handlePageChange} size="small" showFirstButton showLastButton
                      sx={{
                        '& .MuiPaginationItem-root': {

                          color: '#334155', borderColor: 'rgba(0,0,0,0.15)',

                          '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
                          '&.Mui-selected': { bgcolor: 'rgba(167,139,250,0.15)', color: '#a78bfa', '&:hover': { bgcolor: 'rgba(167,139,250,0.2)' } },
                          '&.Mui-disabled': { color: '#8A8190' },
                        },
                      }}
                    />
                  </Box>
                )}
              </Box>

              {/* Document More Menu */}
              <Menu
                anchorEl={docMenuAnchor}
                open={Boolean(docMenuAnchor)}
                onClose={() => { setDocMenuAnchor(null); setDocMenuTarget(null); }}
                PaperProps={{
                  sx: {
                    bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '10px', minWidth: 160, mt: 0.5,
                    '& .MuiMenuItem-root': {
                      fontSize: '0.8rem', color: '#1E293B', py: 1, px: 2, gap: 1.5,
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
                    },
                  },
                }}
              >
                <MenuItem onClick={async () => {
                  setDocMenuAnchor(null);
                  try {
                    const res = await corpusAPI.downloadDocument(docMenuTarget.id);
                    window.open(res.data.view_url, '_blank');
                  } catch { alert('링크 생성에 실패했습니다.'); }
                  setDocMenuTarget(null);
                }}>
                  <Visibility sx={{ fontSize: 16, color: '#14B8A6' }} /> 원본 파일 보기
                </MenuItem>
                <MenuItem onClick={async () => {
                  setDocMenuAnchor(null);
                  try {
                    const res = await corpusAPI.downloadDocument(docMenuTarget.id);
                    window.open(res.data.download_url, '_blank');
                  } catch { alert('다운로드에 실패했습니다.'); }
                  setDocMenuTarget(null);
                }}>
                  <Download sx={{ fontSize: 16, color: '#a78bfa' }} /> 원본 파일 다운로드
                </MenuItem>
              </Menu>
            </Box>
          ) : (
            <Box sx={{
              bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              py: 12, animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both',
            }}>
              <Storage sx={{ fontSize: 56, color: '#8A8190', mb: 2 }} />
              <Typography sx={{ color: '#334155', fontSize: '0.875rem', fontWeight: 600 }}>저장소를 선택하세요</Typography>
              <Typography sx={{ color: '#8A8190', fontSize: '0.75rem', mt: 0.5 }}>위 목록에서 저장소를 클릭하면 문서 목록이 표시됩니다</Typography>
            </Box>
          )}
        </Box>
      )}

      {/* ============ Tab Panel 1: Groups & Users ============ */}
      {tabValue === 2 && (
        <Box sx={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both', maxWidth: 1200, mx: 'auto' }}>
          {/* ── Header ── */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
              <Typography sx={{ fontWeight: 800, color: '#111827', fontSize: '1.5rem', letterSpacing: '-0.03em', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                그룹 & 유저
              </Typography>
              <Typography sx={{ color: '#8A8190', fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace" }}>
                {users.length} users
              </Typography>
            </Box>
            <Box onClick={() => setGroupDialogOpen(true)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                px: 2, py: 0.8, borderRadius: '10px', cursor: 'pointer',
                background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
                boxShadow: '0 0 20px rgba(167,139,250,0.25), 0 4px 12px rgba(167,139,250,0.15)',
                transition: 'all 0.2s',
                '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 0 28px rgba(167,139,250,0.35)' },
              }}
            >
              <Add sx={{ fontSize: 16, color: 'white' }} />
              <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '0.8rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                그룹 추가
              </Typography>
            </Box>
          </Box>

          {/* ── Group Filter Chips ── */}
          <Box sx={{
            display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2.5,
            animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.05s both',
          }}>
            {/* All users chip */}
            {[
              { key: 'all', label: '전체 유저', count: users.length },
              { key: 'unassigned', label: '미배정', count: users.filter(u => !u.group_id).length },
            ].map(({ key, label, count }) => (
              <Box key={key} onClick={() => setSelectedGroupFilter(key)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: 'center',
                  px: 1.5, py: 0.7, borderRadius: '10px', cursor: 'pointer', minWidth: 90,
                  bgcolor: selectedGroupFilter === key ? 'rgba(167,139,250,0.08)' : 'transparent',
                  border: selectedGroupFilter === key ? '1px solid #a78bfa' : '1px solid rgba(0,0,0,0.15)',
                  transition: 'all 0.2s',
                  '&:hover': { bgcolor: selectedGroupFilter === key ? 'rgba(167,139,250,0.12)' : 'rgba(0,0,0,0.03)' },
                }}
              >
                <Typography sx={{
                  fontSize: '0.75rem', fontWeight: 600,
                  color: selectedGroupFilter === key ? '#a78bfa' : '#71717A',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>{label}</Typography>
                <Typography sx={{
                  fontSize: '0.65rem', fontWeight: 700,
                  color: selectedGroupFilter === key ? '#c4b5fd' : '#52525B',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{count}</Typography>
              </Box>
            ))}

            {/* Custom group chips */}
            {groups.map((group) => {
              const isActive = selectedGroupFilter === String(group.id);
              const count = users.filter(u => u.group_id === group.id).length;
              return (
                <Box key={group.id} onClick={() => setSelectedGroupFilter(String(group.id))}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: 'center',
                    px: 1.5, py: 0.7, borderRadius: '10px', cursor: 'pointer', minWidth: 90,
                    bgcolor: isActive ? 'rgba(167,139,250,0.08)' : 'transparent',
                    border: isActive ? '1px solid #a78bfa' : '1px solid rgba(0,0,0,0.15)',
                    transition: 'all 0.2s',
                    '&:hover': { bgcolor: isActive ? 'rgba(167,139,250,0.12)' : 'rgba(0,0,0,0.03)', '& .group-delete-btn': { opacity: 0.5 } },
                  }}
                >
                  <Typography sx={{
                    fontSize: '0.75rem', fontWeight: 600,
                    color: isActive ? '#a78bfa' : '#71717A',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{group.name}</Typography>
                  <Typography sx={{
                    fontSize: '0.65rem', fontWeight: 700,
                    color: isActive ? '#c4b5fd' : '#52525B',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{count}</Typography>
                  <Box onClick={(e) => { e.stopPropagation(); if (window.confirm(`"${group.name}" 그룹을 삭제하시겠습니까?`)) deleteGroup(group.id); }}
                    className="group-delete-btn"
                    sx={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 18, height: 18, borderRadius: '5px',
                      opacity: 0, transition: 'all 0.2s', ml: 0.5,
                      '&:hover': { bgcolor: 'rgba(239,68,68,0.2)', opacity: 1 },
                    }}
                  >
                    <Clear sx={{ fontSize: 11, color: '#DC2626' }} />
                  </Box>
                </Box>
              );
            })}
          </Box>

          {/* ── Search Bar ── */}
          <Box sx={{ mb: 2, animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}>
            <TextField fullWidth size="small" placeholder="이름 또는 이메일 검색..."
              value={userSearchQuery} onChange={(e) => setUserSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <Search sx={{ color: '#334155', fontSize: 18, mr: 1 }} />,
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: '#FFFFFF', color: '#111827', borderRadius: '12px',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' },
                  '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' },
                  '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
                },
                '& .MuiInputBase-input::placeholder': { color: '#334155' },
              }}
            />
          </Box>

          {/* ── Users Table ── */}
          <Box sx={{
            bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px',
            overflow: 'hidden', animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.15s both',
          }}>
            {/* Grid Header */}
            <Box sx={{
              display: 'grid', gridTemplateColumns: '1fr 160px 40px 180px 60px', gap: 1,
              px: 3, py: 1.2, borderBottom: '1px solid rgba(0,0,0,0.12)',
              bgcolor: 'rgba(0,0,0,0.01)',
            }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>USER</Typography>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>ROLE</Typography>
              <Box />
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>GROUP</Typography>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', fontFamily: "'Plus Jakarta Sans', sans-serif", textAlign: 'right' }}></Typography>
            </Box>

            {/* User Rows */}
            {filteredUsers.length === 0 ? (
              <Box sx={{ py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                <People sx={{ fontSize: 40, color: '#8A8190' }} />
                <Typography sx={{ color: '#334155', fontSize: '0.8125rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {userSearchQuery ? '검색 결과가 없습니다' : '해당 그룹에 멤버가 없습니다.'}
                </Typography>
              </Box>
            ) : (
              filteredUsers.map((user, index) => (
                <Box key={user.id} sx={{
                  display: 'grid', gridTemplateColumns: '1fr 160px 40px 180px 60px', gap: 1,
                  px: 3, py: 1.6, alignItems: 'center',
                  borderBottom: index < filteredUsers.length - 1 ? '1px solid rgba(0,0,0,0.15)' : 'none',
                  borderLeft: '3px solid transparent',
                  transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.02)', borderLeft: '3px solid #a78bfa' },
                }}>
                  {/* User Info */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                    <Box sx={{
                      width: 32, height: 32, borderRadius: '8px',
                      bgcolor: user.is_admin ? '#a78bfa' : user.username.startsWith('카카오') ? '#FDE047' : '#E2E8F0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: user.is_admin ? '#09090B' : user.username.startsWith('카카오') ? '#92400E' : '#475569', fontWeight: 700, fontSize: '0.7rem', flexShrink: 0,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}>
                      {user.username.substring(0, 2).toUpperCase()}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ color: '#111827', fontWeight: 600, fontSize: '0.8125rem', fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user.username}
                      </Typography>
                      <Typography sx={{ color: '#334155', fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user.email}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Role Select */}
                  <Box sx={{
                    position: 'relative', display: 'inline-flex', alignItems: 'center',
                    borderRadius: '8px', height: 32, minWidth: 100,
                    border: user.is_admin ? '1px solid rgba(167,139,250,0.2)' : '1px solid rgba(0,0,0,0.15)',
                    backgroundColor: user.is_admin ? 'rgba(167,139,250,0.06)' : '#F8FAFC',
                    overflow: 'hidden',
                  }}>
                    <Security sx={{
                      position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)',
                      fontSize: 13, color: user.is_admin ? '#a78bfa' : '#64748B', pointerEvents: 'none', zIndex: 1,
                    }} />
                    <select value={user.is_admin ? 'ADMIN' : 'GENERAL'}
                      onChange={(e) => updateUserRole(user.id, e.target.value === 'ADMIN')}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
                        width: '100%', height: '100%',
                        paddingLeft: '28px', paddingRight: '28px',
                        fontSize: '12px', fontWeight: 600, border: 'none', backgroundColor: 'transparent',
                        color: user.is_admin ? '#c4b5fd' : '#475569', cursor: 'pointer', outline: 'none',
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        position: 'relative', zIndex: 2,
                      }}
                    >
                      <option value="GENERAL" style={{ backgroundColor: '#FFFFFF', color: '#111827' }}>일반</option>
                      <option value="ADMIN" style={{ backgroundColor: '#FFFFFF', color: '#c4b5fd' }}>관리자</option>
                    </select>
                    <KeyboardArrowDown sx={{
                      position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
                      fontSize: 16, color: user.is_admin ? 'rgba(167,139,250,0.5)' : '#64748B', pointerEvents: 'none',
                    }} />
                  </Box>

                  {/* Spacer */}
                  <Box />

                  {/* Group Select */}
                  <Box sx={{
                    position: 'relative', display: 'inline-flex', alignItems: 'center',
                    maxWidth: '150px', borderRadius: '8px', height: 32,
                    border: '1px solid rgba(0,0,0,0.20)', backgroundColor: '#F8FAFC', overflow: 'hidden',
                  }}>
                    <select value={user.group_id || ''} onChange={(e) => updateUserGroup(user.id, e.target.value || null)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
                        width: '100%', height: '100%',
                        paddingLeft: '12px', paddingRight: '30px',
                        fontSize: '12px', fontWeight: 500, border: 'none', backgroundColor: 'transparent',
                        color: '#334155', cursor: 'pointer', outline: 'none',
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        position: 'relative', zIndex: 2,
                      }}
                    >
                      <option value="" style={{ backgroundColor: '#FFFFFF', color: '#111827' }}>미배정</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id} style={{ backgroundColor: '#FFFFFF', color: '#111827' }}>{group.name}</option>
                      ))}
                    </select>
                    <KeyboardArrowDown sx={{
                      position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                      fontSize: 16, color: '#8A8190', pointerEvents: 'none',
                    }} />
                  </Box>

                  {/* Actions Menu */}
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Box onClick={(e) => handleUserMenuOpen(e, user)}
                      sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 28, borderRadius: '8px', cursor: 'pointer',
                        transition: 'all 0.15s',
                        '&:hover': { bgcolor: 'rgba(167,139,250,0.08)' },
                      }}
                    >
                      <MoreVert sx={{ fontSize: 16, color: '#334155' }} />
                    </Box>
                  </Box>
                </Box>
              ))
            )}
          </Box>
        </Box>
      )}

      {/* ============ Tab Panel 2: Prompt Templates ============ */}
      {tabValue === 3 && (
        <Box sx={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both', maxWidth: 1200, mx: 'auto' }}>
          {/* Header */}
          <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="h4" sx={{ fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', fontSize: '1.5rem' }}>
                  Prompt Templates
                </Typography>
                <Box sx={{ px: 1.2, py: 0.3, borderRadius: '8px', bgcolor: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
                  <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', fontWeight: 600, color: '#a78bfa' }}>
                    {promptTemplates.length}
                  </Typography>
                </Box>
              </Box>
              <Typography sx={{ color: '#334155', fontSize: '0.8125rem', mt: 0.5 }}>
                채팅 랜딩 화면에 표시될 프롬프트 버튼을 관리합니다
              </Typography>
            </Box>
            <Button onClick={() => openTemplateDialog()} startIcon={<Add sx={{ fontSize: 18 }} />}
              sx={{
                background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
                boxShadow: '0 0 20px rgba(167,139,250,0.25)',
                color: 'white', fontWeight: 700, fontSize: '0.8125rem',
                px: 2.5, py: 1, borderRadius: '10px', textTransform: 'none',
                '&:hover': { background: 'linear-gradient(135deg, #9370f0 0%, #6d28d9 100%)' },
              }}
            >새 템플릿</Button>
          </Box>

          {/* Templates Card */}
          <Box sx={{
            bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px',
            overflow: 'hidden', animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.05s both',
          }}>
            {promptTemplates.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 10 }}>
                <Article sx={{ fontSize: 48, color: '#8A8190', mb: 1.5 }} />
                <Typography sx={{ color: '#334155', fontSize: '0.875rem', fontWeight: 600 }}>등록된 템플릿이 없습니다</Typography>
                <Typography sx={{ color: '#8A8190', fontSize: '0.75rem', mt: 0.5 }}>새 템플릿을 추가하여 사용자들에게 빠른 프롬프트를 제공하세요</Typography>
              </Box>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={promptTemplates.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  <Box>
                    {/* Header */}
                    <Box sx={{
                      display: 'grid', gridTemplateColumns: '40px 1fr 1fr 80px 80px',
                      gap: 2, px: 2.5, py: 1.2, borderBottom: '1px solid rgba(0,0,0,0.12)',
                    }}>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155' }}></Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155' }}>Title</Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155' }}>Description</Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', textAlign: 'center' }}>Status</Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', textAlign: 'right' }}>Actions</Typography>
                    </Box>
                    {promptTemplates.map((template, index) => (
                      <SortableTemplateRow
                        key={template.id} template={template} index={index}
                        isLast={index === promptTemplates.length - 1}
                        getTemplateIcon={getTemplateIcon}
                        openTemplateDialog={openTemplateDialog}
                        deleteTemplate={deleteTemplate}
                      />
                    ))}
                  </Box>
                </SortableContext>
              </DndContext>
            )}
          </Box>
        </Box>
      )}

      {/* ============ Tab Panel 3: Calendar ============ */}
      {tabValue === 4 && (
        <Box sx={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
          <CalendarSettingsPanel />
        </Box>
      )}

      {/* ============ Tab Panel 4: Chatbot Settings ============ */}
      {tabValue === 5 && (
        <Box sx={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both', maxWidth: 1200, mx: 'auto' }}>
          <ChatbotSettingsPanel />
        </Box>
      )}

      {/* ============ Tab Panel 6: Chat History ============ */}
      {tabValue === 6 && (
        <Box sx={{ maxWidth: 1200, mx: 'auto', animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
          {/* Header */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', fontSize: '1.5rem' }}>
              Chat History
            </Typography>
            <Typography sx={{ color: '#334155', fontSize: '0.8125rem', mt: 0.5 }}>
              전체 사용자의 채팅 세션과 대화 내용을 확인합니다
            </Typography>
          </Box>

          {selectedSession ? (
            /* ===== Message Detail View ===== */
            <Box sx={{ bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px', overflow: 'hidden' }}>
              {/* Session Header */}
              <Box sx={{ px: 3, py: 2, borderBottom: '1px solid rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 2, bgcolor: 'rgba(167,139,250,0.03)' }}>
                <Button size="small" onClick={() => { setSelectedSession(null); setSessionMessages([]); }}
                  startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
                  sx={{ color: '#334155', fontSize: '0.8125rem', textTransform: 'none', '&:hover': { color: '#a78bfa', bgcolor: 'rgba(167,139,250,0.08)' } }}
                >목록으로</Button>
                <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(0,0,0,0.15)' }} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: '#111827', fontSize: '0.9375rem', fontWeight: 700 }}>{selectedSession.title}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.3 }}>
                    <Typography sx={{ color: '#1E293B', fontSize: '0.75rem' }}>
                      {selectedSession.user?.username || 'Unknown'}
                    </Typography>
                    <Typography sx={{ color: '#1E293B', fontSize: '0.65rem', fontFamily: "'JetBrains Mono', monospace" }}>
                      {selectedSession.created_at ? new Date(selectedSession.created_at).toLocaleString('ko-KR') : ''}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ px: 1.5, py: 0.3, borderRadius: '8px', bgcolor: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
                  <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', fontWeight: 600, color: '#a78bfa' }}>
                    {sessionMessages.length} messages
                  </Typography>
                </Box>
              </Box>

              {/* Messages */}
              <Box sx={{
                maxHeight: 600, overflowY: 'auto', p: 3,
                '&::-webkit-scrollbar': { width: 5 },
                '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(167,139,250,0.2)', borderRadius: 3 },
              }}>
                {loadingMessages ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress size={28} sx={{ color: '#a78bfa' }} />
                  </Box>
                ) : sessionMessages.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 6 }}>
                    <Typography sx={{ color: '#334155', fontSize: '0.875rem' }}>메시지가 없습니다</Typography>
                  </Box>
                ) : sessionMessages.map((msg) => (
                  <Box key={msg.id} sx={{
                    display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', mb: 2.5,
                  }}>
                    <Box sx={{
                      maxWidth: '75%', px: 2.5, py: 2, borderRadius: '14px',

                      bgcolor: msg.role === 'user' ? 'rgba(167,139,250,0.18)' : 'rgba(0,0,0,0.04)',
                      border: msg.role === 'user' ? '1px solid rgba(167,139,250,0.45)' : '1px solid rgba(0,0,0,0.12)',

                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.8 }}>
                        <Avatar sx={{
                          width: 20, height: 20, fontSize: '0.6rem',
                          bgcolor: msg.role === 'user' ? '#A78BFA' : 'rgba(16,185,129,0.5)',
                          color: msg.role === 'user' ? '#FFFFFF' : '#065F46',
                        }}>
                          {msg.role === 'user' ? 'U' : 'AI'}
                        </Avatar>
                        <Typography sx={{ fontSize: '0.7rem', color: '#1E293B', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                          {msg.role === 'user' ? '사용자' : 'AI 어시스턴트'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.6rem', color: '#1E293B', fontFamily: "'JetBrains Mono', monospace", ml: 'auto' }}>
                          {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </Typography>
                      </Box>
                      <Typography sx={{ color: '#1E293B', fontSize: '0.8125rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {msg.content}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          ) : (
            /* ===== Session List View ===== */
            <>
              {/* Filters Bar */}
              <Box sx={{
                display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center',
                animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.05s both',
              }}>
                {/* Search */}
                <TextField
                  placeholder="세션 제목 또는 사용자 검색..."
                  value={chatHistorySearch}
                  onChange={(e) => setChatHistorySearch(e.target.value)}
                  size="small"
                  InputProps={{
                    startAdornment: <Search sx={{ color: '#334155', fontSize: 18, mr: 1 }} />,
                    sx: {
                      bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)',
                      borderRadius: '12px', color: '#111827', fontSize: '0.8125rem',
                      '& fieldset': { border: 'none' },
                      '&:hover': { borderColor: 'rgba(167,139,250,0.3)' },
                      '&.Mui-focused': { borderColor: '#a78bfa' },
                    },
                  }}
                  sx={{ flex: 1, minWidth: 250 }}
                />

                {/* User Filter */}
                <Box sx={{
                  display: 'flex', alignItems: 'center', bgcolor: '#FFFFFF',
                  border: '1px solid rgba(0,0,0,0.20)', borderRadius: '12px',
                  px: 1.5, height: 40,
                }}>
                  <People sx={{ color: '#334155', fontSize: 16, mr: 1 }} />
                  <select
                    value={chatHistoryUserFilter}
                    onChange={(e) => {
                      setChatHistoryUserFilter(e.target.value);
                      loadChatHistory(1, e.target.value);
                    }}
                    style={{
                      background: 'transparent', border: 'none', color: '#1E293B',
                      fontSize: '0.8125rem', outline: 'none', cursor: 'pointer',
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    <option value="all" style={{ background: '#FFFFFF' }}>전체 사용자</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id} style={{ background: '#FFFFFF' }}>
                        {u.username} ({u.email})
                      </option>
                    ))}
                  </select>
                </Box>

                {/* Total Count */}
                <Box sx={{
                  px: 1.5, py: 0.5, borderRadius: '10px',
                  bgcolor: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)',
                  display: 'flex', alignItems: 'center', gap: 0.5,
                }}>
                  <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', fontWeight: 700, color: '#a78bfa' }}>
                    {chatSessionsTotal}
                  </Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: '#334155' }}>세션</Typography>
                </Box>
              </Box>

              {/* Sessions Table */}
              <Box sx={{
                bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px', overflow: 'hidden',
                animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both',
              }}>
                {/* Table Header */}
                <Box sx={{
                  display: 'grid', gridTemplateColumns: '1fr 180px 100px 120px 50px',
                  px: 3, py: 1.5, borderBottom: '1px solid rgba(0,0,0,0.15)', bgcolor: 'rgba(0,0,0,0.01)',
                }}>
                  {['세션 제목', '사용자', '메시지', '날짜', ''].map(h => (
                    <Typography key={h} sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1E293B' }}>{h}</Typography>
                  ))}
                </Box>

                {chatHistoryLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress size={24} sx={{ color: '#a78bfa' }} />
                  </Box>
                ) : (chatSessions.filter(s => {
                  if (!chatHistorySearch) return true;
                  const q = chatHistorySearch.toLowerCase();
                  return (s.title || '').toLowerCase().includes(q) || (s.username || '').toLowerCase().includes(q);
                }).length === 0) ? (
                  <Box sx={{ textAlign: 'center', py: 8 }}>
                    <HistoryIcon sx={{ fontSize: 48, color: '#8A8190', mb: 1.5 }} />
                    <Typography sx={{ color: '#1E293B', fontSize: '0.875rem' }}>
                      {chatHistorySearch ? '검색 결과가 없습니다' : '채팅 내역이 없습니다'}
                    </Typography>
                  </Box>
                ) : (
                  chatSessions.filter(s => {
                    if (!chatHistorySearch) return true;
                    const q = chatHistorySearch.toLowerCase();
                    return (s.title || '').toLowerCase().includes(q) || (s.username || '').toLowerCase().includes(q);
                  }).map((sess, index, arr) => (
                    <Box key={sess.id} sx={{
                      display: 'grid', gridTemplateColumns: '1fr 180px 100px 120px 50px',
                      px: 3, py: 2, alignItems: 'center',
                      borderBottom: index < arr.length - 1 ? '1px solid rgba(0,0,0,0.15)' : 'none',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'rgba(167,139,250,0.03)' },
                    }}
                      onClick={() => viewSessionMessages(sess.id)}
                    >
                      <Box>
                        <Typography sx={{ color: '#111827', fontSize: '0.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sess.title || '새 대화'}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 24, height: 24, bgcolor: '#A78BFA', fontSize: '0.65rem', fontWeight: 700, color: '#FFFFFF' }}>
                          {(sess.username || '?')[0].toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography sx={{ color: '#1E293B', fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                            {sess.username}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <ChatBubbleIcon2 sx={{ fontSize: 13, color: '#1E293B' }} />
                        <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", color: '#1E293B', fontSize: '0.8125rem' }}>
                          {sess.message_count}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontFamily: "'JetBrains Mono', monospace", color: '#1E293B', fontSize: '0.75rem' }}>
                        {sess.created_at ? new Date(sess.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-'}
                      </Typography>
                      <Tooltip title="대화 내용 보기" arrow>
                        <IconButton size="small"
                          onClick={(e) => { e.stopPropagation(); viewSessionMessages(sess.id); }}
                          sx={{ color: '#64748B', '&:hover': { color: '#a78bfa', bgcolor: 'rgba(167,139,250,0.08)' } }}
                        >
                          <VisibilityIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ))
                )}

                {/* Pagination */}
                {chatSessionsTotal > 20 && (

                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, borderTop: '1px solid rgba(0,0,0,0.12)' }}>

                    <Pagination
                      count={Math.ceil(chatSessionsTotal / 20)}
                      page={chatSessionsPage}
                      onChange={(_, p) => loadChatSessionsPage(p)}
                      size="small"
                      sx={{
                        '& .MuiPaginationItem-root': {

                          color: '#334155', borderColor: 'rgba(0,0,0,0.15)',

                          '&.Mui-selected': { bgcolor: 'rgba(167,139,250,0.15)', color: '#a78bfa', borderColor: 'rgba(167,139,250,0.3)' },
                          '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
                        },
                      }}
                    />
                  </Box>
                )}
              </Box>
            </>
          )}
        </Box>
      )}

      {/* ==================== DIALOGS ==================== */}

      {/* Create Corpus Dialog */}
      <Dialog open={createDialogOpen}
        onClose={creatingCorpus ? undefined : () => setCreateDialogOpen(false)}
        disableEscapeKeyDown={creatingCorpus} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '16px', bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#111827', pb: 1, letterSpacing: '-0.02em' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '10px',
              background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
              boxShadow: '0 0 20px rgba(167,139,250,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Add sx={{ color: 'white', fontSize: 20 }} />
            </Box>
            새 문서 저장소
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <TextField autoFocus margin="dense" label="저장소 이름" fullWidth
            value={newCorpusName} onChange={(e) => setNewCorpusName(e.target.value)}
            placeholder="예: 회사 문서, 프로젝트 자료"
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: '#F8FAFC', color: '#111827', borderRadius: '12px',
                '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' },
                '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' },
                '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
              },
              '& .MuiInputLabel-root': { color: '#334155' },
              '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
            }}
          />
          <Box sx={{ mt: 2, p: 2, bgcolor: '#F8FAFC', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.20)' }}>
            <FormControlLabel
              control={<Switch checked={newCorpusIsPublic} onChange={(e) => setNewCorpusIsPublic(e.target.checked)}
                sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#a78bfa' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#7c3aed' } }} />}
              label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {newCorpusIsPublic ? <LockOpen sx={{ fontSize: 16, color: '#a78bfa' }} /> : <Lock sx={{ fontSize: 16, color: '#f59e0b' }} />}
                <Typography sx={{ color: '#111827', fontSize: '0.8125rem' }}>{newCorpusIsPublic ? '원본 문서 공개' : '원본 문서 비공개'}</Typography>
              </Box>}
            />
            <Typography sx={{ color: '#334155', fontSize: '0.7rem', mt: 0.5, ml: 6 }}>
              {newCorpusIsPublic ? '챗봇이 참조 시 문서 다운로드 링크를 제공합니다' : '챗봇이 참조하더라도 문서 다운로드 링크를 제공하지 않습니다'}
            </Typography>
          </Box>
          <Box sx={{ mt: 2, p: 2, bgcolor: '#F8FAFC', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.20)' }}>
            <Typography sx={{ color: '#111827', fontSize: '0.8125rem', fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Security sx={{ fontSize: 15, color: '#a78bfa' }} /> 접근 권한 그룹
            </Typography>
            <Typography sx={{ color: '#334155', fontSize: '0.7rem', mb: 1.5 }}>
              선택한 그룹의 사용자만 이 저장소의 문서를 검색할 수 있습니다
            </Typography>
            {groups.length === 0 ? (
              <Typography sx={{ color: '#8A8190', fontSize: '0.75rem' }}>생성된 그룹이 없습니다</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {groups.map((group) => (
                  <FormControlLabel key={group.id}
                    control={<Checkbox checked={newCorpusGroupIds.includes(group.id)}
                      onChange={(e) => { if (e.target.checked) { setNewCorpusGroupIds(prev => [...prev, group.id]); } else { setNewCorpusGroupIds(prev => prev.filter(id => id !== group.id)); } }}
                      sx={{ color: '#8A8190', '&.Mui-checked': { color: '#a78bfa' } }} size="small" />}
                    label={<Typography sx={{ color: '#111827', fontSize: '0.8125rem' }}>
                      {group.name}
                      {group.description && <Typography component="span" sx={{ color: '#334155', fontSize: '0.7rem', ml: 1 }}>({group.description})</Typography>}
                    </Typography>}
                  />
                ))}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={creatingCorpus}
            sx={{ border: '1px solid rgba(0,0,0,0.1)', color: '#64748B', borderRadius: '10px', textTransform: 'none', '&:hover': { borderColor: 'rgba(0,0,0,0.2)' } }}
          >취소</Button>
          <Button onClick={createCorpus} disabled={creatingCorpus}
            sx={{
              background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', boxShadow: '0 0 20px rgba(167,139,250,0.25)',
              color: 'white', fontWeight: 700, px: 3, borderRadius: '10px', textTransform: 'none',
              '&:hover': { background: 'linear-gradient(135deg, #9370f0 0%, #6d28d9 100%)' },
              '&.Mui-disabled': { background: 'rgba(167,139,250,0.2)', color: '#8A8190' },
            }}
          >{creatingCorpus ? '생성 중...' : '생성'}</Button>
        </DialogActions>
      </Dialog>

      {/* Create Group Dialog */}
      <Dialog open={groupDialogOpen} onClose={() => setGroupDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '16px', bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#111827', pb: 1, letterSpacing: '-0.02em' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '10px',
              background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
              boxShadow: '0 0 20px rgba(167,139,250,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Group sx={{ color: 'white', fontSize: 20 }} />
            </Box>
            새 그룹
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <TextField autoFocus margin="dense" label="그룹 이름" fullWidth
            value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="예: Engineering, Marketing"
            sx={{
              mb: 2,
              '& .MuiOutlinedInput-root': { bgcolor: '#F8FAFC', color: '#111827', borderRadius: '12px', '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#a78bfa' } },
              '& .MuiInputLabel-root': { color: '#64748B' }, '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
            }}
          />
          <TextField margin="dense" label="설명 (선택사항)" fullWidth
            value={newGroupDescription} onChange={(e) => setNewGroupDescription(e.target.value)} placeholder="그룹에 대한 간단한 설명"
            sx={{
              '& .MuiOutlinedInput-root': { bgcolor: '#F8FAFC', color: '#111827', borderRadius: '12px', '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#a78bfa' } },
              '& .MuiInputLabel-root': { color: '#64748B' }, '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button onClick={() => setGroupDialogOpen(false)}
            sx={{ border: '1px solid rgba(0,0,0,0.1)', color: '#64748B', borderRadius: '10px', textTransform: 'none', '&:hover': { borderColor: 'rgba(0,0,0,0.2)' } }}
          >취소</Button>
          <Button onClick={createGroup}
            sx={{
              background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', boxShadow: '0 0 20px rgba(167,139,250,0.25)',
              color: 'white', fontWeight: 700, px: 3, borderRadius: '10px', textTransform: 'none',
              '&:hover': { background: 'linear-gradient(135deg, #9370f0 0%, #6d28d9 100%)' },
            }}
          >생성</Button>
        </DialogActions>
      </Dialog>

      {/* Permission Dialog */}
      <Dialog open={permissionDialogOpen}
        onClose={() => { setPermissionDialogOpen(false); setSelectedCorpusForPermission(null); }}
        maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: '16px', bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#111827', pb: 1, letterSpacing: '-0.02em' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '10px',
              background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
              boxShadow: '0 0 20px rgba(167,139,250,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Security sx={{ color: 'white', fontSize: 20 }} />
            </Box>
            <Box>
              <Typography sx={{ color: '#111827', fontWeight: 800, fontSize: '1.1rem' }}>접근 권한</Typography>
              {selectedCorpusForPermission && (
                <Typography sx={{ color: '#334155', fontSize: '0.75rem' }}>{selectedCorpusForPermission.display_name}</Typography>
              )}
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {selectedCorpusForPermission && groups.length > 0 ? (
            <Box sx={{ bgcolor: '#F8FAFC', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.20)' }}>
              {/* Grid Header */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 200px', px: 2.5, py: 1.2, borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155' }}>Group</Typography>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155' }}>Access</Typography>
              </Box>
              {/* Grid Rows */}
              {groups.map((group, index) => {
                const permission = permissions.find(p => p.group_id === group.id && p.store_name === selectedCorpusForPermission.corpus_name);
                const hasAccess = permission && permission.can_read;
                const handlePermissionChange = async (e) => {
                  const newValue = e.target.value;
                  if (newValue === 'allowed') {
                    if (!hasAccess) await grantPermissionToGroup(group.id);
                  } else {
                    if (hasAccess) {
                      if (!window.confirm('이 그룹의 접근 권한을 회수하시겠습니까?')) { e.target.value = 'allowed'; return; }
                      try { await adminAPI.revokeStorePermission(permission.id); loadPermissions(); }
                      catch (error) { alert('권한 삭제 오류: ' + (error.response?.data?.detail || error.message)); e.target.value = 'allowed'; }
                    }
                  }
                };
                return (
                  <Box key={group.id} sx={{
                    display: 'grid', gridTemplateColumns: '1fr 200px',
                    px: 2.5, py: 1.8, alignItems: 'center',
                    borderBottom: index < groups.length - 1 ? '1px solid rgba(0,0,0,0.15)' : 'none',
                    transition: 'all 0.2s',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' },
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: hasAccess ? '#22c55e' : '#52525B', boxShadow: hasAccess ? '0 0 8px rgba(34,197,94,0.4)' : 'none' }} />
                      <Typography sx={{ color: '#111827', fontWeight: 600, fontSize: '0.8125rem' }}>{group.name}</Typography>
                    </Box>
                    <Box sx={{ position: 'relative', display: 'inline-block' }}>
                      <select value={hasAccess ? 'allowed' : 'denied'} onChange={handlePermissionChange}
                        style={{
                          appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
                          paddingLeft: '12px', paddingRight: '30px', paddingTop: '6px', paddingBottom: '6px',
                          fontSize: '0.7rem', fontWeight: 600, borderRadius: '8px',
                          border: hasAccess ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(0,0,0,0.15)',
                          backgroundColor: hasAccess ? '#DCFCE7' : '#F8FAFC',
                          color: hasAccess ? '#15803d' : '#52525B', cursor: 'pointer', outline: 'none',
                        }}
                      >
                        <option value="allowed">허용됨</option>
                        <option value="denied">거부됨</option>
                      </select>
                      <Security sx={{
                        position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                        fontSize: 12, color: hasAccess ? '#22c55e' : '#52525B', pointerEvents: 'none',
                      }} />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Group sx={{ fontSize: 40, color: '#8A8190', mb: 1 }} />
              <Typography sx={{ color: '#334155' }}>생성된 그룹이 없습니다</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => { setPermissionDialogOpen(false); setSelectedCorpusForPermission(null); }}
            sx={{
              background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', boxShadow: '0 0 20px rgba(167,139,250,0.25)',
              color: 'white', fontWeight: 700, px: 3, borderRadius: '10px', textTransform: 'none',
              '&:hover': { background: 'linear-gradient(135deg, #9370f0 0%, #6d28d9 100%)' },
            }}
          >닫기</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Corpus Password Dialog */}
      <Dialog open={passwordDialogOpen}
        onClose={deletingCorpus ? undefined : () => { setPasswordDialogOpen(false); setPassword(''); setDeletingCorpusName(null); }}
        disableEscapeKeyDown={deletingCorpus} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '16px', bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#111827', pb: 1, letterSpacing: '-0.02em' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '10px',
              background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Security sx={{ color: 'white', fontSize: 20 }} />
            </Box>
            저장소 삭제 확인
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography sx={{ color: '#334155', mb: 3, fontSize: '0.875rem' }}>이 작업은 되돌릴 수 없습니다. 계속하려면 비밀번호를 입력해주세요.</Typography>
          <TextField autoFocus type="password" margin="dense" label="비밀번호" fullWidth
            value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => { if (e.key === 'Enter') confirmDeleteCorpus(); }}
            placeholder="현재 계정의 비밀번호"
            sx={{
              '& .MuiOutlinedInput-root': { bgcolor: '#F8FAFC', color: '#111827', borderRadius: '12px', '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' }, '&:hover fieldset': { borderColor: '#FCA5A5' }, '&.Mui-focused fieldset': { borderColor: '#ef4444' } },
              '& .MuiInputLabel-root': { color: '#64748B' }, '& .MuiInputLabel-root.Mui-focused': { color: '#DC2626' },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button onClick={() => { setPasswordDialogOpen(false); setPassword(''); setDeletingCorpusName(null); }} disabled={deletingCorpus}
            sx={{ border: '1px solid rgba(0,0,0,0.1)', color: '#64748B', borderRadius: '10px', textTransform: 'none', '&:hover': { borderColor: 'rgba(0,0,0,0.2)' } }}
          >취소</Button>
          <Button onClick={confirmDeleteCorpus} disabled={deletingCorpus}
            sx={{
              background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
              color: 'white', fontWeight: 700, px: 3, borderRadius: '10px', textTransform: 'none',
              '&:hover': { background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)' },
              '&.Mui-disabled': { background: 'rgba(239,68,68,0.2)', color: '#8A8190' },
            }}
          >{deletingCorpus ? '삭제 중...' : '삭제'}</Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteDialogOpen} onClose={() => { setBulkDeleteDialogOpen(false); setBulkDeletePassword(''); }}
        maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '16px', bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#111827', pb: 1, letterSpacing: '-0.02em' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '10px',
              background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <DeleteOutline sx={{ color: 'white', fontSize: 20 }} />
            </Box>
            문서 일괄 삭제
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography sx={{ color: '#334155', mb: 2, fontSize: '0.875rem' }}>
            <strong style={{ color: '#DC2626' }}>{selectedDocuments.length}개</strong> 문서를 삭제합니다.
          </Typography>
          <Box sx={{ maxHeight: 150, overflow: 'auto', bgcolor: '#F8FAFC', borderRadius: '10px', p: 1.5, mb: 3, border: '1px solid rgba(0,0,0,0.20)' }}>
            {selectedDocuments.map(docName => {
              const doc = documents.find(d => d.document_name === docName);
              return (
                <Typography key={docName} sx={{ color: '#334155', fontSize: '0.75rem', mb: 0.5 }}>
                  {doc?.display_name || docName.split('/').pop()}
                </Typography>
              );
            })}
          </Box>
          <Typography sx={{ color: '#334155', fontSize: '0.8125rem', mb: 2 }}>되돌릴 수 없습니다. 비밀번호를 입력해주세요.</Typography>
          <TextField autoFocus type="password" margin="dense" label="비밀번호" fullWidth
            value={bulkDeletePassword} onChange={(e) => setBulkDeletePassword(e.target.value)}
            onKeyPress={(e) => { if (e.key === 'Enter') executeBulkDelete(); }}
            placeholder="현재 계정의 비밀번호"
            sx={{
              '& .MuiOutlinedInput-root': { bgcolor: '#F8FAFC', color: '#111827', borderRadius: '12px', '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' }, '&:hover fieldset': { borderColor: '#FCA5A5' }, '&.Mui-focused fieldset': { borderColor: '#ef4444' } },
              '& .MuiInputLabel-root': { color: '#64748B' }, '& .MuiInputLabel-root.Mui-focused': { color: '#DC2626' },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button onClick={() => { setBulkDeleteDialogOpen(false); setBulkDeletePassword(''); }} disabled={bulkDeleting}
            sx={{ border: '1px solid rgba(0,0,0,0.1)', color: '#64748B', borderRadius: '10px', textTransform: 'none', '&:hover': { borderColor: 'rgba(0,0,0,0.2)' } }}
          >취소</Button>
          <Button onClick={executeBulkDelete} disabled={bulkDeleting}
            sx={{
              background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
              color: 'white', fontWeight: 700, px: 3, borderRadius: '10px', textTransform: 'none',
              '&:hover': { background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)' },
            }}
          >{bulkDeleting ? <CircularProgress size={18} sx={{ color: 'white' }} /> : '삭제'}</Button>
        </DialogActions>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={templateDialogOpen} onClose={closeTemplateDialog} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: '16px', bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#111827', pb: 1, letterSpacing: '-0.02em' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '10px',
              background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
              boxShadow: '0 0 20px rgba(167,139,250,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {editingTemplate ? <Edit sx={{ color: 'white', fontSize: 20 }} /> : <Add sx={{ color: 'white', fontSize: 20 }} />}
            </Box>
            {editingTemplate ? '템플릿 수정' : '새 템플릿'}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 4, overflow: 'visible' }}>
          <Grid container spacing={2.5} sx={{ mt: 0 }}>
            <Grid item xs={12} sm={6}>
              <TextField autoFocus label="제목" fullWidth value={templateForm.title}
                onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })}
                placeholder="예: 사역결과 보고서" InputLabelProps={{ shrink: true }}
                sx={{
                  '& .MuiOutlinedInput-root': { bgcolor: '#F8FAFC', color: '#111827', borderRadius: '12px', '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#a78bfa' } },
                  '& .MuiInputLabel-root': { color: '#64748B' }, '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField select label="아이콘" fullWidth value={templateForm.icon}
                onChange={(e) => setTemplateForm({ ...templateForm, icon: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{
                  '& .MuiOutlinedInput-root': { bgcolor: '#F8FAFC', color: '#111827', borderRadius: '12px', '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#a78bfa' } },
                  '& .MuiInputLabel-root': { color: '#64748B' }, '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
                  '& .MuiSelect-icon': { color: '#334155' },
                }}
              >
                <MenuItem value="assignment"><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Assignment sx={{ fontSize: 18 }} /> 보고서</Box></MenuItem>
                <MenuItem value="event_note"><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><EventNote sx={{ fontSize: 18 }} /> 일정</Box></MenuItem>
                <MenuItem value="article"><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Article sx={{ fontSize: 18 }} /> 아티클</Box></MenuItem>
                <MenuItem value="notes"><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Notes sx={{ fontSize: 18 }} /> 노트</Box></MenuItem>
                <MenuItem value="description"><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Description sx={{ fontSize: 18 }} /> 문서</Box></MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField label="설명 (선택사항)" fullWidth value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                placeholder="버튼 아래에 표시될 짧은 설명" InputLabelProps={{ shrink: true }}
                sx={{
                  '& .MuiOutlinedInput-root': { bgcolor: '#F8FAFC', color: '#111827', borderRadius: '12px', '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#a78bfa' } },
                  '& .MuiInputLabel-root': { color: '#64748B' }, '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField label="프롬프트 내용" fullWidth multiline rows={12} value={templateForm.content}
                onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })}
                placeholder="AI에게 전달될 프롬프트 내용을 입력하세요..." InputLabelProps={{ shrink: true }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: '#F8FAFC', color: '#111827', borderRadius: '12px',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8125rem',
                    '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
                  },
                  '& .MuiInputLabel-root': { color: '#64748B' }, '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
                  '& textarea': { '&::-webkit-scrollbar': { width: 5 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(167,139,250,0.3)', borderRadius: 3 } },
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Checkbox checked={templateForm.is_active}
                  onChange={(e) => setTemplateForm({ ...templateForm, is_active: e.target.checked })}
                  sx={{ color: '#8A8190', '&.Mui-checked': { color: '#a78bfa' } }}
                />
                <Typography sx={{ color: '#334155', fontSize: '0.8125rem' }}>활성화 (채팅 화면에 표시)</Typography>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button onClick={closeTemplateDialog}
            sx={{ border: '1px solid rgba(0,0,0,0.1)', color: '#64748B', borderRadius: '10px', textTransform: 'none', '&:hover': { borderColor: 'rgba(0,0,0,0.2)' } }}
          >취소</Button>
          <Button onClick={saveTemplate}
            sx={{
              background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', boxShadow: '0 0 20px rgba(167,139,250,0.25)',
              color: 'white', fontWeight: 700, px: 3, borderRadius: '10px', textTransform: 'none',
              '&:hover': { background: 'linear-gradient(135deg, #9370f0 0%, #6d28d9 100%)' },
            }}
          >{editingTemplate ? '수정' : '생성'}</Button>
        </DialogActions>
      </Dialog>

      {/* User Actions Menu */}
      <Menu anchorEl={userMenuAnchor} open={Boolean(userMenuAnchor)} onClose={handleUserMenuClose}
        PaperProps={{ sx: { bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '12px', minWidth: 180, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' } }}
      >
        <MenuItem onClick={openUserEditDialog} sx={{ color: '#111827', fontSize: '0.8125rem', py: 1.25, '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' } }}>
          <Edit sx={{ fontSize: 16, mr: 1.5, color: '#60a5fa' }} /> 정보 수정
        </MenuItem>
        <MenuItem onClick={openUserPasswordDialog} sx={{ color: '#111827', fontSize: '0.8125rem', py: 1.25, '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' } }}>
          <VpnKey sx={{ fontSize: 16, mr: 1.5, color: '#fbbf24' }} /> 비밀번호 변경
        </MenuItem>
        <MenuItem onClick={handleUserDelete} sx={{ color: '#DC2626', fontSize: '0.8125rem', py: 1.25, '&:hover': { bgcolor: 'rgba(239,68,68,0.08)' } }}>
          <PersonRemove sx={{ fontSize: 16, mr: 1.5 }} /> 유저 삭제
        </MenuItem>
      </Menu>

      {/* User Edit Dialog */}
      <Dialog open={userEditDialogOpen} onClose={() => setUserEditDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { bgcolor: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.20)' } }}
      >
        <DialogTitle sx={{ color: '#111827', fontWeight: 800, fontSize: '1.1rem', pb: 1, letterSpacing: '-0.02em' }}>유저 정보 수정</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField label="이름" fullWidth value={userEditForm.username}
              onChange={(e) => setUserEditForm({ ...userEditForm, username: e.target.value })}
              sx={{
                '& .MuiOutlinedInput-root': { bgcolor: '#F8FAFC', color: '#111827', borderRadius: '12px', '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#a78bfa' } },
                '& .MuiInputLabel-root': { color: '#64748B' }, '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
              }}
            />
            <TextField label="이메일" fullWidth value={userEditForm.email}
              onChange={(e) => setUserEditForm({ ...userEditForm, email: e.target.value })}
              sx={{
                '& .MuiOutlinedInput-root': { bgcolor: '#F8FAFC', color: '#111827', borderRadius: '12px', '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#a78bfa' } },
                '& .MuiInputLabel-root': { color: '#64748B' }, '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button onClick={() => setUserEditDialogOpen(false)}
            sx={{ border: '1px solid rgba(0,0,0,0.1)', color: '#64748B', borderRadius: '10px', textTransform: 'none', '&:hover': { borderColor: 'rgba(0,0,0,0.2)' } }}
          >취소</Button>
          <Button onClick={handleUserEdit}
            sx={{
              background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', boxShadow: '0 0 20px rgba(167,139,250,0.25)',
              color: 'white', fontWeight: 700, px: 3, borderRadius: '10px', textTransform: 'none',
              '&:hover': { background: 'linear-gradient(135deg, #9370f0 0%, #6d28d9 100%)' },
            }}
          >저장</Button>
        </DialogActions>
      </Dialog>

      {/* User Password Dialog */}
      <Dialog open={userPasswordDialogOpen} onClose={() => setUserPasswordDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { bgcolor: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.20)' } }}
      >
        <DialogTitle sx={{ color: '#111827', fontWeight: 800, fontSize: '1.1rem', pb: 1, letterSpacing: '-0.02em' }}>
          비밀번호 변경
          {selectedUserForAction && (
            <Typography sx={{ color: '#334155', fontSize: '0.75rem', mt: 0.5 }}>
              {selectedUserForAction.username} ({selectedUserForAction.email})
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField label="새 비밀번호" type="password" fullWidth
              value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} placeholder="최소 4자 이상"
              sx={{
                '& .MuiOutlinedInput-root': { bgcolor: '#F8FAFC', color: '#111827', borderRadius: '12px', '& fieldset': { borderColor: 'rgba(0,0,0,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(251,191,36,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#fbbf24' } },
                '& .MuiInputLabel-root': { color: '#64748B' }, '& .MuiInputLabel-root.Mui-focused': { color: '#fbbf24' },
              }}
            />
            <Typography sx={{ color: '#8A8190', fontSize: '0.7rem', mt: 1 }}>
              * 외부 SSO 사용자도 이 비밀번호로 일반 로그인이 가능해집니다
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button onClick={() => setUserPasswordDialogOpen(false)}
            sx={{ border: '1px solid rgba(0,0,0,0.1)', color: '#64748B', borderRadius: '10px', textTransform: 'none', '&:hover': { borderColor: 'rgba(0,0,0,0.2)' } }}
          >취소</Button>
          <Button onClick={handleUserPasswordChange} disabled={!newUserPassword || newUserPassword.length < 4}
            sx={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: 'white', fontWeight: 700, px: 3, borderRadius: '10px', textTransform: 'none',
              '&:hover': { background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' },
              '&.Mui-disabled': { background: 'rgba(0,0,0,0.04)', color: '#8A8190' },
            }}
          >비밀번호 변경</Button>
        </DialogActions>
      </Dialog>

      {/* Visibility Toggle Confirmation Dialog */}
      <Dialog open={visibilityDialogOpen}
        onClose={() => { setVisibilityDialogOpen(false); setVisibilityTarget(null); }}
        maxWidth="xs" fullWidth
        PaperProps={{ sx: { bgcolor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.20)', borderRadius: '16px', backgroundImage: 'none' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#111827', pb: 1, letterSpacing: '-0.02em' }}>
          공개 설정 변경
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {visibilityTarget && (
            <Box>
              <Typography sx={{ color: '#A1A1AA', fontSize: '0.875rem', mb: 2 }}>
                <strong style={{ color: '#111827' }}>{visibilityTarget.displayName}</strong> 저장소를{' '}
                <strong style={{ color: visibilityTarget.newValue ? '#86efac' : '#fbbf24' }}>
                  {visibilityTarget.newValue ? '공개' : '비공개'}
                </strong>
                로 변경하시겠습니까?
              </Typography>
              <Box sx={{
                p: 2, borderRadius: '12px',
                bgcolor: visibilityTarget.newValue ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
                border: visibilityTarget.newValue ? '1px solid rgba(34,197,94,0.15)' : '1px solid rgba(245,158,11,0.15)',
              }}>
                <Typography sx={{ color: '#334155', fontSize: '0.75rem', lineHeight: 1.6 }}>
                  {visibilityTarget.newValue
                    ? '공개로 설정하면 챗봇이 이 저장소의 문서를 참조할 때 문서 링크를 함께 제공합니다.'
                    : '비공개로 설정하면 챗봇이 이 저장소의 문서를 참조하더라도 문서 링크를 제공하지 않습니다.'
                  }
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button onClick={() => { setVisibilityDialogOpen(false); setVisibilityTarget(null); }}
            sx={{ color: '#334155', fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none', borderRadius: '10px' }}
          >취소</Button>
          <Button onClick={() => {
            if (!visibilityTarget) return;
            corpusAPI.updateSettings(visibilityTarget.corpusName, { is_public: visibilityTarget.newValue }).then(() => {
              setCorpora(prev => prev.map(c =>
                c.corpus_name === visibilityTarget.corpusName ? { ...c, is_public: visibilityTarget.newValue } : c
              ));
              setVisibilityDialogOpen(false);
              setVisibilityTarget(null);
            }).catch(err => {
              alert('설정 변경 실패: ' + (err.response?.data?.detail || err.message));
            });
          }}
            sx={{
              background: visibilityTarget?.newValue
                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: 'white', fontWeight: 700, fontSize: '0.8125rem', px: 2.5, borderRadius: '10px', textTransform: 'none',
              '&:hover': { opacity: 0.9 },
            }}
          >변경</Button>
        </DialogActions>
      </Dialog>

      {/* ============ Tab Panel 7: 상담 대기 (HITL) ============ */}
      {tabValue === 7 && <HITLPanel />}
      {tabValue === 8 && <StudentManagementPanel initialSubTab={initialStudentSubTab} />}
      {tabValue === 9 && <ExamAnalysisPage />}
    </Box>
  );
}
