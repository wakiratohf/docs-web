import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Link2, FileUp, FileArchive, Loader2, Info, Check, Plus, Trash2 } from 'lucide-react';
import { useDocuments } from '../context/DocumentsContext';
import { useAuth } from '../auth/useAuth';
import { useToast } from '../context/ToastContext';
import AuthorInput from './AuthorInput';
import {
  APP_FOLDER_NAME,
  getDriveAccessToken,
  ensureWebFolderDrive,
  uploadFileToDrive,
  makeFilePublic,
  parseDriveFileId,
} from '../lib/googleDrive';
import type { SkillItem, SkillPrompt } from '../types';

// Hộp thoại TẠO / SỬA một skill. Gộp 2 phần:
//  1. Metadata: tên, emoji, mô tả ngắn, tags (tách dấu phẩy), nội dung markdown.
//  2. Nguồn file nén (.zip) — 2 tab giống AddPdfModal:
//     - Upload file: đẩy .zip lên Drive (folder "Docs Web ▸ {tên folder}"), đặt
//       công khai rồi lưu fileId (driveOwned=true).
//     - Dán link Drive: trích fileId từ link file đã có (driveOwned=false).
//
// Mọi ghi dữ liệu đi qua addSkill/updateSkill của context, component KHÔNG tự ghi
// Firebase. Lý do tách "Kết nối Drive" và "Chọn file" thành 2 cú click: popup
// OAuth chỉ mở được khi gesture chưa bị tiêu thụ (xem AddPdfModal).

export interface SkillEditModalProps {
  open: boolean;
  /** folderId của folder skill (bắt buộc khi TẠO mới). */
  folderId?: string;
  /** Skill đang sửa; bỏ trống = tạo mới. */
  skill?: SkillItem;
  onCancel: () => void;
  onDone?: (id: string) => void;
}

type Tab = 'upload' | 'link';

// Kết quả file đã sẵn sàng để lưu (upload xong hoặc dán-link đã parse).
interface FileResult {
  fileId: string;
  fileName?: string;
  fileSize?: number;
  driveOwned: boolean;
}

