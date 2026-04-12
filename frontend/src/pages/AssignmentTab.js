import React, { useState, useMemo, useEffect } from 'react';
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

// ── 상태 옵션 (과제 제출 상태) ──────────────────────────────────────────────────
export const SUBMISSION_STATUS = {
  assigned:  { label: '부여됨',   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)' },
  submitted: { label: '제출완료', color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.3)'  },
  late:      { label: '지각제출', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)'  },
  missing:   { label: '미제출',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)'   },
  exempt:    { label: '면제',     color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)' },
};

// ── 목데이터 ──────────────────────────────────────────────────────────────────
const DUMMY_CLASSES = [
  { id: 1, name: '심화수학 A반', subject: '수학' },
  { id: 2, name: '기초영어 B반', subject: '영어' },
  { id: 3, name: '통합과학 C반', subject: '과학' },
];

const DUMMY_STUDENTS = [
  { id: 1,  name: '김민준', class_id: 1, class_name: '심화수학 A반' },
  { id: 2,  name: '이서연', class_id: 1, class_name: '심화수학 A반' },
  { id: 3,  name: '박지호', class_id: 1, class_name: '심화수학 A반' },
  { id: 4,  name: '최유나', class_id: 1, class_name: '심화수학 A반' },
  { id: 5,  name: '정하은', class_id: 2, class_name: '기초영어 B반' },
  { id: 6,  name: '강서준', class_id: 2, class_name: '기초영어 B반' },
  { id: 7,  name: '윤채원', class_id: 2, class_name: '기초영어 B반' },
  { id: 8,  name: '한도현', class_id: 3, class_name: '통합과학 C반' },
  { id: 9,  name: '임소율', class_id: 3, class_name: '통합과학 C반' },
  { id: 10, name: '오재원', class_id: 3, class_name: '통합과학 C반' },
];

const DUMMY_ASSIGNMENTS = [
  { 
    id: 1, 
    title: '미분법 기초 학습지', 
    subject: '수학', 
    class_id: 1, 
    assigned_date: '2026-04-01', 
    due_date: '2026-04-08',
    description: '미분법 공식 암기 및 기본 문제 풀이',
    memo: '전원 필수 제출'
  },
  { 
    id: 2, 
    title: '적분 응용 심화 문제', 
    subject: '수학', 
    class_id: 1, 
    assigned_date: '2026-04-05', 
    due_date: '2026-04-12',
    description: '실생활 응용 문제 10선',
    memo: '지각 제출 시 감점'
  },
  { 
    id: 3, 
    title: 'English Essay: My Future', 
    subject: '영어', 
    class_id: 2, 
    assigned_date: '2026-04-02', 
    due_date: '2026-04-09',
    description: '최소 300단어 이상 에세이 작성',
    memo: ''
  },
  { 
    id: 4, 
    title: 'Voca Quiz: Unit 1-3', 
    subject: '영어', 
    class_id: 2, 
    assigned_date: '2026-04-10', 
    due_date: '2026-04-15',
    description: '단어 테스트 준비',
    memo: ''
  },
  { 
    id: 5, 
    title: '화학 반응의 법칙 보고서', 
    subject: '과학', 
    class_id: 3, 
    assigned_date: '2026-04-03', 
    due_date: '2026-04-10',
    description: '실험 결과 분석 및 고찰',
    memo: '사진 첨부 필수'
  },
  { 
    id: 6, 
    title: '물리: 운동 법칙 정리', 
    subject: '과학', 
    class_id: 3, 
    assigned_date: '2026-04-11', 
    due_date: '2026-04-18',
    description: '뉴턴의 운동 법칙 핵심 정리',
    memo: ''
  },
];

