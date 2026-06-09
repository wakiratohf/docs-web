import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { db } from '../lib/firebase';
import type { DocItem } from '../types';
import HtmlContent from '../components/HtmlContent';
import MarkdownPreview from '../components/MarkdownPreview';

interface SharedPayload {
  document: DocItem;
  ownerId: string;
}

type ViewState = 'loading' | 'ready' | 'notfound' | 'error';

export default function SharePage() {
  const { id } = useParams();
  const [state, setState] = useState<ViewState>('loading');
  const [doc, setDoc] = useState<DocItem | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!db || !id) {
        setState('error');
        return;
      }
      try {
        const snap = await get(ref(db, `shared/d/${id}`));
        if (!active) return;
        const val = snap.val() as SharedPayload | null;
        if (!val || !val.document) {
          setState('notfound');
          return;
        }
        setDoc(val.document);
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
    <div className="container share-view">
      <header className="share-header">
        <Link to="/" className="brand">📄 Docs Web</Link>
        <span className="badge badge-shared">Chia sẻ công khai · chỉ đọc</span>
      </header>

      {state === 'loading' && <p className="muted">Đang tải…</p>}
      {state === 'error' && (
        <p className="warn">Không tải được tài liệu (cấu hình Firebase hoặc mạng).</p>
      )}
      {state === 'notfound' && (
        <p className="muted empty">
          Tài liệu không tồn tại hoặc chủ sở hữu đã ngừng chia sẻ.
        </p>
      )}
      {state === 'ready' && doc && (
        <article className="share-doc">
          <h1>{doc.title || '(không tiêu đề)'}</h1>
          {doc.type === 'note' ? (
            <HtmlContent value={doc.content} />
          ) : (
            <MarkdownPreview content={doc.content} />
          )}
        </article>
      )}
    </div>
  );
}
