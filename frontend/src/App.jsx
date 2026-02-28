import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

// Eager-load critical pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';

// Lazy-load non-critical pages
const Home = lazy(() => import('./pages/Home'));
const Profile = lazy(() => import('./pages/Profile'));
const Welcome = lazy(() => import('./pages/Welcome'));
const Chatbot = lazy(() => import('./pages/Chatbot'));
const CRPage = lazy(() => import('./pages/CRPage'));

function AppRoutes() {
  return (
    <Suspense fallback={<div className="spinner" />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/profile" element={
          <ProtectedRoute><Profile /></ProtectedRoute>
        } />
        <Route path="/welcome" element={
          <ProtectedRoute><Welcome /></ProtectedRoute>
        } />
        <Route path="/home" element={
          <ProtectedRoute><Home /></ProtectedRoute>
        } />
        <Route path="/chatbot" element={
          <ProtectedRoute><Chatbot /></ProtectedRoute>
        } />
        <Route path="/cr/:courseId" element={
          <ProtectedRoute><CRPage /></ProtectedRoute>
        } />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Navbar />
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
