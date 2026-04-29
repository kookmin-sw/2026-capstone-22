import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  EventNote as EventNoteIcon,
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
  Save as SaveIcon,
  Edit as EditIcon,
  Close as CloseIcon,
  Groups as GroupsIcon,
  Person as PersonIcon,
  Add as AddIcon,
  TrendingUp as TrendingUpIcon,
  AccessTime as AccessTimeIcon,
  InfoOutlined as InfoIcon,
} from '@mui/icons-material';
import { attendanceAPI, studentAPI } from '../services/api';

// ── 상태 옵션 (내부 코드값 및 UI 레이블 정리) ───────────────────────────────────
export const STATUS_OPTIONS = [
  { value: 'present',     label: '출석', color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.3)'  },
  { value: 'absent',      label: '결석', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)'   },
  { value: 'late',        label: '지각', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)'  },
  { value: 'early_leave', label: '조퇴', color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.3)'  },
];

// 미입력 표시용 상수
const UNRECORDED_STYLE = { color: '#52525B', bg: 'transparent', border: 'rgba(255,255,255,0.08)' };

// ── 유틸 및 공통 스타일 ────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }

const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: 'rgba(255,255,255,0.03)',
    borderRadius: '10px',
    fontSize: '0.8125rem',
    color: '#FAFAFA',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
    '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' },
    '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
  },
  '& .MuiInputLabel-root': { color: '#71717A', fontSize: '0.8125rem' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
  '& .MuiInputAdornment-root .MuiSvgIcon-root': { color: '#52525B', fontSize: 18 },
};

const selectSx = {
  bgcolor: 'rgba(255,255,255,0.03)',
  borderRadius: '10px',
  fontSize: '0.8125rem',
  color: '#FAFAFA',
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.08)' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(167,139,250,0.3)' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a78bfa' },
  '& .MuiSvgIcon-root': { color: '#71717A' },
};

const menuProps = {
  PaperProps: {
    sx: {
      bgcolor: '#18181B',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px',
      '& .MuiMenuItem-root': {
        fontSize: '0.8125rem',
        color: '#A1A1AA',
        '&:hover': { bgcolor: 'rgba(167,139,250,0.08)', color: '#a78bfa' },
        '&.Mui-selected': { bgcolor: 'rgba(167,139,250,0.12)', color: '#a78bfa' },
      },
    },
  },
};

// ── StatusChip (버튼형 인터랙션) ────────────────────────────────────────────────
function StatusChip({ opt, active, onClick }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        px: 1.25, py: 0.35,
        borderRadius: '6px',
        fontSize: '0.75rem', fontWeight: 700,
        cursor: 'pointer', userSelect: 'none',
        transition: 'all 0.15s',
        bgcolor: active ? opt.bg : 'transparent',
        color: active ? opt.color : '#52525B',
        border: `1px solid ${active ? opt.border : 'rgba(255,255,255,0.08)'}`,
        '&:hover': { bgcolor: opt.bg, color: opt.color, border: `1px solid ${opt.border}` },
      }}
    >
      {opt.label}
    </Box>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
