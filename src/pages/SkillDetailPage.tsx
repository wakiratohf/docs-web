import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Pencil,
  Trash2,
  Share2,
  Link2,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { useDocuments } from '../context/DocumentsContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import ThemeToggle from '../components/ThemeToggle';
import Spinner from '../components/Spinner';
import MarkdownPreview from '../components/MarkdownPreview';
import SkillEditModal from '../components/SkillEditModal';
import { driveDownloadUrl } from '../lib/googleDrive';
import { formatDate } from '../lib/formatDate';

// Định dạng kích thước file gọn (KB/MB) để hiển thị cạnh nút tải về.
function formatSize(bytes?: number): string | null {
  if (typeof bytes !== 'number' || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Trang chi tiết một skill (bố cục 1 cột, kiểu trang plugin của Claude):
// icon + tên + mô tả + tags + nút tải file nén, rồi nội dung markdown hướng dẫn.
export default function SkillDetailPage() {
  const { id } = useParams();
  const { skills, folders, loading, deleteSkill, toggleShareSkill } =
    useDocuments();
  const { toastSuccess, toastError } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);

  const skill = skills.find((s) => s.id === id);
  const folder = skill ? folders.find((f) => f.id === skill.folderId) : undefined;

  const backLink = (
    <Link
      to={folder ? `/docs/folder/${folder.id}` : '/docs'}
      className="btn-icon btn-square back-link"
      title="Quay lại folder"
      aria-label="Quay lại folder"
    >
      <ArrowLeft size={16} aria-hidden="true" />
    </Link>
  );

  if (loading) {
    return (
      <div className="container">
        <div className="back-bar">{backLink}</div>
        <Spinner />
      </div>
    );
  }
  if (!skill) {
    return (
      <div className="container">
        <div className="back-bar">{backLink}</div>
        <p className="muted">Không tìm thấy skill này.</p>
      </div>
    );
  }

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Xóa skill',
      message: `Xóa skill "${skill.title}"? Hành động không thể hoàn tác.`,
      confirmText: 'Xóa',
      danger: true,
    });
    if (ok) {
      deleteSkill(skill.id);
      navigate(folder ? `/docs/folder/${folder.id}` : '/docs');
    }
  };

  const shareUrl = `${window.location.origin}/share/skill/${skill.id}`;
  const onCopyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toastSuccess('Đã copy link chia sẻ');
    } catch {
      toastError('Không copy được link');
    }
  };

  const sizeLabel = formatSize(skill.fileSize);

  return (
    <div className="container">
      <header className="app-header">
        <h1 className="folder-title">
          {backLink}
          <span>🧩</span>
          <span>Chi tiết skill</span>
        </h1>
        <div className="user-box">
          <ThemeToggle />
          <button
            type="button"
            className="btn-icon"
            onClick={() => setEditOpen(true)}
          >
            <Pencil size={16} aria-hidden="true" /> Sửa
          </button>
          <button
            type="button"
            className={`btn-icon ${skill.isShared ? 'primary' : ''}`}
            onClick={() => toggleShareSkill(skill.id)}
            title="Bật/tắt chia sẻ công khai skill này"
          >
            {skill.isShared ? (
              <Link2 size={16} aria-hidden="true" />
            ) : (
              <Share2 size={16} aria-hidden="true" />
            )}{' '}
            {skill.isShared ? 'Đang chia sẻ' : 'Chia sẻ'}
          </button>
          <button type="button" className="btn-icon danger" onClick={onDelete}>
            <Trash2 size={16} aria-hidden="true" /> Xóa
          </button>
        </div>
      </header>

      {skill.isShared && (
        <div className="share-bar">
          <span className="muted">Link công khai (ai có link đều xem được):</span>
          <input
            className="share-url"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.target.select()}
          />
          <button type="button" className="btn-icon" onClick={onCopyShare}>
            <Copy size={16} aria-hidden="true" /> Copy
          </button>
          <a className="btn-icon" href={shareUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" /> Mở
          </a>
        </div>
      )}

      <article className="skill-detail">
        <div className="skill-detail-head">
          <span className="skill-detail-icon" aria-hidden="true">
            {skill.icon || '🧩'}
          </span>
          <div className="skill-detail-meta">
            <h2 className="skill-detail-title">{skill.title}</h2>
            {skill.description && (
              <p className="skill-detail-desc">{skill.description}</p>
            )}
            {skill.tags && skill.tags.length > 0 && (
              <div className="skill-tags">
                {skill.tags.map((t) => (
                  <span key={t} className="skill-tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <p className="skill-detail-dates muted">
              {skill.author && (
                <span className="doc-date" title="Tác giả">
                  ✍ {skill.author}
                </span>
              )}
              <span className="doc-date" title="Cập nhật gần nhất">
                Sửa: {formatDate(skill.updatedAt)}
              </span>
            </p>
          </div>
        </div>

        <a
          className="btn-icon primary skill-download"
          href={driveDownloadUrl(skill.fileId)}
          target="_blank"
          rel="noreferrer"
        >
          <Download size={16} aria-hidden="true" /> Tải file nén
          {sizeLabel ? ` (${sizeLabel})` : ''}
        </a>

        {skill.content.trim() ? (
          <div className="skill-detail-content">
            <MarkdownPreview content={skill.content} />
          </div>
        ) : (
          <p className="muted">Skill này chưa có nội dung hướng dẫn.</p>
        )}
      </article>

      <SkillEditModal
        open={editOpen}
        skill={skill}
        onCancel={() => setEditOpen(false)}
        onDone={() => setEditOpen(false)}
      />
    </div>
  );
}
