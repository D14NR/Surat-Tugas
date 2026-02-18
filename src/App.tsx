import { useEffect, useMemo, useState } from "react";

const DATA_PENGAJAR_URL =
  "https://docs.google.com/spreadsheets/d/1-EwYoIjBgl-zSdpReESV1UKzxbexTcXKxDBO0KrGwZg/gviz/tq?tqx=out:json&sheet=Data%20Pengajar";
const SURAT_TUGAS_URL =
  "https://docs.google.com/spreadsheets/d/1-EwYoIjBgl-zSdpReESV1UKzxbexTcXKxDBO0KrGwZg/gviz/tq?tqx=out:json&sheet=Surat%20Tugas";
const PELAYANAN_URL =
  "https://docs.google.com/spreadsheets/d/1-EwYoIjBgl-zSdpReESV1UKzxbexTcXKxDBO0KrGwZg/gviz/tq?tqx=out:json&sheet=Pelayanan";
const PERMINTAAN_URL =
  "https://docs.google.com/spreadsheets/d/1PQNdVQUJa-YQaWv-KZdIC7WE3VVlRAxpX5XT79NMJos/gviz/tq?tqx=out:json&sheet=Permintaan";
// Satu URL Apps Script untuk semua aksi (permintaan + profil)
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxghMzspCQmcKgJnPvRSryEpMgGkOzYvQJI-ijqf2cB9Gpo28qyN7efyUa3QQcSCidv/exec";
const PERMINTAAN_APPS_SCRIPT_URL = APPS_SCRIPT_URL;
const PENGAJAR_APPS_SCRIPT_URL = APPS_SCRIPT_URL;
const AUTH_STORAGE_KEY = "surat-tugas-auth";

const monthNames = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

const dayNames = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];

type Pengajar = {
  kode: string; nama: string; bidangStudi: string; email: string;
  whatsapp: string; domisili: string; username: string; password: string;
};

type SuratTugas = {
  username: string; kodePengajar: string; tanggal: string;
  dateObj: Date | null; sesi: string[];
};

type LeaderboardRecord = { nama: string; durasi: number; cabang: string };

type LeaderboardStats = {
  pelayananTerbanyak: { nama: string; jumlah: number }[];
  durasiTerbanyak: { nama: string; totalDurasi: number }[];
  cabangTerbanyak: { cabang: string; jumlah: number }[];
};

type JadwalItem = {
  tanggal: string; dateObj: Date | null; sesiKe: number;
  materi: string; status: string; kodePengajar: string;
};

type GroupedJadwal = {
  tanggal: string; dateObj: Date | null; status: string;
  kodePengajar: string; sessions: Array<{ sesiKe: number; materi: string }>;
};

type Permintaan = {
  id: string; nis: string; namaSiswa: string; cabang: string;
  tanggal: string; tanggalRaw: string; tanggalISO: string; tanggalDMY: string;
  dateObj: Date | null; mataPelajaran: string; pengajar: string; keperluan: string;
  status: string; tanggalDisetujui: string; jamDisetujui: string;
  timestamp: string; timestampRaw: string;
};

type PermintaanInput = { tanggal: string; jam: string; error?: string };

const normalizeHeader = (value: string) =>
  value.toLowerCase().replace(/\s+/g, "").replace(/[._-]/g, "");

const computeStats = (items: JadwalItem[], today: Date) => {
  const stats = { total: 0, upcoming: 0, past: 0, today: 0 };
  items.forEach((item) => {
    stats.total += 1;
    if (!item.dateObj) return;
    const time = item.dateObj.getTime();
    if (time === today.getTime()) stats.today += 1;
    else if (time > today.getTime()) stats.upcoming += 1;
    else stats.past += 1;
  });
  return stats;
};

const groupJadwal = (items: JadwalItem[]): GroupedJadwal[] => {
  const grouped: GroupedJadwal[] = [];
  const map = new Map<string, GroupedJadwal>();
  items.forEach((item) => {
    const dateKey = item.dateObj ? item.dateObj.toISOString() : item.tanggal;
    if (!map.has(dateKey)) {
      const entry: GroupedJadwal = {
        tanggal: item.tanggal, dateObj: item.dateObj,
        status: item.status, kodePengajar: item.kodePengajar, sessions: [],
      };
      map.set(dateKey, entry);
      grouped.push(entry);
    }
    map.get(dateKey)?.sessions.push({ sesiKe: item.sesiKe, materi: item.materi });
  });
  return grouped;
};

const parseSheet = (rawText: string) => {
  const cleaned = rawText.substring(rawText.indexOf("{"), rawText.lastIndexOf("}") + 1);
  const json = JSON.parse(cleaned);
  const { cols, rows } = json.table;
  const headers = cols.map((col: { label: string }) => col.label.trim());
  const values = rows.map(
    (row: { c: Array<{ v: string; f?: string } | null> }) =>
      row.c.map((cell) => {
        if (!cell) return "";
        const raw = cell.f ?? cell.v;
        return raw === null || raw === undefined ? "" : String(raw).trim();
      })
  );
  return { headers, values } as { headers: string[]; values: string[][] };
};

const parseGoogleDate = (value: string) => {
  const match = value.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
  if (!match) return null;
  return new Date(
    Number.parseInt(match[1], 10), Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10), Number.parseInt(match[4] ?? "0", 10),
    Number.parseInt(match[5] ?? "0", 10), Number.parseInt(match[6] ?? "0", 10)
  );
};

const parseDateValue = (value: string) => {
  if (!value) return null;
  const googleDate = parseGoogleDate(value);
  const raw = googleDate ?? new Date(value);
  if (Number.isNaN(raw.valueOf())) return null;
  raw.setHours(0, 0, 0, 0);
  return raw;
};

const parseDateTimeValue = (value: string) => {
  if (!value) return null;
  const googleDate = parseGoogleDate(value);
  const raw = googleDate ?? new Date(value);
  if (Number.isNaN(raw.valueOf())) return null;
  return raw;
};

const toISODate = (value: string) => {
  if (!value) return "";
  const parsed = parseDateValue(value);
  if (!parsed) return value;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

const toDMYDate = (value: string) => {
  if (!value) return "";
  const parsed = parseDateValue(value);
  if (!parsed) return value;
  return `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${parsed.getFullYear()}`;
};

const parseDuration = (value: string) => {
  if (!value) return 0;
  const normalized = value.toString().replace(/,/g, ".").trim();
  const numeric = Number.parseFloat(normalized);
  if (!Number.isNaN(numeric)) return numeric;
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : 0;
};

const toDateLabel = (value: string | Date) => {
  if (!value) return "";
  const raw = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(raw.valueOf())) return typeof value === "string" ? value : "";
  return `${dayNames[raw.getDay()]}, ${raw.getDate()} ${monthNames[raw.getMonth()]} ${raw.getFullYear()}`;
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const normalizeWhatsappToUsername = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("62")) return digits.slice(2);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
};

type TabType = "dashboard" | "leaderboard" | "jadwal-lengkap" | "riwayat-permintaan" | "edit-profil";

const NAV_ITEMS: { id: TabType; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "⊞" },
  { id: "jadwal-lengkap", label: "Jadwal Mengajar", icon: "📅" },
  { id: "leaderboard", label: "Leaderboard", icon: "🏆" },
  { id: "riwayat-permintaan", label: "Riwayat Permintaan", icon: "📋" },
  { id: "edit-profil", label: "Edit Profil", icon: "⚙️" },
];

