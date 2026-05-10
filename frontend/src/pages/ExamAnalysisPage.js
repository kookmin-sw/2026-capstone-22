import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Grid, Select, MenuItem,
  FormControl, InputLabel, Chip, Table, TableBody, TableCell,
  TableHead, TableRow, CircularProgress, Alert, FormHelperText,
  Dialog, DialogTitle, DialogContent, DialogActions, Checkbox,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  InsertDriveFile as InsertDriveFileIcon,
  Close as CloseIcon,
  Quiz as QuizIcon,
  ArrowBack as ArrowBackIcon,
  Print as PrintIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { questionBankAPI } from '../services/api';

// ── 상수 ──────────────────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'];
const MAX_SIZE_MB = 20;

const GRADE_OPTIONS   = ['중1', '중2', '중3', '고1', '고2', '고3'];
const EXAM_TYPE_OPTIONS = ['내신', '모의고사', '학원 자체 제작'];
const _CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS  = Array.from({ length: _CURRENT_YEAR - 2009 }, (_, i) => String(_CURRENT_YEAR - i));
const DIFFICULTY_OPTIONS = ['하', '중', '상'];
const AREA_OPTIONS    = ['문법', '어휘', '독해', '듣기', '서술형'];


const STATUS_MAP = {
  pending:    '업로드 완료',
  processing: '분석 중',
  done:       '분석 완료',
  failed:     '실패',
};

const STATUS_CFG = {
  '업로드 완료': { bg: 'rgba(59,130,246,0.15)',  color: '#93c5fd', border: 'rgba(59,130,246,0.3)' },
  '분석 중':     { bg: 'rgba(249,115,22,0.15)',  color: '#fdba74', border: 'rgba(249,115,22,0.3)' },
  '분석 완료':   { bg: 'rgba(34,197,94,0.15)',   color: '#86efac', border: 'rgba(34,197,94,0.3)' },
  '실패':        { bg: 'rgba(239,68,68,0.15)',   color: '#fca5a5', border: 'rgba(239,68,68,0.3)' },
};

const DIFF_CFG = {
  '하': { bg: 'rgba(34,197,94,0.15)',  color: '#86efac', border: 'rgba(34,197,94,0.3)' },
  '중': { bg: 'rgba(234,179,8,0.15)',  color: '#fde047', border: 'rgba(234,179,8,0.3)' },
  '상': { bg: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: 'rgba(239,68,68,0.3)' },
};

const EMPTY_FORM = { grade:'', examName:'', examType:'', year:'', source:'', note:'' };
const EMPTY_EDIT = { area:'', difficulty:'', question_body:'', choices:'', answer:'', score_point:'' };

// ── 작은 칩 컴포넌트 ──────────────────────────────────────────────────────────

