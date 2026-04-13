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
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Avatar,
  Divider,
} from '@mui/material';
import {
  Assignment as AssignmentIcon,
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
  Save as SaveIcon,
  Edit as EditIcon,
  DeleteOutline as DeleteIcon,
  Add as AddIcon,
  FilterList as FilterIcon,
  MoreVert as MoreVertIcon,
  TrendingUp as TrendingUpIcon,
  AccessTime as AccessTimeIcon,
  InfoOutlined as InfoIcon,
  Close as CloseIcon,
  People as PeopleIcon,
  School as SchoolIcon,
  CalendarMonth as CalendarIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';
import { assignmentAPI, studentAPI } from '../services/api';

// ── 표시용 상태 (5종, display_status 기준) ─────────────────────────────────────
export const SUBMISSION_STATUS = {
  assigned:  { label: '부여됨',   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)' },
  submitted: { label: '제출완료', color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.3)'  },
  late:      { label: '지각제출', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)'  },
  missing:   { label: '미제출',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)'   },
  excused:   { label: '면제',     color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)' },
};

// 편집 Select에 노출할 저장 가능 상태 3종
const EDITABLE_STATUSES = ['assigned', 'submitted', 'excused'];

// 드래프트 상태 기반 display_status 클라이언트 계산 (저장 전 미리보기용)
function computeDisplayStatus(status, submitted_at, due_date_str) {
  const today = new Date().toISOString().slice(0, 10);
  if (status === 'excused') return 'excused';
  if (status === 'submitted') {
    const sub_date = submitted_at ? submitted_at.slice(0, 10) : null;
    return sub_date && sub_date > due_date_str ? 'late' : 'submitted';
  }
  return today > due_date_str ? 'missing' : 'assigned';
}

// ── 공통 스타일 ──────────────────────────────────────────────────────────────
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

// ── Status Chip (display_status 기준) ─────────────────────────────────────────
function StatusChip({ status }) {
  const opt = SUBMISSION_STATUS[status] || SUBMISSION_STATUS.assigned;
  return (
    <Box sx={{
      display: 'inline-flex', px: 1.25, py: 0.35,
      borderRadius: '6px',
      fontSize: '0.75rem', fontWeight: 700,
      bgcolor: opt.bg, color: opt.color,
      border: `1px solid ${opt.border}`,
    }}>
      {opt.label}
    </Box>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
export default function AssignmentTab() {
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [summaryStats, setSummaryStats] = useState({
    ongoing_count: 0, due_today_count: 0, missing_count: 0, late_count: 0,
  });
  const [draftSubmissions, setDraftSubmissions] = useState({});
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);

  // 과제 목록 필터 (API 파라미터)
  const [assignmentFilters, setAssignmentFilters] = useState({
    class_id: 'all', dateStart: '', dateEnd: '',
  });
  // 과제명 검색 (클라이언트 사이드)
  const [assignmentSearch, setAssignmentSearch] = useState('');
  // 요약 카드 퀵 필터 (UI 전용)
  const [quickFilter, setQuickFilter] = useState('all');
  // 제출 roster 필터 (API 파라미터)
  const [submissionFilters, setSubmissionFilters] = useState({
    student_name: '', display_status: 'all',
  });

  // 다이얼로그 상태
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState({
    title: '', class_id: '', assigned_date: '', due_date: '', description: '', memo: '',
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState(null);
  const [snack, setSnack] = useState({ open: false, message: '' });

  // ── API 파라미터 빌더 ──
  const buildAssignmentParams = useCallback((filters) => {
    const params = {};
    if (filters.class_id !== 'all') params.class_id = filters.class_id;
    if (filters.dateStart) params.due_date_from = filters.dateStart;
    if (filters.dateEnd) params.due_date_to = filters.dateEnd;
    return params;
  }, []);

  const buildSubmissionParams = useCallback((filters) => {
    const params = {};
    if (filters.student_name) params.student_name = filters.student_name;
    if (filters.display_status !== 'all') params.display_status = filters.display_status;
    return params;
  }, []);

  // ── 데이터 로딩 ──
  const loadClasses = useCallback(async () => {
    try {
      const res = await studentAPI.listClasses();
      setClasses(res.data);
    } catch (e) {}
  }, []);

  const loadAssignments = useCallback(async (filters) => {
    try {
      const res = await assignmentAPI.list(buildAssignmentParams(filters));
      setAssignments(res.data);
    } catch (e) {}
  }, [buildAssignmentParams]);

  const loadSummary = useCallback(async (filters) => {
    try {
      const res = await assignmentAPI.getSummary(buildAssignmentParams(filters));
      setSummaryStats(res.data);
    } catch (e) {}
  }, [buildAssignmentParams]);

  const loadSubmissions = useCallback(async (id, filters) => {
    try {
      const res = await assignmentAPI.listSubmissions(id, buildSubmissionParams(filters));
      setSubmissions(res.data);
    } catch (e) {
      setSubmissions([]); // 실패 시 stale 데이터 방지
    }
  }, [buildSubmissionParams]);

  // ── Effects ──
  useEffect(() => {
    loadClasses();
    loadAssignments(assignmentFilters);
    loadSummary(assignmentFilters);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const refresh = async () => {
      await loadAssignments(assignmentFilters);
      await loadSummary(assignmentFilters);
    };
    refresh();
  }, [assignmentFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  // 필터 변경 후 선택된 과제가 목록에서 사라지면 선택 해제 (0건 포함)
  useEffect(() => {
    if (selectedAssignmentId) {
      const stillVisible = assignments.some(a => a.id === selectedAssignmentId);
      if (!stillVisible) setSelectedAssignmentId(null);
    }
  }, [assignments, selectedAssignmentId]);

  useEffect(() => {
    setDraftSubmissions({});
    setSubmissions([]); // 과제 전환 즉시 초기화 — stale row 방지
    if (selectedAssignmentId) loadSubmissions(selectedAssignmentId, submissionFilters);
  }, [selectedAssignmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedAssignmentId) loadSubmissions(selectedAssignmentId, submissionFilters);
  }, [submissionFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 클라이언트 사이드 필터링 (과제 목록 — 과제명 검색 + 퀵 필터) ──
  // missing/late는 submission-level 집계라 assignment list 필터 불가 — ongoing/dueToday만 적용
  const filteredAssignments = useMemo(() => {
    const now = new Date().toISOString().slice(0, 10);
    return assignments.filter(a => {
      if (quickFilter === 'ongoing' && a.due_date < now) return false;
      if (quickFilter === 'dueToday' && a.due_date !== now) return false;
      if (assignmentSearch && !a.title.toLowerCase().includes(assignmentSearch.toLowerCase())) return false;
      return true;
    });
  }, [assignments, assignmentSearch, quickFilter]);

  const selectedAssignment = useMemo(() =>
    assignments.find(a => a.id === selectedAssignmentId), [assignments, selectedAssignmentId]);

  // 드래프트 반영된 제출 목록
  const currentSubmissions = useMemo(() => {
    return submissions.map(item => {
      const draft = draftSubmissions[item.student_id];
      if (!draft) return item;
      const mergedStatus = draft.status ?? item.status;
      const mergedSubmittedAt = draft.submitted_at !== undefined ? draft.submitted_at : item.submitted_at;
      const mergedDisplayStatus = computeDisplayStatus(
        mergedStatus, mergedSubmittedAt, selectedAssignment?.due_date
      );
      return { ...item, ...draft, status: mergedStatus, display_status: mergedDisplayStatus };
    });
  }, [submissions, draftSubmissions, selectedAssignment]);

  // ── 핸들러 ──
  const handleOpenAddAssignment = () => {
    setEditingAssignment(null);
    setAssignmentForm({ title: '', class_id: '', assigned_date: '', due_date: '', description: '', memo: '' });
    setAssignmentDialogOpen(true);
  };

  const handleOpenEditAssignment = (e, assignment) => {
    e.stopPropagation();
    setEditingAssignment(assignment);
    setAssignmentForm({
      title: assignment.title,
      class_id: assignment.class_id,
      assigned_date: assignment.assigned_date,
      due_date: assignment.due_date,
      description: assignment.description || '',
      memo: assignment.memo || '',
    });
    setAssignmentDialogOpen(true);
  };

  const handleSaveAssignment = async () => {
    if (!assignmentForm.title || !assignmentForm.class_id || !assignmentForm.assigned_date || !assignmentForm.due_date) {
      showSnack('과제명, 대상 분반, 부여일, 마감일은 필수 항목입니다.');
      return;
    }
    try {
      if (editingAssignment) {
        const { class_id, ...updatePayload } = assignmentForm;
        await assignmentAPI.update(editingAssignment.id, updatePayload);
        showSnack('과제가 수정되었습니다.');
      } else {
        await assignmentAPI.create(assignmentForm);
        showSnack('과제가 추가되었습니다.');
      }
      setAssignmentDialogOpen(false);
      await loadAssignments(assignmentFilters);
      await loadSummary(assignmentFilters);
    } catch (e) {
      showSnack('저장에 실패했습니다.');
    }
  };

  const handleDeleteClick = (e, assignment) => {
    e.stopPropagation();
    setAssignmentToDelete(assignment);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      await assignmentAPI.remove(assignmentToDelete.id);
      if (selectedAssignmentId === assignmentToDelete.id) setSelectedAssignmentId(null);
      setDeleteConfirmOpen(false);
      showSnack('과제가 삭제되었습니다.');
      await loadAssignments(assignmentFilters);
      await loadSummary(assignmentFilters);
    } catch (e) {
      showSnack('삭제에 실패했습니다.');
    }
  };

  const handleUpdateSubmission = (studentId, patch) => {
    const updated = { ...patch };
    if (patch.status) {
      if (patch.status !== 'submitted') {
        // submitted 외 상태로 변경 시 submitted_at 초기화
        updated.submitted_at = null;
      } else {
        // submitted로 변경 시 submitted_at이 비어있으면 오늘 날짜 자동 채움
        const currentDraft = draftSubmissions[studentId] || {};
        const currentItem = submissions.find(s => s.student_id === studentId);
        const existing = currentDraft.submitted_at !== undefined
          ? currentDraft.submitted_at
          : currentItem?.submitted_at;
        if (!existing) {
          updated.submitted_at = new Date().toISOString().slice(0, 10);
        }
      }
    }
    setDraftSubmissions(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), ...updated },
    }));
  };

  const handleBatchSave = async () => {
    const records = Object.entries(draftSubmissions).map(([studentIdStr, patch]) => {
      const item = submissions.find(s => s.student_id === Number(studentIdStr));
      const status = patch.status ?? item?.status ?? 'assigned';
      const submitted_at_raw = patch.submitted_at !== undefined ? patch.submitted_at : item?.submitted_at;
      // 날짜 문자열(YYYY-MM-DD)을 ISO datetime으로 변환
      const submitted_at = submitted_at_raw
        ? (submitted_at_raw.length === 10 ? `${submitted_at_raw}T00:00:00Z` : submitted_at_raw)
        : null;
      return {
        student_id: Number(studentIdStr),
        status,
        submitted_at: status === 'submitted' ? submitted_at : null,
        score: patch.score !== undefined ? patch.score : item?.score,
        feedback: patch.feedback !== undefined ? patch.feedback : item?.feedback,
        memo: patch.memo !== undefined ? patch.memo : item?.memo,
      };
    });
    if (records.length === 0) return;
    // 저장 전 검증: submitted 상태인데 submitted_at 없으면 차단
    const missingDate = records.filter(r => r.status === 'submitted' && !r.submitted_at);
    if (missingDate.length > 0) {
      showSnack('제출완료 상태는 제출 일시가 필요합니다.');
      return;
    }
    try {
      await assignmentAPI.bulkUpsertSubmissions(selectedAssignmentId, { records });
      setDraftSubmissions({});
      showSnack('학생별 제출 상태가 저장되었습니다.');
      await loadSubmissions(selectedAssignmentId, submissionFilters);
      await loadSummary(assignmentFilters);
    } catch (e) {
      showSnack('저장에 실패했습니다.');
    }
  };

  const showSnack = (message) => {
    setSnack({ open: true, message });
    setTimeout(() => setSnack({ open: false, message: '' }), 2500);
  };

  const handleQuickFilter = (type) => {
    setQuickFilter(prev => prev === type ? 'all' : type);
  };

  return (
    <Box sx={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both' }}>

      {/* ── 1. 상단 요약 카드 ── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { id: 'ongoing',  label: '진행중 과제', value: summaryStats.ongoing_count,   color: '#a78bfa', icon: <AssignmentIcon />, filterable: true },
          { id: 'dueToday', label: '오늘 마감',   value: summaryStats.due_today_count, color: '#f59e0b', icon: <CalendarIcon />,   filterable: true },
          { id: 'missing',  label: '미제출 건수', value: summaryStats.missing_count,   color: '#ef4444', icon: <TrendingUpIcon />, filterable: false },
          { id: 'late',     label: '지연 제출',   value: summaryStats.late_count,      color: '#fb923c', icon: <AccessTimeIcon />, filterable: false },
        ].map((item, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Box
              onClick={() => item.filterable && handleQuickFilter(item.id)}
              sx={{
                bgcolor: (item.filterable && quickFilter === item.id) ? `${item.color}08` : '#18181B',
                border: (item.filterable && quickFilter === item.id)
                  ? `2px solid ${item.color}`
                  : '1px solid rgba(255,255,255,0.06)',
                borderRadius: '16px', p: 3,
                display: 'flex', alignItems: 'center', gap: 2.5,
                transition: 'all 0.25s ease',
                cursor: item.filterable ? 'pointer' : 'default',
                '&:hover': item.filterable ? { transform: 'translateY(-4px)', borderColor: item.color } : {},
              }}
            >
              <Box sx={{
                width: 48, height: 48, borderRadius: '12px',
                bgcolor: `${item.color}15`, color: item.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {React.cloneElement(item.icon, { sx: { fontSize: 24 } })}
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.8125rem', color: '#71717A', fontWeight: 600, mb: 0.5 }}>
                  {item.label}
                </Typography>
                <Typography sx={{ fontSize: '1.75rem', fontWeight: 900, color: '#FAFAFA', lineHeight: 1 }}>
                  {item.value}
                </Typography>
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* ── 2. 필터 섹션 ── */}
      <Box sx={{
        bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px',
        p: 2.5, mb: 3, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center'
      }}>
        {/* 과제 목록 필터 */}
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel sx={{ color: '#71717A', fontSize: '0.8125rem' }}>분반 선택</InputLabel>
          <Select
            value={assignmentFilters.class_id}
            onChange={e => setAssignmentFilters(p => ({ ...p, class_id: e.target.value }))}
            label="분반 선택" sx={selectSx} MenuProps={menuProps}
          >
            <MenuItem value="all">전체 분반</MenuItem>
            {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>

        <TextField
          type="date" size="small" label="마감일 시작"
          value={assignmentFilters.dateStart}
          onChange={e => setAssignmentFilters(p => ({ ...p, dateStart: e.target.value }))}
          sx={{ ...inputSx, minWidth: 140 }}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          type="date" size="small" label="마감일 종료"
          value={assignmentFilters.dateEnd}
          onChange={e => setAssignmentFilters(p => ({ ...p, dateEnd: e.target.value }))}
          sx={{ ...inputSx, minWidth: 140 }}
          InputLabelProps={{ shrink: true }}
        />

        <TextField
          size="small" placeholder="과제명 검색"
          value={assignmentSearch}
          onChange={e => setAssignmentSearch(e.target.value)}
          InputProps={{ startAdornment: <SearchIcon sx={{ color: '#52525B', fontSize: 18, mr: 1 }} /> }}
          sx={{ ...inputSx, minWidth: 180 }}
        />

        <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.06)' }} />

        {/* 제출 roster 필터 */}
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel sx={{ color: '#71717A', fontSize: '0.8125rem' }}>제출 상태</InputLabel>
          <Select
            value={submissionFilters.display_status}
            onChange={e => setSubmissionFilters(p => ({ ...p, display_status: e.target.value }))}
            label="제출 상태" sx={selectSx} MenuProps={menuProps}
          >
            <MenuItem value="all">전체</MenuItem>
            {Object.entries(SUBMISSION_STATUS).map(([key, val]) => (
              <MenuItem key={key} value={key}>{val.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small" placeholder="학생명 검색"
          value={submissionFilters.student_name}
          onChange={e => setSubmissionFilters(p => ({ ...p, student_name: e.target.value }))}
          InputProps={{ startAdornment: <SearchIcon sx={{ color: '#52525B', fontSize: 18, mr: 1 }} /> }}
          sx={{ ...inputSx, minWidth: 180 }}
        />

        <Box sx={{ flex: 1 }} />

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenAddAssignment}
          sx={{
            background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
            fontWeight: 700, borderRadius: '10px', px: 2.5, py: 1, textTransform: 'none',
            '&:hover': { opacity: 0.9 }
          }}
        >
          과제 추가
        </Button>
      </Box>

      {/* ── 3. 메인 레이아웃 (2단 구조) ── */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

        {/* 상단: 과제 목록 테이블 */}
        <Box sx={{ bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', overflow: 'hidden' }}>
          <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AssignmentIcon sx={{ color: '#a78bfa', fontSize: 20 }} />
              <Typography sx={{ color: '#FAFAFA', fontWeight: 800, fontSize: '0.9375rem' }}>
                과제 목록 {
                  quickFilter === 'ongoing' ? '(진행중)' :
                  quickFilter === 'dueToday' ? '(오늘 마감)' : ''
                }
              </Typography>
            </Box>
            <Typography sx={{ color: '#71717A', fontSize: '0.75rem' }}>전체 {filteredAssignments.length}개</Typography>
          </Box>
          <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>과제명</TableCell>
                  <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>대상 분반</TableCell>
                  <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>부여일</TableCell>
                  <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>마감일</TableCell>
                  <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }} align="center">제출률</TableCell>
                  <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }} align="right">액션</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredAssignments.map((a) => (
                  <TableRow
                    key={a.id}
                    hover
                    onClick={() => setSelectedAssignmentId(a.id)}
                    sx={{
                      cursor: 'pointer',
                      bgcolor: selectedAssignmentId === a.id ? 'rgba(167,139,250,0.06)' : 'transparent',
                      '& td': { borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#A1A1AA' },
                      '&:hover td': { bgcolor: selectedAssignmentId === a.id ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.02)' }
                    }}
                  >
                    <TableCell sx={{ fontWeight: 700, color: '#FAFAFA !important' }}>{a.title}</TableCell>
                    <TableCell>{a.class_name}</TableCell>
                    <TableCell>{a.assigned_date}</TableCell>
                    <TableCell sx={{ color: new Date(a.due_date) < new Date() ? '#ef4444 !important' : 'inherit' }}>{a.due_date}</TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                        <Box sx={{ flex: 1, minWidth: 60, height: 4, bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                          <Box sx={{ width: `${a.submission_rate}%`, height: '100%', bgcolor: '#a78bfa', borderRadius: 2 }} />
                        </Box>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{a.submission_rate}%</Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right" onClick={e => e.stopPropagation()}>
                      <IconButton size="small" onClick={(e) => handleOpenEditAssignment(e, a)} sx={{ color: '#52525B', '&:hover': { color: '#a78bfa' } }}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={(e) => handleDeleteClick(e, a)} sx={{ color: '#52525B', '&:hover': { color: '#ef4444' } }}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Box>

        {/* 하단: 학생별 제출 상태 */}
        <Box sx={{ bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', overflow: 'hidden' }}>
          <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <PeopleIcon sx={{ color: '#a78bfa', fontSize: 20 }} />
              <Box>
                <Typography sx={{ color: '#FAFAFA', fontWeight: 800, fontSize: '0.9375rem' }}>
                  학생별 제출 상태 {selectedAssignment ? `[${selectedAssignment.title}]` : ''}
                </Typography>
                {selectedAssignment && (
                  <Typography sx={{ color: '#71717A', fontSize: '0.75rem' }}>
                    {selectedAssignment.class_name} · 마감일: {selectedAssignment.due_date}
                  </Typography>
                )}
              </Box>
            </Box>
            {selectedAssignment && (
              <Button
                variant="outlined"
                startIcon={<SaveIcon />}
                onClick={handleBatchSave}
                disabled={Object.keys(draftSubmissions).length === 0}
                sx={{
                  borderColor: 'rgba(167,139,250,0.3)', color: '#a78bfa',
                  fontWeight: 700, borderRadius: '10px', textTransform: 'none',
                  '&:hover': { borderColor: '#a78bfa', bgcolor: 'rgba(167,139,250,0.08)' }
                }}
              >
                일괄 저장
              </Button>
            )}
          </Box>
          <Box sx={{ minHeight: 400 }}>
            {!selectedAssignmentId ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 15 }}>
                <InfoIcon sx={{ fontSize: 48, color: '#27272A', mb: 2 }} />
                <Typography sx={{ color: '#71717A', fontSize: '0.9375rem', fontWeight: 500 }}>
                  상단 목록에서 과제를 선택해주세요
                </Typography>
              </Box>
            ) : currentSubmissions.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 15 }}>
                <SearchIcon sx={{ fontSize: 48, color: '#27272A', mb: 2 }} />
                <Typography sx={{ color: '#71717A', fontSize: '0.9375rem', fontWeight: 500 }}>
                  조건에 맞는 학생이 없습니다
                </Typography>
              </Box>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>학생명</TableCell>
                    <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>분반</TableCell>
                    <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>표시 상태</TableCell>
                    <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>저장 상태</TableCell>
                    <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>제출 일시</TableCell>
                    <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>점수</TableCell>
                    <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>피드백</TableCell>
                    <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>메모</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {currentSubmissions.map((item) => (
                    <TableRow key={item.student_id} sx={{ '& td': { borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#A1A1AA', py: 1.5 } }}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontSize: '0.8125rem', fontWeight: 800 }}>{item.student_name[0]}</Avatar>
                          <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#FAFAFA' }}>{item.student_name}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem' }}>{item.class_name}</TableCell>
                      {/* 표시 상태: display_status 기반 배지 */}
                      <TableCell>
                        <StatusChip status={item.display_status} />
                      </TableCell>
                      {/* 저장 상태: 3종만 선택 가능한 편집 Select */}
                      <TableCell>
                        <Select
                          value={item.status || 'assigned'}
                          onChange={(e) => handleUpdateSubmission(item.student_id, { status: e.target.value })}
                          size="small"
                          sx={{
                            ...selectSx, minWidth: 100,
                            '& .MuiSelect-select': { py: 0.5, px: 1, fontSize: '0.75rem', fontWeight: 700 }
                          }}
                          MenuProps={menuProps}
                        >
                          {EDITABLE_STATUSES.map(key => (
                            <MenuItem key={key} value={key} sx={{ fontSize: '0.75rem', fontWeight: 700, color: SUBMISSION_STATUS[key].color }}>
                              {SUBMISSION_STATUS[key].label}
                            </MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          type="date"
                          value={item.submitted_at ? item.submitted_at.slice(0, 10) : ''}
                          onChange={(e) => handleUpdateSubmission(item.student_id, { submitted_at: e.target.value || null })}
                          disabled={item.status !== 'submitted'}
                          InputLabelProps={{ shrink: true }}
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              bgcolor: 'rgba(255,255,255,0.02)',
                              fontSize: '0.75rem',
                              color: '#FAFAFA',
                              '& fieldset': { borderColor: 'rgba(255,255,255,0.05)' },
                            },
                            '& .MuiOutlinedInput-input': { p: 0.5, colorScheme: 'dark' }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          type="number"
                          value={item.score ?? ''}
                          onChange={(e) => handleUpdateSubmission(item.student_id, { score: e.target.value === '' ? null : Number(e.target.value) })}
                          sx={{
                            width: 50,
                            '& .MuiOutlinedInput-root': {
                              bgcolor: 'rgba(255,255,255,0.02)',
                              fontSize: '0.75rem',
                              color: '#a78bfa',
                              fontWeight: 700,
                              '& fieldset': { borderColor: 'rgba(255,255,255,0.05)' },
                            },
                            '& .MuiOutlinedInput-input': { p: 0.5, textAlign: 'center' }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          placeholder="피드백..."
                          value={item.feedback || ''}
                          onChange={(e) => handleUpdateSubmission(item.student_id, { feedback: e.target.value })}
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              bgcolor: 'rgba(255,255,255,0.02)',
                              fontSize: '0.75rem',
                              color: '#FAFAFA',
                              '& fieldset': { borderColor: 'rgba(255,255,255,0.05)' },
                            },
                            '& .MuiOutlinedInput-input': {
                              p: 0.5,
                              '&::placeholder': { color: 'rgba(255,255,255,0.3)', opacity: 1 }
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          placeholder="메모..."
                          value={item.memo || ''}
                          onChange={(e) => handleUpdateSubmission(item.student_id, { memo: e.target.value })}
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              bgcolor: 'rgba(255,255,255,0.02)',
                              fontSize: '0.75rem',
                              color: '#FAFAFA',
                              '& fieldset': { borderColor: 'rgba(255,255,255,0.05)' },
                            },
                            '& .MuiOutlinedInput-input': {
                              p: 0.5,
                              '&::placeholder': { color: 'rgba(255,255,255,0.3)', opacity: 1 }
                            }
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
        </Box>
      </Box>

      {/* ── 과제 추가/수정 다이얼로그 ── */}
      <Dialog
        open={assignmentDialogOpen}
        onClose={() => setAssignmentDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px' } }}
      >
        <DialogTitle sx={{ color: '#FAFAFA', fontWeight: 900, pb: 1, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {editingAssignment ? '과제 정보 수정' : '새 과제 등록'}
        </DialogTitle>
        <DialogContent
          sx={{
            pt: 6,
            pb: 1,
            overflow: 'visible',
            display: 'flex',
            flexDirection: 'column',
            gap: 2.5,
          }}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
            <TextField
              label="과제명 *" fullWidth size="small"
              value={assignmentForm.title}
              onChange={e => setAssignmentForm(p => ({ ...p, title: e.target.value }))}
              sx={inputSx}
            />
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ color: '#71717A' }}>대상 분반 *</InputLabel>
              <Select
                value={assignmentForm.class_id}
                onChange={e => setAssignmentForm(p => ({ ...p, class_id: e.target.value }))}
                label="대상 분반 *" sx={selectSx} MenuProps={menuProps}
                disabled={!!editingAssignment}
              >
                {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label="부여일" type="date" size="small" fullWidth
              value={assignmentForm.assigned_date} onChange={e => setAssignmentForm(p => ({ ...p, assigned_date: e.target.value }))}
              InputLabelProps={{ shrink: true }} sx={inputSx}
            />
            <TextField
              label="마감일" type="date" size="small" fullWidth
              value={assignmentForm.due_date} onChange={e => setAssignmentForm(p => ({ ...p, due_date: e.target.value }))}
              InputLabelProps={{ shrink: true }} sx={inputSx}
            />
          </Box>
          <TextField
            label="설명" multiline rows={3} fullWidth size="small"
            value={assignmentForm.description} onChange={e => setAssignmentForm(p => ({ ...p, description: e.target.value }))}
            sx={inputSx}
          />
          <TextField
            label="메모" size="small" fullWidth
            value={assignmentForm.memo} onChange={e => setAssignmentForm(p => ({ ...p, memo: e.target.value }))}
            sx={inputSx}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={() => setAssignmentDialogOpen(false)} sx={{ color: '#71717A', fontWeight: 700, textTransform: 'none' }}>취소</Button>
          <Button
            variant="contained" onClick={handleSaveAssignment}
            sx={{
              background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
              fontWeight: 800, borderRadius: '10px', px: 3, textTransform: 'none'
            }}
          >
            저장하기
          </Button>
        </DialogActions>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        PaperProps={{ sx: { bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px' } }}
      >
        <DialogTitle sx={{ color: '#FAFAFA', fontWeight: 800 }}>과제 삭제</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#A1A1AA', fontSize: '0.875rem' }}>
            정말로 이 과제를 삭제하시겠습니까? 관련 제출 데이터도 함께 삭제됩니다.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ color: '#71717A', textTransform: 'none' }}>취소</Button>
          <Button
            onClick={handleConfirmDelete}
            sx={{ bgcolor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 700, px: 2, '&:hover': { bgcolor: 'rgba(239,68,68,0.2)' } }}
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>

      {/* 스낵바 토스트 */}
      {snack.open && (
        <Box sx={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, bgcolor: '#14532d', border: '1px solid #22c55e', color: '#86efac',
          px: 4, py: 1.5, borderRadius: '14px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 1.5, animation: 'fadeUp 0.3s ease-out'
        }}>
          <CheckCircleIcon sx={{ fontSize: 20 }} />
          <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>{snack.message}</Typography>
        </Box>
      )}

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </Box>
  );
}
