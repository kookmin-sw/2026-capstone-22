import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Box, TextField, Button, Typography, Paper, IconButton,
  CircularProgress, Fade, Slide, Tooltip, Avatar, Menu, MenuItem, Chip, Switch,
  Collapse, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControlLabel, Checkbox, Snackbar, Alert
} from '@mui/material';
import {
  Send, SmartToy, Person,
  Close, AttachFile, Mic, MicOff, Language, UploadFile,
  Description, MenuBook, ExpandMore, ExpandLess, ContentCopy, Check, Stop,
  Assignment, EventNote, Article, Notes, Feedback
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { chatAPI, modelAPI, promptTemplateAPI } from '../services/api';
import masLogoSquare from '../assets/mas-logo-square.png';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './ChatPage.css';

export default function ChatPage() {
  const { user, checkAuth } = useAuth();
  const { currentSlug, tenant } = useTenant();
  const outletContext = useOutletContext();
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [modelMenuAnchor, setModelMenuAnchor] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [expandedSources, setExpandedSources] = useState({});
  const [copiedMessageIdx, setCopiedMessageIdx] = useState(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackTargetMsg, setFeedbackTargetMsg] = useState(null);
  const [includeConversation, setIncludeConversation] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSnackbar, setFeedbackSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const feedbackTextRef = useRef(null);
  const [promptTemplates, setPromptTemplates] = useState([]);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);
  const recognitionRef = useRef(null);
  const abortControllerRef = useRef(null);
  // 첫 메시지로 새 세션 생성 시, setCurrentSessionId 변경이 loadSession을 트리거하지 않도록 막는 플래그
  const skipNextLoadRef = useRef(false);

  useEffect(() => {
    loadModels();
    loadPromptTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 본인 인증 후 탭 복귀 감지: VerifyPage에서 confirm API 성공 시 localStorage 플래그를 쓰고,
  // 이 탭이 다시 활성화될 때 플래그를 확인해 auth 갱신 + 성공 메시지 1회 표시
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;

      const flag = localStorage.getItem('verification_done');
      if (flag !== '1') return;

      localStorage.removeItem('verification_done');

      const updatedUser = await checkAuth();

      if (updatedUser?.has_verified_access) {
        const systemMsg = {
          role: 'assistant',
          content: '본인 인증이 완료되었습니다. 이제 학생 정보 관련 질문을 하실 수 있습니다.',
          created_at: new Date().toISOString(),
          isVerificationSuccess: true,
        };
        setMessages(prev => [...prev, systemMsg]);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [checkAuth]);

  // React to session changes from layout sidebar
  useEffect(() => {
    const sessionId = outletContext?.currentSessionId;
    if (sessionId) {
      if (skipNextLoadRef.current) {
        skipNextLoadRef.current = false;
        return;
      }
      loadSession(sessionId);
    } else if (sessionId === null) {
      // New chat requested
      setCurrentSession(null);
      setMessages([]);
      setSelectedFiles([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletContext?.currentSessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Web Speech API 초기화
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'ko-KR';

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          setInput(prev => prev + finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('음성 인식 오류:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // 음성 인식 토글
  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const copyMessageContent = async (content, idx) => {
    try {
      // HTTPS 환경에서는 Clipboard API 사용
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        // HTTP 환경 fallback: textarea를 이용한 복사
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedMessageIdx(idx);
      setTimeout(() => setCopiedMessageIdx(null), 2000);
    } catch (error) {
      console.error('복사 실패:', error);
    }
  };

  const openFeedbackDialog = (msg) => {
    setFeedbackTargetMsg(msg);
    setIncludeConversation(false);
    setFeedbackDialogOpen(true);
  };

  const handleSendFeedback = async () => {
    const text = feedbackTextRef.current?.value || '';
    if (!text.trim() || !feedbackTargetMsg) return;
    setFeedbackLoading(true);
    try {
      await chatAPI.sendFeedback({
        message_id: feedbackTargetMsg.id,
        feedback_text: text,
        include_conversation: includeConversation,
        session_id: currentSession?.id || null,
      });
      setFeedbackSnackbar({ open: true, message: '피드백이 전송되었습니다. 감사합니다!', severity: 'success' });
      setFeedbackDialogOpen(false);
    } catch (error) {
      const detail = error.response?.data?.detail || '피드백 전송에 실패했습니다.';
      setFeedbackSnackbar({ open: true, message: detail, severity: 'error' });
    } finally {
      setFeedbackLoading(false);
    }
  };

  const loadModels = async () => {
    try {
      const response = await modelAPI.list();
      setModels(response.data);
      if (user?.preferred_model) {
        setSelectedModel(user.preferred_model);
      } else if (response.data.length > 0) {
        // 기본 모델 선택 (is_default가 true인 모델 또는 첫 번째 모델)
        const defaultModel = response.data.find(m => m.is_default) || response.data[0];
        setSelectedModel(defaultModel.model_name);
      }
    } catch (error) {
      console.error('모델 로딩 오류:', error);
    }
  };

  const loadPromptTemplates = async () => {
    try {
      const response = await promptTemplateAPI.list();
      setPromptTemplates(response.data);
    } catch (error) {
      console.error('프롬프트 템플릿 로딩 오류:', error);
    }
  };

  // 프롬프트 템플릿 클릭 시 바로 전송
  const handleTemplateClick = async (templateId) => {
    if (isLoading || loadingTemplate) return;

    setLoadingTemplate(true);
    try {
      // 템플릿 전문 조회
      const response = await promptTemplateAPI.get(templateId);
      const content = response.data.content;

      // 입력창에 설정하고 바로 전송
      setInput(content);

      // 약간의 딜레이 후 전송 (상태 업데이트가 반영되도록)
      setTimeout(async () => {
        await sendMessageWithContent(content);
        setLoadingTemplate(false);
      }, 100);
    } catch (error) {
      console.error('템플릿 로딩 오류:', error);
      alert('템플릿을 불러오는데 실패했습니다.');
      setLoadingTemplate(false);
    }
  };

  // 지정된 내용으로 메시지 전송 (템플릿용)
  const sendMessageWithContent = async (content) => {
    if (!content.trim() || isLoading) return;

    setIsLoading(true);

    // AbortController 생성
    abortControllerRef.current = new AbortController();

    const tempUserMessage = {
      role: 'user',
      content: content,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMessage]);
    setInput('');

    try {
      setIsTyping(true);

      const response = await chatAPI.sendMessage({
        session_id: currentSession?.id,
        message: content,
        model: selectedModel || undefined,
        web_search_enabled: webSearchEnabled
      }, [], abortControllerRef.current.signal);

      const assistantMessage = {
        ...response.data.assistant_message,
        content: (response.data.assistant_message?.content || '').replace(/<!--\s*verify:\S+\s*-->/g, '').trim(),
        cited_sources: response.data.cited_sources || [],
        realtime_file_list: response.data.realtime_file_list || null,
        verification_required: response.data.verification_required || false,
        verification_url: response.data.verification_url || null,
      };

      setIsTyping(false);

      if (!currentSession) {
        // 새 세션 생성 시 setCurrentSessionId 변경으로 인한 loadSession 호출을 막는다
        skipNextLoadRef.current = true;
        setCurrentSession({ id: response.data.session_id });
        outletContext?.setCurrentSessionId?.(response.data.session_id);
        outletContext?.onSessionCreated?.();
      }

      setMessages(prev => {
        const withoutTemp = prev.slice(0, -1);
        return [...withoutTemp, response.data.user_message, assistantMessage];
      });
    } catch (error) {
      setIsTyping(false);
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        console.log('요청이 취소되었습니다.');
        setMessages(prev => prev.slice(0, -1));
      } else {
        console.error('메시지 전송 오류:', error);
        alert('오류: ' + (error.response?.data?.detail || '메시지 전송에 실패했습니다'));
        setMessages(prev => prev.slice(0, -1));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // 아이콘 이름으로 컴포넌트 반환
  const getIconComponent = (iconName) => {
    const iconMap = {
      'assignment': Assignment,
      'event_note': EventNote,
      'article': Article,
      'notes': Notes,
      'description': Description,
    };
    const IconComponent = iconMap[iconName] || Description;
    return <IconComponent sx={{ fontSize: 24 }} />;
  };

  const loadSession = async (sessionId) => {
    try {
      const response = await chatAPI.getSession(sessionId);
      setCurrentSession(response.data);
      // DB에서 불러온 메시지는 verification_required 필드가 없으므로
      // 메시지 content 안의 HTML 주석 패턴 <!-- verify:URL --> 으로 복원한다.
      const verifyCommentRegex = /<!--\s*verify:(\S+)\s*-->/;
      const messages = (response.data.messages || []).map(msg => {
        const match = msg.content && verifyCommentRegex.exec(msg.content);
        if (match) {
          return {
            ...msg,
            // 화면에 표시할 content에서 주석 제거
            content: msg.content.replace(verifyCommentRegex, '').trim(),
            verification_required: true,
            verification_url: match[1],
          };
        }
        return msg;
      });
      setMessages(messages);
    } catch (error) {
      console.error('세션 로딩 오류:', error);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
  };

  const removeFile = (index) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    if (files && files.length > 0) {
      setSelectedFiles(prevFiles => [...prevFiles, ...files]);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessageContent = input;
    const filesToUpload = selectedFiles;
    setSelectedFiles([]); // 파일 초기화
    setIsLoading(true);

    // AbortController 생성
    abortControllerRef.current = new AbortController();

    const tempUserMessage = {
      role: 'user',
      content: userMessageContent,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMessage]);

    try {
      setIsTyping(true);

      const response = await chatAPI.sendMessage({
        session_id: currentSession?.id,
        message: userMessageContent,
        model: selectedModel || undefined,
        web_search_enabled: webSearchEnabled
      }, filesToUpload, abortControllerRef.current.signal);

      // Add cited_sources and realtime_file_list to assistant message if available
      const assistantMessage = {
        ...response.data.assistant_message,
        content: (response.data.assistant_message?.content || '').replace(/<!--\s*verify:\S+\s*-->/g, '').trim(),
        cited_sources: response.data.cited_sources || [],
        realtime_file_list: response.data.realtime_file_list || null,
        verification_required: response.data.verification_required || false,
        verification_url: response.data.verification_url || null,
      };

      setIsTyping(false);

      if (!currentSession) {
        skipNextLoadRef.current = true;
        setCurrentSession({ id: response.data.session_id });
        outletContext?.setCurrentSessionId?.(response.data.session_id);
        outletContext?.onSessionCreated?.();
      }

      setMessages(prev => {
        const withoutTemp = prev.slice(0, -1);
        return [...withoutTemp, response.data.user_message, assistantMessage];
      });
    } catch (error) {
      setIsTyping(false);
      // 사용자가 취소한 경우
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        console.log('요청이 취소되었습니다.');
        setMessages(prev => prev.slice(0, -1));
      } else {
        console.error('메시지 전송 오류:', error);
        alert('오류: ' + (error.response?.data?.detail || '메시지 전송에 실패했습니다'));
        setMessages(prev => prev.slice(0, -1));
      }
    } finally {
      setInput(''); // 답변 완료 후 입력창 초기화
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const cancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  // Get display name from API model data
  const getModelDisplayName = (modelName) => {
    if (!modelName) return '모델 선택';

    // Find model in models array and use display_name
    const model = models.find(m => m.model_name === modelName);
    return model?.display_name || modelName;
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#F8FAFC' }}>
      {/* Main Content */}
      <Box
        sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag and Drop Overlay */}
        {isDragging && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: 'rgba(102, 126, 234, 0.1)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              border: '3px dashed rgba(102, 126, 234, 0.5)',
              borderRadius: 2,
            }}
          >
            <Box
              sx={{
                textAlign: 'center',
                color: 'white',
                p: 4,
                bgcolor: 'rgba(255, 255, 255, 0.97)',
                borderRadius: 3,
                border: '2px solid rgba(167, 139, 250, 0.3)',
                boxShadow: '0 8px 32px rgba(102, 126, 234, 0.3)',
              }}
            >
              <UploadFile sx={{ fontSize: 64, color: '#a78bfa', mb: 2 }} />
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
                파일을 여기에 드롭하세요
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                이미지, PDF, 비디오, 오디오 등 지원
              </Typography>
            </Box>
          </Box>
        )}
        {/* Model Selection Header */}
        <Box
          sx={{
            width: '100%',
            maxWidth: 900,
            p: 1.5,
            borderBottom: '1px solid rgba(0,0,0,0.04)',
            bgcolor: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: '#10b981',
                boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)',
              }}
            />
            <Typography
              sx={{
                color: 'white',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}
            >
              {getModelDisplayName(selectedModel)}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {/* Web Search Toggle */}
            <Tooltip title={webSearchEnabled ? "웹 검색 활성화됨 (파일+웹 하이브리드 검색)" : "웹 검색 비활성화됨 (파일 검색만)"}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 2,
                  bgcolor: webSearchEnabled ? 'rgba(102, 126, 234, 0.1)' : 'rgba(0,0,0,0.03)',
                  border: webSearchEnabled ? '1px solid rgba(102, 126, 234, 0.3)' : '1px solid rgba(0,0,0,0.1)',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: webSearchEnabled ? 'rgba(102, 126, 234, 0.15)' : 'rgba(0,0,0,0.04)',
                  },
                }}
                onClick={() => setWebSearchEnabled(!webSearchEnabled)}
              >
                <Language
                  sx={{
                    fontSize: 18,
                    color: webSearchEnabled ? '#667eea' : '#94A3B8',
                    transition: 'color 0.3s ease',
                  }}
                />
                <Typography
                  sx={{
                    color: webSearchEnabled ? '#667eea' : '#94A3B8',
                    fontSize: '0.75rem',
                    fontWeight: webSearchEnabled ? 600 : 500,
                    whiteSpace: 'nowrap',
                    transition: 'all 0.3s ease',
                  }}
                >
                  웹 검색
                </Typography>
                <Switch
                  checked={webSearchEnabled}
                  size="small"
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#667eea',
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                      backgroundColor: '#667eea',
                    },
                  }}
                />
              </Box>
            </Tooltip>

            <Button
              onClick={(e) => setModelMenuAnchor(e.currentTarget)}
              variant="outlined"
              size="small"
              sx={{
                borderColor: 'rgba(167, 139, 250, 0.3)',
                color: '#a78bfa',
                fontWeight: 600,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                px: 2,
                '&:hover': {
                  borderColor: '#a78bfa',
                  bgcolor: 'rgba(167, 139, 250, 0.1)',
                },
              }}
            >
              Change Model
            </Button>
          </Box>
        </Box>

        {/* Messages Area - Center Constrained */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            '&::-webkit-scrollbar': {
              width: '6px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'rgba(0,0,0,0.03)',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'rgba(167, 139, 250, 0.2)',
              borderRadius: '3px',
              '&:hover': {
                background: 'rgba(167, 139, 250, 0.3)',
              },
            },
          }}
        >
          <Box
            sx={{
              width: '100%',
              maxWidth: 900,
              p: 2,
            }}
          >
          {messages.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                flexDirection: 'column',
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 2,
                  boxShadow: '0 8px 24px rgba(102, 126, 234, 0.35)',
                  animation: 'float 3s ease-in-out infinite',
                  '@keyframes float': {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-10px)' },
                  },
                }}
              >
                <img
                  src={tenant?.logo_url || masLogoSquare}
                  alt="MAS Logo"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
              </Box>
              <Typography variant="h5" sx={{ color: '#1E293B', fontWeight: 600, mb: 0.5, fontSize: '1.25rem' }}>
                ReadyTalk에게 질문하세요
              </Typography>
              <Typography variant="body2" sx={{ color: '#94A3B8', fontSize: '0.85rem', mb: 4 }}>
                문서 검색 기반 지능형 응답 시스템
              </Typography>

              {/* 프롬프트 템플릿 버튼 (일반 유저 그룹은 숨김) */}
              {promptTemplates.length > 0 && user?.group?.name !== '일반' && (
                <Box
                  sx={{
                    display: 'flex',
                    gap: 2,
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    maxWidth: 600,
                  }}
                >
                  {promptTemplates.map((template) => (
                    <Button
                      key={template.id}
                      onClick={() => handleTemplateClick(template.id)}
                      disabled={isLoading || loadingTemplate}
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 1,
                        px: 3,
                        py: 2,
                        minWidth: 160,
                        borderRadius: 3,
                        bgcolor: 'rgba(0,0,0,0.03)',
                        border: '1px solid rgba(167, 139, 250, 0.2)',
                        color: 'white',
                        textTransform: 'none',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          bgcolor: 'rgba(102, 126, 234, 0.15)',
                          borderColor: 'rgba(167, 139, 250, 0.5)',
                          transform: 'translateY(-2px)',
                          boxShadow: '0 8px 24px rgba(102, 126, 234, 0.2)',
                        },
                        '&:disabled': {
                          color: 'rgba(255,255,255,0.3)',
                          borderColor: 'rgba(255,255,255,0.1)',
                        },
                      }}
                    >
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 2,
                          bgcolor: 'rgba(167, 139, 250, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#a78bfa',
                        }}
                      >
                        {getIconComponent(template.icon)}
                      </Box>
                      <Typography
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.875rem',
                        }}
                      >
                        {template.title}
                      </Typography>
                      {template.description && (
                        <Typography
                          sx={{
                            fontSize: '0.75rem',
                            color: 'rgba(255,255,255,0.5)',
                            textAlign: 'center',
                          }}
                        >
                          {template.description}
                        </Typography>
                      )}
                    </Button>
                  ))}
                </Box>
              )}
            </Box>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <Slide direction="up" in={true} key={idx} timeout={300}>
                  {/* 본인 인증 완료 시스템 안내 메시지 */}
                  {msg.isVerificationSuccess ? (
                    <Box
                      sx={{
                        mb: 2.5,
                        display: 'flex',
                        justifyContent: 'center',
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 2.5,
                          py: 1.25,
                          borderRadius: 3,
                          bgcolor: 'rgba(16, 185, 129, 0.08)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          maxWidth: 480,
                        }}
                      >
                        <Check sx={{ fontSize: 16, color: '#10b981', flexShrink: 0 }} />
                        <Typography
                          sx={{
                            fontSize: '0.875rem',
                            color: 'rgba(255,255,255,0.85)',
                            lineHeight: 1.5,
                          }}
                        >
                          {msg.content}
                        </Typography>
                      </Box>
                    </Box>
                  ) : (
                  <Box
                    sx={{
                      mb: 2.5,
                      display: 'flex',
                      flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                      alignItems: 'flex-start',
                      gap: 1.5,
                    }}
                  >
                    {msg.role === 'user' ? (
                      <Avatar
                        sx={{
                          width: 28,
                          height: 28,
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        }}
                      >
                        <Person sx={{ fontSize: 18 }} />
                      </Avatar>
                    ) : (
                      <Avatar
                        sx={{
                          width: 28,
                          height: 28,
                          background: 'linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)',
                        }}
                      >
                        <SmartToy sx={{ fontSize: 18 }} />
                      </Avatar>
                    )}
                    <Box sx={{
                      flex: msg.role === 'user' ? 'none' : 1,
                      maxWidth: msg.role === 'user' ? '70%' : '100%',
                    }}>
                      <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 0.75,
                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      }}>
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'white',
                            fontWeight: 600,
                            fontSize: '0.8125rem',
                          }}
                        >
                          {msg.role === 'user' ? 'You' : 'ReadyTalk'}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'rgba(255,255,255,0.3)',
                            fontSize: '0.75rem',
                          }}
                        >
                          • {new Date(msg.timestamp || Date.now()).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          // 유저 메시지 말풍선 스타일
                          ...(msg.role === 'user' && {
                            bgcolor: 'rgba(102, 126, 234, 0.15)',
                            border: '1px solid rgba(102, 126, 234, 0.3)',
                            borderRadius: '16px 16px 4px 16px',
                            p: 2,
                            boxShadow: '0 2px 8px rgba(102, 126, 234, 0.15)',
                          }),
                          '& p': {
                            margin: 0,
                            marginBottom: '0.5em',
                            lineHeight: 1.7,
                            fontSize: '0.9375rem',
                            color: 'rgba(255,255,255,0.95)',
                          },
                          '& p:last-child': {
                            marginBottom: 0,
                          },
                          '& code': {
                            bgcolor: 'rgba(167, 139, 250, 0.15)',
                            color: '#c4b5fd',
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 1,
                            fontSize: '0.875rem',
                            fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                          },
                          '& pre': {
                            margin: '0.75em 0',
                            padding: 0,
                            bgcolor: 'transparent',
                            borderRadius: 2,
                            overflow: 'hidden',
                          },
                          '& pre code': {
                            bgcolor: 'transparent',
                            color: 'inherit',
                            px: 0,
                            py: 0,
                            fontSize: '0.875rem',
                          },
                          '& ul, & ol': {
                            margin: '0.5em 0',
                            paddingLeft: '1.5em',
                            color: 'rgba(255,255,255,0.95)',
                          },
                          '& li': {
                            marginBottom: '0.25em',
                            lineHeight: 1.6,
                          },
                          '& h1, & h2, & h3, & h4, & h5, & h6': {
                            color: 'white',
                            fontWeight: 600,
                            marginTop: '1em',
                            marginBottom: '0.5em',
                          },
                          '& h1': { fontSize: '1.5rem' },
                          '& h2': { fontSize: '1.3rem' },
                          '& h3': { fontSize: '1.1rem' },
                          '& blockquote': {
                            borderLeft: '3px solid rgba(167, 139, 250, 0.5)',
                            paddingLeft: '1em',
                            margin: '0.75em 0',
                            color: 'rgba(255,255,255,0.8)',
                            fontStyle: 'italic',
                          },
                          '& a': {
                            color: '#667eea',
                            textDecoration: 'none',
                            '&:hover': {
                              textDecoration: 'underline',
                            },
                          },
                        }}
                      >
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ node, inline, className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline && match ? (
                                <SyntaxHighlighter
                                  style={vscDarkPlus}
                                  language={match[1]}
                                  PreTag="div"
                                  customStyle={{
                                    margin: 0,
                                    borderRadius: '8px',
                                    fontSize: '0.875rem',
                                  }}
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              ) : (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              );
                            },
                            a({ node, children, href, ...props }) {
                              return (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    color: '#a78bfa',
                                    textDecoration: 'underline',
                                    fontWeight: 600,
                                  }}
                                  {...props}
                                >
                                  {children}
                                </a>
                              );
                            },
                            table({ node, children, style, ...restProps }) {
                              // table 대신 div로 렌더링 (CSS Grid 사용)
                              return (
                                <div
                                  style={{
                                    margin: '16px 0',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(148, 163, 184, 0.15)',
                                    background: '#0f172a',
                                    overflow: 'hidden',
                                    fontSize: '13px',
                                    ...style,
                                  }}
                                  {...restProps}
                                >
                                  {children}
                                </div>
                              );
                            },
                            thead({ node, children, style, ...restProps }) {
                              return (
                                <div
                                  style={{
                                    background: '#1e293b',
                                    borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                                    ...style,
                                  }}
                                  {...restProps}
                                >
                                  {children}
                                </div>
                              );
                            },
                            tbody({ node, children, style, ...restProps }) {
                              return <div style={{ background: '#0f172a', ...style }} {...restProps}>{children}</div>;
                            },
                            tr({ node, children, style, ...restProps }) {
                              const childArray = React.Children.toArray(children);
                              const colCount = childArray.length;
                              return (
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${colCount}, 1fr)`,
                                    borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
                                    ...style,
                                  }}
                                  {...restProps}
                                >
                                  {children}
                                </div>
                              );
                            },
                            th({ node, children, style, ...restProps }) {
                              return (
                                <div
                                  style={{
                                    padding: '12px 16px',
                                    color: '#94a3b8',
                                    fontWeight: 600,
                                    fontSize: '11px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    ...style,
                                  }}
                                  {...restProps}
                                >
                                  {children}
                                </div>
                              );
                            },
                            td({ node, children, style, ...restProps }) {
                              return (
                                <div
                                  style={{
                                    padding: '14px 16px',
                                    color: '#e2e8f0',
                                    fontSize: '13px',
                                    lineHeight: 1.6,
                                    ...style,
                                  }}
                                  {...restProps}
                                >
                                  {children}
                                </div>
                              );
                            },
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>

                        {/* 본인 확인 버튼 — PERSONAL 접근 차단 시 표시 */}
                        {msg.verification_required && msg.verification_url && (
                          <Box sx={{ mt: 2 }}>
                            <Button
                              variant="contained"
                              size="small"
                              href={msg.verification_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                color: 'white',
                                fontWeight: 700,
                                borderRadius: 2,
                                px: 2,
                                py: 0.8,
                                '&:hover': {
                                  background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8a 100%)',
                                },
                              }}
                            >
                              본인 확인하기
                            </Button>
                          </Box>
                        )}

                        {/* RAG References Section - Collapsible */}
                        {msg.cited_sources && msg.cited_sources.length > 0 && (
                          <Box
                            sx={{
                              mt: 3,
                              pt: 2,
                              borderTop: '1px solid rgba(100, 116, 139, 0.3)',
                            }}
                          >
                            {/* Header - Clickable to expand/collapse */}
                            <Box
                              onClick={() => setExpandedSources(prev => ({
                                ...prev,
                                [idx]: !prev[idx]
                              }))}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                mb: 1.5,
                                p: 1,
                                borderRadius: '6px',
                                transition: 'all 0.2s',
                                '&:hover': {
                                  bgcolor: 'rgba(226, 232, 240, 0.7)',
                                },
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <MenuBook
                                  sx={{
                                    width: 14,
                                    height: 14,
                                    color: '#a78bfa',
                                  }}
                                />
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: 'rgba(148, 163, 184, 0.8)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                  }}
                                >
                                  Referenced Sources
                                </Typography>
                                <Chip
                                  label={msg.cited_sources.length}
                                  size="small"
                                  sx={{
                                    height: '18px',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    bgcolor: 'rgba(167, 139, 250, 0.2)',
                                    color: '#c4b5fd',
                                    border: '1px solid rgba(167, 139, 250, 0.3)',
                                    '& .MuiChip-label': {
                                      px: 1,
                                    },
                                  }}
                                />
                              </Box>
                              <IconButton
                                size="small"
                                sx={{
                                  color: 'rgba(148, 163, 184, 0.6)',
                                  p: 0.5,
                                  '&:hover': {
                                    color: '#a78bfa',
                                    bgcolor: 'transparent',
                                  },
                                }}
                              >
                                {expandedSources[idx] ? (
                                  <ExpandLess sx={{ width: 18, height: 18 }} />
                                ) : (
                                  <ExpandMore sx={{ width: 18, height: 18 }} />
                                )}
                              </IconButton>
                            </Box>

                            {/* Preview - First source (always visible) */}
                            {!expandedSources[idx] && (
                              <Box
                                component={msg.cited_sources[0].uri ? 'a' : 'div'}
                                href={msg.cited_sources[0].uri || undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1.5,
                                  p: 1.25,
                                  borderRadius: '8px',
                                  bgcolor: 'rgba(226, 232, 240, 0.8)',
                                  border: '1px solid rgba(100, 116, 139, 0.3)',
                                  textDecoration: 'none',
                                  cursor: msg.cited_sources[0].uri ? 'pointer' : 'default',
                                  transition: 'all 0.2s',
                                  '&:hover': msg.cited_sources[0].uri ? {
                                    bgcolor: 'rgba(209, 218, 230, 0.9)',
                                    borderColor: 'rgba(167, 139, 250, 0.4)',
                                  } : {},
                                }}
                              >
                                <Box
                                  sx={{
                                    p: 1,
                                    borderRadius: '6px',
                                    bgcolor: 'rgba(226, 232, 240, 1)',
                                    color: msg.cited_sources[0].uri ? 'rgba(167, 139, 250, 0.8)' : 'rgba(148, 163, 184, 0.8)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <Description sx={{ width: 16, height: 16 }} />
                                </Box>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontSize: '12px',
                                      fontWeight: 500,
                                      color: msg.cited_sources[0].uri ? 'rgba(167, 139, 250, 1)' : 'rgba(203, 213, 225, 1)',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {msg.cited_sources[0].title}
                                  </Typography>
                                </Box>
                                {msg.cited_sources.length > 1 && (
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontSize: '11px',
                                      color: 'rgba(148, 163, 184, 0.6)',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    +{msg.cited_sources.length - 1} more
                                  </Typography>
                                )}
                              </Box>
                            )}

                            {/* Expanded - All sources */}
                            <Collapse in={expandedSources[idx]} timeout="auto">
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {msg.cited_sources.map((source, sourceIdx) => (
                                  <Box
                                    key={sourceIdx}
                                    component={source.uri ? 'a' : 'div'}
                                    href={source.uri || undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 1.5,
                                      p: 1.25,
                                      borderRadius: '8px',
                                      bgcolor: 'rgba(226, 232, 240, 0.8)',
                                      border: '1px solid rgba(100, 116, 139, 0.3)',
                                      textDecoration: 'none',
                                      cursor: source.uri ? 'pointer' : 'default',
                                      transition: 'all 0.2s',
                                      '&:hover': source.uri ? {
                                        bgcolor: 'rgba(209, 218, 230, 0.9)',
                                        borderColor: 'rgba(167, 139, 250, 0.4)',
                                      } : {
                                        bgcolor: 'rgba(209, 218, 230, 0.9)',
                                        borderColor: 'rgba(167, 139, 250, 0.3)',
                                      },
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        p: 1,
                                        borderRadius: '6px',
                                        bgcolor: 'rgba(226, 232, 240, 1)',
                                        color: source.uri ? 'rgba(167, 139, 250, 0.8)' : 'rgba(148, 163, 184, 0.8)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s',
                                      }}
                                    >
                                      <Description sx={{ width: 16, height: 16 }} />
                                    </Box>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                      <Typography
                                        variant="body2"
                                        sx={{
                                          fontSize: '12px',
                                          fontWeight: 500,
                                          color: source.uri ? 'rgba(167, 139, 250, 1)' : 'rgba(203, 213, 225, 1)',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {source.title}
                                      </Typography>
                                    </Box>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        fontSize: '10px',
                                        color: 'rgba(148, 163, 184, 0.5)',
                                        bgcolor: 'rgba(226, 232, 240, 0.7)',
                                        px: 1,
                                        py: 0.25,
                                        borderRadius: '4px',
                                      }}
                                    >
                                      #{sourceIdx + 1}
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Collapse>
                          </Box>
                        )}

                        {/* Real-time Google Drive File List Section */}
                        {msg.realtime_file_list && msg.realtime_file_list.items && msg.realtime_file_list.items.length > 0 && (
                          <Box
                            sx={{
                              mt: 3,
                              pt: 2,
                              borderTop: '1px solid rgba(100, 116, 139, 0.3)',
                            }}
                          >
                            {/* Header */}
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.75,
                                mb: 1.5,
                              }}
                            >
                              <Box
                                sx={{
                                  width: 14,
                                  height: 14,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                📂
                              </Box>
                              <Typography
                                variant="caption"
                                sx={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: 'rgba(148, 163, 184, 0.8)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                }}
                              >
                                실시간 폴더 내용
                              </Typography>
                              <Chip
                                label={msg.realtime_file_list.total_count}
                                size="small"
                                sx={{
                                  height: '18px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  bgcolor: 'rgba(34, 197, 94, 0.2)',
                                  color: '#86efac',
                                  border: '1px solid rgba(34, 197, 94, 0.3)',
                                  '& .MuiChip-label': {
                                    px: 1,
                                  },
                                }}
                              />
                              {msg.realtime_file_list.has_more && (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontSize: '10px',
                                    color: 'rgba(148, 163, 184, 0.5)',
                                  }}
                                >
                                  (더 있음)
                                </Typography>
                              )}
                            </Box>

                            {/* Folder Link */}
                            {msg.realtime_file_list.folder_link && (
                              <Box sx={{ mb: 1.5 }}>
                                <Typography
                                  component="a"
                                  href={msg.realtime_file_list.folder_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  sx={{
                                    fontSize: '11px',
                                    color: '#60a5fa',
                                    textDecoration: 'none',
                                    '&:hover': {
                                      textDecoration: 'underline',
                                    },
                                  }}
                                >
                                  🔗 {msg.realtime_file_list.folder_path}
                                </Typography>
                              </Box>
                            )}

                            {/* File List */}
                            <Box
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: 1,
                                maxHeight: '300px',
                                overflowY: 'auto',
                                p: 1,
                                borderRadius: '8px',
                                bgcolor: 'rgba(226, 232, 240, 0.7)',
                                border: '1px solid rgba(100, 116, 139, 0.2)',
                                '&::-webkit-scrollbar': {
                                  width: '6px',
                                },
                                '&::-webkit-scrollbar-track': {
                                  background: 'rgba(167, 139, 250, 0.05)',
                                },
                                '&::-webkit-scrollbar-thumb': {
                                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                  borderRadius: '3px',
                                  '&:hover': {
                                    background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8a 100%)',
                                  },
                                },
                              }}
                            >
                              {msg.realtime_file_list.items.map((item, itemIdx) => (
                                <Box
                                  key={itemIdx}
                                  component="a"
                                  href={item.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    p: 1,
                                    borderRadius: '6px',
                                    bgcolor: 'rgba(226, 232, 240, 0.8)',
                                    border: '1px solid rgba(100, 116, 139, 0.2)',
                                    textDecoration: 'none',
                                    transition: 'all 0.2s',
                                    '&:hover': {
                                      bgcolor: 'rgba(30, 41, 59, 0.7)',
                                      borderColor: item.type === 'folder'
                                        ? 'rgba(251, 191, 36, 0.4)'
                                        : 'rgba(96, 165, 250, 0.4)',
                                    },
                                  }}
                                >
                                  <Box
                                    sx={{
                                      fontSize: '14px',
                                      minWidth: '18px',
                                    }}
                                  >
                                    {item.type === 'folder' ? '📁' : '📄'}
                                  </Box>
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography
                                      sx={{
                                        fontSize: '11px',
                                        fontWeight: 500,
                                        color: item.type === 'folder' ? '#fbbf24' : '#e2e8f0',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {item.name}
                                    </Typography>
                                    {item.size && (
                                      <Typography
                                        sx={{
                                          fontSize: '9px',
                                          color: 'rgba(148, 163, 184, 0.5)',
                                        }}
                                      >
                                        {(item.size / 1024 / 1024).toFixed(2)} MB
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        )}

                        {/* Copy & Feedback Buttons for Assistant Messages */}
                        {msg.role !== 'user' && (
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'flex-end',
                              gap: 1,
                              mt: 2,
                              mb: 2,
                              pt: 1.5,
                              borderTop: msg.cited_sources && msg.cited_sources.length > 0
                                ? 'none'
                                : '1px solid rgba(100, 116, 139, 0.2)',
                            }}
                          >
                            <Tooltip title="피드백 보내기" placement="top">
                              <IconButton
                                onClick={() => openFeedbackDialog(msg)}
                                size="small"
                                sx={{
                                  color: 'rgba(148, 163, 184, 0.5)',
                                  bgcolor: 'transparent',
                                  border: '1px solid',
                                  borderColor: 'rgba(100, 116, 139, 0.2)',
                                  borderRadius: '6px',
                                  px: 1.5,
                                  py: 0.5,
                                  gap: 0.5,
                                  transition: 'all 0.2s',
                                  '&:hover': {
                                    color: '#f59e0b',
                                    bgcolor: 'rgba(245, 158, 11, 0.1)',
                                    borderColor: 'rgba(245, 158, 11, 0.3)',
                                  },
                                }}
                              >
                                <Feedback sx={{ width: 14, height: 14 }} />
                                <Typography
                                  variant="caption"
                                  sx={{ fontSize: '11px', fontWeight: 500 }}
                                >
                                  피드백
                                </Typography>
                              </IconButton>
                            </Tooltip>
                            <Tooltip
                              title={copiedMessageIdx === idx ? "복사됨!" : "답변 복사"}
                              placement="top"
                            >
                              <IconButton
                                onClick={() => copyMessageContent(msg.content, idx)}
                                size="small"
                                sx={{
                                  color: copiedMessageIdx === idx
                                    ? '#10b981'
                                    : 'rgba(148, 163, 184, 0.5)',
                                  bgcolor: copiedMessageIdx === idx
                                    ? 'rgba(16, 185, 129, 0.1)'
                                    : 'transparent',
                                  border: '1px solid',
                                  borderColor: copiedMessageIdx === idx
                                    ? 'rgba(16, 185, 129, 0.3)'
                                    : 'rgba(100, 116, 139, 0.2)',
                                  borderRadius: '6px',
                                  px: 1.5,
                                  py: 0.5,
                                  gap: 0.5,
                                  transition: 'all 0.2s',
                                  '&:hover': {
                                    color: copiedMessageIdx === idx ? '#10b981' : '#a78bfa',
                                    bgcolor: copiedMessageIdx === idx
                                      ? 'rgba(16, 185, 129, 0.15)'
                                      : 'rgba(167, 139, 250, 0.1)',
                                    borderColor: copiedMessageIdx === idx
                                      ? 'rgba(16, 185, 129, 0.4)'
                                      : 'rgba(167, 139, 250, 0.3)',
                                  },
                                }}
                              >
                                {copiedMessageIdx === idx ? (
                                  <Check sx={{ width: 14, height: 14 }} />
                                ) : (
                                  <ContentCopy sx={{ width: 14, height: 14 }} />
                                )}
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontSize: '11px',
                                    fontWeight: 500,
                                  }}
                                >
                                  {copiedMessageIdx === idx ? '복사됨' : '복사'}
                                </Typography>
                              </IconButton>
                            </Tooltip>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  </Box>
                  )}
                </Slide>
              ))}
              {isTyping && (
                <Fade in={isTyping}>
                  <Box
                    sx={{
                      mb: 2.5,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1.5,
                    }}
                  >
                    <Avatar
                      sx={{
                        width: 28,
                        height: 28,
                        background: 'linear-gradient(135deg, #a78bfa 0%, #ec4899 100%)',
                      }}
                    >
                      <SmartToy sx={{ fontSize: 18 }} />
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'rgba(255,255,255,0.4)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: 0.3,
                          mb: 0.5,
                          display: 'block',
                          fontSize: '0.7rem',
                        }}
                      >
                        Gemini
                      </Typography>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 1.5,
                          bgcolor: 'rgba(167, 139, 250, 0.04)',
                          border: '1px solid rgba(167, 139, 250, 0.08)',
                          borderRadius: 3,
                          display: 'flex',
                          gap: 1,
                          alignItems: 'center',
                        }}
                      >
                        <CircularProgress size={14} sx={{ color: '#a78bfa' }} />
                        <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem' }}>
                          응답 생성 중...
                        </Typography>
                      </Paper>
                    </Box>
                  </Box>
                </Fade>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
          </Box>
        </Box>

        {/* Input Area - Modern Google AI Studio Style */}
        <Box
          sx={{
            width: '100%',
            maxWidth: 900,
            p: 1.5,
            borderTop: '1px solid rgba(0,0,0,0.04)',
            bgcolor: 'transparent',
          }}
        >
          {/* Selected Files Preview */}
          {selectedFiles.length > 0 && (
            <Box sx={{ mb: 1, px: 1 }}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {selectedFiles.map((file, index) => (
                  <Chip
                    key={index}
                    label={file.name}
                    size="small"
                    onDelete={() => removeFile(index)}
                    deleteIcon={<Close sx={{ fontSize: 16 }} />}
                    sx={{
                      bgcolor: 'rgba(167, 139, 250, 0.15)',
                      color: '#c4b5fd',
                      border: '1px solid rgba(167, 139, 250, 0.3)',
                      '& .MuiChip-deleteIcon': {
                        color: 'rgba(255,255,255,0.5)',
                        '&:hover': {
                          color: '#ef4444',
                        },
                      },
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}

          <Box
            className={`animated-border-input ${!isInputFocused ? 'inactive' : ''}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 2.5,
              py: 1.5,
              borderRadius: 5,
              position: 'relative',
              bgcolor: 'rgba(0,0,0,0.03)',
              transition: 'background-image 0.3s ease', // box-shadow 제외하여 글로우 즉시 적용
              // 항상 1.5px 테두리 공간 유지 (활성화 시에는 투명하게)
              border: '1.5px solid transparent',
              backgroundImage: !isInputFocused ? 'linear-gradient(#0d1117, #0d1117), linear-gradient(135deg, rgba(167, 139, 250, 0.3) 0%, rgba(236, 72, 153, 0.3) 100%)' : 'none',
              backgroundOrigin: 'border-box',
              backgroundClip: 'padding-box, border-box',
              boxShadow: isInputFocused
                ? '0 0 30px rgba(167, 139, 250, 0.3), 0 0 60px rgba(236, 72, 153, 0.2)' // 활성화 시 즉시 적용
                : '0 0 15px rgba(167, 139, 250, 0.1), 0 0 30px rgba(236, 72, 153, 0.05)',
              '&:hover:not(:focus-within)': {
                // focus 상태가 아닐 때만 hover 효과 적용
                boxShadow: '0 0 20px rgba(167, 139, 250, 0.15), 0 0 40px rgba(236, 72, 153, 0.08)',
              },
            }}
          >
            <Box
              sx={{
                width: 22,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={tenant?.logo_url || masLogoSquare}
                alt="MAS Logo"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </Box>
            <TextField
              fullWidth
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              placeholder="Ask anything..."
              multiline
              maxRows={6}
              disabled={isLoading}
              variant="standard"
              InputProps={{
                disableUnderline: true,
              }}
              sx={{
                '& .MuiInputBase-input': {
                  color: 'white',
                  fontSize: '0.95rem',
                  fontWeight: 400,
                  padding: 0,
                  lineHeight: 1.6,
                  '&::placeholder': {
                    color: 'rgba(255,255,255,0.35)',
                    opacity: 1,
                  },
                },
                '& .MuiInputBase-input.Mui-disabled': {
                  WebkitTextFillColor: 'rgba(255,255,255,0.35)',
                  color: 'rgba(255,255,255,0.35)',
                },
              }}
            />
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                multiple
                style={{ display: 'none' }}
                accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.mp3,.wav,.aiff,.aac,.ogg,.flac,.mp4,.mpeg,.mov,.avi,.flv,.mpg,.webm,.wmv,.3gp,.txt,.html,.css,.js,.ts,.csv"
              />
              <Tooltip title="파일 첨부">
                <IconButton
                  size="small"
                  onClick={() => fileInputRef.current?.click()}
                  sx={{
                    color: 'rgba(255,255,255,0.4)',
                    '&:hover': {
                      bgcolor: 'rgba(0,0,0,0.04)',
                      color: '#a78bfa',
                    },
                  }}
                >
                  <AttachFile sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>

              <Tooltip title={isListening ? "음성 인식 중지" : "음성 입력"}>
                <IconButton
                  size="small"
                  onClick={toggleListening}
                  sx={{
                    color: isListening ? '#ef4444' : 'rgba(255,255,255,0.4)',
                    bgcolor: isListening ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                    animation: isListening ? 'pulse 1.5s ease-in-out infinite' : 'none',
                    '@keyframes pulse': {
                      '0%, 100%': {
                        boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.4)',
                      },
                      '50%': {
                        boxShadow: '0 0 0 8px rgba(239, 68, 68, 0)',
                      },
                    },
                    '&:hover': {
                      bgcolor: isListening ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0,0,0,0.04)',
                      color: isListening ? '#ef4444' : '#a78bfa',
                    },
                  }}
                >
                  {isListening ? <MicOff sx={{ fontSize: 18 }} /> : <Mic sx={{ fontSize: 18 }} />}
                </IconButton>
              </Tooltip>

              {/* Enter to send text */}
              <Typography
                sx={{
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: '0.75rem',
                  ml: 1,
                  mr: 0.5,
                  whiteSpace: 'nowrap',
                }}
              >
                Enter to send
              </Typography>

              {/* Send/Cancel Button */}
              {isLoading ? (
                <Tooltip title="요청 취소">
                  <IconButton
                    onClick={cancelRequest}
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: 3.5,
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      color: 'white',
                      boxShadow: '0 0 20px rgba(239, 68, 68, 0.4), 0 0 40px rgba(220, 38, 38, 0.2)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                        transform: 'translateY(-2px)',
                        boxShadow: '0 0 30px rgba(239, 68, 68, 0.6), 0 0 60px rgba(220, 38, 38, 0.3), 0 8px 16px rgba(0,0,0,0.2)',
                      },
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <Stop sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
              ) : (
                <IconButton
                  onClick={sendMessage}
                  disabled={!input.trim()}
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 3.5,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    boxShadow: '0 0 20px rgba(102, 126, 234, 0.4), 0 0 40px rgba(118, 75, 162, 0.2)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8a 100%)',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 0 30px rgba(102, 126, 234, 0.6), 0 0 60px rgba(118, 75, 162, 0.3), 0 8px 16px rgba(0,0,0,0.2)',
                    },
                    '&:disabled': {
                      background: 'rgba(102, 126, 234, 0.2)',
                      color: 'rgba(255,255,255,0.3)',
                      boxShadow: 'none',
                    },
                    transition: 'all 0.3s ease',
                  }}
                >
                  <Send sx={{ fontSize: 20 }} />
                </IconButton>
              )}
            </Box>
          </Box>
        </Box>

        {/* Model Selection Menu */}
        <Menu
          anchorEl={modelMenuAnchor}
          open={Boolean(modelMenuAnchor)}
          onClose={() => setModelMenuAnchor(null)}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          PaperProps={{
            sx: {
              bgcolor: '#111113',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 2,
              minWidth: 220,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              mt: 0.5,
            },
          }}
        >
          {models.map((model) => (
            <MenuItem
              key={model.model_name}
              onClick={() => {
                setSelectedModel(model.model_name);
                setModelMenuAnchor(null);
              }}
              selected={selectedModel === model.model_name}
              sx={{
                py: 1.2,
                px: 2.5,
                color: 'white',
                fontSize: '0.875rem',
                '&:hover': {
                  bgcolor: 'rgba(102, 126, 234, 0.15)',
                },
                '&.Mui-selected': {
                  bgcolor: 'rgba(102, 126, 234, 0.2)',
                  '&:hover': {
                    bgcolor: 'rgba(102, 126, 234, 0.25)',
                  },
                },
              }}
            >
              {model.display_name}
            </MenuItem>
          ))}
        </Menu>

        {/* Feedback Dialog */}
        <Dialog
          open={feedbackDialogOpen}
          onClose={() => !feedbackLoading && setFeedbackDialogOpen(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              bgcolor: '#111113',
              color: '#e2e8f0',
              border: '1px solid rgba(167, 139, 250, 0.3)',
              borderRadius: 3,
            },
          }}
        >
          <DialogTitle sx={{ borderBottom: '1px solid rgba(100, 116, 139, 0.2)', pb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Feedback sx={{ color: '#f59e0b' }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>피드백 보내기</Typography>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ pt: '16px !important' }}>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 2 }}>
              이 AI 응답에 대한 피드백을 보내주세요. 서비스 개선에 활용됩니다.
            </Typography>
            <TextField
              autoFocus
              multiline
              rows={4}
              fullWidth
              placeholder="피드백 내용을 입력하세요..."
              inputRef={feedbackTextRef}
              defaultValue=""
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: '#e2e8f0',
                  bgcolor: 'rgba(15, 23, 42, 0.6)',
                  '& fieldset': { borderColor: 'rgba(100, 116, 139, 0.3)' },
                  '&:hover fieldset': { borderColor: 'rgba(167, 139, 250, 0.5)' },
                  '&.Mui-focused fieldset': { borderColor: '#a78bfa' },
                },
              }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={includeConversation}
                  onChange={(e) => setIncludeConversation(e.target.checked)}
                  sx={{
                    color: 'rgba(148, 163, 184, 0.5)',
                    '&.Mui-checked': { color: '#a78bfa' },
                  }}
                />
              }
              label={
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                  대화 내역도 함께 전송합니다 (더 정확한 피드백 분석을 위해)
                </Typography>
              }
              sx={{ mt: 1.5 }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, borderTop: '1px solid rgba(100, 116, 139, 0.2)', pt: 1.5 }}>
            <Button
              onClick={() => setFeedbackDialogOpen(false)}
              disabled={feedbackLoading}
              sx={{ color: 'rgba(255,255,255,0.5)' }}
            >
              취소
            </Button>
            <Button
              onClick={handleSendFeedback}
              disabled={feedbackLoading}
              variant="contained"
              startIcon={feedbackLoading ? <CircularProgress size={16} color="inherit" /> : <Send />}
              sx={{
                bgcolor: '#a78bfa',
                '&:hover': { bgcolor: '#8b5cf6' },
                '&.Mui-disabled': { bgcolor: 'rgba(167, 139, 250, 0.3)', color: 'rgba(255,255,255,0.3)' },
              }}
            >
              {feedbackLoading ? '전송 중...' : '보내기'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Feedback Snackbar */}
        <Snackbar
          open={feedbackSnackbar.open}
          autoHideDuration={4000}
          onClose={() => setFeedbackSnackbar(prev => ({ ...prev, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setFeedbackSnackbar(prev => ({ ...prev, open: false }))}
            severity={feedbackSnackbar.severity}
            sx={{ width: '100%' }}
          >
            {feedbackSnackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </Box>
  );
}
