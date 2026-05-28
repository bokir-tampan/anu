import React, { useState, useEffect, useRef } from "react";
import { 
  GraduationCap, 
  Home, 
  Zap, 
  Sparkles, 
  Moon, 
  Sun, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Trash2, 
  Copy, 
  Download, 
  Printer, 
  BookOpen, 
  Check, 
  Plus, 
  RotateCcw, 
  Menu, 
  X, 
  ShieldCheck, 
  Layers, 
  Activity, 
  ThumbsUp, 
  Settings,
  Type
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { WorkspaceTemplate, PrdSpec, ReviewResult, TestCase, SecurityAuditItem } from "./types";

export default function App() {
  // --- STATE ---
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("attendance");
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);

  // Form inputs
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [proposedSolution, setProposedSolution] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");

  // Editor and Generation State
  const [activePrd, setActivePrd] = useState<PrdSpec | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState<PrdSpec[]>([]);

  // Testing & Quality Review State
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [testCaseChecked, setTestCaseChecked] = useState<Record<string, boolean>>({});

  // Mobile navigation tabs: "form", "prd", "review", "history"
  const [mobileTab, setMobileTab] = useState<"form" | "prd" | "review" | "history">("form");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Settings & Accessibility State
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg" | "xl">("base");
  const [leftPaneWidth, setLeftPaneWidth] = useState(48); // Percentage on desktop split layout
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Drag handles for split layout positioning
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // --- ACTIONS & UTILS ---

  // Load Settings, History & Templates on mount
  useEffect(() => {
    // Media queries / Dark mode check
    const savedTheme = localStorage.getItem("koncoprd_theme") as "light" | "dark";
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === "dark") {
        document.body.classList.add("dark");
      } else {
        document.body.classList.remove("dark");
      }
    } else {
      setTheme("dark");
      document.body.classList.add("dark");
    }

    const savedFontSize = localStorage.getItem("koncoprd_font") as "sm" | "base" | "lg" | "xl";
    if (savedFontSize) setFontSize(savedFontSize);

    const savedHistory = localStorage.getItem("koncoprd_history");
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        setHistory(parsed);
        if (parsed.length > 0) {
          setActivePrd(parsed[0]);
        }
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }

    // Fetch initial templates
    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => {
        setTemplates(data);
        setIsLoadingTemplates(false);
        // Pre-fill fields with the first template (attendance)
        const defaultTpl = data.find((t: WorkspaceTemplate) => t.id === "attendance");
        if (defaultTpl) {
          applyTemplateValues(defaultTpl);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch templates", err);
        setIsLoadingTemplates(false);
      });
  }, []);

  // Update body class on theme change and persist
  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("koncoprd_theme", nextTheme);
    if (nextTheme === "dark") {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
  };

  // Persist font size multiplier
  const changeFontSize = (size: "sm" | "base" | "lg" | "xl") => {
    setFontSize(size);
    localStorage.setItem("koncoprd_font", size);
  };

  // Fill forms with chosen template's values
  const applyTemplateValues = (tpl: WorkspaceTemplate) => {
    setProjectTitle(tpl.title);
    setProjectDesc(tpl.description);
    setProblemStatement(tpl.problem);
    setProposedSolution(tpl.solution);
    setSelectedFeatures(tpl.features);
  };

  // Handle template selection changes
  const handleTemplateSelect = (id: string) => {
    setSelectedTemplate(id);
    if (id === "custom") {
      setProjectTitle("");
      setProjectDesc("");
      setProblemStatement("");
      setProposedSolution("");
      setSelectedFeatures("");
    } else {
      const match = templates.find((t) => t.id === id);
      if (match) applyTemplateValues(match);
    }
  };

  // Reset current inputs
  const resetForm = () => {
    if (selectedTemplate === "custom") {
      setProjectTitle("");
      setProjectDesc("");
      setProblemStatement("");
      setProposedSolution("");
      setSelectedFeatures("");
      setCustomPrompt("");
    } else {
      const match = templates.find((t) => t.id === selectedTemplate);
      if (match) applyTemplateValues(match);
      setCustomPrompt("");
    }
  };

  // Trigger Gemini API to generate the PRD (Full Document)
  const handleGeneratePrd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectTitle.trim()) return;

    setIsGenerating(true);
    setReviewResult(null); // Reset review of previous specs
    setTestCaseChecked({});
    // Go to PRD view on mobile devices automatically
    setMobileTab("prd");

    try {
      const response = await fetch("/api/generate-prd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: projectTitle,
          description: projectDesc,
          problem: problemStatement,
          solution: proposedSolution,
          features: selectedFeatures,
          customPrompt: customPrompt
        }),
      });

      const data = await response.json();
      if (response.ok) {
        const newSpec: PrdSpec = {
          id: `spec-${Date.now()}`,
          title: projectTitle,
          category: selectedTemplate === "custom" ? "Custom System" : templates.find(t => t.id === selectedTemplate)?.category || "Spec Workspace",
          description: projectDesc,
          problem: problemStatement,
          solution: proposedSolution,
          features: selectedFeatures,
          customPrompt: customPrompt,
          generatedContent: data.prd,
          createdAt: new Date().toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        };

        const updatedHistory = [newSpec, ...history.filter(h => h.title !== newSpec.title)];
        setHistory(updatedHistory);
        localStorage.setItem("koncoprd_history", JSON.stringify(updatedHistory));
        setActivePrd(newSpec);
      } else {
        alert(data.error || "Gagal membuat PRD.");
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan jaringan saat meghubungi server.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Trigger Gemini API to run Quality Audit & Interactive QA Test Verification
  const handleReviewPrd = async () => {
    if (!activePrd) return;

    setIsReviewing(true);
    setMobileTab("review");

    try {
      const response = await fetch("/api/review-prd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prdContent: activePrd.generatedContent
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setReviewResult(data);
        // Clear previous checks
        setTestCaseChecked({});
      } else {
        alert(data.error || "Gagal meninjau spesifikasi PRD.");
      }
    } catch (err) {
      console.error(err);
      alert("Gagal menghubungi server untuk menguji PRD.");
    } finally {
      setIsReviewing(false);
    }
  };

  // Toggle checklist for generated test cases
  const toggleTestCaseCheck = (tcId: string) => {
    setTestCaseChecked((prev) => ({
      ...prev,
      [tcId]: !prev[tcId]
    }));
  };

  // Copy full generated Markdown document to Clipboard
  const handleCopyPrd = () => {
    if (!activePrd) return;
    navigator.clipboard.writeText(activePrd.generatedContent);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  // Download PRD as Markdown file
  const handleDownloadPrd = () => {
    if (!activePrd) return;
    const element = document.createElement("a");
    const file = new Blob([activePrd.generatedContent], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `${activePrd.title.toLowerCase().replace(/\s+/g, "_")}_prd.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Trigger window browser print modal
  const handlePrintPrd = () => {
    window.print();
  };

  // Load a historic spec document from history
  const loadFromHistory = (spec: PrdSpec) => {
    setActivePrd(spec);
    // Autofill form inputs
    setProjectTitle(spec.title);
    setProjectDesc(spec.description);
    setProblemStatement(spec.problem);
    setProposedSolution(spec.solution);
    setSelectedFeatures(spec.features);
    setCustomPrompt(spec.customPrompt || "");
    // Reset review results as it belongs to old inputs until triggered again
    setReviewResult(null);
    setMobileTab("prd");
  };

  // Remove a document from history
  const deleteFromHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter((h) => h.id !== id);
    setHistory(updated);
    localStorage.setItem("koncoprd_history", JSON.stringify(updated));
    if (activePrd?.id === id) {
      setActivePrd(updated.length > 0 ? updated[0] : null);
    }
  };

  // Mouse Drag handlers for resizing panels on desktops
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
  };

  const onDrag = (e: MouseEvent) => {
    if (!isDraggingRef.current || !splitContainerRef.current) return;
    const containerWidth = splitContainerRef.current.offsetWidth;
    const containerOffsetLeft = splitContainerRef.current.getBoundingClientRect().left;
    const clientX = e.clientX;
    const percentage = ((clientX - containerOffsetLeft) / containerWidth) * 100;
    // Bounds check
    if (percentage > 25 && percentage < 75) {
      setLeftPaneWidth(percentage);
    }
  };

  const stopDrag = () => {
    isDraggingRef.current = false;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
  };

  // Simple Markdown Paragraph-level formatter for high fidelity display
  const renderMarkdownAlternative = (markdownText: string) => {
    if (!markdownText) return <p className="italic text-slate-400">Kosong</p>;

    const lines = markdownText.split("\n");
    let currentTableData: string[][] = [];
    let isInsideTable = false;

    return lines.map((line, idx) => {
      const trimmed = line.trim();

      // Horizontal rules
      if (trimmed === "---") {
        return <hr key={idx} />;
      }

      // Check Table headers & division lines
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        const columns = trimmed.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
        
        // Skip separator line (e.g. | :--- | :--- |)
        if (columns.every(col => col.replace(/[-:\s]/g, "") === "")) {
          return null;
        }

        // Render cumulative lines as table after closing or on render
        // For simple alternative rendering, we render table rows organically:
        const isHeader = idx > 0 && lines[idx - 1].trim().startsWith("|") && lines[idx + 1] && lines[idx + 1].trim().includes("-");
        const rowBg = idx % 2 === 0 ? "bg-slate-50/40 dark:bg-slate-900/10" : "";

        return (
          <div key={idx} className="overflow-x-auto my-1">
            <table className="min-w-full border-collapse border border-slate-200/80 dark:border-slate-800">
              <tbody>
                <tr className={rowBg}>
                  {columns.map((col, cIdx) => (
                    <td key={cIdx} className="px-4 py-2 text-xs md:text-sm border-b border-slate-100 dark:border-slate-800">
                      {col.replace(/\*\*/g, "")}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        );
      }

      // Headers
      if (trimmed.startsWith("# ")) {
        return <h1 key={idx}>{trimmed.substring(2)}</h1>;
      }
      if (trimmed.startsWith("## ")) {
        return <h2 key={idx}>{trimmed.substring(3)}</h2>;
      }
      if (trimmed.startsWith("### ")) {
        return <h3 key={idx}>{trimmed.substring(4)}</h3>;
      }

      // Blockquotes
      if (trimmed.startsWith("> ")) {
        return <blockquote key={idx}>{trimmed.substring(2)}</blockquote>;
      }

      // Unordered lists
      if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
        const content = trimmed.substring(2);
        // Quick bold handling e.g. **Title:** description
        return (
          <ul key={idx}>
            <li>{parseInlineFormatting(content)}</li>
          </ul>
        );
      }

      // Ordered lists
      if (/^\d+\.\s/.test(trimmed)) {
        const content = trimmed.replace(/^\d+\.\s/, "");
        return (
          <ol key={idx}>
            <li>{parseInlineFormatting(content)}</li>
          </ol>
        );
      }

      if (trimmed === "") {
        return <div key={idx} className="h-2" />;
      }

      // Native fallback paragraphs
      return <p key={idx}>{parseInlineFormatting(line)}</p>;
    });
  };

  // Helper to match bolding **bold text** and inline code `code` in rendering
  const parseInlineFormatting = (text: string) => {
    // Find bold tags
    const boldRegex = /\*\*(.*?)\*\*/g;
    const codeRegex = /`(.*?)`/g;

    let parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    // Direct string matches
    const containsBold = text.includes("**");
    const containsCode = text.includes("`");

    if (!containsBold && !containsCode) {
      return text;
    }

    // A simplified parser
    return <span dangerouslySetInnerHTML={{
      __html: text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/`(.*?)`/g, "<code>$1</code>")
    }} />;
  };

  // Get lucide template logo
  const renderTemplateIcon = (iconName: string, className = "h-5 w-5") => {
    switch (iconName) {
      case "GraduationCap": return <GraduationCap className={className} />;
      case "Home": return <Home className={className} />;
      case "Zap": return <Zap className={className} />;
      default: return <BookOpen className={className} />;
    }
  };

  // Get mobile font sizes
  const getFontMultiplierClass = () => {
    switch (fontSize) {
      case "sm": return "text-sm";
      case "lg": return "text-lg";
      case "xl": return "text-xl";
      default: return "text-base";
    }
  };

  return (
    <div className={`min-h-screen flex flex-col premium-workspace-bg ${theme === "dark" ? "dark bg-[#0A0A0B] text-slate-200" : "bg-slate-50 text-slate-800"}`}>
      
      {/* 1. TOP HEADER NAVIGATION - Polished and Responsive */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#0D0D0E]/80 backdrop-blur-md border-b border-slate-200/50 dark:border-white/10 transition-colors">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-tr from-[#7C3AED] to-[#DB2777] p-2 rounded-xl text-white shadow-md shadow-[#7C3AED]/20">
              <FileText className="h-5.5 w-5.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display font-bold text-lg md:text-xl tracking-tight text-slate-900 dark:text-white">
                  KoncoPRD
                </span>
                <span className="text-xxs px-1.5 py-0.5 rounded-full font-mono bg-[#7C3AED]/10 dark:bg-[#7C3AED]/20 text-[#7C3AED] dark:text-[#7C3AED] font-semibold">
                  v2.0 Mobile-Ready
                </span>
              </div>
              <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 font-medium hidden sm:block">
                Ruang Kerja Spesifikasi AI untuk Product Manager
              </p>
            </div>
          </div>

          {/* Desktop Sizing, Settings & Theme Controls */}
          <div className="hidden md:flex items-center gap-4">
            
            {/* Font Adjuster options (Sediakan Opsi Penyesuaian Font) */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-lg border dark:border-white/5">
              <span className="text-xs text-slate-500 dark:text-slate-400 px-2 font-medium flex items-center gap-1">
                <Type className="h-3.5 w-3.5" /> Font Sizing
              </span>
              {(["sm", "base", "lg", "xl"] as const).map((sz) => (
                <button
                  key={sz}
                  onClick={() => changeFontSize(sz)}
                  className={`text-xs px-2.5 py-1 rounded font-medium transition-all uppercase ${
                    fontSize === sz 
                      ? "bg-white dark:bg-white/10 text-[#7C3AED] dark:text-[#DB2777] shadow-sm" 
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                  title={`Ukuran huruf: ${sz}`}
                >
                  {sz === "base" ? "md" : sz}
                </button>
              ))}
            </div>

            {/* Dark mode Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm"
              title={theme === "dark" ? "Mode Terang" : "Mode Gelap"}
            >
              {theme === "dark" ? <Sun className="h-4.5 w-4.5 text-amber-400 animate-spin" style={{ animationDuration: "12s" }} /> : <Moon className="h-4.5 w-4.5" />}
            </button>
          </div>

          {/* Mobile Right Bar: Menu and Mode Toggle Toggle */}
          <div className="flex items-center gap-2 md:hidden">
            {/* Quick theme toggle for mobile */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400"
            >
              {theme === "dark" ? <Sun className="h-4.5 w-4.5 text-amber-400" /> : <Moon className="h-4.5 w-4.5" />}
            </button>

            {/* Menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

        </div>
      </header>

      {/* MOBILE OVERLAY NAVIGATION SIDEBAR */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setMobileMenuOpen(false)}>
            <div 
              className="absolute left-0 top-0 bottom-0 w-3/4 max-w-sm bg-white dark:bg-[#0D0D0E] p-5 shadow-2xl flex flex-col gap-6 border-r dark:border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-4">
                <span className="font-display font-bold text-base text-slate-900 dark:text-white">Workspace Action</span>
                <button onClick={() => setMobileMenuOpen(false)}>
                  <X className="h-5 w-5 text-slate-500" />
                </button>
              </div>

              {/* Mobile options: Font Customization */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Ukuran Font PRD</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["sm", "base", "lg", "xl"] as const).map((sz) => (
                    <button
                      key={sz}
                      onClick={() => {
                        changeFontSize(sz);
                        setMobileMenuOpen(false);
                      }}
                      className={`text-xs py-2 rounded-lg font-medium border text-center transition-all ${
                        fontSize === sz
                          ? "bg-[#7C3AED]/10 dark:bg-[#7C3AED]/20 border-[#7C3AED] text-[#7C3AED] font-semibold"
                          : "border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {sz === "base" ? "Normal" : sz.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick info about PWA support */}
              <div className="mt-auto bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-100 dark:border-white/10">
                <div className="flex gap-2 items-start text-xs">
                  <ShieldCheck className="h-4.5 w-4.5 text-[#7C3AED] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">Mobile-First Optimasi</h4>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">KoncoPRD dioptimalkan menggunakan CSS Grid dan Flexbox untuk akses instan di perangkat berlayar terbatas.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. DYNAMIC LAYOUT AREA - Desktop Grid Split vs Mobile Swiper Tabs */}
      
      {/* Mobile view Tab navigation bar */}
      <div className="md:hidden sticky top-[57px] z-30 bg-white dark:bg-[#0D0D0E] border-b border-slate-200/60 dark:border-white/10 grid grid-cols-4 text-center">
        <button
          onClick={() => setMobileTab("form")}
          className={`py-3 text-xs font-semibold border-b-2 transition-all ${
            mobileTab === "form" 
              ? "border-[#7C3AED] text-[#7C3AED]" 
              : "border-transparent text-slate-500 dark:text-slate-400"
          }`}
        >
          Form Input
        </button>
        <button
          onClick={() => setMobileTab("prd")}
          className={`py-3 text-xs font-semibold border-b-2 transition-all relative ${
            mobileTab === "prd" 
              ? "border-[#7C3AED] text-[#7C3AED]" 
              : "border-transparent text-slate-500 dark:text-slate-400"
          }`}
        >
          PRD Spec
          {activePrd && <span className="absolute top-2 right-2.5 h-2 w-2 rounded-full bg-[#DB2777] animate-pulse"></span>}
        </button>
        <button
          onClick={() => setMobileTab("review")}
          className={`py-3 text-xs font-semibold border-b-2 transition-all text-center ${
            mobileTab === "review" 
              ? "border-[#7C3AED] text-[#7C3AED]" 
              : "border-transparent text-slate-500 dark:text-slate-400"
          }`}
        >
          Uji & Audit
        </button>
        <button
          onClick={() => setMobileTab("history")}
          className={`py-3 text-xs font-semibold border-b-2 transition-all ${
            mobileTab === "history" 
              ? "border-[#7C3AED] text-[#7C3AED]" 
              : "border-transparent text-slate-500 dark:text-slate-400"
          }`}
        >
          Riwayat ({history.length})
        </button>
      </div>

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col md:overflow-hidden">
        
        {/* Desktop Split Workspace (Resizable) */}
        <div 
          ref={splitContainerRef}
          className="hidden md:flex flex-1 items-stretch gap-0 overflow-hidden min-h-[680px]"
        >
          {/* LEFT PANE - Spec Composer Form Input */}
          <div 
            style={{ width: `${leftPaneWidth}%` }}
            className="flex flex-col pr-3 overflow-y-auto"
          >
            {renderLeftComposerForm()}
          </div>

          {/* DYNAMIC RESIZE HANDLE */}
          <div 
            onMouseDown={startDrag}
            className="resize-handle-wrapper"
          >
            <div className="resize-handle-bar active" />
          </div>

          {/* RIGHT PANE - Live Document Preview & Review Tools */}
          <div 
            style={{ width: `${100 - leftPaneWidth}%` }}
            className="flex flex-col pl-3 overflow-y-auto gap-5"
          >
            {renderRightPreviewSection()}
          </div>
        </div>

        {/* Mobile View Stack (Tabs switcher based on active mobileTab state) */}
        <div className="md:hidden flex-1 flex flex-col py-2 gap-4">
          {mobileTab === "form" && renderLeftComposerForm()}
          {mobileTab === "prd" && (
            <div className="flex flex-col gap-4">
              {renderRightPreviewSection()}
            </div>
          )}
          {mobileTab === "review" && (
            <div className="flex flex-col gap-4">
              {renderQualityReviewPanel()}
            </div>
          )}
          {mobileTab === "history" && (
            <div className="flex flex-col gap-4">
              {renderHistoryList()}
            </div>
          )}
        </div>

      </main>

      {/* Dynamic Tiny Status bar */}
      <footer className="bg-white/60 dark:bg-slate-950/60 border-t border-slate-200/50 dark:border-slate-900/60 py-2.5 px-4 text-center text-xxs font-mono text-slate-400 dark:text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-1.5 shrink-0">
          <span>KoncoPRD SPEC COOPERATIVE SUITE • AI AGENT INTEGRATED</span>
          <span>Sistem Absensi, Kos-kosan, & E-Commerce Lightning Template</span>
        </div>
      </footer>

    </div>
  );

  // --- REUSABLE COMPONENTS ---

  // LEFT COMPOSED PANELS (Compose & Templates)
  function renderLeftComposerForm() {
    return (
      <div className="flex flex-col gap-5 h-full">
        
        {/* Template Select Card */}
        <div className="glass-panel p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3.5">
            <Sparkles className="h-4.5 w-4.5 text-[#7C3AED]" />
            <h2 className="font-display font-bold text-sm md:text-base text-slate-800 dark:text-slate-100">
              Pilih Template Spesifikasi
            </h2>
          </div>

          {isLoadingTemplates ? (
            <div className="space-y-2 skeleton-item">
              <div className="h-10 bg-slate-100 dark:bg-white/5 rounded-lg w-full"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {/* Dynamic Preset Cards */}
              {templates.map((tpl) => (
                <button
                  type="button"
                  key={tpl.id}
                  onClick={() => handleTemplateSelect(tpl.id)}
                  className={`text-left p-3.5 rounded-lg border text-xs transition-all flex flex-col gap-1.5 focus:outline-none ${
                    selectedTemplate === tpl.id 
                      ? "active-glow border-[#7C3AED] bg-[#7C3AED]/5 dark:bg-[#7C3AED]/10" 
                      : "border-slate-200/60 dark:border-white/10 bg-slate-50/20 dark:bg-white/5 hover:bg-slate-100/50 dark:hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[#7C3AED] shrink-0">
                      {renderTemplateIcon(tpl.icon, "h-4 w-4")}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {tpl.title}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono tracking-wider block uppercase">
                    {tpl.category}
                  </span>
                </button>
              ))}

              {/* Blank Custom Template */}
              <button
                type="button"
                onClick={() => handleTemplateSelect("custom")}
                className={`text-left p-3.5 rounded-lg border text-xs transition-all flex flex-col gap-1.5 focus:outline-none ${
                  selectedTemplate === "custom" 
                    ? "active-glow border-[#7C3AED] bg-[#7C3AED]/5 dark:bg-[#7C3AED]/10" 
                    : "border-slate-200/60 dark:border-white/10 bg-slate-50/20 dark:bg-white/5 hover:bg-slate-100/50 dark:hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[#7C3AED]">
                    <Plus className="h-4 w-4" />
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Mulai Project Kustom
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono tracking-wider block uppercase">
                  BLANK PRESET
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Input specifications Form Card (Kombinasi Grid + Flexbox responsive CSS) */}
        <div className="glass-panel p-4 md:p-5 flex-1 flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4.5 w-4.5 text-[#7C3AED]" />
              <h2 className="font-display font-bold text-sm md:text-base text-slate-800 dark:text-slate-100">
                Detail Detail Project PRD
              </h2>
            </div>
            <button
              onClick={resetForm}
              className="text-[10px] md:text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-mono flex items-center gap-1 bg-slate-100 dark:bg-white/5 border dark:border-white/5 px-2 py-1 rounded"
              title="Kembalikan form ke draf awal template"
            >
              <RotateCcw className="h-3 w-3" /> RESET
            </button>
          </div>

          <form onSubmit={handleGeneratePrd} className="space-y-4 flex-1 flex flex-col">
            
            {/* Title field - Large on mobile */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                Judul Aplikasi / Spesifikasi
              </label>
              <input
                type="text"
                required
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder="cth: Aplikasi Transportasi Logistik Pintar"
                className="w-full px-3.5 py-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
              />
            </div>

            {/* Description Paragraph */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                Deskripsi Singkat Project
              </label>
              <textarea
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
                rows={2}
                placeholder="Jelaskan secara ringkas maksud utama dari project spesifikasi ini..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-700 dark:text-slate-300 resize-none height-auto"
              />
            </div>

            {/* Problem & Solution Grid Layout (Fleksibel & Responsif pada layar kecil) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  Masalah Utama (Problem Statement)
                </label>
                <textarea
                  value={problemStatement}
                  onChange={(e) => setProblemStatement(e.target.value)}
                  rows={3}
                  placeholder="Latar belakang masalah yang mengganggu target pengguna..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-700 dark:text-slate-300 resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  Solusi yang Diajukan (App Solution)
                </label>
                <textarea
                  value={proposedSolution}
                  onChange={(e) => setProposedSolution(e.target.value)}
                  rows={3}
                  placeholder="Deskripsi solusi digital yang akan diimplementasikan sebagai fitur utama..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-700 dark:text-slate-300 resize-none"
                />
              </div>
            </div>

            {/* Selected features A & B */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                Spesifikasi Fitur Utama
              </label>
              <textarea
                value={selectedFeatures}
                onChange={(e) => setSelectedFeatures(e.target.value)}
                rows={2}
                placeholder="A. Tulis Fitur Utama di sini&#10;B. Tulis Fitur Pendukung di sini"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-700 dark:text-slate-300 resize-none"
              />
            </div>

            {/* Custom Instruction Prompt (Optimized for tailored spec requirements) */}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
                  Instruksi Kustom Tambahan AI (Opsional)
                </label>
                <span className="text-[10px] text-slate-400 font-mono">Beban Tambahan</span>
              </div>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={2}
                placeholder="Contoh: 'Tuliskan database schema menggunakan MongoDB, dan sertakan diagram alir pembayaran Stripe...'"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-700 dark:text-slate-300 resize-none"
              />
            </div>

            {/* Submit Action Block */}
            <div className="pt-2 mt-auto">
              <button
                type="submit"
                disabled={isGenerating || !projectTitle.trim()}
                className="w-full bg-gradient-to-r from-[#7C3AED] to-[#DB2777] hover:opacity-90 active:scale-[0.99] transition-all py-3.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#7C3AED]/20 focus:outline-none disabled:opacity-50 disabled:pointer-events-none"
              >
                {isGenerating ? (
                  <>
                    <Activity className="h-4.5 w-4.5 animate-spin" />
                    <span>Mempersiapkan Dokumen... (Siklus 1/1)</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4.5 w-4.5" />
                    <span>Menulis PRD Spesifikasi Berbasis AI</span>
                  </>
                )}
              </button>
            </div>

          </form>
        </div>

        {/* History of drafts cards on desktop */}
        <div className="hidden md:block">
          {renderHistoryList()}
        </div>

      </div>
    );
  }

  // RIGHT PREVIEW PANELS
  function renderRightPreviewSection() {
    return (
      <div className="flex flex-col gap-4 h-full">
        
        {/* Document Action Control bar */}
        <div className="glass-panel p-3 flex flex-wrap items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
          
          <div className="flex items-center gap-2">
            <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg text-slate-600 dark:text-white">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                Pratinjau PRD Markdown
              </h3>
              <p className="text-[10px] text-slate-400">
                {activePrd ? `Terakhir dibuat: ${activePrd.createdAt}` : "Belum ada dokumen yang dibuat"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            {activePrd && (
              <>
                {/* Print button */}
                <button
                  onClick={handlePrintPrd}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  title="Cetak & Dapatkan dokumen fisik PDF"
                >
                  <Printer className="h-4 w-4" />
                </button>

                {/* Download button */}
                <button
                  onClick={handleDownloadPrd}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  title="Unduh file Markdown (.md)"
                >
                  <Download className="h-4 w-4" />
                </button>

                {/* Copy Markdown button */}
                <button
                  onClick={handleCopyPrd}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1.5 font-medium text-xs font-mono"
                  title="Salin isi penuh draf ke Clipboard"
                >
                  {copyFeedback ? (
                    <>
                      <Check className="h-4 w-4 text-[#7C3AED]" />
                      <span className="text-[#7C3AED] font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>RAW</span>
                    </>
                  )}
                </button>

                {/* Quality Auditor and Interactive QA testing */}
                <button
                  onClick={handleReviewPrd}
                  disabled={isReviewing}
                  className="bg-[#7C3AED]/10 hover:bg-[#7C3AED]/20 text-[#7C3AED] py-2 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all outline-none cursor-pointer"
                  title="Analisis kecukupan kualitas dokumen menggunakan model kecerdasan"
                >
                  {isReviewing ? (
                    <>
                      <Activity className="h-3.5 w-3.5 animate-spin" />
                      <span>Sedang Menguji...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      <span>Uji & Audit PRD</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Outer view wrap for Document Container */}
        <div className="flex-1 min-h-[500px] bg-white dark:bg-[#0D0D0E]/60 border border-slate-200/50 dark:border-white/10 rounded-xl p-5 md:p-8 flex flex-col relative overflow-y-auto">
          
          {/* Lazy-loaded Dynamic Header Background Banner to beautify workspace */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#7C3AED] via-[#DB2777] to-[#7C3AED]"></div>

          {activePrd ? (
            <div className={`prd-prose select-text print-container ${getFontMultiplierClass()}`}>
              
              {/* Cover Layout style element */}
              <div className="mb-8 pb-5 border-b border-dashed border-slate-200 dark:border-white/10 flex justify-between items-start">
                <div>
                  <span className="text-xxs px-2 py-0.5 rounded-full font-mono bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none font-bold">
                    SYSTEM DESIGN WORKSPACE
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1">KoncoPRD SPEC-ID: {activePrd.id}</p>
                </div>
                <div className="text-right">
                  <span className="text-xxs font-semibold font-mono text-[#7C3AED] dark:text-[#DB2777] bg-[#7C3AED]/10 dark:bg-[#DB2777]/10 border dark:border-[#DB2777]/10 px-2 py-0.5 rounded uppercase">
                    {activePrd.category}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1">{activePrd.createdAt}</p>
                </div>
              </div>

              {/* Format Render content */}
              {renderMarkdownAlternative(activePrd.generatedContent)}

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 dark:text-slate-600">
              {/* Lazy Loaded Header illustration mockup */}
              <img 
                loading="lazy" 
                referrerPolicy="no-referrer"
                src="https://res.cloudinary.com/dw8jrpyk9/image/upload/v1779943786/dsx_gj0vd2.webp" 
                alt="KoncoPRD logo placeholder"
                className="w-18 h-18 rounded-2xl mb-4 shadow hover:scale-105 transition-transform opacity-75 dark:opacity-60 grayscale-[40%]" 
              />
              <h3 className="font-display font-medium text-slate-700 dark:text-slate-200 mb-2">
                Draft Spesifikasi Masih Kosong
              </h3>
              <p className="text-xs max-w-sm">
                Isi rincian project di panel kiri atau pilih template cepat untuk mulai merancang. Klik **Menulis PRD** untuk memicu Gemini.
              </p>
            </div>
          )}

        </div>

        {/* Quality review panel (renders on activePrd and when review results generated) */}
        {renderQualityReviewPanel()}

      </div>
    );
  }

  // INTERACTIVE TAB REVIEW / QUALITY AUDIT DETAILS
  function renderQualityReviewPanel() {
    if (!activePrd) {
      return (
        <div className="glass-panel p-5 text-center text-slate-400">
          <p className="text-xs">Uji & Audit memerlukan Spesifikasi PRD aktif. Buat draf dokumen terlebih dahulu.</p>
        </div>
      );
    }

    return (
      <div className="glass-panel p-4 md:p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#7C3AED]" />
            <div>
              <h2 className="font-display font-bold text-sm md:text-base text-slate-800 dark:text-slate-100">
                Modul Pengujian (QA Test Cases) & Audit Kualitas AI
              </h2>
              <p className="text-[10px] text-slate-400">
                Menguji pemenuhan fungsional, keamanan, dan keterbacaan PRD
              </p>
            </div>
          </div>
          
          <button
            onClick={handleReviewPrd}
            disabled={isReviewing}
            className="text-xs bg-[#7C3AED] hover:opacity-95 font-semibold text-white px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50"
          >
            {isReviewing ? (
              <>
                <Activity className="h-3 w-3 animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <RotateCcw className="h-3 w-3" />
                <span>{reviewResult ? "Uji Ulang Dokumen" : "Uji Dokumen"}</span>
              </>
            )}
          </button>
        </div>

        {isReviewing && (
          <div className="py-8 text-center flex flex-col items-center gap-3 justify-center text-slate-500">
            <Activity className="h-8 w-8 text-[#7C3AED] animate-spin" />
            <p className="text-xs max-w-xs font-medium">Model sedang menganalisis spesifikasi dokumen untuk menguji edge cases dan menyusun skenario testing...</p>
          </div>
        )}

        {reviewResult && !isReviewing && (
          <div className="space-y-5">
            
            {/* KPI Metrics Dashboard Grid (Flexbox grid alignment) */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50/50 dark:bg-white/5 p-3 rounded-xl border border-slate-200/50 dark:border-white/10">
              
              {/* Score summary */}
              <div className="text-center sm:border-r border-slate-200/50 dark:border-white/10 p-2 flex flex-col items-center justify-center">
                <span className="text-xxs font-mono text-slate-400 uppercase font-medium">Grade Kualitas</span>
                <span className="text-3xl font-black font-display text-[#7C3AED] dark:text-[#DB2777] my-1">{reviewResult.grade}</span>
                <span className="text-[11px] font-mono text-slate-500">{reviewResult.score}/100 Score</span>
              </div>

              {/* Gauges (Simple text list with responsive layout) */}
              <div className="sm:col-span-3 grid grid-cols-3 gap-2.5 px-2.5">
                
                {/* Metric 1 */}
                <div className="flex flex-col gap-1 justify-center p-1 text-center sm:text-left">
                  <span className="text-[11px] text-slate-400 font-medium">Completeness</span>
                  <span className="text-base font-bold font-display text-slate-800 dark:text-slate-100">{reviewResult.metrics?.completeness || 80}%</span>
                  <div className="h-1 w-full bg-slate-200 dark:bg-white/5 rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full bg-[#7C3AED]" style={{ width: `${reviewResult.metrics?.completeness || 80}%` }}></div>
                  </div>
                </div>

                {/* Metric 2 */}
                <div className="flex flex-col gap-1 justify-center p-1 text-center sm:text-left">
                  <span className="text-[11px] text-slate-400 font-medium">Security (OWASP)</span>
                  <span className="text-base font-bold font-display text-slate-800 dark:text-slate-100">{reviewResult.metrics?.security || 75}%</span>
                  <div className="h-1 w-full bg-slate-200 dark:bg-white/5 rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full bg-[#DB2777]" style={{ width: `${reviewResult.metrics?.security || 75}%` }}></div>
                  </div>
                </div>

                {/* Metric 3 */}
                <div className="flex flex-col gap-1 justify-center p-1 text-center sm:text-left">
                  <span className="text-[11px] text-slate-400 font-medium">Readability</span>
                  <span className="text-base font-bold font-display text-slate-800 dark:text-slate-100">{reviewResult.metrics?.readability || 90}%</span>
                  <div className="h-1 w-full bg-slate-200 dark:bg-white/5 rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${reviewResult.metrics?.readability || 90}%` }}></div>
                  </div>
                </div>

              </div>

            </div>

            {/* Critique Summary */}
            <div className="text-xs text-slate-600 dark:text-slate-300 bg-[#7C3AED]/10 dark:bg-[#7C3AED]/10 px-3.5 py-3 rounded-lg border-l-2 border-[#7C3AED] leading-relaxed">
              <span className="font-semibold text-slate-800 dark:text-slate-100 block mb-0.5">Ringkasan Evaluasi AI:</span>
              {reviewResult.summary}
            </div>

            {/* Interactive functional test suite (Uji & testing) Checkbox list */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Interactive QA Test Cases</span>
                <span className="text-[10px] font-mono text-slate-400">
                  {Object.values(testCaseChecked).filter(Boolean).length} dari {reviewResult.testCases?.length} Diuji
                </span>
              </div>
              
              <div className="max-h-[220px] overflow-y-auto space-y-2 border border-[#7C3AED]/20 p-2.5 rounded-lg bg-slate-50/20 dark:bg-[#0D0D0E]/50">
                {reviewResult.testCases?.map((tc, index) => {
                  const isChecked = !!testCaseChecked[tc.id];
                  const severityColors = 
                    tc.severity === "High" 
                      ? "text-red-400 bg-red-950/20 border-red-900" 
                      : tc.severity === "Medium"
                        ? "text-amber-400 bg-amber-950/20 border-amber-900"
                        : "text-blue-400 bg-blue-950/20 border-blue-900";

                  return (
                    <div 
                      key={tc.id || index}
                      onClick={() => toggleTestCaseCheck(tc.id)}
                      className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 cursor-pointer text-xs ${
                        isChecked 
                          ? "bg-slate-50 dark:bg-[#0D0D0E]/30 border-slate-200 dark:border-white/10 opacity-60" 
                          : "bg-white dark:bg-[#0D0D0E] border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 shadow-sm"
                      }`}
                    >
                      {/* Check box icon toggle button */}
                      <button 
                        type="button"
                        className={`h-4.5 w-4.5 rounded flex items-center justify-center shrink-0 border mt-0.5 ${
                          isChecked 
                            ? "bg-[#7C3AED] border-[#7C3AED] text-white" 
                            : "border-slate-300 dark:border-white/10 text-transparent"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="font-mono text-xxs font-bold text-slate-500">{tc.id}</span>
                          <span className="px-1.5 py-0.5 border rounded text-[10px] font-mono capitalize tracking-wider font-semibold">
                            {tc.module}
                          </span>
                          <span className={`px-1.5 py-0.5 border rounded text-[9px] font-semibold tracking-wider font-mono ${severityColors}`}>
                            {tc.severity} Severity
                          </span>
                        </div>
                        <p className={`font-semibold ${isChecked ? 'line-through text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>
                          {tc.scenario}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                          <strong className="text-slate-500 font-mono">Expected:</strong> {tc.expected}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Security Compliance Checklist & Suggestions */}
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">Checklist Keamanan (Security Audit Checklist)</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {reviewResult.securityAudit?.map((audit, index) => {
                  const pass = audit.status === "PASS";
                  const warn = audit.status === "WARN";
                  const iconColor = pass ? "text-[#7C3AED]" : warn ? "text-amber-500" : "text-red-500";
                  const bgColor = pass ? "border-[#7C3AED]/20 bg-[#7C3AED]/5" : warn ? "border-amber-500/20 bg-amber-500/5" : "border-red-500/20 bg-red-500/5";

                  return (
                    <div 
                      key={index}
                      className={`p-3 rounded-lg border flex flex-col gap-1 text-xs ${bgColor}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 text-xxs block">{audit.checkpoint}</span>
                        <span className={`h-2 w-2 rounded-full ${pass ? 'bg-[#7C3AED]' : warn ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-normal mt-1">{audit.notes}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Improvements Panel */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-900">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">Rekomendasi Tambahan (AI Improvements)</span>
              <ul className="text-xs space-y-1.5 pl-4 list-decimal text-slate-505 dark:text-slate-400 leading-relaxed font-sans">
                {reviewResult.improvements?.map((imp, inx) => (
                  <li key={inx}>{imp}</li>
                ))}
              </ul>
            </div>

          </div>
        )}

        {!reviewResult && !isReviewing && (
          <div className="text-center py-6 text-slate-400 dark:text-slate-600 flex flex-col items-center justify-center gap-2">
            <ShieldCheck className="h-10 w-10 text-slate-300 dark:text-slate-800" />
            <h4 className="font-display font-medium text-xs text-slate-700 dark:text-slate-300">Peninjau Kualitas Dokumen Belum Dipicu</h4>
            <p className="text-[11px] max-w-sm px-2">
              Kecerdasan AI dapat memproses dan menguji kecukupan spesifikasi draf Anda secara real-time. Klik **Uji Dokumen** untuk menguji ketebalan PRD Anda.
            </p>
          </div>
        )}

      </div>
    );
  }

  // REUSABLE HISTORY LOG PANEL
  function renderHistoryList() {
    return (
      <div className="glass-panel p-4 md:p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="h-4.5 w-4.5 text-[#7C3AED]" />
          <h2 className="font-display font-bold text-sm md:text-base text-slate-800 dark:text-slate-100">
            Riwayat Draf PRD ({history.length})
          </h2>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-6 text-stone-400 dark:text-slate-600 text-xs">
            Belum ada spesifikasi tersimpan
          </div>
        ) : (
          <div className="space-y-2 max-h-[140px] md:max-h-[220px] overflow-y-auto pr-1">
            {history.map((spec) => {
              const isSelected = activePrd?.id === spec.id;
              return (
                <div
                  key={spec.id}
                  onClick={() => loadFromHistory(spec)}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between gap-3 text-xs ${
                    isSelected 
                      ? "active-glow border-[#7C3AED] bg-[#7C3AED]/5 dark:bg-[#7C3AED]/10 font-semibold" 
                      : "border-slate-200/50 dark:border-white/10 bg-white/5 dark:bg-white/5 hover:bg-slate-100/50 dark:hover:bg-white/10"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">
                      {spec.title}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono tracking-wider block uppercase mt-0.5">
                      {spec.category} • {spec.createdAt}
                    </span>
                  </div>
                  
                  <button
                    onClick={(e) => deleteFromHistory(spec.id, e)}
                    className="p-1 px-1.5 rounded bg-slate-50 hover:bg-red-50 hover:text-red-600 dark:bg-white/5 dark:hover:bg-red-950/50 dark:hover:text-red-400 transition-colors cursor-pointer"
                    title="Hapus draf spesifikasi dari riwayat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
}