function StatusChip({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG['업로드 완료'];
  return (
    <Chip label={status} size="small" sx={{
      height: 22, bgcolor: cfg.bg, color: cfg.color, fontWeight: 600,
      fontSize: '0.6875rem', border: `1px solid ${cfg.border}`,
      '& .MuiChip-label': { px: 1 },
    }} />
  );
}

function DiffChip({ v }) {
  if (!v) return null;
  const cfg = DIFF_CFG[v] || DIFF_CFG['중'];
  return (
    <Chip label={v} size="small" sx={{
      height: 20, bgcolor: cfg.bg, color: cfg.color, fontWeight: 600,
      fontSize: '0.625rem', border: `1px solid ${cfg.border}`,
      '& .MuiChip-label': { px: 0.75 },
    }} />
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function ExamAnalysisPage() {
  useAuth();

  const { examSubTab } = useParams();
  const navigate = useNavigate();
  const _TAB_TO_URL = ['upload', 'history', 'bank'];
  const _URL_TO_TAB = { upload: 0, history: 1, bank: 2 };
  const subTab = _URL_TO_TAB[examSubTab] ?? 0;
  const setSubTab = useCallback((i) => navigate(`../${_TAB_TO_URL[i]}`, { relative: 'path' }), [navigate]);

  // 업로드 탭
  const [file, setFile]           = useState(null);
  const [fileError, setFileError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [uploading, setUploading]     = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // 이력 탭
  const [history, setHistory] = useState([]);

  // 결과 뷰 (이력 탭 내부)
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [items, setItems]           = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [editOpen, setEditOpen]     = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm]     = useState(EMPTY_EDIT);
  const [saving, setSaving]         = useState(false);
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [approvingSelected, setApprovingSelected] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, type: '', id: null, label: '' });
  const [deleting, setDeleting] = useState(false);

  // 문제은행 탭
  const [bankItems, setBankItems]   = useState([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankFilters, setBankFilters] = useState({ grade:'', area:'', difficulty:'' });
  const [selectedBankItem, setSelectedBankItem] = useState(null);
  const [revertingBankItem, setRevertingBankItem] = useState(false);
  const [printWithAnswers, setPrintWithAnswers] = useState(false);

  // ── 이력 fetch + 폴링 ─────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    try {
      const res = await questionBankAPI.listPapers();
      setHistory(res.data);
    } catch (e) {
      console.error('이력 조회 실패', e);
    }
  }, []);

  useEffect(() => {
    if (subTab !== 1 || selectedPaper !== null) return;
    fetchHistory();
    const id = setInterval(fetchHistory, 2500);
    return () => clearInterval(id);
  }, [subTab, selectedPaper, fetchHistory]);

  // ── 문제은행 fetch ────────────────────────────────────────────────────────
  const loadBankItems = useCallback(async () => {
    setBankLoading(true);
    try {
      const papersRes = await questionBankAPI.listPapers({ status: 'done' });
      const groups = await Promise.all(
        papersRes.data.map(p =>
          questionBankAPI.listItems(p.id, { review_status: 'reviewed' })
            .then(r => r.data.map(item => ({
              ...item,
              paper_title: p.title, paper_subject: p.subject, paper_grade: p.grade,
            })))
            .catch(() => [])
        )
      );
      setBankItems(groups.flat());
    } catch (e) {
      console.error('문제은행 조회 실패', e);
    } finally {
      setBankLoading(false);
    }
  }, []);

  useEffect(() => {
    if (subTab !== 2) return;
    loadBankItems();
  }, [subTab, loadBankItems]);

  // ── 결과 보기 ─────────────────────────────────────────────────────────────
  const handleViewResult = async (paper) => {
    setSelectedPaper(paper);
    setOnlyNeedsReview(false);
    setSelectedItems(new Set());
    setItemsLoading(true);
    setItems([]);
    try {
      const res = await questionBankAPI.listItems(paper.id);
      setItems(res.data);
    } catch (e) {
      console.error('문항 조회 실패', e);
    } finally {
      setItemsLoading(false);
    }
  };

  // ── 검수 완료 ─────────────────────────────────────────────────────────────
  const handleReview = async (itemId) => {
    try {
      const res = await questionBankAPI.updateItem(itemId, { review_status: 'reviewed' });
      setItems(prev => prev.map(i => i.id === itemId ? res.data : i));
    } catch (e) {
      console.error('검수 완료 실패', e);
    }
  };

  // ── 선택 토글 ─────────────────────────────────────────────────────────────
  const toggleSelectItem = (itemId) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  // ── 선택 검수 완료 ────────────────────────────────────────────────────────
  const handleApproveSelected = async () => {
    if (selectedItems.size === 0) return;
    setApprovingSelected(true);
    try {
      const targets = items.filter(i => selectedItems.has(i.id) && i.review_status !== 'reviewed');
      const updated = await Promise.all(
        targets.map(item =>
          questionBankAPI.updateItem(item.id, { review_status: 'reviewed' }).then(r => r.data)
        )
      );
      setItems(prev => {
        const map = Object.fromEntries(updated.map(u => [u.id, u]));
        return prev.map(i => map[i.id] ?? i);
      });
      setSelectedItems(new Set());
    } catch (e) {
      console.error('선택 검수 완료 실패', e);
    } finally {
      setApprovingSelected(false);
    }
  };

  // ── 수정 다이얼로그 ───────────────────────────────────────────────────────
  const openEdit = (item) => {
    setEditTarget(item);
    setEditForm({
      area: item.area || '',
      difficulty: item.difficulty || '',
      question_body: item.question_body || '',
      choices: item.choices ? item.choices.join('\n') : '',
      answer: item.answer || '',
      score_point: item.score_point || '',
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const choicesArray = editForm.choices.split('\n').filter(c => c.trim() !== '');

      const cleanedPayload = {};
      for (const key in editForm) {
        if (key === 'choices') {
          cleanedPayload[key] = choicesArray;
        } else if (key === 'score_point') {
          const numValue = Number(editForm[key]);
          cleanedPayload[key] = isNaN(numValue) || editForm[key] === '' ? null : numValue;
        } else if (typeof editForm[key] === 'string' && editForm[key].trim() === '') {
          cleanedPayload[key] = null;
        } else {
          cleanedPayload[key] = editForm[key];
        }
      }

      console.log('Payload for updateItem:', cleanedPayload); // Log the payload

      const res = await questionBankAPI.updateItem(editTarget.id, cleanedPayload);
      setItems(prev => prev.map(i => i.id === editTarget.id ? res.data : i));
      setEditOpen(false);
    } catch (e) {
      console.error('수정 실패', e);
      if (e.response && e.response.data && e.response.data.detail) {
        console.error('Backend error detail:', e.response.data.detail);
        alert(`수정 실패: ${JSON.stringify(e.response.data.detail)}`); // Display backend error to user
      }
    } finally {
      setSaving(false);
    }
  };

  // ── 삭제 핸들러 ──────────────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      if (deleteDialog.type === 'paper') {
        await questionBankAPI.deletePaper(deleteDialog.id);
        setHistory(prev => prev.filter(p => p.id !== deleteDialog.id));
        if (selectedPaper?.id === deleteDialog.id) {
          setSelectedPaper(null);
          setItems([]);
          setOnlyNeedsReview(false);
        }
      } else {
        await questionBankAPI.deleteItem(deleteDialog.id);
        setItems(prev => prev.filter(i => i.id !== deleteDialog.id));
        setBankItems(prev => prev.filter(i => i.id !== deleteDialog.id));
      }
      setDeleteDialog({ open: false, type: '', id: null, label: '' });
    } catch (e) {
      console.error('삭제 실패', e);
    } finally {
      setDeleting(false);
    }
  };

  // ── 파일 검증 / 업로드 ───────────────────────────────────────────────────
  const validateFile = (f) => {
    if (!ALLOWED_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext)))
      return 'PDF, PNG, JPG/JPEG 형식만 업로드 가능합니다.';
    if (f.size > MAX_SIZE_MB * 1024 * 1024)
      return `파일 크기는 ${MAX_SIZE_MB}MB 이하여야 합니다.`;
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
    if (f) {
      const err = validateFile(f);
      setFileError(err);
      if (!err) setFile(f);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFormChange = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleUpload = async () => {
    const errs = {};
    if (!file) setFileError('파일을 선택해주세요.');
    if (!form.grade)          errs.grade   = '필수 입력 항목입니다.';
    if (!form.examName.trim()) errs.examName = '필수 입력 항목입니다.';
    if (!form.examType)       errs.examType = '필수 입력 항목입니다.';
    setErrors(errs);
    if (Object.keys(errs).length > 0 || !file || fileError) return;

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', form.examName);
      fd.append('subject', '영어');
      if (form.grade)    fd.append('grade', form.grade);
      if (form.year)     fd.append('source_year', form.year);
      if (form.examType) fd.append('source_type', form.examType);
      if (form.source)   fd.append('source', form.source);
      if (form.note)     fd.append('memo', form.note);

      await questionBankAPI.upload(fd);
      setFile(null); setForm(EMPTY_FORM); setErrors({}); setFileError('');
      setUploadSuccess(true);
      setTimeout(() => { setUploadSuccess(false); setSubTab(1); }, 1500);
    } catch (e) {
      console.error('업로드 실패', e);
      if (!e.response) {
        // 네트워크 오류 — 서버는 파일을 수신했을 가능성이 높음
        setFile(null); setForm(EMPTY_FORM); setErrors({}); setFileError('');
        setTimeout(() => { setSubTab(1); }, 800);
      } else {
        setFileError(`업로드 중 오류가 발생했습니다. (${e.response.status})`);
      }
    } finally {
      setUploading(false);
    }
  };

  // ── 공통 sx ──────────────────────────────────────────────────────────────
  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: '#18181B', borderRadius: 1.5, color: 'rgba(255,255,255,0.85)', fontSize: '0.875rem',
      '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
      '&:hover fieldset': { borderColor: 'rgba(167,139,250,0.3)' },
      '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
    },
    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)', fontSize: '0.875rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: '#a78bfa' },
    '& .MuiFormHelperText-root': { color: '#f87171', fontSize: '0.75rem', mx: 0 },
    '& .MuiSelect-icon': { color: 'rgba(255,255,255,0.4)' },
  };

  const colHSx = {
    fontSize: '0.7rem', fontWeight: 700, color: '#52525B', textTransform: 'uppercase',
    letterSpacing: '0.05em', bgcolor: '#111113',
    borderBottom: '1px solid rgba(255,255,255,0.06)', py: 1.5, px: 2, whiteSpace: 'nowrap',
  };

  const cellSx = {
    borderBottom: '1px solid rgba(255,255,255,0.04)', py: 1.25, px: 2,
    color: 'rgba(255,255,255,0.6)', fontSize: '0.8125rem', whiteSpace: 'nowrap',
  };

  const subTabSx = (active) => ({
    px: 2.5, py: 1, borderRadius: '10px', cursor: 'pointer',
    fontSize: '0.8125rem', fontWeight: 600, transition: 'all 0.2s',
    bgcolor: active ? 'rgba(167,139,250,0.12)' : 'transparent',
    color: active ? '#a78bfa' : '#71717A',
    border: active ? '1px solid rgba(167,139,250,0.25)' : '1px solid transparent',
    '&:hover': { bgcolor: 'rgba(167,139,250,0.08)', color: '#c4b5fd' },
  });

  // ── 문제은행 필터 ─────────────────────────────────────────────────────────
  const uniqueSubjects = [...new Set(bankItems.map(i => i.paper_subject).filter(Boolean))];
  const uniqueGrades   = [...new Set(bankItems.map(i => i.paper_grade).filter(Boolean))];
  const filteredBank   = bankItems.filter(item => {
    if (bankFilters.subject      && item.paper_subject !== bankFilters.subject)      return false;
    if (bankFilters.grade        && item.paper_grade   !== bankFilters.grade)        return false;
    if (bankFilters.area         && item.area          !== bankFilters.area)         return false;
    if (bankFilters.difficulty   && item.difficulty    !== bankFilters.difficulty)   return false;
    return true;
  });

  // 검수 되돌리기
  const handleRevertBankItem = async (item) => {
    if (!window.confirm('이 문항을 검수 대기 상태로 되돌릴까요?')) return;
    setRevertingBankItem(true);
    try {
      await questionBankAPI.updateItem(item.id, { review_status: 'pending' });
      setSelectedBankItem(null);
      await loadBankItems();
    } catch (e) {
      console.error('검수 되돌리기 실패', e);
    } finally {
      setRevertingBankItem(false);
    }
  };

  // 문제지 인쇄 미리보기
  const openPrintPreview = () => {
const filterDesc = [
      bankFilters.subject    && `과목: ${bankFilters.subject}`,
      bankFilters.grade      && `학년: ${bankFilters.grade}`,
      bankFilters.area       && `영역: ${bankFilters.area}`,
      bankFilters.difficulty && `난이도: ${bankFilters.difficulty}`,
    ].filter(Boolean).join(' | ') || '전체';

    const questionsHTML = filteredBank.map((item, idx) => {
      const num = idx + 1;
      const score = item.score_point ? `<span class="score">[${item.score_point}점]</span>` : '';
      const body = item.question_body
        ? `<div class="body">${item.question_body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div>`
        : '';
      const choices = Array.isArray(item.choices) && item.choices.length > 0
        ? `<div class="choices">${item.choices.map((c)=>`<div class="choice">${c.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`).join('')}</div>`
        : '';
      return `<div class="question"><p class="qnum">${num}. ${score}</p>${body}${choices}</div>`;
    }).join('');

    const answerRows = filteredBank
      .map((item, idx) => item.answer ? `<span class="ans">${idx+1}.&nbsp;${item.answer}</span>` : null)
      .filter(Boolean).join('');
    const answerSection = printWithAnswers && answerRows
      ? `<div class="answer-section"><h2>정 답</h2><div class="ans-grid">${answerRows}</div></div>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>문제 목록 출력지</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Nanum Gothic',sans-serif;font-size:10.5pt;color:#111;background:#fff}
.page{max-width:190mm;margin:0 auto;padding:16mm 14mm}
.header{border-bottom:2.5px solid #111;padding-bottom:8px;margin-bottom:16px;text-align:center}
.header h1{font-size:16pt;font-weight:700;letter-spacing:.04em}
.header .meta{font-size:8.5pt;color:#555;margin-top:4px}
.questions-wrap{
  column-count:2;
  column-gap:10mm;
  column-rule:1px solid #ccc;
}
.question{
  margin-bottom:14px;
  break-inside:avoid;
  page-break-inside:avoid;
  display:inline-block;
  width:100%;
}
.qnum{font-weight:700;font-size:10.5pt;margin-bottom:3px}
.score{font-size:9pt;color:#777;font-weight:400;margin-left:4px}
.body{font-size:10pt;line-height:1.65;margin:4px 0 6px 12px;white-space:pre-wrap;word-break:break-word}
.choices{margin-left:12px;display:flex;flex-direction:column;gap:2px}
.choice{font-size:10pt;line-height:1.55}
.answer-section{margin-top:24px;border-top:1.5px solid #aaa;padding-top:12px}
.answer-section h2{font-size:10.5pt;font-weight:700;margin-bottom:8px}
.ans-grid{display:flex;flex-wrap:wrap;gap:3px 16px;font-size:9.5pt}
.ans{white-space:nowrap}
@media print{
  @page{size:A4;margin:14mm 12mm}
  body{-webkit-print-color-adjust:exact}
  .page{padding:0;max-width:100%}
  .questions-wrap{column-count:2}
  .question{break-inside:avoid;page-break-inside:avoid}
  .answer-section{break-before:avoid}
}
</style></head>
<body><div class="page">
<div class="header">
  <h1>문제 목록 출력지</h1>
  <p class="meta">${filterDesc}&nbsp;&nbsp;|&nbsp;&nbsp;총 ${filteredBank.length}문항&nbsp;&nbsp;|&nbsp;&nbsp;${new Date().toLocaleDateString('ko-KR')}</p>
</div>
<div class="questions-wrap">
${questionsHTML}
</div>
${answerSection}
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const menuItemSx = { bgcolor: '#18181B', color: 'rgba(255,255,255,0.85)', fontSize: '0.875rem', '&:hover': { bgcolor: 'rgba(167,139,250,0.08)' } };

  // ── 검수 상태 헬퍼 ────────────────────────────────────────────────────────
  // DB enum(pending/reviewed)과 classifier_reason으로 3단계 시각 상태를 파생한다.
  // DB 스키마 변경 없이 프론트에서만 해석하는 규칙:
  //   reviewed                         → "검수 완료"
  //   pending + [검수 필요] in reason  → "우선 확인 필요"
  //   pending + no flag                → "검수 대기"
  const getReviewState = (item) => {
    if (item.review_status === 'reviewed') return 'reviewed';
    if (item.classifier_reason?.includes('[검수 필요]')) return 'needs_review';
    return 'pending';
  };

  const extractIssue = (reason) => {
    if (!reason) return '';
    const body = reason.startsWith('[검수 필요] ') ? reason.slice('[검수 필요] '.length) : reason;
    const pipeIdx = body.indexOf(' | ');
    return pipeIdx >= 0 ? body.slice(0, pipeIdx) : body;
  };

  const needsReviewCount = items.filter(i => getReviewState(i) === 'needs_review').length;
  const pendingCount     = items.filter(i => getReviewState(i) === 'pending').length;
  const reviewedCount    = items.filter(i => getReviewState(i) === 'reviewed').length;

  const sortedItems = [...items].sort((a, b) => {
    const order = { needs_review: 0, pending: 1, reviewed: 2 };
    return order[getReviewState(a)] - order[getReviewState(b)];
  });

  const displayItems = onlyNeedsReview
    ? sortedItems.filter(i => getReviewState(i) === 'needs_review')
    : sortedItems;

  const handleApproveAll = async () => {
    setApprovingAll(true);
    try {
      const targets = items.filter(i => i.review_status !== 'reviewed');
      const updated = await Promise.all(
        targets.map(item =>
          questionBankAPI.updateItem(item.id, { review_status: 'reviewed' }).then(r => r.data)
        )
      );
      setItems(prev => {
        const map = Object.fromEntries(updated.map(u => [u.id, u]));
        return prev.map(i => map[i.id] ?? i);
      });
    } catch (e) {
      console.error('전체 검수 완료 실패', e);
    } finally {
      setApprovingAll(false);
      setApproveAllOpen(false);
    }
  };

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <Box>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Box sx={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <QuizIcon sx={{ fontSize: 18, color: '#fff' }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#FAFAFA' }}>기출문제 분석</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#71717A' }}>시험지를 업로드하고 문항을 자동 분류·관리합니다</Typography>
        </Box>
      </Box>

      {/* 서브탭 */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
        {['파일 업로드', '분석 이력', '문제 목록'].map((label, i) => (
          <Box key={i} onClick={() => { setSubTab(i); setSelectedPaper(null); setSelectedItems(new Set()); }} sx={subTabSx(subTab === i)}>
            {label}
          </Box>
        ))}
      </Box>

      {/* ══════════════════════════════════════════════════════
          탭 0: 파일 업로드
      ══════════════════════════════════════════════════════ */}
      {subTab === 0 && (
        <Box>
          {uploadSuccess && (
            <Alert severity="success" sx={{ mb: 3, bgcolor: 'rgba(34,197,94,0.1)', color: '#86efac', border: '1px solid rgba(34,197,94,0.3)', '& .MuiAlert-icon': { color: '#86efac' } }}>
              파일이 업로드되었습니다. 분석 이력에서 진행 상태를 확인하세요.
            </Alert>
          )}
          <Box sx={{ bgcolor: '#18181B', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', p: 3 }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: '0.9375rem', mb: 2.5 }}>
              파일 업로드
            </Typography>

            {/* 드롭존 */}
            <Box
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => !file && fileInputRef.current?.click()}
              sx={{
                border: `2px dashed ${isDragging ? '#a78bfa' : fileError ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 2.5, p: 4, mb: 2, textAlign: 'center',
                cursor: file ? 'default' : 'pointer', bgcolor: '#111115',
                bgcolor: isDragging ? 'rgba(167,139,250,0.05)' : '#111115',
                transition: 'all 0.2s',
                '&:hover': !file ? { borderColor: 'rgba(167,139,250,0.4)', bgcolor: 'rgba(167,139,250,0.03)' } : {},
              }}
            >
              <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }}
                onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])} />
              {file ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
                  <InsertDriveFileIcon sx={{ color: '#a78bfa', fontSize: 28 }} />
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: '0.875rem' }}>{file.name}</Typography>
                    <Typography sx={{ color: '#52525B', fontSize: '0.75rem' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</Typography>
                  </Box>
                  <Box onClick={(e) => { e.stopPropagation(); setFile(null); setFileError(''); }}
                    sx={{ ml: 1, p: 0.5, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(239,68,68,0.1)' } }}>
                    <CloseIcon sx={{ fontSize: 16, color: '#71717A' }} />
                  </Box>
                </Box>
              ) : (
                <>
                  <CloudUploadIcon sx={{ fontSize: 40, color: isDragging ? '#a78bfa' : '#3F3F46', mb: 1.5 }} />
                  <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: '0.875rem', mb: 0.5 }}>
                    파일을 드래그하거나 클릭하여 선택
                  </Typography>
                  <Typography sx={{ color: '#52525B', fontSize: '0.75rem' }}>PDF, PNG, JPG/JPEG · 최대 {MAX_SIZE_MB}MB</Typography>
                </>
              )}
            </Box>
            {fileError && <Typography sx={{ color: '#f87171', fontSize: '0.75rem', mb: 2, mt: -1 }}>{fileError}</Typography>}

            {/* 메타데이터 폼 */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="과목" placeholder="예: 영어" value={form.subject} onChange={handleFormChange('subject')}
                  error={!!errors.subject} helperText={errors.subject} sx={inputSx} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!errors.grade} sx={inputSx}>
                  <InputLabel shrink>학년</InputLabel>
                  <Select value={form.grade} onChange={handleFormChange('grade')} label="학년" displayEmpty sx={{ color: form.grade ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)' }}>
                    <MenuItem value="" disabled sx={{ color: '#52525B' }}>선택</MenuItem>
                    {GRADE_OPTIONS.map(g => <MenuItem key={g} value={g} sx={menuItemSx}>{g}</MenuItem>)}
                  </Select>
                  {errors.grade && <FormHelperText>{errors.grade}</FormHelperText>}
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="시험명" placeholder="예: 2025년 3월 모의고사" value={form.examName} onChange={handleFormChange('examName')}
                  error={!!errors.examName} helperText={errors.examName} sx={inputSx} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!errors.examType} sx={inputSx}>
                  <InputLabel shrink>시험 구분</InputLabel>
                  <Select value={form.examType} onChange={handleFormChange('examType')} label="시험 구분" displayEmpty sx={{ color: form.examType ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)' }}>
                    <MenuItem value="" disabled sx={{ color: '#52525B' }}>선택</MenuItem>
                    {EXAM_TYPE_OPTIONS.map(t => <MenuItem key={t} value={t} sx={menuItemSx}>{t}</MenuItem>)}
                  </Select>
                  {errors.examType && <FormHelperText>{errors.examType}</FormHelperText>}
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth sx={inputSx}>
                  <InputLabel shrink>시행 연도 (선택)</InputLabel>
                  <Select value={form.year} onChange={handleFormChange('year')} label="시행 연도 (선택)" displayEmpty sx={{ color: form.year ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)' }}>
                    <MenuItem value="" sx={{ color: '#52525B', fontSize: '0.875rem' }}>선택 안 함</MenuItem>
                    {YEAR_OPTIONS.map(y => <MenuItem key={y} value={y} sx={menuItemSx}>{y}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="출처 (선택)" placeholder="예: 한국교육과정평가원" value={form.source} onChange={handleFormChange('source')}
                  sx={inputSx} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="비고 (선택)" placeholder="추가 메모" value={form.note} onChange={handleFormChange('note')}
                  multiline rows={2} sx={inputSx} InputLabelProps={{ shrink: true }} />
              </Grid>
            </Grid>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2.5 }}>
              <Button variant="contained" onClick={handleUpload} disabled={uploading}
                startIcon={uploading ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : <CloudUploadIcon />}
                sx={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                  '&:hover': { background: 'linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%)' },
                  '&:disabled': { background: 'rgba(167,139,250,0.3)', color: 'rgba(255,255,255,0.4)' },
                  fontWeight: 600, borderRadius: 2, px: 3, py: 1, textTransform: 'none', fontSize: '0.875rem',
                }}>
                {uploading ? '업로드 중...' : '업로드 및 분석 시작'}
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* ══════════════════════════════════════════════════════
          탭 1-A: 분석 이력 (paper 미선택)
      ══════════════════════════════════════════════════════ */}
      {subTab === 1 && !selectedPaper && (
        <Box sx={{ bgcolor: '#18181B', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <Box sx={{ px: 3, py: 2, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: '0.9375rem' }}>분석 이력</Typography>
            <Typography sx={{ color: '#52525B', fontSize: '0.75rem' }}>총 {history.length}건</Typography>
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
                    {['시험명','과목','학년','파일명','상태','업로드일','작업'].map(h => (
                      <TableCell key={h} sx={colHSx}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history.map((paper, idx) => {
                    const statusLabel = STATUS_MAP[paper.status] || paper.status;
                    const canView = paper.status === 'done';
                    const uploadedAt = paper.created_at
                      ? new Date(paper.created_at).toLocaleString('ko-KR', { hour12: false }).slice(0, 16)
                      : '-';
                    return (
                      <TableRow key={paper.id} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' }, bgcolor: idx % 2 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                        <TableCell sx={{ ...cellSx, color: 'rgba(255,255,255,0.85)', fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {paper.title}
                        </TableCell>
                        <TableCell sx={cellSx}>{paper.subject}</TableCell>
                        <TableCell sx={cellSx}>{paper.grade || '-'}</TableCell>
                        <TableCell sx={{ ...cellSx, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <InsertDriveFileIcon sx={{ fontSize: 14, color: '#52525B', flexShrink: 0 }} />
                            <Typography sx={{ color: '#71717A', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {paper.file_name || '-'}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ ...cellSx, minWidth: 120 }}>
                          <StatusChip status={statusLabel} />
                          {paper.status === 'failed' && paper.error_message && (
                            <Typography sx={{ color: '#f87171', fontSize: '0.6875rem', mt: 0.5, maxWidth: 200, whiteSpace: 'normal', lineHeight: 1.3 }}>
                              {paper.error_message}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, color: '#52525B', fontSize: '0.75rem' }}>{uploadedAt}</TableCell>
                        <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'flex', gap: 0.75 }}>
                            <Button size="small" disabled={!canView} onClick={() => handleViewResult(paper)}
                              sx={{
                                fontSize: '0.75rem', fontWeight: 600, px: 1.5, py: 0.5, borderRadius: '8px', textTransform: 'none',
                                bgcolor: canView ? 'rgba(167,139,250,0.1)' : 'transparent',
                                color: canView ? '#a78bfa' : '#3F3F46',
                                border: canView ? '1px solid rgba(167,139,250,0.25)' : '1px solid rgba(255,255,255,0.06)',
                                '&:hover': canView ? { bgcolor: 'rgba(167,139,250,0.18)' } : {},
                                '&.Mui-disabled': { color: '#3F3F46', border: '1px solid rgba(255,255,255,0.04)' },
                              }}>
                              결과 보기
                            </Button>
                            <Button size="small"
                              onClick={() => setDeleteDialog({ open: true, type: 'paper', id: paper.id, label: paper.title })}
                              sx={{
                                fontSize: '0.75rem', fontWeight: 600, px: 1.5, py: 0.5, borderRadius: '8px', textTransform: 'none',
                                bgcolor: 'rgba(239,68,68,0.08)', color: '#fca5a5',
                                border: '1px solid rgba(239,68,68,0.2)',
                                '&:hover': { bgcolor: 'rgba(239,68,68,0.15)' },
                              }}>
                              삭제
                            </Button>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </Box>
      )}

      {/* ══════════════════════════════════════════════════════
          탭 1-B: 분석 결과 (paper 선택됨)
      ══════════════════════════════════════════════════════ */}
      {subTab === 1 && selectedPaper && (
        <Box>
          {/* 브레드크럼 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
            <Button onClick={() => { setSelectedPaper(null); setItems([]); setOnlyNeedsReview(false); setSelectedItems(new Set()); }}
              startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
              sx={{ color: '#71717A', fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none', px: 1, borderRadius: '8px', '&:hover': { bgcolor: 'rgba(255,255,255,0.04)', color: '#a78bfa' } }}>
              분석 이력
            </Button>
            <Typography sx={{ color: '#3F3F46' }}>/</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.875rem', fontWeight: 600 }}>{selectedPaper.title}</Typography>
            <Chip label={`${selectedPaper.subject} · ${selectedPaper.grade || '-'}`} size="small"
              sx={{ height: 20, bgcolor: 'rgba(167,139,250,0.1)', color: '#a78bfa', fontSize: '0.6875rem', border: '1px solid rgba(167,139,250,0.2)', '& .MuiChip-label': { px: 1 } }} />
            {selectedPaper.total_questions != null && (
              <Typography sx={{ color: '#52525B', fontSize: '0.75rem', ml: 'auto' }}>총 {selectedPaper.total_questions}문항</Typography>
            )}
          </Box>

          {/* 검수 현황 통계 + 필터 컨트롤 */}
          {!itemsLoading && items.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
              {(() => {
                const selectableIds = displayItems.filter(i => i.review_status !== 'reviewed').map(i => i.id);
                const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedItems.has(id));
                const someSelected = !allSelected && selectableIds.some(id => selectedItems.has(id));
                return selectableIds.length > 0 ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Checkbox
                      size="small"
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={() => {
                        if (allSelected) {
                          setSelectedItems(prev => {
                            const next = new Set(prev);
                            selectableIds.forEach(id => next.delete(id));
                            return next;
                          });
                        } else {
                          setSelectedItems(prev => new Set([...prev, ...selectableIds]));
                        }
                      }}
                      sx={{
                        p: 0, color: 'rgba(255,255,255,0.2)',
                        '&.Mui-checked': { color: '#a78bfa' },
                        '&.MuiCheckbox-indeterminate': { color: '#a78bfa' },
                      }}
                    />
                    <Typography sx={{ color: '#71717A', fontSize: '0.75rem' }}>전체 선택</Typography>
                  </Box>
                ) : null;
              })()}
              {needsReviewCount > 0 && (
                <Typography sx={{ color: '#fca5a5', fontSize: '0.75rem', fontWeight: 600 }}>
                  ⚠ 우선 확인 {needsReviewCount}건
                </Typography>
              )}
              <Typography sx={{ color: '#71717A', fontSize: '0.75rem' }}>검수 대기 {pendingCount}건</Typography>
              <Typography sx={{ color: '#86efac', fontSize: '0.75rem' }}>검수 완료 {reviewedCount}건</Typography>
              {selectedItems.size > 0 && (
                <Typography sx={{ color: '#a78bfa', fontSize: '0.75rem', fontWeight: 600 }}>
                  선택 {selectedItems.size}개
                </Typography>
              )}
              <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                {needsReviewCount > 0 && (
                  <Button size="small" onClick={() => setOnlyNeedsReview(v => !v)}
                    sx={{
                      fontSize: '0.75rem', fontWeight: 600, px: 1.5, py: 0.5, borderRadius: '8px', textTransform: 'none',
                      bgcolor: onlyNeedsReview ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
                      color: onlyNeedsReview ? '#fca5a5' : '#71717A',
                      border: onlyNeedsReview ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.08)',
                      '&:hover': { bgcolor: onlyNeedsReview ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.08)' },
                    }}>
                    {onlyNeedsReview ? '전체 보기' : '우선 확인만 보기'}
                  </Button>
                )}
                {selectedItems.size > 0 && (
                  <Button size="small" disabled={approvingSelected} onClick={handleApproveSelected}
                    sx={{
                      fontSize: '0.75rem', fontWeight: 600, px: 1.5, py: 0.5, borderRadius: '8px', textTransform: 'none',
                      bgcolor: 'rgba(167,139,250,0.1)', color: '#a78bfa',
                      border: '1px solid rgba(167,139,250,0.25)',
                      '&:hover': { bgcolor: 'rgba(167,139,250,0.18)' },
                      '&.Mui-disabled': { opacity: 0.5 },
                    }}>
                    {approvingSelected ? '처리 중...' : `선택 검수 완료 (${selectedItems.size})`}
                  </Button>
                )}
                {items.some(i => i.review_status !== 'reviewed') && (
                  <Button size="small" onClick={() => setApproveAllOpen(true)}
                    sx={{
                      fontSize: '0.75rem', fontWeight: 600, px: 1.5, py: 0.5, borderRadius: '8px', textTransform: 'none',
                      bgcolor: 'rgba(34,197,94,0.08)', color: '#86efac',
                      border: '1px solid rgba(34,197,94,0.2)',
                      '&:hover': { bgcolor: 'rgba(34,197,94,0.15)' },
                    }}>
                    전체 검수 완료
                  </Button>
                )}
              </Box>
            </Box>
          )}

          {itemsLoading ? (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <CircularProgress size={32} sx={{ color: '#a78bfa' }} />
              <Typography sx={{ color: '#52525B', fontSize: '0.875rem', mt: 2 }}>문항 불러오는 중...</Typography>
            </Box>
          ) : items.length === 0 ? (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography sx={{ color: '#52525B', fontSize: '0.875rem' }}>저장된 문항이 없습니다.</Typography>
            </Box>
          ) : displayItems.length === 0 ? (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography sx={{ color: '#52525B', fontSize: '0.875rem' }}>우선 확인 필요 문항이 없습니다.</Typography>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {displayItems.map(item => {
                const rs = getReviewState(item);
                return (
                  <Grid item xs={12} md={6} key={item.id}>
                    <Box sx={{
                      bgcolor: '#18181B', borderRadius: '16px', p: 2.5,
                      border: rs === 'reviewed'
                        ? '1px solid rgba(34,197,94,0.25)'
                        : rs === 'needs_review'
                        ? '1px solid rgba(239,68,68,0.3)'
                        : '1px solid rgba(255,255,255,0.06)',
                      display: 'flex', flexDirection: 'column', gap: 1.5,
                    }}>
                      {/* 카드 헤더 */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Checkbox
                          size="small"
                          disabled={rs === 'reviewed'}
                          checked={selectedItems.has(item.id)}
                          onChange={() => toggleSelectItem(item.id)}
                          sx={{
                            p: 0, color: 'rgba(255,255,255,0.2)',
                            '&.Mui-checked': { color: '#a78bfa' },
                            '&.Mui-disabled': { color: 'rgba(255,255,255,0.08)' },
                          }}
                        />
                        <Typography sx={{ color: '#FAFAFA', fontWeight: 700, fontSize: '0.9375rem' }}>
                          {item.question_number}번
                        </Typography>
                        {item.area && (
                          <Chip label={item.area} size="small" sx={{ height: 20, bgcolor: 'rgba(167,139,250,0.1)', color: '#a78bfa', fontSize: '0.625rem', border: '1px solid rgba(167,139,250,0.2)', '& .MuiChip-label': { px: 0.75 } }} />
                        )}
                        <DiffChip v={item.difficulty} />
                        {item.score_point && (
                          <Typography sx={{ color: '#52525B', fontSize: '0.75rem' }}>{item.score_point}점</Typography>
                        )}
                        <Box sx={{ ml: 'auto' }}>
                          {rs === 'reviewed' && (
                            <Chip label="검수 완료" size="small" sx={{ height: 20, bgcolor: 'rgba(34,197,94,0.1)', color: '#86efac', fontSize: '0.625rem', border: '1px solid rgba(34,197,94,0.2)', '& .MuiChip-label': { px: 0.75 } }} />
                          )}
                          {rs === 'needs_review' && (
                            <Chip label="우선 확인 필요" size="small" sx={{ height: 20, bgcolor: 'rgba(239,68,68,0.1)', color: '#fca5a5', fontSize: '0.625rem', border: '1px solid rgba(239,68,68,0.25)', '& .MuiChip-label': { px: 0.75 } }} />
                          )}
                          {rs === 'pending' && (
                            <Chip label="검수 대기" size="small" sx={{ height: 20, bgcolor: 'rgba(234,179,8,0.1)', color: '#fde047', fontSize: '0.625rem', border: '1px solid rgba(234,179,8,0.2)', '& .MuiChip-label': { px: 0.75 } }} />
                          )}
                        </Box>
                      </Box>

                      {/* 우선 확인 필요 사유 — taxonomy 불일치·필드 누락 등 자동 검증 결과 */}
                      {rs === 'needs_review' && (
                        <Box sx={{ bgcolor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 1.5, px: 1.5, py: 1 }}>
                          <Typography sx={{ color: '#fca5a5', fontSize: '0.6875rem', lineHeight: 1.5 }}>
                            ⚠ {extractIssue(item.classifier_reason)}
                          </Typography>
                        </Box>
                      )}

                      {item.question_body && (
                        <Box sx={{ bgcolor: '#111115', borderRadius: 1.5, p: 1.5 }}>
                          <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8125rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                            {item.question_body}
                          </Typography>
                        </Box>
                      )}

                      {Array.isArray(item.choices) && item.choices.length > 0 && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, pl: 0.5 }}>
                          {item.choices.map((c, ci) => (
                            <Typography key={ci} sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8125rem' }}>{c}</Typography>
                          ))}
                        </Box>
                      )}

                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button size="small" onClick={() => openEdit(item)}
                          sx={{ fontSize: '0.75rem', fontWeight: 600, px: 1.5, py: 0.5, borderRadius: '8px', textTransform: 'none', bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                          수정
                        </Button>
                        <Button size="small" disabled={rs === 'reviewed'} onClick={() => handleReview(item.id)}
                          title="AI 분류 결과를 확인 후 승인하세요"
                          sx={{
                            fontSize: '0.75rem', fontWeight: 600, px: 1.5, py: 0.5, borderRadius: '8px', textTransform: 'none',
                            bgcolor: rs === 'reviewed' ? 'transparent' : 'rgba(34,197,94,0.1)',
                            color: rs === 'reviewed' ? '#3F3F46' : '#86efac',
                            border: rs === 'reviewed' ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(34,197,94,0.2)',
                            '&:hover': rs !== 'reviewed' ? { bgcolor: 'rgba(34,197,94,0.18)' } : {},
                            '&.Mui-disabled': { color: '#3F3F46' },
                          }}>
                          검수 완료
                        </Button>
                        <Button size="small"
                          onClick={() => setDeleteDialog({ open: true, type: 'item', id: item.id, label: `${item.question_number}번` })}
                          sx={{
                            fontSize: '0.75rem', fontWeight: 600, px: 1.5, py: 0.5, borderRadius: '8px', textTransform: 'none',
                            bgcolor: 'rgba(239,68,68,0.08)', color: '#fca5a5',
                            border: '1px solid rgba(239,68,68,0.2)',
                            '&:hover': { bgcolor: 'rgba(239,68,68,0.15)' },
                          }}>
                          삭제
                        </Button>
                      </Box>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      )}

      {/* ══════════════════════════════════════════════════════
          탭 2: 문제은행
      ══════════════════════════════════════════════════════ */}
      {subTab === 2 && (
        <Box>
          {/* 필터 */}
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { key: 'subject',    label: '과목',   options: uniqueSubjects },
              { key: 'grade',      label: '학년',   options: uniqueGrades },
              { key: 'difficulty', label: '난이도', options: DIFFICULTY_OPTIONS },
            ].map(({ key, label, options }) => (
              <FormControl key={key} size="small" sx={{ minWidth: 90, ...inputSx }}>
                <InputLabel shrink>{label}</InputLabel>
                <Select value={bankFilters[key]}
                  onChange={(e) => setBankFilters(prev => ({ ...prev, [key]: e.target.value }))}
                  label={label} displayEmpty
                  sx={{ color: bankFilters[key] ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)', fontSize: '0.8125rem' }}>
                  <MenuItem value="" sx={{ color: '#71717A', fontSize: '0.8125rem' }}>전체</MenuItem>
                  {options.map(opt => <MenuItem key={opt} value={opt} sx={{ ...menuItemSx, fontSize: '0.8125rem' }}>{opt}</MenuItem>)}
                </Select>
              </FormControl>
            ))}
            <FormControl size="small" sx={{ minWidth: 90, ...inputSx }}>
              <InputLabel shrink>유형</InputLabel>
              <Select value={bankFilters.area}
                onChange={(e) => setBankFilters(prev => ({ ...prev, area: e.target.value }))}
                label="유형" displayEmpty
                sx={{ color: bankFilters.area ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)', fontSize: '0.8125rem' }}>
                <MenuItem value="" sx={{ color: '#71717A', fontSize: '0.8125rem' }}>전체</MenuItem>
                {AREA_OPTIONS.map(a => <MenuItem key={a} value={a} sx={{ ...menuItemSx, fontSize: '0.8125rem' }}>{a}</MenuItem>)}
              </Select>
            </FormControl>
            <Button size="small" onClick={() => setBankFilters({ subject:'', grade:'', area:'', difficulty:'' })}
              sx={{ color: '#52525B', fontSize: '0.75rem', textTransform: 'none', '&:hover': { color: '#a78bfa' } }}>
              초기화
            </Button>
            <Typography sx={{ color: '#52525B', fontSize: '0.75rem' }}>{filteredBank.length}건</Typography>
            {/* 정답 포함 토글 + 문제지 인쇄 */}
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer', userSelect: 'none' }}>
                <Box component="input" type="checkbox" checked={printWithAnswers}
                  onChange={(e) => setPrintWithAnswers(e.target.checked)}
                  sx={{ accentColor: '#a78bfa', width: 13, height: 13, cursor: 'pointer' }} />
                <Typography sx={{ color: '#A1A1AA', fontSize: '0.75rem' }}>정답 포함</Typography>
              </Box>
              <Button size="small" startIcon={<PrintIcon sx={{ fontSize: '0.875rem !important' }} />}
                onClick={openPrintPreview} disabled={filteredBank.length === 0}
                sx={{ color: '#a78bfa', fontSize: '0.75rem', textTransform: 'none', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 1.5, px: 1.5,
                  '&:hover': { bgcolor: 'rgba(167,139,250,0.08)' }, '&:disabled': { color: '#3f3f46', borderColor: 'rgba(255,255,255,0.06)' } }}>
                문제지 인쇄
              </Button>
            </Box>
          </Box>

          {/* 테이블 + 상세 패널 */}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            {/* 테이블 */}
            <Box sx={{ flex: 1, minWidth: 0, bgcolor: '#18181B', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              {bankLoading ? (
                <Box sx={{ py: 8, textAlign: 'center' }}>
                  <CircularProgress size={28} sx={{ color: '#a78bfa' }} />
                  <Typography sx={{ color: '#52525B', fontSize: '0.875rem', mt: 2 }}>불러오는 중...</Typography>
                </Box>
              ) : filteredBank.length === 0 ? (
                <Box sx={{ py: 8, textAlign: 'center' }}>
                  <Typography sx={{ color: '#52525B', fontSize: '0.875rem' }}>
                    {bankItems.length === 0 ? '검수 완료된 문항이 없습니다.' : '필터 조건에 맞는 문항이 없습니다.'}
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {['번호','시험명','과목','학년','유형','난이도','배점',''].map(h => (
                          <TableCell key={h} sx={colHSx}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredBank.map((item, idx) => {
                        const isSelected = selectedBankItem?.id === item.id;
                        return (
                          <TableRow key={item.id}
                            onClick={() => setSelectedBankItem(isSelected ? null : item)}
                            sx={{ cursor: 'pointer',
                              bgcolor: isSelected ? 'rgba(167,139,250,0.1)' : idx % 2 ? 'rgba(255,255,255,0.01)' : 'transparent',
                              '&:hover': { bgcolor: isSelected ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.03)' } }}>
                            <TableCell sx={{ ...cellSx, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{item.question_number}</TableCell>
                            <TableCell sx={{ ...cellSx, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.paper_title}</TableCell>
                            <TableCell sx={cellSx}>{item.paper_subject}</TableCell>
                            <TableCell sx={cellSx}>{item.paper_grade || '-'}</TableCell>
                            <TableCell sx={cellSx}>
                              {item.area && <Chip label={item.area} size="small" sx={{ height: 18, bgcolor: 'rgba(167,139,250,0.1)', color: '#a78bfa', fontSize: '0.625rem', border: '1px solid rgba(167,139,250,0.2)', '& .MuiChip-label': { px: 0.75 } }} />}
                            </TableCell>
                            <TableCell sx={cellSx}><DiffChip v={item.difficulty} /></TableCell>
                            <TableCell sx={{ ...cellSx, color: '#71717A' }}>{item.score_point ? `${item.score_point}점` : '-'}</TableCell>
                            <TableCell sx={{ ...cellSx, width: 32, p: '4px 8px' }}>
                              <VisibilityIcon sx={{ fontSize: '0.9rem', color: isSelected ? '#a78bfa' : '#3f3f46' }} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </Box>

            {/* 상세 패널 */}
            {selectedBankItem && (
              <Box sx={{ width: 360, flexShrink: 0, bgcolor: '#18181B', borderRadius: '16px',
                border: '1px solid rgba(167,139,250,0.25)', p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* 헤더 */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography sx={{ color: '#FAFAFA', fontWeight: 700, fontSize: '0.9375rem' }}>
                      {selectedBankItem.question_number}번 문항
                    </Typography>
                    <Typography sx={{ color: '#71717A', fontSize: '0.75rem', mt: 0.25 }}>
                      {selectedBankItem.paper_title}
                    </Typography>
                  </Box>
                  <Box component="button" onClick={() => setSelectedBankItem(null)}
                    sx={{ background: 'none', border: 'none', cursor: 'pointer', p: 0.5, color: '#52525B', '&:hover': { color: '#FAFAFA' } }}>
                    <CloseIcon sx={{ fontSize: '1rem' }} />
                  </Box>
                </Box>

                {/* 메타 칩 */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {[
                    { label: selectedBankItem.area, color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)' },
                  ].filter(c => c.label).map((c, i) => (
                    <Chip key={i} label={c.label} size="small" sx={{ height: 20, bgcolor: c.bg, color: c.color, fontSize: '0.6875rem', border: `1px solid ${c.border}`, '& .MuiChip-label': { px: 0.75 } }} />
                  ))}
                  {selectedBankItem.difficulty && <DiffChip v={selectedBankItem.difficulty} />}
                  {selectedBankItem.score_point && (
                    <Chip label={`${selectedBankItem.score_point}점`} size="small" sx={{ height: 20, bgcolor: 'rgba(255,255,255,0.05)', color: '#71717A', fontSize: '0.6875rem', border: '1px solid rgba(255,255,255,0.08)', '& .MuiChip-label': { px: 0.75 } }} />
                  )}
                </Box>

                {/* 문제 본문 */}
                {selectedBankItem.question_body && (
                  <Box>
                    <Typography sx={{ color: '#52525B', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.75 }}>문제 본문</Typography>
                    <Box sx={{ bgcolor: '#0F0F11', borderRadius: 1.5, p: 1.5, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8125rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {selectedBankItem.question_body}
                      </Typography>
                    </Box>
                  </Box>
                )}

                {/* 선택지 */}
                {selectedBankItem.choices && selectedBankItem.choices.length > 0 && (
                  <Box>
                    <Typography sx={{ color: '#52525B', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.75 }}>선택지</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      {selectedBankItem.choices.map((c, i) => {
                        const isCorrect = String(selectedBankItem.answer) === String(i + 1);
                        return (
                          <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start',
                            bgcolor: isCorrect ? 'rgba(34,197,94,0.08)' : 'transparent',
                            borderRadius: 1, px: 1, py: 0.5, border: isCorrect ? '1px solid rgba(34,197,94,0.2)' : '1px solid transparent' }}>
                            <Typography sx={{ color: isCorrect ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.65)', fontSize: '0.8125rem', lineHeight: 1.5 }}>
                              {c}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                )}

                {/* 정답 (선택지 없는 경우 또는 서술형) */}
                {selectedBankItem.answer && (!selectedBankItem.choices || selectedBankItem.choices.length === 0) && (
                  <Box>
                    <Typography sx={{ color: '#52525B', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.75 }}>정답</Typography>
                    <Box sx={{ bgcolor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 1.5, px: 1.5, py: 1 }}>
                      <Typography sx={{ color: '#86efac', fontSize: '0.875rem', fontWeight: 600 }}>
                        {selectedBankItem.answer}
                      </Typography>
                    </Box>
                  </Box>
                )}

                {/* 검수 되돌리기 */}
                <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.06)', pt: 1.5 }}>
                  <Button fullWidth size="small" disabled={revertingBankItem}
                    onClick={() => handleRevertBankItem(selectedBankItem)}
                    sx={{ color: '#f87171', fontSize: '0.75rem', textTransform: 'none',
                      border: '1px solid rgba(248,113,113,0.25)', borderRadius: 1.5,
                      '&:hover': { bgcolor: 'rgba(248,113,113,0.07)' },
                      '&:disabled': { color: '#3f3f46', borderColor: 'rgba(255,255,255,0.06)' } }}>
                    {revertingBankItem ? '처리 중...' : '검수 되돌리기'}
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* ══════════════════════════════════════════════════════
          수정 다이얼로그
      ══════════════════════════════════════════════════════ */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)}
        PaperProps={{ sx: { bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', minWidth: 400 } }}>
        <DialogTitle sx={{ color: '#FAFAFA', fontWeight: 700, fontSize: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', pb: 2 }}>
          문항 수정{editTarget ? ` — ${editTarget.question_number}번` : ''}
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField fullWidth label="질문 본문" multiline rows={4} value={editForm.question_body}
            onChange={(e) => setEditForm(p => ({ ...p, question_body: e.target.value }))}
            sx={inputSx} InputLabelProps={{ shrink: true }} />
          <TextField fullWidth label="선택지 (줄 단위로 입력)" multiline rows={4} value={editForm.choices}
            onChange={(e) => setEditForm(p => ({ ...p, choices: e.target.value }))}
            sx={inputSx} InputLabelProps={{ shrink: true }} />
          <TextField fullWidth label="정답" value={editForm.answer}
            onChange={(e) => setEditForm(p => ({ ...p, answer: e.target.value }))}
            sx={inputSx} InputLabelProps={{ shrink: true }} />
          <TextField fullWidth label="배점" type="number" value={editForm.score_point}
            onChange={(e) => setEditForm(p => ({ ...p, score_point: e.target.value }))}
            sx={inputSx} InputLabelProps={{ shrink: true }} />
          <FormControl fullWidth sx={inputSx}>
            <InputLabel shrink>유형</InputLabel>
            <Select value={editForm.area}
              onChange={(e) => setEditForm(p => ({ ...p, area: e.target.value }))}
              label="유형">
              {AREA_OPTIONS.map(a => <MenuItem key={a} value={a} sx={menuItemSx}>{a}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth sx={inputSx}>
            <InputLabel shrink>난이도</InputLabel>
            <Select value={editForm.difficulty}
              onChange={(e) => setEditForm(p => ({ ...p, difficulty: e.target.value }))}
              label="난이도">
              {DIFFICULTY_OPTIONS.map(d => <MenuItem key={d} value={d} sx={menuItemSx}>{d}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 2, borderTop: '1px solid rgba(255,255,255,0.06)', gap: 1 }}>
          <Button onClick={() => setEditOpen(false)} sx={{ color: '#71717A', textTransform: 'none', fontSize: '0.875rem' }}>취소</Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={saving}
            sx={{ background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)', '&:hover': { background: 'linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%)' }, fontWeight: 600, textTransform: 'none', fontSize: '0.875rem', borderRadius: '8px' }}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══════════════════════════════════════════════════════
          삭제 확인 다이얼로그
      ══════════════════════════════════════════════════════ */}
      <Dialog open={deleteDialog.open} onClose={() => !deleting && setDeleteDialog({ open: false, type: '', id: null, label: '' })}
        PaperProps={{ sx: { bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', minWidth: 360 } }}>
        <DialogTitle sx={{ color: '#FAFAFA', fontWeight: 700, fontSize: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', pb: 2 }}>
          {deleteDialog.type === 'paper' ? '시험지 삭제' : '문항 삭제'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.875rem', lineHeight: 1.6 }}>
            <span style={{ color: '#FAFAFA', fontWeight: 600 }}>"{deleteDialog.label}"</span>을 삭제합니다.
          </Typography>
          {deleteDialog.type === 'paper' && (
            <Typography sx={{ color: '#71717A', fontSize: '0.8125rem', lineHeight: 1.6 }}>
              연결된 문항 데이터도 함께 삭제됩니다.
            </Typography>
          )}
          <Box sx={{ bgcolor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 1.5, px: 1.5, py: 1 }}>
            <Typography sx={{ color: '#fca5a5', fontSize: '0.75rem' }}>
              이 작업은 되돌릴 수 없습니다.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 2, borderTop: '1px solid rgba(255,255,255,0.06)', gap: 1 }}>
          <Button onClick={() => setDeleteDialog({ open: false, type: '', id: null, label: '' })} disabled={deleting}
            sx={{ color: '#71717A', textTransform: 'none', fontSize: '0.875rem' }}>
            취소
          </Button>
          <Button variant="contained" onClick={handleDeleteConfirm} disabled={deleting}
            sx={{
              background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)' },
              '&.Mui-disabled': { background: 'rgba(239,68,68,0.2)', color: 'rgba(255,255,255,0.3)' },
              fontWeight: 600, textTransform: 'none', fontSize: '0.875rem', borderRadius: '8px',
            }}>
            {deleting ? '삭제 중...' : '삭제'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══════════════════════════════════════════════════════
          전체 검수 완료 확인 다이얼로그
      ══════════════════════════════════════════════════════ */}
      <Dialog open={approveAllOpen} onClose={() => !approvingAll && setApproveAllOpen(false)}
        PaperProps={{ sx: { bgcolor: '#18181B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', minWidth: 380 } }}>
        <DialogTitle sx={{ color: '#FAFAFA', fontWeight: 700, fontSize: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', pb: 2 }}>
          전체 검수 완료
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.875rem', lineHeight: 1.6 }}>
            AI 분류 결과를 확인 후 승인하세요.
          </Typography>
          <Typography sx={{ color: '#71717A', fontSize: '0.8125rem', lineHeight: 1.6 }}>
            검수 대기 중인{' '}
            <span style={{ color: '#FAFAFA', fontWeight: 600 }}>
              {items.filter(i => i.review_status !== 'reviewed').length}개
            </span>{' '}
            문항을 모두 검수 완료 처리합니다. 우선 확인 필요 문항도 포함됩니다.
          </Typography>
          <Box sx={{ bgcolor: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.15)', borderRadius: 1.5, px: 1.5, py: 1 }}>
            <Typography sx={{ color: '#fde047', fontSize: '0.75rem', lineHeight: 1.5 }}>
              AI가 틀릴 수 있습니다. 문제 목록 확정본으로 쓰려면 중요한 문항은 개별 확인을 권장합니다.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 2, borderTop: '1px solid rgba(255,255,255,0.06)', gap: 1 }}>
          <Button onClick={() => setApproveAllOpen(false)} disabled={approvingAll}
            sx={{ color: '#71717A', textTransform: 'none', fontSize: '0.875rem' }}>
            취소
          </Button>
          <Button variant="contained" onClick={handleApproveAll} disabled={approvingAll}
            sx={{
              background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)' },
              '&.Mui-disabled': { background: 'rgba(34,197,94,0.2)', color: 'rgba(255,255,255,0.3)' },
              fontWeight: 600, textTransform: 'none', fontSize: '0.875rem', borderRadius: '8px',
            }}>
            {approvingAll ? '처리 중...' : '확인했습니다, 전체 승인'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
