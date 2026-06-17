// Chuyển một link người dùng dán sang URL "nhúng được" (đặt vào src của iframe).
//
// Nhiều dịch vụ (YouTube, Google Slides/Docs, Drive, Figma, CodePen, Vimeo, Loom…)
// CHẶN nhúng trang thường (X-Frame-Options) nhưng cho phép một URL nhúng riêng.
// Hàm toEmbedUrl nhận diện các dịch vụ phổ biến rồi đổi link thường → link nhúng.
// Link không nhận ra thì giữ nguyên (nhiều site vẫn cho nhúng trực tiếp).

export interface EmbedInfo {
  /** URL đã chuẩn hóa để bỏ vào iframe; null nếu chuỗi không phải URL http(s) hợp lệ. */
  url: string | null;
  /** Tên dịch vụ nhận ra ('YouTube', 'Google Slides'…) hoặc 'Khác' nếu dùng nguyên link. */
  provider: string;
}

// Parse URL an toàn (trả null nếu không hợp lệ hoặc không phải http/https).
function parseUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

// Lấy fileId Google từ đường dẫn dạng /d/{id}/... (Docs, Sheets, Slides, Drive).
function googleDocId(pathname: string): string | null {
  const m = pathname.match(/\/d\/([^/]+)/);
  return m ? m[1] : null;
}

export function toEmbedUrl(raw: string): EmbedInfo {
  const u = parseUrl(raw);
  if (!u) return { url: null, provider: 'Khác' };

  const host = u.hostname.replace(/^www\./, '');

  // --- YouTube: watch?v=, youtu.be/, shorts/, embed/ ---
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = u.searchParams.get('v') || u.pathname.match(/\/(?:shorts|embed)\/([^/]+)/)?.[1];
    if (id) return { url: `https://www.youtube.com/embed/${id}`, provider: 'YouTube' };
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    if (id) return { url: `https://www.youtube.com/embed/${id}`, provider: 'YouTube' };
  }

  // --- Vimeo: vimeo.com/{id} → player.vimeo.com/video/{id} ---
  if (host === 'vimeo.com') {
    const id = u.pathname.split('/').filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return { url: `https://player.vimeo.com/video/${id}`, provider: 'Vimeo' };
  }
  if (host === 'player.vimeo.com') return { url: u.toString(), provider: 'Vimeo' };

  // --- Loom: loom.com/share/{id} → loom.com/embed/{id} ---
  if (host === 'loom.com') {
    const id = u.pathname.match(/\/(?:share|embed)\/([^/]+)/)?.[1];
    if (id) return { url: `https://www.loom.com/embed/${id}`, provider: 'Loom' };
  }

  // --- Google Drive (file PDF/ảnh…): /file/d/{id}/... → /preview ---
  if (host === 'drive.google.com') {
    const id = u.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || u.searchParams.get('id');
    if (id) return { url: `https://drive.google.com/file/d/${id}/preview`, provider: 'Google Drive' };
  }

  // --- Google Slides / Docs / Sheets / Forms: /d/{id}/edit → /preview (Slides: /embed) ---
  if (host === 'docs.google.com') {
    const id = googleDocId(u.pathname);
    if (id) {
      if (u.pathname.startsWith('/presentation'))
        return { url: `https://docs.google.com/presentation/d/${id}/embed`, provider: 'Google Slides' };
      if (u.pathname.startsWith('/spreadsheets'))
        return { url: `https://docs.google.com/spreadsheets/d/${id}/preview`, provider: 'Google Sheets' };
      if (u.pathname.startsWith('/forms'))
        return { url: `https://docs.google.com/forms/d/${id}/viewform?embedded=true`, provider: 'Google Forms' };
      return { url: `https://docs.google.com/document/d/${id}/preview`, provider: 'Google Docs' };
    }
  }

  // --- Google Maps: thêm tham số output=embed nếu chưa có ---
  if (host === 'google.com' && u.pathname.startsWith('/maps')) {
    if (u.pathname.includes('/embed')) return { url: u.toString(), provider: 'Google Maps' };
    u.searchParams.set('output', 'embed');
    return { url: u.toString(), provider: 'Google Maps' };
  }

  // --- Figma: figma.com/(file|design|proto)/... → figma.com/embed?url=... ---
  if (host === 'figma.com') {
    if (u.pathname.startsWith('/embed')) return { url: u.toString(), provider: 'Figma' };
    const embed = new URL('https://www.figma.com/embed');
    embed.searchParams.set('embed_host', 'docs-web');
    embed.searchParams.set('url', raw.trim());
    return { url: embed.toString(), provider: 'Figma' };
  }

  // --- CodePen: codepen.io/{user}/pen/{id} → /embed/{id} ---
  if (host === 'codepen.io') {
    const m = u.pathname.match(/^\/([^/]+)\/(?:pen|embed)\/([^/]+)/);
    if (m) return { url: `https://codepen.io/${m[1]}/embed/${m[2]}`, provider: 'CodePen' };
  }

  // Không nhận ra: dùng nguyên link (nhiều site vẫn cho nhúng iframe trực tiếp).
  return { url: u.toString(), provider: 'Khác' };
}
