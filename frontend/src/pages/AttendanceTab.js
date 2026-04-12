import React, { useState, useMemo } from 'react';
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
} from '@mui/material';
import {
  EventNote as EventNoteIcon,
  Search as SearchIcon,
  CheckCircle as MarkAllIcon,
} from '@mui/icons-material';

// ── 상태 옵션 ──────────────────────────────────────────────────────────────────
// value: API/DB에서 사용하는 코드값 (변경 금지)
// label: UI 표시 텍스트
// export해서 다른 탭(학생 관리 등)에서도 재사용 가능

export const STATUS_OPTIONS = [
  { value: 'present',     label: '출석', color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.3)' },
  { value: 'absent',      label: '결석', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)' },
  { value: 'late',        label: '지각', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)' },
  { value: 'early_leave', label: '조퇴', color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.3)' },
];

// ── 더미 데이터 ────────────────────────────────────────────────────────────────
// API 연결 시 교체 경로:
//   students       → props 또는 useEffect에서 studentAPI.listStudents()
//   attendanceRecords → useEffect에서 attendanceAPI.list({ date, class_name, ... })
//
// student  스키마: { id, name, school, grade, class_name }
// record   스키마: { id, student_id, date, status, memo, updated_at }

export const DUMMY_STUDENTS = [
  { id: 1,  name: '김민준', school: '강남중학교',   grade: 2, class_name: 'A반' },
  { id: 2,  name: '이서연', school: '서초초등학교', grade: 6, class_name: 'A반' },
  { id: 3,  name: '박지호', school: '역삼중학교',   grade: 1, class_name: 'A반' },
  { id: 4,  name: '최유나', school: '논현중학교',   grade: 3, class_name: 'B반' },
  { id: 5,  name: '정하은', school: '청담중학교',   grade: 2, class_name: 'B반' },
  { id: 6,  name: '강서준', school: '압구정중학교', grade: 1, class_name: 'B반' },
  { id: 7,  name: '윤채원', school: '언주중학교',   grade: 3, class_name: 'C반' },
  { id: 8,  name: '한도현', school: '대치중학교',   grade: 2, class_name: 'C반' },
  { id: 9,  name: '임소율', school: '중동중학교',   grade: 1, class_name: 'C반' },
  { id: 10, name: '오재원', school: '수서중학교',   grade: 3, class_name: 'A반' },
];

// 모듈 로드 시점에 오늘 날짜로 고정 (더미 전용)
const _today = new Date().toISOString().slice(0, 10);
const _now   = new Date().toISOString();

// API가 반환하는 배열 형태와 동일한 구조
// API 연결 후에는 이 배열 대신 응답값을 recordsToMap()에 넘기면 됨
export const DUMMY_ATTENDANCE = [
  { id: 1,  student_id: 1,  date: _today, status: 'present',     memo: '', updated_at: _now  },
  { id: 2,  student_id: 2,  date: _today, status: 'absent',      memo: '', updated_at: _now  },
  { id: 3,  student_id: 3,  date: _today, status: 'late',        memo: '', updated_at: _now  },
  { id: 4,  student_id: 4,  date: _today, status: 'present',     memo: '', updated_at: _now  },
  { id: 5,  student_id: 5,  date: _today, status: 'early_leave', memo: '', updated_at: _now  },
  { id: 6,  student_id: 6,  date: _today, status: 'present',     memo: '', updated_at: _now  },
  { id: 7,  student_id: 7,  date: _today, status: 'present',     memo: '', updated_at: _now  },
  { id: 8,  student_id: 8,  date: _today, status: 'absent',      memo: '', updated_at: _now  },
  { id: 9,  student_id: 9,  date: _today, status: null,          memo: '', updated_at: null  },
  { id: 10, student_id: 10, date: _today, status: null,          memo: '', updated_at: null  },
];

// ── 유틸 ───────────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// API 응답 배열 → { [student_id]: record } 맵으로 변환
// API 연결 시: setAttendance(recordsToMap(response.data))
export function recordsToMap(records) {
  return Object.fromEntries(records.map(r => [r.student_id, r]));
}

// ── Shared styles ──────────────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────────────────
// Props:
//   students          - student[]          기본값: DUMMY_STUDENTS
//                       (API 연결 시 상위에서 주입)
//   initialAttendance - attendanceRecord[] 기본값: DUMMY_ATTENDANCE
//                       (API 연결 시 상위에서 주입하거나 내부 useEffect로 교체)