export default function AttendanceTab() {
  // ── 필터 및 데이터 상태 ─────────────────────────────────────────────────────
  const [filters, setFilters] = useState({
    date: todayStr(),
    classId: 'all',   // classId 기반 (number | 'all')
    name: '',
    status: 'all',
  });
  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));

  const [roster, setRoster] = useState([]);          // AttendanceRosterItem[]
  const [classes, setClasses] = useState([]);        // { id, name }[]
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveWarn, setSaveWarn] = useState(false);
  const [draft, setDraft] = useState({});            // { [student_id]: { status?, memo? } }

  // ── UI 제어 상태 ───────────────────────────────────────────────────────────
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [formDialog, setFormDialog] = useState(null);
  const [formData, setFormData] = useState({ student_id: '', status: 'present', memo: '' });
  const [saveSnack, setSaveSnack] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // ── 분반 목록 1회 로드 ─────────────────────────────────────────────────────
  useEffect(() => {
    studentAPI.listClasses({ status: 'active' })
      .then(res => setClasses(res.data))
      .catch(() => {});
  }, []);

  // ── Roster + Summary fetch ─────────────────────────────────────────────────
  const fetchRoster = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setDraft({});
    try {
      // 'unassigned'는 클라이언트 센티넬 — 서버에는 class_id 파라미터 없이 전체 요청 후 클라이언트 필터링
      const params = {
        attendance_date: filters.date,
        ...(typeof filters.classId === 'number' ? { class_id: filters.classId } : {}),
      };
      const rosterRes = await attendanceAPI.listRoster(params);
      setRoster(rosterRes.data);
    } catch {
      // 실패 시 stale roster 제거 — 잘못된 날짜로 저장되는 것 방지
      setRoster([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [filters.date, filters.classId]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  // ── 헬퍼: draft와 서버 상태 병합 ──────────────────────────────────────────
  const getMerged = useCallback((studentId) => {
    const serverItem = roster.find(r => r.student_id === studentId);
    const draftItem = draft[studentId];
    return {
      status: draftItem?.status !== undefined ? draftItem.status : (serverItem?.status ?? null),
      memo: draftItem?.memo !== undefined ? draftItem.memo : (serverItem?.memo ?? ''),
      record_id: serverItem?.record_id ?? null,
      updated_at: serverItem?.updated_at ?? null,
    };
  }, [roster, draft]);

  // ── 파생 연산 ──────────────────────────────────────────────────────────────
  const filteredRoster = useMemo(() => {
    return roster.filter(item => {
      // 'unassigned' 센티넬: 분반 없는 학생만 표시 (클라이언트 필터)
      if (filters.classId === 'unassigned' && item.class_id !== null) return false;
      if (filters.name && !item.student_name.includes(filters.name)) return false;
      if (filters.status !== 'all') {
        const draftItem = draft[item.student_id];
        const st = draftItem?.status !== undefined ? draftItem.status : item.status;
        if (st !== filters.status) return false;
      }
      return true;
    });
  }, [roster, filters.classId, filters.name, filters.status, draft]);

  // KPI 상단 카드용 집계 — 항상 roster + draft 기반 (draft 변경 즉시 반영, 우측 분반 요약과 동일 기준)
  const displayedSummary = useMemo(() => {
    // 'unassigned'는 클라이언트 필터 적용, 나머지는 server가 이미 scope에 맞는 roster를 반환
    const scopedRoster = filters.classId === 'unassigned'
      ? roster.filter(r => r.class_id === null)
      : roster;
    const counts = { present: 0, absent: 0, late: 0, early_leave: 0 };
    scopedRoster.forEach(item => {
      const draftItem = draft[item.student_id];
      const st = draftItem?.status !== undefined ? draftItem.status : item.status;
      if (st && counts[st] !== undefined) counts[st]++;
    });
    const recorded = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      ...counts,
      total_students: scopedRoster.length,
      unrecorded_count: scopedRoster.length - recorded,
    };
  }, [roster, draft, filters.classId]);

  const classSummary = useMemo(() => {
    const classMap = {};

    classes.forEach(c => {
      classMap[c.id] = {
        classId: c.id,
        className: c.name,
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        early_leave: 0,
      };
    });

    roster.forEach(item => {
      // class_id를 key로 사용 — 동명 분반 중복 방지
      const key = item.class_id ?? 'unassigned';
      if (!classMap[key]) {
        classMap[key] = {
          classId: item.class_id ?? 'unassigned', // null 대신 센티넬 사용
          className: item.class_name ?? '미배정',
          total: 0, present: 0, absent: 0, late: 0, early_leave: 0,
        };
      }
      classMap[key].total++;
      const draftItem = draft[item.student_id];
      const st = draftItem?.status !== undefined ? draftItem.status : item.status;
      if (st && classMap[key][st] !== undefined) classMap[key][st]++;
    });
    // 3. 필터 적용 및 정렬
    return Object.values(classMap)
      .filter(cs => {
        if (filters.classId === 'all') {
          // 'all'일 때는 'unassigned'는 학생이 있을 때만 표시
          if (cs.classId === 'unassigned') return cs.total > 0;

  const selectedStudent = selectedStudentId
    ? roster.find(r => r.student_id === selectedStudentId)
    : null;

  // ── 핸들러 ─────────────────────────────────────────────────────────────────
  const updateDraft = (studentId, patch) => {
    setDraft(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? {}), ...patch },
    }));
  };

  const handleStatusChange = (studentId, status) => updateDraft(studentId, { status });
  const handleMemoChange = (studentId, memo) => updateDraft(studentId, { memo });

  const handleMarkAllPresent = async () => {
    if (filters.classId === 'all') return;
    try {
      await attendanceAPI.initPresent({
        attendance_date: filters.date,
        class_id: filters.classId,
      });
      await fetchRoster();
    } catch {
      // 에러 처리
    }
  };

  const handleSaveAll = async () => {
    // 변경된 항목만 수집
    let skippedDueToNullStatus = 0;
    const changed = Object.entries(draft)
      .map(([studentIdStr, changes]) => {
        const studentId = parseInt(studentIdStr, 10);
        const serverItem = roster.find(r => r.student_id === studentId);
        const serverStatus = serverItem?.status ?? null;
        const serverMemo = serverItem?.memo ?? '';
        const hasChange =
          (changes.status !== undefined && changes.status !== serverStatus) ||
          (changes.memo !== undefined && changes.memo !== serverMemo);
        if (!hasChange) return null;

        const merged = getMerged(studentId);
        // 미입력(status=null) 학생에게 status 변경 없이 메모만 바뀐 경우 skip
        // — 상태 없이 메모만 저장하면 암묵적 present가 생성되므로 허용하지 않음
        if (merged.status === null) {
          skippedDueToNullStatus++;
          return null;
        }

        return { student_id: studentId, status: merged.status, memo: merged.memo || null };
      })
      .filter(Boolean);

    if (changed.length === 0) {
      // skip만 있고 저장할 항목이 없는 경우 — 경고 또는 no-op 피드백
      if (skippedDueToNullStatus > 0) {
        setSaveWarn(true);
        setTimeout(() => setSaveWarn(false), 3000);
      } else {
        setSaveSnack(true);
        setTimeout(() => setSaveSnack(false), 2500);
      }
      return;
    }

    setSaving(true);
    try {
      await attendanceAPI.bulkUpsert({ attendance_date: filters.date, records: changed });
      await fetchRoster();
      setSaveSnack(true);
      setTimeout(() => setSaveSnack(false), 2500);
      // 저장 성공했더라도 skip된 항목이 있으면 경고 함께 표시
      if (skippedDueToNullStatus > 0) {
        setSaveWarn(true);
        setTimeout(() => setSaveWarn(false), 3500);
      }
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const openForm = (mode, student = null) => {
    if (mode === 'edit' && student) {
      const merged = getMerged(student.student_id);
      setFormData({ student_id: student.student_id, status: merged.status ?? 'present', memo: merged.memo ?? '' });
      setFormDialog({ mode: 'edit', student });
    } else {
      setFormData({ student_id: '', status: 'present', memo: '' });
      setFormDialog({ mode: 'add', student: null });
    }
  };

  const handleFormSave = () => {
    const targetId = formDialog.mode === 'edit' ? formDialog.student.student_id : formData.student_id;
    if (!targetId) return;
    updateDraft(targetId, { status: formData.status, memo: formData.memo });
    setFormDialog(null);
  };

  const formatTime = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  // ── 렌더링 ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both' }}>

      {/* ── 1. 상단 요약 카드 (Dashboard Style) ── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {STATUS_OPTIONS.map(opt => (
          <Grid item xs={6} sm={3} key={opt.value}>
            <Box sx={{
              bgcolor: '#18181B', border: `1px solid ${opt.border}`,
              borderRadius: '16px', p: 3,
              cursor: 'pointer', position: 'relative', overflow: 'hidden',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': { bgcolor: opt.bg, transform: 'translateY(-4px)', boxShadow: `0 12px 24px -10px ${opt.border}` },
              ...(filters.status === opt.value && { bgcolor: opt.bg, border: `2px solid ${opt.color}` }),
            }}
              onClick={() => setFilter('status', filters.status === opt.value ? 'all' : opt.value)}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, color: opt.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {opt.label}
                </Typography>
                {opt.value === 'present' && <TrendingUpIcon sx={{ fontSize: 18, color: opt.color, opacity: 0.6 }} />}
                {opt.value === 'late' && <AccessTimeIcon sx={{ fontSize: 18, color: opt.color, opacity: 0.6 }} />}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography sx={{ fontSize: '2.25rem', fontWeight: 900, color: opt.color, lineHeight: 1 }}>
                  {displayedSummary?.[opt.value] ?? 0}
                </Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: '#52525B', fontWeight: 600 }}>
                  / {displayedSummary?.total_students ?? 0}명
                </Typography>
              </Box>
              {/* 장식용 배경 아이콘 */}
              <CheckCircleIcon sx={{ position: 'absolute', right: -10, bottom: -10, fontSize: 80, color: opt.color, opacity: 0.03 }} />
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* ── 2. 필터 섹션 ── */}
      <Box sx={{
        display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap', alignItems: 'center',
        p: 2.5, borderRadius: '16px',
        bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <TextField
          type="date" size="small" label="날짜 선택"
          value={filters.date}
          onChange={e => setFilter('date', e.target.value)}
          sx={{ ...inputSx, minWidth: 160 }}
          InputLabelProps={{ shrink: true }}
        />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={{ color: '#71717A', fontSize: '0.8125rem' }}>분반 필터</InputLabel>
          <Select
            value={filters.classId}
            onChange={e => setFilter('classId', e.target.value)}
            label="분반 필터"
            sx={selectSx}
            MenuProps={menuProps}
          >
            <MenuItem value="all">전체 분반</MenuItem>
            {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            <MenuItem value="unassigned">미배정</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small" label="학생명 검색" placeholder="이름을 입력하세요"
          value={filters.name}
          onChange={e => setFilter('name', e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
          sx={{ ...inputSx, minWidth: 180 }}
        />

        <Box sx={{ flex: 1 }} />

        {/* 메인 액션 버튼 그룹 */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            onClick={() => openForm('add')}
            sx={{
              borderColor: 'rgba(255,255,255,0.1)', color: '#A1A1AA',
              fontWeight: 600, fontSize: '0.8125rem', borderRadius: '10px',
              px: 2, py: 1, textTransform: 'none',
              '&:hover': { borderColor: 'rgba(255,255,255,0.2)', bgcolor: 'rgba(255,255,255,0.04)' },
            }}
          >
            출결 등록
          </Button>
          <Tooltip title={(filters.classId === 'all' || filters.classId === 'unassigned') ? '분반을 선택해야 사용할 수 있습니다' : ''} arrow>
            <span>
              <Button
                variant="outlined"
                startIcon={<CheckCircleIcon sx={{ fontSize: 18 }} />}
                onClick={handleMarkAllPresent}
                disabled={filters.classId === 'all' || filters.classId === 'unassigned'}
                sx={{
                  borderColor: 'rgba(167,139,250,0.3)', color: '#a78bfa',
                  fontWeight: 600, fontSize: '0.8125rem', borderRadius: '10px',
                  px: 2, py: 1, textTransform: 'none',
                  '&:hover': { borderColor: '#a78bfa', bgcolor: 'rgba(167,139,250,0.08)' },
                  '&.Mui-disabled': { borderColor: 'rgba(255,255,255,0.08)', color: '#3F3F46' },
                }}
              >
                전원 출석
              </Button>
            </span>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon sx={{ fontSize: 18 }} />}
            onClick={handleSaveAll}
            disabled={saving}
            sx={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              fontWeight: 700, fontSize: '0.8125rem', borderRadius: '10px',
              px: 2.5, py: 1, textTransform: 'none', transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(102,126,234,0.2)',
              '&:hover': {
                transform: 'translateY(-1px)',
                boxShadow: '0 6px 20px rgba(102,126,234,0.35)',
              },
            }}
          >
            일괄 저장
          </Button>
        </Box>
      </Box>

      {/* ── 3. 메인 레이아웃 (좌측 테이블 / 우측 패널) ── */}
      <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-start' }}>

        {/* ── 좌측: 출결 입력 테이블 ── */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', overflow: 'hidden' }}>
            {/* 테이블 헤더 */}
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: '1.8fr 0.8fr 2.2fr 1.8fr 0.8fr 48px',
              gap: 2, px: 3, py: 2,
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              bgcolor: 'rgba(255,255,255,0.02)',
            }}>
              {['학생명', '분반', '상태 (빠른 변경)', '메모', '수정일', ''].map((h, i) => (
                <Typography key={i} sx={{ fontSize: '0.75rem', fontWeight: 800, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {h}
                </Typography>
              ))}
            </Box>

            {/* 목록 영역 */}
            <Box sx={{ maxHeight: 'calc(100vh - 450px)', overflowY: 'auto' }}>
              {loading ? (
                <Box sx={{ py: 12, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress size={32} sx={{ color: '#a78bfa' }} />
                </Box>
              ) : filteredRoster.length === 0 ? (
                <Box sx={{ py: 12, textAlign: 'center' }}>
                  <EventNoteIcon sx={{ fontSize: 48, color: '#27272A', mb: 2 }} />
                  <Typography sx={{ color: '#71717A', fontSize: '0.9375rem', fontWeight: 500 }}>
                    선택한 조건에 맞는 학생이 없습니다
                  </Typography>
                </Box>
              ) : (
                filteredRoster.map((student, idx) => {
                  const merged = getMerged(student.student_id);
                  const currentStatus = merged.status; // null = 미입력
                  const isSelected = selectedStudentId === student.student_id;
                  return (
                    <Box
                      key={student.student_id}
                      onClick={() => setSelectedStudentId(isSelected ? null : student.student_id)}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '1.8fr 0.8fr 2.2fr 1.8fr 0.8fr 48px',
                        gap: 2, px: 3, py: 2,
                        alignItems: 'center',
                        borderBottom: idx < filteredRoster.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        borderLeft: isSelected ? '4px solid #a78bfa' : '4px solid transparent',
                        bgcolor: isSelected ? 'rgba(167,139,250,0.06)' : 'transparent',
                        '&:hover': { bgcolor: isSelected ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.02)' },
                      }}
                    >
                      {/* 학생명 */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{
                          width: 32, height: 32, borderRadius: '10px', flexShrink: 0,
                          background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.875rem', fontWeight: 800, color: '#fff',
                        }}>
                          {student.student_name[0]}
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: '#FAFAFA', lineHeight: 1.2 }}>
                            {student.student_name}
                          </Typography>
                          <Typography sx={{ fontSize: '0.75rem', color: '#71717A' }}>{student.school_name}</Typography>
                        </Box>
                      </Box>

                      {/* 분반 */}
                      <Typography sx={{ fontSize: '0.875rem', color: '#A1A1AA', fontWeight: 600 }}>
                        {student.class_name}
                      </Typography>

                      {/* 상태 버튼형 칩 — null이면 모두 비활성 */}
                      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                        {STATUS_OPTIONS.map(opt => (
                          <StatusChip
                            key={opt.value}
                            opt={opt}
                            active={currentStatus === opt.value}
                            onClick={() => handleStatusChange(student.student_id, opt.value)}
                          />
                        ))}
                      </Box>

                      {/* 메모 인라인 입력 */}
                      <TextField
                        size="small"
                        placeholder="메모 입력..."
                        value={merged.memo ?? ''}
                        onChange={e => handleMemoChange(student.student_id, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        autoComplete="off"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            bgcolor: 'rgba(255,255,255,0.02)',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            color: '#A1A1AA',
                            '& fieldset': { borderColor: 'rgba(255,255,255,0.06)' },
                            '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.2)' },
                            '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
                          },
                          '& .MuiOutlinedInput-input': { py: 0.75, px: 1.25 },
                        }}
                      />

                      {/* 수정일 */}
                      <Typography sx={{ fontSize: '0.75rem', color: merged.updated_at ? '#71717A' : '#3F3F46', fontWeight: 500 }}>
                        {formatTime(merged.updated_at)}
                      </Typography>

                      {/* 상세 편집 */}
                      <IconButton
                        size="small"
                        onClick={e => { e.stopPropagation(); openForm('edit', student); }}
                        sx={{
                          color: '#52525B', p: 0.75,
                          '&:hover': { color: '#a78bfa', bgcolor: 'rgba(167,139,250,0.1)' },
                        }}
                      >
                        <EditIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Box>
                  );
                })
              )}
            </Box>
          </Box>
        </Box>

        {/* ── 우측: 요약/상세 패널 ── */}
        <Box sx={{ width: 280, flexShrink: 0 }}>
          {selectedStudent ? (
            /* 선택 학생 상세 카드 */
            <Box sx={{
              bgcolor: '#18181B', border: '1px solid rgba(167,139,250,0.2)',
              borderRadius: '20px', p: 3, position: 'sticky', top: 20,
              boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
              animation: 'fadeIn 0.3s ease-out',
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PersonIcon sx={{ fontSize: 18, color: '#a78bfa' }} />
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 800, color: '#FAFAFA' }}>학생 프로필</Typography>
                </Box>
                <IconButton size="small" onClick={() => setSelectedStudentId(null)} sx={{ color: '#52525B', p: 0.5, '&:hover': { color: '#FAFAFA' } }}>
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>

              <Box sx={{ textAlign: 'center', mb: 3 }}>
                <Box sx={{
                  width: 56, height: 56, borderRadius: '16px', mx: 'auto', mb: 2,
                  background: 'linear-gradient(135deg, rgba(167,139,250,0.3) 0%, rgba(124,58,237,0.2) 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem', fontWeight: 900, color: '#c4b5fd',
                  border: '1px solid rgba(167,139,250,0.2)',
                }}>
                  {selectedStudent.student_name[0]}
                </Box>
                <Typography sx={{ fontSize: '1.125rem', fontWeight: 800, color: '#FAFAFA', mb: 0.5 }}>
                  {selectedStudent.student_name}
                </Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: '#71717A', fontWeight: 600 }}>
                  {selectedStudent.class_name} · {selectedStudent.grade}학년
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#52525B', mt: 0.5 }}>
                  {selectedStudent.school_name}
                </Typography>
              </Box>

              <Box sx={{ p: 2, borderRadius: '12px', bgcolor: 'rgba(255,255,255,0.03)', mb: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <EventNoteIcon sx={{ fontSize: 14 }} /> 현재 출결 상태
                </Typography>
                {(() => {
                  const merged = getMerged(selectedStudent.student_id);
                  const st = merged.status;
                  const opt = st ? STATUS_OPTIONS.find(o => o.value === st) : null;
                  return (
                    <Box>
                      {opt ? (
                        <Box sx={{
                          display: 'inline-flex', px: 2, py: 0.75, borderRadius: '8px',
                          bgcolor: opt.bg, border: `1px solid ${opt.border}`,
                          fontSize: '0.875rem', fontWeight: 800, color: opt.color, mb: 1.5,
                        }}>
                          {opt.label}
                        </Box>
                      ) : (
                        <Box sx={{
                          display: 'inline-flex', px: 2, py: 0.75, borderRadius: '8px',
                          bgcolor: UNRECORDED_STYLE.bg, border: `1px solid ${UNRECORDED_STYLE.border}`,
                          fontSize: '0.875rem', fontWeight: 800, color: UNRECORDED_STYLE.color, mb: 1.5,
                        }}>
                          미입력
                        </Box>
                      )}
                      {merged.memo && (
                        <Box sx={{ mt: 1 }}>
                          <Typography sx={{ fontSize: '0.7rem', color: '#52525B', mb: 0.5 }}>메모</Typography>
                          <Typography sx={{ fontSize: '0.8125rem', color: '#A1A1AA', fontStyle: 'italic', lineHeight: 1.4 }}>
                            "{merged.memo}"
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  );
                })()}
              </Box>

              <Button
                fullWidth
                variant="outlined"
                startIcon={<EditIcon sx={{ fontSize: 16 }} />}
                onClick={() => openForm('edit', selectedStudent)}
                sx={{
                  color: '#a78bfa', borderColor: 'rgba(167,139,250,0.3)',
                  borderRadius: '12px', py: 1.25, fontSize: '0.8125rem', fontWeight: 700,
                  textTransform: 'none',
                  '&:hover': { borderColor: '#a78bfa', bgcolor: 'rgba(167,139,250,0.08)' },
                }}
              >
                출결 정보 수정
              </Button>
            </Box>
          ) : (
            /* 분반별 요약 카드 */
            <Box sx={{ bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <GroupsIcon sx={{ fontSize: 18, color: '#a78bfa' }} />
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 800, color: '#FAFAFA' }}>분반별 출석 통계</Typography>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {classSummary.map(cs => (
                  <Box
                    key={cs.classId}
                    sx={{
                      p: 2, borderRadius: '14px',
                      bgcolor: filters.classId === cs.classId ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${filters.classId === cs.classId ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.05)'}`,
                      cursor: 'pointer', transition: 'all 0.2s',
                      '&:hover': { transform: 'scale(1.02)', bgcolor: 'rgba(255,255,255,0.04)' },
                    }}
                    onClick={() => setFilter('classId', filters.classId === cs.classId ? 'all' : cs.classId)}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                      <Typography sx={{ fontSize: '0.9375rem', fontWeight: 800, color: '#FAFAFA' }}>{cs.className}</Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 600 }}>총 {cs.total}명</Typography>
                    </Box>

                    {/* 출석 현황 인디케이터 */}
                    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                      {STATUS_OPTIONS.map(opt => (
                        <Tooltip key={opt.value} title={`${opt.label}: ${cs[opt.value]}명`} arrow>
                          <Box sx={{
                            flex: cs[opt.value] || 0.1,
                            height: 6,
                            bgcolor: opt.color,
                            borderRadius: '3px',
                            opacity: cs[opt.value] ? 1 : 0.1
                          }} />
                        </Tooltip>
                      ))}
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Typography sx={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 700 }}>출석 {cs.present}</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 700 }}>결석 {cs.absent}</Typography>
                      </Box>
                      <Typography sx={{ fontSize: '0.8125rem', color: '#FAFAFA', fontWeight: 900 }}>
                        {cs.total > 0 ? Math.round((cs.present / cs.total) * 100) : 0}%
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>

              <Box sx={{ mt: 3, p: 2, borderRadius: '12px', bgcolor: 'rgba(167,139,250,0.05)', border: '1px dashed rgba(167,139,250,0.2)' }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#a78bfa', lineHeight: 1.5, display: 'flex', gap: 0.5 }}>
                  <InfoIcon sx={{ fontSize: 14, mt: 0.2 }} />
                  분반 카드를 클릭하면 해당 분반 학생만 필터링하여 볼 수 있습니다.
                </Typography>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* ── 4. 등록/수정 다이얼로그 (통합 폼) ── */}
      <Dialog
        open={!!formDialog}
        onClose={() => setFormDialog(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#18181B',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#FAFAFA', fontWeight: 900, fontSize: '1.25rem', px: 4, pt: 4, pb: 2 }}>
          {formDialog?.mode === 'edit' ? '출결 정보 수정' : '새 출결 등록'}
          <IconButton onClick={() => setFormDialog(null)} sx={{ color: '#52525B', '&:hover': { color: '#FAFAFA' } }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ px: 4 }}>
          {/* 학생 선택/표시 */}
          <Box sx={{ mb: 3 }}>
            <Typography sx={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 800, mb: 1, textTransform: 'uppercase' }}>학생 정보</Typography>
            {formDialog?.mode === 'edit' ? (
              <Box sx={{ p: 2, borderRadius: '12px', bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#FAFAFA' }}>{formDialog.student?.student_name}</Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: '#71717A' }}>{formDialog.student?.class_name} · {formDialog.student?.school_name}</Typography>
              </Box>
            ) : (
              <FormControl fullWidth size="small" sx={selectSx}>
                <InputLabel sx={{ color: '#71717A' }}>학생을 선택하세요</InputLabel>
                <Select
                  value={formData.student_id}
                  onChange={e => setFormData(p => ({ ...p, student_id: e.target.value }))}
                  label="학생을 선택하세요"
                  MenuProps={menuProps}
                  sx={{ color: '#FAFAFA' }}
                >
                  {roster.map(s => <MenuItem key={s.student_id} value={s.student_id}>{s.student_name} ({s.class_name})</MenuItem>)}
                </Select>
              </FormControl>
            )}
          </Box>

          {/* 날짜 표시 */}
          <Box sx={{ mb: 3 }}>
            <Typography sx={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 800, mb: 1, textTransform: 'uppercase' }}>출결 일자</Typography>
            <Box sx={{ p: 2, borderRadius: '12px', bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 1 }}>
              <EventNoteIcon sx={{ fontSize: 18, color: '#a78bfa' }} />
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: '#FAFAFA' }}>{filters.date}</Typography>
            </Box>
          </Box>

          {/* 상태 선택 */}
          <Box sx={{ mb: 3 }}>
            <Typography sx={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 800, mb: 1.5, textTransform: 'uppercase' }}>출결 상태</Typography>
            <Grid container spacing={1}>
              {STATUS_OPTIONS.map(opt => (
                <Grid item xs={3} key={opt.value}>
                  <Box
                    onClick={() => setFormData(p => ({ ...p, status: opt.value }))}
                    sx={{
                      py: 1.5, textAlign: 'center', borderRadius: '12px', cursor: 'pointer',
                      transition: 'all 0.2s',
                      bgcolor: formData.status === opt.value ? opt.bg : 'transparent',
                      color: formData.status === opt.value ? opt.color : '#52525B',
                      border: `2px solid ${formData.status === opt.value ? opt.color : 'rgba(255,255,255,0.05)'}`,
                      '&:hover': { border: `2px solid ${opt.color}`, color: opt.color },
                    }}
                  >
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 800 }}>{opt.label}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Box>

          {/* 메모 입력 */}
          <Box sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 800, mb: 1, textTransform: 'uppercase' }}>비고 및 메모</Typography>
            <TextField
              fullWidth
              multiline
              rows={3}
              placeholder="특이사항을 입력하세요 (예: 질병 결석, 학부모 통화 완료 등)"
              value={formData.memo}
              onChange={e => setFormData(p => ({ ...p, memo: e.target.value }))}
              sx={{
                ...inputSx,
                '& .MuiOutlinedInput-root': { ...inputSx['& .MuiOutlinedInput-root'], p: 1.5 }
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 4, pb: 4, pt: 2, gap: 1.5 }}>
          <Button
            fullWidth
            onClick={() => setFormDialog(null)}
            sx={{ color: '#71717A', fontWeight: 700, fontSize: '0.9375rem', textTransform: 'none', py: 1.5 }}
          >
            취소
          </Button>
          <Button
            fullWidth
            variant="contained"
            onClick={handleFormSave}
            disabled={!formData.student_id && formDialog?.mode === 'add'}
            sx={{
              background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
              fontWeight: 800, fontSize: '0.9375rem', textTransform: 'none', py: 1.5, borderRadius: '12px',
              boxShadow: '0 8px 20px -6px rgba(124,58,237,0.5)',
              '&:hover': { opacity: 0.9 },
              '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.05)', color: '#3F3F46' }
            }}
          >
            {formDialog?.mode === 'edit' ? '수정 완료' : '등록하기'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── 5. 저장 완료 토스트 ── */}
      {saveSnack && (
        <Box sx={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999,
          bgcolor: '#14532d', border: '1px solid #22c55e',
          color: '#86efac', px: 4, py: 1.5, borderRadius: '14px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 1.5,
          animation: 'fadeUp 0.3s ease-out'
        }}>
          <CheckCircleIcon sx={{ fontSize: 20 }} />
          <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>출결 데이터가 안전하게 저장되었습니다</Typography>
        </Box>
      )}

      {/* ── 상태 미선택 경고 토스트 (성공 토스트 위에 표시) ── */}
      {saveWarn && (
        <Box sx={{
          position: 'fixed', bottom: saveSnack ? 96 : 32, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999,
          bgcolor: '#431407', border: '1px solid #f59e0b',
          color: '#fcd34d', px: 4, py: 1.5, borderRadius: '14px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 1.5,
          animation: 'fadeUp 0.3s ease-out'
        }}>
          <InfoIcon sx={{ fontSize: 20 }} />
          <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>상태를 먼저 선택해야 메모를 저장할 수 있습니다</Typography>
        </Box>
      )}

      {/* ── 조회 실패 토스트 ── */}
      {loadError && (
        <Box sx={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999,
          bgcolor: '#450a0a', border: '1px solid #ef4444',
          color: '#fca5a5', px: 4, py: 1.5, borderRadius: '14px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 1.5,
          animation: 'fadeUp 0.3s ease-out'
        }}>
          <CloseIcon sx={{ fontSize: 20 }} />
          <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>출결 데이터를 불러오지 못했습니다</Typography>
        </Box>
      )}

      {/* ── 저장 실패 토스트 ── */}
      {saveError && (
        <Box sx={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999,
          bgcolor: '#450a0a', border: '1px solid #ef4444',
          color: '#fca5a5', px: 4, py: 1.5, borderRadius: '14px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 1.5,
          animation: 'fadeUp 0.3s ease-out'
        }}>
          <CloseIcon sx={{ fontSize: 20 }} />
          <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>저장 중 오류가 발생했습니다</Typography>
        </Box>
      )}

      {/* ── 전역 애니메이션 정의 ── */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </Box>
  );
}