const DUMMY_SUBMISSIONS = [
  // Assignment 1 (Math A)
  { id: 1, assignment_id: 1, student_id: 1, status: 'submitted', submitted_at: '2026-04-07 14:00', score: 95, feedback: '잘 풀었습니다.', memo: '' },
  { id: 2, assignment_id: 1, student_id: 2, status: 'submitted', submitted_at: '2026-04-08 09:00', score: 88, feedback: '공식을 정확히 이해하고 있네요.', memo: '' },
  { id: 3, assignment_id: 1, student_id: 3, status: 'late', submitted_at: '2026-04-09 10:00', score: 70, feedback: '다음부턴 제시간에 제출하세요.', memo: '병원 방문으로 늦음' },
  { id: 4, assignment_id: 1, student_id: 4, status: 'missing', submitted_at: null, score: 0, feedback: '', memo: '' },
  // Assignment 2 (Math A)
  { id: 5, assignment_id: 2, student_id: 1, status: 'assigned', submitted_at: null, score: null, feedback: '', memo: '' },
  { id: 6, assignment_id: 2, student_id: 2, status: 'submitted', submitted_at: '2026-04-11 18:30', score: 92, feedback: '', memo: '' },
  // Assignment 3 (English B)
  { id: 7, assignment_id: 3, student_id: 5, status: 'submitted', submitted_at: '2026-04-08 22:00', score: 90, feedback: 'Good job!', memo: '' },
  { id: 8, assignment_id: 3, student_id: 6, status: 'exempt', submitted_at: null, score: null, feedback: '', memo: '대회 참가로 면제' },
  { id: 9, assignment_id: 3, student_id: 7, status: 'missing', submitted_at: null, score: 0, feedback: '', memo: '' },
  // Assignment 5 (Science C)
  { id: 10, assignment_id: 5, student_id: 8, status: 'submitted', submitted_at: '2026-04-09 15:00', score: 85, feedback: '', memo: '' },
  { id: 11, assignment_id: 5, student_id: 9, status: 'submitted', submitted_at: '2026-04-10 17:00', score: 78, feedback: '', memo: '' },
  { id: 12, assignment_id: 5, student_id: 10, status: 'late', submitted_at: '2026-04-11 11:00', score: 65, feedback: '', memo: '' },
];

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

