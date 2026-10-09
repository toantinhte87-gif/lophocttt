import { latestPaymentSummary } from "../js/payment-summary.js?v=94";
import { classAttendance, calendarCells, localDate, attendanceMode } from "../js/attendance-model.js?v=93";
import { FirestoreService } from "../js/services.js?v=93";
import { esc, formatMoney, nowIso, slug } from "../js/utils.js?v=93";
import { calculateAttendanceSummary, studentClass, studentCode, studentName, studentPhone } from "../js/domain.js?v=93";
import { listStudentAssignments } from "../js/bai-lam-model.js?v=93";
import { assignedAt, learningSummary } from "../js/assignment-stats.js?v=93";

const SESSION_FEE = 100000;
const STATUS = {
  present: { label: "Đúng giờ", short: "Đúng", cls: "present" },
  late_allowed: { label: "Muộn có phép", short: "Muộn P", cls: "late" },
  late_unallowed: { label: "Muộn không phép", short: "Muộn K", cls: "late" },
  absent_allowed: { label: "Vắng có phép", short: "Vắng P", cls: "absent" },
  absent_unallowed: { label: "Vắng không phép", short: "Vắng K", cls: "absent" }
};
const WEEKDAYS = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

const CO = Object.freeze({
  hocSinh: "Hoc_Sinh",
  diemDanh: "Diem_Danh",
  buoiHoc: "Buoi_Hoc",
  hocPhi: "Hoc_Phi",
  ketQuaKy: "Ket_Qua_Ky",
  giaoBai: "Giao_Bai"
});

