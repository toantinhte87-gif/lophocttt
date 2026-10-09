const icon = (content) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
const icons = {
  teacher: icon('<path d="M4 15V4h16v11M8 20l4-5 4 5M8 8h8M8 11h5"/><path d="M2 15h20"/>'),
  student: icon('<path d="m2 9 10-5 10 5-10 5-10-5Z"/><path d="M6 11v6c4 3 8 3 12 0v-6M22 9v7"/>'),
  parent: icon('<circle cx="9" cy="7" r="3"/><circle cx="18" cy="10" r="2"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 16a4 4 0 0 1 6 4v1"/>'),
  bell: icon('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'),
  arrow: icon('<path d="M5 12h14m-6-6 6 6-6 6"/>')
};

export const HomePage = {
  title: "Trang chủ", theme: "hs", hideChrome: true,
  render() {
    const roles = [
      { key: "teacher", route: "/teacher", name: "Giáo viên", tag: "QUẢN LÝ LỚP HỌC", desc: "Bài giảng, giao bài và điểm danh", action: "Vào quản lý" },
      { key: "student", route: "/student", name: "Học sinh", tag: "HỌC TẬP MỖI NGÀY", desc: "Làm bài, luyện tập và xem điểm", action: "Vào học tập" },
      { key: "parent", route: "/parent", name: "Phụ huynh", tag: "ĐỒNG HÀNH CÙNG CON", desc: "Theo dõi học tập và học phí", action: "Xem kết quả" }
    ];
    return `<div class="welcome-page">
      <header class="welcome-header">
        <a href="#/" class="welcome-brand" aria-label="Trang chủ Lớp học TTT"><span class="welcome-monogram">TTT</span><span><b>Lớp học TTT</b><small>Toán & Tin học</small></span></a>
        <button class="welcome-gear" type="button" data-push-settings title="Cài đặt thông báo" aria-label="Cài đặt thông báo">${icons.bell}</button>
      </header>
      <section class="welcome-hero" aria-labelledby="welcome-title">
        <div class="welcome-copy"><span class="welcome-eyebrow"><i aria-hidden="true"></i> KHÔNG GIAN HỌC TẬP TTT</span>
          <h1 id="welcome-title">Mỗi buổi học,<br><em>một bước tiến.</em></h1>
          <p>Học để hiểu. Luyện để vững.<br>Cùng nhau tiến bộ mỗi ngày.</p>
          <div class="welcome-subjects"><span>Toán học</span><span>Tin học</span><span>Tư duy</span></div>
        </div>
        <div class="welcome-art" aria-hidden="true">
          <svg viewBox="0 0 460 340" fill="none">
            <circle cx="236" cy="172" r="137" fill="#deeee4"/><circle cx="360" cy="65" r="19" fill="#edc875"/>
            <path d="m71 239 12-12m-12 0 12 12M364 267v20m-10-10h20" stroke="#87b19c" stroke-width="3" stroke-linecap="round"/>
            <g transform="rotate(-8 208 183)"><rect x="102" y="76" width="241" height="221" rx="18" fill="#bad4c4"/>
            <rect x="93" y="65" width="241" height="221" rx="18" fill="#fffdf5" stroke="#c2d7c9" stroke-width="2"/>
            <path d="M127 65v221" stroke="#ebc0aa" stroke-width="2"/>
            <path d="M145 103h158M145 135h158M145 167h158M145 199h158M145 231h158M145 263h158" stroke="#e4eade" stroke-width="2"/>
            <path d="M165 228h122l-39-91-83 91Z" fill="#e7f2e9" stroke="#30765a" stroke-width="3" stroke-linejoin="round"/>
            <path d="M177 216h12v12M268 228a28 28 0 0 0-5-16" stroke="#30765a" stroke-width="2"/>
            <text x="163" y="125" fill="#234b39" font-size="24" font-family="Georgia,serif" font-style="italic">a² + b² = c²</text>
            <text x="204" y="252" fill="#789487" font-size="14" font-family="Georgia,serif">Học · Hiểu · Vận dụng</text></g>
            <g transform="rotate(9 343 194)"><rect x="299" y="129" width="103" height="128" rx="16" fill="#234b39"/>
            <rect x="311" y="142" width="79" height="32" rx="7" fill="#daebbf"/>
            <text x="379" y="165" fill="#234b39" text-anchor="end" font-size="18" font-family="monospace">100</text>
            <path d="M319 194h10m17 0h10m17 0h10M319 214h10m17 0h10m17 0h10M319 234h10m17 0h10" stroke="#d3e3d8" stroke-width="7" stroke-linecap="round"/>
            <path d="M373 230h10" stroke="#edc875" stroke-width="7" stroke-linecap="round"/></g>
            <g transform="rotate(28 110 230)"><rect x="103" y="163" width="14" height="122" rx="4" fill="#edc875"/><path d="m103 281 7 19 7-19" fill="#d8b887"/><path d="m107 292 3 8 3-8" fill="#234b39"/></g>
            <rect x="277" y="47" width="68" height="38" rx="12" fill="#fff" stroke="#d4e1d7"/><text x="311" y="72" text-anchor="middle" fill="#347857" font-size="19" font-family="monospace">&lt;/&gt;</text>
          </svg>
        </div>
      </section>
      <section class="welcome-entry" aria-labelledby="welcome-entry-title"><div class="welcome-entry-head"><h2 id="welcome-entry-title">Bạn muốn vào khu vực nào?</h2><span>Chọn để bắt đầu</span></div>
        <nav class="welcome-roles" aria-label="Chọn khu vực">${roles.map(role => `<button type="button" data-route="${role.route}" class="welcome-role role-${role.key}"><span class="welcome-role-top"><span class="welcome-role-icon">${icons[role.key]}</span><small>${role.tag}</small></span><span class="welcome-role-copy"><b>${role.name}</b><span>${role.desc}</span></span><span class="welcome-role-action">${role.action}${icons.arrow}</span></button>`).join("")}</nav>
      </section>
      <footer class="welcome-footer"><span>Lớp học TTT</span><span>Kiến thức vững vàng · Tự tin tiến bước</span></footer>
    </div>`;
  }
};
