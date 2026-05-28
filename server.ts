import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

// Lazy initialize Gemini client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("GEMINI_API_KEY is missing. AI features will run with fallback placeholders.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key || "MOCK_KEY",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Enable JSON body parsing with high limit for large PRD inputs
app.use(express.json({ limit: "15mb" }));

// Preloaded Workspace Templates for super-fast mobile initialization
const CORE_TEMPLATES = [
  {
    id: "attendance",
    title: "Sistem Absensi Siswa Berbasis Mobile",
    category: "Pendidikan / Mobile Web",
    description: "Sistem absensi mandiri siswa sekolah menggunakan geolocation dengan dashboard pemantauan real-time untuk guru dan laporan ke orang tua.",
    problem: "Proses absensi manual memakan waktu guru, rentan kecurangan (titip absen), dan orang tua sering kali tidak menerima informasi kehadiran anak secara instan.",
    solution: "Aplikasi Progressive Web App (PWA) di mana siswa dapat check-in di dalam radius sekolah menggunakan GPS, disertai portal laporan terpadu.",
    features: "A. Mobile Check-In & Check-Out (GPS Geofencing)\nB. Dashboard Guru & Portal Laporan Orang Tua",
    icon: "GraduationCap"
  },
  {
    id: "coliving",
    title: "Aplikasi Manajemen Kos-kosan (Co-Living)",
    category: "Properti / FinTech",
    description: "Platform visual untuk mengelola kamar, pencatatan otomatis tagihan bulanan penyewa kosh, dan sistem pengaduan/tiket komplain kerusakan fasilitas.",
    problem: "Pemilik kos kesulitan memantau status pembayaran penyewa, keterlambatan penagihan, dan pencatatan komplain fasilitas yang berantakan.",
    solution: "Dashboard grid kamar interaktif untuk melacak kamar kosong/terisi, pengiriman reminder WhatsApp otomatis, serta pelacak status tiket keluhan penyewa.",
    features: "A. Kamar & Grid Management (Pemilik Kos)\nB. Reminders Tagihan & Tiket Keluhan Fasilitas (Penyewa)",
    icon: "Home"
  },
  {
    id: "checkout",
    title: "Lightning Checkout Mobile E-Commerce",
    category: "E-Commerce / UX",
    description: "Optimasi konversi e-commerce mobile dengan 1-click checkout, integrasi e-wallet, dan live order tracking.",
    problem: "Tingginya cart abandonment rate di mobile web akibat formulir checkout yang panjang dan metode pembayaran yang rumit.",
    solution: "Sistem checkout instan 1 halaman yang menyimpan data alamat dengan aman serta memanfaatkan verifikasi e-wallet sekali klik.",
    features: "A. Lightning Checkout (PWA Mobile)\nB. Merchant Order Dashboard & Analytics (Penjual)",
    icon: "Zap"
  }
];

// Endpoint: Dapatkan Templates
app.get("/api/templates", (req, res) => {
  res.json(CORE_TEMPLATES);
});

