/**
 * QUẢN LÝ ACC NGỌC RỒNG (v6)
 * Dán toàn bộ vào Extensions > Apps Script (thay code cũ), lưu, chạy setupSheet() 1 lần.
 */

const SHEET_NAME = 'Accounts';
const LOAI_ACC = ['Nick Zin', 'Nick Win DT', 'Nick R11', 'Nick Buff'];
const BAO_MAT = ['Liên kết số', 'Liên kết Gmail', 'Cả 2', 'Chưa có gì'];
const HANH_TINH = ['Trái Đất', 'Namek', 'Xayda'];
const HEADERS = ['STT', 'Tài khoản', 'Mật khẩu', 'Tên nhân vật', 'Hành tinh', 'Server',
                 'Loại acc', 'Bảo mật', 'Số ngọc', 'Sức mạnh', 'Nhiệm vụ', 'Phụ kiện',
                 'Giá trị acc', 'Lợi nhuận'];

// Vị trí cột (bắt đầu từ 1)
const COL = { STT: 1, TK: 2, MK: 3, TEN: 4, HT: 5, SV: 6, LOAI: 7, BM: 8, NGOC: 9, SM: 10, NV: 11, PK: 12, GT: 13, LN: 14 };

// Định dạng che mật khẩu: hiện ******** trong ô, bấm vào ô mới thấy mật khẩu thật
const MASK_FORMAT = '"********";"********";"********";"********"';

// màu: [nền, chữ]
const MAU_LOAI = {
  'Nick Zin':    ['#e8f0fe', '#1a73e8'],
  'Nick Win DT': ['#fce8e6', '#c5221f'],
  'Nick R11':    ['#fef7e0', '#b06000'],
  'Nick Buff':   ['#e6f4ea', '#137333']
};
const MAU_BAO_MAT = {
  'Cả 2':           ['#e6f4ea', '#137333'],
  'Liên kết số':    ['#e8f0fe', '#1a73e8'],
  'Liên kết Gmail': ['#fef7e0', '#b06000'],
  'Chưa có gì':     ['#fce8e6', '#c5221f']
};
const MAU_HANH_TINH = {
  'Trái Đất': ['#e8f0fe', '#1a73e8'],
  'Namek':    ['#e6f4ea', '#137333'],
  'Xayda':    ['#f3e8fd', '#8430ce']
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🐉 Ngọc Rồng')
    .addItem('➕ Thêm acc', 'openForm')
    .addItem('📥 Nhập hàng loạt (tk|mk)', 'openBulk')
    .addItem('📤 Xuất tài khoản', 'openExport')
    .addItem('📊 Làm mới tổng quan & biểu đồ', 'refreshDashboard')
    .addSeparator()
    .addItem('🛠 Tạo / làm mới định dạng sheet', 'setupSheet')
    .addToUi();
}