const ATT_STYLE = `<style id="attendance-v58-style">
.att-page{gap:7px!important}.att-compact-tools{display:grid;gap:7px;padding:8px!important}.att-tools-line{display:flex;align-items:flex-end;justify-content:space-between;gap:8px}.att-tools-main{min-width:0;flex:1}.att-tools-main>b{font-size:12px}.att-class-row{margin-top:4px!important;gap:5px!important}.att-chip{min-height:30px!important;padding:0 10px!important;font-size:12px}.att-actions{gap:5px!important}.att-actions .btn{min-height:34px;padding:0 11px;font-size:12px}.att-datebar{grid-template-columns:32px minmax(0,1fr) 32px!important;gap:5px!important}.att-nav{height:32px!important}.att-date-scroll{gap:5px!important}.att-date{min-width:78px!important;padding:5px 7px!important;border-radius:10px!important}.att-date b{font-size:11px!important}.att-date span{font-size:9px!important}.att-quick-summary{display:flex;gap:5px;align-items:center;overflow-x:auto;scrollbar-width:none}.att-quick-summary::-webkit-scrollbar{display:none}.att-quick-summary span{flex:0 0 auto;border:1px solid var(--line);background:#f8fafc;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900}.att-quick-summary .green{color:#15803d;background:#f0fdf4;border-color:#bbf7d0}.att-quick-summary .red{color:#b91c1c;background:#fff1f2;border-color:#fecaca}.att-quick-summary .orange{color:#c2410c;background:#fff7ed;border-color:#fed7aa}.att-controlbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center;padding:7px 8px!important}.att-select-line{display:flex;align-items:center;gap:7px;min-width:0;overflow-x:auto}.att-select-line label{font-size:11px;font-weight:900;white-space:nowrap}.att-selection-count{min-width:82px;text-align:center}.att-bulk-status{display:flex;gap:4px;align-items:center}.att-bulk-status>span{font-size:10px;font-weight:850;color:var(--muted);white-space:nowrap}.att-bulk-status .att-icon-btn{height:32px;min-width:34px;font-size:16px}.att-bulk-actions{display:flex;gap:5px;align-items:center}.att-state-btn{min-height:34px;border:0;border-radius:10px;padding:5px 10px;font:inherit;font-size:12px;font-weight:950;cursor:pointer;white-space:nowrap}.att-state-btn.close{background:#f59e0b;color:#422006}.att-state-btn.pay{background:#16a34a;color:#fff}.att-state-btn.history{background:#e0e7ff;color:#3730a3}.att-state-btn.download{background:#e0f2fe;color:#075985}.att-state-btn.secondary{background:#f1f5f9;color:#334155;border:1px solid var(--line)}.att-state-btn:disabled{opacity:.42;cursor:not-allowed}.att-list{gap:7px!important}.att-st-card{padding:7px 8px!important;gap:6px!important;border-radius:13px!important}.att-st-card.is-selected{outline:2px solid #60a5fa;border-color:#60a5fa}.att-st-main{grid-template-columns:22px minmax(0,1fr) auto!important;gap:6px!important}.att-st-info h3{font-size:14px!important}.att-st-info p{font-size:10px!important;margin-top:1px!important}.att-st-status{min-width:62px!important}.att-st-status b{font-size:11px!important}.att-st-status span{font-size:9px!important;margin-top:1px!important}.att-row-two{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0}.att-st-kpis{gap:4px!important}.att-st-kpis span{padding:3px 6px!important;font-size:10px!important}.att-period-info{display:flex;gap:4px;align-items:center;justify-content:flex-end;min-width:0}.att-period-state,.att-closed-count{display:inline-flex;align-items:center;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:950;white-space:nowrap}.att-period-state.open{background:#dbeafe;color:#1d4ed8}.att-period-state.waiting{background:#fef3c7;color:#92400e}.att-period-state.paid{background:#dcfce7;color:#166534}.att-closed-count{background:#ede9fe;color:#6d28d9;border:1px solid #c4b5fd}.att-icon-buttons{padding-top:5px;border-top:1px dashed var(--line);grid-template-columns:repeat(5,minmax(34px,1fr))!important;gap:4px!important}.att-icon-buttons .att-icon-btn{height:31px!important;min-width:31px!important;border-radius:9px!important;font-size:15px!important}.att-modal-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:8px 0}.att-modal-actions .att-state-btn{width:100%}.att-pay-box{display:grid;gap:9px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:14px;padding:12px}.att-pay-box label{display:grid;gap:5px;font-size:12px;font-weight:900}.att-pay-box input{width:100%;min-height:44px;border:1px solid #86efac;border-radius:11px;padding:0 12px;font:inherit;font-size:18px;font-weight:900;background:#fff}.att-pay-summary{display:flex;gap:6px;flex-wrap:wrap}.att-pay-summary span{border-radius:999px;background:#fff;border:1px solid #bbf7d0;padding:5px 8px;font-size:11px;font-weight:850}.att-modal-nav{display:flex;gap:6px;justify-content:space-between;align-items:center;margin-bottom:8px}.att-modal-nav h3{margin:0!important}.att-history-row.waiting{border-left-color:#8b5cf6;background:#faf5ff}.att-history-row.paid{border-left-color:#22c55e;background:#f0fdf4}.att-history-section{margin-top:10px}.att-show-all{border-style:dashed}.att-msg{padding:7px 9px!important;font-size:11px}
@media(min-width:1100px){.att-list{grid-template-columns:repeat(auto-fill,minmax(360px,1fr))!important}}
@media(max-width:760px){.att-tools-line{align-items:stretch;display:grid}.att-actions{justify-content:flex-start}.att-controlbar{grid-template-columns:1fr}.att-select-line{overflow-x:auto}.att-bulk-actions{width:100%}.att-bulk-actions .att-state-btn{flex:1}.att-row-two{align-items:flex-start}.att-period-info{flex-wrap:wrap}.att-modal-actions{grid-template-columns:1fr}.att-history-row{grid-template-columns:86px minmax(130px,1fr)!important}.att-history-row small{grid-column:1/-1}.att-modal-box{padding:12px!important}}
@media(max-width:420px){.att-st-main{grid-template-columns:20px minmax(0,1fr) 58px!important}.att-st-kpis span{padding:3px 5px!important}.att-period-state,.att-closed-count{padding:3px 5px}.att-controlbar,.att-compact-tools{padding:6px!important}}
.att-card-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}.att-card-actions button{min-height:31px;border:1px solid var(--line);border-radius:9px;background:#fff;padding:4px 5px;font:inherit;font-size:10px;font-weight:950;cursor:pointer;white-space:nowrap}.att-card-actions .close{color:#92400e;background:#fffbeb;border-color:#fde68a}.att-card-actions .history{color:#3730a3;background:#eef2ff;border-color:#c7d2fe}.att-card-actions .pay{color:#166534;background:#f0fdf4;border-color:#bbf7d0}.att-card-actions button:disabled{opacity:.4;cursor:not-allowed}
.att-payment-box{padding:0!important;overflow:hidden}.att-payment-card{display:grid;gap:12px;background:#fff}.att-payment-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:16px 17px 13px;background:linear-gradient(135deg,#064e3b,#047857);color:#fff}.att-payment-head h2{margin:0;font-size:22px}.att-payment-head p{margin:4px 0 0;color:#d1fae5;font-size:12px;font-weight:750}.att-payment-head button{width:36px;height:36px;border:1px solid rgba(255,255,255,.35);border-radius:10px;background:rgba(255,255,255,.14);color:#fff;font-size:23px;font-weight:900}.att-payment-body{display:grid;gap:11px;padding:0 16px}.att-payment-period{display:flex;justify-content:space-between;gap:8px;align-items:center;color:#475569;font-size:11px;font-weight:850}.att-payment-period b{color:#6d28d9;background:#ede9fe;border-radius:999px;padding:5px 8px}.att-payment-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.att-payment-stat{display:grid;gap:3px;border:1px solid var(--line);border-radius:13px;padding:9px;background:#f8fafc}.att-payment-stat span{font-size:10px;color:#64748b;font-weight:850}.att-payment-stat b{font-size:22px}.att-payment-stat.green{background:#f0fdf4;border-color:#bbf7d0;color:#166534}.att-payment-stat.red{background:#fff1f2;border-color:#fecaca;color:#991b1b}.att-payment-stat.orange{background:#fff7ed;border-color:#fed7aa;color:#9a3412}.att-money-control{display:grid;gap:5px}.att-money-control label{font-size:11px;font-weight:900;color:#475569}.att-money-input-wrap{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;border:2px solid #22c55e;border-radius:14px;background:#f0fdf4;overflow:hidden}.att-money-input-wrap input{width:100%;min-height:52px;border:0;outline:0;background:transparent;padding:0 12px;font:inherit;font-size:24px;font-weight:950;color:#166534}.att-money-input-wrap span{padding:0 12px 0 4px;font-size:11px;font-weight:900;color:#166534}.att-bill-history{display:grid;gap:6px;max-height:300px;overflow:auto}.att-bill-history h3{margin:0!important;font-size:13px}.att-bill-row-detail{display:grid;grid-template-columns:92px minmax(0,1fr) auto;gap:7px;align-items:center;border:1px solid var(--line);border-left:4px solid #22c55e;border-radius:11px;padding:7px 8px}.att-bill-row-detail.absent{border-left-color:#ef4444}.att-bill-row-detail.late{border-left-color:#f59e0b}.att-bill-row-detail b,.att-bill-row-detail span,.att-bill-row-detail small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.att-bill-row-detail b{font-size:11px}.att-bill-row-detail span{font-size:11px;font-weight:850}.att-bill-row-detail small{font-size:10px;color:#64748b}.att-payment-bottom{display:grid;grid-template-columns:1fr 1fr 1.25fr;gap:6px;padding:13px 16px 16px;border-top:1px solid var(--line);background:#f8fafc}.att-payment-bottom button{min-height:42px;border:0;border-radius:11px;font:inherit;font-size:12px;font-weight:950;cursor:pointer}.att-payment-bottom .download{background:#e0f2fe;color:#075985}.att-payment-bottom .copy{background:#ede9fe;color:#5b21b6}.att-payment-bottom .collect{background:#16a34a;color:#fff}
.att-payment-feedback:empty{display:none}.att-payment-feedback{margin:0 16px;border-radius:10px;padding:8px 10px;font-size:11px;font-weight:850}.att-payment-feedback.success{background:#dcfce7;color:#166534}.att-payment-feedback.error{background:#fee2e2;color:#991b1b}.att-payment-bottom button.is-busy{opacity:.65;pointer-events:none}
@media(max-width:760px){.att-payment-box{padding:0!important}.att-payment-head{padding:14px}.att-payment-body{padding:0 12px}.att-payment-bottom{padding:11px 12px 13px}.att-bill-row-detail{grid-template-columns:80px minmax(0,1fr)}.att-bill-row-detail small{grid-column:1/-1}.att-payment-feedback{margin:0 12px}}
@media(max-width:420px){.att-card-actions button{font-size:9px}.att-payment-stats{gap:5px}.att-payment-stat{padding:7px}.att-payment-stat b{font-size:19px}.att-payment-bottom{grid-template-columns:1fr 1fr}.att-payment-bottom .collect{grid-column:1/-1}.att-money-input-wrap input{font-size:21px}}
.att-history-row{grid-template-columns:92px minmax(0,1fr) auto auto!important}.att-history-actions{display:flex;gap:4px;justify-content:flex-end}.att-history-actions button{min-height:28px;border:0;border-radius:8px;padding:0 8px;font-size:10px;font-weight:950;cursor:pointer}.att-history-actions .edit{background:#dbeafe;color:#1d4ed8}.att-history-actions .delete{background:#fee2e2;color:#b91c1c}.att-edit-form{display:grid;gap:10px}.att-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.att-edit-field{display:grid;gap:4px}.att-edit-field label{font-size:11px;font-weight:900;color:#475569}.att-edit-field input,.att-edit-field select{min-height:40px;border:1px solid var(--line);border-radius:10px;padding:0 10px;font:inherit}.att-edit-actions{display:flex;justify-content:flex-end;gap:7px}@media(max-width:760px){.att-history-row{grid-template-columns:86px minmax(0,1fr)!important}.att-history-row>small,.att-history-actions{grid-column:1/-1}.att-history-actions{justify-content:flex-start}.att-edit-grid{grid-template-columns:1fr}}

/* Điểm danh v63: trạng thái gọn, bỏ nút mặt, thống kê tổng dạng ô lớn + thống kê ngày xếp dọc */
.att-compact-tools{gap:7px!important}
.att-tools-line{align-items:center!important}.att-tools-main{display:flex;align-items:center;min-width:0}.att-class-row{margin-top:0!important}
.att-chip,.att-date,.att-nav,.att-actions .btn,.att-state-btn,.att-card-actions button{border-radius:6px!important}
.att-st-card{border-radius:8px!important}
.att-class-row{gap:5px!important}.att-chip{min-height:30px!important;padding:0 10px!important}
.att-refresh-only{margin-left:auto;flex:0 0 auto}.att-refresh-only .btn{width:34px;padding:0!important}
.att-date{min-width:74px!important;padding:7px 9px!important;text-align:center!important;background:#fff!important;border-color:var(--line)!important;color:#0f172a!important;box-shadow:none!important}
.att-date b{font-size:11px!important}.att-date span{display:none!important}
.att-date.has-data{background:#ecfdf5!important;border-color:#86efac!important;color:#166534!important}
.att-date.today{background:#fef3c7!important;border-color:#fbbf24!important;color:#92400e!important}
.att-date.active{box-shadow:0 0 0 2px rgba(37,99,235,.18)!important;border-color:#60a5fa!important}
.att-summary-strip{display:flex;align-items:stretch;gap:8px;overflow-x:auto;scrollbar-width:none}.att-summary-strip::-webkit-scrollbar{display:none}
.att-overall-summary{display:flex;gap:6px;flex:0 0 auto}
.att-overall-card{width:82px;height:76px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:7px;background:#f8fafc}
.att-overall-card span{font-size:9px;line-height:1.05;font-weight:850;color:#64748b;white-space:nowrap;margin-bottom:4px}.att-overall-card b{font-size:27px;line-height:1;font-weight:950}
.att-overall-card.total{background:#ecfdf5;border-color:#86efac;color:#15803d}.att-overall-card.total span{color:#15803d}
.att-overall-card.absent{background:#fff1f2;border-color:#fda4af;color:#b91c1c}.att-overall-card.absent span{color:#b91c1c}
.att-overall-card.late{background:#fff7ed;border-color:#fdba74;color:#c2410c}.att-overall-card.late span{color:#c2410c}
.att-day-stack{height:76px;min-width:104px;display:grid;grid-template-rows:repeat(3,1fr);gap:4px;flex:0 0 auto}
.att-day-stat{min-height:0;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid var(--line);border-radius:6px;padding:0 8px;background:#f8fafc;color:#475569;font-size:10px;font-weight:900;white-space:nowrap}.att-day-stat b{font-size:12px;font-weight:950}.att-day-stat.green{background:#f0fdf4;border-color:#bbf7d0;color:#15803d}.att-day-stat.red{background:#fff1f2;border-color:#fecaca;color:#b91c1c}.att-day-stat.orange{background:#fff7ed;border-color:#fed7aa;color:#c2410c}
.att-controlbar{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:5px!important;overflow-x:auto;scrollbar-width:none}.att-controlbar::-webkit-scrollbar{display:none}.att-select-line{display:flex;align-items:center;gap:5px;overflow:visible!important;flex:0 0 auto}.att-select-line label{min-height:34px;display:flex;align-items:center;gap:5px;padding:0 4px;font-size:11px!important}.att-bulk-actions{display:flex;gap:5px;align-items:center;flex:0 0 auto}.att-bulk-actions .att-state-btn{min-height:34px!important}.att-state-btn.start{background:#3158e8;color:#fff}.att-state-btn.start:disabled{background:#cbd5e1;color:#64748b}
.att-st-main{grid-template-columns:22px minmax(0,1fr) auto!important;align-items:center!important}.att-st-info{align-self:center}
.att-status-picker{position:relative;min-width:54px;z-index:2}.att-status-picker[open]{z-index:30}.att-status-picker summary{list-style:none}.att-status-picker summary::-webkit-details-marker{display:none}
.att-status-trigger{width:54px;min-width:54px;min-height:30px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;padding:0 6px;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;font:inherit}.att-status-trigger b{display:block;white-space:nowrap;font-size:10px;font-weight:950;color:#475569}
.att-status-picker.present .att-status-trigger{background:#f0fdf4;border-color:#86efac}.att-status-picker.present .att-status-trigger b{color:#15803d}.att-status-picker.late .att-status-trigger{background:#fff7ed;border-color:#fdba74}.att-status-picker.late .att-status-trigger b{color:#b45309}.att-status-picker.absent .att-status-trigger{background:#fff1f2;border-color:#fda4af}.att-status-picker.absent .att-status-trigger b{color:#b91c1c}.att-status-picker.locked{pointer-events:none;opacity:.72}
.att-status-pop{position:absolute;right:0;top:calc(100% + 4px);width:112px;display:grid;gap:3px;padding:5px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;box-shadow:0 10px 24px rgba(15,23,42,.16)}.att-status-pop button{min-height:29px;border:1px solid transparent;border-radius:5px;background:#f8fafc;padding:0 8px;text-align:left;font:inherit;font-size:10px;font-weight:900;cursor:pointer}.att-status-pop .present{background:#f0fdf4;color:#15803d;border-color:#bbf7d0}.att-status-pop .late{background:#fff7ed;color:#b45309;border-color:#fed7aa}.att-status-pop .absent{background:#fff1f2;color:#b91c1c;border-color:#fecaca}.att-status-pop .clear{background:#f1f5f9;color:#475569;border-color:#cbd5e1}.att-status-pop button:disabled{opacity:.4;cursor:not-allowed}
.att-row-two{margin-top:0!important}.att-period-info:empty{display:none}.att-card-actions{margin-top:0!important}
@media(max-width:760px){.att-tools-line{display:flex!important;align-items:center!important}.att-controlbar{display:flex!important}.att-bulk-actions{width:auto!important}.att-bulk-actions .att-state-btn{flex:0 0 auto!important}.att-overall-card{width:74px;height:70px}.att-overall-card b{font-size:24px}.att-day-stack{height:70px;min-width:96px}.att-status-picker,.att-status-trigger{min-width:50px;width:50px}.att-status-pop{width:108px}.att-date{min-width:70px!important}}
@media(max-width:420px){.att-st-main{grid-template-columns:20px minmax(0,1fr) 50px!important}.att-status-picker,.att-status-trigger{min-width:48px;width:48px}.att-controlbar,.att-compact-tools{padding:6px!important}.att-overall-card{width:68px}.att-overall-card span{font-size:8px}.att-overall-card b{font-size:22px}.att-day-stack{min-width:88px}.att-day-stat{padding:0 6px;font-size:9px}.att-day-stat b{font-size:11px}}

.att-latest-payment{display:grid;gap:9px;padding:12px;border:1px solid #d5e3d9;border-radius:12px;background:#fff}
.att-latest-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.att-latest-head h2{margin:0;font-size:13px;color:#244b36}.att-latest-head>span{font-size:10px;font-weight:700;color:#587563;white-space:nowrap;border-radius:6px;background:#eef5ef;padding:4px 7px}
.att-latest-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.att-latest-card{display:grid;gap:5px;padding:10px 12px;border:1px solid #d9e2ec;border-radius:9px;background:#f3f6fb;color:#334e76;min-width:0}.att-latest-card.paid{background:#edf8ef;border-color:#bfe0c7;color:#226b3c}.att-latest-card.unpaid{background:#fff5ea;border-color:#f2d6b1;color:#9a560e}.att-latest-card>span{font-size:11px;font-weight:750}.att-latest-card b{font-size:26px;line-height:1.2}.att-latest-card b small{font-size:11px;font-weight:600}.att-latest-card strong{font-size:14px;overflow-wrap:anywhere}.att-latest-card>small{font-size:10px;opacity:.8}.att-latest-note{margin:0;font-size:10px;color:#708477;line-height:1.5}.att-latest-empty{margin:0;padding:8px;border-radius:8px;background:#f5f8f4;color:#66796c;font-size:12px}
@media(max-width:760px){.att-latest-payment{padding:10px;gap:8px}.att-latest-cards{gap:6px}.att-latest-card{padding:9px 8px;gap:4px}.att-latest-card b{font-size:23px}.att-latest-card strong{font-size:12px}}
@media(max-width:360px){.att-latest-head{align-items:flex-start}.att-latest-head h2{font-size:12px}.att-latest-card>span{font-size:10px}.att-latest-card strong{font-size:11px}.att-latest-card b{font-size:21px}.att-latest-card b small{font-size:10px}}
</style>`;

