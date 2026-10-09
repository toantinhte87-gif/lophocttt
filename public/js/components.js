import { esc } from "./utils.js?v=93";

function toKebab(value = "") {
  return String(value).replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
}

function dataAttrs(data = {}) {
  return Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [`data-${toKebab(key)}`, value]));
}

function attrs(input = {}) {
  return Object.entries(input || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => value === true ? esc(key) : `${esc(key)}="${esc(value)}"`)
    .join(" ");
}

function optionValue(option) {
  return typeof option === "string" ? option : option?.value;
}

function optionLabel(option) {
  return typeof option === "string" ? option : option?.label;
}

function optionsHtml(options = [], selected = "") {
  return (options || []).map(option => {
    const value = optionValue(option);
    const label = optionLabel(option);
    return `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(label)}</option>`;
  }).join("");
}

function button({ text = "Nút", icon = "", variant = "primary", size = "", type = "button", className = "", full = false, mobile = false, disabled = false, loading = false, id = "", data = {}, attrs: extra = {} } = {}) {
  const classList = ["btn", `btn-${variant}`, size && `btn-${size}`, full && "btn-full", mobile && "btn-mobile", loading && "btn-loading", className].filter(Boolean).join(" ");
  return `<button ${attrs({ id, type, class: classList, disabled, ...dataAttrs(data), ...extra })}>${loading ? '<span class="spinner"></span>' : ""}${icon ? `<span class="icon">${esc(icon)}</span>` : ""}${text ? `<span class="btn-text">${esc(text)}</span>` : ""}</button>`;
}

function iconButton({ icon = "•", label = "", variant = "secondary", type = "button", className = "", data = {}, attrs: extra = {} } = {}) {
  return button({ text: label, icon, variant, type, mobile: true, className: `btn-icon ${className}`.trim(), data, attrs: { title: label || icon, "aria-label": label || icon, ...extra } });
}

function input({ id = "", label = "", value = "", placeholder = "", type = "text", hint = "", error = "", required = false, span = 12, className = "", attrs: extra = {} } = {}) {
  return `<div class="form-item span-${esc(span)} ${esc(className)}">${label ? `<label class="form-label" for="${esc(id)}">${esc(label)}${required ? ' <span class="required">*</span>' : ""}</label>` : ""}<input ${attrs({ id, class: `input form-input ${error ? "error" : ""}`.trim(), type, value, placeholder, required, ...extra })}>${error ? `<div class="error-text">${esc(error)}</div>` : hint ? `<div class="hint">${esc(hint)}</div>` : ""}</div>`;
}

function textarea({ id = "", label = "", value = "", placeholder = "", hint = "", error = "", required = false, span = 12, rows = 5, attrs: extra = {} } = {}) {
  return `<div class="form-item span-${esc(span)}">${label ? `<label class="form-label" for="${esc(id)}">${esc(label)}${required ? ' <span class="required">*</span>' : ""}</label>` : ""}<textarea ${attrs({ id, class: `textarea form-textarea ${error ? "error" : ""}`.trim(), rows, placeholder, required, ...extra })}>${esc(value)}</textarea>${error ? `<div class="error-text">${esc(error)}</div>` : hint ? `<div class="hint">${esc(hint)}</div>` : ""}</div>`;
}

function select({ id = "", label = "", options = [], value = "", placeholder = "Tất cả", hint = "", required = false, span = 12, className = "", attrs: extra = {} } = {}) {
  const blank = placeholder === null ? "" : `<option value="">${esc(placeholder)}</option>`;
  return `<div class="form-item span-${esc(span)} ${esc(className)}">${label ? `<label class="form-label" for="${esc(id)}">${esc(label)}${required ? ' <span class="required">*</span>' : ""}</label>` : ""}<select ${attrs({ id, class: "select form-select", required, ...extra })}>${blank}${optionsHtml(options, value)}</select>${hint ? `<div class="hint">${esc(hint)}</div>` : ""}</div>`;
}