/** Tạo sheet + định dạng đẹp (không xoá dữ liệu) */
function setupSheet() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);

  const nCol = HEADERS.length;
  const needCols = 26; // đủ chỗ cho bảng + vùng tổng quan/biểu đồ bên phải
  if (sh.getMaxColumns() < needCols) sh.insertColumnsAfter(sh.getMaxColumns(), needCols - sh.getMaxColumns());
  const maxRows = sh.getMaxRows();
  const body = maxRows - 1;

  // Dọn định dạng cũ (bộ lọc, màu xen kẽ, dropdown, format) để tránh lệch cột
  const oldFilter = sh.getFilter();
  if (oldFilter) oldFilter.remove();
  sh.getBandings().forEach(b => b.remove());
  const full = sh.getRange(1, 1, maxRows, sh.getMaxColumns());
  full.clearDataValidations();
  full.clearFormat();
  sh.setConditionalFormatRules([]);

  // Header
  sh.getRange(1, 1, 1, nCol)
    .setValues([HEADERS])
    .setBackground('#f4811f')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sh.setRowHeight(1, 36);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);

  // Phần thân
  sh.getRange(2, 1, body, nCol).setVerticalAlignment('middle').setWrap(true).setFontSize(10);

  // Text thuần (giữ số 0 đầu, không bị hiểu là công thức), riêng cột tiền/ngọc là số
  sh.getRange(2, COL.TK, body, nCol - 1).setNumberFormat('@');
  sh.getRange(2, COL.NGOC, body, 1).setNumberFormat('#,##0');
  sh.getRange(2, COL.GT, body, 2).setNumberFormat('#,##0');   // giá trị acc + lợi nhuận
  sh.getRange(2, COL.MK, body, 1).setNumberFormat(MASK_FORMAT); // che mật khẩu bằng ********

  // Căn lề
  sh.getRange(2, COL.STT, body, 1).setHorizontalAlignment('center');
  sh.getRange(2, COL.HT, body, 4).setHorizontalAlignment('center');   // hành tinh, server, loại acc, bảo mật
  sh.getRange(2, COL.NGOC, body, 1).setHorizontalAlignment('right');
  sh.getRange(2, COL.GT, body, 2).setHorizontalAlignment('right');

  // Dropdown
  const dropdown = (col, list) => sh.getRange(2, col, body, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build());
  dropdown(COL.HT, HANH_TINH);
  dropdown(COL.LOAI, LOAI_ACC);
  dropdown(COL.BM, BAO_MAT);

  // Màu xen kẽ
  sh.getRange(1, 1, maxRows, nCol)
    .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor('#f4811f')
    .setFirstRowColor('#ffffff')
    .setSecondRowColor('#f8f9fa');

  // Viền
  sh.getRange(1, 1, maxRows, nCol)
    .setBorder(true, true, true, true, true, true, '#dadce0', SpreadsheetApp.BorderStyle.SOLID);

  // Độ rộng cột
  [50, 150, 130, 150, 100, 80, 110, 120, 110, 120, 160, 220, 120, 120]
    .forEach((w, i) => sh.setColumnWidth(i + 1, w));

  // Tô màu theo giá trị
  const rules = [];
  const addRules = (col, map) => {
    const range = sh.getRange(2, col, body, 1);
    Object.keys(map).forEach(k => rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(k)
        .setBackground(map[k][0]).setFontColor(map[k][1]).setBold(true)
        .setRanges([range]).build()));
  };
  addRules(COL.HT, MAU_HANH_TINH);
  addRules(COL.LOAI, MAU_LOAI);
  addRules(COL.BM, MAU_BAO_MAT);

  // Lợi nhuận: lời = xanh, lỗ = đỏ
  const lnRange = sh.getRange(2, COL.LN, body, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(0).setFontColor('#137333').setBold(true).setRanges([lnRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(0).setFontColor('#c5221f').setBold(true).setRanges([lnRange]).build());
  sh.setConditionalFormatRules(rules);

  // Bộ lọc
  sh.getRange(1, 1, maxRows, nCol).createFilter();

  buildDashboard_(sh);

  ss.setActiveSheet(sh);
  ss.toast('Sheet "' + SHEET_NAME + '" đã sẵn sàng 🐉');
}

/* ===================== FORM THÊM ACC ===================== */

/** Mở form nhập (dạng hộp thoại, rộng hơn sidebar) */
function openForm() {
  const opt = arr => arr.map(v => '<option>' + v + '</option>').join('');
  const html = FORM_HTML
    .replace('{{LOAI}}', opt(LOAI_ACC))
    .replace('{{BAOMAT}}', opt(BAO_MAT))
    .replace('{{HANHTINH}}', opt(HANH_TINH));
  SpreadsheetApp.getUi().showModelessDialog(
    HtmlService.createHtmlOutput(html).setWidth(560).setHeight(590),
    '🐉 Thêm acc Ngọc Rồng');
}

/** Đổi chuỗi "1.500.000" / "1,500,000" / "-200000" thành số; rỗng thì trả ''. */
function toNum_(s) {
  const t = String(s == null ? '' : s).replace(/[.,\s]/g, '');
  if (t === '' || isNaN(Number(t))) return '';
  return Number(t);
}

/** Nhận dữ liệu từ form, ghi vào sheet */
function addAccount(d) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { setupSheet(); sh = ss.getSheetByName(SHEET_NAME); }

  // Check trùng tài khoản
  const last = lastDataRow_(sh);
  if (last > 1) {
    const tks = sh.getRange(2, COL.TK, last - 1, 1).getValues().flat().map(String);
    if (tks.indexOf(String(d.tk)) !== -1) {
      return { ok: false, msg: 'Tài khoản "' + d.tk + '" đã có trong sheet rồi!' };
    }
  }

  const row = last + 1;
  sh.getRange(row, 1, 1, HEADERS.length).setValues([[
    row - 1, d.tk, /^\d+$/.test(d.mk) ? "'" + d.mk : d.mk, d.tenNV, d.hanhTinh, d.server,
    d.loai, d.baoMat,
    toNum_(d.ngoc) || 0,
    d.sucManh, d.nhiemVu, d.phuKien,
    toNum_(d.giaTri),      // giá trị acc (tiền đã bỏ ra)
    toNum_(d.loiNhuan)     // lợi nhuận (để trống nếu chưa bán)
  ]]);
  return { ok: true, msg: 'Đã thêm acc "' + d.tk + '" (dòng ' + row + ')' };
}

