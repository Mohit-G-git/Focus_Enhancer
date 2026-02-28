import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:5000/api',
  timeout: 120000,
});

// Attach JWT from localStorage to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('fe_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Auth ──────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => API.post('/auth/register', data),
  login: (data) => API.post('/auth/login', data),
  getMe: () => API.get('/auth/me'),
  updateProfile: (data) => API.put('/auth/profile', data),
};

// ── Courses ───────────────────────────────────────────────────
export const courseAPI = {
  getAll: () => API.get('/courses'),
  getOne: (id) => API.get(`/courses/${id}`),
  create: (data) => API.post('/courses', data),
  claimCR: (id) => API.put(`/courses/${id}/claim-cr`),
  enroll: (id) => API.post(`/courses/${id}/enroll`),
  getStudents: (id) => API.get(`/courses/${id}/students`),
  uploadBook: (id, formData) => API.post(`/courses/${id}/upload-book`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

// ── Tasks ─────────────────────────────────────────────────────
export const taskAPI = {
  getByCourse: (courseId) => API.get(`/tasks/course/${courseId}`),
  getToday: (courseId) => API.get(`/tasks/today/${courseId}`),
  getSchedule: (courseId) => API.get(`/tasks/schedule/${courseId}`),
  getById: (id) => API.get(`/tasks/${id}`),
};

// ── Quiz ──────────────────────────────────────────────────────
export const quizAPI = {
  start: (taskId) => API.post(`/quiz/${taskId}/start`),
  answer: (taskId, data) => API.post(`/quiz/${taskId}/answer`, data),
  getMCQResult: (taskId) => API.get(`/quiz/${taskId}/mcq-result`),
  getTheory: (taskId) => API.get(`/quiz/${taskId}/theory`),
  submitTheory: (taskId, formData) => API.post(`/quiz/${taskId}/submit-theory`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

// ── Announcements ─────────────────────────────────────────────
export const announcementAPI = {
  create: (data) => API.post('/announcements', data),
  getByCourse: (courseId) => API.get(`/announcements/course/${courseId}`),
};

// ── Chat ──────────────────────────────────────────────────────
export const chatAPI = {
  send: (data) => API.post('/chat/message', data),
  getConversations: () => API.get('/chat/conversations'),
  getConversation: (id) => API.get(`/chat/conversations/${id}`),
  deleteConversation: (id) => API.delete(`/chat/conversations/${id}`),
};

// ── Leaderboard ───────────────────────────────────────────────
export const leaderboardAPI = {
  getOverall: () => API.get('/leaderboard/overall'),
  getByCourse: (courseId) => API.get(`/leaderboard/course/${courseId}`),
};

// ── Theory ────────────────────────────────────────────────────
export const theoryAPI = {
  submit: (taskId, formData) => API.post(`/theory/${taskId}/submit`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  getSubmission: (taskId) => API.get(`/theory/${taskId}/submission`),
  getMySubmissions: () => API.get('/theory/my-submissions'),
};

// ── Reviews ───────────────────────────────────────────────────
export const reviewAPI = {
  getAccomplished: (userId) => API.get(`/reviews/accomplished/${userId}`),
  viewSolution: (taskId, userId) => API.get(`/reviews/solution/${taskId}/${userId}`),
  upvote: (data) => API.post('/reviews/upvote', data),
  downvote: (data) => API.post('/reviews/downvote', data),
  getMyReviews: () => API.get('/reviews/my-reviews'),
  getReceived: () => API.get('/reviews/received'),
};

export default API;
