import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  InputAdornment,
  CircularProgress,
  Snackbar,
  Alert,
  Tooltip,
  Chip,
  Select,
  MenuItem,
  Slider,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Save,
  CloudDone,
  CloudOff,
  Info,
  CheckCircle,
} from '@mui/icons-material';
import { superadminAPI } from '../../services/api';
import { glowButtonSx } from './styles';

const FONT = "'Plus Jakarta Sans', sans-serif";
const MONO = "'JetBrains Mono', monospace";

// Slider parameter configs
const SLIDER_PARAMS = {
  MODEL_TEMPERATURE: { label: '온도 (Temperature)', min: 0, max: 2, step: 0.05, defaultVal: 1.0, desc: '높을수록 창의적, 낮을수록 일관적' },
  MODEL_TOP_K: { label: 'Top K', min: 1, max: 100, step: 1, defaultVal: 40, desc: '토큰 선택 후보 수' },
  MODEL_TOP_P: { label: '최상위 P (Top P)', min: 0, max: 1, step: 0.01, defaultVal: 0.95, desc: '누적 확률 기반 샘플링' },
  MODEL_MAX_OUTPUT_TOKENS: { label: '출력 토큰 한도', min: 256, max: 65536, step: 256, defaultVal: 8192, desc: '최대 출력 토큰 수' },
  MODEL_THINKING_BUDGET: { label: '사고 예산 (Thinking Budget)', min: 0, max: 32768, step: 256, defaultVal: 0, desc: '0 = 비활성, 지원 모델만 적용' },
};

const SETTING_GROUPS = [
  {
    title: 'Google Cloud 인프라',
    description: 'Google Cloud 기반 인프라 및 AI 서비스 설정',
    keys: ['GCP_CREDENTIALS_PATH', 'VERTEX_AI_PROJECT_ID', 'VERTEX_AI_LOCATION', 'GCS_BUCKET_NAME', 'GEMINI_API_KEY', 'DEFAULT_MODEL'],
    subGroups: [
      { label: 'GCP 서비스 계정', keys: ['GCP_CREDENTIALS_PATH'] },
      { label: 'Vertex AI / Cloud Storage', keys: ['VERTEX_AI_PROJECT_ID', 'VERTEX_AI_LOCATION', 'GCS_BUCKET_NAME'] },
      { label: 'Gemini API', keys: ['GEMINI_API_KEY', 'DEFAULT_MODEL'] },
    ],
  },
  {
    title: 'RAG Engine (Weaviate)',
    description: 'RAG Engine + Weaviate 하이브리드 검색을 선택한 테넌트에 적용되는 설정',
    keys: ['WEAVIATE_HTTP_ENDPOINT', 'WEAVIATE_COLLECTION_NAME', 'WEAVIATE_API_KEY_SECRET'],
  },
  {
    title: 'AI 모델 파라미터',
    description: '모델 응답 생성에 적용되는 공통 파라미터 (비워두면 API 기본값 사용)',
    keys: ['MODEL_TEMPERATURE', 'MODEL_TOP_K', 'MODEL_TOP_P', 'MODEL_MAX_OUTPUT_TOKENS', 'MODEL_THINKING_BUDGET'],
  },
];