// ── Status Chip ────────────────────────────────────────────────────────────────
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
  const [assignments, setAssignments] = useState(DUMMY_ASSIGNMENTS);
  const [submissions, setSubmissions] = useState(DUMMY_SUBMISSIONS);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);

  // 필터 상태
  const [filters, setFilters] = useState({
    class_id: 'all',
    student_name: '',
    status: 'all',
    subject: 'all',
    dateStart: '',
    dateEnd: '',
  });

  // 다이얼로그 상태
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState({
    title: '', subject: '', class_id: '', assigned_date: '', due_date: '', description: '', memo: ''
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState(null);

  const [snack, setSnack] = useState({ open: false, message: '' });

  // 요약 정보 계산
  const summary = useMemo(() => {
    const now = new Date().toISOString().slice(0, 10);
    const active = assignments.length;
    const dueToday = assignments.filter(a => a.due_date === now).length;
    const totalSubmissions = submissions.length;
    const missing = submissions.filter(s => s.status === 'missing').length;
    const late = submissions.filter(s => s.status === 'late').length;
    return { active, dueToday, missing, late };
  }, [assignments, submissions]);

  // 필터링된 과제 목록
  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
      if (filters.class_id !== 'all' && a.class_id !== Number(filters.class_id)) return false;
      if (filters.subject !== 'all' && a.subject !== filters.subject) return false;
      if (filters.dateStart && a.due_date < filters.dateStart) return false;
      if (filters.dateEnd && a.due_date > filters.dateEnd) return false;
      return true;
    });
  }, [assignments, filters]);

  const selectedAssignment = useMemo(() => 
    assignments.find(a => a.id === selectedAssignmentId), [assignments, selectedAssignmentId]
  );

  const submissionStats = useMemo(() => {
    const stats = {};
    assignments.forEach(a => {
      const classStudents = DUMMY_STUDENTS.filter(s => s.class_id === a.class_id);
      const assignmentSubmissions = submissions.filter(s => s.assignment_id === a.id);
      const submittedCount = assignmentSubmissions.filter(s => s.status === 'submitted' || s.status === 'late').length;
      stats[a.id] = {
        total: classStudents.length,
        submitted: submittedCount,
        rate: classStudents.length > 0 ? Math.round((submittedCount / classStudents.length) * 100) : 0
      };
    });
    return stats;
  }, [assignments, submissions]);

  // 과제별 학생 제출 현황
  const currentSubmissions = useMemo(() => {
    if (!selectedAssignmentId) return [];
    const assignment = assignments.find(a => a.id === selectedAssignmentId);
    if (!assignment) return [];

    const classStudents = DUMMY_STUDENTS.filter(s => s.class_id === assignment.class_id);
    return classStudents.map(student => {
      const sub = submissions.find(s => s.assignment_id === selectedAssignmentId && s.student_id === student.id);
      return {
        ...student,
        submission: sub || { status: 'assigned', submitted_at: null, score: null, feedback: '', memo: '' }
      };
    }).filter(item => {
      if (filters.student_name && !item.name.includes(filters.student_name)) return false;
      if (filters.status !== 'all' && item.submission.status !== filters.status) return false;
      return true;
    });
  }, [selectedAssignmentId, assignments, submissions, filters.student_name, filters.status]);

  // 핸들러들
  const handleOpenAddAssignment = () => {
    setEditingAssignment(null);
    setAssignmentForm({ title: '', subject: '', class_id: '', assigned_date: '', due_date: '', description: '', memo: '' });
    setAssignmentDialogOpen(true);
  };

  const handleOpenEditAssignment = (e, assignment) => {
    e.stopPropagation();
    setEditingAssignment(assignment);
    setAssignmentForm({ ...assignment });
    setAssignmentDialogOpen(true);
  };

  const handleSaveAssignment = () => {
    if (!assignmentForm.title || !assignmentForm.class_id) return;
    if (editingAssignment) {
      setAssignments(prev => prev.map(a => a.id === editingAssignment.id ? { ...a, ...assignmentForm } : a));
      showSnack('과제가 수정되었습니다.');
    } else {
      const newId = Math.max(...assignments.map(a => a.id), 0) + 1;
      setAssignments(prev => [...prev, { ...assignmentForm, id: newId }]);
      showSnack('과제가 추가되었습니다.');
    }
    setAssignmentDialogOpen(false);
  };

  const handleDeleteClick = (e, assignment) => {
    e.stopPropagation();
    setAssignmentToDelete(assignment);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    setAssignments(prev => prev.filter(a => a.id !== assignmentToDelete.id));
    setSubmissions(prev => prev.filter(s => s.assignment_id !== assignmentToDelete.id));
    if (selectedAssignmentId === assignmentToDelete.id) setSelectedAssignmentId(null);
    setDeleteConfirmOpen(false);
    showSnack('과제가 삭제되었습니다.');
  };

  const handleUpdateSubmission = (studentId, patch) => {
    setSubmissions(prev => {
      const idx = prev.findIndex(s => s.assignment_id === selectedAssignmentId && s.student_id === studentId);
      if (idx > -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...patch };
        return next;
      } else {
        return [...prev, { 
          id: Math.max(...prev.map(s => s.id), 0) + 1,
          assignment_id: selectedAssignmentId,
          student_id: studentId,
          ...patch
        }];
      }
    });
  };

  const handleBatchSave = () => {
    showSnack('학생별 제출 상태가 저장되었습니다.');
  };

  const showSnack = (message) => {
    setSnack({ open: true, message });
    setTimeout(() => setSnack({ open: false, message: '' }), 2500);
  };

  return (
    <Box sx={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both' }}>
      
      {/* ── 1. 상단 요약 카드 ── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: '진행중 과제', value: summary.active, color: '#a78bfa', icon: <AssignmentIcon /> },
          { label: '오늘 마감', value: summary.dueToday, color: '#f59e0b', icon: <CalendarIcon /> },
          { label: '미제출 건수', value: summary.missing, color: '#ef4444', icon: <TrendingUpIcon /> },
          { label: '지연 제출', value: summary.late, color: '#fb923c', icon: <AccessTimeIcon /> },
        ].map((item, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Box sx={{
              bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '16px', p: 3,
              display: 'flex', alignItems: 'center', gap: 2.5,
              transition: 'all 0.25s ease',
              '&:hover': { transform: 'translateY(-4px)', borderColor: 'rgba(255,255,255,0.12)' },
            }}>
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
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel sx={{ color: '#71717A', fontSize: '0.8125rem' }}>분반 선택</InputLabel>
          <Select 
            value={filters.class_id} 
            onChange={e => setFilters(p => ({ ...p, class_id: e.target.value }))} 
            label="분반 선택" sx={selectSx} MenuProps={menuProps}
          >
            <MenuItem value="all">전체 분반</MenuItem>
            {DUMMY_CLASSES.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={{ color: '#71717A', fontSize: '0.8125rem' }}>과목 선택</InputLabel>
          <Select 
            value={filters.subject} 
            onChange={e => setFilters(p => ({ ...p, subject: e.target.value }))} 
            label="과목 선택" sx={selectSx} MenuProps={menuProps}
          >
            <MenuItem value="all">전체 과목</MenuItem>
            <MenuItem value="수학">수학</MenuItem>
            <MenuItem value="영어">영어</MenuItem>
            <MenuItem value="과학">과학</MenuItem>
          </Select>
        </FormControl>

        <TextField
          type="date" size="small" label="시작일"
          value={filters.dateStart}
          onChange={e => setFilters(p => ({ ...p, dateStart: e.target.value }))}
          sx={{ ...inputSx, minWidth: 150 }}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          type="date" size="small" label="종료일"
          value={filters.dateEnd}
          onChange={e => setFilters(p => ({ ...p, dateEnd: e.target.value }))}
          sx={{ ...inputSx, minWidth: 150 }}
          InputLabelProps={{ shrink: true }}
        />

        <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.06)' }} />

        <TextField
          size="small" placeholder="학생명 검색"
          value={filters.student_name}
          onChange={e => setFilters(p => ({ ...p, student_name: e.target.value }))}
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
              <Typography sx={{ color: '#FAFAFA', fontWeight: 800, fontSize: '0.9375rem' }}>과제 목록</Typography>
            </Box>
            <Typography sx={{ color: '#71717A', fontSize: '0.75rem' }}>전체 {filteredAssignments.length}개</Typography>
          </Box>
          <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>과제명</TableCell>
                  <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>과목</TableCell>
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
                    <TableCell>{a.subject}</TableCell>
                    <TableCell>{DUMMY_CLASSES.find(c => c.id === a.class_id)?.name}</TableCell>
                    <TableCell>{a.assigned_date}</TableCell>
                    <TableCell sx={{ color: new Date(a.due_date) < new Date() ? '#ef4444 !important' : 'inherit' }}>{a.due_date}</TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                        <Box sx={{ flex: 1, minWidth: 60, height: 4, bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                          <Box sx={{ width: `${submissionStats[a.id]?.rate}%`, height: '100%', bgcolor: '#a78bfa', borderRadius: 2 }} />
                        </Box>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{submissionStats[a.id]?.rate}%</Typography>
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
                    {DUMMY_CLASSES.find(c => c.id === selectedAssignment.class_id)?.name} · 마감일: {selectedAssignment.due_date}
                  </Typography>
                )}
              </Box>
            </Box>
            {selectedAssignment && (
              <Button 
                variant="outlined" 
                startIcon={<SaveIcon />} 
                onClick={handleBatchSave}
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
                    <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>제출 상태</TableCell>
                    <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>제출 일시</TableCell>
                    <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>점수</TableCell>
                    <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>피드백 / 메모</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {currentSubmissions.map((item) => (
                    <TableRow key={item.id} sx={{ '& td': { borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#A1A1AA', py: 1.5 } }}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontSize: '0.8125rem', fontWeight: 800 }}>{item.name[0]}</Avatar>
                          <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#FAFAFA' }}>{item.name}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem' }}>{item.class_name}</TableCell>
                      <TableCell>
                        <Select 
                          value={item.submission.status} 
                          onChange={(e) => handleUpdateSubmission(item.id, { status: e.target.value })}
                          size="small"
                          sx={{ 
                            ...selectSx, minWidth: 100,
                            '& .MuiSelect-select': { py: 0.5, px: 1, fontSize: '0.75rem', fontWeight: 700 }
                          }}
                          MenuProps={menuProps}
                        >
                          {Object.entries(SUBMISSION_STATUS).map(([key, val]) => (
                            <MenuItem key={key} value={key} sx={{ fontSize: '0.75rem', fontWeight: 700, color: val.color }}>{val.label}</MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <TextField 
                          size="small" 
                          value={item.submission.submitted_at || ''} 
                          onChange={(e) => handleUpdateSubmission(item.id, { submitted_at: e.target.value })}
                          placeholder="YYYY-MM-DD HH:MM"
                          sx={{ 
                            '& .MuiOutlinedInput-root': { bgcolor: 'transparent', fontSize: '0.75rem' },
                            '& .MuiOutlinedInput-input': { p: 0.5 }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField 
                          size="small" 
                          type="number"
                          value={item.submission.score ?? ''} 
                          onChange={(e) => handleUpdateSubmission(item.id, { score: e.target.value === '' ? null : Number(e.target.value) })}
                          sx={{ 
                            width: 60,
                            '& .MuiOutlinedInput-root': { bgcolor: 'transparent', fontSize: '0.75rem' },
                            '& .MuiOutlinedInput-input': { p: 0.5, textAlign: 'center' }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField 
                          fullWidth
                          size="small" 
                          placeholder="피드백 입력..."
                          value={item.submission.feedback || ''} 
                          onChange={(e) => handleUpdateSubmission(item.id, { feedback: e.target.value })}
                          sx={{ 
                            '& .MuiOutlinedInput-root': { bgcolor: 'transparent', fontSize: '0.75rem' },
                            '& .MuiOutlinedInput-input': { p: 0.5 }
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
        <DialogContent sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField 
            label="과제명 *" fullWidth size="small" 
            value={assignmentForm.title} onChange={e => setAssignmentForm(p => ({ ...p, title: e.target.value }))}
            sx={inputSx} 
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ color: '#71717A' }}>과목</InputLabel>
              <Select 
                value={assignmentForm.subject} onChange={e => setAssignmentForm(p => ({ ...p, subject: e.target.value }))} 
                label="과목" sx={selectSx} MenuProps={menuProps}
              >
                <MenuItem value="수학">수학</MenuItem>
                <MenuItem value="영어">영어</MenuItem>
                <MenuItem value="과학">과학</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ color: '#71717A' }}>대상 분반 *</InputLabel>
              <Select 
                value={assignmentForm.class_id} onChange={e => setAssignmentForm(p => ({ ...p, class_id: e.target.value }))} 
                label="대상 분반 *" sx={selectSx} MenuProps={menuProps}
              >
                {DUMMY_CLASSES.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
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
