# Dựng một web app trên Firebase — từ con số 0 đến deploy

> **Tài liệu này dùng để làm gì?**
> Đọc xong file này, bạn (hoặc Claude Code) có thể tự dựng một web app **React + Vite + TypeScript** chạy trên **Firebase Hosting**, có sẵn **đăng nhập bằng Google** (Authentication), **lưu dữ liệu thời gian thực** (Realtime Database) và **lưu file** (Storage). Đây là nền tảng để chạy các tính năng như "Documents" (xem file `documents-feature-spec.md` đi kèm).
>
> Mọi đoạn code/cấu hình trong tài liệu được trích nguyên văn từ một dự án thật đang chạy, nên copy là dùng được ngay.

---

## Mục lục

1. [Tổng quan & kiến trúc](#1-tổng-quan--kiến-trúc)
2. [Yêu cầu máy](#2-yêu-cầu-máy)
3. [Tạo project trên Firebase Console](#3-tạo-project-trên-firebase-console)
4. [Cấu hình biến môi trường (.env)](#4-cấu-hình-biến-môi-trường-env)
5. [Khởi tạo Firebase SDK trong code](#5-khởi-tạo-firebase-sdk-trong-code)
6. [File cấu hình firebase.json và .firebaserc](#6-file-cấu-hình-firebasejson-và-firebaserc)
7. [Luật bảo mật (Security Rules)](#7-luật-bảo-mật-security-rules)
8. [Build & Deploy](#8-build--deploy)
9. [Bảng lệnh hay dùng](#9-bảng-lệnh-hay-dùng)
10. [Sự cố thường gặp & cách xử lý](#10-sự-cố-thường-gặp--cách-xử-lý)
11. [Checklist hoàn thành](#11-checklist-hoàn-thành)

---

## 1. Tổng quan & kiến trúc

Hình dung đơn giản như sau:

- Bạn viết code web bằng **React** (giao diện) + **Vite** (công cụ build, đóng gói code).
- Khi chạy lệnh `npm run build`, Vite gom toàn bộ code thành một thư mục tĩnh tên là **`dist/`** — chỉ gồm các file `.html`, `.js`, `.css`. Đây là "web đã đóng gói".
- **Firebase Hosting** chỉ làm một việc: đưa thư mục `dist/` đó lên internet, cho người dùng truy cập qua một địa chỉ kiểu `https://tên-site.web.app`.

Ngoài Hosting (chỉ chứa file tĩnh), web còn cần 3 dịch vụ khác của Firebase để "có hồn":

| Dịch vụ | Vai trò (giải thích dễ hiểu) |
|---|---|
| **Authentication** | Cho người dùng đăng nhập (ở đây dùng tài khoản Google). Mỗi người có một mã định danh riêng gọi là `uid`. |
| **Realtime Database** | Một kho dữ liệu dạng cây (giống một file JSON khổng lồ) lưu trên mây, tự đồng bộ tức thời giữa các máy. Dùng để lưu nội dung người dùng tạo ra. |
| **Storage** | Kho chứa file (PDF, ảnh, văn bản...). Database chỉ nên giữ chữ và số, file nặng thì để ở đây. |

> **Điểm quan trọng về "rewrites":**
> Web này là kiểu **SPA** (Single Page Application — toàn bộ web là một trang `index.html` duy nhất, việc chuyển trang do JavaScript xử lý chứ không tải lại từ server). Vì thế khi người dùng gõ thẳng một địa chỉ con như `https://tên-site.web.app/docs/abc`, server phải trả về `index.html` để JavaScript tự đọc đường dẫn và hiển thị đúng trang. Cấu hình `rewrites` (mục 6) làm chính việc này. **Thiếu nó thì gõ link con sẽ ra lỗi 404.**

---

## 2. Yêu cầu máy

Cần cài sẵn:

- **Node.js phiên bản ≥ 20** và **npm** (npm đi kèm Node). Kiểm tra: `node -v`.
- **Git** (để quản lý mã nguồn).
- **Firebase CLI** — công cụ dòng lệnh của Firebase. Cài một lần cho toàn máy:

```bash
npm install -g firebase-tools
```

Kiểm tra đã cài được chưa:

```bash
firebase --version
```

---

## 3. Tạo project trên Firebase Console

Làm trên trình duyệt, tại https://console.firebase.google.com:

1. **Tạo project**: bấm **Add project** → đặt tên (ví dụ `my-web-app`) → bấm tiếp đến khi xong. Firebase sẽ tự sinh ra một **Project ID** (ví dụ `my-web-app-12345`) — nhớ ID này.

2. **Đăng ký Web app để lấy config**: trong project, bấm biểu tượng **Web** (`</>`) → đặt tên app → **Register app**. Màn hình sẽ hiện một đoạn `firebaseConfig` gồm các giá trị `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`. **Copy lại các giá trị này** (lát nữa dán vào file `.env`).

3. **Bật Authentication**: vào menu **Authentication** → **Get started** → tab **Sign-in method** → bật **Google** → Save.

4. **Tạo Realtime Database**: vào menu **Realtime Database** → **Create Database** → chọn vùng (US / Châu Âu / Singapore tùy bạn) → chọn **Start in locked mode** (an toàn, lát nữa ta sẽ deploy luật riêng). Sau khi tạo, copy **Database URL** (dạng `https://my-web-app-12345-default-rtdb.firebaseio.com`).

5. **Bật Storage**: vào menu **Storage** → **Get started** → chọn production mode → xong.
   > ⚠️ **Bắt buộc bật Storage qua Console ít nhất một lần** trước khi deploy luật Storage bằng dòng lệnh, nếu không lệnh deploy sẽ báo lỗi.

---

## 4. Cấu hình biến môi trường (.env)

"Biến môi trường" là cách lưu các thông tin cấu hình (như khóa API) **bên ngoài code**, để không phải viết cứng vào mã nguồn và không đẩy lên Git.

Trong dự án có sẵn một file mẫu tên `.env.example`. Nội dung của nó:

```bash
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_DATABASE_URL=your_database_url
```

**Cách làm:** copy file mẫu thành file thật tên `.env`, rồi điền giá trị lấy ở bước 3.

```bash
cp .env.example .env
```

Bảng đối chiếu — mỗi biến lấy giá trị từ đâu:

| Biến trong `.env` | Lấy từ đâu trên Console |
|---|---|
| `VITE_FIREBASE_API_KEY` | `firebaseConfig.apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `firebaseConfig.authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `firebaseConfig.projectId` (chính là Project ID) |
| `VITE_FIREBASE_STORAGE_BUCKET` | `firebaseConfig.storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `firebaseConfig.messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `firebaseConfig.appId` |
| `VITE_FIREBASE_DATABASE_URL` | Database URL ở bước 4 (Realtime Database) |

> **Vì sao tên biến phải bắt đầu bằng `VITE_`?**
> Vite (công cụ build) chỉ "nhìn thấy" và nhúng vào web những biến môi trường có tiền tố `VITE_`. Đặt tên khác sẽ không đọc được. Trong code, đọc biến bằng cú pháp `import.meta.env.VITE_...` (xem mục 5).

> **Lưu ý bảo mật:** File `.env` **không được commit lên Git** (thường đã có sẵn trong `.gitignore`). Mỗi người/môi trường giữ file `.env` riêng. Riêng `apiKey` của Firebase không phải bí mật tuyệt đối (nó sẽ nằm trong code chạy ở trình duyệt), nhưng nên vào Console bật giới hạn (API restrictions) cho an toàn.

---

## 5. Khởi tạo Firebase SDK trong code

Tạo một file `src/lib/firebase.ts` để khởi tạo Firebase một lần và dùng chung cho cả app. Nội dung nguyên văn:

```typescript
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
};

// Initialize Firebase only if config is provided
const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = isConfigured ? getAuth(app!) : null;
export const db = isConfigured ? getDatabase(app!) : null;
export const storage = isConfigured ? getStorage(app!) : null;
export const googleProvider = isConfigured ? new GoogleAuthProvider() : null;
```

**Giải thích cách hoạt động:**

- `initializeApp` khởi động kết nối tới Firebase bằng config ở trên.
- `getAuth`, `getDatabase`, `getStorage` lấy ra 3 dịch vụ tương ứng (đăng nhập, database, kho file).
- `googleProvider` là "nút đăng nhập Google" để dùng với `signInWithPopup` (mở cửa sổ đăng nhập Google).

> **Mẹo quan trọng — pattern xuất ra `null`:**
> Biến `isConfigured` kiểm tra xem đã có `apiKey` và `projectId` chưa. Nếu **chưa** (ví dụ quên tạo file `.env`), tất cả `app`/`auth`/`db`/`storage`/`googleProvider` sẽ là `null` thay vì làm cả app **crash trắng màn hình**. Đổi lại, **mọi nơi dùng các biến này đều phải kiểm tra null trước** (ví dụ `if (!db) return;`). Đây là một thói quen tốt nên giữ.

Cài thư viện Firebase cho dự án (chỉ cần một gói duy nhất, nó gói sẵn auth/database/storage bên trong):

```bash
npm install firebase
```

> Dự án gốc dùng `firebase` phiên bản `^12`. Bạn không cần cài riêng từng gói con như `@firebase/auth` — chúng đã nằm trong gói `firebase`.

---

## 6. File cấu hình firebase.json và .firebaserc

### 6.1. `firebase.json` — đặt ở thư mục gốc dự án

File này nói cho Firebase CLI biết: hosting lấy file ở đâu, luật database/storage nằm ở file nào. Nội dung nguyên văn:

```json
{
  "database": {
    "rules": "database.rules.json"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "hosting": {
    "site": "simplepm",
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

Giải thích từng phần:

- **`hosting.site`** = `"simplepm"` — tên **Hosting site**. Địa chỉ web sẽ là `https://simplepm.web.app`. **Bạn phải đổi giá trị này** thành tên site của mình. Tạo site mới bằng lệnh:
  ```bash
  firebase hosting:sites:create ten-site-cua-ban
  ```
  rồi sửa `"site"` trong `firebase.json` cho khớp.
- **`hosting.public`** = `"dist"` — thư mục chứa web đã build (Vite mặc định build ra `dist/`). Firebase sẽ đẩy toàn bộ nội dung thư mục này lên.
- **`hosting.ignore`** — danh sách file **không** đẩy lên: chính file `firebase.json`, mọi file ẩn (`.env`, `.gitignore`...), và `node_modules`.
- **`hosting.rewrites`** — quy tắc SPA đã nói ở mục 1: **mọi** đường dẫn (`"source": "**"`) đều trả về `/index.html`.
- **`database.rules`** / **`storage.rules`** — trỏ tới hai file luật bảo mật (mục 7).

### 6.2. `.firebaserc` — đặt ở thư mục gốc dự án

File này ghi nhớ Project ID mặc định để khỏi phải gõ lại mỗi lần. Nội dung:

```json
{
  "projects": {
    "default": "my-web-app-12345"
  }
}
```

Thay `my-web-app-12345` bằng Project ID thật của bạn. Có thể tạo file này tự động bằng:

```bash
firebase login          # đăng nhập tài khoản Google quản lý Firebase
firebase use --add      # chọn project và đặt alias "default"
```

---

## 7. Luật bảo mật (Security Rules)

Luật bảo mật quyết định **ai được đọc/ghi dữ liệu nào**. Không có luật đúng thì dữ liệu hoặc bị khóa hết, hoặc mở toang cho bất kỳ ai sửa.

### 7.1. Realtime Database — file `database.rules.json`

Một vài khái niệm để đọc luật dễ hơn:

- `auth` — thông tin người đăng nhập. `auth != null` nghĩa là "đã đăng nhập".
- `auth.uid` — mã định danh của người đang đăng nhập.
- `$uid`, `$pid` — "biến đại diện" cho một mảnh đường dẫn bất kỳ (ví dụ `users/$uid` khớp với mọi user).
- `data` = dữ liệu **hiện có**; `newData` = dữ liệu **muốn ghi vào**.
- `root.child('...')` — đọc một nhánh khác tính từ gốc cây dữ liệu (để kiểm tra điều kiện chéo).

Đây là toàn bộ file luật của dự án gốc (cấu trúc multi-user chia sẻ project). Bạn có thể dùng làm khung và lược bớt nếu app đơn giản hơn:

```json
{
  "rules": {
    "usersByEmail": {
      "$emailHash": {
        ".read": "auth != null",
        ".write": "auth != null && newData.child('uid').val() === auth.uid"
      }
    },
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid",
        "projects_v3": {
          "$pid": {
            ".write": "auth != null && (auth.uid === $uid || root.child('projects').child($pid).child('members').child(auth.uid).child('role').val() === 'owner')"
          }
        }
      }
    },
    "projects": {
      "$pid": {
        ".read": "auth != null && data.child('members').child(auth.uid).exists()",
        ".write": "auth != null && !newData.exists() && (!data.exists() || data.child('members').child(auth.uid).child('role').val() === 'owner')",
        "meta": {
          ".write": "auth != null && (root.child('projects').child($pid).child('members').child(auth.uid).child('role').val() === 'owner' || (!data.exists() && newData.child('ownerId').val() === auth.uid))"
        },
        "members": {
          "$memberUid": {
            ".write": "auth != null && (root.child('projects').child($pid).child('members').child(auth.uid).child('role').val() === 'owner' || (!data.parent().exists() && newData.child('role').val() === 'owner' && $memberUid === auth.uid) || ...)"
          }
        },
        "$collection": {
          ".write": "auth != null && (root.child('projects').child($pid).child('members').child(auth.uid).child('role').val() === 'owner' || root.child('projects').child($pid).child('members').child(auth.uid).child('role').val() === 'editor')"
        }
      }
    },
    "shared": {
      ".read": true,
      "$type": {
        ".indexOn": ["ownerId"],
        "$id": {
          ".write": "auth != null && (!data.exists() ? newData.child('ownerId').val() === auth.uid : data.child('ownerId').val() === auth.uid)"
        }
      }
    }
  }
}
```

Ý nghĩa các nhánh chính:

| Nhánh dữ liệu | Ý nghĩa |
|---|---|
| `users/{uid}` | Dữ liệu riêng của từng người. Chỉ chính chủ (`auth.uid === $uid`) mới đọc/ghi. Đây là chỗ tốt nhất để lưu dữ liệu cá nhân nếu app của bạn đơn giản (một người một kho). |
| `projects/{pid}` | Dữ liệu một project dùng chung nhiều người. Chỉ **thành viên** (`members`) mới đọc; chỉ **owner/editor** mới ghi. |
| `shared/{type}/{id}` | Nhánh **chia sẻ công khai**: `".read": true` nghĩa là **ai cũng đọc được, không cần đăng nhập** — dùng cho link chia sẻ. Nhưng chỉ chủ sở hữu (`ownerId`) mới ghi được. |

> **Nếu app của bạn chỉ cần "mỗi người một kho riêng"**, bạn có thể rút gọn còn đúng nhánh `users/{uid}` (và `shared` nếu muốn có link chia sẻ công khai). Bỏ hẳn `projects`/`members`/`usersByEmail`.

### 7.2. Storage — file `storage.rules`

Toàn bộ file luật Storage của dự án gốc (cho phép mỗi người chỉ upload file vào thư mục của chính mình, mỗi file tối đa 25 MB, chỉ nhận văn bản/markdown/PDF):

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    // Per-user document uploads. Each user reads/writes only under their own UID prefix.
    // Caps individual files at 25 MB and restricts to txt / pdf / markdown content types.
    match /users/{uid}/docs/{docId}/{fileName} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if request.auth != null
        && request.auth.uid == uid
        && (request.resource == null || (
          request.resource.size < 25 * 1024 * 1024
          && (
            request.resource.contentType == 'text/plain'
            || request.resource.contentType == 'text/markdown'
            || request.resource.contentType == 'application/pdf'
            || request.resource.contentType == 'application/octet-stream'
          )
        ));
    }
  }
}
```

Giải thích:

- `match /users/{uid}/docs/{docId}/{fileName}` — luật áp cho mọi file nằm theo đường dẫn này.
- `allow read ... request.auth.uid == uid` — chỉ chính chủ mới tải file của mình.
- `allow write` chỉ cho phép khi: đã đăng nhập, đúng chủ, **kích thước < 25 MB**, và **kiểu file nằm trong danh sách cho phép** (text, markdown, PDF, hoặc binary chung).
- `request.resource == null` — trường hợp xóa file (không có nội dung mới) thì vẫn cho phép.

> **Đổi giới hạn:** muốn cho phép ảnh, thêm `request.resource.contentType.matches('image/.*')`. Muốn tăng dung lượng, sửa con số `25`.

---

## 8. Build & Deploy

Toàn bộ quy trình từ code tới web online:

```bash
# 1. Đăng nhập Firebase (chỉ làm lần đầu trên máy)
firebase login

# 2. Chọn project (nếu chưa có .firebaserc)
firebase use --add        # chọn project, đặt alias "default"

# 3. Chạy thử ở máy (dev server, tự cập nhật khi sửa code)
npm run dev               # mở http://localhost:5173

# 4. Đóng gói web cho production
npm run build             # tạo thư mục dist/

# 5. Đưa web lên Firebase Hosting
firebase deploy --only hosting

# 6. Đưa luật bảo mật lên (làm khi tạo mới hoặc sau khi sửa luật)
firebase deploy --only database     # đẩy database.rules.json
firebase deploy --only storage      # đẩy storage.rules
```

Sau khi `deploy --only hosting` xong, terminal sẽ in ra địa chỉ web dạng `https://ten-site.web.app`. Mở thử là thấy.

> **Một bước dễ quên:** vào **Authentication → Settings → Authorized domains** và thêm địa chỉ `ten-site.web.app` vào danh sách. Nếu không, nút đăng nhập Google ở bản online sẽ báo lỗi domain không được phép.

Về các script trong `package.json`:

| Lệnh | Việc nó làm |
|---|---|
| `npm run dev` | Chạy server phát triển tại `http://localhost:5173`, tự cập nhật khi bạn sửa code (HMR). |
| `npm run build` | Kiểm tra kiểu TypeScript (`tsc -b`) rồi đóng gói (`vite build`) ra `dist/`. |
| `npm run lint` | Soát lỗi code bằng ESLint. |
| `npm run preview` | Xem thử bản đã build ngay trên máy (giống production). |

> **Về `vite.config.ts`:** dự án dùng plugin `@vitejs/plugin-react` (để hiểu cú pháp JSX của React) và một tùy chọn `manualChunks` để **tách thư viện Firebase thành các gói nhỏ riêng** giúp trình duyệt tải nhanh và cache tốt hơn. Đây là tối ưu **không bắt buộc** — một `vite.config.ts` tối thiểu chỉ cần `plugins: [react()]` là đã chạy được.

---

## 9. Bảng lệnh hay dùng

```bash
# Phát triển & build
npm run dev                              # chạy dev server
npm run build                            # build production ra dist/
npm run preview                          # xem thử bản build
npm run lint                             # soát lỗi code

# Firebase CLI
firebase login                           # đăng nhập
firebase projects:list                   # liệt kê các project bạn có quyền
firebase use <project-id>                # chuyển sang project khác
firebase hosting:sites:create <name>     # tạo một hosting site mới
firebase deploy --only hosting           # deploy web
firebase deploy --only database          # deploy luật Realtime Database
firebase deploy --only storage           # deploy luật Storage
firebase deploy                          # deploy tất cả cùng lúc
```

---

## 10. Sự cố thường gặp & cách xử lý

| Triệu chứng | Nguyên nhân & cách xử lý |
|---|---|
| Web trắng màn hình, console báo lỗi liên quan Firebase `null` | Thiếu file `.env` hoặc điền sai biến → `isConfigured` thành `false` nên SDK xuất ra `null`. Kiểm tra lại `.env` đủ 7 biến và đúng giá trị. Nhớ **khởi động lại `npm run dev`** sau khi sửa `.env`. |
| Gõ thẳng link con (vd `/docs/abc`) ra **404** ở bản online | Thiếu hoặc sai `rewrites` trong `firebase.json`. Đảm bảo có `{"source": "**", "destination": "/index.html"}` rồi deploy lại hosting. |
| Đăng nhập Google ở bản online báo lỗi domain | Chưa thêm `ten-site.web.app` vào **Authorized domains** trong Authentication. |
| `firebase deploy --only database` báo **PERMISSION_DENIED** khi app đọc/ghi | Luật chưa được deploy hoặc viết sai. Chạy lại `firebase deploy --only database` và kiểm tra `database.rules.json`. |
| `firebase deploy --only storage` báo lỗi bucket không tồn tại | Chưa **bật Storage** trong Console (mục 3, bước 5). Vào Console bật một lần rồi deploy lại. |
| Đọc nội dung file text từ Storage bị chặn **CORS** | Đừng dùng `fetch(downloadURL)`. Dùng hàm SDK `getBytes(ref)` — nó đi qua kênh chính thức nên không vướng CORS. (Chi tiết trong `documents-feature-spec.md`.) |

---

## 11. Checklist hoàn thành

Đọc xong tài liệu này, bạn đã có thể:

- [ ] Tạo project Firebase + bật Authentication (Google), Realtime Database, Storage.
- [ ] Tạo file `.env` với đủ 7 biến `VITE_FIREBASE_*`.
- [ ] Tạo `src/lib/firebase.ts` khởi tạo SDK (có pattern xuất `null` an toàn).
- [ ] Tạo `firebase.json` (đặc biệt có `rewrites` cho SPA) và `.firebaserc`.
- [ ] Viết và deploy `database.rules.json` + `storage.rules`.
- [ ] `npm run build` → `firebase deploy --only hosting` → web online tại `https://ten-site.web.app`.
- [ ] Thêm domain vào Authorized domains để đăng nhập chạy được ở bản online.

➡️ **Bước tiếp theo:** để dựng một tính năng thực tế (quản lý tài liệu nhiều định dạng, có chia sẻ công khai), xem file đi kèm **`documents-feature-spec.md`**.