const FORM_HTML = `
<style>
  body{font-family:Arial,sans-serif;padding:14px 18px;color:#222}
  .row{display:flex;gap:12px}
  .row>div{flex:1;min-width:0}
  label{display:block;font-size:12px;font-weight:bold;margin:10px 0 3px}
  input,select,textarea{width:100%;box-sizing:border-box;padding:7px;border:1px solid #ccc;border-radius:6px;font-size:13px}
  input:focus,select:focus,textarea:focus{outline:none;border-color:#f4811f}
  button{margin-top:16px;width:100%;padding:10px;background:#f4811f;color:#fff;border:0;border-radius:6px;font-size:14px;font-weight:bold;cursor:pointer}
  button:disabled{opacity:.6;cursor:default}
  #msg{margin-top:10px;font-size:13px;font-weight:bold}
</style>

<div class="row">
  <div><label>Tài khoản *</label><input id="tk" autocomplete="off"></div>
  <div><label>Mật khẩu *</label><input id="mk" autocomplete="off"></div>
</div>
<div class="row">
  <div><label>Tên nhân vật</label><input id="tenNV" autocomplete="off"></div>
  <div><label>Server</label><input id="server" placeholder="vd: 1"></div>
</div>
<div class="row">
  <div><label>Hành tinh</label><select id="hanhTinh">{{HANHTINH}}</select></div>
  <div><label>Loại acc</label><select id="loai">{{LOAI}}</select></div>
</div>
<div class="row">
  <div><label>Bảo mật</label><select id="baoMat">{{BAOMAT}}</select></div>
  <div><label>Số ngọc hiện có</label><input id="ngoc" inputmode="numeric" placeholder="vd: 1500"></div>
</div>
<div class="row">
  <div><label>Sức mạnh</label><input id="sucManh" placeholder="vd: 25 tỷ"></div>
  <div><label>Nhiệm vụ</label><input id="nhiemVu" placeholder="vd: NV 20 / Đã xong"></div>
</div>
<div class="row">
  <div><label>Giá trị acc (tiền đã bỏ ra)</label><input id="giaTri" inputmode="numeric" placeholder="vd: 500000"></div>
  <div><label>Lợi nhuận (nếu đã bán)</label><input id="loiNhuan" inputmode="numeric" placeholder="để trống nếu chưa bán"></div>
</div>
<label>Phụ kiện</label><textarea id="phuKien" rows="2" placeholder="vd: Pet, cải trang, cờ..."></textarea>
<button id="btn" onclick="save()">Lưu acc</button>
<div id="msg"></div>

<script>
  var ids = ['tk','mk','tenNV','server','hanhTinh','loai','baoMat','ngoc','sucManh','nhiemVu','giaTri','loiNhuan','phuKien'];
  var clearIds = ['tk','mk','tenNV','ngoc','sucManh','nhiemVu','giaTri','loiNhuan','phuKien']; // giữ lại server/hành tinh/loại/bảo mật cho nhập nhanh
  function show(t, c){ var m = document.getElementById('msg'); m.textContent = t; m.style.color = c; }
  function save(){
    var d = {};
    ids.forEach(function(i){ d[i] = document.getElementById(i).value.trim(); });
    if(!d.tk || !d.mk){ show('Nhập tài khoản và mật khẩu đã nhé', '#c5221f'); return; }
    var btn = document.getElementById('btn');
    btn.disabled = true; show('Đang lưu...', '#555');
    google.script.run
      .withSuccessHandler(function(r){
        btn.disabled = false;
        if(r.ok){
          clearIds.forEach(function(i){ document.getElementById(i).value=''; });
          document.getElementById('tk').focus();
          show('✅ ' + r.msg, '#137333');
        } else show('⚠️ ' + r.msg, '#c5221f');
      })
      .withFailureHandler(function(e){ btn.disabled = false; show('Lỗi: ' + e.message, '#c5221f'); })
      .addAccount(d);
  }
</script>
`;

