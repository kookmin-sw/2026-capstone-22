import React, { useState, useMemo, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Select, MenuItem, FormControl,
  InputLabel, Grid, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Tooltip, Avatar, Divider, Table, TableBody, TableCell,
  TableHead, TableRow, Paper, Chip, Autocomplete
} from '@mui/material';
import {
  Assignment as ExamIcon, Search as SearchIcon, CheckCircle as CheckCircleIcon,
  Save as SaveIcon, Edit as EditIcon, DeleteOutline as DeleteIcon,
  Add as AddIcon, TrendingUp as TrendingUpIcon, TrendingDown as TrendingDownIcon,
  BarChart as BarChartIcon, Close as CloseIcon, EmojiEvents as TrophyIcon,
  EventNote as EventNoteIcon, School as SchoolIcon, Groups as GroupsIcon,
  InfoOutlined as InfoIcon, HelpOutline as HelpIcon
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';

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

const DUMMY_EXAMS = [
  { id: 1, title: '4월 중간고사 대비 모의고사', subject: '수학', date: '2026-04-01', class_id: 1, max_score: 100, type: '정기', memo: '기출 변형 문항 포함' },
  { id: 2, title: '단원 테스트: 미분과 적분', subject: '수학', date: '2026-04-05', class_id: 1, max_score: 50, type: '단원', memo: '' },
  { id: 3, title: '영어 단어 경시대회', subject: '영어', date: '2026-04-02', class_id: 2, max_score: 100, type: '이벤트', memo: '전체 분반 공통' },
  { id: 4, title: '기초 영문법 확인 테스트', subject: '영어', date: '2026-04-10', class_id: 2, max_score: 40, type: '단원', memo: '' },
  { id: 5, title: '화학 반응의 법칙 보고서', subject: '과학', date: '2026-04-03', class_id: 3, max_score: 100, type: '단원', memo: '' },
  { id: 6, title: '전국 연합 모의고사(3월)', subject: '수학', date: '2026-03-25', class_id: 1, max_score: 100, type: '외부', memo: '비교 데이터용' },
];

const DUMMY_RESULTS = [
  { id: 1, exam_id: 1, student_id: 1, score: 95, grade: '1', comment: '우수한 성적입니다.', updated_at: '2026-04-02' },
  { id: 2, exam_id: 1, student_id: 2, score: 88, grade: '2', comment: '실수 보완 필요.', updated_at: '2026-04-02' },
  { id: 3, exam_id: 1, student_id: 3, score: 72, grade: '3', comment: '기본기 복습 요망.', updated_at: '2026-04-02' },
  { id: 4, exam_id: 1, student_id: 4, score: 84, grade: '2', comment: '지난 시험 대비 상승.', updated_at: '2026-04-02' },
  { id: 100, exam_id: 6, student_id: 1, score: 92, grade: '1', comment: '', updated_at: '2026-03-26' },
  { id: 101, exam_id: 6, student_id: 2, score: 90, grade: '1', comment: '', updated_at: '2026-03-26' },
];

// ── 공통 스타일 ──────────────────────────────────────────────────────────────
const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: 'rgba(255,255,255,0.03)', borderRadius: '10px', fontSize: '0.8125rem', color: '#FAFAFA',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
    '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' },
    '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
  },
  '& .MuiInputLabel-root': { color: '#71717A', fontSize: '0.8125rem' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
};

const selectSx = {
  bgcolor: 'rgba(255,255,255,0.03)', borderRadius: '10px', fontSize: '0.8125rem', color: '#FAFAFA',
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.08)' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(167,139,250,0.3)' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a78bfa' },
  '& .MuiSvgIcon-root': { color: '#71717A' },
};