export function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pengajar, setPengajar] = useState<Pengajar | null>(null);
  const [suratTugas, setSuratTugas] = useState<SuratTugas[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [leaderboardStats, setLeaderboardStats] = useState<LeaderboardStats | null>(null);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [jadwalFilter, setJadwalFilter] = useState<"all" | "monthly" | "weekday">("all");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterWeekday, setFilterWeekday] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(true);
  const [permintaan, setPermintaan] = useState<Permintaan[]>([]);
  const [permintaanInputs, setPermintaanInputs] = useState<Record<string, PermintaanInput>>({});
  const [permintaanActionLoading, setPermintaanActionLoading] = useState<Record<string, boolean>>({});
  const [permintaanActionError, setPermintaanActionError] = useState<Record<string, string>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profilForm, setProfilForm] = useState({
    nama: "", bidangStudi: "", email: "", whatsapp: "", domisili: "", username: "", password: "", konfirmasi: "",
  });
  const [profilLoading, setProfilLoading] = useState(false);
  const [profilMessage, setProfilMessage] = useState("");
  const [profilError, setProfilError] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showProfilPassword, setShowProfilPassword] = useState(false);
  const [showProfilKonfirmasi, setShowProfilKonfirmasi] = useState(false);
  const [authInitializing, setAuthInitializing] = useState(true);

  const today = useMemo(() => {
    const current = new Date();
    current.setHours(0, 0, 0, 0);
    return current;
  }, []);

  useEffect(() => {
    if (pengajar || !authInitializing) return;
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!saved) {
      setAuthInitializing(false);
      return;
    }
    try {
      const parsed = JSON.parse(saved) as { username?: string; password?: string };
      if (parsed?.username && parsed?.password) {
        setUsername(parsed.username);
        setPassword(parsed.password);
        void handleLoginFromStorage(parsed.username, parsed.password);
      } else {
        setAuthInitializing(false);
      }
    } catch {
      setAuthInitializing(false);
    }
  }, [authInitializing, pengajar]);

  useEffect(() => {
    if (!pengajar) return;
    setProfilForm({
      nama: pengajar.nama,
      bidangStudi: pengajar.bidangStudi,
      email: pengajar.email,
      whatsapp: pengajar.whatsapp,
      domisili: pengajar.domisili,
      username: normalizeWhatsappToUsername(pengajar.whatsapp || pengajar.username),
      password: "",
      konfirmasi: "",
    });
    setProfilMessage("");
    setProfilError("");
  }, [pengajar]);

  const { allStats, filteredStats, todayJadwal, groupedFilteredJadwal, groupedTodayJadwal } = useMemo(() => {
    const sorted = [...suratTugas].sort((a, b) => {
      if (!a.dateObj && !b.dateObj) return 0;
      if (!a.dateObj) return 1;
      if (!b.dateObj) return -1;
      const diffA = a.dateObj.getTime() - today.getTime();
      const diffB = b.dateObj.getTime() - today.getTime();
      const isFutureA = diffA >= 0;
      const isFutureB = diffB >= 0;
      if (isFutureA && isFutureB) return diffA - diffB;
      if (isFutureA && !isFutureB) return -1;
      if (!isFutureA && isFutureB) return 1;
      return diffB - diffA;
    });

    const jadwal: JadwalItem[] = sorted.flatMap((item) =>
      item.sesi.map((value, index) => {
        if (!value || value === "-") return null;
        let status = "Tanpa tanggal";
        if (item.dateObj) {
          const time = item.dateObj.getTime();
          if (time === today.getTime()) status = "Hari ini";
          else if (time > today.getTime()) status = "Akan datang";
          else status = "Terlewat";
        }
        return { tanggal: item.tanggal, dateObj: item.dateObj, sesiKe: index + 1, materi: value, status, kodePengajar: item.kodePengajar };
      }).filter((value): value is NonNullable<typeof value> => Boolean(value))
    );

    const allStats = computeStats(jadwal, today);
    let filtered = jadwal;

    if (jadwalFilter === "monthly" && filterMonth) {
      const [yearValue, monthValue] = filterMonth.split("-");
      const year = Number.parseInt(yearValue, 10);
      const month = Number.parseInt(monthValue, 10) - 1;
      filtered = jadwal.filter((item) => {
        if (!item.dateObj || Number.isNaN(year) || Number.isNaN(month)) return false;
        return item.dateObj.getFullYear() === year && item.dateObj.getMonth() === month;
      });
    } else if (jadwalFilter === "weekday" && filterWeekday) {
      const weekdayIndex = dayNames.findIndex((day) => day.toLowerCase() === filterWeekday.toLowerCase());
      filtered = jadwal.filter((item) => item.dateObj ? item.dateObj.getDay() === weekdayIndex : false);
    }

    const filteredStats = computeStats(filtered, today);
    const todayJadwal = jadwal.filter((item) => item.dateObj?.getTime() === today.getTime());
    const groupedFilteredJadwal = groupJadwal(filtered);
    const groupedTodayJadwal = groupJadwal(todayJadwal);

    return { allStats, filteredStats, todayJadwal, groupedFilteredJadwal, groupedTodayJadwal };
  }, [suratTugas, today, jadwalFilter, filterMonth, filterWeekday]);

  const permintaanPengajar = useMemo(() => {
    if (!pengajar) return [];
    const namaPengajar = normalizeText(pengajar.nama);
    return permintaan
      .filter((item) => normalizeText(item.pengajar) === namaPengajar)
      .sort((a, b) => {
        if (!a.dateObj && !b.dateObj) return 0;
        if (!a.dateObj) return 1;
        if (!b.dateObj) return -1;
        return b.dateObj.getTime() - a.dateObj.getTime();
      });
  }, [permintaan, pengajar]);

  const pendingPermintaan = useMemo(() => {
    return permintaanPengajar.filter((item) => {
      const status = normalizeText(item.status || "menunggu");
      return status === "" || status === "menunggu" || status === "pending";
    });
  }, [permintaanPengajar]);

  const performLogin = async (inputUsername: string, inputPassword: string, silent = false) => {
    if (!silent) {
      setError("");
    }
    setLeaderboardError("");
    setLoading(true);
    setLeaderboardLoading(true);

    try {
      const [pengajarResponse, suratResponse, pelayananResponse, permintaanResponse] = await Promise.all([
        fetch(DATA_PENGAJAR_URL), fetch(SURAT_TUGAS_URL), fetch(PELAYANAN_URL), fetch(PERMINTAAN_URL),
      ]);

      const pengajarSheet = parseSheet(await pengajarResponse.text());
      const suratSheet = parseSheet(await suratResponse.text());
      const pelayananSheet = parseSheet(await pelayananResponse.text());
      const permintaanSheet = parseSheet(await permintaanResponse.text());

      const pengajarIndex = (label: string) =>
        pengajarSheet.headers.findIndex((h) => normalizeHeader(h) === normalizeHeader(label));
      const suratIndex = (label: string) =>
        suratSheet.headers.findIndex((h) => normalizeHeader(h) === normalizeHeader(label));
      const permintaanIndex = (label: string) =>
        permintaanSheet.headers.findIndex((h) => normalizeHeader(h) === normalizeHeader(label));

      const usernameIndex = pengajarIndex("Username");
      const passwordIndex = pengajarIndex("Password");
      const normalizedUsername = inputUsername.trim().toLowerCase();
      const normalizedPassword = inputPassword.trim();

      const matched = pengajarSheet.values.find((row) => {
        const rowUsername = (row[usernameIndex] || "").trim().toLowerCase();
        const rowPassword = (row[passwordIndex] || "").trim();
        return rowUsername === normalizedUsername && rowPassword === normalizedPassword;
      });

      if (!matched) {
        if (!silent) {
          setError("Username atau password tidak ditemukan. Silakan periksa kembali.");
        }
        setLoading(false);
        return;
      }

      const selectedPengajar: Pengajar = {
        kode: matched[pengajarIndex("Kode Pengajar")],
        nama: matched[pengajarIndex("Nama")],
        bidangStudi: matched[pengajarIndex("Bidang Studi")],
        email: matched[pengajarIndex("Email")],
        whatsapp: matched[pengajarIndex("No.WhatsApp")],
        domisili: matched[pengajarIndex("Domisili")],
        username: normalizeWhatsappToUsername(matched[pengajarIndex("No.WhatsApp")] || matched[usernameIndex] || ""),
        password: matched[passwordIndex],
      };

      const suratUsernameIndex = suratIndex("Username");
      const suratKodeIndex = suratIndex("Kode Pengajar");
      const suratTanggalIndex = suratIndex("Tanggal");
      const sesiIndexes = Array.from({ length: 10 }, (_, i) => suratIndex(`Sesi ${i + 1}`));

      const suratData = suratSheet.values
        .filter((row) => row[suratUsernameIndex] === selectedPengajar.username)
        .map((row) => {
          const dateObj = parseDateValue(row[suratTanggalIndex]);
          return {
            username: row[suratUsernameIndex],
            kodePengajar: row[suratKodeIndex],
            tanggal: dateObj ? toDateLabel(dateObj) : row[suratTanggalIndex],
            dateObj, sesi: sesiIndexes.map((idx) => row[idx] ?? ""),
          };
        });

      const namaIndex = pelayananSheet.headers.findIndex((h) => normalizeHeader(h) === normalizeHeader("Nama"));
      const durasiIndex = pelayananSheet.headers.findIndex((h) => normalizeHeader(h) === normalizeHeader("Durasi"));
      const cabangIndex = pelayananSheet.headers.findIndex((h) => normalizeHeader(h) === normalizeHeader("Cabang"));

      const pelayananData: LeaderboardRecord[] = pelayananSheet.values.map((row) => ({
        nama: row[namaIndex] ?? "", durasi: parseDuration(row[durasiIndex] ?? ""), cabang: row[cabangIndex] ?? "",
      }));

      const pelayananMap = new Map<string, number>();
      const durasiMap = new Map<string, number>();
      const cabangMap = new Map<string, number>();

      pelayananData.forEach((record) => {
        const namaKey = record.nama.trim();
        const cabangKey = record.cabang.trim();
        if (namaKey) {
          pelayananMap.set(namaKey, (pelayananMap.get(namaKey) ?? 0) + 1);
          durasiMap.set(namaKey, (durasiMap.get(namaKey) ?? 0) + record.durasi);
        }
        if (cabangKey) cabangMap.set(cabangKey, (cabangMap.get(cabangKey) ?? 0) + 1);
      });

      const nisIndex = permintaanIndex("Nis");
      const namaSiswaIndex = permintaanIndex("Nama Siswa");
      const cabangPermintaanIndex = permintaanIndex("Cabang");
      const tanggalIndex = permintaanIndex("Tanggal");
      const mapelIndex = permintaanIndex("Mata Pelajaran");
      const pengajarPermintaanIndex = permintaanIndex("Pengajar");
      const keperluanIndex = permintaanIndex("Keperluan");
      const statusIndex = permintaanIndex("Status");
      const tanggalDisetujuiIndex = permintaanIndex("Tanggal disetujui");
      const tanggalDisetujuiAltIndex = permintaanIndex("Tanggal distujui");
      const jamDisetujuiIndex = permintaanIndex("Jam disetujui");
      const jamDisetujuiAltIndex = permintaanIndex("Jam distujui");
      const timestampIndex = permintaanIndex("Timestamp");

      const permintaanData: Permintaan[] = permintaanSheet.values.map((row, index) => {
        const rawTanggal = row[tanggalIndex] ?? "";
        const dateObj = parseDateValue(rawTanggal);
        const rawTimestamp = row[timestampIndex] ?? "";
        const parsedTimestamp = parseDateTimeValue(rawTimestamp);
        const formattedTimestamp = parsedTimestamp ? parsedTimestamp.toISOString() : rawTimestamp;
        const fallbackId = `${row[namaSiswaIndex] ?? "permintaan"}-${index}`;
        return {
          id: formattedTimestamp || rawTimestamp || fallbackId,
          nis: row[nisIndex] ?? "",
          namaSiswa: row[namaSiswaIndex] ?? "",
          cabang: row[cabangPermintaanIndex] ?? "",
          tanggal: dateObj ? toDateLabel(dateObj) : rawTanggal,
          tanggalRaw: rawTanggal, tanggalISO: toISODate(rawTanggal), tanggalDMY: toDMYDate(rawTanggal),
          dateObj, mataPelajaran: row[mapelIndex] ?? "",
          pengajar: row[pengajarPermintaanIndex] ?? "",
          keperluan: row[keperluanIndex] ?? "",
          status: row[statusIndex] ?? "",
          tanggalDisetujui: row[tanggalDisetujuiIndex !== -1 ? tanggalDisetujuiIndex : tanggalDisetujuiAltIndex] ?? "",
          jamDisetujui: row[jamDisetujuiIndex !== -1 ? jamDisetujuiIndex : jamDisetujuiAltIndex] ?? "",
          timestamp: formattedTimestamp || rawTimestamp || "",
          timestampRaw: rawTimestamp,
        };
      });

      setLeaderboardStats({
        pelayananTerbanyak: Array.from(pelayananMap.entries()).map(([nama, jumlah]) => ({ nama, jumlah })).sort((a, b) => b.jumlah - a.jumlah).slice(0, 5),
        durasiTerbanyak: Array.from(durasiMap.entries()).map(([nama, totalDurasi]) => ({ nama, totalDurasi })).sort((a, b) => b.totalDurasi - a.totalDurasi).slice(0, 5),
        cabangTerbanyak: Array.from(cabangMap.entries()).map(([cabang, jumlah]) => ({ cabang, jumlah })).sort((a, b) => b.jumlah - a.jumlah).slice(0, 5),
      });
      setLeaderboardError("");
      setLeaderboardLoading(false);
      setPengajar(selectedPengajar);
      setSuratTugas(suratData);
      setPermintaan(permintaanData);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ username: inputUsername, password: inputPassword }));
    } catch {
      if (!silent) {
        setError("Gagal memuat data. Pastikan koneksi internet aktif dan coba lagi.");
      }
      setLeaderboardError("Gagal memuat leaderboard. Silakan coba lagi.");
      setLeaderboardLoading(false);
    } finally {
      setLoading(false);
      setAuthInitializing(false);
    }
  };

  const handleLoginFromStorage = async (storedUsername: string, storedPassword: string) => {
    await performLogin(storedUsername, storedPassword, true);
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await performLogin(username, password);
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setPengajar(null); setSuratTugas([]); setLeaderboardStats(null);
    setPermintaan([]); setPermintaanInputs({}); setPermintaanActionLoading({});
    setPermintaanActionError({}); setActiveTab("dashboard");
    setUsername(""); setPassword(""); setError("");
    setJadwalFilter("all"); setFilterMonth(""); setFilterWeekday("");
  };

  const handlePermintaanInputChange = (id: string, field: "tanggal" | "jam", value: string) => {
    setPermintaanInputs((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value, error: undefined } }));
    setPermintaanActionError((prev) => ({ ...prev, [id]: "" }));
  };

  const updatePermintaanStatus = async (
    payload: { nis: string; namaSiswa: string; tanggal: string; tanggalISO?: string; tanggalDMY?: string; tanggalRaw?: string; status: string; tanggalDisetujui?: string; jamDisetujui?: string; },
    id: string
  ) => {
    setPermintaanActionLoading((prev) => ({ ...prev, [id]: true }));
    setPermintaanActionError((prev) => ({ ...prev, [id]: "" }));

    const bodyPayload = {
      nis: payload.nis, namaSiswa: payload.namaSiswa, "Nama Siswa": payload.namaSiswa,
      tanggal: payload.tanggalISO || payload.tanggalRaw || payload.tanggal || "",
      tanggalISO: payload.tanggalISO || "", tanggalDMY: payload.tanggalDMY || "",
      tanggalRaw: payload.tanggalRaw || "", status: payload.status,
      tanggalDisetujui: payload.tanggalDisetujui || "", jamDisetujui: payload.jamDisetujui || "",
      action: "update-permintaan",
    };

    const tryFetch = async (mode: RequestMode) =>
      fetch(PERMINTAAN_APPS_SCRIPT_URL, {
        method: "POST", mode,
        headers: mode === "cors" ? { "Content-Type": "application/json" } : undefined,
        body: JSON.stringify(bodyPayload),
      });

    const tryForm = async () => {
      const formBody = new URLSearchParams();
      Object.entries(bodyPayload).forEach(([k, v]) => formBody.append(k, v));
      return fetch(PERMINTAAN_APPS_SCRIPT_URL, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody.toString(),
      });
    };

    try {
      const response = await tryFetch("cors");
      if (response.type === "opaque") { setPermintaanActionLoading((prev) => ({ ...prev, [id]: false })); return true; }
      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await response.json() : { success: response.ok };
      if (!data?.success) throw new Error(data?.message || "Gagal memperbarui status permintaan.");
      setPermintaanActionLoading((prev) => ({ ...prev, [id]: false }));
      return true;
    } catch {
      try {
        await tryForm();
        setPermintaanActionLoading((prev) => ({ ...prev, [id]: false }));
        return true;
      } catch (fallbackError) {
        setPermintaanActionLoading((prev) => ({ ...prev, [id]: false }));
        setPermintaanActionError((prev) => ({ ...prev, [id]: fallbackError instanceof Error ? fallbackError.message : "Gagal mengirim permintaan." }));
        return false;
      }
    }
  };

  const updateProfilSpreadsheet = async (payload: {
    kodePengajar: string;
    nama: string;
    bidangStudi: string;
    email: string;
    whatsapp: string;
    domisili: string;
    username: string;
    password: string;
  }) => {
    const bodyPayload = {
      action: "updateProfil",
      kodePengajar: payload.kodePengajar,
      "Kode Pengajar": payload.kodePengajar,
      nama: payload.nama,
      "Nama": payload.nama,
      bidangStudi: payload.bidangStudi,
      "Bidang Studi": payload.bidangStudi,
      email: payload.email,
      "Email": payload.email,
      whatsapp: payload.whatsapp,
      noWhatsApp: payload.whatsapp,
      "No.WhatsApp": payload.whatsapp,
      domisili: payload.domisili,
      "Domisili": payload.domisili,
      username: payload.username,
      "Username": payload.username,
      password: payload.password,
      "Password": payload.password,
    };

    const tryFetch = async (mode: RequestMode) =>
      fetch(PENGAJAR_APPS_SCRIPT_URL, {
        method: "POST",
        mode,
        headers: mode === "cors" ? { "Content-Type": "application/json" } : undefined,
        body: JSON.stringify(bodyPayload),
      });

    const tryForm = async (url: string) => {
      const formBody = new URLSearchParams();
      Object.entries(bodyPayload).forEach(([k, v]) => formBody.append(k, v));
      return fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody.toString(),
      });
    };

    try {
      const response = await tryFetch("cors");
      if (response.type === "opaque") return { success: true, opaque: true };
      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await response.json() : { success: response.ok };
      if (!data?.success) throw new Error(data?.message || "Gagal menyimpan perubahan profil.");
      return { success: true, opaque: false };
    } catch (error) {
              try {
          await tryForm(PENGAJAR_APPS_SCRIPT_URL);
          return { success: true, opaque: true };
        } catch (fallbackError) {
          throw (fallbackError instanceof Error ? fallbackError : error);
        }
    }
  };

  const handleApprove = async (id: string) => {
    const input = permintaanInputs[id];
    if (!input?.tanggal || !input?.jam) {
      setPermintaanInputs((prev) => ({ ...prev, [id]: { ...prev[id], error: "Tanggal dan jam persetujuan wajib diisi." } }));
      return;
    }
    const target = permintaan.find((item) => item.id === id);
    if (!target) return;
    const formattedTanggal = toDateLabel(new Date(input.tanggal));
    const success = await updatePermintaanStatus({
      nis: target.nis, namaSiswa: target.namaSiswa,
      tanggal: target.tanggalISO || target.tanggalRaw || target.tanggal,
      tanggalISO: target.tanggalISO, tanggalDMY: target.tanggalDMY, tanggalRaw: target.tanggalRaw,
      status: "Disetujui", tanggalDisetujui: formattedTanggal, jamDisetujui: input.jam,
    }, id);
    if (success) {
      setPermintaan((prev) => prev.map((item) => item.id === id ? { ...item, status: "Disetujui", tanggalDisetujui: formattedTanggal, jamDisetujui: input.jam } : item));
    }
  };

  const handleReject = async (id: string) => {
    const target = permintaan.find((item) => item.id === id);
    if (!target) return;
    const success = await updatePermintaanStatus({
      nis: target.nis, namaSiswa: target.namaSiswa,
      tanggal: target.tanggalISO || target.tanggalRaw || target.tanggal,
      tanggalISO: target.tanggalISO, tanggalDMY: target.tanggalDMY, tanggalRaw: target.tanggalRaw,
      status: "Ditolak",
    }, id);
    if (success) {
      setPermintaan((prev) => prev.map((item) => item.id === id ? { ...item, status: "Ditolak", tanggalDisetujui: "", jamDisetujui: "" } : item));
    }
  };

  const handleProfilChange = (field: keyof typeof profilForm, value: string) => {
    const adjustedValue = field === "whatsapp" ? value.replace(/\s+/g, "") : value;
    setProfilForm((prev) => {
      const next = { ...prev, [field]: adjustedValue };
      if (field === "whatsapp") {
        next.username = normalizeWhatsappToUsername(adjustedValue);
      }
      return next;
    });
    setProfilError("");
    setProfilMessage("");
  };

  const passwordStrength = useMemo(() => {
    const value = profilForm.password;
    if (!value) return "";
    if (value.length >= 10 && /[A-Z]/.test(value) && /[0-9]/.test(value)) return "Kuat";
    if (value.length >= 6) return "Sedang";
    return "Lemah";
  }, [profilForm.password]);

  const handleSaveProfil = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfilError("");
    setProfilMessage("");

    if (!profilForm.nama || !profilForm.username) {
      setProfilError("Nama dan username wajib diisi.");
      return;
    }

    if (normalizeWhatsappToUsername(profilForm.whatsapp) !== profilForm.username) {
      setProfilError("Username harus sama dengan nomor WhatsApp tanpa 0/62/+62.");
      return;
    }

    if (profilForm.password && profilForm.password !== profilForm.konfirmasi) {
      setProfilError("Konfirmasi password tidak sesuai.");
      return;
    }

    if (pengajar) {
      const noChanges =
        profilForm.nama === pengajar.nama &&
        profilForm.bidangStudi === pengajar.bidangStudi &&
        profilForm.email === pengajar.email &&
        profilForm.whatsapp === pengajar.whatsapp &&
        profilForm.domisili === pengajar.domisili &&
        profilForm.username === pengajar.username &&
        !profilForm.password;

      if (noChanges) {
        setProfilMessage("Tidak ada perubahan yang disimpan.");
        return;
      }
    }

    setProfilLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const updatedPassword = profilForm.password ? profilForm.password : pengajar?.password || "";
    const updatedUsername = profilForm.username;

    try {
      await updateProfilSpreadsheet({
        kodePengajar: pengajar?.kode || "",
        nama: profilForm.nama,
        bidangStudi: profilForm.bidangStudi,
        email: profilForm.email,
        whatsapp: profilForm.whatsapp,
        domisili: profilForm.domisili,
        username: updatedUsername,
        password: updatedPassword,
      });
    } catch (profileError) {
      setProfilLoading(false);
      setProfilError(profileError instanceof Error ? profileError.message : "Gagal menyimpan perubahan profil ke spreadsheet.");
      return;
    }

    setPengajar((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        nama: profilForm.nama,
        bidangStudi: profilForm.bidangStudi,
        email: profilForm.email,
        whatsapp: profilForm.whatsapp,
        domisili: profilForm.domisili,
        username: updatedUsername,
        password: updatedPassword,
      };
    });

    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { username?: string; password?: string };
        const nextUsername = updatedUsername || parsed.username;
        const nextPassword = updatedPassword || parsed.password;
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ username: nextUsername, password: nextPassword }));
      } catch {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ username: updatedUsername, password: updatedPassword }));
      }
    }

    setProfilLoading(false);
    setProfilMessage("Perubahan profil berhasil disimpan.");
  };

  // ─── Login Page ───────────────────────────────────────────────────────────
  if (!pengajar) {
    if (authInitializing) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="bg-white border border-gray-200 rounded-2xl px-6 py-4 shadow-sm flex items-center gap-3 text-gray-600 text-sm">
            <span className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            Memuat sesi...
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl grid lg:grid-cols-2 shadow-2xl rounded-3xl overflow-hidden">
          {/* Left Panel */}
          <div className="bg-gradient-to-br from-red-700 via-red-600 to-red-800 p-10 flex flex-col justify-between text-white">
            <div>
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-8">
                <span className="text-2xl">📝</span>
              </div>
              <h1 className="text-3xl font-bold leading-tight">Surat Tugas Mengajar</h1>
              <p className="mt-3 text-red-100 text-sm leading-relaxed">
                Sistem administrasi digital untuk pengajar. Kelola jadwal, pantau sesi, dan setujui permintaan pelayanan.
              </p>
            </div>
            <div className="space-y-3 mt-10">
              {["Data real-time dari Google Spreadsheet", "Jadwal lengkap berdasarkan sesi", "Manajemen permintaan pelayanan"].map((f) => (
                <div key={f} className="flex items-center gap-3 text-sm text-red-100">
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-white">✓</span>
                  </div>
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel */}
          <div className="bg-white p-10 flex flex-col justify-center">
            <h2 className="text-2xl font-bold text-gray-900">Selamat Datang</h2>
            <p className="mt-2 text-sm text-gray-500">Masukkan kredensial pengajar Anda untuk melanjutkan.</p>

            <form onSubmit={handleLogin} className="mt-8 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Username</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition"
                  placeholder="Masukkan username"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition pr-12"
                    placeholder="Masukkan password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500 hover:text-red-600"
                  >
                    {showLoginPassword ? "Sembunyi" : "Lihat"}
                  </button>
                </div>
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 flex items-start gap-2">
                  <span className="mt-0.5">⚠</span>
                  <span>{error}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold py-3 rounded-xl text-sm transition shadow-lg shadow-red-200"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Memuat data...
                  </span>
                ) : "Masuk"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main App ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white shadow-xl flex flex-col transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:flex`}>
        {/* Sidebar Header */}
        <div className="bg-gradient-to-br from-red-700 to-red-600 p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <span className="text-lg">📝</span>
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">Surat Tugas</p>
              <p className="text-red-200 text-xs">Mengajar</p>
            </div>
          </div>
        </div>

        {/* Profile Mini */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="bg-red-50 rounded-xl p-3">
            <p className="text-xs text-red-500 font-semibold uppercase tracking-wide">Pengajar</p>
            <p className="text-gray-900 font-bold text-sm mt-1 truncate">{pengajar.nama}</p>
            <p className="text-gray-500 text-xs truncate">{pengajar.bidangStudi}</p>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                activeTab === item.id
                  ? "bg-red-600 text-white shadow-lg shadow-red-200"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === "riwayat-permintaan" && pendingPermintaan.length > 0 && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeTab === item.id ? "bg-white text-red-600" : "bg-red-600 text-white"}`}>
                  {pendingPermintaan.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 hover:bg-red-50 hover:text-red-600 transition"
          >
            <span>🚪</span>
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Sidebar Overlay (mobile) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="lg:hidden p-2 rounded-xl hover:bg-gray-100 transition"
              onClick={() => setSidebarOpen(true)}
            >
              <div className="w-5 h-0.5 bg-gray-600 mb-1" />
              <div className="w-5 h-0.5 bg-gray-600 mb-1" />
              <div className="w-5 h-0.5 bg-gray-600" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
              </h2>
              <p className="text-xs text-gray-400">{toDateLabel(today)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {pendingPermintaan.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("riwayat-permintaan")}
                className="relative p-2 rounded-xl bg-red-50 hover:bg-red-100 transition"
              >
                <span className="text-lg">🔔</span>
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {pendingPermintaan.length}
                </span>
              </button>
            )}
            <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center text-white font-bold text-sm">
              {pengajar.nama.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto">

          {/* ── DASHBOARD ── */}
          {activeTab === "dashboard" && (
            <div className="space-y-6 max-w-5xl mx-auto">
              {/* Pending Permintaan Alert */}
              {pendingPermintaan.length > 0 && (
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-5 text-white shadow-lg">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <span className="text-xl">🔔</span>
                      </div>
                      <div>
                        <p className="font-bold">Permintaan Pelayanan Terbaru</p>
                        <p className="text-amber-100 text-sm">{pendingPermintaan.length} permintaan menunggu persetujuan Anda</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("riwayat-permintaan")}
                      className="bg-white text-amber-600 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-amber-50 transition"
                    >
                      Lihat & Setujui →
                    </button>
                  </div>
                  {/* Preview cards */}
                  <div className="mt-4 space-y-3">
                    {pendingPermintaan.slice(0, 2).map((item) => (
                      <div key={item.id} className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/20">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{item.namaSiswa}</p>
                            <p className="text-amber-100 text-xs">NIS: {item.nis} · {item.cabang}</p>
                            <p className="text-amber-100 text-xs mt-1">{item.mataPelajaran} · {item.tanggal}</p>
                          </div>
                          <div className="flex gap-2">
                            <div>
                              <label className="text-xs text-amber-200 block mb-1">Tgl Setujui</label>
                              <input
                                type="date"
                                value={permintaanInputs[item.id]?.tanggal ?? ""}
                                onChange={(e) => handlePermintaanInputChange(item.id, "tanggal", e.target.value)}
                                className="rounded-lg border-0 bg-white/20 text-white text-xs px-2 py-1.5 placeholder:text-amber-200 w-36"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-amber-200 block mb-1">Jam</label>
                              <input
                                type="time"
                                value={permintaanInputs[item.id]?.jam ?? ""}
                                onChange={(e) => handlePermintaanInputChange(item.id, "jam", e.target.value)}
                                className="rounded-lg border-0 bg-white/20 text-white text-xs px-2 py-1.5 w-28"
                              />
                            </div>
                          </div>
                        </div>
                        {permintaanInputs[item.id]?.error && (
                          <p className="text-amber-200 text-xs mt-2">⚠ {permintaanInputs[item.id]?.error}</p>
                        )}
                        {permintaanActionError[item.id] && (
                          <p className="text-red-200 text-xs mt-2">⚠ {permintaanActionError[item.id]}</p>
                        )}
                        <div className="flex gap-2 mt-3">
                          <button
                            type="button"
                            onClick={() => handleApprove(item.id)}
                            disabled={permintaanActionLoading[item.id]}
                            className="flex-1 bg-white text-amber-600 font-semibold text-xs py-2 rounded-lg hover:bg-amber-50 transition disabled:opacity-60"
                          >
                            {permintaanActionLoading[item.id] ? "Menyimpan..." : "✓ Setujui"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(item.id)}
                            disabled={permintaanActionLoading[item.id]}
                            className="flex-1 bg-white/20 text-white font-semibold text-xs py-2 rounded-lg hover:bg-white/30 transition disabled:opacity-60"
                          >
                            ✕ Tolak
                          </button>
                        </div>
                      </div>
                    ))}
                    {pendingPermintaan.length > 2 && (
                      <p className="text-center text-amber-200 text-xs">+{pendingPermintaan.length - 2} permintaan lainnya</p>
                    )}
                  </div>
                </div>
              )}

              {/* Stats Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Total Sesi", value: allStats.total, color: "bg-red-600", textColor: "text-white", icon: "📚" },
                  { label: "Hari Ini", value: allStats.today, color: "bg-white", textColor: "text-gray-900", icon: "📅", border: true },
                  { label: "Akan Datang", value: allStats.upcoming, color: "bg-white", textColor: "text-gray-900", icon: "⏰", border: true },
                  { label: "Terlewat", value: allStats.past, color: "bg-white", textColor: "text-gray-900", icon: "✅", border: true },
                ].map((stat) => (
                  <div key={stat.label} className={`${stat.color} ${stat.border ? "border border-gray-200" : ""} rounded-2xl p-5 shadow-sm`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xl">{stat.icon}</span>
                    </div>
                    <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
                    <p className={`text-sm mt-1 ${stat.color === "bg-red-600" ? "text-red-100" : "text-gray-500"}`}>{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Profil + Jadwal Hari Ini */}
              <div className="grid lg:grid-cols-[1fr_2fr] gap-6">
                {/* Profil */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                  <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mb-4">
                    {pengajar.nama.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Nama Pengajar</p>
                  <p className="text-gray-900 font-bold text-lg mt-1">{pengajar.nama}</p>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mt-4">Bidang Studi</p>
                  <p className="text-gray-700 font-semibold text-sm mt-1">{pengajar.bidangStudi}</p>
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-400">Kode: <span className="text-gray-700 font-semibold">{pengajar.kode}</span></p>
                  </div>
                </div>

                {/* Jadwal Hari Ini */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Jadwal Hari Ini</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{toDateLabel(today)}</p>
                    </div>
                    <span className="bg-red-50 text-red-600 text-xs font-bold px-3 py-1.5 rounded-full border border-red-200">
                      {todayJadwal.length} Sesi
                    </span>
                  </div>

                  {groupedTodayJadwal.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
                        <span className="text-2xl">📭</span>
                      </div>
                      <p className="text-gray-500 font-semibold text-sm">Tidak ada jadwal hari ini</p>
                      <p className="text-gray-400 text-xs mt-1">Nikmati hari Anda!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {groupedTodayJadwal.map((item, index) => (
                        <div key={`${item.tanggal}-${index}`} className="border border-red-100 bg-red-50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full">
                              {item.sessions.length} Sesi · {item.kodePengajar}
                            </span>
                            <span className="text-xs text-red-400">{item.tanggal}</span>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {item.sessions.map((session) => (
                              <div key={`${item.tanggal}-${session.sesiKe}`} className="bg-white rounded-lg px-3 py-2 text-sm border border-red-100">
                                <span className="font-bold text-red-600 text-xs">Sesi {session.sesiKe}</span>
                                <p className="text-gray-700 text-xs mt-0.5">{session.materi}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── JADWAL LENGKAP ── */}
          {activeTab === "jadwal-lengkap" && (
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Total Sesi", value: filteredStats.total, bg: "bg-red-600", text: "text-white", sub: "text-red-100" },
                  { label: "Hari Ini", value: filteredStats.today, bg: "bg-white border border-gray-200", text: "text-gray-900", sub: "text-gray-400" },
                  { label: "Akan Datang", value: filteredStats.upcoming, bg: "bg-white border border-gray-200", text: "text-gray-900", sub: "text-gray-400" },
                  { label: "Terlewat", value: filteredStats.past, bg: "bg-white border border-gray-200", text: "text-gray-900", sub: "text-gray-400" },
                ].map((s) => (
                  <div key={s.label} className={`${s.bg} rounded-2xl p-5 shadow-sm`}>
                    <p className={`text-3xl font-bold ${s.text}`}>{s.value}</p>
                    <p className={`text-sm mt-1 ${s.sub}`}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Filter */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 className="text-sm font-bold text-gray-700">Filter Jadwal</h3>
                  <button
                    type="button"
                    onClick={() => setShowFilterPanel((prev) => !prev)}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 transition"
                  >
                    {showFilterPanel ? "Sembunyikan" : "Tampilkan"}
                  </button>
                </div>
                {showFilterPanel && (
                  <>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {[{ label: "Semua", value: "all" }, { label: "Bulanan", value: "monthly" }, { label: "Hari", value: "weekday" }].map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => { setJadwalFilter(f.value as typeof jadwalFilter); if (f.value !== "weekday") setFilterWeekday(""); }}
                          className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${jadwalFilter === f.value ? "bg-red-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                        >
                          {f.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => { setJadwalFilter("all"); setFilterMonth(""); setFilterWeekday(""); }}
                        className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 transition ml-auto"
                      >
                        Reset
                      </button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1.5">Bulan</label>
                        <input
                          type="month"
                          value={filterMonth}
                          onChange={(e) => setFilterMonth(e.target.value)}
                          disabled={jadwalFilter !== "monthly"}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm disabled:bg-gray-50 disabled:text-gray-400 focus:border-red-400 outline-none transition"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1.5">Hari</label>
                        <select
                          value={filterWeekday}
                          onChange={(e) => setFilterWeekday(e.target.value)}
                          disabled={jadwalFilter !== "weekday"}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm disabled:bg-gray-50 disabled:text-gray-400 focus:border-red-400 outline-none transition"
                        >
                          <option value="">Pilih hari</option>
                          {["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"].map((day) => (
                            <option key={day} value={day}>{day}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* List */}
              <div className="space-y-4">
                {groupedFilteredJadwal.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
                    <span className="text-4xl block mb-3">📭</span>
                    <p className="text-gray-500 font-semibold">Tidak ada jadwal ditemukan</p>
                    <p className="text-gray-400 text-sm mt-1">Coba ubah filter atau reset pencarian</p>
                  </div>
                ) : (
                  groupedFilteredJadwal.map((item, index) => {
                    const isToday = item.status === "Hari ini";
                    const isUpcoming = item.status === "Akan datang";
                    const statusBadge = isToday
                      ? "bg-green-100 text-green-700 border border-green-200"
                      : isUpcoming
                      ? "bg-blue-100 text-blue-700 border border-blue-200"
                      : "bg-gray-100 text-gray-500 border border-gray-200";
                    const cardBorder = isToday ? "border-green-200 bg-green-50" : isUpcoming ? "border-blue-100" : "border-gray-200";

                    return (
                      <div key={`${item.tanggal}-${index}`} className={`bg-white rounded-2xl border ${cardBorder} p-5 shadow-sm`}>
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                          <div>
                            <p className="font-bold text-gray-900">{item.tanggal}</p>
                            <p className="text-xs text-gray-400 mt-0.5">Kode: {item.kodePengajar}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                              {item.sessions.length} Sesi
                            </span>
                            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusBadge}`}>
                              {item.status}
                            </span>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {item.sessions.map((session) => (
                            <div key={`${item.tanggal}-${session.sesiKe}`} className="border border-gray-100 bg-gray-50 rounded-xl px-3 py-2.5">
                              <span className="text-xs font-bold text-red-600">Sesi {session.sesiKe}</span>
                              <p className="text-sm text-gray-700 mt-0.5">{session.materi}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ── LEADERBOARD ── */}
          {activeTab === "leaderboard" && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="bg-gradient-to-r from-red-700 to-red-500 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">🏆</div>
                  <div>
                    <h2 className="text-xl font-bold">Leaderboard Pelayanan</h2>
                    <p className="text-red-100 text-sm">
                      {leaderboardStats?.pelayananTerbanyak?.[0]?.nama
                        ? `Peringkat 1: ${leaderboardStats.pelayananTerbanyak[0].nama}`
                        : "Peringkat berdasarkan data sheet Pelayanan"}
                    </p>
                  </div>
                </div>
              </div>

              {leaderboardLoading ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
                  <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">Memuat data leaderboard...</p>
                </div>
              ) : leaderboardError ? (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-600 text-sm">{leaderboardError}</div>
              ) : leaderboardStats ? (
                <div className="grid lg:grid-cols-3 gap-6">
                  {/* Pelayanan Terbanyak */}
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-red-600 px-5 py-4">
                      <h3 className="text-white font-bold text-sm">🎯 Pelayanan Terbanyak</h3>
                      <p className="text-red-100 text-xs mt-0.5">Frekuensi tertinggi</p>
                    </div>
                    <div className="p-4 space-y-2">
                      {leaderboardStats.pelayananTerbanyak.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-4">Belum ada data</p>
                      ) : leaderboardStats.pelayananTerbanyak.map((item, i) => (
                        <div key={`${item.nama}-${i}`} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-red-50 transition">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-yellow-400 text-yellow-900" : i === 1 ? "bg-gray-300 text-gray-700" : i === 2 ? "bg-orange-300 text-orange-900" : "bg-gray-100 text-gray-500"}`}>
                            {i + 1}
                          </div>
                          <p className="flex-1 text-sm font-semibold text-gray-800 truncate">{item.nama}</p>
                          <span className="text-sm font-bold text-red-600">{item.jumlah}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Durasi Terbanyak */}
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-gray-800 px-5 py-4">
                      <h3 className="text-white font-bold text-sm">⏱ Durasi Terbanyak</h3>
                      <p className="text-gray-300 text-xs mt-0.5">Total akumulasi durasi</p>
                    </div>
                    <div className="p-4 space-y-2">
                      {leaderboardStats.durasiTerbanyak.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-4">Belum ada data</p>
                      ) : leaderboardStats.durasiTerbanyak.map((item, i) => (
                        <div key={`${item.nama}-${i}`} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-yellow-400 text-yellow-900" : i === 1 ? "bg-gray-300 text-gray-700" : i === 2 ? "bg-orange-300 text-orange-900" : "bg-gray-100 text-gray-500"}`}>
                            {i + 1}
                          </div>
                          <p className="flex-1 text-sm font-semibold text-gray-800 truncate">{item.nama}</p>
                          <span className="text-sm font-bold text-gray-700">{item.totalDurasi}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cabang Terbanyak */}
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-red-800 px-5 py-4">
                      <h3 className="text-white font-bold text-sm">🏢 Cabang Terbanyak</h3>
                      <p className="text-red-200 text-xs mt-0.5">Jumlah pelayanan per cabang</p>
                    </div>
                    <div className="p-4 space-y-2">
                      {leaderboardStats.cabangTerbanyak.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-4">Belum ada data</p>
                      ) : leaderboardStats.cabangTerbanyak.map((item, i) => (
                        <div key={`${item.cabang}-${i}`} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-red-50 transition">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-yellow-400 text-yellow-900" : i === 1 ? "bg-gray-300 text-gray-700" : i === 2 ? "bg-orange-300 text-orange-900" : "bg-gray-100 text-gray-500"}`}>
                            {i + 1}
                          </div>
                          <p className="flex-1 text-sm font-semibold text-gray-800 truncate">{item.cabang}</p>
                          <span className="text-sm font-bold text-red-700">{item.jumlah}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* ── RIWAYAT PERMINTAAN ── */}
          {activeTab === "riwayat-permintaan" && (
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Pending Section */}
              {pendingPermintaan.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center">
                      <span className="text-sm">⏳</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">Menunggu Persetujuan</h3>
                      <p className="text-xs text-gray-400">{pendingPermintaan.length} permintaan</p>
                    </div>
                  </div>

                  {pendingPermintaan.map((item) => (
                    <div key={item.id} className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
                      <div className="bg-amber-50 border-b border-amber-100 px-5 py-3 flex items-center justify-between">
                        <span className="text-amber-700 font-bold text-sm">{item.namaSiswa}</span>
                        <span className="text-xs bg-amber-200 text-amber-800 font-semibold px-2 py-1 rounded-full">Menunggu</span>
                      </div>
                      <div className="p-5">
                        <div className="grid sm:grid-cols-3 gap-4 mb-4">
                          <div>
                            <p className="text-xs text-gray-400 font-semibold uppercase">NIS</p>
                            <p className="text-sm font-semibold text-gray-800 mt-1">{item.nis}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 font-semibold uppercase">Cabang</p>
                            <p className="text-sm font-semibold text-gray-800 mt-1">{item.cabang}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 font-semibold uppercase">Tanggal</p>
                            <p className="text-sm font-semibold text-gray-800 mt-1">{item.tanggal}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 font-semibold uppercase">Mata Pelajaran</p>
                            <p className="text-sm font-semibold text-gray-800 mt-1">{item.mataPelajaran}</p>
                          </div>
                          <div className="sm:col-span-2">
                            <p className="text-xs text-gray-400 font-semibold uppercase">Keperluan</p>
                            <p className="text-sm font-semibold text-gray-800 mt-1">{item.keperluan}</p>
                          </div>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                          <p className="text-xs font-bold text-gray-600 mb-3">Isi untuk menyetujui:</p>
                          <div className="grid sm:grid-cols-2 gap-3 mb-3">
                            <div>
                              <label className="text-xs font-semibold text-gray-500 block mb-1.5">Tanggal Disetujui</label>
                              <input
                                type="date"
                                value={permintaanInputs[item.id]?.tanggal ?? ""}
                                onChange={(e) => handlePermintaanInputChange(item.id, "tanggal", e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-400 outline-none transition"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-gray-500 block mb-1.5">Jam Disetujui</label>
                              <input
                                type="time"
                                value={permintaanInputs[item.id]?.jam ?? ""}
                                onChange={(e) => handlePermintaanInputChange(item.id, "jam", e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-400 outline-none transition"
                              />
                            </div>
                          </div>
                          {permintaanInputs[item.id]?.error && (
                            <p className="text-red-500 text-xs mb-3 flex items-center gap-1"><span>⚠</span>{permintaanInputs[item.id]?.error}</p>
                          )}
                          {permintaanActionError[item.id] && (
                            <p className="text-red-500 text-xs mb-3 flex items-center gap-1"><span>⚠</span>{permintaanActionError[item.id]}</p>
                          )}
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => handleApprove(item.id)}
                              disabled={permintaanActionLoading[item.id]}
                              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm py-2.5 rounded-xl transition shadow-sm disabled:opacity-60"
                            >
                              {permintaanActionLoading[item.id] ? "Menyimpan..." : "✓ Setujui"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(item.id)}
                              disabled={permintaanActionLoading[item.id]}
                              className="flex-1 border border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-gray-600 font-semibold text-sm py-2.5 rounded-xl transition disabled:opacity-60"
                            >
                              ✕ Tolak
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* All History */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center">
                    <span className="text-sm">📋</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Semua Riwayat</h3>
                    <p className="text-xs text-gray-400">{permintaanPengajar.length} total permintaan</p>
                  </div>
                </div>

                {permintaanPengajar.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
                    <span className="text-4xl block mb-3">📭</span>
                    <p className="text-gray-500 font-semibold">Belum ada permintaan pelayanan</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {permintaanPengajar.map((item) => {
                      const statusNorm = normalizeText(item.status || "menunggu");
                      const isApproved = statusNorm === "disetujui";
                      const isRejected = statusNorm === "ditolak";
                      const statusBadge = isApproved
                        ? "bg-green-100 text-green-700 border-green-200"
                        : isRejected
                        ? "bg-red-100 text-red-600 border-red-200"
                        : "bg-amber-100 text-amber-700 border-amber-200";
                      const statusLabel = isApproved ? "Disetujui" : isRejected ? "Ditolak" : "Menunggu";

                      return (
                        <div key={item.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-gray-900">{item.namaSiswa}</p>
                              <p className="text-xs text-gray-400 mt-0.5">NIS: {item.nis} · {item.cabang}</p>
                            </div>
                            <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${statusBadge}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="grid sm:grid-cols-3 gap-3 mt-3">
                            <div>
                              <p className="text-xs text-gray-400">Tanggal</p>
                              <p className="text-sm font-semibold text-gray-700 mt-0.5">{item.tanggal}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400">Mata Pelajaran</p>
                              <p className="text-sm font-semibold text-gray-700 mt-0.5">{item.mataPelajaran}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400">Keperluan</p>
                              <p className="text-sm font-semibold text-gray-700 mt-0.5">{item.keperluan}</p>
                            </div>
                          </div>
                          {(item.tanggalDisetujui || item.jamDisetujui) && (
                            <div className="mt-3 bg-green-50 border border-green-100 rounded-xl px-3 py-2 text-xs text-green-700 font-semibold">
                              ✓ Disetujui pada {item.tanggalDisetujui || "-"} · jam {item.jamDisetujui || "-"}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── EDIT PROFIL ── */}
          {activeTab === "edit-profil" && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Edit Profil Pengajar</h3>
                    <p className="text-xs text-gray-400 mt-1">Perbarui data akun Anda di sini.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white font-bold">
                      {profilForm.nama ? profilForm.nama.charAt(0).toUpperCase() : pengajar.nama.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{profilForm.nama || pengajar.nama}</p>
                      <p className="text-xs text-gray-400">{profilForm.bidangStudi || pengajar.bidangStudi}</p>
                    </div>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveProfil} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Nama Pengajar</label>
                    <input
                      value={profilForm.nama}
                      onChange={(e) => handleProfilChange("nama", e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-400 outline-none transition"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Kode Pengajar</label>
                    <input
                      value={pengajar.kode}
                      readOnly
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-500"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Kode pengajar tidak dapat diubah.</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Bidang Studi</label>
                    <input
                      value={profilForm.bidangStudi}
                      onChange={(e) => handleProfilChange("bidangStudi", e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-400 outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Email</label>
                    <input
                      type="email"
                      value={profilForm.email}
                      onChange={(e) => handleProfilChange("email", e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-400 outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">No. WhatsApp</label>
                    <input
                      value={profilForm.whatsapp}
                      onChange={(e) => handleProfilChange("whatsapp", e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-400 outline-none transition"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Username mengikuti nomor WhatsApp tanpa 0/62/+62.</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Domisili</label>
                    <input
                      value={profilForm.domisili}
                      readOnly
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-500"
                    />
                    <p className="text-[11px] text-amber-600 mt-1">Hubungi cabang di domisili tersebut untuk menambahkan domisili.</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Username</label>
                    <input
                      value={profilForm.username}
                      readOnly
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-500"
                      required
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Username tidak dapat diubah.</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Password Baru</label>
                    <div className="relative">
                      <input
                        type={showProfilPassword ? "text" : "password"}
                        value={profilForm.password}
                        onChange={(e) => handleProfilChange("password", e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-400 outline-none transition pr-12"
                        placeholder="Isi jika ingin mengganti password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowProfilPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500 hover:text-red-600"
                      >
                        {showProfilPassword ? "Sembunyi" : "Lihat"}
                      </button>
                    </div>
                    {passwordStrength && (
                      <p className={`text-xs mt-1 ${passwordStrength === "Kuat" ? "text-green-600" : passwordStrength === "Sedang" ? "text-amber-600" : "text-red-600"}`}>
                        Kekuatan: {passwordStrength}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Konfirmasi Password</label>
                    <div className="relative">
                      <input
                        type={showProfilKonfirmasi ? "text" : "password"}
                        value={profilForm.konfirmasi}
                        onChange={(e) => handleProfilChange("konfirmasi", e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-400 outline-none transition pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowProfilKonfirmasi((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500 hover:text-red-600"
                      >
                        {showProfilKonfirmasi ? "Sembunyi" : "Lihat"}
                      </button>
                    </div>
                  </div>
                </div>

                {profilError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">⚠ {profilError}</div>
                )}
                {profilMessage && (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">✓ {profilMessage}</div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={profilLoading}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition shadow-sm disabled:opacity-60"
                  >
                    {profilLoading ? "Menyimpan..." : "Simpan Perubahan"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