/* ===================== XUẤT TÀI KHOẢN ===================== */

/** Mở hộp thoại xuất tài khoản dạng tk/mk/serverN */
function openExport() {
  const opts = ['Tất cả'].concat(LOAI_ACC).map(v => '<option>' + v + '</option>').join('');
  SpreadsheetApp.getUi().showModelessDialog(
    HtmlService.createHtmlOutput(EXPORT_HTML.replace('{{LOAI}}', opts)).setWidth(460).setHeight(460),
    '📤 Xuất tài khoản');
}

/** Trả về danh sách "tk/mk/serverN", mỗi acc 1 dòng, có lọc theo loại acc */
function getExportText(loai) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const last = sh ? lastDataRow_(sh) : 0;
  if (last < 2) return { text: '', count: 0 };
  const data = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const lines = data
    .filter(r => r[COL.TK - 1] !== '' && (loai === 'Tất cả' || r[COL.LOAI - 1] === loai))
    .map(r => {
      let sv = String(r[COL.SV - 1]).trim();
      if (/^\d+$/.test(sv)) sv = 'server' + sv;   // nhập "1" -> "server1"
      return r[COL.TK - 1] + '/' + r[COL.MK - 1] + (sv ? '/' + sv : '');
    });
  return { text: lines.join('\n'), count: lines.length };
}

const EXPORT_HTML = `
<style>
  body{font-family:Arial,sans-serif;padding:14px 18px;color:#222}
  label{display:block;font-size:12px;font-weight:bold;margin-bottom:4px}
  select,textarea{width:100%;box-sizing:border-box;padding:7px;border:1px solid #ccc;border-radius:6px;font-size:13px}
  textarea{margin-top:10px;font-family:Consolas,monospace;resize:vertical}
  button{margin-top:12px;width:100%;padding:10px;background:#f4811f;color:#fff;border:0;border-radius:6px;font-size:14px;font-weight:bold;cursor:pointer}
  #info{margin-top:8px;font-size:13px;color:#555}
</style>
<label>Lọc theo loại acc</label>
<select id="loai" onchange="load()">{{LOAI}}</select>
<textarea id="out" rows="12" readonly></textarea>
<div id="info"></div>
<button onclick="copyAll()">📋 Copy tất cả</button>
<script>
  function load(){
    document.getElementById('info').textContent = 'Đang tải...';
    google.script.run.withSuccessHandler(function(r){
      document.getElementById('out').value = r.text;
      document.getElementById('info').textContent = r.count + ' acc';
    }).getExportText(document.getElementById('loai').value);
  }
  function copyAll(){
    var t = document.getElementById('out');
    t.select(); document.execCommand('copy');
    document.getElementById('info').textContent = '✅ Đã copy ' + (t.value ? t.value.split('\\n').length : 0) + ' acc';
  }
  load();
</script>
`;

/* ===================== TỔNG QUAN + BIỂU ĐỒ ===================== */

/** Vẽ lại bảng tổng quan + biểu đồ ở bên phải bảng (từ cột P) */
function refreshDashboard() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sh) { setupSheet(); return; }
  buildDashboard_(sh);
  SpreadsheetApp.getActive().toast('Đã làm mới tổng quan 📊');
}

