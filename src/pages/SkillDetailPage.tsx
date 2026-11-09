import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useDocuments } from '../context/DocumentsContext';
import SharePopover from '../components/SharePopover';
import { useConfirm } from '../context/ConfirmContext';
import AccountMenu from '../components/AccountMenu';
import ActionMenu from '../components/ActionMenu';
import Spinner from '../components/Spinner';
import MarkdownPreview from '../components/MarkdownPreview';
import SkillPrompts from '../components/SkillPrompts';
import SkillEditModal from '../components/SkillEditModal';
import { driveDownloadUrl } from '../lib/googleDrive';
import { formatDate } from '../lib/formatDate';
import { getSharedAncestors } from '../lib/folderTree';

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
  const sharedAncestors = getSharedAncestors(folders, skill.folderId);

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
          <button
            type="button"
            className="btn-icon"
            onClick={() => setEditOpen(true)}
          >
            <Pencil size={16} aria-hidden="true" /> Sửa
          </button>
          <SharePopover
            kind="skill"
            shareUrl={shareUrl}
            isShared={Boolean(skill.isShared)}
            inherited={sharedAncestors.length > 0}
            inheritedFolderName={sharedAncestors[sharedAncestors.length - 1]?.name}
            onToggle={() => toggleShareSkill(skill.id)}
          />
          <ActionMenu
            label="Thêm thao tác cho skill"
            items={[
              {
                key: 'delete',
                label: 'Xóa skill',
                icon: <Trash2 size={16} aria-hidden="true" />,
                onSelect: onDelete,
                danger: true,
              },
            ]}
          />
          <AccountMenu />
        </div>
      </header>

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

        <SkillPrompts prompts={skill.prompts} />

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