// Endpoint: Generate PRD
app.post("/api/generate-prd", async (req, res) => {
  const { title, description, problem, solution, features, customPrompt } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Judul project wajib diisi." });
  }

  const userPrompt = `
Generate a highly comprehensive, beautiful, professional Product Requirement Document (PRD) in Indonesian with the following details:
- **Project Title:** ${title}
- **Description:** ${description || "General app spec"}
- **Problem Statement:** ${problem || "Inefficiencies in manual workflow"}
- **Proposed Solution:** ${solution || "AI-powered web/mobile application integration"}
- **Selected Core Features:**
${features || "A. Core User Interfaces\nB. Administration Controls"}
${customPrompt ? `- **Custom User Preferences:** ${customPrompt}` : ""}

Ensure the generated PRD is incredibly thorough and strictly organized into these 6 numbered sections:

1. **Product Overview & Strategy**
   - **Masalah (Problem Statement):** Detailed background & pain points.
   - **Solusi (Solution):** How the app solves these pain points.
   - **Target Pengguna (Target Users):** At least 2 personas with concise descriptions.
   - **Success Metrics (KPIs):** List 3-4 measurable success indicators.

2. **Detail Core Features (Spesifikasi Fitur)**
   - Elaborate in depth on Feature A and Feature B and any requested workflows.
   - Provide step-by-step user workflows (from user login to completion).
   - Expected edge cases and error handlings.

3. **UI/UX Design Guidance**
   - Look and Feel: Contrast requirements, mobile-first design system layout suggestions.
   - Specific component guidelines (button targets of 44px, grids, scroll behavior).

4. **Technical Architecture**
   - **Database Schema:** Provide concrete table/collection schema designs, identifying tables, data types (string, boolean, integer, timestamp, map), description, and relationships. Format this as a clean Markdown table!
   - **API Endpoints:** Define 4-5 API endpoints needed (HTTP Method, Route, Request Body schema, Response Schema description) in a clean Markdown table.

5. **Keamanan & Security Architecture**
   - Authentication and Authorization strategy.
   - PII (Personally Identifiable Information) Isolation & Protection.
   - OWASP Top-10 Quick Compliance Checklist.

6. **Timeline & MVP Release (5-6 Minggu)**
   - Break down a weekly roadmap from Week 1 to Week 5/6 with milestones and release criteria.

Use Markdown headings (#, ##, ###), lists, tables, and code blocks for a pristine, readable structure. Inject a professional but modern PM tone. Let's make it outstanding.
`;

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      // Fallback response for missing key
      console.log("Mocking PRD output because GEMINI_API_KEY is not defined");
      const mockPrd = `# ${title} - AI PRD Spec Workspace

## 1. Product Overview & Strategy
*   **Masalah (Problem Statement):** ${problem || "Proses operasional manual yang bertele-tele dan rentan kesalahan."}
*   **Solusi (Solution):** ${solution || "Platform PWA terintegrasi yang menghadirkan otomatisasi berbasis peran."}
*   **Target Pengguna:** 
    1. **Pengguna Utama:** Individu lapangan yang membutuhkan akses seluler instan.
    2. **Administrator:** Pengawas yang memeriksa ringkasan analitik dari desktop.
*   **Success Metrics (KPIs):**
    - Reduksi waktu pemrosesan hingga 45%.
    - Tingkat kepuasan pengguna di atas 4.5/5.0 bintang.
    - Zero data discrepancy pada log sinkronisasi harian.

## 2. Detail Core Features (Spesifikasi Fitur)
Spesifikasi lengkap dari modul-modul berikut:
### Fitur A: ${features ? features.split("\n")[0] : "Modul Utama"}
*   Alur kerja responsif di mana pengguna dapat membuka dasbor secara cepat di layar kecil.
*   Pemberitahuan perubahan status langsung (real-time notifications).
### Fitur B: ${features && features.split("\n").length > 1 ? features.split("\n")[1] : "Dashboard Admin"}
*   Dasbor terpusat dengan grafik analitis visual (Recharts/D3).
*   Sistem ekspor log format CSV/Markdown sekali klik.

## 3. UI/UX Design Guidance
*   **Aesthetic & Mood:** Minimalis, profesional modern dengan palette warna Slate Gray dan Emerald Green.
*   **Mobile-First Responsiveness:** Panel mengambang (collapsible sidebar) untuk layar saku. Sentuhan minimum 44px untuk kenyamanan jempol.
*   **Opsi Tipografi:** Pengaturan dinamis Inter (sans-serif) / Space Grotesk untuk keterbacaan yang optimal.

## 4. Technical Architecture
### Database Schema
| Tabel/Koleksi | Field Nama | Tipe Data | Deskripsi |
| :--- | :--- | :--- | :--- |
| **users** | id, email, name, role | string, string, string, string | Profil pengguna terdaftar |
| **spec_log** | id, title, metadata, status, createdAt | string, string, map, string, timestamp | Log dokumen spesifikasi draf |

### API Endpoints
| Method | Route | Request Body | Response Description |
| :--- | :--- | :--- | :--- |
| GET | \`/api/projects\` | None | Mengambil daftar draf project aktif |
| POST | \`/api/projects\` | \`{ title, details }\` | Membuat draf spesifikasi project baru |

## 5. Keamanan & Security Architecture
*   **OWASP Top-10 Audit:** Enkripsi JWT Token di LocalStorage dengan masa kedaluwarsa 2 jam.
*   **Proteksi PII:** Kolom email & nomor kontak di-isolasi dalam subcollection privat dengan kebijakan enkripsi AES-256.

## 6. Timeline & MVP Release (5 Minggu)
*   **Minggu 1:** Desain database & setup boilerplates.
*   **Minggu 2:** Pengembangan UI Responsif dan integrasi API dasar.
*   **Minggu 3-4:** Implementasi kecerdasan bantuan AI dan pengujian "Uji PRD".
*   **Minggu 5:** Audit keamanan & Peluncuran MVP (Beta-release).`;
      return res.json({ prd: mockPrd, isMock: true });
    }

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: "You are an elite Product Manager Specialist and Business Analyst. You write outstandingly technical and clear Product Requirement Documents that engineers can implement immediately.",
        temperature: 0.7,
      },
    });

    res.json({ prd: response.text || "Tidak ada teks yang dihasilkan.", isMock: false });
  } catch (error: any) {
    console.error("Gemini PRD Generation Error:", error);
    res.status(500).json({ error: error.message || "Gagal membuat dokumen PRD menggunakan AI." });
  }
});

