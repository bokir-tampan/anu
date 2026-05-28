export interface WorkspaceTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  problem: string;
  solution: string;
  features: string;
  icon: string;
}

export interface PrdSpec {
  id: string;
  title: string;
  category: string;
  description: string;
  problem: string;
  solution: string;
  features: string;
  customPrompt?: string;
  generatedContent: string;
  createdAt: string;
}

export interface TestCase {
  id: string;
  module: string;
  scenario: string;
  expected: string;
  severity: "High" | "Medium" | "Low";
}

export interface SecurityAuditItem {
  checkpoint: string;
  status: "PASS" | "WARN" | "FAIL";
  notes: string;
}

export interface ReviewResult {
  score: number;
  grade: string;
  summary: string;
  metrics: {
    completeness: number; // 0 - 100
    security: number; // 0 - 100
    readability: number; // 0 - 100
  };
  testCases: TestCase[];
  securityAudit: SecurityAuditItem[];
  improvements: string[];
}

export interface WorkspaceSettings {
  theme: "light" | "dark";
  fontSizeMultiplier: "sm" | "base" | "lg" | "xl"; // font-customisation
  leftPaneWidthPercentage: number; // split layout state
}
