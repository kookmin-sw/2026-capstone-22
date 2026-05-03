import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Box, Typography, Button, TextField, Grid, Select, MenuItem,
  FormControl, InputLabel, Chip, Paper, Table, TableBody,
  TableCell, TableHead, TableRow, CircularProgress, Alert,
  FormHelperText,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  InsertDriveFile as InsertDriveFileIcon,
  Close as CloseIcon,
  Quiz as QuizIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'];
const MAX_SIZE_MB = 20;

const GRADE_OPTIONS = ['중1', '중2', '중3', '고1', '고2', '고3'];
const EXAM_TYPE_OPTIONS = ['내신', '모의고사', '학원 자체 제작'];
const YEAR_OPTIONS = Array.from({ length: 7 }, (_, i) => String(2020 + i));

const STATUS_CONFIG = {
  '업로드 완료': { bg: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: 'rgba(59,130,246,0.3)' },
  'OCR 대기':    { bg: 'rgba(234,179,8,0.15)',  color: '#fde047', border: 'rgba(234,179,8,0.3)' },
  '분석 중':     { bg: 'rgba(249,115,22,0.15)', color: '#fdba74', border: 'rgba(249,115,22,0.3)' },
  '분석 완료':   { bg: 'rgba(34,197,94,0.15)',  color: '#86efac', border: 'rgba(34,197,94,0.3)' },
  '실패':        { bg: 'rgba(239,68,68,0.15)',  color: '#fca5a5', border: 'rgba(239,68,68,0.3)' },
};

const MOCK_HISTORY = [
  {
    id: 1,
    fileName: '2024_수능_국어.pdf',
    subject: '국어',
    grade: '고3',
    examName: '2024 수능',
    examType: '모의고사',
    year: '2024',
    source: '한국교육과정평가원',
    uploadedAt: '2026-04-09 14:32',
    uploader: 'admin@school.kr',
    status: '분석 완료',
  },
  {
    id: 2,
    fileName: '2025_3월_모의고사_수학.pdf',
    subject: '수학',
    grade: '고2',
    examName: '2025년 3월 모의고사',
    examType: '모의고사',
    year: '2025',
    source: '교육청',
    uploadedAt: '2026-04-09 15:10',
    uploader: 'admin@school.kr',
    status: '분석 중',
  },
  {
    id: 3,
    fileName: '중간고사_영어_고1.jpg',
    subject: '영어',
    grade: '고1',
    examName: '1학기 중간고사',
    examType: '내신',
    year: '2026',
    source: '자체 출제',
    uploadedAt: '2026-04-10 09:05',
    uploader: 'teacher@school.kr',
    status: '업로드 완료',
  },
  {
    id: 4,
    fileName: '학원_자체_테스트_수학.png',
    subject: '수학',
    grade: '중3',
    examName: '4월 테스트',
    examType: '학원 자체 제작',
    year: '2026',
    source: '자체 제작',
    uploadedAt: '2026-04-10 10:20',
    uploader: 'admin@school.kr',
    status: '실패',
  },
];

const EMPTY_FORM = {
  subject: '',
  grade: '',
  examName: '',
  examType: '',
  year: '',
  source: '',
  note: '',
};