export default function AttendanceTab({
  students = DUMMY_STUDENTS,
  initialAttendance = DUMMY_ATTENDANCE,
}) {
  // ── 필터 상태 (query params 후보) ──────────────────────────────────────────
  // API 연결 시 이 객체를 그대로 query params로 변환 가능:
  //   GET /api/attendance?date=...&class_name=...&name=...&status=...
  const [filters, setFilters] = useState({
    date:      todayStr(), // string  'YYYY-MM-DD'
    className: 'all',      // string  'all' | 분반명
    name:      '',         // string  부분 일치 검색
    status:    'all',      // string  'all' | 'none' | STATUS value
  });

  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));

  // ── 출석 맵 상태 ───────────────────────────────────────────────────────────
  // 구조: { [date]: { [student_id]: attendanceRecord } }
  // 날짜가 바뀌면 해당 날짜의 맵을 참조 → API 연결 시 useEffect([filters.date])에서
  //   fetch(date) → setAttendance(prev => ({ ...prev, [date]: recordsToMap(res.data) }))
  const [attendance, setAttendance] = useState(() => ({
    [_today]: recordsToMap(initialAttendance),
  }));

  // ── 파생 값 ────────────────────────────────────────────────────────────────

  // 현재 선택된 날짜의 출석 맵 (없는 날짜면 빈 객체 → 전원 미입력 상태)
  const currentAttendance = useMemo(
    () => attendance[filters.date] ?? {},
    [attendance, filters.date]
  );

  const classes = useMemo(
    () => [...new Set(students.map(s => s.class_name))].sort(),
    [students]
  );

  // 클라이언트 필터링 — API 연결 후에는 서버 응답 결과를 바로 쓰면 됨
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (filters.className !== 'all' && s.class_name !== filters.className) return false;
      if (filters.name && !s.name.includes(filters.name)) return false;
      if (filters.status !== 'all') {
        const recStatus = currentAttendance[s.id]?.status ?? null;
        if (filters.status === 'none' ? recStatus !== null : recStatus !== filters.status) return false;
      }
      return true;
    });
  }, [students, filters, currentAttendance]);

  // 현재 날짜 기준 요약
  const summary = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, early_leave: 0, none: 0 };
    students.forEach(s => {
      const st = currentAttendance[s.id]?.status ?? null;
      if (st && counts[st] !== undefined) counts[st]++;
      else counts.none++;
    });
    return counts;
  }, [students, currentAttendance]);

  // ── 핸들러 ─────────────────────────────────────────────────────────────────
  // 공통 업데이트: 해당 날짜 맵의 레코드 한 건을 patch
  // 레코드가 없던 날짜(새 날짜)면 빈 레코드를 만들어 삽입
  const updateRecord = (studentId, patch) => {
    setAttendance(prev => {
      const dayMap = prev[filters.date] ?? {};
      const existing = dayMap[studentId] ?? {
        id: null,           // API 연결 후 서버가 할당
        student_id: studentId,
        date: filters.date,
        status: null,
        memo: '',
        updated_at: null,
      };
      return {
        ...prev,
        [filters.date]: {
          ...dayMap,
          [studentId]: { ...existing, ...patch, updated_at: new Date().toISOString() },
        },
      };
    });
  };

  const handleStatusChange = (studentId, status) => updateRecord(studentId, { status });
  const handleMemoChange   = (studentId, memo)   => updateRecord(studentId, { memo });

  const handleMarkAllPresent = () => {
    const now = new Date().toISOString();
    setAttendance(prev => {
      const dayMap = prev[filters.date] ?? {};
      const next = { ...dayMap };
      filteredStudents.forEach(s => {
        next[s.id] = {
          ...(dayMap[s.id] ?? { id: null, student_id: s.id, date: filters.date, memo: '', status: null, updated_at: null }),
          status: 'present',
          updated_at: now,
        };
      });
      return { ...prev, [filters.date]: next };
    });
  };

  const formatTime = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both' }}>

      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: '10px',
            background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <EventNoteIcon sx={{ fontSize: 18, color: '#fff' }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#FAFAFA' }}>출석 관리</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#71717A' }}>학생 출결 현황을 관리합니다</Typography>
          </Box>
        </Box>

        <Button
          variant="contained"
          startIcon={<MarkAllIcon sx={{ fontSize: 18 }} />}
          onClick={handleMarkAllPresent}
          sx={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8a 100%)',
              transform: 'translateY(-1px)',
              boxShadow: '0 6px 20px rgba(102,126,234,0.4)',
            },
            fontWeight: 600, fontSize: '0.8125rem', borderRadius: '10px',
            px: 2.5, py: 1, transition: 'all 0.2s', textTransform: 'none',
          }}
        >
          전체 출석 처리
        </Button>
      </Box>

      {/* ── Summary Badges ── */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
        {[
          ...STATUS_OPTIONS.map(o => ({ key: o.value, label: o.label, cfg: o })),
          { key: 'none', label: '미입력', cfg: { color: '#71717A', bg: 'rgba(113,113,122,0.12)', border: 'rgba(113,113,122,0.3)' } },
        ].map(({ key, label, cfg }) => (
          <Box
            key={key}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              px: 2, py: 0.75, borderRadius: '8px',
              bgcolor: cfg.bg, border: `1px solid ${cfg.border}`,
            }}
          >
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: cfg.color }}>{label}</Typography>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 800, color: cfg.color }}>
              {summary[key]}
            </Typography>
          </Box>
        ))}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 0.75,
          px: 2, py: 0.75, borderRadius: '8px',
          bgcolor: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)',
        }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#a78bfa' }}>전체</Typography>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 800, color: '#a78bfa' }}>
            {students.length}
          </Typography>
        </Box>
      </Box>

      {/* ── Filters ── */}
      <Box sx={{
        display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap', alignItems: 'flex-end',
        p: 2.5, borderRadius: '12px',
        bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <TextField
          type="date"
          size="small"
          label="날짜"
          value={filters.date}
          onChange={e => setFilter('date', e.target.value)}
          sx={{ ...inputSx, minWidth: 150 }}
          InputLabelProps={{ shrink: true }}
        />

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={{ color: '#71717A', fontSize: '0.8125rem', '&.Mui-focused': { color: '#a78bfa' } }}>
            분반
          </InputLabel>
          <Select
            value={filters.className}
            onChange={e => setFilter('className', e.target.value)}
            label="분반"
            sx={selectSx}
            MenuProps={menuProps}
          >
            <MenuItem value="all">전체</MenuItem>
            {classes.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </Select>
        </FormControl>

        <TextField
          size="small"
          label="이름 검색"
          placeholder="학생 이름"
          value={filters.name}
          onChange={e => setFilter('name', e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          sx={{ ...inputSx, minWidth: 160 }}
        />

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={{ color: '#71717A', fontSize: '0.8125rem', '&.Mui-focused': { color: '#a78bfa' } }}>
            상태
          </InputLabel>
          <Select
            value={filters.status}
            onChange={e => setFilter('status', e.target.value)}
            label="상태"
            sx={selectSx}
            MenuProps={menuProps}
          >
            <MenuItem value="all">전체</MenuItem>
            {STATUS_OPTIONS.map(o => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
            <MenuItem value="none">미입력</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* ── Table ── */}
      <Box sx={{
        bgcolor: '#18181B',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: '1.6fr 1.2fr 2.2fr 2fr 0.9fr',
          gap: 2, px: 3, py: 1.5,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          bgcolor: 'rgba(255,255,255,0.02)',
        }}>
          {['학생 이름', '학교 / 학년', '출결 상태', '메모', '수정 시각'].map(h => (
            <Typography key={h} sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {h}
            </Typography>
          ))}
        </Box>

        {/* Empty State */}
        {filteredStudents.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <EventNoteIcon sx={{ fontSize: 40, color: '#3F3F46', mb: 1 }} />
            <Typography sx={{ color: '#71717A', fontSize: '0.875rem' }}>
              조건에 맞는 학생이 없습니다
            </Typography>
          </Box>
        ) : (
          filteredStudents.map((student, idx) => {
            const rec = currentAttendance[student.id];
            const currentStatus = rec?.status ?? null;
            return (
              <Box
                key={student.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1.6fr 1.2fr 2.2fr 2fr 0.9fr',
                  gap: 2, px: 3, py: 1.75,
                  alignItems: 'center',
                  borderBottom: idx < filteredStudents.length - 1
                    ? '1px solid rgba(255,255,255,0.04)'
                    : 'none',
                  transition: 'background 0.15s',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
                }}
              >
                {/* 이름 + 분반 */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <Box sx={{
                    width: 30, height: 30, borderRadius: '8px', flexShrink: 0,
                    background: 'linear-gradient(135deg, rgba(167,139,250,0.2) 0%, rgba(124,58,237,0.15) 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8rem', fontWeight: 700, color: '#c4b5fd',
                  }}>
                    {student.name[0]}
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#FAFAFA', lineHeight: 1.3 }}>
                      {student.name}
                    </Typography>
                    <Typography sx={{ fontSize: '0.7rem', color: '#52525B' }}>{student.class_name}</Typography>
                  </Box>
                </Box>

                {/* 학교 / 학년 */}
                <Box>
                  <Typography sx={{ fontSize: '0.8rem', color: '#A1A1AA', lineHeight: 1.3 }}>{student.school}</Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: '#52525B' }}>{student.grade}학년</Typography>
                </Box>

                {/* 상태 버튼 — STATUS_OPTIONS 순서대로 렌더링 */}
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {STATUS_OPTIONS.map(opt => {
                    const active = currentStatus === opt.value;
                    return (
                      <Box
                        key={opt.value}
                        onClick={() => handleStatusChange(student.id, opt.value)}
                        sx={{
                          px: 1.5, py: 0.4,
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
                  })}
                </Box>

                {/* 메모 */}
                <TextField
                  size="small"
                  placeholder="메모 입력"
                  value={rec?.memo ?? ''}
                  onChange={e => handleMemoChange(student.id, e.target.value)}
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

                {/* 수정 시각 */}
                <Typography sx={{ fontSize: '0.75rem', color: rec?.updated_at ? '#71717A' : '#3F3F46' }}>
                  {formatTime(rec?.updated_at)}
                </Typography>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
