const { useEffect, useMemo, useRef, useState } = React;

const db = new Dexie('carLifeManagerDB');
db.version(1).stores({
  vehicles: '++id, name, plate, year, currentMileage, displacementCc, currentTireType, updatedAt',
  maintenances: '++id, vehicleId, category, status, reservationDate, doneDate, nextDate, cost, createdAt',
  fuelLogs: '++id, vehicleId, date, odometer, liters, total, kmpl, createdAt',
  tireLogs: '++id, vehicleId, date, type, action, treadDepth, cost, createdAt',
  memos: '++id, vehicleId, date, tag, important, createdAt',
  categories: '++id, name, isDefault',
  contacts: '++id, type, name, phone, is24h',
  settings: 'key'
});

db.version(2).stores({
  vehicles: '++id, name, plate, year, currentMileage, displacementCc, currentTireType, updatedAt',
  maintenances: '++id, vehicleId, category, status, reservationDate, doneDate, nextDate, cost, createdAt',
  fuelLogs: '++id, vehicleId, date, odometer, liters, total, unitPrice, kmpl, createdAt',
  tireLogs: '++id, vehicleId, date, type, action, treadDepth, cost, createdAt',
  memos: '++id, vehicleId, date, tag, important, createdAt',
  categories: '++id, name, isDefault',
  contacts: '++id, type, name, phone, is24h',
  shops: '++id, name, phone, person, updatedAt',
  settings: 'key'
});

db.version(3).stores({
  vehicles: '++id, name, plate, year, currentMileage, displacementCc, currentTireType, updatedAt',
  maintenances: '++id, vehicleId, category, status, reservationDate, doneDate, nextDate, cost, createdAt',
  fuelLogs: '++id, vehicleId, date, odometer, liters, total, unitPrice, kmpl, createdAt',
  tireLogs: '++id, vehicleId, date, type, action, treadDepth, cost, createdAt',
  memos: '++id, vehicleId, date, tag, important, createdAt',
  categories: '++id, name, isDefault',
  contacts: '++id, type, name, phone, is24h',
  shops: '++id, name, phone, person, updatedAt',
  insuranceContacts: '++id, role, name, phone, updatedAt',
  insurances: '++id, vehicleId, type, endDate, createdAt',
  settings: 'key'
});

const APP_TABS = [
  { key: 'dashboard', label: 'ホーム', icon: '🏠' },
  { key: 'vehicleInfo', label: '車両情報', icon: '📋' },
  { key: 'vehicles', label: '車両登録', icon: '🚗' },
  { key: 'maintenance', label: '整備', icon: '🛠️' },
  { key: 'insurance', label: '保険', icon: '🛡️' },
  { key: 'fuel', label: '燃費', icon: '⛽' },
  { key: 'calendar', label: 'カレンダー', icon: '🗓️' },
  { key: 'settings', label: '設定', icon: '⚙️' }
];

const TAX_TABLE = [
  { max: 1000, tax: 29500 },
  { max: 1500, tax: 34500 },
  { max: 2000, tax: 39500 },
  { max: 2500, tax: 45000 },
  { max: 3000, tax: 51000 },
  { max: 3500, tax: 58000 },
  { max: 4000, tax: 66500 },
  { max: 4500, tax: 76500 },
  { max: 6000, tax: 88000 },
  { max: Infinity, tax: 111000 }
];

const INITIAL_CATEGORIES = ['オイル交換', 'タイヤ交換', '点検', '車検', '洗車', 'バッテリー', 'NOJメンテナンス'];
const MEMO_TAGS = ['異音', '振動', '警告灯', '燃費', '外観', 'その他'];
const MAINTENANCE_FILTERS_KEY = 'maintenanceSavedFilters';
const FUEL_FILTERS_KEY = 'fuelSavedFilters';
const APP_TAB_KEY = 'carManagerActiveTab';
const IMAGE_QUALITY_KEY = 'imageCompressionQuality';
const IMAGE_MAX_SIZE_KEY = 'imageCompressionMaxSize';
const MAINTENANCE_IMAGE_LIMIT_KEY = 'maintenanceImageLimit';

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('ja-JP');
}

function toYmd(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getDateRangeByPreset(presetKey) {
  const now = new Date();
  const end = toYmd(now);

  if (presetKey === 'thisMonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toYmd(start), to: end };
  }

  const monthSpanMap = { m3: 3, m6: 6, y1: 12 };
  const months = monthSpanMap[presetKey];
  if (!months) return { from: '', to: '' };

  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  return { from: toYmd(start), to: end };
}

function daysUntil(dateStr) {
  if (!dateStr) return 9999;
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return 9999;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function alertClass(days) {
  if (days <= 7) return 'bg-red-100 text-red-700 border-red-300';
  if (days <= 30) return 'bg-orange-100 text-orange-700 border-orange-300';
  if (days <= 60) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
  return 'bg-green-100 text-green-700 border-green-300';
}

function taxByCc(cc) {
  const n = Number(cc || 0);
  const row = TAX_TABLE.find((t) => n <= t.max);
  return row ? row.tax : 0;
}

async function compressImage(file, maxSize = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
    };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxSize) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      } else if (height > maxSize) {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('画像圧縮失敗'));
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function preprocessReceiptImage(file, targetWidth = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target.result;
    };
    reader.onerror = reject;

    img.onload = () => {
      const scale = targetWidth / Math.max(1, img.width);
      const width = Math.min(targetWidth, img.width);
      const height = Math.max(1, Math.round(img.height * (img.width > targetWidth ? scale : 1)));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('画像処理コンテキスト取得失敗'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round((data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114));
        const boosted = gray < 140 ? Math.max(0, gray - 18) : Math.min(255, gray + 10);
        data[i] = boosted;
        data[i + 1] = boosted;
        data[i + 2] = boosted;
      }
      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('レシート画像前処理に失敗しました'));
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function normalizeReceiptText(text) {
  return String(text || '')
    .replace(/[Ｏ０]/g, '0')
    .replace(/[Ｉｌ]/g, '1')
    .replace(/[，、]/g, ',')
    .replace(/[．]/g, '.')
    .replace(/[￥¥]/g, '¥')
    .replace(/\r/g, '')
    .trim();
}