function SliderParam({ paramKey, value, onChange }) {
  const cfg = SLIDER_PARAMS[paramKey];
  if (!cfg) return null;

  const numValue = value !== '' && value !== undefined ? Number(value) : cfg.defaultVal;
  const isFloat = cfg.step < 1;

  const handleSliderChange = (_, newVal) => {
    onChange(paramKey, isFloat ? newVal.toFixed(2).replace(/\.?0+$/, (m) => m === '.' ? '' : m.replace(/0+$/, '')) : String(newVal));
  };

  const handleInputChange = (e) => {
    const raw = e.target.value;
    if (raw === '') {
      onChange(paramKey, '');
      return;
    }
    onChange(paramKey, raw);
  };

  const handleInputBlur = () => {
    if (value === '') return;
    let n = Number(value);
    if (isNaN(n)) n = cfg.defaultVal;
    n = Math.max(cfg.min, Math.min(cfg.max, n));
    onChange(paramKey, isFloat ? String(n) : String(Math.round(n)));
  };

  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography
          sx={{
            fontFamily: FONT,
            fontSize: '0.82rem',
            fontWeight: 600,
            color: '#E4E4E7',
          }}
        >
          {cfg.label}
        </Typography>
        <Tooltip title={cfg.desc} arrow>
          <Info sx={{ fontSize: 14, color: '#52525B', cursor: 'help' }} />
        </Tooltip>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
        <Slider
          value={numValue}
          min={cfg.min}
          max={cfg.max}
          step={cfg.step}
          onChange={handleSliderChange}
          sx={{
            flex: 1,
            color: '#14B8A6',
            height: 4,
            '& .MuiSlider-rail': {
              bgcolor: '#27272A',
              opacity: 1,
            },
            '& .MuiSlider-track': {
              bgcolor: '#14B8A6',
              border: 'none',
            },
            '& .MuiSlider-thumb': {
              width: 16,
              height: 16,
              bgcolor: '#FAFAFA',
              border: '2px solid #14B8A6',
              boxShadow: '0 0 8px rgba(20,184,166,0.3)',
              '&:hover, &.Mui-focusVisible': {
                boxShadow: '0 0 12px rgba(20,184,166,0.5)',
              },
            },
          }}
        />
        <TextField
          size="small"
          value={value !== '' && value !== undefined ? value : cfg.defaultVal}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          inputProps={{
            style: { textAlign: 'center', padding: '6px 4px' },
          }}
          sx={{
            width: 80,
            '& .MuiOutlinedInput-root': {
              fontFamily: MONO,
              fontSize: '0.82rem',
              color: '#FAFAFA',
              bgcolor: '#09090B',
              borderRadius: '8px',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(255,255,255,0.08)',
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(255,255,255,0.15)',
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: '#14B8A6',
                borderWidth: '1px',
              },
            },
          }}
        />
      </Box>
    </Box>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState([]);
  const [formValues, setFormValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showSecrets, setShowSecrets] = useState({});
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [hasChanges, setHasChanges] = useState(false);
  const [geminiModels, setGeminiModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await superadminAPI.getSettings();
      setSettings(data.settings);
      const values = {};
      data.settings.forEach((s) => {
        values[s.key] = s.value || '';
      });
      setFormValues(values);
      setHasChanges(false);
    } catch (err) {
      setSnackbar({ open: true, message: '설정을 불러오는데 실패했습니다', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const { data } = await superadminAPI.listGeminiModels();
      setGeminiModels(data.models || []);
    } catch (err) {
      // silently fail — models dropdown will just be empty
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchModels();
  }, [fetchSettings, fetchModels]);

  const handleChange = (key, value) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await superadminAPI.updateSettings(formValues);
      setSnackbar({ open: true, message: '설정이 저장되었습니다', severity: 'success' });
      await fetchSettings();
    } catch (err) {
      setSnackbar({ open: true, message: '설정 저장에 실패했습니다', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await superadminAPI.testVertexAI();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, message: '연결 테스트 요청 실패' });
    } finally {
      setTesting(false);
    }
  };

  const getSettingMeta = (key) => settings.find((s) => s.key === key) || {};

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress sx={{ color: '#14B8A6' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 860, mx: 'auto' }}>
      {/* Font import */}
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');`}
      </style>

      {/* Header */}
      <Box sx={{ mb: 5 }}>
        <Typography
          sx={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: '1.75rem',
            color: '#FAFAFA',
            letterSpacing: '-0.03em',
            mb: 1,
          }}
        >
          플랫폼 설정
        </Typography>
        <Typography
          sx={{
            fontFamily: FONT,
            fontSize: '0.9rem',
            color: '#71717A',
            lineHeight: 1.6,
          }}
        >
          GCP 환경 변수 및 Gemini API 키 등 플랫폼 전체에 적용되는 설정을 관리합니다.
          환경 변수(.env)에 설정된 값이 기본값으로 사용되며, 여기서 덮어쓸 수 있습니다.
        </Typography>
      </Box>

      {/* Setting Groups */}
      {SETTING_GROUPS.map((group) => {
        const isSliderGroup = group.title === 'AI 모델 파라미터';

        return (
          <Box
            key={group.title}
            sx={{
              bgcolor: '#18181B',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.06)',
              p: 4,
              mb: 3,
            }}
          >
            {/* Group Header */}
            <Box sx={{ mb: 3 }}>
              <Typography
                sx={{
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: '1.05rem',
                  color: '#FAFAFA',
                  letterSpacing: '-0.01em',
                  mb: 0.5,
                }}
              >
                {group.title}
              </Typography>
              <Typography
                sx={{
                  fontFamily: FONT,
                  fontSize: '0.8rem',
                  color: '#52525B',
                }}
              >
                {group.description}
              </Typography>
            </Box>

            {/* Settings Fields */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: isSliderGroup ? 1.5 : 2.5 }}>
              {(group.subGroups || [{ label: null, keys: group.keys }]).map((sub, subIdx) => (
                <React.Fragment key={subIdx}>
                  {sub.label && (
                    <Typography sx={{
                      fontFamily: FONT,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: '#3F3F46',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      mt: subIdx > 0 ? 1.5 : 0,
                      mb: -0.5,
                      pb: 0.75,
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      {sub.label}
                    </Typography>
                  )}
                  {sub.keys.map((key) => {
                // Slider UI for model parameters
                if (isSliderGroup && SLIDER_PARAMS[key]) {
                  return (
                    <SliderParam
                      key={key}
                      paramKey={key}
                      value={formValues[key]}
                      onChange={handleChange}
                    />
                  );
                }

                const meta = getSettingMeta(key);
                const isSecret = meta.is_secret;
                const showSecret = showSecrets[key];

                const inputSx = {
                  fontFamily: MONO,
                  fontSize: '0.85rem',
                  color: '#FAFAFA',
                  bgcolor: '#09090B',
                  borderRadius: '8px',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255,255,255,0.08)',
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255,255,255,0.15)',
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#14B8A6',
                    borderWidth: '1px',
                  },
                };

                const isModelSelect = key === 'DEFAULT_MODEL';

                return (
                  <Box key={key}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                      <Typography
                        sx={{
                          fontFamily: MONO,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: '#A1A1AA',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {key}
                      </Typography>
                      {meta.source === 'env' && meta.has_value && (
                        <Chip
                          label="ENV"
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            fontFamily: MONO,
                            bgcolor: 'rgba(99,102,241,0.15)',
                            color: '#818CF8',
                            borderRadius: '4px',
                            '& .MuiChip-label': { px: 0.75 },
                          }}
                        />
                      )}
                      {meta.source === 'db' && (
                        <Chip
                          label="DB"
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            fontFamily: MONO,
                            bgcolor: 'rgba(20,184,166,0.15)',
                            color: '#14B8A6',
                            borderRadius: '4px',
                            '& .MuiChip-label': { px: 0.75 },
                          }}
                        />
                      )}
                      {meta.description && (
                        <Tooltip title={meta.description} arrow>
                          <Info sx={{ fontSize: 14, color: '#52525B', cursor: 'help' }} />
                        </Tooltip>
                      )}
                      {isModelSelect && modelsLoading && (
                        <CircularProgress size={12} sx={{ color: '#52525B' }} />
                      )}
                    </Box>

                    {isModelSelect ? (
                      <Select
                        fullWidth
                        size="small"
                        value={formValues[key] || ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        displayEmpty
                        sx={{
                          ...inputSx,
                          '& .MuiSelect-icon': { color: '#52525B' },
                        }}
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              bgcolor: '#18181B',
                              border: '1px solid rgba(255,255,255,0.08)',
                              borderRadius: '8px',
                              mt: 0.5,
                              maxHeight: 360,
                              '& .MuiMenuItem-root': {
                                fontFamily: MONO,
                                fontSize: '0.85rem',
                                color: '#FAFAFA',
                                py: 1.25,
                                '&:hover': { bgcolor: 'rgba(20,184,166,0.08)' },
                                '&.Mui-selected': {
                                  bgcolor: 'rgba(20,184,166,0.12)',
                                  '&:hover': { bgcolor: 'rgba(20,184,166,0.16)' },
                                },
                              },
                            },
                          },
                        }}
                      >
                        {geminiModels.length === 0 && (
                          <MenuItem value="" disabled>
                            <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: '#52525B' }}>
                              {modelsLoading ? '모델 목록 로딩 중...' : 'API 키를 설정하면 모델 목록이 표시됩니다'}
                            </Typography>
                          </MenuItem>
                        )}
                        {geminiModels.map((m) => (
                          <MenuItem key={m.model_id} value={m.model_id}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                              <Typography sx={{ fontFamily: MONO, fontSize: '0.85rem' }}>
                                {m.model_id}
                              </Typography>
                              {m.display_name !== m.model_id && (
                                <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: '#52525B', ml: 'auto' }}>
                                  {m.display_name}
                                </Typography>
                              )}
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    ) : (
                      <TextField
                        fullWidth
                        size="small"
                        type={isSecret && !showSecret ? 'password' : 'text'}
                        value={formValues[key] || ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        placeholder={meta.has_value ? '(설정됨)' : '(미설정)'}
                        InputProps={{
                          endAdornment: isSecret ? (
                            <InputAdornment position="end">
                              <IconButton
                                size="small"
                                onClick={() =>
                                  setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }))
                                }
                                sx={{ color: '#52525B' }}
                              >
                                {showSecret ? (
                                  <VisibilityOff sx={{ fontSize: 18 }} />
                                ) : (
                                  <Visibility sx={{ fontSize: 18 }} />
                                )}
                              </IconButton>
                            </InputAdornment>
                          ) : null,
                          sx: inputSx,
                        }}
                      />
                    )}
                  </Box>
                );
              })}
                </React.Fragment>
              ))}
            </Box>

            {/* Vertex AI connection test button */}
            {group.title === 'GCP / Vertex AI' && (
              <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleTestConnection}
                  disabled={testing}
                  startIcon={
                    testing ? (
                      <CircularProgress size={14} sx={{ color: '#14B8A6' }} />
                    ) : testResult?.success ? (
                      <CloudDone sx={{ fontSize: 16 }} />
                    ) : (
                      <CloudOff sx={{ fontSize: 16 }} />
                    )
                  }
                  sx={{
                    fontFamily: FONT,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    borderColor: 'rgba(255,255,255,0.1)',
                    color: '#A1A1AA',
                    borderRadius: '8px',
                    px: 2,
                    '&:hover': {
                      borderColor: '#14B8A6',
                      color: '#14B8A6',
                      bgcolor: 'rgba(20,184,166,0.05)',
                    },
                  }}
                >
                  연결 테스트
                </Button>
                {testResult && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {testResult.success ? (
                      <CheckCircle sx={{ fontSize: 16, color: '#10B981' }} />
                    ) : (
                      <CloudOff sx={{ fontSize: 16, color: '#EF4444' }} />
                    )}
                    <Typography
                      sx={{
                        fontFamily: FONT,
                        fontSize: '0.8rem',
                        color: testResult.success ? '#10B981' : '#EF4444',
                      }}
                    >
                      {testResult.message}
                      {testResult.corpus_count !== undefined &&
                        ` (Corpus: ${testResult.corpus_count}개)`}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        );
      })}

      {/* Save Button */}
      <Box
        sx={{
          position: 'sticky',
          bottom: 24,
          display: 'flex',
          justifyContent: 'flex-end',
          mt: 2,
          zIndex: 10,
        }}
      >
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !hasChanges}
          startIcon={
            saving ? <CircularProgress size={16} sx={{ color: '#09090B' }} /> : <Save sx={{ fontSize: 18 }} />
          }
          sx={{
            ...glowButtonSx,
            px: 4,
            py: 1.2,
          }}
        >
          {saving ? '저장 중...' : '설정 저장'}
        </Button>
      </Box>

      {/* Info Box */}
      <Box
        sx={{
          mt: 4,
          mb: 2,
          p: 3,
          bgcolor: 'rgba(20,184,166,0.05)',
          borderRadius: '12px',
          border: '1px solid rgba(20,184,166,0.1)',
        }}
      >
        <Typography
          sx={{
            fontFamily: FONT,
            fontSize: '0.8rem',
            fontWeight: 600,
            color: '#14B8A6',
            mb: 1,
          }}
        >
          설정 우선순위
        </Typography>
        <Typography
          sx={{
            fontFamily: FONT,
            fontSize: '0.78rem',
            color: '#71717A',
            lineHeight: 1.8,
          }}
        >
          DB에 저장된 값 &gt; 환경변수(.env) 값 순서로 적용됩니다.
          <br />
          여기서 값을 입력하면 DB에 저장되어 환경변수보다 우선 적용됩니다.
          <br />
          GCP 서비스 계정 하나로 Vertex AI, GCS를 통합 관리합니다.
        </Typography>
      </Box>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          sx={{
            fontFamily: FONT,
            bgcolor: snackbar.severity === 'success' ? '#09090B' : '#09090B',
            color: snackbar.severity === 'success' ? '#10B981' : '#EF4444',
            border: `1px solid ${snackbar.severity === 'success' ? '#10B981' : '#EF4444'}`,
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