export default function SkillEditModal({
  open,
  folderId,
  skill,
  onCancel,
  onDone,
}: SkillEditModalProps) {
  const { addSkill, updateSkill, setFolderDriveId, folders, skills, documents } =
    useDocuments();
  const { user } = useAuth();
  const { toastSuccess, toastError } = useToast();

  // Tên người đang đăng nhập — gợi ý sẵn khi tạo skill (sửa lại được).
  const defaultAuthor = user?.displayName ?? user?.email ?? '';
  // Danh sách tác giả của TOÀN bộ website (gom từ mọi tài liệu lẫn skill), đổ
  // vào dropdown gợi ý — không chỉ riêng tác giả đã dùng cho skill.
  const authorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) {
      const a = (d.author ?? '').trim();
      if (a) set.add(a);
    }
    for (const s of skills) {
      const a = (s.author ?? '').trim();
      if (a) set.add(a);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [documents, skills]);

  // Gợi ý nền tảng cho ô prompt: gom mọi platform đã dùng trong skill + vài mặc
  // định phổ biến, bỏ trùng, sort tiếng Việt.
  const platformOptions = useMemo(() => {
    const set = new Set<string>(['Android', 'iOS', 'Web']);
    for (const s of skills) {
      for (const p of s.prompts ?? []) {
        const v = (p.platform ?? '').trim();
        if (v) set.add(v);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [skills]);

  const editing = !!skill;
  const targetFolderId = skill?.folderId ?? folderId;
  const folder = targetFolderId
    ? folders.find((f) => f.id === targetFolderId)
    : undefined;
  const destLabel = folder ? `${APP_FOLDER_NAME} ▸ ${folder.name}` : APP_FOLDER_NAME;

  // --- Metadata ---
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [prompts, setPrompts] = useState<SkillPrompt[]>([]);

  // --- Nguồn file ---
  const [tab, setTab] = useState<Tab>('upload');
  const [link, setLink] = useState('');
  // File đã sẵn sàng (upload xong / sẽ parse từ link lúc lưu). null = giữ file cũ (khi sửa).
  const [uploaded, setUploaded] = useState<FileResult | null>(null);

  const [busy, setBusy] = useState(false);
  const tokenRef = useRef<{ value: string; exp: number } | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mỗi lần mở: nạp lại giá trị từ skill (nếu sửa) hoặc về mặc định (nếu tạo).
  useEffect(() => {
    if (!open) return;
    setTitle(skill?.title ?? '');
    setIcon(skill?.icon ?? '');
    setDescription(skill?.description ?? '');
    setTagsText(skill?.tags?.join(', ') ?? '');
    // Sửa: giữ tác giả cũ. Tạo mới: gợi ý sẵn người đang đăng nhập.
    setAuthor(skill?.author ?? defaultAuthor);
    setContent(skill?.content ?? '');
    setPrompts(skill?.prompts ?? []);
    setTab('upload');
    setLink('');
    setUploaded(null);
    setBusy(false);
    setDragOver(false);
  }, [open, skill, defaultAuthor]);

  if (!open) return null;

  const hasFreshToken = () =>
    tokenRef.current != null && Date.now() < tokenRef.current.exp;

  const parseTags = (s: string): string[] =>
    s
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

  // --- Mẫu prompt -------------------------------------------------------------
  const addPrompt = () =>
    setPrompts((prev) => [
      ...prev,
      { id: crypto.randomUUID(), platform: '', text: '' },
    ]);
  const updatePrompt = (id: string, patch: Partial<SkillPrompt>) =>
    setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removePrompt = (id: string) =>
    setPrompts((prev) => prev.filter((p) => p.id !== id));

  // --- Tab Upload: kết nối Drive rồi chọn/kéo-thả file .zip --------------------
  const connectDrive = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const token = await getDriveAccessToken();
      if (!token) {
        toastError('Không lấy được quyền Google Drive.');
        return;
      }
      tokenRef.current = { value: token, exp: Date.now() + 50 * 60 * 1000 };
      setHasToken(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toastError(`Kết nối Drive thất bại: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const pickFile = () => {
    if (busy) return;
    if (!hasFreshToken()) {
      tokenRef.current = null;
      setHasToken(false);
      toastError('Phiên Drive đã hết hạn — bấm "Kết nối Google Drive" lại.');
      return;
    }
    inputRef.current?.click();
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void uploadZip(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    if (!hasFreshToken()) {
      tokenRef.current = null;
      setHasToken(false);
      toastError('Hãy bấm "Kết nối Google Drive" trước khi thả file.');
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadZip(file);
  };

  // Chỉ nhận file nén (.zip). Một số trình duyệt báo type rỗng cho .zip nên xét cả đuôi.
  const isZip = (file: File): boolean =>
    /\.zip$/i.test(file.name) ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed';

  const uploadZip = async (file: File) => {
    if (busy) return;
    if (!isZip(file)) {
      toastError('Chỉ nhận file nén .zip.');
      return;
    }
    const token = tokenRef.current?.value;
    if (!token) {
      toastError('Mất kết nối Drive — bấm "Kết nối Google Drive" lại.');
      return;
    }
    setBusy(true);
    try {
      // Mirror folder Drive theo folder skill (tạo nếu chưa có, lưu lại id).
      let destFolderId: string | undefined;
      if (folder) {
        destFolderId = await ensureWebFolderDrive(
          token,
          folder.name,
          folder.driveFolderId,
        );
        if (destFolderId !== folder.driveFolderId) {
          setFolderDriveId(folder.id, destFolderId);
        }
      }
      const fileId = await uploadFileToDrive(
        file,
        token,
        destFolderId,
        'application/zip',
      );
      await makeFilePublic(fileId, token);
      setUploaded({
        fileId,
        fileName: file.name,
        fileSize: file.size,
        driveOwned: true,
      });
      toastSuccess('Đã tải file nén lên Drive.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      tokenRef.current = null;
      setHasToken(false);
      toastError(`Tải file thất bại: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  // --- Lưu (tạo / cập nhật) ---------------------------------------------------
  const save = () => {
    if (busy) return;
    const name = title.trim();
    if (!name) {
      toastError('Hãy nhập tên skill.');
      return;
    }

    // Quyết định file nén dùng cho skill.
    let file: FileResult | null = uploaded;
    if (!file) {
      if (tab === 'link' && link.trim()) {
        const fid = parseDriveFileId(link);
        if (!fid) {
          toastError('Link Google Drive không hợp lệ.');
          return;
        }
        file = { fileId: fid, driveOwned: false };
      } else if (editing && skill) {
        // Giữ nguyên file cũ khi sửa mà không đổi file.
        file = {
          fileId: skill.fileId,
          fileName: skill.fileName,
          fileSize: skill.fileSize,
          driveOwned: skill.driveOwned ?? false,
        };
      }
    }
    if (!file || !file.fileId) {
      toastError('Hãy upload file .zip hoặc dán link Drive cho skill.');
      return;
    }

    const tags = parseTags(tagsText);
    const iconVal = icon.trim();
    // Chuẩn hóa prompt: bỏ prompt rỗng text; trim platform (rỗng = Cơ bản).
    const cleanedPrompts: SkillPrompt[] = prompts
      .map((p) => ({ id: p.id, platform: p.platform?.trim() || '', text: p.text.trim() }))
      .filter((p) => p.text.length > 0);

    if (editing && skill) {
      updateSkill(skill.id, {
        title: name,
        description: description.trim(),
        content,
        icon: iconVal,
        tags,
        author: author.trim(),
        prompts: cleanedPrompts,
        fileId: file.fileId,
        fileName: file.fileName,
        fileSize: file.fileSize,
        driveOwned: file.driveOwned,
      });
      toastSuccess('Đã lưu skill.');
      onDone?.(skill.id);
      return;
    }

    if (!targetFolderId) {
      toastError('Thiếu folder để tạo skill.');
      return;
    }
    const created = addSkill({
      folderId: targetFolderId,
      title: name,
      description: description.trim(),
      content,
      icon: iconVal || undefined,
      tags,
      author: author.trim() || undefined,
      prompts: cleanedPrompts.length ? cleanedPrompts : undefined,
      fileId: file.fileId,
      fileName: file.fileName,
      fileSize: file.fileSize,
      driveOwned: file.driveOwned,
    });
    if (!created) {
      toastError('Không tạo được skill.');
      return;
    }
    toastSuccess('Đã thêm skill.');
    onDone?.(created.id);
  };

  // Nhãn file hiện tại (ưu tiên file vừa upload, rồi tới file cũ khi sửa).
  const currentFileLabel = uploaded
    ? uploaded.fileName ?? 'File nén đã tải lên'
    : editing && skill
      ? skill.fileName ?? `File hiện tại (${skill.driveOwned ? 'đã upload' : 'dán-link'})`
      : null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-edit-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      >
        <h2 id="skill-edit-title" className="modal-title">
          {editing ? 'Sửa skill' : 'Thêm skill'}
        </h2>

        <div className="skill-form-row">
          <div className="skill-form-icon">
            <label className="modal-field-label" htmlFor="skill-icon">
              Icon
            </label>
            <input
              id="skill-icon"
              className="modal-input skill-icon-input"
              placeholder="🧩"
              maxLength={4}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
            />
          </div>
          <div className="skill-form-title">
            <label className="modal-field-label" htmlFor="skill-title">
              Tên skill
            </label>
            <input
              id="skill-title"
              className="modal-input"
              placeholder="Frontend Design"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>

        <label className="modal-field-label" htmlFor="skill-desc">
          Mô tả ngắn
        </label>
        <input
          id="skill-desc"
          className="modal-input"
          placeholder="Một câu mô tả skill làm gì"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="modal-field-label" htmlFor="skill-tags">
          Tags (cách nhau bởi dấu phẩy)
        </label>
        <input
          id="skill-tags"
          className="modal-input"
          placeholder="Claude Code, Frontend, Design"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
        />

        <label className="modal-field-label" htmlFor="skill-author">
          Tác giả
        </label>
        <AuthorInput
          id="skill-author"
          className="modal-input"
          value={author}
          authors={authorOptions}
          placeholder="Người tạo ra skill này"
          onChange={setAuthor}
        />

        <label className="modal-field-label" htmlFor="skill-content">
          Nội dung / hướng dẫn (Markdown)
        </label>
        <textarea
          id="skill-content"
          className="modal-input skill-content-input"
          rows={6}
          placeholder="# Cách dùng&#10;Mô tả chi tiết, ví dụ prompt…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        {/* Mẫu prompt kích hoạt */}
        <div className="skill-prompt-editor-head">
          <span className="modal-field-label">Mẫu prompt kích hoạt</span>
          <button
            type="button"
            className="btn-icon skill-prompt-add"
            onClick={addPrompt}
          >
            <Plus size={14} aria-hidden="true" /> Thêm prompt
          </button>
        </div>
        {prompts.length === 0 ? (
          <p className="pdf-hint">
            <Info size={14} aria-hidden="true" />
            <span>
              Thêm các câu prompt để người dùng copy nhanh. Để trống nền tảng = prompt "Cơ bản".
            </span>
          </p>
        ) : (
          <div className="skill-prompt-editor-list">
            {prompts.map((p) => (
              <div key={p.id} className="skill-prompt-editor-row">
                <div className="skill-prompt-editor-top">
                  <AuthorInput
                    className="modal-input"
                    value={p.platform ?? ''}
                    authors={platformOptions}
                    addLabel="Thêm nền tảng mới:"
                    placeholder="Nền tảng (để trống = Cơ bản)"
                    onChange={(v) => updatePrompt(p.id, { platform: v })}
                  />
                  <button
                    type="button"
                    className="btn-icon btn-square danger"
                    onClick={() => removePrompt(p.id)}
                    title="Xóa prompt này"
                    aria-label="Xóa prompt này"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
                <textarea
                  className="modal-input skill-prompt-editor-text"
                  rows={3}
                  placeholder="Nội dung prompt để kích hoạt skill…"
                  value={p.text}
                  onChange={(e) => updatePrompt(p.id, { text: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}

        {/* Nguồn file nén */}
        <span className="modal-field-label">File nén (.zip)</span>
        <div className="pdf-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upload'}
            className={`pdf-tab${tab === 'upload' ? ' selected' : ''}`}
            onClick={() => setTab('upload')}
          >
            <FileUp size={16} aria-hidden="true" /> Upload .zip
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'link'}
            className={`pdf-tab${tab === 'link' ? ' selected' : ''}`}
            onClick={() => setTab('link')}
          >
            <Link2 size={16} aria-hidden="true" /> Dán link Drive
          </button>
        </div>

        {tab === 'upload' ? (
          <>
            <div className="pdf-dest">
              <FileArchive size={16} aria-hidden="true" />
              <span>
                File nén sẽ lưu vào Google&nbsp;Drive của bạn, trong{' '}
                <strong>{destLabel}</strong>.
              </span>
            </div>

            {!hasToken ? (
              <button
                type="button"
                className="primary pdf-action-btn"
                disabled={busy}
                onClick={connectDrive}
              >
                {busy ? (
                  <Loader2 className="spin" size={16} aria-hidden="true" />
                ) : (
                  <FileUp size={16} aria-hidden="true" />
                )}{' '}
                {busy ? 'Đang kết nối…' : 'Kết nối Google Drive'}
              </button>
            ) : (
              <div
                className={`pdf-dropzone${dragOver ? ' over' : ''}${busy ? ' busy' : ''}`}
                role="button"
                tabIndex={0}
                aria-disabled={busy}
                onClick={pickFile}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pickFile();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!busy) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                {busy ? (
                  <Loader2 className="spin" size={22} aria-hidden="true" />
                ) : (
                  <FileArchive size={22} aria-hidden="true" />
                )}
                <span className="pdf-dropzone-text">
                  {busy
                    ? 'Đang tải…'
                    : 'Kéo & thả file .zip vào đây, hoặc bấm để chọn'}
                </span>
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              hidden
              onChange={onPick}
            />
          </>
        ) : (
          <>
            <input
              className="modal-input"
              placeholder="https://drive.google.com/file/d/.../view"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <p className="pdf-hint">
              <Info size={14} aria-hidden="true" />
              <span>
                File phải để chế độ "Bất kỳ ai có liên kết" thì người tải mới mở được.
              </span>
            </p>
          </>
        )}

        {currentFileLabel && (
          <p className="skill-file-current">
            <Check size={14} aria-hidden="true" /> {currentFileLabel}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Hủy
          </button>
          <button type="button" className="primary" disabled={busy} onClick={save}>
            {editing ? 'Lưu' : 'Tạo skill'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