const menuProps = {
  PaperProps: {
    sx: {
      bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
      '& .MuiMenuItem-root': {
        fontSize: '0.8125rem', color: '#A1A1AA',
        '&:hover': { bgcolor: 'rgba(167,139,250,0.08)', color: '#a78bfa' },
        '&.Mui-selected': { bgcolor: 'rgba(167,139,250,0.12)', color: '#a78bfa' },
      },
    },
  },
};

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
export default function ExamTab() {
  const [exams, setExams] = useState(DUMMY_EXAMS);
  const [results, setResults] = useState(DUMMY_RESULTS);
  const [draftResults, setDraftResults] = useState({}); // { [student_id]: patch } — 저장 전 임시값
  const [selectedExamId, setSelectedExamId] = useState(null);

  // 필터 상태
  const [filters, setFilters] = useState({
    class_id: 'all', 
    student_name: '', 
    subject: 'all', 
    exam_title: '',
    exam_date: '',
    showDeclinersOnly: false,
    showRecentOnly: false,
  });

  // 다이얼로그 상태
  const [examDialogOpen, setExamDialogOpen] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [examForm, setExamForm] = useState({ title: '', subject: '', date: '', class_id: '', max_score: 100, type: '정기', memo: '' });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [examToDelete, setExamToDelete] = useState(null);
  const [snack, setSnack] = useState({ open: false, message: '' });

  // 시험 선택 변경 시 draft 초기화
  useEffect(() => {
    setDraftResults({});
  }, [selectedExamId]);

  // "최근 30일" 기준 계산
  const today = useMemo(() => new Date(), []);
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return d;
  }, [today]);

  const filteredExams = useMemo(() => {
    return exams.filter(e => {
      if (filters.class_id !== 'all' && e.class_id !== Number(filters.class_id)) return false;
      if (filters.subject !== 'all' && e.subject !== filters.subject) return false;
      if (filters.exam_title && !e.title.toLowerCase().includes(filters.exam_title.toLowerCase())) return false;
      if (filters.exam_date && e.date !== filters.exam_date) return false;
      
      if (filters.showRecentOnly) {
        const examDate = new Date(e.date);
        if (examDate < thirtyDaysAgo || examDate > today) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [exams, filters, thirtyDaysAgo, today]);

  const selectedExam = useMemo(() => exams.find(e => e.id === selectedExamId), [exams, selectedExamId]);

  // 통계 및 하락 학생 계산
  const stats = useMemo(() => {
    const res = results.filter(r => r.exam_id === selectedExamId);
    if (!selectedExam || res.length === 0) return { avg: 0, max: 0, min: 0, count: 0, decliners: 0, distribution: [], declinerIds: [] };
    
    const scores = res.map(r => r.score);
    const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    const max = Math.max(...scores);
    
    const dist = Array(10).fill(0);
    scores.forEach(s => {
      const idx = Math.min(Math.floor(s / 10), 9);
      dist[idx]++;
    });
    const distribution = dist.map((count, i) => ({ range: `${i * 10}-${(i + 1) * 10}`, count }));
    // 성적 하락 학생 판별 (동일 과목 + 동일 시험 유형의 직전 시험 대비)
    // 중요: 시험마다 만점이 다를 수 있으므로 '백분율 점수(원점수/만점)' 기준으로 비교
    const declinerIds = [];
    res.forEach(r => {
      const prevExam = exams
        .filter(e => 
          e.subject === selectedExam.subject && 
          e.type === selectedExam.type && 
          e.class_id === selectedExam.class_id && 
          new Date(e.date) < new Date(selectedExam.date)
        )
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      
      if (prevExam) {
        const prevResult = results.find(pr => pr.exam_id === prevExam.id && pr.student_id === r.student_id);
        if (prevResult) {
          const currentPercentage = r.score / selectedExam.max_score;
          const prevPercentage = prevResult.score / prevExam.max_score;
          
          if (currentPercentage < prevPercentage) {
            declinerIds.push(r.student_id);
          }
        }
      }
    });

    return { avg, max, count: res.length, decliners: declinerIds.length, distribution, declinerIds };
  }, [results, selectedExamId, selectedExam, exams]);

  const summary = useMemo(() => {
    const recentCount = exams.filter(e => {
      const d = new Date(e.date);
      return d >= thirtyDaysAgo && d <= today;
    }).length;
    return { recentCount, avg: stats.avg, max: stats.max, decliners: stats.decliners };
  }, [exams, stats, thirtyDaysAgo, today]);

  const currentResults = useMemo(() => {
    if (!selectedExamId) return [];
    const classStudents = DUMMY_STUDENTS.filter(s => s.class_id === selectedExam?.class_id);
    return classStudents.map(student => {
      const res = results.find(r => r.exam_id === selectedExamId && r.student_id === student.id);
      const base = res || { score: null, grade: null, comment: '', updated_at: '' };
      const draft = draftResults[student.id];
      return { ...student, result: draft ? { ...base, ...draft } : base };
    }).filter(item => {
      if (filters.student_name && !item.name.includes(filters.student_name)) return false;
      if (filters.showDeclinersOnly && !stats.declinerIds.includes(item.id)) return false;
      return true;
    });
  }, [selectedExamId, selectedExam, results, draftResults, filters.student_name, filters.showDeclinersOnly, stats.declinerIds]);

  // 핸들러
  const handleSaveExam = () => {
    if (editingExam) setExams(prev => prev.map(e => e.id === editingExam.id ? { ...e, ...examForm } : e));
    else setExams(prev => [...prev, { ...examForm, id: Math.max(...prev.map(ex => ex.id), 0) + 1 }]);
    setExamDialogOpen(false);
    showSnack('시험 정보가 저장되었습니다.');
  };
  
  const updateResult = (studentId, patch) => {
    // draft에만 반영 — 저장 버튼 클릭 시 results에 커밋
    setDraftResults(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), ...patch },
    }));
  };

  const showSnack = (message) => { setSnack({ open: true, message }); setTimeout(() => setSnack({ open: false, message: '' }), 2500); };

  return (
    <Box sx={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both' }}>
      
      {/* ── 1. 상단 요약 카드 ── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { 
            label: '최근 30일 시험 수', value: summary.recentCount, color: '#a78bfa', icon: <ExamIcon />, 
            clickable: true, active: filters.showRecentOnly, onClick: () => setFilters(p => ({ ...p, showRecentOnly: !p.showRecentOnly }))
          },
          { label: '선택 시험 평균', value: summary.avg, color: '#4ade80', icon: <TrendingUpIcon />, clickable: false },
          { label: '선택 시험 최고점', value: summary.max, color: '#f59e0b', icon: <TrophyIcon />, clickable: false },
          { 
            label: '성적 하락 학생', value: summary.decliners, color: '#ef4444', icon: <TrendingDownIcon />, 
            clickable: !!selectedExamId && summary.decliners > 0, 
            active: filters.showDeclinersOnly, 
            onClick: () => summary.decliners > 0 && setFilters(p => ({ ...p, showDeclinersOnly: !p.showDeclinersOnly }))
          },
        ].map((item, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Box 
              onClick={item.onClick} 
              sx={{
                bgcolor: '#18181B', 
                border: item.active ? `2px solid ${item.color}` : '1px solid rgba(255,255,255,0.06)', 
                borderRadius: '16px', p: 3,
                display: 'flex', alignItems: 'center', gap: 2.5, 
                transition: 'all 0.2s',
                cursor: item.clickable ? 'pointer' : 'default',
                bgcolor: item.active ? `${item.color}08` : '#18181B',
                '&:hover': item.clickable ? { transform: 'translateY(-4px)', borderColor: item.color } : {}
              }}>
              <Box sx={{ width: 48, height: 48, borderRadius: '12px', bgcolor: `${item.color}15`, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {React.cloneElement(item.icon, { sx: { fontSize: 24 } })}
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.8125rem', color: '#71717A', fontWeight: 600, mb: 0.5 }}>{item.label}</Typography>
                <Typography sx={{ fontSize: '1.75rem', fontWeight: 900, color: '#FAFAFA', lineHeight: 1 }}>{item.value || '-'}</Typography>
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* ── 2. 필터 섹션 ── */}
      <Box sx={{ bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', p: 2.5, mb: 3, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel sx={{ color: '#71717A' }}>분반 선택</InputLabel>
          <Select value={filters.class_id} onChange={e => setFilters(p => ({ ...p, class_id: e.target.value }))} label="분반 선택" sx={selectSx} MenuProps={menuProps}>
            <MenuItem value="all">전체 분반</MenuItem>
            {DUMMY_CLASSES.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={{ color: '#71717A' }}>과목 선택</InputLabel>
          <Select value={filters.subject} onChange={e => setFilters(p => ({ ...p, subject: e.target.value }))} label="과목 선택" sx={selectSx} MenuProps={menuProps}>
            <MenuItem value="all">전체 과목</MenuItem>
            <MenuItem value="수학">수학</MenuItem><MenuItem value="영어">영어</MenuItem><MenuItem value="과학">과학</MenuItem>
          </Select>
        </FormControl>

        <TextField type="date" size="small" label="시험일" value={filters.exam_date} onChange={e => setFilters(p => ({ ...p, exam_date: e.target.value }))} sx={{ ...inputSx, minWidth: 140 }} InputLabelProps={{ shrink: true }} />

        <TextField size="small" placeholder="시험명 검색" value={filters.exam_title} onChange={e => setFilters(p => ({ ...p, exam_title: e.target.value }))} InputProps={{ startAdornment: <SearchIcon sx={{ color: '#52525B', fontSize: 18, mr: 1 }} /> }} sx={{ ...inputSx, minWidth: 180 }} />
        
        <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.06)' }} />
        
        <TextField size="small" placeholder="학생명 검색" value={filters.student_name} onChange={e => setFilters(p => ({ ...p, student_name: e.target.value }))} InputProps={{ startAdornment: <SearchIcon sx={{ color: '#52525B', fontSize: 18, mr: 1 }} /> }} sx={{ ...inputSx, minWidth: 180 }} />
        
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditingExam(null); setExamForm({ title: '', subject: '', date: '', class_id: '', max_score: 100, type: '정기', memo: '' }); setExamDialogOpen(true); }} sx={{ background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', fontWeight: 700, borderRadius: '10px', px: 2.5, py: 1, textTransform: 'none', '&:hover': { opacity: 0.9 } }}>시험 추가</Button>
      </Box>

      {/* ── 3. 메인 레이아웃 ── */}
      <Grid container spacing={3}>
        <Grid item xs={12} lg={9}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Paper sx={{ bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', overflow: 'hidden' }}>
              <Box sx={{ px: 3, py: 2, bgcolor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EventNoteIcon sx={{ color: '#a78bfa', fontSize: 20 }} />
                  <Typography sx={{ color: '#FAFAFA', fontWeight: 800, fontSize: '0.9375rem' }}>
                    {filters.showRecentOnly ? '최근 30일 시험 목록' : '시험 목록'}
                  </Typography>
                </Box>
                <Typography sx={{ color: '#71717A', fontSize: '0.75rem' }}>전체 {filteredExams.length}개</Typography>
              </Box>
              <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>시험명</TableCell>
                      <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>과목 / 유형</TableCell>
                      <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>시험일</TableCell>
                      <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>대상 분반</TableCell>
                      <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }} align="center">만점/평균</TableCell>
                      <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }} align="right">액션</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredExams.map(e => (
                      <TableRow key={e.id} hover onClick={() => { setSelectedExamId(e.id); setFilters(p => ({ ...p, showDeclinersOnly: false })); }} sx={{ cursor: 'pointer', bgcolor: selectedExamId === e.id ? 'rgba(167,139,250,0.06)' : 'transparent', '& td': { borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#A1A1AA' } }}>
                        <TableCell sx={{ fontWeight: 700, color: '#FAFAFA !important' }}>{e.title}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                            <Chip label={e.subject} size="small" sx={{ height: 20, fontSize: '0.65rem', bgcolor: 'rgba(255,255,255,0.05)', color: '#FAFAFA', border: '1px solid rgba(255,255,255,0.1)' }} />
                            <Chip label={e.type || '일반'} size="small" sx={{ height: 20, fontSize: '0.65rem', bgcolor: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)' }} />
                          </Box>
                        </TableCell>
                        <TableCell>{e.date}</TableCell>
                        <TableCell>{DUMMY_CLASSES.find(c => c.id === e.class_id)?.name}</TableCell>
                        <TableCell align="center"><Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, color: '#FAFAFA' }}>{e.max_score} / {selectedExamId === e.id ? stats.avg : '-'}</Typography></TableCell>
                        <TableCell align="right" onClick={ev => ev.stopPropagation()}>
                          <IconButton size="small" onClick={(ev) => { setEditingExam(e); setExamForm({...e}); setExamDialogOpen(true); }} sx={{ color: '#52525B', '&:hover': { color: '#a78bfa' } }}><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" onClick={(ev) => { setExamToDelete(e); setDeleteConfirmOpen(true); }} sx={{ color: '#52525B', '&:hover': { color: '#ef4444' } }}><DeleteIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Paper>

            <Paper sx={{ bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', overflow: 'hidden' }}>
              <Box sx={{ px: 3, py: 2, bgcolor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SchoolIcon sx={{ color: '#a78bfa', fontSize: 20 }} />
                  <Typography sx={{ color: '#FAFAFA', fontWeight: 800, fontSize: '0.9375rem' }}>
                    학생별 시험 결과 {selectedExam ? `[${selectedExam.title}]` : ''} 
                    {filters.showDeclinersOnly && <Typography component="span" sx={{ color: '#ef4444', ml: 1, fontSize: '0.8125rem', fontWeight: 700 }}>(성적 하락 학생 필터링됨)</Typography>}
                  </Typography>
                </Box>
                {selectedExam && <Button variant="outlined" startIcon={<SaveIcon />} onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  setResults(prev => {
                    let next = [...prev];
                    Object.entries(draftResults).forEach(([studentIdStr, patch]) => {
                      const studentId = Number(studentIdStr);
                      const idx = next.findIndex(r => r.exam_id === selectedExamId && r.student_id === studentId);
                      if (idx > -1) {
                        next = next.map((r, i) => i === idx ? { ...r, ...patch, updated_at: today } : r);
                      } else {
                        next = [...next, { id: Date.now(), exam_id: selectedExamId, student_id: studentId, ...patch, updated_at: today }];
                      }
                    });
                    return next;
                  });
                  setDraftResults({});
                  showSnack('성적이 저장되었습니다.');
                }} sx={{ borderColor: 'rgba(167,139,250,0.3)', color: '#a78bfa', fontWeight: 700, borderRadius: '10px', textTransform: 'none', '&:hover': { borderColor: '#a78bfa', bgcolor: 'rgba(167,139,250,0.08)' } }}>결과 저장</Button>}
              </Box>
              <Box sx={{ minHeight: 400 }}>
                {!selectedExamId ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 15 }}><InfoIcon sx={{ fontSize: 48, color: '#27272A', mb: 2 }} /><Typography sx={{ color: '#71717A', fontSize: '0.9375rem', fontWeight: 500 }}>시험을 선택해주세요</Typography></Box>
                ) : currentResults.length === 0 ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 15 }}><SearchIcon sx={{ fontSize: 48, color: '#27272A', mb: 2 }} /><Typography sx={{ color: '#71717A', fontSize: '0.9375rem', fontWeight: 500 }}>조건에 맞는 학생이 없습니다</Typography></Box>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>학생명</TableCell>
                        <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>분반</TableCell>
                        <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>점수 / {selectedExam.max_score}</TableCell>
                        <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>등급</TableCell>
                        <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>코멘트</TableCell>
                        <TableCell sx={{ bgcolor: '#111113', color: '#71717A', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>수정일</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {currentResults.map(item => (
                        <TableRow key={item.id} sx={{ '& td': { borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#A1A1AA', py: 1.5 } }}>
                          <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontSize: '0.8125rem', fontWeight: 800 }}>{item.name[0]}</Avatar><Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#FAFAFA' }}>{item.name}</Typography></Box></TableCell>
                          <TableCell sx={{ fontSize: '0.8125rem' }}>{item.class_name}</TableCell>
                          <TableCell><TextField size="small" type="number" value={item.result.score ?? ''} onChange={ev => updateResult(item.id, { score: ev.target.value === '' ? null : Number(ev.target.value) })} sx={{ width: 80, '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', fontSize: '0.8125rem', color: '#a78bfa', fontWeight: 700, '& fieldset': { borderColor: 'rgba(255,255,255,0.05)' } }, '& .MuiOutlinedInput-input': { p: 0.5, textAlign: 'center' } }} /></TableCell>
                          <TableCell><Select value={item.result.grade} onChange={ev => updateResult(item.id, { grade: ev.target.value })} size="small" sx={{ ...selectSx, minWidth: 60, '& .MuiSelect-select': { py: 0.5, px: 1, fontSize: '0.75rem', fontWeight: 700 } }} MenuProps={menuProps}>{['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(g => <MenuItem key={g} value={g}>{g}등급</MenuItem>)}</Select></TableCell>
                          <TableCell><TextField fullWidth size="small" value={item.result.comment} onChange={ev => updateResult(item.id, { comment: ev.target.value })} placeholder="피드백 입력..." sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', fontSize: '0.8125rem', color: '#FAFAFA', '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } } }} /></TableCell>
                          <TableCell sx={{ fontSize: '0.75rem' }}>{item.result.updated_at || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Box>
            </Paper>
          </Box>
        </Grid>

        <Grid item xs={12} lg={3}>
          <Box sx={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Paper sx={{ bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BarChartIcon sx={{ color: '#a78bfa', fontSize: 20 }} />
                  <Typography sx={{ color: '#FAFAFA', fontWeight: 800, fontSize: '0.875rem' }}>분석 요약</Typography>
                </Box>
                <Tooltip title="성적 하락 기준: 동일 학생/과목/시험유형의 직전 시험 대비 백분율(원점수/만점) 하락">
                  <HelpIcon sx={{ color: '#52525B', fontSize: 16, cursor: 'help' }} />
                </Tooltip>
              </Box>
              {selectedExamId ? (
                <>
                  <Box sx={{ height: 160, width: '100%', mb: 3 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.distribution} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                        <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#71717A' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#71717A' }} axisLine={false} tickLine={false} />
                        <RechartsTooltip contentStyle={{ bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} itemStyle={{ fontSize: '10px' }} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {stats.distribution.map((entry, index) => (<Cell key={`cell-${index}`} fill={index > 7 ? '#a78bfa' : index > 4 ? '#6366f1' : '#3f3f46'} />))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', mb: 3 }} />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography sx={{ color: '#71717A', fontSize: '0.8125rem' }}>시험 평균</Typography><Typography sx={{ color: '#a78bfa', fontWeight: 800 }}>{stats.avg}점</Typography></Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography sx={{ color: '#71717A', fontSize: '0.8125rem' }}>최고 점수</Typography><Typography sx={{ color: '#f59e0b', fontWeight: 800 }}>{stats.max}점</Typography></Box>
                  </Box>
                  <Box sx={{ mt: 3, p: 2, borderRadius: '12px', bgcolor: stats.decliners > 0 ? 'rgba(239,68,68,0.05)' : 'rgba(74,222,128,0.05)', border: `1px dashed ${stats.decliners > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(74,222,128,0.2)'}`, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {stats.decliners > 0 ? (
                      <>
                        <TrendingDownIcon sx={{ color: '#ef4444', fontSize: 18 }} />
                        <Typography sx={{ color: '#fca5a5', fontSize: '0.75rem', fontWeight: 600, lineHeight: 1.4 }}>전회 대비 성적 하락 학생 <Typography component="span" sx={{ fontWeight: 900, textDecoration: 'underline' }}>{stats.decliners}명</Typography></Typography>
                      </>
                    ) : (
                      <>
                        <CheckCircleIcon sx={{ color: '#4ade80', fontSize: 18 }} />
                        <Typography sx={{ color: '#86efac', fontSize: '0.75rem', fontWeight: 600 }}>전회 대비 성적 하락 학생이 없습니다.</Typography>
                      </>
                    )}
                  </Box>
                </>
              ) : (
                <Box sx={{ py: 5, textAlign: 'center' }}><InfoIcon sx={{ fontSize: 32, color: '#27272A', mb: 1.5 }} /><Typography sx={{ color: '#52525B', fontSize: '0.75rem' }}>시험을 선택하면<br/>상세 분석이 표시됩니다</Typography></Box>
              )}
            </Paper>
          </Box>
        </Grid>
      </Grid>

      {/* ── 시험 등록/수정 다이얼로그 ── */}
      <Dialog open={examDialogOpen} onClose={() => setExamDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px' } }}>
        <DialogTitle sx={{ color: '#FAFAFA', fontWeight: 900 }}>{editingExam ? '시험 정보 수정' : '새 시험 등록'}</DialogTitle>
        <DialogContent sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField label="시험명 *" fullWidth size="small" value={examForm.title} onChange={e => setExamForm(p => ({ ...p, title: e.target.value }))} sx={inputSx} />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <FormControl size="small"><InputLabel sx={{ color: '#71717A' }}>과목</InputLabel><Select value={examForm.subject} onChange={e => setExamForm(p => ({ ...p, subject: e.target.value }))} label="과목" sx={selectSx} MenuProps={menuProps}><MenuItem value="수학">수학</MenuItem><MenuItem value="영어">영어</MenuItem><MenuItem value="과학">과학</MenuItem></Select></FormControl>
            <FormControl size="small"><InputLabel sx={{ color: '#71717A' }}>대상 분반 *</InputLabel><Select value={examForm.class_id} onChange={e => setExamForm(p => ({ ...p, class_id: e.target.value }))} label="대상 분반 *" sx={selectSx} MenuProps={menuProps}>{DUMMY_CLASSES.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}</Select></FormControl>
            <TextField label="시험일" type="date" size="small" fullWidth value={examForm.date} onChange={e => setExamForm(p => ({ ...p, date: e.target.value }))} InputLabelProps={{ shrink: true }} sx={inputSx} />
            <TextField label="만점 *" type="number" size="small" fullWidth value={examForm.max_score} onChange={e => setExamForm(p => ({ ...p, max_score: Number(e.target.value) }))} sx={inputSx} />
            <Autocomplete
              freeSolo
              options={Array.from(new Set(exams.map(e => e.type).filter(Boolean)))}
              value={examForm.type || ''}
              onChange={(event, newValue) => {
                setExamForm(p => ({ ...p, type: newValue }));
              }}
              onInputChange={(event, newValue) => {
                setExamForm(p => ({ ...p, type: newValue }));
              }}
              slotProps={{
                paper: {
                  sx: {
                    bgcolor: '#18181B',
                    color: '#A1A1AA',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px',
                    '& .MuiAutocomplete-option': {
                      fontSize: '0.8125rem',
                      '&:hover': { bgcolor: 'rgba(167,139,250,0.08)', color: '#a78bfa' },
                      '&[aria-selected="true"]': { bgcolor: 'rgba(167,139,250,0.12)', color: '#a78bfa' },
                      '&.Mui-focused': { bgcolor: 'rgba(167,139,250,0.08)', color: '#a78bfa' },
                    },
                  }
                }
              }}
              renderInput={(params) => (
                <TextField 
                  {...params} 
                  label="시험 유형" 
                  placeholder="예: 레벨테스트, 단원평가, 모의고사"
                  sx={inputSx} 
                />
              )}
            />
          </Box>
          <TextField label="메모" multiline rows={2} fullWidth size="small" value={examForm.memo} onChange={e => setExamForm(p => ({ ...p, memo: e.target.value }))} sx={inputSx} />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}><Button onClick={() => setExamDialogOpen(false)} sx={{ color: '#71717A', fontWeight: 700 }}>취소</Button><Button variant="contained" onClick={handleSaveExam} sx={{ background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', fontWeight: 800, borderRadius: '10px', px: 3 }}>저장하기</Button></DialogActions>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} PaperProps={{ sx: { bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px' } }}>
        <DialogTitle sx={{ color: '#FAFAFA', fontWeight: 800 }}>시험 삭제</DialogTitle>
        <DialogContent><Typography sx={{ color: '#A1A1AA', fontSize: '0.875rem' }}>이 시험과 모든 학생 성적 데이터가 삭제됩니다. 계속하시겠습니까?</Typography></DialogContent>
        <DialogActions sx={{ p: 2.5 }}><Button onClick={() => setDeleteConfirmOpen(false)} sx={{ color: '#71717A' }}>취소</Button><Button onClick={() => { setExams(p => p.filter(ex => ex.id !== examToDelete.id)); setResults(p => p.filter(r => r.exam_id !== examToDelete.id)); setDeleteConfirmOpen(false); setSelectedExamId(null); showSnack('삭제되었습니다.'); }} sx={{ bgcolor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 700 }}>삭제</Button></DialogActions>
      </Dialog>

      {snack.open && (<Box sx={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, bgcolor: '#14532d', border: '1px solid #22c55e', color: '#86efac', px: 4, py: 1.5, borderRadius: '14px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 1.5, animation: 'fadeUp 0.3s ease-out' }}><CheckCircleIcon sx={{ fontSize: 20 }} /><Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>{snack.message}</Typography></Box>)}

      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </Box>
  );
}