function diemDanhFromFire(item = {}) {
  return {
    id: item.id,
    studentId: String(item.hocSinhId || ""),
    studentCode: String(item.maHocSinh || item.hocSinhId || ""),
    studentName: String(item.hoTen || ""),
    className: String(item.lop || ""),
    date: String(item.ngay || ""),
    dateLabel: String(item.ngay || ""),
    time: String(item.gio || ""),
    classStartTime: String(item.gioBatDau || ""),
    status: String(item.trangThai || "present"),
    statusLabel: String(item.tenTrangThai || ""),
    lateMinutes: Number(item.soPhutMuon || 0),
    billId: String(item.hocPhiId || ""),
    billStatus: String(item.trangThaiHocPhi || ""),
    billedAt: String(item.guiHocPhiLuc || ""),
    paidAt: String(item.thuLuc || ""),
    locked: item.khoa === true
  };
}

function buoiHocFromFire(item = {}) {
  return {
    id: item.id,
    className: String(item.lop || ""),
    date: String(item.ngay || ""),
    startTime: String(item.gioBatDau || ""),
    studentCount: Number(item.soHocSinh || 0)
  };
}

function hocPhiFromFire(item = {}) {
  return {
    id: item.id,
    studentId: String(item.hocSinhId || ""),
    studentCode: String(item.maHocSinh || item.hocSinhId || ""),
    studentName: String(item.hoTen || ""),
    className: String(item.lop || ""),
    amount: Number(item.soTien || 0),
    defaultAmount: Number(item.soTienMacDinh || item.soTien || 0),
    sessionFee: Number(item.donGiaMoiBuoi || SESSION_FEE),
    status: String(item.trangThai || "sent"),
    month: String(item.thang || String(item.ngayGui || "").slice(0, 7)),
    periodCode: String(item.maDot || ""),
    periodLabel: String(item.tenDot || ""),
    startDate: String(item.ngayBatDau || ""),
    endDate: String(item.ngayKetThuc || item.ngayGui || ""),
    periodResultId: String(item.ketQuaKyId || ""),
    sentDate: String(item.ngayGui || ""),
    sentDateLabel: String(item.ngayGui || ""),
    sentTime: String(item.gioGui || ""),
    paidDate: String(item.ngayThu || ""),
    paidDateLabel: String(item.ngayThu || ""),
    paidTime: String(item.gioThu || ""),
    studyCount: Number(item.soBuoiHoc || 0),
    absentCount: Number(item.soBuoiNghi || 0),
    lateMinutes: Number(item.soPhutMuon || 0),
    recordIds: Array.isArray(item.diemDanhIds) ? item.diemDanhIds : [],
    createdMs: Number(item.taoLuc || 0),
    parentConfirmedPaid: item.phuHuynhXacNhan === true,
    parentConfirmedAt: String(item.phuHuynhXacNhanLuc || ""),
    parentConfirmedBy: String(item.phuHuynhXacNhanBoi || "")
  };
}