function parseFuelReceiptOcrText(rawText) {
  const text = normalizeReceiptText(rawText);
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const joined = lines.join('\n');

  const pickNumber = (value) => Number(String(value || '').replace(/,/g, ''));

  let date = '';
  let time = '';
  const dateMatch = joined.match(/(20\d{2})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})\s*日?/);
  if (dateMatch) {
    const y = dateMatch[1];
    const m = String(Number(dateMatch[2])).padStart(2, '0');
    const d = String(Number(dateMatch[3])).padStart(2, '0');
    date = `${y}-${m}-${d}`;
  }
  const timeMatch = joined.match(/([01]?\d|2[0-3])[:：時]\s?([0-5]\d)/);
  if (timeMatch) {
    time = `${String(Number(timeMatch[1])).padStart(2, '0')}:${timeMatch[2]}`;
  }

  let liters = null;
  const litersMatch = joined.match(/(\d{1,3}(?:[\.,]\d{1,3})?)\s*(?:L|ℓ|リットル)/i);
  if (litersMatch) liters = Number(String(litersMatch[1]).replace(',', '.'));

  let unitPrice = null;
  const unitPatterns = [
    /単価\s*[:：]?\s*([0-9]{2,4})\s*円?/,
    /([0-9]{2,4})\s*円\s*[\/／]\s*(?:L|ℓ)/i,
    /(?:L|ℓ)\s*単価\s*([0-9]{2,4})/
  ];
  for (const pattern of unitPatterns) {
    const match = joined.match(pattern);
    if (match) {
      unitPrice = pickNumber(match[1]);
      break;
    }
  }

  let total = null;
  const totalPatterns = [
    /(?:合計|総額|請求額|領収金額)\s*[:：]?\s*[¥]?\s*([0-9,]{3,})\s*円?/,
    /¥\s*([0-9,]{3,})/,
    /([0-9,]{3,})\s*円\s*(?:税込|現計|ご請求)/
  ];
  for (const pattern of totalPatterns) {
    const match = joined.match(pattern);
    if (match) {
      total = pickNumber(match[1]);
      break;
    }
  }

  let station = '';
  const stationLine = lines.find((line) => {
    if (line.length < 2 || line.length > 28) return false;
    if (/\d{2,4}[\/\-.年]\d{1,2}/.test(line)) return false;
    if (/TEL|電話|領収|レシート|No\.?|取引|現金|クレジット|合計|税|給油/i.test(line)) return false;
    return /[ぁ-んァ-ヶ一-龠A-Za-z]/.test(line);
  });
  if (stationLine) station = stationLine;

  const recognizedCount = [date, liters, unitPrice, total, station].filter((v) => v !== '' && v !== null && v !== undefined).length;

  return {
    rawText: text,
    date,
    time,
    liters,
    unitPrice,
    total,
    station,
    recognizedCount
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function blobToDataUrl(blob) {
  if (!blob) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const [meta, base64] = dataUrl.split(',');
  if (!meta || !base64) return null;
  const mime = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/jpeg';
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function toCsv(rows, columns) {
  const header = columns.map((c) => c.label).join(',');
  const body = rows.map((row) => columns.map((c) => {
    const raw = c.value(row);
    const text = raw === null || raw === undefined ? '' : String(raw);
    return `"${text.replace(/"/g, '""')}"`;
  }).join(','));
  return ['\uFEFF' + header, ...body].join('\n');
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return '-';
  const sec = Math.max(0, Math.round(Number(seconds)));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}時間${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

function toCompactDate(ymd) {
  return String(ymd || '').replace(/-/g, '');
}

function addDaysYmd(ymd, days = 0) {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function parseJstToUtcMs(ymd, hm = '09:00') {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  const [hh, mm] = String(hm || '09:00').split(':').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d, (hh || 0) - 9, mm || 0, 0);
}

function formatUtcMsToJstCompact(ms) {
  if (ms === null || ms === undefined) return '';
  const jst = new Date(ms + (9 * 60 * 60 * 1000));
  const yyyy = jst.getUTCFullYear();
  const MM = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(jst.getUTCDate()).padStart(2, '0');
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const mm = String(jst.getUTCMinutes()).padStart(2, '0');
  const ss = String(jst.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${MM}${dd}T${hh}${mm}${ss}`;
}

function toIcsUtcStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function openGoogleCalendarTemplate({ text, details, location, allDay = false, date, time, endTime }) {
  if (!date) return;
  let dates = '';

  if (allDay) {
    dates = `${toCompactDate(date)}/${toCompactDate(addDaysYmd(date, 1))}`;
  } else {
    const startUtcMs = parseJstToUtcMs(date, time || '09:00');
    const endUtcMs = parseJstToUtcMs(date, endTime || '10:00');
    if (startUtcMs === null || endUtcMs === null) return;
    dates = `${formatUtcMsToJstCompact(startUtcMs)}/${formatUtcMsToJstCompact(endUtcMs > startUtcMs ? endUtcMs : (startUtcMs + 60 * 60 * 1000))}`;
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: text || '車管理イベント',
    dates,
    details: details || '',
    location: location || '',
    ctz: 'Asia/Tokyo'
  });

  const url = `https://calendar.google.com/calendar/render?${params.toString()}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function getVehiclePlaceholderSpec(name) {
  const normalized = String(name || '').toLowerCase().replace(/[\s　]/g, '');
  const rules = [
    {
      type: 'kei',
      bgClass: 'bg-sky-200',
      label: '軽自動車',
      keywords: ['n-box', 'nbox', 'ワゴンr', 'タント', 'ムーヴ', 'スペーシア', 'デイズ', 'ルークス', 'ek', 'ｅｋ']
    },
    {
      type: 'sedan',
      bgClass: 'bg-blue-300',
      label: 'セダン',
      keywords: ['プリウス', 'カローラ', 'クラウン', 'インサイト', 'シビック', 'アコード', 'セダン']
    },
    {
      type: 'suv',
      bgClass: 'bg-green-300',
      label: 'SUV',
      keywords: ['ハリアー', 'cx-5', 'cx5', 'rav4', 'フォレスター', 'エクストレイル', 'ヴェゼル', 'ヤリスクロス', 'suv']
    },
    {
      type: 'minivan',
      bgClass: 'bg-purple-300',
      label: 'ミニバン',
      keywords: ['ノア', 'ヴォクシー', 'セレナ', 'ステップワゴン', 'アルファード', 'ヴェルファイア', 'ミニバン']
    }
  ];

  for (const rule of rules) {
    if (rule.keywords.some((kw) => normalized.includes(kw.toLowerCase()))) {
      return { type: rule.type, bgClass: rule.bgClass, label: rule.label };
    }
  }

  return { type: 'generic', bgClass: 'bg-gray-300', label: '汎用車' };
}

function VehiclePlaceholder({ name }) {
  const spec = getVehiclePlaceholderSpec(name);

  return (
    <div className={`w-full h-full flex items-center justify-center ${spec.bgClass}`}>
      <svg viewBox="0 0 220 120" className="w-36 h-20 text-white/90" role="img" aria-label={`${spec.label}シルエット`}>
        {spec.type === 'kei' && (
          <g fill="currentColor">
            <rect x="34" y="48" width="128" height="30" rx="8" />
            <rect x="56" y="34" width="70" height="20" rx="6" />
            <circle cx="66" cy="82" r="12" fill="rgba(255,255,255,0.85)" />
            <circle cx="140" cy="82" r="12" fill="rgba(255,255,255,0.85)" />
          </g>
        )}
        {spec.type === 'sedan' && (
          <g fill="currentColor">
            <path d="M26 72h150c7 0 10-5 8-10l-6-11c-2-3-5-6-9-7l-39-8c-6-1-13-1-19 0l-30 6c-4 1-8 4-10 8l-7 12c-2 4 1 10 7 10z" />
            <circle cx="68" cy="82" r="12" fill="rgba(255,255,255,0.85)" />
            <circle cx="148" cy="82" r="12" fill="rgba(255,255,255,0.85)" />
          </g>
        )}
        {spec.type === 'suv' && (
          <g fill="currentColor">
            <path d="M24 73h156c6 0 10-5 8-10l-5-11c-2-4-6-7-10-8l-27-8c-7-2-14-2-21 0l-33 8c-5 1-9 4-12 9l-8 10c-3 4 0 10 6 10z" />
            <rect x="97" y="35" width="42" height="14" rx="4" fill="rgba(255,255,255,0.4)" />
            <circle cx="64" cy="82" r="12" fill="rgba(255,255,255,0.85)" />
            <circle cx="152" cy="82" r="12" fill="rgba(255,255,255,0.85)" />
          </g>
        )}
        {spec.type === 'minivan' && (
          <g fill="currentColor">
            <path d="M24 72h158c6 0 10-5 9-10l-4-14c-1-5-5-9-11-10l-52-8c-8-1-16 0-23 2l-24 7c-5 1-9 5-11 10l-5 13c-2 5 2 10 8 10z" />
            <rect x="104" y="34" width="54" height="16" rx="4" fill="rgba(255,255,255,0.4)" />
            <circle cx="62" cy="82" r="12" fill="rgba(255,255,255,0.85)" />
            <circle cx="154" cy="82" r="12" fill="rgba(255,255,255,0.85)" />
          </g>
        )}
        {spec.type === 'generic' && (
          <g fill="currentColor">
            <path d="M30 72h152c7 0 10-5 8-10l-6-12c-2-4-6-7-11-8l-36-8c-8-2-16-2-24 0l-30 7c-6 1-10 5-13 10l-7 10c-3 5 1 11 7 11z" />
            <circle cx="66" cy="82" r="12" fill="rgba(255,255,255,0.85)" />
            <circle cx="150" cy="82" r="12" fill="rgba(255,255,255,0.85)" />
          </g>
        )}
      </svg>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function GoogleCalendarButton({ onClick, label = 'Google Calendarに追加', className = '' }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4285F4] text-white text-xs font-semibold hover:bg-[#3367D6] transition ${className}`}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" fill="currentColor" opacity="0.95" />
        <rect x="3" y="8" width="18" height="3" fill="white" opacity="0.95" />
        <rect x="7" y="2" width="2" height="6" rx="1" fill="white" />
        <rect x="15" y="2" width="2" height="6" rx="1" fill="white" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

function App() {
  const [tab, setTab] = useState(() => localStorage.getItem(APP_TAB_KEY) || 'dashboard');
  const [vehicles, setVehicles] = useState([]);
  const [maintenances, setMaintenances] = useState([]);
  const [fuelLogs, setFuelLogs] = useState([]);
  const [tireLogs, setTireLogs] = useState([]);
  const [memos, setMemos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [vehicleManageMode, setVehicleManageMode] = useState('register');
  const [showVehicleRegisterForm, setShowVehicleRegisterForm] = useState(false);
  const [backupReminder, setBackupReminder] = useState('');
  const [shops, setShops] = useState([]);
  const [insuranceContacts, setInsuranceContacts] = useState([]);
  const [insurances, setInsurances] = useState([]);
  const [insuranceContactForm, setInsuranceContactForm] = useState({ role: '保険会社', name: '', phone: '' });
  const [editingInsuranceContactId, setEditingInsuranceContactId] = useState(null);
  const [insuranceContactEditForm, setInsuranceContactEditForm] = useState({ role: '保険会社', name: '', phone: '' });
  const [insuranceForm, setInsuranceForm] = useState({
    vehicleId: '',
    type: '自賠責',
    companyContactId: '',
    companyName: '',
    companyPhone: '',
    agencyContactId: '',
    agencyName: '',
    agencyPhone: '',
    startDate: '',
    endDate: '',
    policyNo: '',
    note: ''
  });
  const [insuranceImageFile, setInsuranceImageFile] = useState(null);
  const [editingInsuranceId, setEditingInsuranceId] = useState(null);
  const [insuranceEditForm, setInsuranceEditForm] = useState({
    vehicleId: '',
    type: '自賠責',
    companyName: '',
    companyPhone: '',
    agencyName: '',
    agencyPhone: '',
    startDate: '',
    endDate: '',
    policyNo: '',
    note: ''
  });
  const [insuranceEditImageFile, setInsuranceEditImageFile] = useState(null);
  const [maintenanceDraft, setMaintenanceDraft] = useState({
    vehicleId: '',
    category: '',
    store: '',
    person: '',
    phone: '',
    shopId: '',
    calendarSync: false,
    nojTicketAction: 'use',
    nojTicketCount: ''
  });
  const [newShopForm, setNewShopForm] = useState({ name: '', phone: '', person: '' });

  const [maintenanceFilterVehicle, setMaintenanceFilterVehicle] = useState('');
  const [maintenanceFilterStatus, setMaintenanceFilterStatus] = useState('');
  const [maintenanceKeyword, setMaintenanceKeyword] = useState('');
  const [maintenanceSortKey, setMaintenanceSortKey] = useState('date-desc');
  const [maintenanceNewCategory, setMaintenanceNewCategory] = useState('');
  const [maintenanceDateFrom, setMaintenanceDateFrom] = useState('');
  const [maintenanceDateTo, setMaintenanceDateTo] = useState('');
  const [maintenancePeriodPreset, setMaintenancePeriodPreset] = useState('');
  const [maintenanceSelectedIds, setMaintenanceSelectedIds] = useState([]);
  const [maintenanceSavedFilters, setMaintenanceSavedFilters] = useState([]);
  const [maintenanceFilterPresetName, setMaintenanceFilterPresetName] = useState('');

  const [fuelFilterVehicle, setFuelFilterVehicle] = useState('');
  const [fuelDateFrom, setFuelDateFrom] = useState('');
  const [fuelDateTo, setFuelDateTo] = useState('');
  const [fuelSortKey, setFuelSortKey] = useState('date-desc');
  const [fuelPeriodPreset, setFuelPeriodPreset] = useState('');
  const [fuelSavedFilters, setFuelSavedFilters] = useState([]);
  const [fuelFilterPresetName, setFuelFilterPresetName] = useState('');

  const [analysisRangePreset, setAnalysisRangePreset] = useState('m6');
  const [imageQuality, setImageQuality] = useState(() => Number(localStorage.getItem(IMAGE_QUALITY_KEY) || 0.7));
  const [imageMaxSize, setImageMaxSize] = useState(() => Number(localStorage.getItem(IMAGE_MAX_SIZE_KEY) || 800));
  const [maintenanceImageLimit, setMaintenanceImageLimit] = useState(() => Number(localStorage.getItem(MAINTENANCE_IMAGE_LIMIT_KEY) || 5));
  const [recompressTarget, setRecompressTarget] = useState('all');
  const [isRecompressing, setIsRecompressing] = useState(false);
  const [recompressPaused, setRecompressPaused] = useState(false);
  const [recompressProgress, setRecompressProgress] = useState({ done: 0, total: 0, startedAt: 0, etaSeconds: null });

  const [memoKeyword, setMemoKeyword] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [pickedDate, setPickedDate] = useState('');
  const [icsExportScope, setIcsExportScope] = useState('all');
  const [icsExportVehicleId, setIcsExportVehicleId] = useState('');

  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [vehicleEditForm, setVehicleEditForm] = useState({
    name: '', plate: '', year: '', currentMileage: '', displacementCc: '', currentTireType: '夏タイヤ',
    tireSummer: '', tireWinter: '', oilViscosity: '', batteryModel: '',
    wiperDriver: '', wiperPassenger: '', wiperRear: '', airFilter: '', brakePad: '',
    taxDue: '', inspectionDue: '',
    taxPaid: false
  });
  const [editingMaintenanceId, setEditingMaintenanceId] = useState(null);
  const [maintenanceEditForm, setMaintenanceEditForm] = useState({
    vehicleId: '', category: '', status: '未予約', reservationDate: '', reservationTime: '',
    store: '', person: '', phone: '', doneDate: '', odometer: '', work: '', cost: '', nextDate: '',
    calendarSync: false, shopId: ''
  });
  const [bulkMaintenanceForm, setBulkMaintenanceForm] = useState({
    category: '', status: '', store: '', person: '', phone: '', nextDate: ''
  });
  const [editingFuelId, setEditingFuelId] = useState(null);
  const [fuelEditForm, setFuelEditForm] = useState({ vehicleId: '', date: '', odometer: '', liters: '', unitPrice: '', total: '', station: '' });
  const [fuelDraft, setFuelDraft] = useState({ vehicleId: '', date: toYmd(), odometer: '', liters: '', unitPrice: '', total: '', station: '' });
  const [fuelReceiptBlob, setFuelReceiptBlob] = useState(null);
  const [fuelReceiptProcessing, setFuelReceiptProcessing] = useState(false);
  const [fuelReceiptOcrResult, setFuelReceiptOcrResult] = useState(null);
  const [fuelOcrMode, setFuelOcrMode] = useState('idle');
  const [fuelOcrMessage, setFuelOcrMessage] = useState('');
  const [editingTireId, setEditingTireId] = useState(null);
  const [tireEditForm, setTireEditForm] = useState({ vehicleId: '', type: '夏タイヤ', action: '履き替え', date: '', odometer: '', shop: '', cost: '', treadDepth: '', note: '' });
  const [editingMemoId, setEditingMemoId] = useState(null);
  const [memoEditForm, setMemoEditForm] = useState({ vehicleId: '', date: '', tag: 'その他', content: '', important: false });

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const fuelUnitPriceChartRef = useRef(null);
  const fuelUnitPriceChartInstance = useRef(null);
  const fuelCostChartRef = useRef(null);
  const fuelCostChartInstance = useRef(null);
  const monthlyCostChartRef = useRef(null);
  const categoryCostChartRef = useRef(null);
  const vehicleCostChartRef = useRef(null);
  const monthlyCostChartInstance = useRef(null);
  const categoryCostChartInstance = useRef(null);
  const vehicleCostChartInstance = useRef(null);
  const recompressPausedRef = useRef(false);
  const fuelCameraInputRef = useRef(null);

  async function loadAll() {
    const [v, m, f, t, me, c, co, s, ic, ins] = await Promise.all([
      db.vehicles.orderBy('updatedAt').reverse().toArray(),
      db.maintenances.orderBy('createdAt').reverse().toArray(),
      db.fuelLogs.orderBy('createdAt').reverse().toArray(),
      db.tireLogs.orderBy('createdAt').reverse().toArray(),
      db.memos.orderBy('createdAt').reverse().toArray(),
      db.categories.toArray(),
      db.contacts.toArray(),
      db.shops.orderBy('name').toArray(),
      db.insuranceContacts.orderBy('name').toArray(),
      db.insurances.orderBy('createdAt').reverse().toArray()
    ]);

    if (!c.length) {
      await db.categories.bulkAdd(INITIAL_CATEGORIES.map((name) => ({ name, isDefault: true })));
      return loadAll();
    }

    if (!c.some((item) => item.name === 'NOJメンテナンス')) {
      await db.categories.add({ name: 'NOJメンテナンス', isDefault: true });
      return loadAll();
    }

    if (!co.length) {
      await db.contacts.bulkAdd([
        { type: '緊急', name: 'JAF', phone: '0570-00-8139', is24h: true },
        { type: '緊急', name: 'ロードサービス', phone: '0120-365-110', is24h: true },
        { type: 'ディーラー', name: 'マイディーラー', phone: '', is24h: false },
        { type: '保険', name: '保険会社 24h', phone: '', is24h: true }
      ]);
      return loadAll();
    }

    setVehicles(v);
    setMaintenances(m);
    setFuelLogs(f);
    setTireLogs(t);
    setMemos(me);
    setCategories(c);
    setContacts(co);
    setShops(s);
    setInsuranceContacts(ic);
    setInsurances(ins);

    if (!selectedVehicleId && v[0]) setSelectedVehicleId(String(v[0].id));
  }

  useEffect(() => {
    loadAll();

    const last = localStorage.getItem('lastBackupAt');
    if (!last) {
      setBackupReminder('初回バックアップを実施してください。');
    } else {
      const diff = Math.floor((Date.now() - Number(last)) / (1000 * 60 * 60 * 24));
      if (diff >= 30) setBackupReminder(`前回バックアップから ${diff} 日経過しています。月1回のバックアップを推奨します。`);
    }

    try {
      const maintenanceRaw = JSON.parse(localStorage.getItem(MAINTENANCE_FILTERS_KEY) || '[]');
      const fuelRaw = JSON.parse(localStorage.getItem(FUEL_FILTERS_KEY) || '[]');
      setMaintenanceSavedFilters(Array.isArray(maintenanceRaw) ? maintenanceRaw : []);
      setFuelSavedFilters(Array.isArray(fuelRaw) ? fuelRaw : []);
    } catch (_) {
      setMaintenanceSavedFilters([]);
      setFuelSavedFilters([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(APP_TAB_KEY, tab);
  }, [tab]);

  useEffect(() => {
    recompressPausedRef.current = recompressPaused;
  }, [recompressPaused]);

  useEffect(() => {
    if (!vehicles.length) return;
    const fallbackVehicleId = selectedVehicleId || String(vehicles[0].id);
    setFuelDraft((prev) => ({
      ...prev,
      vehicleId: prev.vehicleId || String(fallbackVehicleId)
    }));
    setInsuranceForm((prev) => ({
      ...prev,
      vehicleId: prev.vehicleId || String(fallbackVehicleId)
    }));
    setMaintenanceDraft((prev) => ({
      ...prev,
      vehicleId: prev.vehicleId || String(fallbackVehicleId)
    }));
  }, [vehicles, selectedVehicleId]);

  useEffect(() => {
    if (!categories.length) return;
    setMaintenanceDraft((prev) => ({
      ...prev,
      category: prev.category || categories[0].name
    }));
  }, [categories]);

  useEffect(() => {
    const validQuality = [0.5, 0.7, 0.85].includes(Number(imageQuality)) ? Number(imageQuality) : 0.7;
    const validMax = [600, 800, 1200].includes(Number(imageMaxSize)) ? Number(imageMaxSize) : 800;
    const validLimit = [1, 2, 3, 4, 5].includes(Number(maintenanceImageLimit)) ? Number(maintenanceImageLimit) : 5;
    if (validQuality !== Number(imageQuality)) setImageQuality(validQuality);
    if (validMax !== Number(imageMaxSize)) setImageMaxSize(validMax);
    if (validLimit !== Number(maintenanceImageLimit)) setMaintenanceImageLimit(validLimit);
    localStorage.setItem(IMAGE_QUALITY_KEY, String(validQuality));
    localStorage.setItem(IMAGE_MAX_SIZE_KEY, String(validMax));
    localStorage.setItem(MAINTENANCE_IMAGE_LIMIT_KEY, String(validLimit));
  }, [imageQuality, imageMaxSize, maintenanceImageLimit]);

  useEffect(() => {
    const filtered = fuelLogs
      .filter((f) => (selectedVehicleId ? String(f.vehicleId) === String(selectedVehicleId) : true))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!chartRef.current || !filtered.length) return;
    const labels = filtered.map((f) => formatDate(f.date));
    const data = filtered.map((f) => Number(f.kmpl || 0));

    if (chartInstance.current) chartInstance.current.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '実燃費 (km/L)',
          data,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.2)',
          tension: 0.35,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }, [fuelLogs, selectedVehicleId]);

  useEffect(() => {
    if (fuelUnitPriceChartInstance.current) fuelUnitPriceChartInstance.current.destroy();
    if (fuelCostChartInstance.current) fuelCostChartInstance.current.destroy();

    const logs = fuelLogs
      .filter((f) => (fuelFilterVehicle ? String(f.vehicleId) === String(fuelFilterVehicle) : true))
      .filter((f) => {
        const date = f.date || '';
        if (fuelDateFrom && date < fuelDateFrom) return false;
        if (fuelDateTo && date > fuelDateTo) return false;
        return true;
      })
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    if (!logs.length) return;

    const labels = logs.map((f) => formatDate(f.date));

    if (fuelUnitPriceChartRef.current) {
      fuelUnitPriceChartInstance.current = new Chart(fuelUnitPriceChartRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'ガソリン単価 (円/L)',
            data: logs.map((f) => Number(f.unitPrice || 0)),
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245,158,11,0.2)',
            tension: 0.25,
            fill: true
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    if (fuelCostChartRef.current) {
      fuelCostChartInstance.current = new Chart(fuelCostChartRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: '給油料金 (円)',
            data: logs.map((f) => Number(f.total || 0)),
            backgroundColor: 'rgba(79,70,229,0.65)'
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }
  }, [fuelLogs, fuelFilterVehicle, fuelDateFrom, fuelDateTo]);

  useEffect(() => {
    const range = getDateRangeByPreset(analysisRangePreset);
    const inRange = (dateStr) => {
      if (!dateStr) return false;
      if (range.from && dateStr < range.from) return false;
      if (range.to && dateStr > range.to) return false;
      return true;
    };

    const scopedMaintenances = maintenances.filter((m) => {
      const eventDate = m.doneDate || m.reservationDate || '';
      if (!inRange(eventDate)) return false;
      return selectedVehicleId ? String(m.vehicleId) === String(selectedVehicleId) : true;
    });

    const scopedFuelLogs = fuelLogs.filter((f) => {
      if (!inRange(f.date || '')) return false;
      return selectedVehicleId ? String(f.vehicleId) === String(selectedVehicleId) : true;
    });

    const monthTotals = {};
    scopedMaintenances.forEach((m) => {
      const key = (m.doneDate || m.reservationDate || '').slice(0, 7);
      if (!key) return;
      monthTotals[key] = (monthTotals[key] || 0) + Number(m.cost || 0);
    });
    scopedFuelLogs.forEach((f) => {
      const key = (f.date || '').slice(0, 7);
      if (!key) return;
      monthTotals[key] = (monthTotals[key] || 0) + Number(f.total || 0);
    });

    const monthLabels = Object.keys(monthTotals).sort();
    const monthData = monthLabels.map((k) => monthTotals[k]);

    if (monthlyCostChartInstance.current) monthlyCostChartInstance.current.destroy();
    if (monthlyCostChartRef.current) {
      monthlyCostChartInstance.current = new Chart(monthlyCostChartRef.current, {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [{ label: '総維持費(円)', data: monthData, backgroundColor: 'rgba(79,70,229,0.7)' }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    const categoryTotals = {};
    scopedMaintenances.forEach((m) => {
      const key = m.category || '未分類';
      categoryTotals[key] = (categoryTotals[key] || 0) + Number(m.cost || 0);
    });
    const categoryLabels = Object.keys(categoryTotals);
    const categoryData = categoryLabels.map((k) => categoryTotals[k]);

    if (categoryCostChartInstance.current) categoryCostChartInstance.current.destroy();
    if (categoryCostChartRef.current) {
      categoryCostChartInstance.current = new Chart(categoryCostChartRef.current, {
        type: 'doughnut',
        data: {
          labels: categoryLabels,
          datasets: [{
            label: 'カテゴリ費用(円)',
            data: categoryData,
            backgroundColor: ['#6366f1', '#14b8a6', '#22c55e', '#f59e0b', '#f97316', '#06b6d4', '#8b5cf6', '#ec4899']
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    const scopedMaintenancesAllVehicles = maintenances.filter((m) => inRange(m.doneDate || m.reservationDate || ''));
    const scopedFuelLogsAllVehicles = fuelLogs.filter((f) => inRange(f.date || ''));
    const vehicleTotals = {};
    scopedMaintenancesAllVehicles.forEach((m) => {
      const name = vehicleMap[String(m.vehicleId)]?.name || '不明';
      vehicleTotals[name] = (vehicleTotals[name] || 0) + Number(m.cost || 0);
    });
    scopedFuelLogsAllVehicles.forEach((f) => {
      const name = vehicleMap[String(f.vehicleId)]?.name || '不明';
      vehicleTotals[name] = (vehicleTotals[name] || 0) + Number(f.total || 0);
    });

    const vehicleLabels = Object.keys(vehicleTotals);
    const vehicleData = vehicleLabels.map((k) => vehicleTotals[k]);

    if (vehicleCostChartInstance.current) vehicleCostChartInstance.current.destroy();
    if (vehicleCostChartRef.current) {
      vehicleCostChartInstance.current = new Chart(vehicleCostChartRef.current, {
        type: 'bar',
        data: {
          labels: vehicleLabels,
          datasets: [{ label: '車両別総費用(円)', data: vehicleData, backgroundColor: 'rgba(16,185,129,0.7)' }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
      });
    }
  }, [maintenances, fuelLogs, vehicles, analysisRangePreset, selectedVehicleId]);

  const vehicleMap = useMemo(() => Object.fromEntries(vehicles.map((v) => [String(v.id), v])), [vehicles]);

  const upcomingReservations = useMemo(
    () => maintenances
      .filter((m) => m.status === '予約済み' && m.reservationDate)
      .sort((a, b) => new Date(a.reservationDate) - new Date(b.reservationDate))
      .slice(0, 3),
    [maintenances]
  );

  const thisMonthCosts = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    const maintain = maintenances
      .filter((m) => (m.doneDate || '').startsWith(month))
      .reduce((s, v) => s + Number(v.cost || 0), 0);
    const fuel = fuelLogs
      .filter((f) => (f.date || '').startsWith(month))
      .reduce((s, v) => s + Number(v.total || 0), 0);
    return { maintain, fuel, total: maintain + fuel };
  }, [maintenances, fuelLogs]);

  const fuelChartLogs = useMemo(() => {
    return fuelLogs
      .filter((f) => (fuelFilterVehicle ? String(f.vehicleId) === String(fuelFilterVehicle) : true))
      .filter((f) => {
        const date = f.date || '';
        if (fuelDateFrom && date < fuelDateFrom) return false;
        if (fuelDateTo && date > fuelDateTo) return false;
        return true;
      })
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  }, [fuelLogs, fuelFilterVehicle, fuelDateFrom, fuelDateTo]);

  const urgentAlerts = useMemo(() => {
    const alerts = [];
    vehicles.forEach((v) => {
      [
        ['車検満了', v.inspectionDue],
        ['保険満了', v.insuranceExpiry],
        ['自動車税期限', v.taxDue]
      ].forEach(([label, date]) => {
        const d = daysUntil(date);
        if (d <= 60) alerts.push({ vehicle: v.name, label, date, days: d });
      });
    });

    maintenances.forEach((m) => {
      if (m.status === '予約済み' && m.reservationDate) {
        const d = daysUntil(m.reservationDate);
        if (d <= 3) {
          alerts.push({
            vehicle: vehicleMap[String(m.vehicleId)]?.name || '-',
            label: `予約リマインダー (${m.category})`,
            date: m.reservationDate,
            days: d
          });
        }
      }
    });

    return alerts.sort((a, b) => a.days - b.days).slice(0, 8);
  }, [vehicles, maintenances, vehicleMap]);

  useEffect(() => {
    setMaintenanceSelectedIds((prev) => prev.filter((id) => maintenances.some((m) => Number(m.id) === Number(id))));
  }, [maintenances]);

  function applyMaintenancePreset(preset) {
    setMaintenancePeriodPreset(preset);
    const range = getDateRangeByPreset(preset);
    setMaintenanceDateFrom(range.from);
    setMaintenanceDateTo(range.to);
  }

  function applyFuelPreset(preset) {
    setFuelPeriodPreset(preset);
    const range = getDateRangeByPreset(preset);
    setFuelDateFrom(range.from);
    setFuelDateTo(range.to);
  }

  function toggleMaintenanceSelected(id, checked) {
    setMaintenanceSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((v) => Number(v) !== Number(id));
    });
  }

  function toggleMaintenanceSelectAll(targetIds, checked) {
    setMaintenanceSelectedIds((prev) => {
      if (checked) {
        const merged = new Set([...prev, ...targetIds]);
        return [...merged];
      }
      return prev.filter((id) => !targetIds.includes(id));
    });
  }

  async function bulkDeleteMaintenances() {
    if (!maintenanceSelectedIds.length) {
      alert('一括削除対象を選択してください。');
      return;
    }
    if (!confirm(`選択中 ${maintenanceSelectedIds.length} 件の整備記録を削除しますか？`)) return;
    await db.maintenances.bulkDelete(maintenanceSelectedIds.map((id) => Number(id)));
    setMaintenanceSelectedIds([]);
    loadAll();
  }

  async function bulkUpdateMaintenanceStatus(nextStatus) {
    if (!maintenanceSelectedIds.length) {
      alert('一括変更対象を選択してください。');
      return;
    }
    await Promise.all(
      maintenanceSelectedIds.map((id) => db.maintenances.update(Number(id), { status: nextStatus, updatedAt: Date.now() }))
    );
    setMaintenanceSelectedIds([]);
    loadAll();
  }

  async function applyBulkMaintenanceEdit() {
    if (!maintenanceSelectedIds.length) {
      alert('一括編集対象を選択してください。');
      return;
    }

    const updates = {};
    if (bulkMaintenanceForm.category.trim()) updates.category = bulkMaintenanceForm.category.trim();
    if (bulkMaintenanceForm.status) updates.status = bulkMaintenanceForm.status;
    if (bulkMaintenanceForm.store.trim()) updates.store = bulkMaintenanceForm.store.trim();
    if (bulkMaintenanceForm.person.trim()) updates.person = bulkMaintenanceForm.person.trim();
    if (bulkMaintenanceForm.phone.trim()) updates.phone = bulkMaintenanceForm.phone.trim();
    if (bulkMaintenanceForm.nextDate) updates.nextDate = bulkMaintenanceForm.nextDate;

    if (!Object.keys(updates).length) {
      alert('一括編集する項目を1つ以上入力してください。');
      return;
    }

    updates.updatedAt = Date.now();

    await Promise.all(
      maintenanceSelectedIds.map((id) => db.maintenances.update(Number(id), updates))
    );

    setBulkMaintenanceForm({ category: '', status: '', store: '', person: '', phone: '', nextDate: '' });
    setMaintenanceSelectedIds([]);
    loadAll();
  }

  function saveMaintenanceFilterPreset() {
    const name = maintenanceFilterPresetName.trim();
    if (!name) {
      alert('保存名を入力してください。');
      return;
    }
    const payload = {
      id: `${Date.now()}`,
      name,
      tab: 'maintenance',
      vehicle: maintenanceFilterVehicle,
      status: maintenanceFilterStatus,
      keyword: maintenanceKeyword,
      sortKey: maintenanceSortKey,
      dateFrom: maintenanceDateFrom,
      dateTo: maintenanceDateTo,
      periodPreset: maintenancePeriodPreset
    };
    const next = [payload, ...maintenanceSavedFilters.filter((x) => x.name !== name)].slice(0, 20);
    setMaintenanceSavedFilters(next);
    localStorage.setItem(MAINTENANCE_FILTERS_KEY, JSON.stringify(next));
    setMaintenanceFilterPresetName('');
  }

  function applyMaintenanceFilterPreset(item) {
    setTab(item.tab || 'maintenance');
    setMaintenanceFilterVehicle(item.vehicle || '');
    setMaintenanceFilterStatus(item.status || '');
    setMaintenanceKeyword(item.keyword || '');
    setMaintenanceSortKey(item.sortKey || 'date-desc');
    setMaintenanceDateFrom(item.dateFrom || '');
    setMaintenanceDateTo(item.dateTo || '');
    setMaintenancePeriodPreset(item.periodPreset || '');
  }

  function deleteMaintenanceFilterPreset(id) {
    const next = maintenanceSavedFilters.filter((x) => x.id !== id);
    setMaintenanceSavedFilters(next);
    localStorage.setItem(MAINTENANCE_FILTERS_KEY, JSON.stringify(next));
  }

  function saveFuelFilterPreset() {
    const name = fuelFilterPresetName.trim();
    if (!name) {
      alert('保存名を入力してください。');
      return;
    }
    const payload = {
      id: `${Date.now()}`,
      name,
      tab: 'fuel',
      vehicle: fuelFilterVehicle,
      dateFrom: fuelDateFrom,
      dateTo: fuelDateTo,
      sortKey: fuelSortKey,
      periodPreset: fuelPeriodPreset
    };
    const next = [payload, ...fuelSavedFilters.filter((x) => x.name !== name)].slice(0, 20);
    setFuelSavedFilters(next);
    localStorage.setItem(FUEL_FILTERS_KEY, JSON.stringify(next));
    setFuelFilterPresetName('');
  }

  function applyFuelFilterPreset(item) {
    setTab(item.tab || 'fuel');
    setFuelFilterVehicle(item.vehicle || '');
    setFuelDateFrom(item.dateFrom || '');
    setFuelDateTo(item.dateTo || '');
    setFuelSortKey(item.sortKey || 'date-desc');
    setFuelPeriodPreset(item.periodPreset || '');
  }

  function deleteFuelFilterPreset(id) {
    const next = fuelSavedFilters.filter((x) => x.id !== id);
    setFuelSavedFilters(next);
    localStorage.setItem(FUEL_FILTERS_KEY, JSON.stringify(next));
  }

  function applyInsuranceContact(role, id) {
    const picked = insuranceContacts.find((item) => String(item.id) === String(id));
    setInsuranceForm((prev) => {
      if (role === '保険会社') {
        return {
          ...prev,
          companyContactId: id || '',
          companyName: picked ? picked.name : prev.companyName,
          companyPhone: picked ? (picked.phone || '') : prev.companyPhone
        };
      }
      return {
        ...prev,
        agencyContactId: id || '',
        agencyName: picked ? picked.name : prev.agencyName,
        agencyPhone: picked ? (picked.phone || '') : prev.agencyPhone
      };
    });
  }

  async function addInsuranceContact() {
    const name = (insuranceContactForm.name || '').trim();
    if (!name) {
      alert('保険会社/代理店名は必須です。');
      return;
    }
    await db.insuranceContacts.add({
      role: insuranceContactForm.role,
      name,
      phone: (insuranceContactForm.phone || '').trim(),
      updatedAt: Date.now()
    });
    setInsuranceContactForm({ role: insuranceContactForm.role, name: '', phone: '' });
    loadAll();
  }

  async function removeInsuranceContact(id, name) {
    if (!confirm(`連絡先「${name}」を削除しますか？`)) return;
    await db.insuranceContacts.delete(Number(id));
    loadAll();
  }

  function editInsuranceContact(item) {
    setEditingInsuranceContactId(Number(item.id));
    setInsuranceContactEditForm({
      role: item.role || '保険会社',
      name: item.name || '',
      phone: item.phone || ''
    });
  }

  async function saveInsuranceContactEdit(id) {
    const name = (insuranceContactEditForm.name || '').trim();
    if (!name) {
      alert('保険会社/代理店名は必須です。');
      return;
    }
    await db.insuranceContacts.update(Number(id), {
      role: insuranceContactEditForm.role || '保険会社',
      name,
      phone: (insuranceContactEditForm.phone || '').trim(),
      updatedAt: Date.now()
    });
    setEditingInsuranceContactId(null);
    setInsuranceContactEditForm({ role: '保険会社', name: '', phone: '' });
    loadAll();
  }

  async function addInsurancePolicy(e) {
    e.preventDefault();
    const mandatory = ['vehicleId', 'type', 'companyName', 'companyPhone', 'startDate', 'endDate'];
    const missing = mandatory.find((key) => !String(insuranceForm[key] || '').trim());
    if (missing) {
      alert('車両・保険種別・保険会社・保険会社電話・開始日・満了日は必須です。');
      return;
    }

    let coverageImageBlob = null;
    if (insuranceForm.type === '任意' && insuranceImageFile && insuranceImageFile.size) {
      coverageImageBlob = await compressImage(insuranceImageFile, imageMaxSize, imageQuality);
    }

    await db.insurances.add({
      vehicleId: Number(insuranceForm.vehicleId),
      type: insuranceForm.type,
      companyContactId: insuranceForm.companyContactId ? Number(insuranceForm.companyContactId) : null,
      companyName: insuranceForm.companyName,
      companyPhone: insuranceForm.companyPhone,
      agencyContactId: insuranceForm.agencyContactId ? Number(insuranceForm.agencyContactId) : null,
      agencyName: insuranceForm.agencyName,
      agencyPhone: insuranceForm.agencyPhone,
      startDate: insuranceForm.startDate,
      endDate: insuranceForm.endDate,
      policyNo: insuranceForm.policyNo || '',
      note: insuranceForm.note || '',
      coverageImageBlob,
      createdAt: Date.now()
    });

    if (insuranceForm.type === '任意') {
      await db.vehicles.update(Number(insuranceForm.vehicleId), {
        insuranceExpiry: insuranceForm.endDate,
        insuranceType: insuranceForm.type,
        insuranceCompany: insuranceForm.companyName,
        insurancePhone: insuranceForm.companyPhone,
        updatedAt: Date.now()
      });
    }

    setInsuranceForm((prev) => ({
      ...prev,
      type: '自賠責',
      companyContactId: '',
      companyName: '',
      companyPhone: '',
      agencyContactId: '',
      agencyName: '',
      agencyPhone: '',
      startDate: '',
      endDate: '',
      policyNo: '',
      note: ''
    }));
    setInsuranceImageFile(null);
    loadAll();
  }

  async function deleteInsurancePolicy(id) {
    if (!confirm('この保険情報を削除しますか？')) return;
    await db.insurances.delete(Number(id));
    loadAll();
  }

  function editInsurancePolicy(item) {
    setEditingInsuranceId(Number(item.id));
    setInsuranceEditForm({
      vehicleId: String(item.vehicleId || ''),
      type: item.type || '自賠責',
      companyName: item.companyName || '',
      companyPhone: item.companyPhone || '',
      agencyName: item.agencyName || '',
      agencyPhone: item.agencyPhone || '',
      startDate: item.startDate || '',
      endDate: item.endDate || '',
      policyNo: item.policyNo || '',
      note: item.note || ''
    });
    setInsuranceEditImageFile(null);
  }

  async function saveInsurancePolicyEdit(e, id) {
    e.preventDefault();
    const mandatory = ['vehicleId', 'type', 'companyName', 'companyPhone', 'startDate', 'endDate'];
    const missing = mandatory.find((key) => !String(insuranceEditForm[key] || '').trim());
    if (missing) {
      alert('車両・保険種別・保険会社・保険会社電話・開始日・満了日は必須です。');
      return;
    }

    const current = insurances.find((x) => Number(x.id) === Number(id));
    let coverageImageBlob = current?.coverageImageBlob || null;
    if (insuranceEditForm.type !== '任意') {
      coverageImageBlob = null;
    } else if (insuranceEditImageFile && insuranceEditImageFile.size) {
      coverageImageBlob = await compressImage(insuranceEditImageFile, imageMaxSize, imageQuality);
    }

    const payload = {
      vehicleId: Number(insuranceEditForm.vehicleId),
      type: insuranceEditForm.type,
      companyName: insuranceEditForm.companyName,
      companyPhone: insuranceEditForm.companyPhone,
      agencyName: insuranceEditForm.agencyName,
      agencyPhone: insuranceEditForm.agencyPhone,
      startDate: insuranceEditForm.startDate,
      endDate: insuranceEditForm.endDate,
      policyNo: insuranceEditForm.policyNo || '',
      note: insuranceEditForm.note || '',
      coverageImageBlob,
      updatedAt: Date.now()
    };

    await db.insurances.update(Number(id), payload);

    if (payload.type === '任意') {
      await db.vehicles.update(payload.vehicleId, {
        insuranceExpiry: payload.endDate,
        insuranceType: payload.type,
        insuranceCompany: payload.companyName,
        insurancePhone: payload.companyPhone,
        insurancePolicyNo: payload.policyNo || '',
        updatedAt: Date.now()
      });
    }

    setEditingInsuranceId(null);
    setInsuranceEditImageFile(null);
    loadAll();
  }

  async function addVehicle(e) {
    e.preventDefault();
    if (vehicles.length >= 5) {
      alert('車両は最大5台まで登録できます。');
      return;
    }
    const fd = new FormData(e.target);
    const image = fd.get('photo');
    let photoBlob = null;
    if (image && image.size) photoBlob = await compressImage(image, imageMaxSize, imageQuality);

    const displacementCc = Number(fd.get('displacementCc') || 0);
    await db.vehicles.add({
      name: fd.get('name'),
      plate: fd.get('plate'),
      year: Number(fd.get('year') || 0),
      currentMileage: Number(fd.get('currentMileage') || 0),
      displacementCc,
      autoTaxAnnual: taxByCc(displacementCc),
      taxPaid: false,
      taxDue: fd.get('taxDue') || '',
      inspectionDue: fd.get('inspectionDue') || '',
      insuranceExpiry: '',
      currentTireType: fd.get('currentTireType') || '夏タイヤ',
      tireSummer: fd.get('tireSummer') || '',
      tireWinter: fd.get('tireWinter') || '',
      oilViscosity: fd.get('oilViscosity') || '',
      batteryModel: fd.get('batteryModel') || '',
      wiperDriver: fd.get('wiperDriver') || '',
      wiperPassenger: fd.get('wiperPassenger') || '',
      wiperRear: fd.get('wiperRear') || '',
      airFilter: fd.get('airFilter') || '',
      brakePad: fd.get('brakePad') || '',
      insuranceType: '',
      insuranceCompany: '',
      insurancePerson: '',
      insurancePhone: '',
      insurancePolicyNo: '',
      photoBlob,
      updatedAt: Date.now()
    });

    e.target.reset();
    loadAll();
  }

  async function toggleTaxPaid(id, val) {
    await db.vehicles.update(Number(id), { taxPaid: val, updatedAt: Date.now() });
    loadAll();
  }

  async function updateVehiclePhoto(id, file) {
    if (!file || !file.size) return;
    const photoBlob = await compressImage(file, imageMaxSize, imageQuality);
    await db.vehicles.update(Number(id), { photoBlob, updatedAt: Date.now() });
    loadAll();
  }

  function goToVehicleDetail(vehicle) {
    if (!vehicle) return;
    setSelectedVehicleId(String(vehicle.id));
    setEditingVehicleId(null);
    setTab('vehicleInfo');
    setTimeout(() => {
      const el = document.getElementById('vehicle-info-panel');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }

  function openTab(nextTab) {
    setTab(nextTab);
    if (nextTab === 'vehicles') setVehicleManageMode('register');
  }

  function openMaintenanceGoogleCalendar(m) {
    const vehicleName = vehicleMap[String(m.vehicleId)]?.name || '車両';
    const eventDate = m.reservationDate || m.doneDate || '';
    if (!eventDate) {
      alert('予約日または実施日が未設定のため、Googleカレンダーに追加できません。');
      return;
    }

    const startTime = m.reservationTime || '09:00';
    const [hh, mm] = String(startTime).split(':').map(Number);
    const endTime = `${String(((hh || 9) + 1) % 24).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')}`;

    const details = [
      `ステータス: ${m.status || '-'}`,
      `店舗: ${m.store || '-'}`,
      `担当者: ${m.person || '-'}`,
      `電話: ${m.phone || '-'}`,
      `作業内容: ${m.work || '-'}`,
      `費用: ¥${Number(m.cost || 0).toLocaleString()}`,
      `走行距離: ${Number(m.odometer || 0).toLocaleString()} km`
    ].join('\n');

    openGoogleCalendarTemplate({
      text: `${vehicleName} ${m.work || m.category || 'メンテナンス'} 予約`,
      date: eventDate,
      time: startTime,
      endTime,
      details,
      location: m.store || ''
    });
  }

  function openDeadlineGoogleCalendar(vehicle, deadlineLabel, deadlineDate) {
    if (!deadlineDate) {
      alert('期限日が未設定です。');
      return;
    }

    const details = [
      `車種名: ${vehicle.name || '-'}`,
      `ナンバー: ${vehicle.plate || '-'}`,
      `期限種別: ${deadlineLabel}`,
      `期限日: ${formatDate(deadlineDate)}`,
      `現在走行距離: ${Number(vehicle.currentMileage || 0).toLocaleString()} km`,
      `保険会社: ${vehicle.insuranceCompany || '-'}`,
      `保険電話: ${vehicle.insurancePhone || '-'}`
    ].join('\n');

    openGoogleCalendarTemplate({
      text: `${vehicle.name || '車両'} ${deadlineLabel}`,
      date: deadlineDate,
      details,
      location: vehicle.insuranceCompany || '',
      allDay: true
    });
  }

  function buildIcsContent() {
    const scope = icsExportScope;
    const targetVehicleId = Number(icsExportVehicleId || 0);
    const includeReservations = scope === 'all' || scope === 'reservations' || scope === 'vehicle';
    const includeDeadlines = scope === 'all' || scope === 'deadlines' || scope === 'vehicle';

    const scopedVehicles = scope === 'vehicle'
      ? vehicles.filter((v) => Number(v.id) === targetVehicleId)
      : vehicles;

    if (scope === 'vehicle' && !scopedVehicles.length) {
      return { content: '', count: 0, scopeLabel: '車両別' };
    }

    const scopedVehicleIds = new Set(scopedVehicles.map((v) => Number(v.id)));

    const scopedMaintenances = maintenances.filter((m) => {
      if (!includeReservations) return false;
      if (!['予約済み', '完了'].includes(m.status || '')) return false;
      const hasDate = !!(m.reservationDate || m.doneDate);
      if (!hasDate) return false;
      if (scope === 'vehicle' && !scopedVehicleIds.has(Number(m.vehicleId))) return false;
      return true;
    });

    const events = [];
    const dtStamp = toIcsUtcStamp();

    scopedMaintenances.forEach((m) => {
      const vehicleName = vehicleMap[String(m.vehicleId)]?.name || '車両';
      const date = m.reservationDate || m.doneDate;
      const startTime = m.reservationTime || '09:00';
      const startUtcMs = parseJstToUtcMs(date, startTime);
      const endUtcMs = startUtcMs === null ? null : startUtcMs + (60 * 60 * 1000);
      if (startUtcMs === null || endUtcMs === null) return;

      const summary = `${vehicleName} ${m.work || m.category || 'メンテナンス'} 予約`;
      const description = [
        `ステータス: ${m.status || '-'}`,
        `店舗: ${m.store || '-'}`,
        `担当者: ${m.person || '-'}`,
        `電話: ${m.phone || '-'}`,
        `作業内容: ${m.work || '-'}`,
        `費用: ¥${Number(m.cost || 0).toLocaleString()}`,
        `走行距離: ${Number(m.odometer || 0).toLocaleString()} km`
      ].join('\n');

      events.push([
        'BEGIN:VEVENT',
        `UID:maintenance-${m.id}@car-life-manager.local`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART;TZID=Asia/Tokyo:${formatUtcMsToJstCompact(startUtcMs)}`,
        `DTEND;TZID=Asia/Tokyo:${formatUtcMsToJstCompact(endUtcMs)}`,
        `SUMMARY:${escapeIcsText(summary)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        `LOCATION:${escapeIcsText(m.store || '')}`,
        'END:VEVENT'
      ].join('\r\n'));
    });

    if (includeDeadlines) {
      scopedVehicles.forEach((v) => {
        [
          { key: 'inspectionDue', label: '車検満了日', triggerDays: 30 },
          { key: 'insuranceExpiry', label: '保険満了日', triggerDays: 60 },
          { key: 'taxDue', label: '自動車税納付期限', triggerDays: 30 }
        ].forEach((rule) => {
          const date = v[rule.key];
          if (!date) return;
          const summary = `${v.name || '車両'} ${rule.label}`;
          const description = [
            `車種名: ${v.name || '-'}`,
            `ナンバー: ${v.plate || '-'}`,
            `期限種別: ${rule.label}`,
            `期限日: ${formatDate(date)}`
          ].join('\n');

          events.push([
            'BEGIN:VEVENT',
            `UID:deadline-${rule.key}-${v.id}@car-life-manager.local`,
            `DTSTAMP:${dtStamp}`,
            `DTSTART;VALUE=DATE:${toCompactDate(date)}`,
            `DTEND;VALUE=DATE:${toCompactDate(addDaysYmd(date, 1))}`,
            `SUMMARY:${escapeIcsText(summary)}`,
            `DESCRIPTION:${escapeIcsText(description)}`,
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            `DESCRIPTION:${escapeIcsText(`${rule.label}のリマインダー`)}`,
            `TRIGGER:-P${rule.triggerDays}D`,
            'END:VALARM',
            'END:VEVENT'
          ].join('\r\n'));
        });
      });
    }

    const vtimezone = [
      'BEGIN:VTIMEZONE',
      'TZID:Asia/Tokyo',
      'X-LIC-LOCATION:Asia/Tokyo',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:+0900',
      'TZOFFSETTO:+0900',
      'TZNAME:JST',
      'DTSTART:19700101T000000',
      'END:STANDARD',
      'END:VTIMEZONE'
    ].join('\r\n');

    const content = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CarLifeManager//JP',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:車管理',
      'X-WR-TIMEZONE:Asia/Tokyo',
      vtimezone,
      ...events,
      'END:VCALENDAR'
    ].join('\r\n');

    const scopeLabel = scope === 'reservations'
      ? '予約のみ'
      : scope === 'deadlines'
        ? '期限のみ'
        : scope === 'vehicle'
          ? '車両別'
          : 'すべて';

    return { content, count: events.length, scopeLabel };
  }

  function exportIcsCalendar() {
    const { content, count, scopeLabel } = buildIcsContent();
    if (!count) {
      alert('エクスポート対象のイベントがありません。');
      return;
    }

    const safeScope = String(scopeLabel).replace(/[\\/:*?"<>|]/g, '_');
    const filename = `車管理_${toYmd()}_${safeScope}.ics`;
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    downloadBlob(blob, filename);
  }

  function renderIcsExportControls() {
    return (
      <article className="card p-4 space-y-2">
        <h2 className="font-bold">iCalendarエクスポート</h2>
        <p className="text-xs text-gray-500">Google/Apple/Outlookへ取り込み可能な .ics を出力します（JST対応）。</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Field label="エクスポート対象">
            <select className="select" value={icsExportScope} onChange={(e) => setIcsExportScope(e.target.value)}>
              <option value="all">すべて</option>
              <option value="reservations">予約のみ</option>
              <option value="deadlines">期限のみ</option>
              <option value="vehicle">車両別</option>
            </select>
          </Field>
          {icsExportScope === 'vehicle' && (
            <Field label="対象車両">
              <select className="select" value={icsExportVehicleId} onChange={(e) => setIcsExportVehicleId(e.target.value)}>
                <option value="">車両を選択</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        <button className="w-full py-2 rounded-xl bg-emerald-600 text-white font-bold" onClick={exportIcsCalendar}>🗓️ カレンダーをエクスポート（.ics）</button>
      </article>
    );
  }

  function applyShopToMaintenanceDraft(shopId) {
    const shop = shops.find((s) => String(s.id) === String(shopId));
    setMaintenanceDraft((prev) => ({
      ...prev,
      shopId: shopId || '',
      store: shop ? (shop.name || '') : prev.store,
      phone: shop ? (shop.phone || '') : prev.phone,
      person: shop ? (shop.person || '') : prev.person
    }));
  }

  function applyShopToMaintenanceEdit(shopId) {
    const shop = shops.find((s) => String(s.id) === String(shopId));
    setMaintenanceEditForm((prev) => ({
      ...prev,
      shopId: shopId || '',
      store: shop ? (shop.name || '') : prev.store,
      phone: shop ? (shop.phone || '') : prev.phone,
      person: shop ? (shop.person || '') : prev.person
    }));
  }

  async function addShopMaster() {
    const name = (newShopForm.name || '').trim();
    if (!name) {
      alert('店舗名は必須です。');
      return;
    }
    await db.shops.add({
      name,
      phone: (newShopForm.phone || '').trim(),
      person: (newShopForm.person || '').trim(),
      updatedAt: Date.now()
    });
    setNewShopForm({ name: '', phone: '', person: '' });
    loadAll();
  }

  async function removeShopMaster(id, name) {
    if (!confirm(`店舗「${name}」を削除しますか？`)) return;
    await db.shops.delete(Number(id));
    loadAll();
  }

  async function addMaintenance(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const files = [...fd.getAll('images')].filter((f) => f && f.size).slice(0, maintenanceImageLimit);
    const compressed = [];
    for (const file of files) {
      compressed.push(await compressImage(file, imageMaxSize, imageQuality));
    }

    const vehicleId = Number(maintenanceDraft.vehicleId || fd.get('vehicleId'));
    const category = String(maintenanceDraft.category || fd.get('category') || '').trim();
    const status = String(fd.get('status') || '未予約');

    let nojTicketAction = '';
    let nojTicketChange = 0;
    let nojTicketRemainingAfter = null;

    if (category === 'NOJメンテナンス') {
      const action = maintenanceDraft.nojTicketAction || 'use';
      const targetVehicle = vehicles.find((v) => Number(v.id) === vehicleId);
      const currentTickets = Number(targetVehicle?.nojTicketRemaining || 0);

      if (action === 'purchase') {
        const purchaseCount = Math.floor(Number(maintenanceDraft.nojTicketCount || 0));
        if (purchaseCount <= 0) {
          alert('購入枚数を1以上で入力してください。');
          return;
        }
        nojTicketAction = 'purchase';
        nojTicketChange = purchaseCount;
      } else {
        if (status !== '完了') {
          alert('NOJチケットを利用する場合はステータスを「完了」にしてください。');
          return;
        }
        if (currentTickets <= 0) {
          alert('NOJメンテナンスチケット残数がありません。購入を選択してください。');
          return;
        }
        nojTicketAction = 'use';
        nojTicketChange = -1;
      }

      nojTicketRemainingAfter = Math.max(0, currentTickets + nojTicketChange);
      await db.vehicles.update(vehicleId, {
        nojTicketRemaining: nojTicketRemainingAfter,
        updatedAt: Date.now()
      });
    }

    const maintenanceRecord = {
      vehicleId,
      category,
      status,
      reservationDate: fd.get('reservationDate') || '',
      reservationTime: fd.get('reservationTime') || '',
      store: maintenanceDraft.store || '',
      person: maintenanceDraft.person || '',
      phone: maintenanceDraft.phone || '',
      doneDate: fd.get('doneDate') || '',
      odometer: Number(fd.get('odometer') || 0),
      work: fd.get('work') || '',
      cost: Number(fd.get('cost') || 0),
      nextDate: fd.get('nextDate') || '',
      images: compressed,
      calendarSync: !!maintenanceDraft.calendarSync,
      shopId: maintenanceDraft.shopId ? Number(maintenanceDraft.shopId) : null,
      nojTicketAction,
      nojTicketChange,
      nojTicketRemainingAfter,
      createdAt: Date.now()
    };

    const id = await db.maintenances.add(maintenanceRecord);

    if (maintenanceRecord.calendarSync) {
      setTimeout(() => openMaintenanceGoogleCalendar({ ...maintenanceRecord, id }), 80);
    }

    e.target.reset();
    setMaintenanceDraft((prev) => ({
      ...prev,
      category,
      store: '',
      person: '',
      phone: '',
      shopId: '',
      calendarSync: false,
      nojTicketAction: 'use',
      nojTicketCount: ''
    }));
    loadAll();
  }

  async function addCategory(name) {
    if (!name.trim()) return;
    await db.categories.add({ name: name.trim(), isDefault: false });
    loadAll();
  }

  async function renameCategory(id, oldName) {
    const name = prompt('カテゴリ名を入力してください', oldName);
    if (!name) return;
    await db.categories.update(Number(id), { name: name.trim() });
    loadAll();
  }

  async function removeCategory(id, name) {
    if (!confirm(`カテゴリ「${name}」を削除しますか？`)) return;
    await db.categories.delete(Number(id));
    loadAll();
  }

  function updateFuelDraftField(field, value) {
    setFuelDraft((prev) => {
      const next = { ...prev, [field]: value };
      const liters = Number(next.liters || 0);
      const unitPrice = Number(next.unitPrice || 0);
      if (!next.total && liters > 0 && unitPrice > 0) {
        next.total = String(Math.round(liters * unitPrice));
      }
      return next;
    });
  }

  function applyOcrResultToFuelDraft(result) {
    if (!result) return;
    setFuelDraft((prev) => {
      const next = { ...prev };
      if (result.date) next.date = result.date;
      if (result.liters !== null && result.liters !== undefined) next.liters = String(result.liters);
      if (result.unitPrice !== null && result.unitPrice !== undefined) next.unitPrice = String(result.unitPrice);
      if (result.total !== null && result.total !== undefined) next.total = String(result.total);
      if (result.station) next.station = result.station;
      if (!next.total && Number(next.liters) > 0 && Number(next.unitPrice) > 0) {
        next.total = String(Math.round(Number(next.liters) * Number(next.unitPrice)));
      }
      return next;
    });
  }

  function resetFuelOcrState({ clearReceipt = false } = {}) {
    setFuelReceiptProcessing(false);
    setFuelOcrMode('idle');
    setFuelOcrMessage('');
    setFuelReceiptOcrResult(null);
    if (clearReceipt) setFuelReceiptBlob(null);
    if (fuelCameraInputRef.current) fuelCameraInputRef.current.value = '';
  }

  async function createFuelLogFromDraft({ keepDraft = false } = {}) {
    const vehicleId = Number(fuelDraft.vehicleId);
    const date = fuelDraft.date;
    const odometer = Number(fuelDraft.odometer || 0);
    const liters = Number(fuelDraft.liters || 0);
    const unitPrice = Number(fuelDraft.unitPrice || 0);
    const total = Number(fuelDraft.total || unitPrice * liters || 0);

    if (!vehicleId || !date || !odometer || !liters) {
      alert('車両・日付・総走行距離・給油量は必須です。');
      return false;
    }

    const prev = (await db.fuelLogs.where('vehicleId').equals(vehicleId).toArray())
      .sort((a, b) => b.odometer - a.odometer)[0];

    const distance = prev ? Math.max(0, odometer - Number(prev.odometer || 0)) : 0;
    const kmpl = distance && liters ? distance / liters : 0;

    await db.fuelLogs.add({
      vehicleId,
      date,
      odometer,
      liters,
      unitPrice,
      total,
      station: fuelDraft.station || '',
      receiptBlob: fuelReceiptBlob,
      receiptOcrRawText: fuelReceiptOcrResult?.rawText || '',
      distance,
      kmpl,
      createdAt: Date.now()
    });

    await db.vehicles.update(vehicleId, { currentMileage: odometer, updatedAt: Date.now() });

    if (!keepDraft) {
      setFuelDraft({
        vehicleId: String(vehicleId),
        date: toYmd(),
        odometer: '',
        liters: '',
        unitPrice: '',
        total: '',
        station: ''
      });
      resetFuelOcrState({ clearReceipt: true });
    }

    await loadAll();
    return true;
  }

  async function addFuel(e) {
    e.preventDefault();
    await createFuelLogFromDraft();
  }

  async function handleFuelReceiptCapture(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.Tesseract?.recognize) {
      alert('OCRライブラリの読み込みに失敗しました。手動入力をご利用ください。');
      resetFuelOcrState({ clearReceipt: true });
      return;
    }

    try {
      setFuelReceiptProcessing(true);
      setFuelOcrMode('loading');
      setFuelOcrMessage('画像を前処理しています...');

      const preprocessed = await preprocessReceiptImage(file, 1000, 0.82);
      setFuelReceiptBlob(preprocessed);

      setFuelOcrMessage('読み取り中...（数秒かかる場合があります）');
      const ocr = await window.Tesseract.recognize(preprocessed, 'jpn+eng', {
        logger: (m) => {
          if (m?.status === 'recognizing text') {
            const percent = Math.round((m.progress || 0) * 100);
            setFuelOcrMessage(`読み取り中... ${percent}%`);
          }
        }
      });

      const parsed = parseFuelReceiptOcrText(ocr?.data?.text || '');
      setFuelReceiptOcrResult(parsed);

      if (parsed.recognizedCount === 0) {
        setFuelOcrMode('manual');
        setFuelOcrMessage('読み取りに失敗しました。手動入力に切り替えてください。');
        setFuelReceiptOcrResult(null);
        alert('レシートの読み取りに失敗しました。手動入力へ切り替えます。');
        return;
      }

      applyOcrResultToFuelDraft(parsed);
      setFuelOcrMode('review');
      setFuelOcrMessage(parsed.recognizedCount >= 4 ? '読み取りに成功しました。内容を確認してください。' : '一部のみ読み取れました。手動で修正してください。');
    } catch (error) {
      console.error(error);
      resetFuelOcrState({ clearReceipt: true });
      alert('OCR処理でエラーが発生しました。手動入力をご利用ください。');
    } finally {
      setFuelReceiptProcessing(false);
      if (fuelCameraInputRef.current) fuelCameraInputRef.current.value = '';
    }
  }

  async function confirmFuelOcrAndSave() {
    const ok = await createFuelLogFromDraft();
    if (ok) {
      alert('OCR内容で給油記録を保存しました。');
    }
  }

  function switchFuelOcrToManual() {
    setFuelOcrMode('manual');
    setFuelOcrMessage('手動で修正して保存してください。');
  }

  async function deleteFuelReceiptImage(logId) {
    if (!confirm('このレシート画像を削除しますか？')) return;
    await db.fuelLogs.update(Number(logId), { receiptBlob: null, updatedAt: Date.now() });
    loadAll();
  }

  async function addTireLog(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const vehicleId = Number(fd.get('vehicleId'));
    const type = fd.get('type');
    const action = fd.get('action');

    await db.tireLogs.add({
      vehicleId,
      type,
      action,
      date: fd.get('date'),
      odometer: Number(fd.get('odometer') || 0),
      shop: fd.get('shop') || '',
      cost: Number(fd.get('cost') || 0),
      treadDepth: Number(fd.get('treadDepth') || 0),
      note: fd.get('note') || '',
      createdAt: Date.now()
    });

    if (action === '履き替え') {
      await db.vehicles.update(vehicleId, { currentTireType: type, updatedAt: Date.now() });
    }

    e.target.reset();
    loadAll();
  }

  async function addMemo(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const file = fd.get('photo');
    let photoBlob = null;
    if (file && file.size) photoBlob = await compressImage(file, imageMaxSize, imageQuality);

    await db.memos.add({
      vehicleId: Number(fd.get('vehicleId')),
      date: fd.get('date'),
      tag: fd.get('tag'),
      content: fd.get('content'),
      important: fd.get('important') === 'on',
      photoBlob,
      createdAt: Date.now()
    });

    e.target.reset();
    loadAll();
  }

  function editVehicleBasic(v) {
    setEditingVehicleId(Number(v.id));
    setVehicleEditForm({
      name: v.name || '',
      plate: v.plate || '',
      year: v.year || '',
      currentMileage: Number(v.currentMileage || 0),
      displacementCc: Number(v.displacementCc || 0),
      currentTireType: v.currentTireType || '夏タイヤ',
      tireSummer: v.tireSummer || '',
      tireWinter: v.tireWinter || '',
      oilViscosity: v.oilViscosity || '',
      batteryModel: v.batteryModel || '',
      wiperDriver: v.wiperDriver || '',
      wiperPassenger: v.wiperPassenger || '',
      wiperRear: v.wiperRear || '',
      airFilter: v.airFilter || '',
      brakePad: v.brakePad || '',
      taxDue: v.taxDue || '',
      inspectionDue: v.inspectionDue || '',
      taxPaid: !!v.taxPaid
    });
  }

  async function saveVehicleEdit(e, id) {
    e.preventDefault();
    const targetVehicle = vehicles.find((x) => Number(x.id) === Number(id));
    const fd = new FormData(e.target);
    const photo = fd.get('editVehiclePhoto');
    let photoBlob = targetVehicle?.photoBlob || null;
    if (photo && photo.size) photoBlob = await compressImage(photo, imageMaxSize, imageQuality);

    const displacementCc = Number(vehicleEditForm.displacementCc || 0);
    await db.vehicles.update(Number(id), {
      ...vehicleEditForm,
      name: (vehicleEditForm.name || '').trim(),
      plate: (vehicleEditForm.plate || '').trim(),
      year: Number(vehicleEditForm.year || 0),
      currentMileage: Number(vehicleEditForm.currentMileage || 0),
      displacementCc,
      autoTaxAnnual: taxByCc(displacementCc),
      taxPaid: !!vehicleEditForm.taxPaid,
      photoBlob,
      updatedAt: Date.now()
    });
    setEditingVehicleId(null);
    loadAll();
  }

  async function deleteVehicle(id) {
    if (!confirm('この車両を削除します。関連する整備・給油・タイヤ・メモも削除されます。よろしいですか？')) return;
    const vehicleId = Number(id);
    await db.transaction('rw', db.vehicles, db.maintenances, db.fuelLogs, db.tireLogs, db.memos, async () => {
      await db.vehicles.delete(vehicleId);
      const [mRows, fRows, tRows, memoRows] = await Promise.all([
        db.maintenances.where('vehicleId').equals(vehicleId).toArray(),
        db.fuelLogs.where('vehicleId').equals(vehicleId).toArray(),
        db.tireLogs.where('vehicleId').equals(vehicleId).toArray(),
        db.memos.where('vehicleId').equals(vehicleId).toArray()
      ]);
      await Promise.all([
        db.maintenances.bulkDelete(mRows.map((r) => r.id)),
        db.fuelLogs.bulkDelete(fRows.map((r) => r.id)),
        db.tireLogs.bulkDelete(tRows.map((r) => r.id)),
        db.memos.bulkDelete(memoRows.map((r) => r.id))
      ]);
    });
    loadAll();
  }

  function editMaintenance(m) {
    setEditingMaintenanceId(Number(m.id));
    setMaintenanceEditForm({
      vehicleId: Number(m.vehicleId || ''),
      category: m.category || '',
      status: m.status || '未予約',
      reservationDate: m.reservationDate || '',
      reservationTime: m.reservationTime || '',
      store: m.store || '',
      person: m.person || '',
      phone: m.phone || '',
      doneDate: m.doneDate || '',
      odometer: Number(m.odometer || 0),
      work: m.work || '',
      cost: Number(m.cost || 0),
      nextDate: m.nextDate || '',
      calendarSync: !!m.calendarSync,
      shopId: m.shopId ? String(m.shopId) : ''
    });
  }

  async function saveMaintenanceEdit(e, id) {
    e.preventDefault();
    const current = maintenances.find((x) => Number(x.id) === Number(id));
    const fd = new FormData(e.target);
    const files = [...fd.getAll('editMaintenanceImages')].filter((f) => f && f.size).slice(0, maintenanceImageLimit);
    let images = current?.images || [];
    if (files.length) {
      images = [];
      for (const file of files) images.push(await compressImage(file, imageMaxSize, imageQuality));
    }

    const updated = {
      ...maintenanceEditForm,
      vehicleId: Number(maintenanceEditForm.vehicleId),
      odometer: Number(maintenanceEditForm.odometer || 0),
      cost: Number(maintenanceEditForm.cost || 0),
      shopId: maintenanceEditForm.shopId ? Number(maintenanceEditForm.shopId) : null,
      calendarSync: !!maintenanceEditForm.calendarSync,
      images,
      updatedAt: Date.now()
    };

    await db.maintenances.update(Number(id), updated);

    if (updated.calendarSync) {
      setTimeout(() => openMaintenanceGoogleCalendar({ ...updated, id: Number(id) }), 80);
    }

    setEditingMaintenanceId(null);
    loadAll();
  }

  async function cycleMaintenanceStatus(m) {
    const order = ['未予約', '予約済み', '完了'];
    const idx = order.indexOf(m.status);
    const next = order[(idx + 1) % order.length];
    await db.maintenances.update(Number(m.id), { status: next, updatedAt: Date.now() });
    loadAll();
  }

  async function deleteMaintenance(id) {
    if (!confirm('この整備記録を削除しますか？')) return;
    await db.maintenances.delete(Number(id));
    loadAll();
  }

  function editFuelLog(f) {
    setEditingFuelId(Number(f.id));
    setFuelEditForm({
      vehicleId: Number(f.vehicleId || ''),
      date: f.date || '',
      odometer: Number(f.odometer || 0),
      liters: Number(f.liters || 0),
      unitPrice: Number(f.unitPrice || 0),
      total: Number(f.total || 0),
      station: f.station || ''
    });
  }

  async function saveFuelEdit(id) {
    const vehicleId = Number(fuelEditForm.vehicleId);
    const odometer = Number(fuelEditForm.odometer || 0);
    const liters = Number(fuelEditForm.liters || 0);
    const unitPrice = Number(fuelEditForm.unitPrice || 0);
    const total = Number(fuelEditForm.total || unitPrice * liters || 0);

    const prev = (await db.fuelLogs.where('vehicleId').equals(vehicleId).toArray())
      .filter((x) => Number(x.id) !== Number(id) && Number(x.odometer || 0) <= odometer)
      .sort((a, b) => Number(b.odometer || 0) - Number(a.odometer || 0))[0];

    const distance = prev ? Math.max(0, odometer - Number(prev.odometer || 0)) : 0;
    const kmpl = distance && liters ? distance / liters : 0;

    await db.fuelLogs.update(Number(id), {
      vehicleId,
      date: fuelEditForm.date,
      odometer,
      liters,
      unitPrice,
      total,
      station: fuelEditForm.station || '',
      distance,
      kmpl,
      updatedAt: Date.now()
    });

    await db.vehicles.update(vehicleId, { currentMileage: odometer, updatedAt: Date.now() });

    setEditingFuelId(null);
    loadAll();
  }

  async function deleteFuelLog(id) {
    if (!confirm('この給油記録を削除しますか？')) return;
    await db.fuelLogs.delete(Number(id));
    loadAll();
  }

  function editTireLog(t) {
    setEditingTireId(Number(t.id));
    setTireEditForm({
      vehicleId: Number(t.vehicleId || ''),
      type: t.type || '夏タイヤ',
      action: t.action || '履き替え',
      date: t.date || '',
      odometer: Number(t.odometer || 0),
      shop: t.shop || '',
      cost: Number(t.cost || 0),
      treadDepth: Number(t.treadDepth || 0),
      note: t.note || ''
    });
  }

  async function saveTireEdit(id) {
    const vehicleId = Number(tireEditForm.vehicleId);
    await db.tireLogs.update(Number(id), {
      ...tireEditForm,
      vehicleId,
      odometer: Number(tireEditForm.odometer || 0),
      cost: Number(tireEditForm.cost || 0),
      treadDepth: Number(tireEditForm.treadDepth || 0),
      updatedAt: Date.now()
    });

    if (tireEditForm.action === '履き替え') {
      await db.vehicles.update(vehicleId, { currentTireType: tireEditForm.type, updatedAt: Date.now() });
    }

    setEditingTireId(null);
    loadAll();
  }

  async function deleteTireLog(id) {
    if (!confirm('このタイヤ履歴を削除しますか？')) return;
    await db.tireLogs.delete(Number(id));
    loadAll();
  }

  function editMemo(m) {
    setEditingMemoId(Number(m.id));
    setMemoEditForm({
      vehicleId: Number(m.vehicleId || ''),
      date: m.date || '',
      tag: m.tag || 'その他',
      content: m.content || '',
      important: !!m.important
    });
  }

  async function saveMemoEdit(e, id) {
    e.preventDefault();
    const current = memos.find((x) => Number(x.id) === Number(id));
    const fd = new FormData(e.target);
    const photo = fd.get('editMemoPhoto');
    let photoBlob = current?.photoBlob || null;
    if (photo && photo.size) photoBlob = await compressImage(photo, imageMaxSize, imageQuality);

    await db.memos.update(Number(id), {
      ...memoEditForm,
      vehicleId: Number(memoEditForm.vehicleId),
      important: !!memoEditForm.important,
      photoBlob,
      updatedAt: Date.now()
    });
    setEditingMemoId(null);
    loadAll();
  }

  async function toggleMemoImportant(m) {
    await db.memos.update(Number(m.id), { important: !m.important, updatedAt: Date.now() });
    loadAll();
  }

  async function deleteMemo(id) {
    if (!confirm('このメモを削除しますか？')) return;
    await db.memos.delete(Number(id));
    loadAll();
  }

  async function saveContact(id, field, value) {
    await db.contacts.update(Number(id), { [field]: value });
    loadAll();
  }

  async function recompressStoredImages() {
    if (isRecompressing) return;

    const includeVehicles = recompressTarget === 'all' || recompressTarget === 'vehicles';
    const includeMaintenances = recompressTarget === 'all' || recompressTarget === 'maintenances';
    const includeMemos = recompressTarget === 'all' || recompressTarget === 'memos';

    const vehiclesRaw = includeVehicles ? await db.vehicles.toArray() : [];
    const maintRaw = includeMaintenances ? await db.maintenances.toArray() : [];
    const memosRaw = includeMemos ? await db.memos.toArray() : [];

    const vehiclePhotoCount = includeVehicles ? vehiclesRaw.filter((v) => !!v.photoBlob).length : 0;
    const maintenanceImageCount = includeMaintenances
      ? maintRaw.reduce((sum, m) => sum + Math.min((m.images || []).length, maintenanceImageLimit), 0)
      : 0;
    const memoPhotoCount = includeMemos ? memosRaw.filter((m) => !!m.photoBlob).length : 0;
    const totalTarget = vehiclePhotoCount + maintenanceImageCount + memoPhotoCount;
    const hasTruncatedMaintenanceImages = includeMaintenances && maintRaw.some((m) => (m.images || []).length > maintenanceImageLimit);

    if (!totalTarget) {
      setRecompressProgress({ done: 0, total: 0, startedAt: 0, etaSeconds: null });
      alert('再圧縮対象の画像がありません。');
      return;
    }

    const targetLabel = recompressTarget === 'vehicles'
      ? '車両写真のみ'
      : recompressTarget === 'maintenances'
        ? '整備画像のみ'
        : recompressTarget === 'memos'
          ? 'メモ写真のみ'
          : '全画像';

    const confirmMessage = [
      '既存画像を現在の圧縮設定で一括再圧縮します。',
      `対象範囲: ${targetLabel}`,
      `対象枚数: 車両写真 ${vehiclePhotoCount}枚 / 整備画像 ${maintenanceImageCount}枚 / メモ写真 ${memoPhotoCount}枚`,
      `設定: 品質 ${imageQuality} / 最大辺 ${imageMaxSize}px / 整備画像上限 ${maintenanceImageLimit}枚`,
      hasTruncatedMaintenanceImages ? '※ 整備画像は1件あたり上限枚数を超える分が除外されます。' : ''
    ].filter(Boolean).join('\n');

    if (!confirm(confirmMessage)) return;

    const startedAt = Date.now();
    setRecompressPaused(false);
    recompressPausedRef.current = false;
    setRecompressProgress({ done: 0, total: totalTarget, startedAt, etaSeconds: null });
    setIsRecompressing(true);

    const waitIfPaused = async () => {
      while (recompressPausedRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    };

    try {
      let processed = 0;
      const now = Date.now();
      const tick = () => {
        processed += 1;
        const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const avgPerImage = elapsedSec / processed;
        const remaining = Math.max(0, totalTarget - processed);
        const etaSeconds = remaining > 0 ? Math.ceil(avgPerImage * remaining) : 0;
        setRecompressProgress({ done: processed, total: totalTarget, startedAt, etaSeconds });
      };

      const vehiclesNext = [];
      for (const v of vehiclesRaw) {
        if (!v.photoBlob) continue;
        await waitIfPaused();
        const photoBlob = await compressImage(v.photoBlob, imageMaxSize, imageQuality);
        vehiclesNext.push({ ...v, photoBlob, updatedAt: now });
        tick();
      }

      const maintNext = [];
      for (const m of maintRaw) {
        const imgs = (m.images || []).slice(0, maintenanceImageLimit);
        if (!imgs.length) continue;
        const images = [];
        for (const img of imgs) {
          await waitIfPaused();
          images.push(await compressImage(img, imageMaxSize, imageQuality));
          tick();
        }
        maintNext.push({ ...m, images, updatedAt: now });
      }

      const memoNext = [];
      for (const m of memosRaw) {
        if (!m.photoBlob) continue;
        await waitIfPaused();
        const photoBlob = await compressImage(m.photoBlob, imageMaxSize, imageQuality);
        memoNext.push({ ...m, photoBlob, updatedAt: now });
        tick();
      }

      await db.transaction('rw', db.vehicles, db.maintenances, db.memos, async () => {
        if (vehiclesNext.length) await db.vehicles.bulkPut(vehiclesNext);
        if (maintNext.length) await db.maintenances.bulkPut(maintNext);
        if (memoNext.length) await db.memos.bulkPut(memoNext);
      });

      await loadAll();
      setRecompressProgress({ done: totalTarget, total: totalTarget, startedAt, etaSeconds: 0 });
      alert(`再圧縮が完了しました。処理画像数: ${processed}`);
    } catch (error) {
      console.error(error);
      alert('再圧縮中にエラーが発生しました。設定を変更して再試行してください。');
    } finally {
      setIsRecompressing(false);
      setRecompressPaused(false);
      recompressPausedRef.current = false;
    }
  }

  function toggleRecompressPause() {
    if (!isRecompressing) return;
    setRecompressPaused((prev) => !prev);
  }

  async function exportCsvZip() {
    const [v, m, f, t, me, c, co, s, ic, ins] = await Promise.all([
      db.vehicles.toArray(),
      db.maintenances.toArray(),
      db.fuelLogs.toArray(),
      db.tireLogs.toArray(),
      db.memos.toArray(),
      db.categories.toArray(),
      db.contacts.toArray(),
      db.shops.toArray(),
      db.insuranceContacts.toArray(),
      db.insurances.toArray()
    ]);

    const zip = new JSZip();
    zip.file('vehicles.csv', toCsv(v, [
      { label: 'id', value: (x) => x.id },
      { label: 'name', value: (x) => x.name || '' },
      { label: 'plate', value: (x) => x.plate || '' },
      { label: 'year', value: (x) => x.year || '' },
      { label: 'currentMileage', value: (x) => x.currentMileage || 0 },
      { label: 'displacementCc', value: (x) => x.displacementCc || 0 },
      { label: 'autoTaxAnnual', value: (x) => x.autoTaxAnnual || 0 },
      { label: 'taxDue', value: (x) => x.taxDue || '' },
      { label: 'inspectionDue', value: (x) => x.inspectionDue || '' },
      { label: 'insuranceExpiry', value: (x) => x.insuranceExpiry || '' },
      { label: 'currentTireType', value: (x) => x.currentTireType || '' },
      { label: 'hasPhoto', value: (x) => (x.photoBlob ? '1' : '0') }
    ]));

    zip.file('maintenances.csv', toCsv(m, [
      { label: 'id', value: (x) => x.id },
      { label: 'vehicleId', value: (x) => x.vehicleId },
      { label: 'category', value: (x) => x.category || '' },
      { label: 'status', value: (x) => x.status || '' },
      { label: 'reservationDate', value: (x) => x.reservationDate || '' },
      { label: 'reservationTime', value: (x) => x.reservationTime || '' },
      { label: 'store', value: (x) => x.store || '' },
      { label: 'person', value: (x) => x.person || '' },
      { label: 'phone', value: (x) => x.phone || '' },
      { label: 'doneDate', value: (x) => x.doneDate || '' },
      { label: 'odometer', value: (x) => x.odometer || 0 },
      { label: 'work', value: (x) => x.work || '' },
      { label: 'cost', value: (x) => x.cost || 0 },
      { label: 'nextDate', value: (x) => x.nextDate || '' },
      { label: 'imageCount', value: (x) => (x.images || []).length }
    ]));

    zip.file('fuelLogs.csv', toCsv(f, [
      { label: 'id', value: (x) => x.id },
      { label: 'vehicleId', value: (x) => x.vehicleId },
      { label: 'date', value: (x) => x.date || '' },
      { label: 'odometer', value: (x) => x.odometer || 0 },
      { label: 'liters', value: (x) => x.liters || 0 },
      { label: 'unitPrice', value: (x) => x.unitPrice || 0 },
      { label: 'total', value: (x) => x.total || 0 },
      { label: 'distance', value: (x) => x.distance || 0 },
      { label: 'kmpl', value: (x) => x.kmpl || 0 },
      { label: 'station', value: (x) => x.station || '' }
    ]));

    zip.file('tireLogs.csv', toCsv(t, [
      { label: 'id', value: (x) => x.id },
      { label: 'vehicleId', value: (x) => x.vehicleId },
      { label: 'date', value: (x) => x.date || '' },
      { label: 'type', value: (x) => x.type || '' },
      { label: 'action', value: (x) => x.action || '' },
      { label: 'odometer', value: (x) => x.odometer || 0 },
      { label: 'shop', value: (x) => x.shop || '' },
      { label: 'cost', value: (x) => x.cost || 0 },
      { label: 'treadDepth', value: (x) => x.treadDepth || 0 },
      { label: 'note', value: (x) => x.note || '' }
    ]));

    zip.file('memos.csv', toCsv(me, [
      { label: 'id', value: (x) => x.id },
      { label: 'vehicleId', value: (x) => x.vehicleId },
      { label: 'date', value: (x) => x.date || '' },
      { label: 'tag', value: (x) => x.tag || '' },
      { label: 'important', value: (x) => (x.important ? '1' : '0') },
      { label: 'content', value: (x) => x.content || '' },
      { label: 'hasPhoto', value: (x) => (x.photoBlob ? '1' : '0') }
    ]));

    zip.file('categories.csv', toCsv(c, [
      { label: 'id', value: (x) => x.id },
      { label: 'name', value: (x) => x.name || '' },
      { label: 'isDefault', value: (x) => (x.isDefault ? '1' : '0') }
    ]));

    zip.file('contacts.csv', toCsv(co, [
      { label: 'id', value: (x) => x.id },
      { label: 'type', value: (x) => x.type || '' },
      { label: 'name', value: (x) => x.name || '' },
      { label: 'phone', value: (x) => x.phone || '' },
      { label: 'is24h', value: (x) => (x.is24h ? '1' : '0') }
    ]));

    zip.file('shops.csv', toCsv(s, [
      { label: 'id', value: (x) => x.id },
      { label: 'name', value: (x) => x.name || '' },
      { label: 'phone', value: (x) => x.phone || '' },
      { label: 'person', value: (x) => x.person || '' },
      { label: 'updatedAt', value: (x) => x.updatedAt || '' }
    ]));

    zip.file('insuranceContacts.csv', toCsv(ic, [
      { label: 'id', value: (x) => x.id },
      { label: 'role', value: (x) => x.role || '' },
      { label: 'name', value: (x) => x.name || '' },
      { label: 'phone', value: (x) => x.phone || '' },
      { label: 'updatedAt', value: (x) => x.updatedAt || '' }
    ]));

    zip.file('insurances.csv', toCsv(ins, [
      { label: 'id', value: (x) => x.id },
      { label: 'vehicleId', value: (x) => x.vehicleId || '' },
      { label: 'type', value: (x) => x.type || '' },
      { label: 'companyName', value: (x) => x.companyName || '' },
      { label: 'companyPhone', value: (x) => x.companyPhone || '' },
      { label: 'agencyName', value: (x) => x.agencyName || '' },
      { label: 'agencyPhone', value: (x) => x.agencyPhone || '' },
      { label: 'startDate', value: (x) => x.startDate || '' },
      { label: 'endDate', value: (x) => x.endDate || '' },
      { label: 'policyNo', value: (x) => x.policyNo || '' },
      { label: 'note', value: (x) => x.note || '' },
      { label: 'hasCoverageImage', value: (x) => (x.coverageImageBlob ? '1' : '0') }
    ]));

    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `car-manager-csv-${toYmd()}.zip`);
  }

  async function backupAll() {
    const vehiclesRaw = await db.vehicles.toArray();
    const maintRaw = await db.maintenances.toArray();
    const memosRaw = await db.memos.toArray();
    const insuranceRaw = await db.insurances.toArray();

    const vehiclesSerialized = await Promise.all(vehiclesRaw.map(async (v) => ({
      ...v,
      photoBlob: v.photoBlob ? await blobToDataUrl(v.photoBlob) : null
    })));

    const maintSerialized = await Promise.all(maintRaw.map(async (m) => ({
      ...m,
      images: await Promise.all((m.images || []).map((img) => blobToDataUrl(img)))
    })));

    const memosSerialized = await Promise.all(memosRaw.map(async (m) => ({
      ...m,
      photoBlob: m.photoBlob ? await blobToDataUrl(m.photoBlob) : null
    })));

    const insuranceSerialized = await Promise.all(insuranceRaw.map(async (item) => ({
      ...item,
      coverageImageBlob: item.coverageImageBlob ? await blobToDataUrl(item.coverageImageBlob) : null
    })));

    const payload = {
      meta: { exportedAt: new Date().toISOString(), app: 'car-life-manager' },
      vehicles: vehiclesSerialized,
      maintenances: maintSerialized,
      fuelLogs: await db.fuelLogs.toArray(),
      tireLogs: await db.tireLogs.toArray(),
      memos: memosSerialized,
      categories: await db.categories.toArray(),
      contacts: await db.contacts.toArray(),
      shops: await db.shops.toArray(),
      insuranceContacts: await db.insuranceContacts.toArray(),
      insurances: insuranceSerialized
    };

    const zip = new JSZip();
    zip.file('backup.json', JSON.stringify(payload));
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `car-manager-backup-${toYmd()}.zip`);
    localStorage.setItem('lastBackupAt', String(Date.now()));
    setBackupReminder('バックアップ完了しました。');
  }

  async function restoreAll(file) {
    if (!file) return;
    const zip = await JSZip.loadAsync(file);
    const text = await zip.file('backup.json').async('string');
    const data = JSON.parse(text);

    if (!confirm('既存データをすべて置き換えて復元します。実行しますか？')) return;

    const vehiclesRestored = (data.vehicles || []).map((v) => ({
      ...v,
      photoBlob: dataUrlToBlob(v.photoBlob)
    }));

    const maintenanceRestored = (data.maintenances || []).map((m) => ({
      ...m,
      images: (m.images || []).map((img) => dataUrlToBlob(img)).filter(Boolean)
    }));

    const memosRestored = (data.memos || []).map((m) => ({
      ...m,
      photoBlob: dataUrlToBlob(m.photoBlob)
    }));

    const insurancesRestored = (data.insurances || []).map((item) => ({
      ...item,
      coverageImageBlob: dataUrlToBlob(item.coverageImageBlob)
    }));

    await db.transaction('rw', db.vehicles, db.maintenances, db.fuelLogs, db.tireLogs, db.memos, db.categories, db.contacts, db.shops, db.insuranceContacts, db.insurances, async () => {
      await Promise.all([
        db.vehicles.clear(), db.maintenances.clear(), db.fuelLogs.clear(), db.tireLogs.clear(), db.memos.clear(), db.categories.clear(), db.contacts.clear(),
        db.shops.clear(), db.insuranceContacts.clear(), db.insurances.clear()
      ]);
      await db.vehicles.bulkAdd(vehiclesRestored);
      await db.maintenances.bulkAdd(maintenanceRestored);
      await db.fuelLogs.bulkAdd(data.fuelLogs || []);
      await db.tireLogs.bulkAdd(data.tireLogs || []);
      await db.memos.bulkAdd(memosRestored);
      await db.categories.bulkAdd(data.categories || []);
      await db.contacts.bulkAdd(data.contacts || []);
      await db.shops.bulkAdd(data.shops || []);
      await db.insuranceContacts.bulkAdd(data.insuranceContacts || []);
      await db.insurances.bulkAdd(insurancesRestored);
    });

    loadAll();
    alert('復元が完了しました。');
  }

  function renderDashboard() {
    const deadlineClass = (days, hasDate) => {
      if (!hasDate) return 'bg-gray-100 text-gray-500 border-gray-200';
      if (days <= 7) return 'bg-red-50 text-red-700 border-red-200';
      if (days <= 30) return 'bg-orange-50 text-orange-700 border-orange-200';
      if (days <= 60) return 'bg-yellow-50 text-yellow-800 border-yellow-200';
      return 'bg-green-50 text-green-700 border-green-200';
    };

    const deadlineText = (shortLabel, dateValue) => {
      if (!dateValue) return `${shortLabel} 未設定`;
      const days = daysUntil(dateValue);
      if (days < 0) return `${shortLabel}期限超過 ${Math.abs(days)}日`;
      return `${shortLabel}まで${days}日`;
    };

    return (
      <section className="space-y-4">
        {backupReminder && <div className="card p-3 border border-yellow-300 bg-yellow-50 text-yellow-800 text-sm">{backupReminder}</div>}

        <article className="card p-4">
          <h2 className="text-lg font-extrabold">車両ホーム</h2>
          <p className="text-sm text-gray-600 mt-1">カードをタップすると車両詳細へ移動します。</p>
        </article>

        <div className="space-y-4">
          {vehicles.map((v) => {
            const photo = v.photoBlob ? URL.createObjectURL(v.photoBlob) : '';
            const deadlines = [
              { key: 'inspection', label: '車検満了日', shortLabel: '車検', date: v.inspectionDue },
              { key: 'insurance', label: '任意保険満了日', shortLabel: '保険', date: v.insuranceExpiry },
              { key: 'tax', label: '自動車税納付期限', shortLabel: '税', date: v.taxDue }
            ];

            return (
              <button
                key={v.id}
                type="button"
                className="card w-full text-left overflow-hidden border border-white/70 active:scale-[0.99]"
                onClick={() => goToVehicleDetail(v)}
                aria-label={`${v.name || '車両'}の詳細へ移動`}
              >
                <div className="w-full h-44 bg-gray-200">
                  {photo ? (
                    <img src={photo} alt={`${v.name}の車両写真`} className="w-full h-full object-cover" />
                  ) : (
                    <VehiclePlaceholder name={v.name} />
                  )}
                </div>

                <div className="px-4 py-4 space-y-2">
                  <p className="text-xl font-extrabold leading-tight">{v.name || '車種未設定'}</p>
                  <p className="text-base text-gray-700">{v.plate || 'ナンバー未設定'}</p>
                  <p className="text-base font-semibold">現在走行距離: {Number(v.currentMileage || 0).toLocaleString()} km</p>
                </div>

                <div className="px-4 pb-4">
                  <p className="text-sm font-bold text-gray-700 mb-2">期限管理</p>
                  <div className="space-y-2">
                    {deadlines.map((item) => {
                      const days = item.date ? daysUntil(item.date) : 9999;
                      return (
                        <p
                          key={item.key}
                          className={`text-sm font-bold px-3 py-2 rounded-xl border ${deadlineClass(days, !!item.date)}`}
                          title={`${item.label}: ${formatDate(item.date)}`}
                        >
                          {deadlineText(item.shortLabel, item.date)}
                        </p>
                      );
                    })}
                  </div>
                </div>
              </button>
            );
          })}

          {!vehicles.length && (
            <article className="card p-6 text-center">
              <p className="text-base text-gray-600">車両が未登録です。車両タブから登録してください。</p>
            </article>
          )}
        </div>
      </section>
    );
  }

  function renderVehicles() {
    const sortedVehicles = [...vehicles].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

    return (
      <section className="space-y-4">
        <article className="card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`px-3 py-2 rounded-xl text-sm font-bold border ${vehicleManageMode === 'register' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white'}`}
              onClick={() => setVehicleManageMode('register')}
            >
              車両登録
            </button>
            <button
              type="button"
              className={`px-3 py-2 rounded-xl text-sm font-bold border ${vehicleManageMode === 'list' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white'}`}
              onClick={() => setVehicleManageMode('list')}
            >
              登録済み車両の確認・編集
            </button>
          </div>
        </article>

        {vehicleManageMode === 'register' && (
          <article className="card p-4 space-y-3">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2"
              onClick={() => setShowVehicleRegisterForm((prev) => !prev)}
              aria-expanded={showVehicleRegisterForm}
              aria-controls="vehicle-register-form"
            >
              <span className="font-bold">車両登録</span>
              <span className="text-xs text-gray-500">登録済み: {vehicles.length} / 5 台 {showVehicleRegisterForm ? '▲' : '▼'}</span>
            </button>

            {showVehicleRegisterForm && (
              <form id="vehicle-register-form" className="space-y-3" onSubmit={addVehicle}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Field label="車種名"><input className="input" name="name" placeholder="例: プリウス" required /></Field>
                  <Field label="ナンバー"><input className="input" name="plate" placeholder="例: 品川300 あ 12-34" /></Field>
                  <Field label="年式"><input className="input" name="year" type="number" min="1900" max="2100" placeholder="例: 2022" /></Field>
                  <Field label="現在走行距離(km)"><input className="input" name="currentMileage" type="number" min="0" placeholder="例: 24500" /></Field>
                  <Field label="排気量(cc)"><input className="input" name="displacementCc" type="number" min="0" placeholder="例: 1800" /></Field>
                  <Field label="現在装着タイヤ">
                    <select className="select" name="currentTireType" defaultValue="夏タイヤ">
                      <option value="夏タイヤ">夏タイヤ</option>
                      <option value="冬タイヤ">冬タイヤ</option>
                    </select>
                  </Field>
                  <Field label="車検満了日"><input className="input" name="inspectionDue" type="date" /></Field>
                  <Field label="自動車税納付期限"><input className="input" name="taxDue" type="date" /></Field>
                  <Field label="車両写真"><input className="input" name="photo" type="file" accept="image/*" /></Field>
                </div>
                <button className="w-full py-2 rounded-xl bg-indigo-600 text-white font-bold" disabled={vehicles.length >= 5}>
                  {vehicles.length >= 5 ? '上限到達（最大5台）' : '車両を登録'}
                </button>
              </form>
            )}
          </article>
        )}

        {vehicleManageMode === 'list' && (
          <article className="card p-4 space-y-3">
            <h2 className="font-bold">登録済み車両</h2>
            <div className="space-y-2">
              {sortedVehicles.map((v) => (
                <div key={v.id} className="rounded-lg border bg-gray-50 p-3 space-y-2">
                  <p className="font-semibold">{v.name || '車種未設定'} / {v.plate || 'ナンバー未設定'}</p>
                  <p className="text-xs text-gray-600">年式: {v.year || '-'} / 走行距離: {Number(v.currentMileage || 0).toLocaleString()} km</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button className="px-3 py-1 rounded bg-indigo-100 text-indigo-700" onClick={() => goToVehicleDetail(v)}>車両情報を開く</button>
                    <button className="px-3 py-1 rounded bg-gray-200" onClick={() => editVehicleBasic(v)}>編集</button>
                    <button className="px-3 py-1 rounded bg-red-100 text-red-700" onClick={() => deleteVehicle(v.id)}>削除</button>
                  </div>

                  {editingVehicleId === Number(v.id) && (
                    <form className="mt-2 p-3 rounded bg-white border space-y-2" onSubmit={(e) => saveVehicleEdit(e, v.id)}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <Field label="車種名"><input className="input" value={vehicleEditForm.name} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, name: e.target.value })} required /></Field>
                        <Field label="ナンバー"><input className="input" value={vehicleEditForm.plate} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, plate: e.target.value })} /></Field>
                        <Field label="年式"><input className="input" type="number" min="1900" max="2100" value={vehicleEditForm.year} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, year: e.target.value })} /></Field>
                        <Field label="現在走行距離(km)"><input className="input" type="number" min="0" value={vehicleEditForm.currentMileage} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, currentMileage: e.target.value })} /></Field>
                        <Field label="排気量(cc)"><input className="input" type="number" min="0" value={vehicleEditForm.displacementCc} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, displacementCc: e.target.value })} /></Field>
                        <Field label="現在装着タイヤ">
                          <select className="select" value={vehicleEditForm.currentTireType} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, currentTireType: e.target.value })}>
                            <option value="夏タイヤ">夏タイヤ</option>
                            <option value="冬タイヤ">冬タイヤ</option>
                          </select>
                        </Field>
                        <Field label="車検満了日"><input className="input" type="date" value={vehicleEditForm.inspectionDue} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, inspectionDue: e.target.value })} /></Field>
                        <Field label="自動車税納付期限"><input className="input" type="date" value={vehicleEditForm.taxDue} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, taxDue: e.target.value })} /></Field>
                        <Field label="夏タイヤサイズ"><input className="input" value={vehicleEditForm.tireSummer} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, tireSummer: e.target.value })} /></Field>
                        <Field label="冬タイヤサイズ"><input className="input" value={vehicleEditForm.tireWinter} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, tireWinter: e.target.value })} /></Field>
                        <Field label="オイル粘度"><input className="input" value={vehicleEditForm.oilViscosity} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, oilViscosity: e.target.value })} /></Field>
                        <Field label="バッテリー型番"><input className="input" value={vehicleEditForm.batteryModel} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, batteryModel: e.target.value })} /></Field>
                        <Field label="ワイパー(運転席)"><input className="input" value={vehicleEditForm.wiperDriver} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, wiperDriver: e.target.value })} /></Field>
                        <Field label="ワイパー(助手席)"><input className="input" value={vehicleEditForm.wiperPassenger} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, wiperPassenger: e.target.value })} /></Field>
                        <Field label="ワイパー(リア)"><input className="input" value={vehicleEditForm.wiperRear} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, wiperRear: e.target.value })} /></Field>
                        <Field label="エアフィルター"><input className="input" value={vehicleEditForm.airFilter} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, airFilter: e.target.value })} /></Field>
                        <Field label="ブレーキパッド"><input className="input" value={vehicleEditForm.brakePad} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, brakePad: e.target.value })} /></Field>
                        <Field label="車両写真（変更時のみ）"><input className="input" name="editVehiclePhoto" type="file" accept="image/*" /></Field>
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={vehicleEditForm.taxPaid} onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, taxPaid: e.target.checked })} />
                        自動車税を納付済みにする
                      </label>
                      <div className="flex gap-2">
                        <button type="submit" className="px-3 py-1 rounded bg-indigo-600 text-white">保存</button>
                        <button type="button" className="px-3 py-1 rounded bg-gray-300" onClick={() => setEditingVehicleId(null)}>キャンセル</button>
                      </div>
                    </form>
                  )}
                </div>
              ))}
              {!sortedVehicles.length && <p className="text-sm text-gray-500">車両が未登録です。まず「車両登録」から追加してください。</p>}
            </div>
          </article>
        )}
      </section>
    );
  }

  function renderVehicleInfo() {
    const selectedVehicle = vehicles.find((v) => String(v.id) === String(selectedVehicleId)) || null;
    const vehicleMaintenances = selectedVehicle
      ? maintenances
        .filter((m) => String(m.vehicleId) === String(selectedVehicle.id))
        .sort((a, b) => new Date(b.doneDate || b.reservationDate || b.createdAt || 0) - new Date(a.doneDate || a.reservationDate || a.createdAt || 0))
      : [];
    const linkedInsurances = selectedVehicle
      ? insurances
        .filter((item) => String(item.vehicleId) === String(selectedVehicle.id))
        .sort((a, b) => new Date(b.endDate || b.createdAt || 0) - new Date(a.endDate || a.createdAt || 0))
      : [];

    const hasValue = (value) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'number') return value > 0;
      if (typeof value === 'boolean') return value;
      return String(value).trim() !== '';
    };

    const rows = selectedVehicle ? [
      { label: '車種名', value: selectedVehicle.name || '' },
      { label: 'ナンバー', value: selectedVehicle.plate || '' },
      { label: '年式', value: selectedVehicle.year ? `${selectedVehicle.year}年` : '' },
      { label: '現在走行距離', value: Number(selectedVehicle.currentMileage || 0) > 0 ? `${Number(selectedVehicle.currentMileage || 0).toLocaleString()} km` : '' },
      { label: '排気量', value: Number(selectedVehicle.displacementCc || 0) > 0 ? `${Number(selectedVehicle.displacementCc || 0).toLocaleString()} cc` : '' },
      { label: '自動車税(年額)', value: Number(selectedVehicle.autoTaxAnnual || 0) > 0 ? `¥${Number(selectedVehicle.autoTaxAnnual || 0).toLocaleString()}` : '' },
      { label: '自動車税納付期限', value: selectedVehicle.taxDue ? formatDate(selectedVehicle.taxDue) : '' },
      { label: '車検満了日', value: selectedVehicle.inspectionDue ? formatDate(selectedVehicle.inspectionDue) : '' },
      { label: '現在装着タイヤ', value: selectedVehicle.currentTireType || '' },
      { label: '夏タイヤサイズ', value: selectedVehicle.tireSummer || '' },
      { label: '冬タイヤサイズ', value: selectedVehicle.tireWinter || '' },
      { label: 'オイル粘度', value: selectedVehicle.oilViscosity || '' },
      { label: 'バッテリー型番', value: selectedVehicle.batteryModel || '' },
      { label: 'ワイパー(運転席)', value: selectedVehicle.wiperDriver || '' },
      { label: 'ワイパー(助手席)', value: selectedVehicle.wiperPassenger || '' },
      { label: 'ワイパー(リア)', value: selectedVehicle.wiperRear || '' },
      { label: 'エアフィルター', value: selectedVehicle.airFilter || '' },
      { label: 'ブレーキパッド', value: selectedVehicle.brakePad || '' },
      { label: 'NOJチケット残数', value: Number(selectedVehicle.nojTicketRemaining || 0) > 0 ? `${Number(selectedVehicle.nojTicketRemaining || 0)} 枚` : '' },
      { label: '自動車税納付ステータス', value: selectedVehicle.taxPaid ? '納付済み' : '' }
    ].filter((item) => hasValue(item.value)) : [];

    return (
      <section className="space-y-4">
        <article id="vehicle-info-panel" className="card p-4 space-y-3">
          <h2 className="text-lg font-extrabold">車両情報（入力済み項目）</h2>
          {selectedVehicle ? (
            <>
              {selectedVehicle.photoBlob && (
                <img src={URL.createObjectURL(selectedVehicle.photoBlob)} alt={`${selectedVehicle.name || '車両'}の写真`} className="w-full max-w-md rounded-xl border object-cover" />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {rows.map((item) => (
                  <div key={item.label} className="rounded border bg-gray-50 px-3 py-2">
                    <span className="text-gray-500">{item.label}:</span> {item.value}
                  </div>
                ))}
                {!rows.length && <p className="text-gray-500">入力済みの車両情報がありません。</p>}
              </div>

              <div className="pt-2 border-t space-y-2">
                <h3 className="font-bold">保険情報（保険タブ登録データ）</h3>
                <div className="space-y-2 text-sm">
                  {linkedInsurances.map((item) => {
                    const imageUrl = item.coverageImageBlob ? URL.createObjectURL(item.coverageImageBlob) : '';
                    return (
                      <div key={item.id} className="rounded border bg-gray-50 px-3 py-2">
                        <p className="font-semibold">{item.type || '-'} / 証券番号: {item.policyNo || '-'}</p>
                        <p>期間: {formatDate(item.startDate)} 〜 {formatDate(item.endDate)}</p>
                        <p>保険会社: {item.companyName || '-'} / <a className="text-blue-600" href={item.companyPhone ? `tel:${item.companyPhone}` : '#'}>{item.companyPhone || '-'}</a></p>
                        <p>代理店: {item.agencyName || '-'} / <a className="text-blue-600" href={item.agencyPhone ? `tel:${item.agencyPhone}` : '#'}>{item.agencyPhone || '-'}</a></p>
                        {item.note && <p>メモ: {item.note}</p>}
                        {imageUrl && <img src={imageUrl} alt="任意保険の補償内容" className="mt-2 w-full max-w-sm rounded-lg border" />}
                      </div>
                    );
                  })}
                  {!linkedInsurances.length && <p className="text-gray-500">この車両の保険情報は未登録です。</p>}
                </div>
              </div>

              <div className="pt-2 border-t">
                <h3 className="font-bold mb-2">メンテナンス履歴</h3>
                <div className="space-y-2 text-sm">
                  {vehicleMaintenances.map((m) => (
                    <div key={m.id} className="rounded border bg-gray-50 px-3 py-2">
                      <p className="font-semibold">{formatDate(m.doneDate || m.reservationDate)} / {m.category || '-'} / {m.status || '-'}</p>
                      <p>作業: {m.work || '-'}</p>
                      <p>店舗: {m.store || '-'} / 担当: {m.person || '-'}</p>
                      <p>費用: ¥{Number(m.cost || 0).toLocaleString()} / 走行距離: {Number(m.odometer || 0).toLocaleString()} km</p>
                    </div>
                  ))}
                  {!vehicleMaintenances.length && <p className="text-gray-500">この車両のメンテナンス履歴はまだありません。</p>}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">ヘッダーまたはホーム画面で対象車両を選択すると、車両情報を表示します。</p>
          )}
        </article>
      </section>
    );
  }

  function renderMaintenance() {
    const filtered = maintenances
      .filter((m) => (maintenanceFilterVehicle ? String(m.vehicleId) === maintenanceFilterVehicle : true))
      .filter((m) => (maintenanceFilterStatus ? m.status === maintenanceFilterStatus : true))
      .filter((m) => {
        const eventDate = m.doneDate || m.reservationDate || '';
        if (maintenanceDateFrom && eventDate < maintenanceDateFrom) return false;
        if (maintenanceDateTo && eventDate > maintenanceDateTo) return false;
        return true;
      })
      .filter((m) => {
        const target = `${m.work || ''} ${m.store || ''} ${m.category || ''}`.toLowerCase();
        return maintenanceKeyword ? target.includes(maintenanceKeyword.toLowerCase()) : true;
      })
      .sort((a, b) => {
        if (maintenanceSortKey === 'cost-asc') return Number(a.cost || 0) - Number(b.cost || 0);
        if (maintenanceSortKey === 'cost-desc') return Number(b.cost || 0) - Number(a.cost || 0);
        if (maintenanceSortKey === 'odo-asc') return Number(a.odometer || 0) - Number(b.odometer || 0);
        if (maintenanceSortKey === 'odo-desc') return Number(b.odometer || 0) - Number(a.odometer || 0);
        if (maintenanceSortKey === 'date-asc') return new Date(a.doneDate || a.reservationDate || 0) - new Date(b.doneDate || b.reservationDate || 0);
        return new Date(b.doneDate || b.reservationDate || 0) - new Date(a.doneDate || a.reservationDate || 0);
      });

    const filteredIds = filtered.map((m) => Number(m.id));
    const selectedCount = maintenanceSelectedIds.filter((id) => filteredIds.includes(Number(id))).length;
    const allChecked = !!filteredIds.length && selectedCount === filteredIds.length;
    const maintenanceFormVehicle = vehicles.find((v) => String(v.id) === String(maintenanceDraft.vehicleId));
    const currentNojTickets = Number(maintenanceFormVehicle?.nojTicketRemaining || 0);

    return (
      <section className="space-y-4">
        <form className="card p-4 space-y-3" onSubmit={addMaintenance}>
          <h2 className="font-bold">メンテナンス & 予約登録</h2>
          <div className="grid grid-cols-2 gap-2">
            <Field label="車両">
              <select
                className="select"
                name="vehicleId"
                value={maintenanceDraft.vehicleId}
                onChange={(e) => setMaintenanceDraft({ ...maintenanceDraft, vehicleId: e.target.value })}
                required
              >
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="カテゴリ">
              <select
                className="select"
                name="category"
                value={maintenanceDraft.category}
                onChange={(e) => setMaintenanceDraft({ ...maintenanceDraft, category: e.target.value })}
              >
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
            {maintenanceDraft.category === 'NOJメンテナンス' && (
              <>
                <Field label="NOJチケット操作">
                  <select
                    className="select"
                    value={maintenanceDraft.nojTicketAction}
                    onChange={(e) => setMaintenanceDraft({ ...maintenanceDraft, nojTicketAction: e.target.value })}
                  >
                    <option value="use">メンテ実施（1枚消費）</option>
                    <option value="purchase">チケット購入（枚数追加）</option>
                  </select>
                </Field>
                <Field label="現在のチケット残数">
                  <input className="input" value={`${currentNojTickets} 枚`} readOnly />
                </Field>
                {maintenanceDraft.nojTicketAction === 'use' && currentNojTickets <= 0 && (
                  <p className="col-span-2 text-xs text-red-600">残チケットがありません。購入を選択してチケット枚数を追加してください。</p>
                )}
                {maintenanceDraft.nojTicketAction === 'purchase' && (
                  <Field label="購入枚数">
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={maintenanceDraft.nojTicketCount}
                      onChange={(e) => setMaintenanceDraft({ ...maintenanceDraft, nojTicketCount: e.target.value })}
                      placeholder="購入枚数"
                    />
                  </Field>
                )}
              </>
            )}
            <Field label="ステータス">
              <select className="select" name="status"><option>未予約</option><option>予約済み</option><option>完了</option></select>
            </Field>
            <Field label="予約日"><input className="input" name="reservationDate" type="date" /></Field>
            <Field label="予約時間"><input className="input" name="reservationTime" type="time" /></Field>
            <Field label="店舗リスト">
              <select className="select" value={maintenanceDraft.shopId} onChange={(e) => applyShopToMaintenanceDraft(e.target.value)}>
                <option value="">店舗を選択（手入力可）</option>
                {shops.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="店舗名"><input className="input" name="store" value={maintenanceDraft.store} onChange={(e) => setMaintenanceDraft({ ...maintenanceDraft, store: e.target.value })} /></Field>
            <Field label="担当者"><input className="input" name="person" value={maintenanceDraft.person} onChange={(e) => setMaintenanceDraft({ ...maintenanceDraft, person: e.target.value })} /></Field>
            <Field label="電話"><input className="input" name="phone" value={maintenanceDraft.phone} onChange={(e) => setMaintenanceDraft({ ...maintenanceDraft, phone: e.target.value })} /></Field>
            <Field label="実施日"><input className="input" name="doneDate" type="date" /></Field>
            <Field label="走行距離"><input className="input" name="odometer" type="number" /></Field>
            <Field label="費用"><input className="input" name="cost" type="number" /></Field>
            <Field label="次回予定日"><input className="input" name="nextDate" type="date" /></Field>
          </div>
          <Field label="作業内容"><textarea className="textarea" rows="2" name="work" /></Field>
          <Field label={`領収書等画像（最大${maintenanceImageLimit}枚）`}><input className="input" name="images" type="file" accept="image/*" multiple /></Field>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={maintenanceDraft.calendarSync}
              onChange={(e) => setMaintenanceDraft({ ...maintenanceDraft, calendarSync: e.target.checked })}
            />
            Googleカレンダーに自動登録する（保存時）
          </label>
          <p className="text-xs text-gray-500">※ 保存後にGoogleカレンダー作成画面が別タブで開きます。</p>
          <button className="w-full py-2 rounded-xl bg-indigo-600 text-white font-bold">保存</button>
        </form>

        <article className="card p-4 space-y-2">
          <h3 className="font-bold">カテゴリ管理</h3>
          <div className="flex gap-2">
            <input className="input" value={maintenanceNewCategory} onChange={(e) => setMaintenanceNewCategory(e.target.value)} placeholder="新規カテゴリ" />
            <button className="px-3 rounded bg-gray-800 text-white" onClick={() => { addCategory(maintenanceNewCategory); setMaintenanceNewCategory(''); }}>追加</button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {categories.map((c) => (
              <div key={c.id} className="px-2 py-1 rounded bg-gray-100 border flex items-center gap-1">
                <span>{c.name}</span>
                <button className="text-blue-600" onClick={() => renameCategory(c.id, c.name)}>編集</button>
                {!c.isDefault && <button className="text-red-600" onClick={() => removeCategory(c.id, c.name)}>削除</button>}
              </div>
            ))}
          </div>
        </article>

        <article className="card p-4 space-y-2">
          <h3 className="font-bold">店舗リスト管理</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input className="input" placeholder="店舗名" value={newShopForm.name} onChange={(e) => setNewShopForm({ ...newShopForm, name: e.target.value })} />
            <input className="input" placeholder="電話番号" value={newShopForm.phone} onChange={(e) => setNewShopForm({ ...newShopForm, phone: e.target.value })} />
            <input className="input" placeholder="担当者" value={newShopForm.person} onChange={(e) => setNewShopForm({ ...newShopForm, person: e.target.value })} />
          </div>
          <button className="px-3 py-2 rounded bg-indigo-600 text-white text-sm" onClick={addShopMaster}>店舗を追加</button>
          <div className="space-y-1 text-xs">
            {shops.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded border bg-gray-50 px-2 py-1">
                <span>{s.name} / {s.phone || '-'} / {s.person || '-'}</span>
                <button className="text-red-600" onClick={() => removeShopMaster(s.id, s.name)}>削除</button>
              </div>
            ))}
            {!shops.length && <p className="text-gray-500">店舗リストは未登録です。</p>}
          </div>
        </article>

        <article className="card p-4 space-y-2">
          <h3 className="font-bold">検索・フィルタ</h3>
          <div className="grid grid-cols-2 gap-2">
            <select className="select" value={maintenanceFilterVehicle} onChange={(e) => setMaintenanceFilterVehicle(e.target.value)}>
              <option value="">車両すべて</option>
              {vehicles.map((v) => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
            </select>
            <select className="select" value={maintenanceFilterStatus} onChange={(e) => setMaintenanceFilterStatus(e.target.value)}>
              <option value="">ステータスすべて</option>
              <option>未予約</option><option>予約済み</option><option>完了</option>
            </select>
            <input className="input" placeholder="作業・店舗検索" value={maintenanceKeyword} onChange={(e) => setMaintenanceKeyword(e.target.value)} />
            <select className="select" value={maintenanceSortKey} onChange={(e) => setMaintenanceSortKey(e.target.value)}>
              <option value="date-desc">日付 降順</option>
              <option value="date-asc">日付 昇順</option>
              <option value="cost-desc">費用 高い順</option>
              <option value="cost-asc">費用 低い順</option>
              <option value="odo-desc">距離 多い順</option>
              <option value="odo-asc">距離 少ない順</option>
            </select>
            <input className="input" type="date" value={maintenanceDateFrom} onChange={(e) => { setMaintenanceDateFrom(e.target.value); setMaintenancePeriodPreset(''); }} />
            <input className="input" type="date" value={maintenanceDateTo} onChange={(e) => { setMaintenanceDateTo(e.target.value); setMaintenancePeriodPreset(''); }} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs pt-1">
            {[['thisMonth', '今月'], ['m3', '3か月'], ['m6', '6か月'], ['y1', '1年']].map(([key, label]) => (
              <button key={key} className={`px-2.5 py-1 rounded border ${maintenancePeriodPreset === key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white'}`} onClick={() => applyMaintenancePreset(key)}>{label}</button>
            ))}
            <button className="px-2.5 py-1 rounded border bg-white" onClick={() => { setMaintenancePeriodPreset(''); setMaintenanceDateFrom(''); setMaintenanceDateTo(''); }}>クリア</button>
          </div>
          <div className="pt-2 space-y-2">
            <div className="flex gap-2">
              <input className="input" value={maintenanceFilterPresetName} onChange={(e) => setMaintenanceFilterPresetName(e.target.value)} placeholder="検索条件名を保存" />
              <button className="px-3 rounded bg-indigo-600 text-white" onClick={saveMaintenanceFilterPreset}>保存</button>
            </div>
            <div className="space-y-1 text-xs">
              {maintenanceSavedFilters.map((item) => (
                <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded border px-2 py-1">
                  <button className="text-left flex-1" onClick={() => applyMaintenanceFilterPreset(item)}>📌 {item.name}</button>
                  <button className="text-red-600 ml-2" onClick={() => deleteMaintenanceFilterPreset(item.id)}>削除</button>
                </div>
              ))}
              {!maintenanceSavedFilters.length && <p className="text-gray-500">保存済み条件なし</p>}
            </div>
          </div>
        </article>

        <article className="card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => toggleMaintenanceSelectAll(filteredIds, e.target.checked)}
              />
              表示中をすべて選択
            </label>
            <span className="text-xs text-gray-500">選択中: {selectedCount}件</span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button className="px-2.5 py-1 rounded bg-gray-100" onClick={() => bulkUpdateMaintenanceStatus('未予約')}>未予約へ一括変更</button>
            <button className="px-2.5 py-1 rounded bg-blue-100 text-blue-700" onClick={() => bulkUpdateMaintenanceStatus('予約済み')}>予約済みへ一括変更</button>
            <button className="px-2.5 py-1 rounded bg-green-100 text-green-700" onClick={() => bulkUpdateMaintenanceStatus('完了')}>完了へ一括変更</button>
            <button className="px-2.5 py-1 rounded bg-red-100 text-red-700" onClick={bulkDeleteMaintenances}>選択を一括削除</button>
          </div>

          <div className="mt-2 p-2 rounded bg-gray-50 border space-y-2">
            <p className="text-xs font-semibold text-gray-700">一括編集（入力した項目だけ選択レコードへ適用）</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select className="select" value={bulkMaintenanceForm.category} onChange={(e) => setBulkMaintenanceForm({ ...bulkMaintenanceForm, category: e.target.value })}>
                <option value="">カテゴリ変更なし</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <select className="select" value={bulkMaintenanceForm.status} onChange={(e) => setBulkMaintenanceForm({ ...bulkMaintenanceForm, status: e.target.value })}>
                <option value="">ステータス変更なし</option>
                <option>未予約</option><option>予約済み</option><option>完了</option>
              </select>
              <input className="input" value={bulkMaintenanceForm.store} onChange={(e) => setBulkMaintenanceForm({ ...bulkMaintenanceForm, store: e.target.value })} placeholder="店舗名（任意）" />
              <input className="input" value={bulkMaintenanceForm.person} onChange={(e) => setBulkMaintenanceForm({ ...bulkMaintenanceForm, person: e.target.value })} placeholder="担当者（任意）" />
              <input className="input" value={bulkMaintenanceForm.phone} onChange={(e) => setBulkMaintenanceForm({ ...bulkMaintenanceForm, phone: e.target.value })} placeholder="電話（任意）" />
              <input className="input" type="date" value={bulkMaintenanceForm.nextDate} onChange={(e) => setBulkMaintenanceForm({ ...bulkMaintenanceForm, nextDate: e.target.value })} />
            </div>
            <div className="flex gap-2 text-xs">
              <button className="px-3 py-1 rounded bg-indigo-600 text-white" onClick={applyBulkMaintenanceEdit}>選択へ一括適用</button>
              <button className="px-3 py-1 rounded bg-gray-200" onClick={() => setBulkMaintenanceForm({ category: '', status: '', store: '', person: '', phone: '', nextDate: '' })}>入力クリア</button>
            </div>
          </div>
        </article>

        <div className="space-y-2">
          {filtered.map((m) => (
            <article key={m.id} className="card p-4 text-sm space-y-2">
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={maintenanceSelectedIds.includes(Number(m.id))}
                    onChange={(e) => toggleMaintenanceSelected(Number(m.id), e.target.checked)}
                  />
                  <p className="font-semibold">{vehicleMap[String(m.vehicleId)]?.name || '-'} / {m.category}</p>
                </label>
                <span className={`badge ${m.status === '完了' ? 'bg-green-100 text-green-700' : m.status === '予約済み' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'}`}>{m.status}</span>
              </div>
              <p>予約: {formatDate(m.reservationDate)} {m.reservationTime || ''} / {m.store || '-'} / {m.person || '-'}</p>
              <p>電話: <a href={m.phone ? `tel:${m.phone}` : '#'} className="text-blue-600">{m.phone || '-'}</a></p>
              <p>実施: {formatDate(m.doneDate)} / {Number(m.odometer || 0).toLocaleString()} km / ¥{Number(m.cost || 0).toLocaleString()}</p>
              <p>内容: {m.work || '-'}</p>
              {m.category === 'NOJメンテナンス' && (
                <p>
                  NOJチケット: {m.nojTicketAction === 'purchase' ? `購入 +${Number(m.nojTicketChange || 0)}枚` : '利用 -1枚'}
                  {Number.isFinite(Number(m.nojTicketRemainingAfter)) ? ` / 実行後残数 ${Number(m.nojTicketRemainingAfter)}枚` : ''}
                </p>
              )}
              <p>次回: {formatDate(m.nextDate)}</p>
              {!!(m.images || []).length && (
                <div className="grid grid-cols-5 gap-1">
                  {m.images.map((img, idx) => <img key={idx} src={URL.createObjectURL(img)} alt="receipt" className="w-full h-14 object-cover rounded" />)}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" className="px-3 py-1 rounded bg-gray-200" onClick={() => editMaintenance(m)}>編集</button>
                <button type="button" className="px-3 py-1 rounded bg-blue-100 text-blue-700" onClick={() => cycleMaintenanceStatus(m)}>状態変更</button>
                <button type="button" className="px-3 py-1 rounded bg-red-100 text-red-700" onClick={() => deleteMaintenance(m.id)}>削除</button>
                <GoogleCalendarButton onClick={() => openMaintenanceGoogleCalendar(m)} />
              </div>
              {editingMaintenanceId === Number(m.id) && (
                <form className="mt-2 p-2 rounded bg-gray-100 space-y-2" onSubmit={(e) => saveMaintenanceEdit(e, m.id)}>
                  <div className="grid grid-cols-2 gap-2">
                    <select className="select" value={maintenanceEditForm.vehicleId} onChange={(e) => setMaintenanceEditForm({ ...maintenanceEditForm, vehicleId: e.target.value })}>
                      {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <select className="select" value={maintenanceEditForm.category} onChange={(e) => setMaintenanceEditForm({ ...maintenanceEditForm, category: e.target.value })}>
                      {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <select className="select" value={maintenanceEditForm.status} onChange={(e) => setMaintenanceEditForm({ ...maintenanceEditForm, status: e.target.value })}>
                      <option>未予約</option><option>予約済み</option><option>完了</option>
                    </select>
                    <input className="input" type="date" value={maintenanceEditForm.reservationDate} onChange={(e) => setMaintenanceEditForm({ ...maintenanceEditForm, reservationDate: e.target.value })} />
                    <input className="input" type="time" value={maintenanceEditForm.reservationTime} onChange={(e) => setMaintenanceEditForm({ ...maintenanceEditForm, reservationTime: e.target.value })} />
                    <input className="input" value={maintenanceEditForm.store} onChange={(e) => setMaintenanceEditForm({ ...maintenanceEditForm, store: e.target.value })} placeholder="店舗" />
                    <input className="input" value={maintenanceEditForm.person} onChange={(e) => setMaintenanceEditForm({ ...maintenanceEditForm, person: e.target.value })} placeholder="担当者" />
                    <input className="input" value={maintenanceEditForm.phone} onChange={(e) => setMaintenanceEditForm({ ...maintenanceEditForm, phone: e.target.value })} placeholder="電話" />
                    <input className="input" type="date" value={maintenanceEditForm.doneDate} onChange={(e) => setMaintenanceEditForm({ ...maintenanceEditForm, doneDate: e.target.value })} />
                    <input className="input" type="number" value={maintenanceEditForm.odometer} onChange={(e) => setMaintenanceEditForm({ ...maintenanceEditForm, odometer: e.target.value })} placeholder="走行距離" />
                    <input className="input" type="number" value={maintenanceEditForm.cost} onChange={(e) => setMaintenanceEditForm({ ...maintenanceEditForm, cost: e.target.value })} placeholder="費用" />
                    <input className="input" type="date" value={maintenanceEditForm.nextDate} onChange={(e) => setMaintenanceEditForm({ ...maintenanceEditForm, nextDate: e.target.value })} />
                    <input className="input" type="file" name="editMaintenanceImages" accept="image/*" multiple />
                  </div>
                  <textarea className="textarea" rows="2" value={maintenanceEditForm.work} onChange={(e) => setMaintenanceEditForm({ ...maintenanceEditForm, work: e.target.value })} placeholder="作業内容" />
                  <div className="flex gap-2">
                    <button type="submit" className="px-3 py-1 rounded bg-indigo-600 text-white">保存</button>
                    <button type="button" className="px-3 py-1 rounded bg-gray-300" onClick={() => setEditingMaintenanceId(null)}>キャンセル</button>
                  </div>
                </form>
              )}
            </article>
          ))}
          {!filtered.length && <p className="text-sm text-gray-500">データなし</p>}
        </div>
      </section>
    );
  }

  function renderInsurance() {
    const companyContacts = insuranceContacts.filter((item) => item.role === '保険会社');
    const agencyContacts = insuranceContacts.filter((item) => item.role === '代理店');

    return (
      <section className="space-y-4">
        <form className="card p-4 space-y-3" onSubmit={addInsurancePolicy}>
          <h2 className="font-bold">保険登録（自賠責 / 任意）</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Field label="対象車両">
              <select
                className="select"
                value={insuranceForm.vehicleId}
                onChange={(e) => setInsuranceForm({ ...insuranceForm, vehicleId: e.target.value })}
                required
              >
                <option value="">車両を選択</option>
                {vehicles.map((v) => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="保険種別">
              <select className="select" value={insuranceForm.type} onChange={(e) => setInsuranceForm({ ...insuranceForm, type: e.target.value })}>
                <option value="自賠責">自賠責</option>
                <option value="任意">任意</option>
              </select>
            </Field>

            <Field label="保険会社リスト">
              <select
                className="select"
                value={insuranceForm.companyContactId}
                onChange={(e) => applyInsuranceContact('保険会社', e.target.value)}
              >
                <option value="">保険会社を選択</option>
                {companyContacts.map((item) => (
                  <option key={item.id} value={String(item.id)}>{item.name}</option>
                ))}
              </select>
            </Field>
            <Field label="保険会社名">
              <input className="input" value={insuranceForm.companyName} onChange={(e) => setInsuranceForm({ ...insuranceForm, companyName: e.target.value })} required />
            </Field>

            <Field label="保険会社電話">
              <input className="input" value={insuranceForm.companyPhone} onChange={(e) => setInsuranceForm({ ...insuranceForm, companyPhone: e.target.value })} required />
            </Field>

            <Field label="代理店リスト">
              <select
                className="select"
                value={insuranceForm.agencyContactId}
                onChange={(e) => applyInsuranceContact('代理店', e.target.value)}
              >
                <option value="">代理店を選択</option>
                {agencyContacts.map((item) => (
                  <option key={item.id} value={String(item.id)}>{item.name}</option>
                ))}
              </select>
            </Field>
            <Field label="代理店名">
              <input className="input" value={insuranceForm.agencyName} onChange={(e) => setInsuranceForm({ ...insuranceForm, agencyName: e.target.value })} />
            </Field>
            <Field label="代理店電話">
              <input className="input" value={insuranceForm.agencyPhone} onChange={(e) => setInsuranceForm({ ...insuranceForm, agencyPhone: e.target.value })} />
            </Field>

            <Field label="開始日">
              <input className="input" type="date" value={insuranceForm.startDate} onChange={(e) => setInsuranceForm({ ...insuranceForm, startDate: e.target.value })} required />
            </Field>
            <Field label="満了日">
              <input className="input" type="date" value={insuranceForm.endDate} onChange={(e) => setInsuranceForm({ ...insuranceForm, endDate: e.target.value })} required />
            </Field>
            <Field label="証券番号">
              <input className="input" value={insuranceForm.policyNo} onChange={(e) => setInsuranceForm({ ...insuranceForm, policyNo: e.target.value })} />
            </Field>
          </div>

          <Field label="補足メモ"><textarea className="textarea" rows="2" value={insuranceForm.note} onChange={(e) => setInsuranceForm({ ...insuranceForm, note: e.target.value })} /></Field>

          {insuranceForm.type === '任意' && (
            <Field label="任意保険の補償内容画像">
              <input
                className="input"
                type="file"
                accept="image/*"
                onChange={(e) => setInsuranceImageFile(e.target.files?.[0] || null)}
              />
            </Field>
          )}

          <button className="w-full py-2 rounded-xl bg-indigo-600 text-white font-bold">保険情報を保存</button>
        </form>

        <article className="card p-4 space-y-2">
          <h3 className="font-bold">保険会社 / 代理店リスト</h3>
          <p className="text-xs text-gray-500">各行の「編集」から名称・電話番号・区分を更新できます。</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <select className="select" value={insuranceContactForm.role} onChange={(e) => setInsuranceContactForm({ ...insuranceContactForm, role: e.target.value })}>
              <option value="保険会社">保険会社</option>
              <option value="代理店">代理店</option>
            </select>
            <input className="input" placeholder="名称" value={insuranceContactForm.name} onChange={(e) => setInsuranceContactForm({ ...insuranceContactForm, name: e.target.value })} />
            <input className="input" placeholder="電話番号" value={insuranceContactForm.phone} onChange={(e) => setInsuranceContactForm({ ...insuranceContactForm, phone: e.target.value })} />
            <button className="px-3 py-2 rounded bg-indigo-600 text-white text-sm" onClick={addInsuranceContact}>リストへ追加</button>
          </div>

          <div className="space-y-1 text-sm">
            {insuranceContacts.map((item) => (
              <div key={item.id} className="rounded border bg-gray-50 px-3 py-2 space-y-2">
                {editingInsuranceContactId === Number(item.id) ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <select className="select" value={insuranceContactEditForm.role} onChange={(e) => setInsuranceContactEditForm({ ...insuranceContactEditForm, role: e.target.value })}>
                      <option value="保険会社">保険会社</option>
                      <option value="代理店">代理店</option>
                    </select>
                    <input className="input" value={insuranceContactEditForm.name} onChange={(e) => setInsuranceContactEditForm({ ...insuranceContactEditForm, name: e.target.value })} placeholder="名称" />
                    <input className="input" value={insuranceContactEditForm.phone} onChange={(e) => setInsuranceContactEditForm({ ...insuranceContactEditForm, phone: e.target.value })} placeholder="電話番号" />
                    <div className="flex items-center gap-2 text-xs">
                      <button className="px-3 py-1 rounded bg-indigo-600 text-white" onClick={() => saveInsuranceContactEdit(item.id)}>保存</button>
                      <button className="px-3 py-1 rounded bg-gray-200" onClick={() => setEditingInsuranceContactId(null)}>キャンセル</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <p>
                      <span className="font-semibold">[{item.role}]</span> {item.name}
                      {item.phone ? ` / ${item.phone}` : ''}
                    </p>
                    <div className="flex items-center gap-2">
                      <a className="text-blue-600" href={item.phone ? `tel:${item.phone}` : '#'}>発信</a>
                      <button className="text-indigo-600" onClick={() => editInsuranceContact(item)}>編集</button>
                      <button className="text-red-600" onClick={() => removeInsuranceContact(item.id, item.name)}>削除</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!insuranceContacts.length && <p className="text-gray-500">連絡先リストは未登録です。</p>}
          </div>
        </article>

        <article className="card p-4 space-y-3 text-sm">
          <h3 className="font-bold">登録済み保険一覧</h3>
          <p className="text-xs text-gray-500">各レコードの「編集」から契約内容を更新できます。</p>
          {insurances.map((item) => {
            const vehicleName = vehicleMap[String(item.vehicleId)]?.name || '未設定車両';
            const imageUrl = item.coverageImageBlob ? URL.createObjectURL(item.coverageImageBlob) : '';
            return (
              <div key={item.id} className="rounded-lg border bg-gray-50 p-3 space-y-2">
                <p className="font-semibold">{vehicleName} / {item.type}</p>

                {editingInsuranceId === Number(item.id) ? (
                  <form className="space-y-2" onSubmit={(e) => saveInsurancePolicyEdit(e, item.id)}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Field label="対象車両">
                        <select className="select" value={insuranceEditForm.vehicleId} onChange={(e) => setInsuranceEditForm({ ...insuranceEditForm, vehicleId: e.target.value })} required>
                          <option value="">車両を選択</option>
                          {vehicles.map((v) => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
                        </select>
                      </Field>
                      <Field label="保険種別">
                        <select className="select" value={insuranceEditForm.type} onChange={(e) => setInsuranceEditForm({ ...insuranceEditForm, type: e.target.value })}>
                          <option value="自賠責">自賠責</option>
                          <option value="任意">任意</option>
                        </select>
                      </Field>
                      <Field label="保険会社名"><input className="input" value={insuranceEditForm.companyName} onChange={(e) => setInsuranceEditForm({ ...insuranceEditForm, companyName: e.target.value })} required /></Field>
                      <Field label="保険会社電話"><input className="input" value={insuranceEditForm.companyPhone} onChange={(e) => setInsuranceEditForm({ ...insuranceEditForm, companyPhone: e.target.value })} required /></Field>
                      <Field label="代理店名"><input className="input" value={insuranceEditForm.agencyName} onChange={(e) => setInsuranceEditForm({ ...insuranceEditForm, agencyName: e.target.value })} /></Field>
                      <Field label="代理店電話"><input className="input" value={insuranceEditForm.agencyPhone} onChange={(e) => setInsuranceEditForm({ ...insuranceEditForm, agencyPhone: e.target.value })} /></Field>
                      <Field label="開始日"><input className="input" type="date" value={insuranceEditForm.startDate} onChange={(e) => setInsuranceEditForm({ ...insuranceEditForm, startDate: e.target.value })} required /></Field>
                      <Field label="満了日"><input className="input" type="date" value={insuranceEditForm.endDate} onChange={(e) => setInsuranceEditForm({ ...insuranceEditForm, endDate: e.target.value })} required /></Field>
                      <Field label="証券番号"><input className="input" value={insuranceEditForm.policyNo} onChange={(e) => setInsuranceEditForm({ ...insuranceEditForm, policyNo: e.target.value })} /></Field>
                    </div>
                    <Field label="補足メモ"><textarea className="textarea" rows="2" value={insuranceEditForm.note} onChange={(e) => setInsuranceEditForm({ ...insuranceEditForm, note: e.target.value })} /></Field>
                    {insuranceEditForm.type === '任意' && (
                      <Field label="補償内容画像（差し替え）">
                        <input className="input" type="file" accept="image/*" onChange={(e) => setInsuranceEditImageFile(e.target.files?.[0] || null)} />
                      </Field>
                    )}
                    <div className="flex gap-2">
                      <button type="submit" className="px-3 py-1 rounded bg-indigo-600 text-white">保存</button>
                      <button type="button" className="px-3 py-1 rounded bg-gray-200" onClick={() => { setEditingInsuranceId(null); setInsuranceEditImageFile(null); }}>キャンセル</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p>期間: {formatDate(item.startDate)} 〜 {formatDate(item.endDate)}</p>
                    <p>保険会社: {item.companyName || '-'} / <a className="text-blue-600" href={item.companyPhone ? `tel:${item.companyPhone}` : '#'}>{item.companyPhone || '-'}</a></p>
                    <p>代理店: {item.agencyName || '-'} / <a className="text-blue-600" href={item.agencyPhone ? `tel:${item.agencyPhone}` : '#'}>{item.agencyPhone || '-'}</a></p>
                    <p>証券番号: {item.policyNo || '-'}</p>
                    {item.note && <p>メモ: {item.note}</p>}
                    {imageUrl && <img src={imageUrl} alt="任意保険の補償内容" className="mt-2 w-full max-w-sm rounded-lg border" />}
                    <div className="pt-1 flex flex-wrap gap-2">
                      <button type="button" className="px-3 py-1 rounded bg-indigo-100 text-indigo-700" onClick={() => editInsurancePolicy(item)}>編集</button>
                      <button type="button" className="px-3 py-1 rounded bg-red-100 text-red-700" onClick={() => deleteInsurancePolicy(item.id)}>削除</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {!insurances.length && <p className="text-gray-500">保険情報は未登録です。</p>}
        </article>
      </section>
    );
  }

  function renderFuel() {
    const filteredFuelLogs = fuelLogs
      .filter((f) => (fuelFilterVehicle ? String(f.vehicleId) === String(fuelFilterVehicle) : true))
      .filter((f) => {
        const date = f.date || '';
        if (fuelDateFrom && date < fuelDateFrom) return false;
        if (fuelDateTo && date > fuelDateTo) return false;
        return true;
      })
      .sort((a, b) => {
        if (fuelSortKey === 'date-asc') return new Date(a.date || 0) - new Date(b.date || 0);
        if (fuelSortKey === 'total-desc') return Number(b.total || 0) - Number(a.total || 0);
        if (fuelSortKey === 'total-asc') return Number(a.total || 0) - Number(b.total || 0);
        if (fuelSortKey === 'kmpl-desc') return Number(b.kmpl || 0) - Number(a.kmpl || 0);
        if (fuelSortKey === 'kmpl-asc') return Number(a.kmpl || 0) - Number(b.kmpl || 0);
        return new Date(b.date || 0) - new Date(a.date || 0);
      });

    const monthMap = {};
    filteredFuelLogs.forEach((f) => {
      const key = (f.date || '').slice(0, 7);
      monthMap[key] = monthMap[key] || { cost: 0, kmplTotal: 0, count: 0 };
      monthMap[key].cost += Number(f.total || 0);
      if (f.kmpl) {
        monthMap[key].kmplTotal += Number(f.kmpl);
        monthMap[key].count += 1;
      }
    });
    const months = Object.entries(monthMap).sort((a, b) => b[0].localeCompare(a[0]));

    return (
      <section className="space-y-4">
        <form className="card p-4 space-y-3" onSubmit={addFuel}>
          <h2 className="font-bold">給油記録</h2>

          <input
            ref={fuelCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFuelReceiptCapture}
          />

          <button
            type="button"
            className="w-full py-3 rounded-2xl bg-indigo-600 text-white text-base font-bold shadow-md"
            onClick={() => fuelCameraInputRef.current?.click()}
            disabled={fuelReceiptProcessing}
          >
            📷 レシートを撮影して自動入力
          </button>

          {fuelReceiptProcessing && (
            <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-700">
              <p className="font-semibold">読み取り中...</p>
              <p>{fuelOcrMessage || '画像を解析しています。しばらくお待ちください。'}</p>
            </div>
          )}

          {fuelOcrMode === 'manual' && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <p className="font-semibold">手動入力モード</p>
              <p>{fuelOcrMessage || '必要項目を手動で入力してください。'}</p>
            </div>
          )}

          {fuelOcrMode === 'review' && fuelReceiptOcrResult && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 space-y-2 text-sm">
              <p className="font-semibold text-emerald-700">OCR確認結果</p>
              <p className="text-gray-700">{fuelOcrMessage}</p>
              <ul className="space-y-1 text-gray-700">
                <li>日時: {fuelReceiptOcrResult.date || '未検出'} {fuelReceiptOcrResult.time || ''}</li>
                <li>給油量: {fuelReceiptOcrResult.liters ?? '未検出'} L</li>
                <li>単価: {fuelReceiptOcrResult.unitPrice ?? '未検出'} 円/L</li>
                <li>総額: {fuelReceiptOcrResult.total ?? '未検出'} 円</li>
                <li>スタンド名: {fuelReceiptOcrResult.station || '未検出'}</li>
              </ul>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button type="button" className="px-3 py-2 rounded-lg bg-emerald-600 text-white font-semibold" onClick={confirmFuelOcrAndSave}>この内容で保存</button>
                <button type="button" className="px-3 py-2 rounded-lg bg-amber-500 text-white font-semibold" onClick={switchFuelOcrToManual}>手動で修正</button>
                <button type="button" className="px-3 py-2 rounded-lg bg-gray-300 text-gray-800 font-semibold" onClick={() => fuelCameraInputRef.current?.click()}>再撮影</button>
              </div>
            </div>
          )}

          {fuelReceiptBlob && (
            <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm space-y-2">
              <p className="font-semibold text-gray-700">読み取り対象レシート画像</p>
              <img src={URL.createObjectURL(fuelReceiptBlob)} alt="receipt preview" className="w-full max-h-60 object-contain rounded-lg bg-gray-50" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Field label="車両">
              <select className="select" name="vehicleId" required value={fuelDraft.vehicleId} onChange={(e) => updateFuelDraftField('vehicleId', e.target.value)}>
                {vehicles.map((v) => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="給油日"><input className="input" name="date" type="date" value={fuelDraft.date} onChange={(e) => updateFuelDraftField('date', e.target.value)} required /></Field>
            <Field label="総走行距離"><input className="input" name="odometer" type="number" value={fuelDraft.odometer} onChange={(e) => updateFuelDraftField('odometer', e.target.value)} required /></Field>
            <Field label="給油量(L)"><input className="input" name="liters" type="number" step="0.01" value={fuelDraft.liters} onChange={(e) => updateFuelDraftField('liters', e.target.value)} required /></Field>
            <Field label="単価"><input className="input" name="unitPrice" type="number" step="0.1" value={fuelDraft.unitPrice} onChange={(e) => updateFuelDraftField('unitPrice', e.target.value)} /></Field>
            <Field label="総額"><input className="input" name="total" type="number" value={fuelDraft.total} onChange={(e) => updateFuelDraftField('total', e.target.value)} /></Field>
            <Field label="ガソリンスタンド"><input className="input" name="station" value={fuelDraft.station} onChange={(e) => updateFuelDraftField('station', e.target.value)} /></Field>
          </div>
          <button className="w-full py-2 rounded-xl bg-indigo-600 text-white font-bold">保存</button>
        </form>

        <article className="card p-4 space-y-2">
          <h3 className="font-bold">給油検索・期間フィルタ</h3>
          <div className="grid grid-cols-2 gap-2">
            <select className="select" value={fuelFilterVehicle} onChange={(e) => setFuelFilterVehicle(e.target.value)}>
              <option value="">車両すべて</option>
              {vehicles.map((v) => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
            </select>
            <select className="select" value={fuelSortKey} onChange={(e) => setFuelSortKey(e.target.value)}>
              <option value="date-desc">日付 降順</option>
              <option value="date-asc">日付 昇順</option>
              <option value="total-desc">金額 高い順</option>
              <option value="total-asc">金額 低い順</option>
              <option value="kmpl-desc">燃費 高い順</option>
              <option value="kmpl-asc">燃費 低い順</option>
            </select>
            <input className="input" type="date" value={fuelDateFrom} onChange={(e) => { setFuelDateFrom(e.target.value); setFuelPeriodPreset(''); }} />
            <input className="input" type="date" value={fuelDateTo} onChange={(e) => { setFuelDateTo(e.target.value); setFuelPeriodPreset(''); }} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs pt-1">
            {[['thisMonth', '今月'], ['m3', '3か月'], ['m6', '6か月'], ['y1', '1年']].map(([key, label]) => (
              <button key={key} className={`px-2.5 py-1 rounded border ${fuelPeriodPreset === key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white'}`} onClick={() => applyFuelPreset(key)}>{label}</button>
            ))}
            <button className="px-2.5 py-1 rounded border bg-white" onClick={() => { setFuelPeriodPreset(''); setFuelDateFrom(''); setFuelDateTo(''); }}>クリア</button>
          </div>
          <div className="pt-2 space-y-2">
            <div className="flex gap-2">
              <input className="input" value={fuelFilterPresetName} onChange={(e) => setFuelFilterPresetName(e.target.value)} placeholder="検索条件名を保存" />
              <button className="px-3 rounded bg-indigo-600 text-white" onClick={saveFuelFilterPreset}>保存</button>
            </div>
            <div className="space-y-1 text-xs">
              {fuelSavedFilters.map((item) => (
                <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded border px-2 py-1">
                  <button className="text-left flex-1" onClick={() => applyFuelFilterPreset(item)}>📌 {item.name}</button>
                  <button className="text-red-600 ml-2" onClick={() => deleteFuelFilterPreset(item.id)}>削除</button>
                </div>
              ))}
              {!fuelSavedFilters.length && <p className="text-gray-500">保存済み条件なし</p>}
            </div>
          </div>
        </article>

        <article className="card p-4">
          <h3 className="font-bold mb-2">燃費推移グラフ（ヘッダーの対象車両に連動）</h3>
          <div style={{ height: '260px' }}>
            <canvas ref={chartRef}></canvas>
          </div>
        </article>

        <article className="card p-4">
          <h3 className="font-bold mb-2">ガソリン単価グラフ（フィルタ連動）</h3>
          <div style={{ height: '240px' }}>
            <canvas ref={fuelUnitPriceChartRef}></canvas>
          </div>
        </article>

        <article className="card p-4">
          <h3 className="font-bold mb-2">ガソリン料金グラフ（フィルタ連動）</h3>
          <div style={{ height: '240px' }}>
            <canvas ref={fuelCostChartRef}></canvas>
          </div>
        </article>

        <article className="card p-4">
          <h3 className="font-bold mb-2">月間集計（フィルタ適用結果）</h3>
          <div className="space-y-2 text-sm">
            {months.map(([month, v]) => (
              <div key={month} className="flex justify-between p-2 rounded bg-gray-50">
                <span>{month}</span>
                <span>ガソリン代: ¥{v.cost.toLocaleString()} / 平均燃費: {(v.count ? v.kmplTotal / v.count : 0).toFixed(2)} km/L</span>
              </div>
            ))}
            {!months.length && <p className="text-gray-500">該当データなし</p>}
          </div>
        </article>

        <article className="space-y-2">
          {filteredFuelLogs.map((f) => (
            <div key={f.id} className="card p-3 text-sm">
              <p className="font-semibold">{formatDate(f.date)} / {vehicleMap[String(f.vehicleId)]?.name || '-'}</p>
              <p>距離: {Number(f.odometer).toLocaleString()} km / 区間: {Number(f.distance || 0).toLocaleString()} km</p>
              <p>給油: {f.liters} L / 総額: ¥{Number(f.total).toLocaleString()} / 実燃費: {Number(f.kmpl || 0).toFixed(2)} km/L</p>
              <p>{f.station || ''}</p>
              {f.receiptBlob && (
                <div className="pt-2 space-y-2">
                  <img src={URL.createObjectURL(f.receiptBlob)} alt="給油レシート" className="w-full max-h-48 object-contain rounded-lg bg-gray-50 border" />
                  <button className="px-3 py-1 rounded bg-red-50 text-red-700 border border-red-200" onClick={() => deleteFuelReceiptImage(f.id)}>レシート画像を削除</button>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button className="px-3 py-1 rounded bg-gray-200" onClick={() => editFuelLog(f)}>編集</button>
                <button className="px-3 py-1 rounded bg-red-100 text-red-700" onClick={() => deleteFuelLog(f.id)}>削除</button>
              </div>
              {editingFuelId === Number(f.id) && (
                <div className="mt-2 p-2 rounded bg-gray-100 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select className="select" value={fuelEditForm.vehicleId} onChange={(e) => setFuelEditForm({ ...fuelEditForm, vehicleId: e.target.value })}>
                      {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <input className="input" type="date" value={fuelEditForm.date} onChange={(e) => setFuelEditForm({ ...fuelEditForm, date: e.target.value })} />
                    <input className="input" type="number" value={fuelEditForm.odometer} onChange={(e) => setFuelEditForm({ ...fuelEditForm, odometer: e.target.value })} placeholder="総走行距離" />
                    <input className="input" type="number" step="0.01" value={fuelEditForm.liters} onChange={(e) => setFuelEditForm({ ...fuelEditForm, liters: e.target.value })} placeholder="給油量(L)" />
                    <input className="input" type="number" step="0.1" value={fuelEditForm.unitPrice} onChange={(e) => setFuelEditForm({ ...fuelEditForm, unitPrice: e.target.value })} placeholder="単価" />
                    <input className="input" type="number" value={fuelEditForm.total} onChange={(e) => setFuelEditForm({ ...fuelEditForm, total: e.target.value })} placeholder="総額" />
                    <input className="input col-span-2" value={fuelEditForm.station} onChange={(e) => setFuelEditForm({ ...fuelEditForm, station: e.target.value })} placeholder="スタンド名" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="px-3 py-1 rounded bg-indigo-600 text-white" onClick={() => saveFuelEdit(f.id)}>保存</button>
                    <button type="button" className="px-3 py-1 rounded bg-gray-300" onClick={() => setEditingFuelId(null)}>キャンセル</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!filteredFuelLogs.length && <p className="text-sm text-gray-500">データなし</p>}
        </article>
      </section>
    );
  }

  function renderMore() {
    const filteredMemos = memos.filter((m) => memoKeyword ? (m.content || '').includes(memoKeyword) : true);
    const importantMemos = filteredMemos.filter((m) => m.important);
    const normalMemos = filteredMemos.filter((m) => !m.important);

    return (
      <section className="space-y-4">
        <form className="card p-4 space-y-3" onSubmit={addTireLog}>
          <h2 className="font-bold">タイヤ管理</h2>
          <div className="grid grid-cols-2 gap-2">
            <Field label="車両"><select className="select" name="vehicleId">{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
            <Field label="タイヤ種別"><select className="select" name="type"><option>夏タイヤ</option><option>冬タイヤ</option></select></Field>
            <Field label="作業"><select className="select" name="action"><option>履き替え</option><option>ローテーション</option><option>交換</option><option>残り溝点検</option></select></Field>
            <Field label="実施日"><input className="input" name="date" type="date" defaultValue={toYmd()} /></Field>
            <Field label="走行距離"><input className="input" name="odometer" type="number" /></Field>
            <Field label="店舗"><input className="input" name="shop" /></Field>
            <Field label="費用"><input className="input" name="cost" type="number" /></Field>
            <Field label="残り溝(mm)"><input className="input" name="treadDepth" type="number" step="0.1" /></Field>
          </div>
          <Field label="メモ"><input className="input" name="note" /></Field>
          <button className="w-full py-2 rounded-xl bg-indigo-600 text-white font-bold">保存</button>
        </form>

        <article className="card p-4 space-y-2 text-sm">
          <h3 className="font-bold">タイヤ履歴</h3>
          {tireLogs.map((t) => (
            <div key={t.id} className="p-2 rounded bg-gray-50">
              <p className="font-semibold">{formatDate(t.date)} / {vehicleMap[String(t.vehicleId)]?.name || '-'} / {t.action}</p>
              <p>{t.type} / {Number(t.odometer || 0).toLocaleString()} km / ¥{Number(t.cost || 0).toLocaleString()} / {t.shop || '-'}</p>
              <p className={Number(t.treadDepth || 0) <= 1.6 ? 'text-red-600 font-bold' : ''}>残り溝: {t.treadDepth || '-'} mm {Number(t.treadDepth || 0) <= 1.6 ? '⚠ 交換推奨' : ''}</p>
              <div className="flex gap-2 pt-1">
                <button className="px-3 py-1 rounded bg-gray-200" onClick={() => editTireLog(t)}>編集</button>
                <button className="px-3 py-1 rounded bg-red-100 text-red-700" onClick={() => deleteTireLog(t.id)}>削除</button>
              </div>
              {editingTireId === Number(t.id) && (
                <div className="mt-2 p-2 rounded bg-gray-100 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select className="select" value={tireEditForm.vehicleId} onChange={(e) => setTireEditForm({ ...tireEditForm, vehicleId: e.target.value })}>
                      {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <select className="select" value={tireEditForm.type} onChange={(e) => setTireEditForm({ ...tireEditForm, type: e.target.value })}><option>夏タイヤ</option><option>冬タイヤ</option></select>
                    <select className="select" value={tireEditForm.action} onChange={(e) => setTireEditForm({ ...tireEditForm, action: e.target.value })}><option>履き替え</option><option>ローテーション</option><option>交換</option><option>残り溝点検</option></select>
                    <input className="input" type="date" value={tireEditForm.date} onChange={(e) => setTireEditForm({ ...tireEditForm, date: e.target.value })} />
                    <input className="input" type="number" value={tireEditForm.odometer} onChange={(e) => setTireEditForm({ ...tireEditForm, odometer: e.target.value })} placeholder="走行距離" />
                    <input className="input" value={tireEditForm.shop} onChange={(e) => setTireEditForm({ ...tireEditForm, shop: e.target.value })} placeholder="店舗" />
                    <input className="input" type="number" value={tireEditForm.cost} onChange={(e) => setTireEditForm({ ...tireEditForm, cost: e.target.value })} placeholder="費用" />
                    <input className="input" type="number" step="0.1" value={tireEditForm.treadDepth} onChange={(e) => setTireEditForm({ ...tireEditForm, treadDepth: e.target.value })} placeholder="残り溝(mm)" />
                  </div>
                  <input className="input" value={tireEditForm.note} onChange={(e) => setTireEditForm({ ...tireEditForm, note: e.target.value })} placeholder="メモ" />
                  <div className="flex gap-2">
                    <button type="button" className="px-3 py-1 rounded bg-indigo-600 text-white" onClick={() => saveTireEdit(t.id)}>保存</button>
                    <button type="button" className="px-3 py-1 rounded bg-gray-300" onClick={() => setEditingTireId(null)}>キャンセル</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </article>

        <form className="card p-4 space-y-3" onSubmit={addMemo}>
          <h2 className="font-bold">自由メモ・日記</h2>
          <div className="grid grid-cols-2 gap-2">
            <Field label="車両"><select className="select" name="vehicleId">{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
            <Field label="日付"><input className="input" name="date" type="date" defaultValue={toYmd()} /></Field>
            <Field label="タグ"><select className="select" name="tag">{MEMO_TAGS.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="写真"><input className="input" name="photo" type="file" accept="image/*" /></Field>
          </div>
          <Field label="内容"><textarea className="textarea" rows="2" name="content" required /></Field>
          <label className="inline-flex items-center gap-2"><input type="checkbox" name="important" /> 重要（★）</label>
          <button className="w-full py-2 rounded-xl bg-indigo-600 text-white font-bold">保存</button>
        </form>

        <article className="card p-4">
          <h3 className="font-bold mb-2">メモ検索</h3>
          <input className="input" value={memoKeyword} onChange={(e) => setMemoKeyword(e.target.value)} placeholder="キーワード検索" />
          <div className="mt-3 space-y-2 text-sm">
            {importantMemos.map((m) => (
              <div key={m.id} className="p-2 rounded border-2 border-yellow-300 bg-yellow-50">
                <p className="font-semibold">★ {formatDate(m.date)} / {vehicleMap[String(m.vehicleId)]?.name || '-'} / {m.tag}</p>
                <p>{m.content}</p>
                {m.photoBlob && <img src={URL.createObjectURL(m.photoBlob)} alt="memo" className="mt-1 w-28 h-28 object-cover rounded" />}
                <div className="flex gap-2 pt-1">
                  <button className="px-3 py-1 rounded bg-gray-200" onClick={() => editMemo(m)}>編集</button>
                  <button className="px-3 py-1 rounded bg-yellow-100 text-yellow-700" onClick={() => toggleMemoImportant(m)}>★解除</button>
                  <button className="px-3 py-1 rounded bg-red-100 text-red-700" onClick={() => deleteMemo(m.id)}>削除</button>
                </div>
                {editingMemoId === Number(m.id) && (
                  <form className="mt-2 p-2 rounded bg-white space-y-2" onSubmit={(e) => saveMemoEdit(e, m.id)}>
                    <div className="grid grid-cols-2 gap-2">
                      <select className="select" value={memoEditForm.vehicleId} onChange={(e) => setMemoEditForm({ ...memoEditForm, vehicleId: e.target.value })}>
                        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      <input className="input" type="date" value={memoEditForm.date} onChange={(e) => setMemoEditForm({ ...memoEditForm, date: e.target.value })} />
                      <select className="select" value={memoEditForm.tag} onChange={(e) => setMemoEditForm({ ...memoEditForm, tag: e.target.value })}>
                        {MEMO_TAGS.map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={memoEditForm.important} onChange={(e) => setMemoEditForm({ ...memoEditForm, important: e.target.checked })} /> 重要</label>
                      <input className="input col-span-2" name="editMemoPhoto" type="file" accept="image/*" />
                    </div>
                    <textarea className="textarea" rows="2" value={memoEditForm.content} onChange={(e) => setMemoEditForm({ ...memoEditForm, content: e.target.value })} />
                    <div className="flex gap-2">
                      <button type="submit" className="px-3 py-1 rounded bg-indigo-600 text-white">保存</button>
                      <button type="button" className="px-3 py-1 rounded bg-gray-300" onClick={() => setEditingMemoId(null)}>キャンセル</button>
                    </div>
                  </form>
                )}
              </div>
            ))}
            {normalMemos.map((m) => (
              <div key={m.id} className="p-2 rounded bg-gray-50">
                <p className="font-semibold">{formatDate(m.date)} / {vehicleMap[String(m.vehicleId)]?.name || '-'} / {m.tag}</p>
                <p>{m.content}</p>
                {m.photoBlob && <img src={URL.createObjectURL(m.photoBlob)} alt="memo" className="mt-1 w-28 h-28 object-cover rounded" />}
                <div className="flex gap-2 pt-1">
                  <button className="px-3 py-1 rounded bg-gray-200" onClick={() => editMemo(m)}>編集</button>
                  <button className="px-3 py-1 rounded bg-yellow-100 text-yellow-700" onClick={() => toggleMemoImportant(m)}>★重要</button>
                  <button className="px-3 py-1 rounded bg-red-100 text-red-700" onClick={() => deleteMemo(m.id)}>削除</button>
                </div>
                {editingMemoId === Number(m.id) && (
                  <form className="mt-2 p-2 rounded bg-white space-y-2" onSubmit={(e) => saveMemoEdit(e, m.id)}>
                    <div className="grid grid-cols-2 gap-2">
                      <select className="select" value={memoEditForm.vehicleId} onChange={(e) => setMemoEditForm({ ...memoEditForm, vehicleId: e.target.value })}>
                        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      <input className="input" type="date" value={memoEditForm.date} onChange={(e) => setMemoEditForm({ ...memoEditForm, date: e.target.value })} />
                      <select className="select" value={memoEditForm.tag} onChange={(e) => setMemoEditForm({ ...memoEditForm, tag: e.target.value })}>
                        {MEMO_TAGS.map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={memoEditForm.important} onChange={(e) => setMemoEditForm({ ...memoEditForm, important: e.target.checked })} /> 重要</label>
                      <input className="input col-span-2" name="editMemoPhoto" type="file" accept="image/*" />
                    </div>
                    <textarea className="textarea" rows="2" value={memoEditForm.content} onChange={(e) => setMemoEditForm({ ...memoEditForm, content: e.target.value })} />
                    <div className="flex gap-2">
                      <button type="submit" className="px-3 py-1 rounded bg-indigo-600 text-white">保存</button>
                      <button type="button" className="px-3 py-1 rounded bg-gray-300" onClick={() => setEditingMemoId(null)}>キャンセル</button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        </article>

        <article className="card p-4 space-y-3">
          <h2 className="font-bold">緊急連絡先</h2>
          <div className="space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className="p-2 rounded bg-gray-50 text-sm">
                <input className="input mb-1" value={c.name || ''} onChange={(e) => saveContact(c.id, 'name', e.target.value)} />
                <input className="input mb-1" value={c.phone || ''} onChange={(e) => saveContact(c.id, 'phone', e.target.value)} placeholder="電話番号" />
                <a className="text-blue-600" href={c.phone ? `tel:${c.phone}` : '#'}>ワンタップ発信</a>
              </div>
            ))}
          </div>
        </article>

        <article className="card p-4 space-y-2">
          <h2 className="font-bold">画像圧縮設定</h2>
          <p className="text-xs text-gray-500">登録/編集時の写真圧縮に適用されます。</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Field label="圧縮品質">
              <select className="select" value={String(imageQuality)} onChange={(e) => setImageQuality(Number(e.target.value))}>
                <option value="0.5">0.5（軽量）</option>
                <option value="0.7">0.7（標準）</option>
                <option value="0.85">0.85（高画質）</option>
              </select>
            </Field>
            <Field label="最大辺(px)">
              <select className="select" value={String(imageMaxSize)} onChange={(e) => setImageMaxSize(Number(e.target.value))}>
                <option value="600">600</option>
                <option value="800">800</option>
                <option value="1200">1200</option>
              </select>
            </Field>
            <Field label="整備画像上限(1件あたり)">
              <select className="select" value={String(maintenanceImageLimit)} onChange={(e) => setMaintenanceImageLimit(Number(e.target.value))}>
                <option value="1">1枚</option>
                <option value="2">2枚</option>
                <option value="3">3枚</option>
                <option value="4">4枚</option>
                <option value="5">5枚</option>
              </select>
            </Field>
            <Field label="再圧縮対象">
              <select className="select" value={recompressTarget} onChange={(e) => setRecompressTarget(e.target.value)} disabled={isRecompressing}>
                <option value="all">全画像（車両+整備+メモ）</option>
                <option value="vehicles">車両写真のみ</option>
                <option value="maintenances">整備画像のみ</option>
                <option value="memos">メモ写真のみ</option>
              </select>
            </Field>
          </div>
          <div className="rounded-lg border bg-gray-50 p-3 space-y-2">
            <p className="text-xs text-gray-600">現在保存済みの画像を、上記設定で一括再圧縮できます。</p>
            {(isRecompressing || recompressProgress.total > 0) && (
              <div className="space-y-1">
                <p className="text-xs text-gray-600">
                  進捗: {recompressProgress.done} / {recompressProgress.total} 枚
                  {recompressProgress.total > 0 && `（${Math.floor((recompressProgress.done / recompressProgress.total) * 100)}%）`}
                </p>
                <p className="text-xs text-gray-500">
                  {isRecompressing
                    ? (recompressPaused ? '一時停止中' : '処理中')
                    : '処理待機中'}
                  {recompressProgress.total > 0 ? ` / 残り目安: ${formatDuration(recompressProgress.etaSeconds)}` : ''}
                </p>
                <div className="h-2 bg-gray-200 rounded overflow-hidden">
                  <div
                    className="h-2 bg-indigo-500"
                    style={{ width: `${recompressProgress.total ? Math.min(100, (recompressProgress.done / recompressProgress.total) * 100) : 0}%` }}
                  ></div>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button
                className={`flex-1 py-2 rounded-xl font-bold ${isRecompressing ? 'bg-gray-300 text-gray-600' : 'bg-indigo-600 text-white'}`}
                onClick={recompressStoredImages}
                disabled={isRecompressing}
              >
                {isRecompressing ? '再圧縮中…' : '既存画像を一括再圧縮'}
              </button>
              {isRecompressing && (
                <button
                  className={`px-4 py-2 rounded-xl font-bold ${recompressPaused ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}
                  onClick={toggleRecompressPause}
                >
                  {recompressPaused ? '再開' : '一時停止'}
                </button>
              )}
            </div>
          </div>
        </article>

        {renderIcsExportControls()}

        <article className="card p-4 space-y-2">
          <h2 className="font-bold">バックアップ & 復元</h2>
          <button className="w-full py-2 rounded-xl bg-green-600 text-white font-bold" onClick={backupAll}>完全バックアップ（ZIP）</button>
          <button className="w-full py-2 rounded-xl bg-emerald-600 text-white font-bold" onClick={exportCsvZip}>CSVエクスポート（ZIP）</button>
          <label className="block text-sm">
            <span className="label">復元用ZIPを選択</span>
            <input className="input" type="file" accept=".zip" onChange={(e) => restoreAll(e.target.files[0])} />
          </label>
        </article>
      </section>
    );
  }

  function renderCalendar() {
    const month = calendarMonth;
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const startWeekday = firstDay.getDay();

    const eventsByDate = {};
    vehicles.forEach((v) => {
      [['車検期限', v.inspectionDue, 'red'], ['保険期限', v.insuranceExpiry, 'orange'], ['自動車税期限', v.taxDue, 'yellow']].forEach(([label, date, color]) => {
        if (!date) return;
        eventsByDate[date] = eventsByDate[date] || [];
        eventsByDate[date].push({ type: label, color, vehicle: v.name });
      });
    });
    maintenances.forEach((m) => {
      if (m.reservationDate) {
        eventsByDate[m.reservationDate] = eventsByDate[m.reservationDate] || [];
        eventsByDate[m.reservationDate].push({ type: '予約', color: 'blue', vehicle: vehicleMap[String(m.vehicleId)]?.name || '-' });
      }
      if (m.doneDate) {
        eventsByDate[m.doneDate] = eventsByDate[m.doneDate] || [];
        eventsByDate[m.doneDate].push({ type: '完了整備', color: 'green', vehicle: vehicleMap[String(m.vehicleId)]?.name || '-' });
      }
    });
    fuelLogs.forEach((f) => {
      if (!f.date) return;
      eventsByDate[f.date] = eventsByDate[f.date] || [];
      eventsByDate[f.date].push({ type: '給油', color: 'yellow', vehicle: vehicleMap[String(f.vehicleId)]?.name || '-' });
    });

    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ d, key, events: eventsByDate[key] || [] });
    }

    return (
      <section className="space-y-4">
        <article className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <button className="px-3 py-1 rounded bg-gray-100" onClick={() => setCalendarMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
            <h2 className="font-bold">{month.getFullYear()}年 {month.getMonth() + 1}月</h2>
            <button className="px-3 py-1 rounded bg-gray-100" onClick={() => setCalendarMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
          </div>
          <div className="calendar-grid text-xs mb-1 text-center font-semibold text-gray-500">
            {['日', '月', '火', '水', '木', '金', '土'].map((w) => <div key={w}>{w}</div>)}
          </div>
          <div className="calendar-grid">
            {cells.map((c, idx) => (
              <button key={idx} className={`min-h-16 rounded p-1 border text-left ${c ? 'bg-white' : 'bg-transparent border-transparent'}`} onClick={() => c && setPickedDate(c.key)}>
                {c && (
                  <>
                    <div className="text-xs font-bold">{c.d}</div>
                    <div className="space-y-0.5">
                      {c.events.slice(0, 3).map((e, i) => <div key={i} className={`h-1 rounded ${e.color === 'red' ? 'bg-red-500' : e.color === 'blue' ? 'bg-blue-500' : e.color === 'green' ? 'bg-green-500' : e.color === 'orange' ? 'bg-orange-500' : 'bg-yellow-500'}`}></div>)}
                    </div>
                  </>
                )}
              </button>
            ))}
          </div>
        </article>

        <article className="card p-4 text-sm">
          <h3 className="font-bold mb-2">{pickedDate ? `${formatDate(pickedDate)} の予定` : '日付をタップしてください'}</h3>
          <div className="space-y-1">
            {(eventsByDate[pickedDate] || []).map((e, i) => (
              <div key={i} className="p-2 rounded bg-gray-50">{e.type} / {e.vehicle}</div>
            ))}
            {pickedDate && !(eventsByDate[pickedDate] || []).length && <p className="text-gray-500">イベントなし</p>}
          </div>
        </article>

        {renderIcsExportControls()}
      </section>
    );
  }

  const currentView =
    tab === 'dashboard' ? renderDashboard() :
    tab === 'vehicleInfo' ? renderVehicleInfo() :
    tab === 'vehicles' ? renderVehicles() :
    tab === 'maintenance' ? renderMaintenance() :
    tab === 'insurance' ? renderInsurance() :
    tab === 'calendar' ? renderCalendar() :
    tab === 'fuel' ? renderFuel() :
    tab === 'settings' ? renderMore() :
    renderDashboard();

  return (
    <div className="app-shell max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-6">
      <header className="sticky-top pb-2 z-10">
        <div className="card app-header-card p-3">
          <h1 className="text-lg font-extrabold">カーライフマネージャー</h1>
          <p className="text-xs text-gray-500">完全オフライン対応 / PWA / iPhone最適化</p>
          <div className="mt-2">
            <label className="text-xs font-semibold mr-2">対象車両:</label>
            <select className="select inline-block w-56" value={selectedVehicleId} onChange={(e) => setSelectedVehicleId(e.target.value)}>
              <option value="">全車両</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        </div>
      </header>

      <div className="mt-3 md:grid md:grid-cols-[220px_1fr] md:gap-4">
        <aside className="hidden md:block">
          <nav className="card app-side-nav p-2 sticky top-24">
            <ul className="space-y-1">
              {APP_TABS.map((t) => (
                <li key={t.key}>
                  <button
                    className={`nav-btn w-full text-left px-3 py-2 rounded-lg text-sm ${tab === t.key ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-gray-100 text-gray-700'}`}
                    onClick={() => openTab(t.key)}
                  >
                    <span className="nav-icon" aria-hidden="true">{t.icon}</span>
                    <span className="nav-label">{t.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main className="app-main pb-20 md:pb-0">{currentView}</main>
      </div>

      <nav className="bottom-nav fixed bottom-0 left-0 right-0 bg-white/95 border-t z-20 md:hidden">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${APP_TABS.length}, minmax(0, 1fr))` }}>
          {APP_TABS.map((t) => (
            <li key={t.key}>
              <button className={`bottom-nav-btn w-full py-2 text-xs ${tab === t.key ? 'text-indigo-600 font-bold' : 'text-gray-500'}`} onClick={() => openTab(t.key)}>
                <div className="bottom-nav-icon" aria-hidden="true">{t.icon}</div>
                <div className="bottom-nav-label">{t.label}</div>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <footer className="hidden md:block text-center text-xs text-gray-500 mt-6">
        データはすべてIndexedDBに保存され、オフラインで利用できます。
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
