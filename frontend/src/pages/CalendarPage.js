import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, IconButton, Button, Dialog, DialogContent,
  CircularProgress, Chip,
} from '@mui/material';
import {
  Place as PlaceIcon,
  AccessTime as TimeIcon,
  Notes as NotesIcon,
  Close as CloseIcon,
  LinkOff as LinkOffIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { calendarAPI } from '../services/api';

// ─── Inject styles ────────────────────────────────────────
const STYLE_ID = 'cal-page-css';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap');
    @keyframes cfIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
    @keyframes cfFade { from { opacity:0 } to { opacity:1 } }
    .cal-grid-animate { animation: cfIn 0.2s ease-out; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `;
  document.head.appendChild(s);
}

// ─── Constants ────────────────────────────────────────────
const FONT = "'Instrument Sans', -apple-system, sans-serif";
const BG = '#111114';
const CARD_BG = '#1a1a1f';
const BORDER = 'rgba(255,255,255,0.07)';
const CELL_BG = '#1e1e24';
const CELL_HOVER = '#26262e';
const GAP = '1px';
const WEEKDAYS_KR = ['일', '월', '화', '수', '목', '금', '토'];
const MONTH_NAMES_KR = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

// ─── Event color palette ──────────────────────────────────
const PALETTE = [
  { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.25)', text: '#a5b4fc', dot: '#818cf8', allDayBg: 'rgba(99,102,241,0.18)' },
  { bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.22)', text: '#6ee7b7', dot: '#34d399', allDayBg: 'rgba(52,211,153,0.16)' },
  { bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.22)', text: '#fcd34d', dot: '#fbbf24', allDayBg: 'rgba(251,191,36,0.16)' },
  { bg: 'rgba(168,85,247,0.10)', border: 'rgba(168,85,247,0.22)', text: '#c4b5fd', dot: '#a78bfa', allDayBg: 'rgba(168,85,247,0.16)' },
  { bg: 'rgba(56,189,248,0.10)', border: 'rgba(56,189,248,0.22)', text: '#7dd3fc', dot: '#38bdf8', allDayBg: 'rgba(56,189,248,0.16)' },
  { bg: 'rgba(251,146,60,0.10)', border: 'rgba(251,146,60,0.22)', text: '#fdba74', dot: '#fb923c', allDayBg: 'rgba(251,146,60,0.16)' },
  { bg: 'rgba(244,114,182,0.10)', border: 'rgba(244,114,182,0.22)', text: '#f9a8d4', dot: '#f472b6', allDayBg: 'rgba(244,114,182,0.16)' },
  { bg: 'rgba(45,212,191,0.10)', border: 'rgba(45,212,191,0.22)', text: '#5eead4', dot: '#2dd4bf', allDayBg: 'rgba(45,212,191,0.16)' },
];
function hashPalette(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// ─── Helpers ──────────────────────────────────────────────
function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function getDaysInMonth(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const days = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true });
  }
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
  }
  return days;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (dateStr.length === 10) return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
    + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatTimeRange(start, end) {
  if (!start) return '';
  if ((start || '').length === 10) return '종일';
  const sTime = new Date(start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  if (!end) return sTime;
  const eTime = new Date(end).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  return `${sTime} – ${eTime}`;
}

function getEventTime(ev) {
  if (!ev.start || ev.start.length === 10) return null;
  return new Date(ev.start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ─── View modes ──────────────────────────────────────────
const VIEW_OPTIONS = [
  { key: 'month', label: '월' },
  { key: 'week', label: '주' },
  { key: 'day', label: '일' },
];

// ─── EventPill ────────────────────────────────────────────
function EventPill({ event, onClick }) {
  const p = event._palette;
  const time = getEventTime(event);
  const isAllDay = !time;

  if (isAllDay) {
    return (
      <Box
        onClick={(e) => { e.stopPropagation(); onClick(event); }}
        sx={{
          fontSize: '0.68rem',
          px: 0.8,
          py: '3px',
          borderRadius: '4px',
          bgcolor: p.allDayBg,
          color: p.text,
          cursor: 'pointer',
          transition: 'background 0.15s',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          overflow: 'hidden',
          fontFamily: FONT,
          borderLeft: `3px solid ${p.dot}`,
          '&:hover': { bgcolor: p.border },
        }}
      >
        <Typography component="span" sx={{
          fontSize: 'inherit', fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: FONT,
        }}>
          {event.summary}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      onClick={(e) => { e.stopPropagation(); onClick(event); }}
      sx={{
        fontSize: '0.68rem',
        px: 0.8,
        py: '3px',
        borderRadius: '4px',
        border: `1px solid ${p.border}`,
        bgcolor: p.bg,
        color: p.text,
        cursor: 'pointer',
        transition: 'background 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: 0.6,
        overflow: 'hidden',
        fontFamily: FONT,
        '&:hover': { bgcolor: p.border },
      }}
    >
      <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: p.dot, opacity: 0.7, flexShrink: 0 }} />
      <Typography component="span" sx={{
        fontSize: 'inherit', fontWeight: 600, opacity: 0.8, flexShrink: 0,
        fontFamily: FONT,
      }}>
        {time}
      </Typography>
      <Typography component="span" sx={{
        fontSize: 'inherit', fontWeight: 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontFamily: FONT,
      }}>
        {event.summary}
      </Typography>
    </Box>
  );
}

// ══════════════════════════════════════════════════════════
export default function CalendarPage() {
  const { slug } = useParams();
  const currentSlug = slug;

  const [loading, setLoading] = useState(true);
  const [calStatus, setCalStatus] = useState(null);
  const [rawEvents, setRawEvents] = useState([]);
  const [currentDate, setCurrentDate] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null); // date string for "show all events" popup
  const [gridKey, setGridKey] = useState(0);
  const [viewMode, setViewMode] = useState('month');

  const today = useMemo(() => new Date(), []);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  // ─── Load status ──────────────────────────────────────
  useEffect(() => {
    if (!currentSlug) return;
    calendarAPI.getPublicStatus(currentSlug)
      .then(res => setCalStatus(res.data))
      .catch(() => setCalStatus({ connected: false }))
      .finally(() => setLoading(false));
  }, [currentSlug]);

  // ─── Fetch events ─────────────────────────────────────
  const fetchEvents = useCallback(() => {
    if (!calStatus?.connected) return;
    const firstDay = days[0].date;
    const lastDay = days[days.length - 1].date;
    const timeMin = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate()).toISOString();
    const timeMax = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1).toISOString();

    calendarAPI.getPublicEvents(currentSlug, { time_min: timeMin, time_max: timeMax, max_results: 200 })
      .then(res => setRawEvents(res.data.events || []))
      .catch(err => console.error('Failed to fetch events:', err));
  }, [calStatus, days, currentSlug]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // ─── Map events with palette ──────────────────────────
  const events = useMemo(() =>
    rawEvents.map(ev => ({ ...ev, _palette: hashPalette(ev.summary) })),
    [rawEvents]
  );

  // ─── Week view helpers ───────────────────────────────
  const selectedDay = useMemo(() => {
    if (viewMode === 'day') return today;
    return today;
  }, [viewMode, today]);

  const [dayViewDate, setDayViewDate] = useState(() => new Date());

  const weekDays = useMemo(() => {
    const ref = viewMode === 'week' ? currentDate : dayViewDate;
    const dayOfWeek = ref.getDay();
    const startOfWeek = new Date(ref);
    startOfWeek.setDate(ref.getDate() - dayOfWeek);
    const result = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      result.push(d);
    }
    return result;
  }, [viewMode, currentDate, dayViewDate]);

  const HOURS = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  // ─── Nav ──────────────────────────────────────────────
  const goToday = () => {
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setDayViewDate(new Date());
    setGridKey(k => k + 1);
  };
  const goPrev = () => {
    if (viewMode === 'month') setCurrentDate(new Date(year, month - 1, 1));
    else if (viewMode === 'week') setCurrentDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; });
    else setDayViewDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 1); return d; });
    setGridKey(k => k + 1);
  };
  const goNext = () => {
    if (viewMode === 'month') setCurrentDate(new Date(year, month + 1, 1));
    else if (viewMode === 'week') setCurrentDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; });
    else setDayViewDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + 1); return d; });
    setGridKey(k => k + 1);
  };

  // ─── Loading ──────────────────────────────────────────
  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center', animation: 'cfFade 0.4s ease' }}>
          <CircularProgress size={20} sx={{ color: '#818cf8', mb: 2 }} thickness={2} />
          <Typography sx={{ color: '#52525b', fontFamily: FONT, fontSize: '0.8rem' }}>불러오는 중</Typography>
        </Box>
      </Box>
    );
  }

  // ─── Not connected ────────────────────────────────────
  if (!calStatus?.connected) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Box sx={{ textAlign: 'center', maxWidth: 380, animation: 'cfIn 0.4s ease both' }}>
          <Box sx={{
            width: 52, height: 52, borderRadius: '12px', mx: 'auto', mb: 3,
            border: `1px solid ${BORDER}`, bgcolor: 'rgba(99,102,241,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <LinkOffIcon sx={{ fontSize: 22, color: '#818cf8' }} />
          </Box>
          <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '1.15rem', color: '#fafafa', mb: 0.5 }}>
            캘린더 미연동
          </Typography>
          <Typography sx={{ fontFamily: FONT, color: '#52525b', fontSize: '0.82rem', mb: 3.5, lineHeight: 1.7 }}>
            관리자가 Google 캘린더를 연동하면<br />일정을 확인할 수 있습니다
          </Typography>
        </Box>
      </Box>
    );
  }

  // ─── Main ─────────────────────────────────────────────
  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: BG, overflow: 'hidden', fontFamily: FONT }}>

      {/* ── Navbar ── */}
      <Box sx={{
        height: 52, px: { xs: 2, md: 3 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${BORDER}`, bgcolor: 'rgba(17,17,20,0.9)', backdropFilter: 'blur(12px)',
        flexShrink: 0, zIndex: 10,
      }}>
        <Typography sx={{ fontFamily: FONT, fontWeight: 600, fontSize: '0.85rem', color: '#fafafa', letterSpacing: '0.02em' }}>
          캘린더
        </Typography>
        {calStatus?.email && (
          <Typography sx={{ color: '#3f3f46', fontFamily: FONT, fontSize: '0.68rem', display: { xs: 'none', md: 'block' } }}>
            {calStatus.email}
          </Typography>
        )}
      </Box>

      {/* ── Content ── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: { xs: 1.5, md: 3 }, gap: 2, overflow: 'hidden', position: 'relative' }}>

        {/* Subtle glow */}
        <Box sx={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 800, height: 400, background: 'rgba(99,102,241,0.03)', filter: 'blur(120px)',
          borderRadius: '50%', pointerEvents: 'none',
        }} />

        {/* Toolbar */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 2, md: 3 } }}>
            <Typography sx={{
              fontFamily: FONT, fontWeight: 600, fontSize: { xs: '1.15rem', md: '1.35rem' },
              color: '#fafafa', letterSpacing: '-0.02em', minWidth: { xs: 100, md: 140 },
            }}>
              {viewMode === 'day'
                ? `${dayViewDate.getFullYear()}년 ${MONTH_NAMES_KR[dayViewDate.getMonth()]} ${dayViewDate.getDate()}일`
                : `${year}년 ${MONTH_NAMES_KR[month]}`}
            </Typography>
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 0.3,
              bgcolor: '#1a1a1f', border: `1px solid ${BORDER}`, borderRadius: '8px', p: 0.3,
            }}>
              <IconButton onClick={goPrev} size="small" sx={{ color: '#71717a', p: 0.6, borderRadius: '6px', '&:hover': { bgcolor: '#26262e', color: '#fafafa' } }}>
                <ChevronLeftIcon sx={{ fontSize: 16 }} />
              </IconButton>
              <Button onClick={goToday} size="small" sx={{
                color: '#a1a1aa', fontFamily: FONT, fontWeight: 600, fontSize: '0.75rem',
                textTransform: 'none', px: 1.5, py: 0.4, borderRadius: '6px', minWidth: 0,
                '&:hover': { bgcolor: '#26262e', color: '#fafafa' },
              }}>
                오늘
              </Button>
              <IconButton onClick={goNext} size="small" sx={{ color: '#71717a', p: 0.6, borderRadius: '6px', '&:hover': { bgcolor: '#26262e', color: '#fafafa' } }}>
                <ChevronRightIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          </Box>
          {/* View toggle */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 0.3,
            bgcolor: '#1a1a1f', border: `1px solid ${BORDER}`, borderRadius: '8px', p: 0.3,
          }}>
            {VIEW_OPTIONS.map(v => (
              <Button
                key={v.key}
                onClick={() => { setViewMode(v.key); setGridKey(k => k + 1); }}
                size="small"
                sx={{
                  color: viewMode === v.key ? '#fafafa' : '#52525b',
                  bgcolor: viewMode === v.key ? '#1f1f24' : 'transparent',
                  fontFamily: FONT, fontWeight: 600, fontSize: '0.72rem',
                  textTransform: 'none', px: 1.5, py: 0.4, borderRadius: '6px', minWidth: 0,
                  '&:hover': { bgcolor: viewMode === v.key ? '#1f1f24' : 'rgba(255,255,255,0.04)', color: '#fafafa' },
                }}
              >
                {v.label}
              </Button>
            ))}
          </Box>
        </Box>

        {/* Calendar Card */}
        <Box sx={{
          flex: 1, display: 'flex', flexDirection: 'column',
          border: `1px solid ${BORDER}`, borderRadius: '12px',
          overflow: 'hidden', bgcolor: CARD_BG, position: 'relative', zIndex: 1,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}>
          {/* ── Month View ── */}
          {viewMode === 'month' && (<>
            <Box sx={{
              display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
              borderBottom: `1px solid ${BORDER}`, bgcolor: '#151518', flexShrink: 0,
            }}>
              {WEEKDAYS_KR.map(d => (
                <Box key={d} sx={{
                  py: 1.2, textAlign: 'center',
                  fontSize: '0.68rem', fontWeight: 600, color: '#52525b',
                  letterSpacing: '0.08em', fontFamily: FONT,
                }}>
                  {d}
                </Box>
              ))}
            </Box>
            <Box key={gridKey} className="cal-grid-animate" sx={{
              flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'repeat(6, 1fr)',
              gap: GAP, bgcolor: 'rgba(255,255,255,0.03)', overflow: 'hidden',
            }}>
              {days.map((dayObj, idx) => {
                const isToday = isSameDay(dayObj.date, today);
                const dayEvents = events.filter(ev => isSameDay(new Date(ev.start), dayObj.date));
                return (
                  <Box key={idx} sx={{
                    bgcolor: CELL_BG, p: { xs: 0.5, sm: 1 },
                    display: 'flex', flexDirection: 'column', gap: 0.4,
                    transition: 'background 0.15s',
                    opacity: dayObj.isCurrentMonth ? 1 : 0.4,
                    filter: dayObj.isCurrentMonth ? 'none' : 'blur(1.5px)',
                    '&:hover': { bgcolor: CELL_HOVER }, overflow: 'hidden',
                    ...(isToday && {
                      border: '1px solid rgba(20,184,166,0.4)',
                      boxShadow: 'inset 0 0 12px rgba(20,184,166,0.06), 0 0 8px rgba(20,184,166,0.15)',
                    }),
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <Typography sx={{
                        fontSize: { xs: '0.7rem', sm: '0.8rem' }, fontWeight: isToday ? 700 : 500, fontFamily: FONT,
                        width: isToday ? 26 : 'auto', height: isToday ? 26 : 'auto',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
                        background: isToday ? 'linear-gradient(135deg, #14B8A6 0%, #0EA5E9 100%)' : 'transparent',
                        color: isToday ? '#fff' : '#a1a1aa',
                        ...(isToday && { boxShadow: '0 0 12px rgba(20,184,166,0.5), 0 0 4px rgba(20,184,166,0.3)' }),
                      }}>
                        {dayObj.date.getDate()}
                      </Typography>
                    </Box>
                    <Box className="no-scrollbar" sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {dayEvents.slice(0, 5).map(ev => (
                        <EventPill key={ev.id} event={ev} onClick={setSelectedEvent} />
                      ))}
                      {dayEvents.length > 5 && (
                        <Typography
                          onClick={(e) => { e.stopPropagation(); setExpandedDay(dayObj.date.toDateString()); }}
                          sx={{ fontSize: '0.62rem', color: '#818cf8', fontWeight: 600, pl: 0.5, fontFamily: FONT, cursor: 'pointer', '&:hover': { color: '#a5b4fc' } }}
                        >
                          +{dayEvents.length - 5}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </>)}

          {/* ── Week View ── */}
          {viewMode === 'week' && (<>
            <Box sx={{
              display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)',
              borderBottom: `1px solid ${BORDER}`, bgcolor: '#151518', flexShrink: 0,
            }}>
              <Box sx={{ borderRight: `1px solid ${BORDER}` }} />
              {weekDays.map((d, i) => {
                const isToday = isSameDay(d, today);
                return (
                  <Box key={i} sx={{
                    py: 1, textAlign: 'center', borderRight: i < 6 ? `1px solid ${BORDER}` : 'none',
                  }}>
                    <Typography sx={{ fontSize: '0.62rem', fontWeight: 600, color: '#52525b', fontFamily: FONT, letterSpacing: '0.06em' }}>
                      {WEEKDAYS_KR[d.getDay()]}
                    </Typography>
                    <Typography sx={{
                      fontSize: '0.85rem', fontWeight: isToday ? 700 : 500, fontFamily: FONT,
                      color: isToday ? '#fff' : '#a1a1aa',
                      width: isToday ? 26 : 'auto', height: isToday ? 26 : 'auto',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%',
                      background: isToday ? 'linear-gradient(135deg, #14B8A6 0%, #0EA5E9 100%)' : 'transparent',
                      ...(isToday && { boxShadow: '0 0 12px rgba(20,184,166,0.5), 0 0 4px rgba(20,184,166,0.3)' }),
                    }}>
                      {d.getDate()}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
            <Box key={gridKey} className="cal-grid-animate no-scrollbar" sx={{ flex: 1, overflow: 'auto' }}>
              {HOURS.map(hour => (
                <Box key={hour} sx={{
                  display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)',
                  minHeight: 48, borderBottom: `1px solid rgba(39,39,42,0.3)`,
                }}>
                  <Box sx={{
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: 0.3,
                    borderRight: `1px solid ${BORDER}`, color: '#3f3f46', fontSize: '0.6rem',
                    fontFamily: FONT, fontWeight: 500,
                  }}>
                    {String(hour).padStart(2, '0')}:00
                  </Box>
                  {weekDays.map((d, di) => {
                    const cellEvents = events.filter(ev => {
                      if (!ev.start || ev.start.length === 10) return false;
                      const s = new Date(ev.start);
                      return isSameDay(s, d) && s.getHours() === hour;
                    });
                    return (
                      <Box key={di} sx={{
                        borderRight: di < 6 ? `1px solid rgba(39,39,42,0.3)` : 'none',
                        p: 0.3, display: 'flex', flexDirection: 'column', gap: '2px',
                        '&:hover': { bgcolor: CELL_HOVER },
                      }}>
                        {cellEvents.map(ev => (
                          <EventPill key={ev.id} event={ev} onClick={setSelectedEvent} />
                        ))}
                      </Box>
                    );
                  })}
                </Box>
              ))}
            </Box>
          </>)}

          {/* ── Day View ── */}
          {viewMode === 'day' && (<>
            {/* All-day events */}
            {(() => {
              const allDayEvs = events.filter(ev => ev.start && ev.start.length === 10 && isSameDay(new Date(ev.start), dayViewDate));
              if (!allDayEvs.length) return null;
              return (
                <Box sx={{ px: 2, py: 1, borderBottom: `1px solid ${BORDER}`, bgcolor: '#151518', display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: '0.65rem', color: '#52525b', fontFamily: FONT, fontWeight: 600, mr: 0.5 }}>종일</Typography>
                  {allDayEvs.map(ev => (
                    <EventPill key={ev.id} event={ev} onClick={setSelectedEvent} />
                  ))}
                </Box>
              );
            })()}
            <Box key={gridKey} className="cal-grid-animate no-scrollbar" sx={{ flex: 1, overflow: 'auto' }}>
              {HOURS.map(hour => {
                const hourEvents = events.filter(ev => {
                  if (!ev.start || ev.start.length === 10) return false;
                  const s = new Date(ev.start);
                  return isSameDay(s, dayViewDate) && s.getHours() === hour;
                });
                return (
                  <Box key={hour} sx={{
                    display: 'grid', gridTemplateColumns: '56px 1fr',
                    minHeight: 52, borderBottom: `1px solid rgba(39,39,42,0.3)`,
                  }}>
                    <Box sx={{
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: 0.5,
                      borderRight: `1px solid ${BORDER}`, color: '#3f3f46', fontSize: '0.7rem',
                      fontFamily: FONT, fontWeight: 500,
                    }}>
                      {String(hour).padStart(2, '0')}:00
                    </Box>
                    <Box sx={{
                      p: 0.5, display: 'flex', flexDirection: 'column', gap: '3px',
                      '&:hover': { bgcolor: CELL_HOVER },
                    }}>
                      {hourEvents.map(ev => (
                        <EventPill key={ev.id} event={ev} onClick={setSelectedEvent} />
                      ))}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </>)}
        </Box>
      </Box>

      {/* ── Expanded Day ── */}
      <Dialog
        open={!!expandedDay}
        onClose={() => setExpandedDay(null)}
        maxWidth="xs" fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#18181b', borderRadius: '12px',
            border: `1px solid ${BORDER}`,
            boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          },
        }}
        slotProps={{ backdrop: { sx: { bgcolor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' } } }}
      >
        {expandedDay && (() => {
          const dayDate = new Date(expandedDay);
          const dayEvts = events.filter(ev => isSameDay(new Date(ev.start), dayDate));
          return (
            <DialogContent sx={{ p: 0 }}>
              <Box sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.95rem', color: '#fafafa' }}>
                    {dayDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                  </Typography>
                  <IconButton onClick={() => setExpandedDay(null)} size="small"
                    sx={{ color: '#52525b', '&:hover': { color: '#a1a1aa' } }}>
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {dayEvts.map(ev => (
                    <EventPill key={ev.id} event={ev} onClick={(e) => { setExpandedDay(null); setSelectedEvent(e); }} />
                  ))}
                </Box>
              </Box>
            </DialogContent>
          );
        })()}
      </Dialog>

      {/* ── Event Detail ── */}
      <Dialog
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        maxWidth="xs" fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#18181b', borderRadius: '12px',
            border: `1px solid ${BORDER}`,
            boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          },
        }}
        slotProps={{ backdrop: { sx: { bgcolor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' } } }}
      >
        {selectedEvent && (
          <DialogContent sx={{ p: 0 }}>
            <Box sx={{ height: 2, bgcolor: selectedEvent._palette?.dot || '#818cf8', opacity: 0.6, borderRadius: '12px 12px 0 0' }} />
            <Box sx={{ p: 3 }}>
              <IconButton onClick={() => setSelectedEvent(null)} size="small"
                sx={{ position: 'absolute', top: 10, right: 10, color: '#52525b', '&:hover': { color: '#a1a1aa' } }}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
              <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '1.1rem', color: '#fafafa', mb: 2, pr: 4, lineHeight: 1.35 }}>
                {selectedEvent.summary || selectedEvent.title}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <TimeIcon sx={{ fontSize: 14, color: '#52525b', mt: 0.3 }} />
                  <Box>
                    <Typography sx={{ color: '#a1a1aa', fontSize: '0.78rem', fontFamily: FONT, fontWeight: 500 }}>
                      {formatDateTime(selectedEvent.start)}
                    </Typography>
                    {selectedEvent.end && selectedEvent.start !== selectedEvent.end && (
                      <Typography sx={{ color: '#52525b', fontSize: '0.72rem', fontFamily: FONT }}>
                        → {formatDateTime(selectedEvent.end)}
                      </Typography>
                    )}
                    <Chip label={formatTimeRange(selectedEvent.start, selectedEvent.end)} size="small" sx={{
                      mt: 0.75, height: 18, bgcolor: 'rgba(99,102,241,0.08)', color: '#818cf8',
                      fontSize: '0.65rem', fontWeight: 600, fontFamily: FONT, border: 'none',
                      '& .MuiChip-label': { px: 0.8 },
                    }} />
                  </Box>
                </Box>
                {selectedEvent.location && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <PlaceIcon sx={{ fontSize: 14, color: '#52525b' }} />
                    <Typography sx={{ color: '#a1a1aa', fontSize: '0.78rem', fontFamily: FONT }}>{selectedEvent.location}</Typography>
                  </Box>
                )}
                {selectedEvent.description && (
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <NotesIcon sx={{ fontSize: 14, color: '#52525b', mt: 0.3 }} />
                    <Typography sx={{ color: '#71717a', fontSize: '0.76rem', lineHeight: 1.65, fontFamily: FONT, whiteSpace: 'pre-wrap' }}>
                      {selectedEvent.description}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </DialogContent>
        )}
      </Dialog>
    </Box>
  );
}
