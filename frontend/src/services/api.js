import axios from 'axios';

let API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
// If served via docker-compose nginx, use relative path so it picks up the correct port (e.g., 8888)
if (API_URL === 'http://localhost') {
  API_URL = '';
}

const api = axios.create({
  baseURL: API_URL ? `${API_URL}/api` : '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests (sessionStorage takes priority for impersonation tabs)
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Extract slug from pathname (assumes the form /:slug/...)
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const currentSlug = pathSegments.length > 0 && pathSegments[0] !== 'superadmin' ? pathSegments[0] : null;
  if (currentSlug) {
    config.headers['X-Tenant-Slug'] = currentSlug;
  }
  
  return config;
});

// Handle 401 errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Impersonation session expired — close the tab
      if (sessionStorage.getItem('impersonating') === 'true') {
        sessionStorage.clear();
        alert('임퍼소네이션 세션이 만료되었습니다. 탭을 닫습니다.');
        window.close();
        return Promise.reject(error);
      }

      // 로그인 페이지나 회원가입 페이지가 아닐 때만 리다이렉트
      const currentPath = window.location.pathname;
      if (!currentPath.endsWith('/login') && !currentPath.endsWith('/register')) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');

        const pathSegments = currentPath.split('/').filter(Boolean);
        const currentSlug = pathSegments.length > 0 && pathSegments[0] !== 'superadmin' ? pathSegments[0] : null;
        if (currentSlug) {
          window.location.href = `/${currentSlug}/login`;
        } else {
          window.location.href = '/superadmin/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (data, slug = null) => {
    const params = slug ? { params: { slug } } : undefined;
    return api.post('/auth/register', data, params);
  },
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

export const chatAPI = {
  getSessions: () => api.get('/chat/sessions'),
  getSession: (id) => api.get(`/chat/sessions/${id}`),
  createSession: (data) => api.post('/chat/sessions', data),
  deleteSession: (id) => api.delete(`/chat/sessions/${id}`),
  sendMessage: (data, files = [], signal = null) => {
    const formData = new FormData();
    formData.append('message', data.message);
    if (data.session_id) formData.append('session_id', data.session_id);
    if (data.model) formData.append('model', data.model);
    formData.append('web_search_enabled', data.web_search_enabled || false);

    // Append files if any
    if (files && files.length > 0) {
      files.forEach((file) => {
        formData.append('files', file);
      });
    }

    return api.post('/chat/message', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: signal,  // AbortController signal for request cancellation
    });
  },
  // 템플릿 ID로 바로 메시지 전송 (기존 웹 통합용)
  sendTemplateMessage: (data, signal = null) => {
    return api.post('/chat/template-message', data, { signal });
  },
  sendFeedback: (data) => api.post('/chat/feedback', data),
};

