import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/useAuth';
import { DocumentsProvider } from './context/DocumentsContext';
import DocsAllPage from './pages/DocsAllPage';
import DocViewerPage from './pages/DocViewerPage';
import LoginPage from './pages/LoginPage';
import SharePage from './pages/SharePage';

// Khu vực cần đăng nhập.
function AppShell() {
  const { user, loading } = useAuth();

  if (loading) return <div className="container">Đang tải…</div>;
  if (!user) return <LoginPage />;

  return (
    <DocumentsProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/docs" replace />} />
        <Route path="/docs" element={<DocsAllPage />} />
        <Route path="/docs/view/document/:id" element={<DocViewerPage />} />
        <Route path="*" element={<Navigate to="/docs" replace />} />
      </Routes>
    </DocumentsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Trang xem công khai — NẰM NGOÀI lớp đăng nhập */}
        <Route path="/share/d/:id" element={<SharePage />} />
        {/* Mọi route còn lại đi qua lớp đăng nhập */}
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </AuthProvider>
  );
}