// Endpoint: Test and Review PRD Document (QA Generator + Audit Assessment)
app.post("/api/review-prd", async (req, res) => {
  const { prdContent } = req.body;

  if (!prdContent) {
    return res.status(400).json({ error: "Konten spesifikasi PRD wajib dilampirkan untuk pengujian." });
  }

  const reviewPrompt = `
Analyze the following Product Requirement Document (PRD) and generate a comprehensive Interactive Test Suite & Audit report:
---
${prdContent}
---

Return the response STRICTLY as a JSON object with this exact structure:
{
  "score": 85, // out of 100
  "grade": "B+", // A, B, C, etc.
  "summary": "Analisis singkat dari PRD ini, memuji kelebihannya dan menyebutkan area kritis yang perlu diperbaiki.",
  "metrics": {
    "completeness": 80, // percentage 0-100
    "security": 75, // percentage 0-100
    "readability": 90 // percentage 0-100
  },
  "testCases": [
    {
      "id": "TC-01",
      "module": "Sistem Check-In",
      "scenario": "Siswa melakukan check-in di luar area geofencing",
      "expected": "Aplikasi menolak absensi dan memunculkan pop-up pemberitahuan peringatan radius.",
      "severity": "High" // High, Medium, Low
    },
    ... (at least 5-6 practical, detailed test cases)
  ],
  "securityAudit": [
    {
      "checkpoint": "Validasi Parameter API",
      "status": "PASS" or "WARN" or "FAIL",
      "notes": "Deskripsi singkat tentang status checkpoint ini."
    },
    {
      "checkpoint": "Proteksi Data Pribadi (PII)",
      "status": "PASS" or "WARN" or "FAIL",
      "notes": "Deskripsi proteksi e-mail dan nomor telepon siswa."
    },
    {
      "checkpoint": "OWASP Top-10 Compliance",
      "status": "PASS" or "WARN" or "FAIL",
      "notes": "Saran mitigasi terkait kontrol hak akses."
    }
  ],
  "improvements": [
    "Saran perbaikan konkret 1",
    "Saran perbaikan konkret 2",
    "Saran perbaikan konkret 3"
  ]
}

Ensure the response is valid, parsable JSON. Do not write any markdown wrappers like \`\`\`json outside the JSON, just return the raw text. Let's make it fully compliant.
`;

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      // Fallback mock response for testing
      console.log("Mocking PRD review because GEMINI_API_KEY is not defined");
      const mockReview = {
        score: 92,
        grade: "A",
        summary: "PRD sangat kokoh, memiliki pemetaan database dan API yang modular. Kekuatan utama ada pada mobile geofencing workflow. Sedikit perbaikan diperlukan pada isolasi private data.",
        metrics: {
          completeness: 95,
          security: 85,
          readability: 96
        },
        testCases: [
          {
            id: "TC-01",
            module: "Geofencing",
            scenario: "Pengguna menonaktifkan fitur GPS perangkat saat melakukan check-in",
            expected: "Sistem memberikan umpan balik toleransi error yang ramah dan menolak proses absensi hingga akses lokasi diaktifkan.",
            severity: "High"
          },
          {
            id: "TC-02",
            module: "Dashboard Guru",
            scenario: "Mengimpor 1.000 catatan kehadiran secara sinkron dalam satu batch",
            expected: "Log riwayat tidak membeku; UI memperlihatkan progress bar yang teratur dan lancar.",
            severity: "Medium"
          },
          {
            id: "TC-03",
            module: "Kamar & Grid",
            scenario: "Pemilik kos mencoba memasukkan nomor kamar berkode unik karakter aneh",
            expected: "Input form langsung menolak karakter berbahaya dan membatasi ukuran ID kamar harian.",
            severity: "Medium"
          },
          {
            id: "TC-04",
            module: "Notifikasi Pengguna",
            scenario: "Penyewa kosh mengabaikan pengaduan tiket selama 7 hari berturut-turut",
            expected: "Sistem mengirimkan peringatan otomatis harian ke-3 sebagai eskalasi status tingkat keparahan tinggi.",
            severity: "Low"
          },
          {
            id: "TC-05",
            module: "Lightning Checkout",
            scenario: "Pembeli menekan tombol 'Beli Sekali Klik' secara berulang (multi-click span)",
            expected: "Tombol dinonaktifkan seketika setelah tekanan pertama untuk mencegah duplikasi pesanan finansial.",
            severity: "High"
          }
        ],
        securityAudit: [
          {
            checkpoint: "Validasi Parameter API",
            status: "PASS",
            notes: "Endpoint yang direncanakan telah mengidentifikasi batasan size payload dan batasan tipe data masukan."
          },
          {
            checkpoint: "Proteksi Data Pribadi (PII)",
            status: "WARN",
            notes: "Perlu pemisahan tegas antara info subkoleksi login dengan detail kontak sensitif orang tua siswa."
          },
          {
            checkpoint: "OWASP Top-10 Compliance",
            status: "PASS",
            notes: "Desain sistem mengadopsi kontrol hak akses JWT token yang diluncurkan dengan siklus habis masa pakai yang ketat."
          }
        ],
        improvements: [
          "Tambahkan skema pencatatan log historis mutasi kamar untuk menunjang audit transaksi bulanan.",
          "Wajibkan interaksi validasi OTP seluler saat pembeli mendaftarkan e-wallet pertama kali di sistem Checkout.",
          "Gunakan PostgreSQL Row Level Security (RLS) jika bermigrasi ke database relasional di kemudian hari."
        ]
      };
      return res.json(mockReview);
    }

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: reviewPrompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      }
    });

    const parsedData = JSON.parse(response.text?.trim() || "{}");
    res.json(parsedData);
  } catch (error: any) {
    console.error("Gemini PRD Review Error:", error);
    res.status(500).json({ error: error.message || "Gagal melakukan peninjauan/tes PRD dokumen." });
  }
});


// Setup development Vite servers
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server KoncoPRD running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error("Failed to start server", err);
});