function buildDashboard_(sh) {
  const P = 16; // cột P
  const L = n => String.fromCharCode(64 + n);
  const rng = c => '$' + L(c) + '$2:$' + L(c);
  const rGT = rng(COL.GT), rLN = rng(COL.LN), rLoai = rng(COL.LOAI), rTK = rng(COL.TK);
  const n = LOAI_ACC.length;
  const MONEY = '#,##0';
  const MONEY_RED = '#,##0;[Red]-#,##0';

  // Dọn vùng cũ
  sh.getCharts().forEach(c => sh.removeChart(c));
  sh.getRange(1, P, 40, 3).clear();

  // Tiêu đề
  sh.getRange(1, P, 1, 3).merge().setValue('📊 TỔNG QUAN')
    .setBackground('#f4811f').setFontColor('#ffffff').setFontWeight('bold')
    .setFontSize(11).setHorizontalAlignment('center').setVerticalAlignment('middle');

  // Số liệu tổng
  sh.getRange(2, P, 4, 1).setValues([['Tổng vốn bỏ ra'], ['Tổng lợi nhuận'], ['Số acc'], ['Acc đã bán']]);
  sh.getRange(2, P + 1, 4, 1).setFormulas([
    ['=SUM(' + rGT + ')'],
    ['=SUM(' + rLN + ')'],
    ['=COUNTA(' + rTK + ')'],
    ['=COUNT(' + rLN + ')']
  ]);
  sh.getRange(2, P, 4, 1).setFontWeight('bold');
  sh.getRange(2, P + 1, 4, 1).setHorizontalAlignment('right').setFontWeight('bold');
  sh.getRange(2, P + 1, 1, 1).setNumberFormat(MONEY);
  sh.getRange(3, P + 1, 1, 1).setNumberFormat(MONEY_RED);

  // Bảng theo loại acc
  sh.getRange(7, P, 1, 3).setValues([['Loại acc', 'Vốn bỏ ra', 'Lợi nhuận']])
    .setBackground('#fde8d3').setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(8, P, n, 1).setValues(LOAI_ACC.map(l => [l]));
  sh.getRange(8, P + 1, n, 2).setFormulas(LOAI_ACC.map((l, i) => {
    const r = 8 + i;
    // SUMPRODUCT chỉ có 1 tham số nên không bị lỗi dấu , / ; theo ngôn ngữ của sheet
    return [
      '=SUMPRODUCT((' + rLoai + '=$P' + r + ')*' + rGT + ')',
      '=SUMPRODUCT((' + rLoai + '=$P' + r + ')*' + rLN + ')'
    ];
  }));
  sh.getRange(8, P + 1, n, 1).setNumberFormat(MONEY);
  sh.getRange(8, P + 2, n, 1).setNumberFormat(MONEY_RED);
  sh.getRange(8, P + 1, n, 2).setHorizontalAlignment('right');

  // Viền + độ rộng
  sh.getRange(1, P, 7 + n, 3)
    .setBorder(true, true, true, true, true, true, '#dadce0', SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidth(15, 30);
  sh.setColumnWidth(P, 150);
  sh.setColumnWidth(P + 1, 130);
  sh.setColumnWidth(P + 2, 130);

  // Biểu đồ cột: vốn bỏ ra vs lợi nhuận theo loại acc
  const chart = sh.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sh.getRange(7, P, n + 1, 3))
    .setNumHeaders(1)
    .setPosition(8 + n + 1, P, 0, 0)
    .setOption('title', 'Vốn bỏ ra vs Lợi nhuận theo loại acc')
    .setOption('width', 520)
    .setOption('height', 300)
    .setOption('colors', ['#f4811f', '#34a853'])
    .setOption('legend', { position: 'top' })
    .setOption('vAxis', { format: '#,##0' })
    .build();
  sh.insertChart(chart);
}

/* ===================== NHẬP HÀNG LOẠT ===================== */

/** Dòng cuối có tài khoản (chỉ xét cột Tài khoản, không bị vùng tổng quan bên phải làm lệch) */
function lastDataRow_(sh) {
  const vals = sh.getRange(1, COL.TK, sh.getMaxRows(), 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (vals[i][0] !== '') return i + 1;
  }
  return 1;
}

/** Mở hộp thoại dán danh sách tk|mk */
function openBulk() {
  SpreadsheetApp.getUi().showModelessDialog(
    HtmlService.createHtmlOutput(BULK_HTML).setWidth(540).setHeight(470),
    '📥 Nhập hàng loạt (tk|mk)');
}

/** Nhận text nhiều dòng "tk|mk", chỉ ghi vào STT + Tài khoản + Mật khẩu */
function addBulk(text) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { setupSheet(); sh = ss.getSheetByName(SHEET_NAME); }

  const last = lastDataRow_(sh);
  const seen = {};
  if (last > 1) {
    sh.getRange(2, COL.TK, last - 1, 1).getValues().flat()
      .forEach(v => { if (v !== '') seen[String(v).trim()] = true; });
  }

  const rows = [];
  let dup = 0, bad = 0;
  String(text || '').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line) return;
    const i = line.indexOf('|');
    if (i < 0) { bad++; return; }
    const tk = line.slice(0, i).trim();
    const mk = line.slice(i + 1).trim();
    if (!tk || !mk) { bad++; return; }
    if (seen[tk]) { dup++; return; }
    seen[tk] = true;
    rows.push([tk, /^\d+$/.test(mk) ? "'" + mk : mk]);
  });

  if (rows.length) {
    const start = last + 1;
    sh.getRange(start, 1, rows.length, 3)
      .setValues(rows.map((r, k) => [start + k - 1, r[0], r[1]]));
  }
  return { added: rows.length, dup: dup, bad: bad };
}