function search({ id = "searchInput", placeholder = "Tìm kiếm...", value = "", clearData = "clear-search", className = "" } = {}) {
  return `<div class="search-box ${esc(className)}"><span class="search-icon">🔎</span><input id="${esc(id)}" class="input form-input" type="search" value="${esc(value)}" placeholder="${esc(placeholder)}"><button class="search-clear" type="button" data-${esc(clearData)} aria-label="Xóa">×</button></div>`;
}

function checkbox({ label = "", checked = false, name = "", value = "", data = {}, attrs: extra = {} } = {}) {
  return `<label class="check-item"><input ${attrs({ type: "checkbox", name, value, checked, ...dataAttrs(data), ...extra })}>${esc(label)}</label>`;
}

function radio({ label = "", checked = false, name = "", value = "", data = {}, attrs: extra = {} } = {}) {
  return `<label class="check-item"><input ${attrs({ type: "radio", name, value, checked, ...dataAttrs(data), ...extra })}>${esc(label)}</label>`;
}

function chip({ text = "Tất cả", active = false, data = {}, className = "" } = {}) {
  return `<button class="chip ${active ? "active" : ""} ${esc(className)}" type="button" ${attrs(dataAttrs(data))}>${esc(text)}</button>`;
}

function badge({ text = "", tone = "" } = {}) {
  return `<span class="badge ${esc(tone)}">${esc(text)}</span>`;
}

function card({ title = "", subtitle = "", body = "", className = "", attrs: extra = {} } = {}) {
  return `<section ${attrs({ class: `card ${className}`.trim(), ...extra })}>${title ? `<h3>${esc(title)}</h3>` : ""}${subtitle ? `<p class="text-muted">${esc(subtitle)}</p>` : ""}${body}</section>`;
}

function panel({ title = "", subtitle = "", body = "", className = "", actions = "", attrs: extra = {} } = {}) {
  return `<section ${attrs({ class: `panel ${className}`.trim(), ...extra })}>${(title || subtitle || actions) ? `<div class="panel-title"><div>${title ? `<h2>${esc(title)}</h2>` : ""}${subtitle ? `<span>${esc(subtitle)}</span>` : ""}</div>${actions ? `<div class="panel-actions">${actions}</div>` : ""}</div>` : ""}${body}</section>`;
}

function statCard({ label = "", value = "", icon = "", tone = "primary" } = {}) {
  return `<section class="stat-card stat-${esc(tone)}"><div><div class="stat-number">${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>${icon ? `<div class="stat-icon">${esc(icon)}</div>` : ""}</section>`;
}

function actionCard({ title = "", subtitle = "", meta = "", status = "", variant = "", icon = "", data = {}, attrs: extra = {} } = {}) {
  return `<button ${attrs({ type: "button", class: `action-card ${variant ? `action-card-${variant}` : ""}`.trim(), ...dataAttrs(data), ...extra })}>${icon ? `<span class="action-icon">${esc(icon)}</span>` : ""}<div><b>${esc(title)}</b>${subtitle ? `<span>${esc(subtitle)}</span>` : ""}</div>${(meta || status) ? `<small>${esc(meta)}${meta && status ? " · " : ""}${esc(status)}</small>` : ""}</button>`;
}

function alert({ title = "Thông báo", message = "", type = "info", icon = "" } = {}) {
  const normalized = type === "danger" ? "error" : type;
  const icons = { info: "i", success: "✓", warning: "⚠", error: "✕" };
  return `<div class="alert alert-${esc(normalized)}"><div class="alert-icon">${esc(icon || icons[normalized] || "i")}</div><div><b>${esc(title)}</b>${message ? `<span>${esc(message)}</span>` : ""}</div></div>`;
}

function emptyState({ icon = "📭", title = "Chưa có dữ liệu", message = "", action = "" } = {}) {
  return `<section class="empty-state"><div><div class="empty-icon">${esc(icon)}</div><h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ""}${action}</div></section>`;
}