export const corpusAPI = {
  list: () => api.get('/corpus'),
  // corpus_name is Gemini's file search store name (e.g., "fileSearchStores/abc123")
  get: (corpusName, params) => api.get(`/corpus/${encodeURIComponent(corpusName)}`, { params }),
  create: (data) => api.post('/corpus', data),
  delete: (corpusName, password) => api.post(`/corpus/${encodeURIComponent(corpusName)}/delete`, { password }),
  updateSettings: (corpusName, data) => api.patch(`/corpus/${encodeURIComponent(corpusName)}/settings`, data),
  uploadDocument: (corpusName, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/corpus/${encodeURIComponent(corpusName)}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  checkOperationStatus: (corpusName, operationId, displayName = null, gcsPath = null) => {
    const params = {};
    if (displayName) params.display_name = displayName;
    if (gcsPath) params.gcs_path = gcsPath;
    return api.get(`/corpus/${encodeURIComponent(corpusName)}/operations/${encodeURIComponent(operationId)}`, { params });
  },
  deleteDocument: (corpusName, documentName) =>
    api.delete(`/corpus/${encodeURIComponent(corpusName)}/documents/${encodeURIComponent(documentName)}`),
  bulkDelete: (corpusName, data) =>
    api.post(`/corpus/${encodeURIComponent(corpusName)}/documents/bulk-delete`, data),
  downloadDocument: (documentId) =>
    api.get(`/corpus/download?document_id=${documentId}`),
};

export const modelAPI = {
  list: () => api.get('/models'),
};

export const adminAPI = {
  // Users
  listUsers: () => api.get('/admin/users'),
  updateUser: (userId, data) => api.put(`/admin/users/${userId}`, data),
  updateUserPassword: (userId, newPassword) => api.put(`/admin/users/${userId}/password`, { new_password: newPassword }),
  deleteUser: (userId) => api.delete(`/admin/users/${userId}`),

  // Groups
  listGroups: () => api.get('/admin/groups'),
  getGroup: (groupId) => api.get(`/admin/groups/${groupId}`),
  createGroup: (data) => api.post('/admin/groups', data),
  updateGroup: (groupId, data) => api.put(`/admin/groups/${groupId}`, data),
  deleteGroup: (groupId) => api.delete(`/admin/groups/${groupId}`),

  // Store Permissions
  listStorePermissions: (params) => api.get('/admin/store-permissions', { params }),
  grantStorePermission: (data) => api.post('/admin/store-permissions', data),
  revokeStorePermission: (permissionId) => api.delete(`/admin/store-permissions/${permissionId}`),

  // Dashboard Stats
  getStats: () => api.get('/admin/stats'),
  getAnalytics: () => api.get('/admin/analytics'),

  // Chat Session Management
  listChatSessions: (params) => api.get('/admin/chat-sessions', { params }),
  getSessionMessages: (sessionId) => api.get(`/admin/chat-sessions/${sessionId}/messages`),
};

export const promptTemplateAPI = {
  // Public (ChatPage용)
  list: () => api.get('/prompt-templates'),
  get: (id) => api.get(`/prompt-templates/${id}`),

  // Admin (관리용)
  listAll: () => api.get('/prompt-templates/admin/all'),
  create: (data) => api.post('/prompt-templates', data),
  update: (id, data) => api.put(`/prompt-templates/${id}`, data),
  delete: (id) => api.delete(`/prompt-templates/${id}`),
  reorder: (order) => api.put('/prompt-templates/admin/reorder', order),
};

export const superadminAPI = {
  getDashboard: () => api.get('/superadmin/dashboard'),
  getAnalytics: () => api.get('/superadmin/dashboard/analytics'),
  listTenants: () => api.get('/superadmin/tenants'),
  getTenant: (tenantId) => api.get(`/superadmin/tenants/${tenantId}`),
  createTenant: (data) => api.post('/superadmin/tenants', data),
  updateTenant: (tenantId, data) => api.put(`/superadmin/tenants/${tenantId}`, data),
  deactivateTenant: (tenantId) => api.delete(`/superadmin/tenants/${tenantId}`),
  permanentlyDeleteTenant: (tenantId) => api.delete(`/superadmin/tenants/${tenantId}/permanent`),
  updateKakaoConfig: (tenantId, data) => api.post(`/superadmin/tenants/${tenantId}/kakao`, data),
  updateGcpConfig: (tenantId, data) => api.post(`/superadmin/tenants/${tenantId}/gcp`, data),
  getTenantStats: (tenantId) => api.get(`/superadmin/tenants/${tenantId}/stats`),
  getTenantAnalytics: (tenantId) => api.get(`/superadmin/tenants/${tenantId}/analytics`),
  impersonateTenant: (tenantId) => api.post(`/superadmin/tenants/${tenantId}/impersonate`),

  // Billing / Usage
  getBillingSummary: (period = 30) => api.get('/superadmin/billing/summary', { params: { period } }),
  getTenantBilling: (tenantId, period = 30) => api.get(`/superadmin/billing/tenants/${tenantId}`, { params: { period } }),

  // Platform Settings
  getSettings: () => api.get('/superadmin/settings'),
  updateSettings: (settings) => api.put('/superadmin/settings', { settings }),
  testVertexAI: () => api.post('/superadmin/settings/test-vertex-ai'),
  listGeminiModels: () => api.get('/superadmin/settings/models'),
};

export const calendarAPI = {
  getStatus: () => api.get('/calendar/status'),
  getAuthUrl: () => api.get('/calendar/auth'),
  disconnect: () => api.delete('/calendar/disconnect'),
  getEvents: (params) => api.get('/calendar/events', { params }),
  // Public endpoints (no auth required)
  getPublicStatus: (slug) => api.get(`/calendar/public/${slug}/status`),
  getPublicEvents: (slug, params) => api.get(`/calendar/public/${slug}/events`, { params }),
};

export const tenantAPI = {
  getPublicInfo: (slug) => api.get(`/tenants/${slug}`),
};

export const chatbotSettingsAPI = {
  get: () => api.get('/chatbot-settings'),
  update: (data) => api.put('/chatbot-settings', data),
  getPresets: () => api.get('/chatbot-settings/presets'),
};

export const hitlAPI = {
  list: () => api.get('/hitl'),
  resolve: (id) => api.patch(`/hitl/${id}`),
};

export const verifyAPI = {
  debugToken: (slug) => api.get(`/verify/${slug}/debug-token`),
  request: (slug, token, phone) =>
    api.post(`/verify/${slug}/request`, { token, phone }),
  confirm: (slug, token, phone, code) =>
    api.post(`/verify/${slug}/confirm`, { token, phone, code }),
};

export const studentAPI = {
  // 분반
  listClasses: () => api.get('/admin/students/classes'),
  createClass: (data) => api.post('/admin/students/classes', data),
  updateClass: (id, data) => api.put(`/admin/students/classes/${id}`, data),
  deleteClass: (id) => api.delete(`/admin/students/classes/${id}`),
  // 학생
  listStudents: (params) => api.get('/admin/students/students', { params }),
  createStudent: (data) => api.post('/admin/students/students', data),
  updateStudent: (id, data) => api.put(`/admin/students/students/${id}`, data),
  deleteStudent: (id) => api.delete(`/admin/students/students/${id}`),
};

export default api;