const BULK_HTML = `
<style>
  body{font-family:Arial,sans-serif;padding:14px 18px;color:#222}
  label{display:block;font-size:12px;font-weight:bold;margin-bottom:6px}
  textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:13px;font-family:Consolas,monospace;resize:vertical}
  textarea:focus{outline:none;border-color:#f4811f}
  button{margin-top:12px;width:100%;padding:10px;background:#f4811f;color:#fff;border:0;border-radius:6px;font-size:14px;font-weight:bold;cursor:pointer}
  button:disabled{opacity:.6;cursor:default}
  #info{margin-top:6px;font-size:12px;color:#555}
  #msg{margin-top:10px;font-size:13px;font-weight:bold}
</style>
<label>Dán danh sách, mỗi dòng 1 acc dạng: tài khoản|mật khẩu</label>
<textarea id="txt" rows="14" oninput="count()" placeholder="abc@gmail.com|matkhau123&#10;user2|matkhau456"></textarea>
<div id="info">0 dòng</div>
<button id="btn" onclick="save()">💾 Lưu tất cả</button>
<div id="msg"></div>

<script>
  function show(t, c){ var m = document.getElementById('msg'); m.textContent = t; m.style.color = c; }
  function count(){
    var n = document.getElementById('txt').value.split('\\n').filter(function(l){ return l.trim(); }).length;
    document.getElementById('info').textContent = n + ' dòng';
  }
  function save(){
    var v = document.getElementById('txt').value;
    if(!v.trim()){ show('Dán danh sách vào đã nhé', '#c5221f'); return; }
    var btn = document.getElementById('btn');
    btn.disabled = true; show('Đang lưu...', '#555');
    google.script.run
      .withSuccessHandler(function(r){
        btn.disabled = false;
        var t = '✅ Đã thêm ' + r.added + ' acc';
        if(r.dup) t += ' · bỏ qua ' + r.dup + ' acc trùng';
        if(r.bad) t += ' · ' + r.bad + ' dòng sai định dạng';
        if(r.added){ document.getElementById('txt').value = ''; count(); }
        show(t, r.added ? '#137333' : '#c5221f');
      })
      .withFailureHandler(function(e){ btn.disabled = false; show('Lỗi: ' + e.message, '#c5221f'); })
      .addBulk(v);
  }
</script>
`;

/** API cho Auto_Account: cap nhat mat khau vao cot B/C. */
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action !== 'updatePassword' || !body.username || !body.password) {
      return jsonResponse_({ ok: false, message: 'Missing action, username or password' });
    }
    if (String(body.password).length > 15) {
      return jsonResponse_({ ok: false, message: 'Password exceeds website limit' });
    }
    const sh = SpreadsheetApp.openById('1yYwRzNuU0CUdvMToieKfYNkYzOqwJTuW9vAlVc26yD0').getSheetByName(SHEET_NAME);
    if (!sh) return jsonResponse_({ ok: false, message: 'Sheet not found' });
    const last = lastDataRow_(sh);
    if (last < 2) return jsonResponse_({ ok: false, message: 'No accounts' });
    const normalize = value => String(value == null ? '' : value).trim().toLowerCase();
    const usernames = sh.getRange(2, COL.TK, last - 1, 1).getDisplayValues().flat();
    const index = usernames.findIndex(v => normalize(v) === normalize(body.username));
    const value = /^\d+$/.test(String(body.password)) ? "'" + body.password : String(body.password);
    if (index < 0) {
      const row = last + 1;
      sh.getRange(row, 1, 1, 3).setValues([[row - 1, String(body.username).trim(), value]]);
      sh.getRange(row, COL.TK).setNumberFormat('@');
      sh.getRange(row, COL.MK).setNumberFormat(MASK_FORMAT);
      return jsonResponse_({ ok: true, created: true, row: row, username: body.username });
    }
    const row = index + 2;
    sh.getRange(row, COL.MK).setNumberFormat(MASK_FORMAT).setValue(value);
    return jsonResponse_({ ok: true, created: false, row: row, username: body.username });
  } catch (err) {
    return jsonResponse_({ ok: false, message: err.message || String(err) });
  }
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
