import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/useAuth';
import { DocumentsProvider } from './context/DocumentsContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import Spinner from './components/Spinner';
import BottomNav from './components/BottomNav';
import DriveSyncBanner from './components/DriveSyncBanner';
import DocsAllPage from './pages/DocsAllPage';
import LoginPage from './pages/LoginPage';

// Code-split các trang không cần ngay lúc mở app (trình soạn thảo kéo theo
// mermaid/react-markdown khá nặng) — chỉ tải khi điều hướng tới.
const FolderPage = lazy(() => import('./pages/FolderPage'));
const BatchUploadPage = lazy(() => import('./pages/BatchUploadPage'));
const DocViewerPage = lazy(() => import('./pages/DocViewerPage'));
const SkillDetailPage = lazy(() => import('./pages/SkillDetailPage'));
const SharePage = lazy(() => import('./pages/SharePage'));
const SharedFolderPage = lazy(() => import('./pages/SharedFolderPage'));
const SharedSkillPage = lazy(() => import('./pages/SharedSkillPage'));

function RouteFallback() {
  return (
    <div className="container">
      <Spinner label="Đang tải…" />
    </div>
  );
}

// Khu vực cần đăng nhập.
function AppShell() {
  const { user, loading } = useAuth();

  if (loading)
    return (
      <div className="container">
        <Spinner label="Đang tải…" />
      </div>
    );
  if (!user) return <LoginPage />;

  return (
    <DocumentsProvider>
      {/* Banner nhắc & chạy đồng bộ folder Google Drive (hiện khi có việc chờ) */}
      <DriveSyncBanner />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/docs" replace />} />
          <Route path="/docs" element={<DocsAllPage />} />
          <Route path="/docs/upload" element={<BatchUploadPage />} />
          <Route path="/docs/folder/:folderId" element={<FolderPage />} />
          <Route path="/docs/view/document/:id" element={<DocViewerPage />} />
          <Route path="/docs/skill/:id" element={<SkillDetailPage />} />
          <Route path="*" element={<Navigate to="/docs" replace />} />
        </Routes>
      </Suspense>
    </DocumentsProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      {/* Toast + Confirm đặt ở App level: vùng /share/* (ngoài đăng nhập) cũng
          dùng được, và DocumentsContext cần useToast() nên ToastProvider phải
          bọc NGOÀI DocumentsProvider. */}
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* Trang xem công khai — NẰM NGOÀI lớp đăng nhập */}
                <Route path="/share/d/:id" element={<SharePage />} />
                {/* Chia sẻ cả folder: danh sách tài liệu + xem từng tài liệu */}
                <Route path="/share/f/:id" element={<SharedFolderPage />} />
                <Route path="/share/f/:id/:docId" element={<SharedFolderPage />} />
                {/* Chia sẻ một skill lẻ */}
                <Route path="/share/skill/:id" element={<SharedSkillPage />} />
                {/* Mọi route còn lại đi qua lớp đăng nhập */}
                <Route path="/*" element={<AppShell />} />
              </Routes>
            </Suspense>
            {/* Footer cố định: bản quyền + công nghệ, hiện trên mọi trang */}
            <BottomNav />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