function loadingState({ lines = 3 } = {}) {
  return `<section class="loading-state">${Array.from({ length: lines }).map((_, index) => `<div class="skeleton ${index === 0 ? "big" : ""}"></div>`).join("")}</section>`;
}

function tabs({ items = [], active = "", dataKey = "tab", variant = "line" } = {}) {
  const wrap = variant === "pill" ? "pill-tabs" : "tab-bar";
  const cls = variant === "pill" ? "pill-tab" : "tab";
  return `<div class="${wrap}" role="tablist">${(items || []).map(item => `<button class="${cls} ${item.value === active ? "active" : ""}" type="button" data-${esc(dataKey)}="${esc(item.value)}">${esc(item.label)}</button>`).join("")}</div>`;
}

function toolbar({ title = "", subtitle = "", actions = "", className = "" } = {}) {
  return `<section class="toolbar ${esc(className)}"><div class="toolbar-title"><b>${esc(title)}</b>${subtitle ? `<span>${esc(subtitle)}</span>` : ""}</div>${actions ? `<div class="btn-row">${actions}</div>` : ""}</section>`;
}

function table({ headers = [], rows = [], className = "" } = {}) {
  return `<div class="table-wrap ${esc(className)}"><table class="table"><thead><tr>${headers.map(header => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function modal({ title = "", message = "", actions = "", icon = "" } = {}) {
  return `<div class="modal-box">${icon ? `<div class="modal-icon">${esc(icon)}</div>` : ""}<h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ""}${actions ? `<div class="btn-row">${actions}</div>` : ""}</div>`;
}

function filterBar({ search = "", filters = "", actions = "", className = "" } = {}) {
  return `<section class="filter-bar ${esc(className)}">${search}${filters}${actions ? `<div class="filter-actions">${actions}</div>` : ""}</section>`;
}

function responsiveFilter({ id = "filter", desktopFields = "", desktopActions = "", chips = "", className = "" } = {}) {
  return `<section class="responsive-filter ${esc(className)}" data-responsive-filter="${esc(id)}">${chips ? `<div class="compact-command-row">${chips}</div>` : ""}<div class="desktop-filter"><div class="compact-filter-row">${desktopFields}${desktopActions}</div></div></section>`;
}

function pageHero({ title = "", description = "", tone = "" } = {}) {
  return `<section class="hero ${esc(tone)}"><h1>${esc(title)}</h1>${description ? `<p>${esc(description)}</p>` : ""}</section>`;
}

function tile({ title = "", description = "", page = "", tone = "" } = {}) {
  return `<button class="tile ${esc(tone)}" type="button" data-go="${esc(page)}"><h3>${esc(title)}</h3>${description ? `<p>${esc(description)}</p>` : ""}</button>`;
}

function richContent(raw = "") {
  return `<div class="rich-content">${esc(raw).replaceAll("\n", "<br>")}</div>`;
}

function imageUploader({ id = "imageInput", label = "Tải ảnh", folder = "lophocttt" } = {}) {
  return `<div class="upload-box" data-uploader="${esc(id)}" data-folder="${esc(folder)}"><label class="form-label" for="${esc(id)}">${esc(label)}</label><input id="${esc(id)}" class="input form-input" type="file" accept="image/*"><div class="upload-result" id="${esc(id)}_result"></div></div>`;
}

export const Components = {
  escape: esc, attrs, button, iconButton, input, textarea, select, search, checkbox, radio, chip, badge,
  card, panel, statCard, actionCard, alert, emptyState, loadingState, tabs, toolbar, table, modal,
  filterBar, responsiveFilter, pageHero, tile, richContent, imageUploader
};

// UI chỉ là bí danh tương thích cho các trang cũ.
// Không đặt event, dữ liệu, upload, toast, loading hoặc nghiệp vụ trong file này.
export const UI = Components;