const state = {
  loading: true,
  students: [],
  records: [],
  sessions: [],
  bills: [],
  giaoBai: [],
  selectedClass: "",
  selectedDate: todayIso(),
  calendarOpen: false,
  calendarMonth: todayIso().slice(0,7),
  calendarBusy: false,
  msg: "",
  modalStudentId: "",
  modalMode: "detail",
  editRecordId: "",
  loadedMonth: "",
  baseLoaded: false,
  loadedHistoryStudents: new Set()
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function nowMs() { return Date.now(); }
function isoToDate(value) {
  const [y, m, d] = String(value || todayIso()).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function formatDate(value) {
  const d = isoToDate(value);
  return `${WEEKDAYS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}


function classes() {
  return Array.from(new Set(state.students.map(studentClass).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "vi"));
}
function selectedStudents() {
  return state.students
    .filter(st => !state.selectedClass || studentClass(st) === state.selectedClass)
    .sort((a, b) => studentName(a).localeCompare(studentName(b), "vi"));
}
function monthText(value = "") {
  const [year, month] = String(value || "").split("-");
  return month && year ? `Tháng ${Number(month)}/${year}` : "Tháng hiện tại";
}
function recordId(studentId, date = state.selectedDate) { return `${date}_${studentId}`; }
function sessionId(className = state.selectedClass, date = state.selectedDate) { return `${date}_${slug(className)}`; }
function sessionOf(className = state.selectedClass) { return state.sessions.find(item => item.id === sessionId(className)) || null; }
function recordOf(studentId, date = state.selectedDate) { return state.records.find(item => item.id === recordId(studentId, date)) || null; }
function recordsOfStudent(studentId) { return state.records.filter(item => item.studentId === studentId); }
function billsOfStudent(studentId) {
  return state.bills.filter(item => item.studentId === studentId).sort((a, b) => Number(b.createdMs || 0) - Number(a.createdMs || 0));
}
function waitingBill(studentId) {
  return billsOfStudent(studentId).find(item => item.status !== "paid") || null;
}
function latestPaidBill(studentId) {
  return billsOfStudent(studentId).find(item => item.status === "paid") || null;
}
function currentRecords(studentId) {
  return recordsOfStudent(studentId).filter(item => !item.billId && !item.locked);
}
function recordsOfBill(bill = null) {
  if (!bill) return [];
  const ids = new Set(Array.isArray(bill.recordIds) ? bill.recordIds : []);
  return recordsOfStudent(bill.studentId).filter(item => item.billId === bill.id || ids.has(item.id));
}
function periodState(studentId) {
  const waiting = waitingBill(studentId);
  if (waiting) return { code: "waiting", label: "Đợi thu", bill: waiting };
  if (currentRecords(studentId).length) return { code: "open", label: "", bill: null };
  const paid = latestPaidBill(studentId);
  if (paid) return { code: "paid", label: "Đã thu", bill: paid };
  return { code: "open", label: "", bill: null };
}
function periodText(bill = null) {
  if (!bill) return "Đợt hiện tại";
  if (bill.periodLabel) return bill.periodLabel;
  if (bill.startDate || bill.endDate) {
    const start = bill.startDate ? bill.startDate.split("-").reverse().join("/") : "";
    const end = bill.endDate ? bill.endDate.split("-").reverse().join("/") : "";
    return start && end && start !== end ? `${start}–${end}` : (end || start || "Đợt đã chốt");
  }
  return bill.month ? monthText(bill.month) : "Đợt đã chốt";
}
function parseMoneyAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}
function formatMoneyInput(value) {
  return `${parseMoneyAmount(value).toLocaleString("vi-VN")}đ`;
}
function minutesDiff(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const start = (sh || 0) * 60 + (sm || 0);
  const end = (eh || 0) * 60 + (em || 0);
  return Math.max(0, end - start);
}
function setMsg(text, type = "success") {
  state.msg = text ? `<div class="att-msg att-${type}">${esc(text)}</div>` : "";
  renderMain();
  if (text) setTimeout(() => {
    state.msg = "";
    const box = document.getElementById("att-msg");
    if (box) box.innerHTML = "";
  }, 2400);
}

function fullStats(studentId) {
  const stats = { study: 0, absent: 0, lateMinutes: 0, lateCount: 0, total: 0 };
  recordsOfStudent(studentId).forEach(rec => {
    stats.total += 1;
    if (rec.status === "present" || String(rec.status || "").startsWith("late")) stats.study += 1;
    if (String(rec.status || "").startsWith("absent")) stats.absent += 1;
    if (String(rec.status || "").startsWith("late")) {
      stats.lateCount += 1;
      stats.lateMinutes += Number(rec.lateMinutes || 0);
    }
  });
  return stats;
}
function getDayStats(list = selectedStudents()) {
  const stats = { total: list.length, checked: 0, present: 0, late: 0, absent: 0, lateMinutes: 0, unmarked: 0 };
  list.forEach(st => {
    const rec = recordOf(st.id);
    if (!rec) { stats.unmarked += 1; return; }
    stats.checked += 1;
    if (rec.status === "present") stats.present += 1;
    if (String(rec.status || "").startsWith("late")) {
      stats.late += 1; stats.present += 1; stats.lateMinutes += Number(rec.lateMinutes || 0);
    }
    if (String(rec.status || "").startsWith("absent")) stats.absent += 1;
  });
  return stats;
}
function getOverallStats(list = selectedStudents()) {
  const ids = new Set(list.map(st => String(st.id)));
  const rows = state.records.filter(rec => ids.has(String(rec.studentId)) && !rec.billId && !rec.locked);
  return {
    total: rows.length,
    absent: rows.filter(rec => String(rec.status || "").startsWith("absent")).length,
    lateMinutes: rows.reduce((sum, rec) => sum + (String(rec.status || "").startsWith("late") ? Number(rec.lateMinutes || 0) : 0), 0)
  };
}
function hasAttendanceOnDate(dateValue, list = selectedStudents()) {
  const ids = new Set(list.map(st => String(st.id)));
  return state.records.some(rec => rec.date === dateValue && ids.has(String(rec.studentId)));
}
function simpleStatusText(rec) {
  if (!rec) return "Chọn trạng thái";
  if (rec.status === "present") return "Đúng";
  if (String(rec.status || "").startsWith("late")) return "Muộn";
  if (String(rec.status || "").startsWith("absent")) return "Vắng";
  return statusText(rec);
}

function renderSkeleton() {
  return `${ATT_STYLE}<section class="att-page"><div class="panel"><div class="empty-state"><div><h3>Đang tải điểm danh...</h3><p>Đang lấy danh sách học sinh và dữ liệu điểm danh.</p></div></div></div></section>`;
}
function renderClassChips() {
  return `<div class="att-class-row"><button class="att-chip ${state.selectedClass ? "" : "active"}" type="button" data-att-class="">Tất cả</button>${classes().map(name => { const stats=classAttendance(state.students,state.records,name,state.selectedDate);return `<button class="att-chip tone-${stats.tone} ${state.selectedClass===name?"active":""}" title="${esc(name)}: ${stats.present}/${stats.total} đi học, ${stats.absent} vắng, ${stats.unmarked} chưa điểm danh" type="button" data-att-class="${esc(name)}">${esc(name)}</button>`;}).join("")}</div>`;
}

function renderDateBar() {
  if (!state.calendarOpen) return "";
  return `<div class="calendar-overlay" data-calendar-dismiss><section class="att-calendar" role="dialog" aria-modal="true" aria-label="Chọn ngày điểm danh"><div class="calendar-head"><button type="button" data-calendar-month="-1" aria-label="Tháng trước">‹</button><b>${esc(monthText(state.calendarMonth))}</b><button type="button" data-calendar-month="1" aria-label="Tháng sau">›</button><button type="button" data-calendar-close aria-label="Đóng lịch">×</button></div><div class="calendar-weekdays">${["T2","T3","T4","T5","T6","T7","CN"].map(d=>`<span>${d}</span>`).join("")}</div><div class="calendar-grid">${calendarCells(state.calendarMonth).map(date=>date?`<button type="button" data-att-date="${date}" class="${date===state.selectedDate?"selected":""} ${date===todayIso()?"today":""} ${hasAttendanceOnDate(date)?"has-data":""}" ${state.calendarBusy?"disabled":""} title="${esc(formatDate(date))}">${Number(date.slice(-2))}</button>`:'<span></span>').join("")}</div><div class="calendar-foot"><span>${state.calendarBusy?"Đang tải…":"● Ngày có điểm danh"}</span><button type="button" data-calendar-today>Hôm nay</button></div></section></div>`;
}

function renderTop() {
  const list = selectedStudents();
  const day = getDayStats(list);
  const overall = getOverallStats(list);
  return `<section class="att-compact-tools panel">
    <div class="att-tools-line">
      <button type="button" class="att-date-trigger" data-calendar-open title="Chọn ngày">▦ ${esc(formatDate(state.selectedDate))}</button><div class="att-tools-main">${renderClassChips()}</div>
    </div>
    <div class="att-summary-strip">
      <div class="att-overall-summary">
        <div class="att-overall-card total"><span>Buổi chưa chốt</span><b>${overall.total}</b></div>
        <div class="att-overall-card absent"><span>Vắng chưa chốt</span><b>${overall.absent}</b></div>
        <div class="att-overall-card late"><span>Phút muộn</span><b>${overall.lateMinutes}</b></div>
      </div>
      <div class="att-day-stack" title="${esc(formatDate(state.selectedDate))}">
        <div class="att-day-stat green"><span>Học</span><b>${day.present}</b></div>
        <div class="att-day-stat red"><span>Vắng</span><b>${day.absent}</b></div>
        <div class="att-day-stat orange"><span>Muộn</span><b>${day.lateMinutes}'</b></div>
      </div>
    </div>
    <div id="att-msg">${state.msg}</div>
  </section>`;
}

function renderLatestPayment() {
  const summary = latestPaymentSummary(state.bills, selectedStudents());
  const group = state.selectedClass ? `Lớp ${state.selectedClass}` : "Tất cả lớp";
  return `<section class="att-latest-payment" aria-label="Thống kê đợt thu tiền gần nhất">
    <div class="att-latest-head"><h2>Đợt thu tiền gần nhất</h2><span>${esc(group)}</span></div>
    ${summary.students ? `<div class="att-latest-cards">
      <div class="att-latest-card"><span>Tổng buổi</span><b>${summary.totalSessions} <small>buổi</small></b><strong>${formatMoney(summary.totalAmount)}</strong><small>${summary.students} học sinh</small></div>
      <div class="att-latest-card paid"><span>Đã thu</span><b>${summary.paidSessions} <small>buổi</small></b><strong>${formatMoney(summary.paidAmount)}</strong><small>${summary.paidStudents} học sinh</small></div>
      <div class="att-latest-card unpaid"><span>Chưa thu</span><b>${summary.unpaidSessions} <small>buổi</small></b><strong>${formatMoney(summary.unpaidAmount)}</strong><small>${summary.unpaidStudents} học sinh</small></div>
    </div>` : `<p class="att-latest-empty">Chưa có đợt thu tiền đã chốt${state.selectedClass ? " trong lớp này" : ""}.</p>`}
    <p class="att-latest-note">Cộng đợt đã chốt mới nhất của từng học sinh; buổi vắng không tính học phí.${summary.unclosed ? ` ${summary.unclosed} học sinh chưa có đợt đã chốt.` : ""}</p>
  </section>`;
}

function statusText(rec) {
  const s = rec ? STATUS[rec.status] || STATUS.present : null;
  return s ? s.short : "Chưa DD";
}
function renderStudentCard(st) {
  const rec = recordOf(st.id);
  const status = rec ? STATUS[rec.status] || STATUS.present : null;
  const cls = status?.cls || "none";
  const stats = calculateAttendanceSummary(currentRecords(st.id));
  const billing = periodState(st.id);
  const waiting = waitingBill(st.id);
  const locked = Boolean(rec?.billId || rec?.locked);
  return `<article class="att-st-card ${cls}" data-student-card="${esc(st.id)}">
    <div class="att-st-main">
      <label class="att-check"><input type="checkbox" data-select-student value="${esc(st.id)}"></label>
      <button class="att-st-info" type="button" data-open-history="${esc(st.id)}" title="Xem lịch sử">
        <h3>${esc(studentName(st))}</h3>
        <p>${esc(studentCode(st))} · ${esc(studentClass(st))}</p>
      </button>
      <details class="att-status-picker ${cls} ${locked ? "locked" : ""}">
        <summary class="att-status-trigger" title="${locked ? "Buổi này đã chốt" : "Bấm để đổi trạng thái"}"><b>${esc(rec ? simpleStatusText(rec) : "Chưa")}</b></summary>
        <div class="att-status-pop">
          <button type="button" class="present" data-st-status="present" data-student-id="${esc(st.id)}">Đúng</button>
          <button type="button" class="late" data-st-status="late_unallowed" data-student-id="${esc(st.id)}">Muộn</button>
          <button type="button" class="absent" data-st-status="absent_unallowed" data-student-id="${esc(st.id)}">Vắng</button>
          <button type="button" class="clear" data-clear-attendance="${esc(st.id)}" ${rec ? "" : "disabled"}>Xóa DD</button>
        </div>
      </details>
    </div>
    <div class="att-row-two">
      <div class="att-st-kpis" title="Thống kê đợt chưa chốt"><span class="green">Học ${stats.study}</span><span class="red">Vắng ${stats.absentAllowed + stats.absentUnallowed}</span><span class="orange">Muộn ${stats.lateMinutes}'</span></div>
      <div class="att-period-info">${waiting ? `<span class="att-closed-count">Đã chốt: ${waiting.studyCount} buổi</span>` : ""}${billing.code !== "open" ? `<span class="att-period-state ${billing.code}">${esc(billing.label)}</span>` : ""}</div>
    </div>
    <div class="att-card-actions">
      <button type="button" class="close" data-card-close="${esc(st.id)}" ${!waiting ? "" : "disabled"}>Chốt tháng</button>
      <button type="button" class="history" data-card-history="${esc(st.id)}">Lịch sử</button>
      <button type="button" class="pay" data-card-pay="${esc(st.id)}" ${waiting ? "" : "disabled"}>Thu tiền</button>
    </div>
  </article>`;
}
function renderHistoryModal() {
  const st = state.students.find(item => item.id === state.modalStudentId);
  if (!st) return "";
  const rows = recordsOfStudent(st.id).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const paidBills = billsOfStudent(st.id).filter(bill => bill.status === "paid");
  const waiting = waitingBill(st.id);
  const mode = state.modalMode || "detail";
  if (mode === "editAttendance") {
    const rec = state.records.find(item => item.id === state.editRecordId && item.studentId === st.id);
    if (!rec) { state.modalMode = "detail"; state.editRecordId = ""; return ""; }
    return `<div class="att-modal active" data-close-modal><div class="att-modal-box" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
      <div class="att-modal-head"><div><h2>Sửa điểm danh</h2><p>${esc(studentName(st))} · ${esc(studentClass(st))}</p></div><button type="button" data-close-modal>×</button></div>
      <form class="att-edit-form" data-edit-attendance-form data-record-id="${esc(rec.id)}">
        <div class="att-edit-grid">
          <div class="att-edit-field"><label>Ngày</label><input type="date" name="date" value="${esc(rec.date)}" required></div>
          <div class="att-edit-field"><label>Giờ</label><input type="time" name="time" value="${esc(rec.time || "")}" required></div>
          <div class="att-edit-field"><label>Trạng thái</label><select name="status">${Object.entries(STATUS).map(([key, item]) => `<option value="${key}" ${rec.status === key ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select></div>
          <div class="att-edit-field"><label>Phút muộn</label><input type="number" min="0" max="600" name="lateMinutes" value="${Number(rec.lateMinutes || 0)}"></div>
        </div>
        ${rec.billId ? `<p class="muted">Buổi này đã thuộc đợt học phí. Khi sửa, thống kê của đợt sẽ được tính lại.</p>` : ""}
        <div class="att-edit-actions"><button class="att-state-btn secondary" type="button" data-cancel-edit-attendance>Hủy</button><button class="att-state-btn pay" type="submit">Lưu điểm danh</button></div>
      </form></div></div>`;
  }
  if (mode === "pay") {
    if (!waiting) return `<div class="att-modal active" data-close-modal><div class="att-modal-box" role="dialog" aria-modal="true" onclick="event.stopPropagation()"><div class="att-modal-head"><div><h2>Không có bill Đợi thu</h2><p>${esc(studentName(st))}</p></div><button type="button" data-close-modal>×</button></div><p class="muted">Hãy chốt đợt học trước khi thu tiền.</p></div></div>`;
    const billRows = recordsOfBill(waiting).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    const billStats = calculateAttendanceSummary(billRows);
    const billAbsent = billStats.absentAllowed + billStats.absentUnallowed;
    const defaultAmount = Number(waiting.defaultAmount || billStats.study * SESSION_FEE);
    return `<div class="att-modal active" data-close-modal>
      <div class="att-modal-box att-payment-box" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <section class="att-payment-card">
          <div class="att-payment-head"><div><h2>${esc(studentName(st))}</h2><p>Lớp ${esc(studentClass(st))}${studentPhone(st) ? ` · ${esc(studentPhone(st))}` : ""}</p></div><button type="button" data-close-modal>×</button></div>
          <div class="att-payment-body">
            <div class="att-payment-period"><span>${esc(periodText(waiting))}</span><b>Đợi thu</b></div>
            <div class="att-payment-stats"><div class="att-payment-stat green"><span>Buổi học</span><b>${billStats.study}</b></div><div class="att-payment-stat red"><span>Buổi vắng</span><b>${billAbsent}</b></div><div class="att-payment-stat orange"><span>Phút muộn</span><b>${billStats.lateMinutes}</b></div></div>
            <div class="att-money-control"><label>Số tiền thu</label><div class="att-money-input-wrap"><input type="text" value="${formatMoneyInput(defaultAmount)}" data-payment-amount inputmode="numeric" autocomplete="off"><span>Có thể sửa</span></div><small>Mặc định ${billStats.study} buổi × 100.000đ.</small></div>
            <div class="att-bill-history"><h3>Lịch sử buổi học thuộc bill này</h3>${billRows.length ? billRows.map(rec => `<div class="att-bill-row-detail ${STATUS[rec.status]?.cls || ""}"><b>${esc(formatDate(rec.date))}</b><span>${esc(STATUS[rec.status]?.label || rec.status || "")}${rec.lateMinutes ? ` · ${esc(rec.lateMinutes)} phút` : ""}</span><small>${esc(rec.time || "")}</small></div>`).join("") : `<p class="muted">Bill chưa có dữ liệu buổi học.</p>`}</div>
          </div>
          <div class="att-payment-feedback" data-payment-feedback></div>
          <div class="att-payment-bottom"><button class="download" type="button" data-download-bill-image="${esc(st.id)}">Tải ảnh</button><button class="copy" type="button" data-copy-bill-image="${esc(st.id)}">Copy ảnh</button><button class="collect" type="button" data-confirm-payment="${esc(st.id)}">Thu tiền</button></div>
        </section>
      </div>
    </div>`;
  }
  const allStats = fullStats(st.id);
  const content = mode === "payments"
    ? `<div class="att-modal-nav"><h3>Lịch sử thu tiền</h3><button class="att-state-btn secondary" type="button" data-modal-mode="detail">Quay lại</button></div><div class="att-history-list">${paidBills.length ? paidBills.map(bill => `<div class="att-history-row paid"><b>${esc(periodText(bill))}</b><span>${formatMoney(bill.amount)} · ${bill.studyCount} buổi</span><small>Đã thu ${esc(bill.paidDate || bill.sentDate || "")}</small></div>`).join("") : `<p class="muted">Chưa có lịch sử thu tiền.</p>`}</div>`
    : `<div class="att-history-stats"><span class="green">Buổi học <b>${allStats.study}</b></span><span class="red">Buổi vắng <b>${allStats.absent}</b></span><span class="orange">Phút muộn <b>${allStats.lateMinutes}</b></span></div><div class="att-modal-actions"><button class="att-state-btn history" type="button" data-modal-mode="payments">Lịch sử thu tiền</button></div><div class="att-history-section"><h3>Tất cả lịch sử buổi học</h3><div class="att-history-list">${rows.length ? rows.map(rec => `<div class="att-history-row ${STATUS[rec.status]?.cls || ""}"><b>${esc(formatDate(rec.date))}</b><span>${esc(STATUS[rec.status]?.label || rec.status || "")}${rec.lateMinutes ? ` · ${esc(rec.lateMinutes)} phút` : ""}</span><small>${esc(rec.time || "")}${rec.billId ? " · Đã chốt" : " · Đợt mới"}</small><div class="att-history-actions"><button class="edit" type="button" data-edit-attendance="${esc(rec.id)}">Sửa</button><button class="delete" type="button" data-delete-attendance="${esc(rec.id)}">Xóa</button></div></div>`).join("") : `<p class="muted">Chưa có lịch sử điểm danh.</p>`}</div></div>`;
  return `<div class="att-modal active" data-close-modal>
    <div class="att-modal-box" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
      <div class="att-modal-head">
        <div><h2>${esc(studentName(st))}</h2><p>${esc(studentCode(st))}${studentPhone(st) ? ` · ${esc(studentPhone(st))}` : ""} · Lớp ${esc(studentClass(st))}</p></div>
        <button type="button" data-close-modal>×</button>
      </div>
      ${content}
    </div>
  </div>`;
}
function renderMain() {
  const root = document.getElementById("attendance-root");
  if (!root) return;
  if (state.loading) { root.innerHTML = renderSkeleton(); return; }
  const list = selectedStudents();
  root.innerHTML = `${ATT_STYLE}<div class="att-page">
    <section class="att-controlbar panel">
      <div class="att-select-line"><label><input type="checkbox" data-select-all> Tất cả</label></div>
      <div class="att-bulk-actions">
        <button class="att-state-btn start" type="button" data-start-class ${state.selectedClass ? "" : "disabled"} title="${state.selectedClass ? `Điểm danh lớp ${esc(state.selectedClass)}` : "Chọn một lớp ở hàng trên"}">Điểm danh</button>
        <button class="att-state-btn close" type="button" data-close-period>Chốt tháng</button>
        <button class="att-state-btn pay" type="button" data-pay-selected>Thu tiền</button><button class="att-state-btn secondary" type="button" data-refresh-att title="Làm mới" aria-label="Làm mới">↻</button>
      </div>
    </section>
    ${renderTop()}
    ${renderLatestPayment()}
    <section class="att-list">${list.length ? list.map(renderStudentCard).join("") : `<div class="empty-state"><div><h3>Chưa có học sinh</h3><p>Hãy thêm học sinh và gán lớp trước khi điểm danh.</p></div></div>`}</section>
    ${renderHistoryModal()}${renderDateBar()}
  </div>`;
  bindEvents(root);
}

function monthRange(dateValue = state.selectedDate) {
  const [year, month] = String(dateValue || todayIso()).split("-").map(Number);
  const y = Number.isFinite(year) ? year : new Date().getFullYear();
  const m = Number.isFinite(month) ? month : new Date().getMonth() + 1;
  const last = new Date(y, m, 0).getDate();
  return {
    key: `${y}-${String(m).padStart(2, "0")}`,
    start: `${y}-${String(m).padStart(2, "0")}-01`,
    end: `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`
  };
}
function mergeById(current = [], incoming = []) {
  const map = new Map((Array.isArray(current) ? current : []).map(item => [String(item.id), item]));
  (Array.isArray(incoming) ? incoming : []).forEach(item => map.set(String(item.id), item));
  return [...map.values()];
}
async function ensureStudentHistory(studentId = "") {
  const id = String(studentId || "");
  if (!id || state.loadedHistoryStudents.has(id)) return;
  const [records, bills] = await Promise.all([
    FirestoreService.list(CO.diemDanh, { filters: [{ field: "hocSinhId", op: "==", value: id }] }),
    FirestoreService.list(CO.hocPhi, { filters: [{ field: "hocSinhId", op: "==", value: id }] })
  ]);
  state.records = mergeById(state.records.filter(row=>row.studentId!==id), records.map(diemDanhFromFire));
  state.bills = mergeById(state.bills.filter(row=>row.studentId!==id), bills.map(hocPhiFromFire));
  state.loadedHistoryStudents.add(id);
}
async function loadCalendarMonth(month, force = false) {
  const range = monthRange(month+"-01");
  const sessions = await FirestoreService.list(CO.buoiHoc,{filters:[{field:"ngay",op:">=",value:range.start},{field:"ngay",op:"<=",value:range.end}],force});
  state.sessions=mergeById(state.sessions.filter(row=>!row.date.startsWith(month)),sessions.map(buoiHocFromFire));
  state.loadedMonth=range.key;
}
async function loadData(force = false) {
  state.loading = true; renderMain();
  try {
    const [students,bills,records] = await Promise.all([
      FirestoreService.list(CO.hocSinh,{force}),
      FirestoreService.list(CO.hocPhi,{force}),
      FirestoreService.list(CO.diemDanh,{force}),
      loadCalendarMonth(state.selectedDate.slice(0,7),force)
    ]);
    state.records=records.map(diemDanhFromFire);
    state.students=students.filter(st=>attendanceMode(st)==="attendance");
    state.bills=bills.map(hocPhiFromFire);
    state.loadedHistoryStudents.clear();
  } finally { state.loading=false; renderMain(); }
}

async function saveRecord(st, statusKey, options = {}) {
  const now = options.time || localTime();
  const className = studentClass(st);
  const sess = sessionOf(className);
  const status = STATUS[statusKey] ? statusKey : "present";
  const lateMinutes = status.startsWith("late") ? minutesDiff(sess?.startTime || now, now) : 0;
  const id = recordId(st.id);
  const old = state.records.find(item => item.id === id);
  const locked = Boolean(old?.billId || old?.locked);
  if (locked) throw new Error("Buổi học này đã chốt, không thể sửa điểm danh.");
  const data = {
    studentId: st.id,
    studentCode: studentCode(st),
    studentName: studentName(st),
    className,
    date: state.selectedDate,
    time: now,
    classStartTime: sess?.startTime || now,
    status,
    statusLabel: STATUS[status].label,
    lateMinutes
  };
  await FirestoreService.set(CO.diemDanh, id, {
    hocSinhId: st.id,
    maHocSinh: studentCode(st),
    hoTen: studentName(st),
    lop: className,
    ngay: state.selectedDate,
    gio: now,
    gioBatDau: sess?.startTime || now,
    trangThai: status,
    tenTrangThai: STATUS[status].label,
    soPhutMuon: lateMinutes
  });
  if (old) Object.assign(old, data);
  else state.records.push({ id, ...data });
}
async function startClassAttendance() {
  if (!state.selectedClass) return;
  const classStudents = selectedStudents();
  if (!classStudents.length) return setMsg("Lớp này chưa có học sinh.", "warning");
  const openStudents = classStudents.filter(st => {
    const rec = recordOf(st.id);
    return !rec?.billId && !rec?.locked;
  });
  if (!openStudents.length) return setMsg("Buổi học ngày này đã được chốt.", "warning");
  const startTime = localTime();
  const sid = sessionId();
  await FirestoreService.set(CO.buoiHoc, sid, { lop: state.selectedClass, ngay: state.selectedDate, gioBatDau: startTime, soHocSinh: openStudents.length });
  const existingSession = state.sessions.find(item => item.id === sid);
  if (existingSession) Object.assign(existingSession, { startTime, studentCount: openStudents.length });
  else state.sessions.push({ id: sid, className: state.selectedClass, date: state.selectedDate, startTime, studentCount: openStudents.length });
  await Promise.all(openStudents.map(st => saveRecord(st, "present", { time: startTime })));
  setMsg(`Đã điểm danh ${openStudents.length} học sinh lớp ${state.selectedClass} lúc ${startTime}.`);
}
function selectedIds() { return Array.from(document.querySelectorAll("[data-select-student]:checked")).map(item => item.value); }
async function setStatusForStudent(studentId, statusKey) {
  const st = state.students.find(item => item.id === studentId);
  if (!st) throw new Error("Không tìm thấy học sinh.");
  if (!sessionOf(studentClass(st))) throw new Error(`Cần mở điểm danh lớp ${studentClass(st)} trước.`);
  await saveRecord(st, statusKey);
  renderMain();
}
async function clearAttendanceForStudent(studentId) {
  const st = state.students.find(item => item.id === studentId);
  if (!st) throw new Error("Không tìm thấy học sinh.");
  const rec = recordOf(studentId);
  if (!rec) return;
  if (rec.billId || rec.locked) throw new Error("Buổi học này đã chốt, không thể xóa điểm danh.");
  if (!window.confirm(`Xóa điểm danh ${studentName(st)} ngày ${formatDate(state.selectedDate)}?`)) return;
  await FirestoreService.remove(CO.diemDanh, rec.id);
  state.records = state.records.filter(item => item.id !== rec.id);
  renderMain();
}

async function closeStudentPeriod(studentId, options = {}) {
  await ensureStudentHistory(studentId);
  const freshAssignments = await listStudentAssignments(studentId);
  state.giaoBai = mergeById(state.giaoBai.filter(row => String(row.hocSinhId) !== String(studentId)), freshAssignments);
  const st = state.students.find(item => item.id === studentId);
  if (!st) throw new Error("Không tìm thấy học sinh.");
  if (waitingBill(studentId)) throw new Error(`${studentName(st)} còn một đợt Đợi thu.`);
  const items = currentRecords(studentId).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  if (!items.length) throw new Error(`${studentName(st)} chưa có buổi điểm danh mới để chốt.`);

  const attendance = calculateAttendanceSummary(items);
  const previousBill = billsOfStudent(studentId)[0] || null;
  const cutoff = Number(previousBill?.createdMs || 0);
  const studyRows = state.giaoBai
    .filter(item => String(item.hocSinhId || "") === String(studentId))
    .filter(item => !cutoff || assignedAt(item) > cutoff);
  const study = learningSummary(studyRows);

  const createdMs = nowMs();
  const id = `HP_${createdMs}_${slug(studentId)}`;
  const closedAt = nowIso();
  const startDate = items[0]?.date || state.selectedDate;
  const endDate = items[items.length - 1]?.date || state.selectedDate;
  const periodLabel = `Đợt ${startDate.split("-").reverse().join("/")} - ${endDate.split("-").reverse().join("/")}`;
  const defaultAmount = attendance.study * SESSION_FEE;
  await FirestoreService.set(CO.ketQuaKy, id, {
    hocSinhId: studentId,
    hocPhiId: id,
    maDot: id,
    tenDot: periodLabel,
    ngayBatDau: startDate,
    ngayKetThuc: endDate,
    batDauSau: cutoff || null,
    ketThucLuc: closedAt,
    chuyenCan: attendance,
    hocTap: study,
    diemDanhIds: items.map(item => item.id),
    giaoBaiIds: studyRows.map(item => item.id),
    trangThai: "closed"
  });

  const data = {
    studentId,
    studentCode: studentCode(st),
    studentName: studentName(st),
    className: studentClass(st),
    amount: defaultAmount,
    defaultAmount,
    sessionFee: SESSION_FEE,
    status: "waiting",
    month: "",
    periodCode: id,
    periodLabel,
    startDate,
    endDate,
    periodResultId: id,
    sentDate: state.selectedDate,
    sentTime: localTime(),
    studyCount: attendance.study,
    absentCount: attendance.absentAllowed + attendance.absentUnallowed,
    lateMinutes: attendance.lateMinutes,
    recordIds: items.map(item => item.id),
    createdMs
  };
  await FirestoreService.set(CO.hocPhi, id, {
    hocSinhId: studentId,
    maHocSinh: studentCode(st),
    hoTen: studentName(st),
    lop: studentClass(st),
    soTien: defaultAmount,
    soTienMacDinh: defaultAmount,
    donGiaMoiBuoi: SESSION_FEE,
    trangThai: "waiting",
    maDot: id,
    tenDot: periodLabel,
    ngayBatDau: startDate,
    ngayKetThuc: endDate,
    ketQuaKyId: id,
    ngayGui: state.selectedDate,
    gioGui: data.sentTime,
    soBuoiHoc: attendance.study,
    soBuoiNghi: data.absentCount,
    soPhutMuon: attendance.lateMinutes,
    diemDanhIds: data.recordIds,
    taoLuc: createdMs
  });
  await Promise.all(items.map(rec => FirestoreService.set(CO.diemDanh, rec.id, {
    hocPhiId: id,
    trangThaiHocPhi: "waiting",
    guiHocPhiLuc: closedAt,
    khoa: true
  })));
  const savedBill = { id, ...data };
  state.bills.push(savedBill);
  items.forEach(rec => { rec.billId = id; rec.billStatus = "waiting"; rec.billedAt = closedAt; rec.locked = true; });
  if (!options.silent) setMsg(`Đã chốt ${attendance.study} buổi cho ${studentName(st)} · Đợi thu ${formatMoney(defaultAmount)}.`);
  return savedBill;
}

async function payBill(studentId, amount = null, options = {}) {
  const bill = waitingBill(studentId);
  if (!bill || bill.status === "paid") throw new Error("Không có khoản Đợi thu.");
  const defaultAmount = Number(bill.defaultAmount || bill.studyCount * SESSION_FEE);
  const paidAmount = amount === null || amount === undefined || amount === "" ? defaultAmount : parseMoneyAmount(amount);
  if (!Number.isFinite(paidAmount) || paidAmount < 0) throw new Error("Số tiền đã thu không hợp lệ.");
  const paidTime = localTime();
  const paidAt = nowIso();
  await FirestoreService.set(CO.hocPhi, bill.id, {
    soTien: paidAmount,
    trangThai: "paid",
    ngayThu: state.selectedDate,
    gioThu: paidTime,
    thuLuc: paidAt
  });
  await Promise.all((bill.recordIds || []).map(id => FirestoreService.set(CO.diemDanh, id, {
    trangThaiHocPhi: "paid",
    khoa: true,
    thuLuc: paidAt
  })));
  Object.assign(bill, { amount: paidAmount, status: "paid", paidDate: state.selectedDate, paidDateLabel: formatDate(state.selectedDate), paidTime });
  state.records.forEach(rec => {
    if ((bill.recordIds || []).includes(rec.id)) Object.assign(rec, { billStatus: "paid", locked: true, paidAt });
  });
  if (!options.silent) setMsg(`Đã thu ${formatMoney(paidAmount)} của ${bill.studentName || "học sinh"}.`);
  return bill;
}

async function closeSelectedPeriod() {
  const ids = selectedIds();
  if (!ids.length) return setMsg("Hãy tích chọn học sinh cần chốt tháng.", "warning");
  const ready = ids.filter(id => !waitingBill(id));
  if (!ready.length) return setMsg("Học sinh đã chọn chưa có buổi mới hoặc còn đợt Đợi thu.", "warning");
  const errors = [];
  for (const id of ready) {
    try { await closeStudentPeriod(id, { silent: true }); }
    catch (error) { errors.push(error.message || String(error)); }
  }
  const done = ready.length - errors.length;
  setMsg(`${done ? `Đã chốt đợt học cho ${done} học sinh.` : "Không chốt được học sinh nào."}${errors.length ? ` Bỏ qua ${errors.length}: ${errors.join("; ")}` : ""}`, errors.length && !done ? "danger" : errors.length ? "warning" : "success");
}

async function paySelectedStudents() {
  const ids = selectedIds();
  if (!ids.length) return setMsg("Hãy tích chọn học sinh đã thu tiền.", "warning");
  const ready = ids.filter(id => Boolean(waitingBill(id)));
  if (!ready.length) return setMsg("Học sinh đã chọn không có khoản Đợi thu.", "warning");
  const errors = [];
  for (const id of ready) {
    try { await payBill(id, null, { silent: true }); }
    catch (error) { errors.push(error.message || String(error)); }
  }
  const done = ready.length - errors.length;
  setMsg(`${done ? `Đã chuyển ${done} học sinh sang Đã thu.` : "Không thu được học sinh nào."}${errors.length ? ` Lỗi ${errors.length}: ${errors.join("; ")}` : ""}`, errors.length && !done ? "danger" : errors.length ? "warning" : "success");
}

function buildBillSummaryCanvas(studentId, amount = null) {
  const st = state.students.find(item => item.id === studentId);
  if (!st) throw new Error("Không tìm thấy học sinh.");
  const bill = waitingBill(studentId);
  if (!bill) throw new Error("Học sinh không có bill Đợi thu.");
  const rows = recordsOfBill(bill).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  if (!rows.length) throw new Error("Bill chưa có buổi học để tạo ảnh.");
  const stats = calculateAttendanceSummary(rows);
  const absent = stats.absentAllowed + stats.absentUnallowed;
  const displayAmount = amount === null ? Number(bill.defaultAmount || stats.study * SESSION_FEE) : parseMoneyAmount(amount);
  const width = 1080;
  const rowHeight = 54;
  const height = Math.max(720, 480 + rows.length * rowHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không tạo được ảnh.");

  const roundRect = (x, y, w, h, r, fill) => {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  ctx.fillStyle = "#eef4ff";
  ctx.fillRect(0, 0, width, height);
  roundRect(45, 38, width - 90, height - 76, 30, "#ffffff");
  roundRect(75, 68, width - 150, 110, 22, "#153e75");
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 34px Arial, sans-serif";
  ctx.fillText("LỊCH SỬ ĐỢT HỌC", 105, 116);
  ctx.font = "600 20px Arial, sans-serif";
  ctx.fillText(periodText(bill), 105, 151);

  ctx.fillStyle = "#0f172a";
  ctx.font = "800 31px Arial, sans-serif";
  ctx.fillText(studentName(st), 82, 225);
  ctx.font = "600 19px Arial, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText(`Lớp ${studentClass(st)}${studentPhone(st) ? `  •  ${studentPhone(st)}` : ""}`, 82, 257);

  const metrics = [
    ["Buổi học", stats.study, "#166534", "#dcfce7"],
    ["Buổi vắng", absent, "#991b1b", "#fee2e2"],
    ["Phút muộn", stats.lateMinutes, "#9a3412", "#ffedd5"],
    ["Số tiền", formatMoney(displayAmount), "#5b21b6", "#ede9fe"]
  ];
  metrics.forEach((item, index) => {
    const x = 82 + index * 225;
    roundRect(x, 282, 205, 82, 16, item[3]);
    ctx.fillStyle = item[2];
    ctx.font = "700 16px Arial, sans-serif";
    ctx.fillText(item[0], x + 16, 309);
    ctx.font = "800 25px Arial, sans-serif";
    ctx.fillText(String(item[1]), x + 16, 342);
  });

  ctx.fillStyle = "#334155";
  ctx.font = "800 18px Arial, sans-serif";
  ctx.fillText("NGÀY", 90, 411);
  ctx.fillText("TRẠNG THÁI", 310, 411);
  ctx.fillText("THỜI GIAN", 785, 411);
  let y = 432;
  rows.forEach((rec, index) => {
    if (index % 2 === 0) roundRect(76, y - 4, width - 152, rowHeight - 4, 10, "#f8fafc");
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 17px Arial, sans-serif";
    ctx.fillText(rec.date ? rec.date.split("-").reverse().join("/") : "", 90, y + 27);
    ctx.fillStyle = String(rec.status || "").startsWith("absent") ? "#b91c1c" : String(rec.status || "").startsWith("late") ? "#b45309" : "#15803d";
    ctx.fillText(`${STATUS[rec.status]?.label || rec.status || ""}${rec.lateMinutes ? ` · ${rec.lateMinutes} phút` : ""}`, 310, y + 27);
    ctx.fillStyle = "#475569";
    ctx.fillText(rec.time || "--:--", 785, y + 27);
    y += rowHeight;
  });
  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 15px Arial, sans-serif";
  ctx.fillText(`Tạo ngày ${new Date().toLocaleString("vi-VN")}`, 82, height - 66);

  return { canvas, fileName: `bill-${slug(studentName(st))}-${bill.id}.png` };
}

function canvasPngData(canvas) {
  const dataUrl = canvas.toDataURL("image/png");
  if (!String(dataUrl || "").startsWith("data:image/png")) throw new Error("Không tạo được ảnh PNG.");
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { dataUrl, blob: new Blob([bytes], { type: "image/png" }) };
}

function downloadBillImage(studentId, amount = null) {
  const { canvas, fileName } = buildBillSummaryCanvas(studentId, amount);
  const { blob } = canvasPngData(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = fileName;
  link.href = url;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function copyBillImage(studentId, amount = null) {
  const { canvas } = buildBillSummaryCanvas(studentId, amount);
  const { dataUrl, blob } = canvasPngData(canvas);
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    return navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  }
  const holder = document.createElement("div");
  holder.contentEditable = "true";
  holder.style.cssText = "position:fixed;left:-9999px;top:0";
  const image = document.createElement("img");
  image.src = dataUrl;
  holder.appendChild(image);
  document.body.appendChild(holder);
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNode(holder);
  selection.removeAllRanges();
  selection.addRange(range);
  const copied = document.execCommand?.("copy") === true;
  selection.removeAllRanges();
  holder.remove();
  if (!copied) throw new Error("Trình duyệt đang chặn copy ảnh. Hãy mở trang bằng HTTPS hoặc dùng nút Tải ảnh.");
}

async function syncBillAfterAttendanceChange(billId) {
  if (!billId) return;
  const bill = state.bills.find(item => item.id === billId);
  if (!bill) return;
  const rows = state.records.filter(item => item.billId === billId).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const stats = calculateAttendanceSummary(rows);
  const absent = stats.absentAllowed + stats.absentUnallowed;
  const recordIds = rows.map(item => item.id);
  const startDate = rows[0]?.date || bill.startDate || "";
  const endDate = rows.at(-1)?.date || bill.endDate || "";
  const defaultAmount = stats.study * Number(bill.sessionFee || SESSION_FEE);
  const billPatch = { diemDanhIds: recordIds, soBuoiHoc: stats.study, soBuoiNghi: absent, soPhutMuon: stats.lateMinutes, ngayBatDau: startDate, ngayKetThuc: endDate, soTienMacDinh: defaultAmount };
  if (bill.status !== "paid") billPatch.soTien = defaultAmount;
  await FirestoreService.set(CO.hocPhi, bill.id, billPatch);
  if (bill.periodResultId) await FirestoreService.set(CO.ketQuaKy, bill.periodResultId, { diemDanhIds: recordIds, ngayBatDau: startDate, ngayKetThuc: endDate, chuyenCan: stats });
  Object.assign(bill, { recordIds, studyCount: stats.study, absentCount: absent, lateMinutes: stats.lateMinutes, startDate, endDate, defaultAmount, ...(bill.status !== "paid" ? { amount: defaultAmount } : {}) });
}

async function saveEditedAttendance(form) {
  const oldId = form.dataset.recordId;
  const rec = state.records.find(item => item.id === oldId);
  if (!rec) throw new Error("Không tìm thấy bản điểm danh.");
  const data = Object.fromEntries(new FormData(form).entries());
  const date = String(data.date || rec.date);
  const time = String(data.time || rec.time || localTime());
  const status = STATUS[data.status] ? data.status : rec.status;
  const lateMinutes = status.startsWith("late") ? Math.max(0, Number(data.lateMinutes || 0)) : 0;
  const newId = recordId(rec.studentId, date);
  if (newId !== oldId && state.records.some(item => item.id === newId)) throw new Error("Ngày này đã có điểm danh của học sinh.");
  const st = state.students.find(item => item.id === rec.studentId) || {};
  const payload = { hocSinhId: rec.studentId, maHocSinh: rec.studentCode || studentCode(st), hoTen: rec.studentName || studentName(st), lop: rec.className || studentClass(st), ngay: date, gio: time, gioBatDau: rec.classStartTime || time, trangThai: status, tenTrangThai: STATUS[status].label, soPhutMuon: lateMinutes };
  if (rec.billId) Object.assign(payload, { hocPhiId: rec.billId, trangThaiHocPhi: rec.billStatus || "waiting", guiHocPhiLuc: rec.billedAt || "", khoa: true });
  if (rec.paidAt) payload.thuLuc = rec.paidAt;
  await FirestoreService.set(CO.diemDanh, newId, payload);
  if (newId !== oldId) await FirestoreService.remove(CO.diemDanh, oldId);
  Object.assign(rec, { id: newId, date, dateLabel: date, time, status, statusLabel: STATUS[status].label, lateMinutes });
  if (rec.billId) await syncBillAfterAttendanceChange(rec.billId);
  state.editRecordId = ""; state.modalMode = "detail";
  renderMain();
}

async function deleteAttendanceRecord(recordIdValue) {
  const rec = state.records.find(item => item.id === recordIdValue);
  if (!rec) return;
  const label = `${formatDate(rec.date)} · ${STATUS[rec.status]?.label || rec.status}`;
  if (!window.confirm(`Xóa điểm danh ${label}?`)) return;
  await FirestoreService.remove(CO.diemDanh, rec.id);
  state.records = state.records.filter(item => item.id !== rec.id);
  if (rec.billId) await syncBillAfterAttendanceChange(rec.billId);
  setMsg("Đã xóa điểm danh.");
  renderMain();
}

function setPaymentFeedback(root, text, type = "success") {
  const box = root.querySelector("[data-payment-feedback]");
  if (!box) return;
  box.className = `att-payment-feedback ${type}`;
  box.textContent = text;
}

function bindEvents(root) {
  const updateSelection = () => {
    const ids = selectedIds();
    const selected = new Set(ids);
    root.querySelector("[data-selection-count]")?.replaceChildren(document.createTextNode(`Đã chọn ${ids.length}`));
    root.querySelectorAll("[data-student-card]").forEach(card => card.classList.toggle("is-selected", selected.has(card.dataset.studentCard)));
    const boxes = [...root.querySelectorAll("[data-select-student]")];
    const selectAll = root.querySelector("[data-select-all]");
    if (selectAll) {
      selectAll.checked = boxes.length > 0 && boxes.every(item => item.checked);
      selectAll.indeterminate = boxes.some(item => item.checked) && !selectAll.checked;
    }
  };
  root.querySelector("[data-calendar-open]")?.addEventListener("click",()=>{state.calendarOpen=true;state.calendarMonth=state.selectedDate.slice(0,7);renderMain();root.querySelector("[data-calendar-close]")?.focus();});
  const closeCalendar=()=>{state.calendarOpen=false;renderMain();root.querySelector("[data-calendar-open]")?.focus();};
  root.querySelector("[data-calendar-close]")?.addEventListener("click",closeCalendar);
  root.querySelector("[data-calendar-dismiss]")?.addEventListener("click",event=>{if(event.target===event.currentTarget)closeCalendar();});
  root.querySelector(".att-calendar")?.addEventListener("keydown",event=>{if(event.key==="Escape")closeCalendar();});
  root.querySelectorAll("[data-calendar-month]").forEach(button=>button.addEventListener("click",async()=>{
    if(state.calendarBusy)return;
    const date=new Date(state.calendarMonth+"-01T12:00:00");date.setMonth(date.getMonth()+Number(button.dataset.calendarMonth));state.calendarMonth=localDate(date).slice(0,7);state.calendarBusy=true;renderMain();
    try{await loadCalendarMonth(state.calendarMonth);}catch(error){state.msg=`<div class="att-msg att-danger">${esc(error.message)}</div>`;}finally{state.calendarBusy=false;renderMain();}
  }));
  root.querySelector("[data-calendar-today]")?.addEventListener("click",()=>{state.selectedDate=todayIso();state.calendarOpen=false;loadData().catch(error=>setMsg(error.message,"danger"));});
  root.querySelectorAll("[data-att-class]").forEach(btn => btn.addEventListener("click", () => { state.selectedClass = btn.dataset.attClass; state.modalStudentId = ""; state.modalMode = "detail"; renderMain(); }));
  root.querySelectorAll("[data-att-date]").forEach(btn => btn.addEventListener("click", () => { state.selectedDate = btn.dataset.attDate; state.calendarOpen = false; state.modalStudentId = ""; state.modalMode = "detail"; if(state.loadedMonth===monthRange().key) renderMain(); else loadData().catch(err => setMsg(err.message || "Lỗi tải dữ liệu", "danger")); }));
  root.querySelector("[data-start-class]")?.addEventListener("click", () => startClassAttendance().catch(err => setMsg(err.message || "Lỗi điểm danh lớp", "danger")));
  root.querySelector("[data-refresh-att]")?.addEventListener("click", () => loadData(true).catch(err => setMsg(err.message || "Lỗi tải lại", "danger")));
  root.querySelector("[data-select-all]")?.addEventListener("change", event => { root.querySelectorAll("[data-select-student]").forEach(item => { item.checked = event.target.checked; }); updateSelection(); });
  root.querySelectorAll("[data-select-student]").forEach(input => input.addEventListener("change", updateSelection));
  root.querySelectorAll("[data-st-status]").forEach(btn => btn.addEventListener("click", () => setStatusForStudent(btn.dataset.studentId, btn.dataset.stStatus).catch(err => setMsg(err.message || "Lỗi cập nhật", "danger"))));
  root.querySelectorAll("[data-clear-attendance]").forEach(btn => btn.addEventListener("click", () => clearAttendanceForStudent(btn.dataset.clearAttendance).catch(err => setMsg(err.message || "Lỗi xóa điểm danh", "danger"))));
  root.querySelectorAll("[data-open-history]").forEach(btn => btn.addEventListener("click", async () => { const id=btn.dataset.openHistory; await ensureStudentHistory(id).catch(err=>setMsg(err.message||"Không tải được lịch sử","danger")); state.modalStudentId = id; state.modalMode = "detail"; renderMain(); }));
  root.querySelectorAll("[data-card-history]").forEach(btn => btn.addEventListener("click", async () => { const id=btn.dataset.cardHistory; await ensureStudentHistory(id).catch(err=>setMsg(err.message||"Không tải được lịch sử","danger")); state.modalStudentId = id; state.modalMode = "detail"; renderMain(); }));
  root.querySelectorAll("[data-card-pay]").forEach(btn => btn.addEventListener("click", async () => { const id=btn.dataset.cardPay; await ensureStudentHistory(id).catch(err=>setMsg(err.message||"Không tải được học phí","danger")); state.modalStudentId = id; state.modalMode = "pay"; renderMain(); }));
  root.querySelectorAll("[data-card-close]").forEach(btn => btn.addEventListener("click", () => closeStudentPeriod(btn.dataset.cardClose).catch(err => setMsg(err.message || "Lỗi chốt tháng", "danger"))));
  root.querySelectorAll("[data-close-modal]").forEach(btn => btn.addEventListener("click", () => { state.modalStudentId = ""; state.modalMode = "detail"; renderMain(); }));
  root.querySelectorAll("[data-modal-mode]").forEach(btn => btn.addEventListener("click", () => { state.modalMode = btn.dataset.modalMode || "detail"; renderMain(); }));
  root.querySelectorAll("[data-edit-attendance]").forEach(btn => btn.addEventListener("click", () => { state.editRecordId = btn.dataset.editAttendance; state.modalMode = "editAttendance"; renderMain(); }));
  root.querySelectorAll("[data-delete-attendance]").forEach(btn => btn.addEventListener("click", () => deleteAttendanceRecord(btn.dataset.deleteAttendance).catch(err => setMsg(err.message || "Không xóa được điểm danh", "danger"))));
  root.querySelector("[data-cancel-edit-attendance]")?.addEventListener("click", () => { state.editRecordId = ""; state.modalMode = "detail"; renderMain(); });
  root.querySelector("[data-edit-attendance-form]")?.addEventListener("submit", event => { event.preventDefault(); saveEditedAttendance(event.currentTarget).catch(err => setMsg(err.message || "Không sửa được điểm danh", "danger")); });
  root.querySelector("[data-payment-amount]")?.addEventListener("input", event => { event.currentTarget.value = formatMoneyInput(event.currentTarget.value); });
  root.querySelector("[data-confirm-payment]")?.addEventListener("click", async btn => {
    const input = root.querySelector("[data-payment-amount]");
    try {
      const bill = await payBill(btn.currentTarget.dataset.confirmPayment, input?.value, { silent: true });
      state.modalMode = "detail";
      setMsg(`Đã thu ${formatMoney(bill.amount)} của ${bill.studentName || "học sinh"}.`);
    } catch (err) { setPaymentFeedback(root, err.message || "Lỗi thu tiền", "error"); }
  });
  root.querySelector("[data-download-bill-image]")?.addEventListener("click", btn => {
    try {
      downloadBillImage(btn.currentTarget.dataset.downloadBillImage, root.querySelector("[data-payment-amount]")?.value);
      setPaymentFeedback(root, "Đã tạo và tải ảnh bill.");
    } catch (err) { setPaymentFeedback(root, err.message || "Lỗi tải ảnh", "error"); }
  });
  root.querySelector("[data-copy-bill-image]")?.addEventListener("click", async event => {
    const btn = event.currentTarget;
    const original = btn.textContent;
    try {
      btn.classList.add("is-busy");
      await copyBillImage(btn.dataset.copyBillImage, root.querySelector("[data-payment-amount]")?.value);
      btn.textContent = "Đã copy ảnh";
      setPaymentFeedback(root, "Đã copy ảnh. Có thể dán trực tiếp vào Zalo.");
      setTimeout(() => { if (btn.isConnected) btn.textContent = original; }, 1800);
    } catch (err) { setPaymentFeedback(root, err.message || "Lỗi copy ảnh", "error"); }
    finally { btn.classList.remove("is-busy"); }
  });
  root.querySelector("[data-close-period]")?.addEventListener("click", () => closeSelectedPeriod().catch(err => setMsg(err.message || "Lỗi chốt tháng", "danger")));
  root.querySelector("[data-pay-selected]")?.addEventListener("click", () => paySelectedStudents().catch(err => setMsg(err.message || "Lỗi thu tiền", "danger")));
}

export const AttendancePage = {
  title: "Điểm danh",
  theme: "gv",
  render() { return `<div id="attendance-root">${renderSkeleton()}</div>`; },
  afterRender() {
    loadData().catch(err => {
      state.loading = false;
      state.msg = `<div class="att-msg att-danger">${esc(err.message || err)}</div>`;
      renderMain();
    });
  }
};
