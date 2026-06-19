import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { Download, FileX } from 'lucide-react';
import { db } from '../lib/firebase';
import type { SkillItem } from '../types';
import MarkdownPreview from '../components/MarkdownPreview';
import ThemeToggle from '../components/ThemeToggle';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { useFontScale } from '../components/FontSizeControl';
import { driveDownloadUrl } from '../lib/googleDrive';
import { formatDate } from '../lib/formatDate';

interface SharedSkillPayload {
  skill: SkillItem;
  ownerId: string;
}

type ViewState = 'loading' | 'ready' | 'notfound' | 'error';

// Trang xem công khai (chỉ đọc) một skill được chia sẻ lẻ: shared/skill/{id}.
export default function SharedSkillPage() {
  const { id } = useParams();
  const [state, setState] = useState<ViewState>('loading');
  const [skill, setSkill] = useState<SkillItem | null>(null);
  const { fontPx, control } = useFontScale();

  useEffect(() => {
    let active = true;
    (async () => {
      if (!db || !id) {
        setState('error');
        return;
      }
      try {
        const snap = await get(ref(db, `shared/skill/${id}`));
        if (!active) return;
        const val = snap.val() as SharedSkillPayload | null;
        if (!val || !val.skill) {
          setState('notfound');
          return;
        }
        setSkill(val.skill);
        setState('ready');
      } catch {
        if (active) setState('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div
      className="container share-view"
      style={{ '--share-font-size': `${fontPx}px` } as CSSProperties}
    >
      <header className="share-header">
        <Link to="/" className="brand">📄 Docs Web</Link>
        <div className="share-header-actions">
          {state === 'ready' && skill && control}
          <ThemeToggle />
          <span className="badge badge-shared">Chia sẻ công khai · chỉ đọc</span>
        </div>
      </header>

      {state === 'loading' && <Spinner />}
      {state === 'error' && (
        <p className="warn">Không tải được skill (cấu hình Firebase hoặc mạng).</p>
      )}
      {state === 'notfound' && (
        <EmptyState
          icon={<FileX size={40} aria-hidden="true" />}
          title="Skill không khả dụng"
          description="Skill không tồn tại hoặc chủ sở hữu đã ngừng chia sẻ."
        />
      )}

      {state === 'ready' && skill && (
        <article className="skill-detail">
          <div className="skill-detail-head">
            <span className="skill-detail-icon" aria-hidden="true">
              {skill.icon || '🧩'}
            </span>
            <div className="skill-detail-meta">
              <h1 className="skill-detail-title">{skill.title}</h1>
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
          </a>

          {skill.content.trim() ? (
            <div className="skill-detail-content">
              <MarkdownPreview content={skill.content} />
            </div>
          ) : (
            <p className="muted">Skill này chưa có nội dung hướng dẫn.</p>
          )}
        </article>
      )}
    </div>
  );
}
