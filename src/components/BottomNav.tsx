// Thanh footer cố định dưới cùng: bản quyền + công nghệ đã triển khai.
// Đặt ở App level nên xuất hiện trên MỌI trang (kể cả /share/* ngoài đăng nhập).

// Năm bản quyền: tính 1 lần lúc tải module. Nếu là năm sau mốc khởi tạo thì
// hiển thị dạng khoảng "2026–2027" cho gọn.
const START_YEAR = 2026;
const thisYear = new Date().getFullYear();
const copyrightYear =
  thisYear > START_YEAR ? `${START_YEAR}–${thisYear}` : `${START_YEAR}`;

// Công nghệ đã triển khai trong dự án (xem package.json).
const TECHS = ['React 19', 'TypeScript', 'Vite', 'Firebase'];

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
            <span key={t} className="bottom-nav-badge">
              {t}
            </span>
          ))}
        </span>
      </div>
    </footer>
  );
}