function StatusChip({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['업로드 완료'];
  return (
    <Chip
      label={status}
      size="small"
      sx={{
        height: 22,
        bgcolor: cfg.bg,
        color: cfg.color,
        fontWeight: 600,
        fontSize: '0.6875rem',
        border: `1px solid ${cfg.border}`,
        '& .MuiChip-label': { px: 1 },
      }}
    />
  );
}

export default function ExamAnalysisPage() {
  const { user } = useAuth();

  // File state
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Form state
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // History
  const [history, setHistory] = useState(MOCK_HISTORY);

  const validateFile = (f) => {
    if (!ALLOWED_TYPES.includes(f.type) && !ALLOWED_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext))) {
      return 'PDF, PNG, JPG/JPEG 형식만 업로드 가능합니다.';
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      return `파일 크기는 ${MAX_SIZE_MB}MB 이하여야 합니다.`;
    }
    return '';
  };

  const handleFileSelect = (f) => {
    const err = validateFile(f);
    setFileError(err);
    if (!err) setFile(f);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }, []);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const handleFormChange = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const newErrors = {};
    if (!file) { setFileError('파일을 선택해주세요.'); }
    if (!form.subject.trim()) newErrors.subject = '필수 입력 항목입니다.';
    if (!form.grade) newErrors.grade = '필수 입력 항목입니다.';
    if (!form.examName.trim()) newErrors.examName = '필수 입력 항목입니다.';
    if (!form.examType) newErrors.examType = '필수 입력 항목입니다.';
    if (!form.year) newErrors.year = '필수 입력 항목입니다.';
    if (!form.source.trim()) newErrors.source = '필수 입력 항목입니다.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0 && !!file && !fileError;
  };

  const handleUpload = async () => {
    if (!validate()) return;

    setUploading(true);
    setUploadSuccess(false);

    // Mock: simulate API delay
    await new Promise(r => setTimeout(r, 1200));

    const newEntry = {
      id: Date.now(),
      fileName: file.name,
      subject: form.subject,
      grade: form.grade,
      examName: form.examName,
      examType: form.examType,
      year: form.year,
      source: form.source,
      uploadedAt: new Date().toLocaleString('ko-KR', { hour12: false }).replace(/\./g, '-').replace(/ /g, ' ').slice(0, 16),
      uploader: user?.email || 'admin',
      status: '업로드 완료',
    };

    setHistory(prev => [newEntry, ...prev]);
    setFile(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFileError('');
    setUploading(false);
    setUploadSuccess(true);
    setTimeout(() => setUploadSuccess(false), 3000);
  };

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: '#18181B',
      borderRadius: 1.5,
      color: 'rgba(255,255,255,0.85)',
      fontSize: '0.875rem',
      '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
      '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' },
      '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
    },
    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)', fontSize: '0.875rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
    '& .MuiFormHelperText-root': { color: '#f87171', fontSize: '0.75rem', mx: 0 },
    '& .MuiSelect-icon': { color: 'rgba(255,255,255,0.4)' },
  };

  return (
    <Box sx={{
      p: { xs: 2, md: 4 },
      minHeight: '100vh',
      bgcolor: '#09090B',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: 2,
            bgcolor: 'rgba(167,139,250,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <QuizIcon sx={{ color: '#a78bfa', fontSize: 20 }} />
          </Box>
          <Typography sx={{ color: '#FAFAFA', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>
            문제 분석
          </Typography>
        </Box>
        <Typography sx={{ color: '#52525B', fontSize: '0.8125rem', ml: '52px' }}>
          기출문제, 모의고사, 자체 제작 시험지를 업로드하고 분석 파이프라인을 시작합니다
        </Typography>
      </Box>

      {uploadSuccess && (
        <Alert severity="success" sx={{ mb: 3, bgcolor: 'rgba(34,197,94,0.1)', color: '#86efac', border: '1px solid rgba(34,197,94,0.3)', '& .MuiAlert-icon': { color: '#86efac' } }}>
          파일이 성공적으로 업로드되었습니다. OCR 분석이 대기열에 추가됩니다.
        </Alert>
      )}

      {/* Upload Section */}
      <Box sx={{ bgcolor: '#111115', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, p: 3, mb: 3 }}>
        <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: '0.9375rem', mb: 2.5 }}>
          파일 업로드
        </Typography>

        {/* Drop Zone */}
        <Box
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !file && fileInputRef.current?.click()}
          sx={{
            border: `2px dashed ${isDragging ? '#a78bfa' : fileError ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 2.5,
            p: 4,
            mb: 2,
            textAlign: 'center',
            cursor: file ? 'default' : 'pointer',
            bgcolor: isDragging ? 'rgba(167,139,250,0.05)' : '#18181B',
            transition: 'all 0.2s ease',
            '&:hover': !file ? { borderColor: 'rgba(167,139,250,0.4)', bgcolor: 'rgba(167,139,250,0.03)' } : {},
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])}
          />

          {file ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
              <InsertDriveFileIcon sx={{ color: '#a78bfa', fontSize: 28 }} />
              <Box sx={{ textAlign: 'left' }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: '0.875rem' }}>
                  {file.name}
                </Typography>
                <Typography sx={{ color: '#52525B', fontSize: '0.75rem' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </Typography>
              </Box>
              <Box
                onClick={(e) => { e.stopPropagation(); setFile(null); setFileError(''); }}
                sx={{
                  ml: 1, p: 0.5, borderRadius: 1, cursor: 'pointer',
                  '&:hover': { bgcolor: 'rgba(239,68,68,0.1)' },
                }}
              >
                <CloseIcon sx={{ fontSize: 16, color: '#71717A' }} />
              </Box>
            </Box>
          ) : (
            <>
              <CloudUploadIcon sx={{ fontSize: 40, color: isDragging ? '#a78bfa' : '#3F3F46', mb: 1.5 }} />
              <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: '0.875rem', mb: 0.5 }}>
                파일을 드래그하거나 클릭하여 선택
              </Typography>
              <Typography sx={{ color: '#52525B', fontSize: '0.75rem' }}>
                PDF, PNG, JPG/JPEG · 최대 {MAX_SIZE_MB}MB
              </Typography>
            </>
          )}
        </Box>
        {fileError && (
          <Typography sx={{ color: '#f87171', fontSize: '0.75rem', mb: 2, mt: -1 }}>{fileError}</Typography>
        )}

        {/* Metadata Form */}
        <Grid container spacing={2}>
          {/* 과목 */}
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth label="과목" placeholder="예: 수학, 영어, 국어"
              value={form.subject} onChange={handleFormChange('subject')}
              error={!!errors.subject} helperText={errors.subject}
              sx={inputSx}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          {/* 학년 */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth error={!!errors.grade} sx={inputSx}>
              <InputLabel shrink>학년</InputLabel>
              <Select
                value={form.grade} onChange={handleFormChange('grade')}
                label="학년" displayEmpty
                sx={{ color: form.grade ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)' }}
              >
                <MenuItem value="" disabled sx={{ color: '#52525B' }}>선택</MenuItem>
                {GRADE_OPTIONS.map(g => <MenuItem key={g} value={g} sx={{ bgcolor: '#18181B', color: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'rgba(167,139,250,0.08)' } }}>{g}</MenuItem>)}
              </Select>
              {errors.grade && <FormHelperText>{errors.grade}</FormHelperText>}
            </FormControl>
          </Grid>

          {/* 시험명 */}
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth label="시험명" placeholder="예: 2025년 3월 모의고사"
              value={form.examName} onChange={handleFormChange('examName')}
              error={!!errors.examName} helperText={errors.examName}
              sx={inputSx}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          {/* 시험 구분 */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth error={!!errors.examType} sx={inputSx}>
              <InputLabel shrink>시험 구분</InputLabel>
              <Select
                value={form.examType} onChange={handleFormChange('examType')}
                label="시험 구분" displayEmpty
                sx={{ color: form.examType ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)' }}
              >
                <MenuItem value="" disabled sx={{ color: '#52525B' }}>선택</MenuItem>
                {EXAM_TYPE_OPTIONS.map(t => <MenuItem key={t} value={t} sx={{ bgcolor: '#18181B', color: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'rgba(167,139,250,0.08)' } }}>{t}</MenuItem>)}
              </Select>
              {errors.examType && <FormHelperText>{errors.examType}</FormHelperText>}
            </FormControl>
          </Grid>

          {/* 시행 연도 */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth error={!!errors.year} sx={inputSx}>
              <InputLabel shrink>시행 연도</InputLabel>
              <Select
                value={form.year} onChange={handleFormChange('year')}
                label="시행 연도" displayEmpty
                sx={{ color: form.year ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)' }}
              >
                <MenuItem value="" disabled sx={{ color: '#52525B' }}>선택</MenuItem>
                {YEAR_OPTIONS.map(y => <MenuItem key={y} value={y} sx={{ bgcolor: '#18181B', color: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'rgba(167,139,250,0.08)' } }}>{y}</MenuItem>)}
              </Select>
              {errors.year && <FormHelperText>{errors.year}</FormHelperText>}
            </FormControl>
          </Grid>

          {/* 출처 */}
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth label="출처" placeholder="예: 한국교육과정평가원, 자체 출제"
              value={form.source} onChange={handleFormChange('source')}
              error={!!errors.source} helperText={errors.source}
              sx={inputSx}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          {/* 비고 */}
          <Grid item xs={12}>
            <TextField
              fullWidth label="비고 (선택)" placeholder="추가 메모를 입력하세요"
              value={form.note} onChange={handleFormChange('note')}
              multiline rows={2}
              sx={inputSx}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
        </Grid>

        {/* Upload Button */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2.5 }}>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={uploading}
            startIcon={uploading ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : <CloudUploadIcon />}
            sx={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%)' },
              '&:disabled': { background: 'rgba(167,139,250,0.3)', color: 'rgba(255,255,255,0.4)' },
              fontWeight: 600,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              borderRadius: 2,
              px: 3,
              py: 1,
              textTransform: 'none',
              fontSize: '0.875rem',
            }}
          >
            {uploading ? '업로드 중...' : '파일 업로드'}
          </Button>
        </Box>
      </Box>

      {/* History Section */}
      <Box sx={{ bgcolor: '#111115', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        {/* Section header */}
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: '0.9375rem' }}>
            업로드 이력
          </Typography>
          <Typography sx={{ color: '#52525B', fontSize: '0.75rem' }}>
            총 {history.length}건
          </Typography>
        </Box>

        {history.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Typography sx={{ color: '#52525B', fontSize: '0.875rem' }}>업로드된 파일이 없습니다.</Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['파일명', '과목', '학년', '시험명', '시험 구분', '시행 연도', '업로드 시각', '업로더', '상태'].map(h => (
                    <TableCell key={h} sx={{
                      bgcolor: '#18181B',
                      color: '#52525B',
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      py: 1.5, px: 2,
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((row, idx) => (
                  <TableRow key={row.id} sx={{
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
                    bgcolor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  }}>
                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.04)', py: 1.25, px: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <InsertDriveFileIcon sx={{ fontSize: 16, color: '#52525B', flexShrink: 0 }} />
                        <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8125rem', fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.fileName}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.04)', py: 1.25, px: 2, color: 'rgba(255,255,255,0.6)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{row.subject}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.04)', py: 1.25, px: 2, color: 'rgba(255,255,255,0.6)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{row.grade}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.04)', py: 1.25, px: 2, color: 'rgba(255,255,255,0.6)', fontSize: '0.8125rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.examName}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.04)', py: 1.25, px: 2, color: 'rgba(255,255,255,0.6)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{row.examType}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.04)', py: 1.25, px: 2, color: 'rgba(255,255,255,0.6)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{row.year}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.04)', py: 1.25, px: 2, color: '#52525B', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{row.uploadedAt}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.04)', py: 1.25, px: 2, color: '#52525B', fontSize: '0.75rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.uploader}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.04)', py: 1.25, px: 2, whiteSpace: 'nowrap' }}>
                      <StatusChip status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Box>
    </Box>
  );
}
