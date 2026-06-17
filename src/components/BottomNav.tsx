// Thanh footer cố định dưới cùng: bản quyền + công nghệ đã triển khai.
// Đặt ở App level nên xuất hiện trên MỌI trang (kể cả /share/* ngoài đăng nhập).

// Năm bản quyền: tính 1 lần lúc tải module. Nếu là năm sau mốc khởi tạo thì
// hiển thị dạng khoảng "2026–2027" cho gọn.
const START_YEAR = 2026;
const thisYear = new Date().getFullYear();
const copyrightYear =
  thisYear > START_YEAR ? `${START_YEAR}–${thisYear}` : `${START_YEAR}`;

// Công nghệ đã triển khai trong dự án (xem package.json) — mỗi mục là link
// dẫn tới trang chủ chính thức, mở ở tab mới.
const TECHS: { label: string; href: string }[] = [
  { label: 'React 19', href: 'https://react.dev' },
  { label: 'TypeScript', href: 'https://www.typescriptlang.org' },
  { label: 'Vite', href: 'https://vite.dev' },
  { label: 'Firebase', href: 'https://firebase.google.com' },
  { label: 'Claude Code', href: 'https://claude.com/claude-code' },
];

export default function BottomNav() {
  return (
    <footer className="bottom-nav">
      <div className="bottom-nav-inner">
        <span className="bottom-nav-copy">
          © {copyrightYear} Docs Web. Bảo lưu mọi quyền.
        </span>
        <span className="bottom-nav-tech">
          <span className="bottom-nav-tech-label">Xây dựng bằng</span>
          {TECHS.map((t) => (
            <a
              key={t.label}
              className="bottom-nav-badge"
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.label}
            </a>
          ))}
        </span>
      </div>
    </footer>
  );
}
