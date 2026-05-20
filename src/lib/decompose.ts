export interface DecomposedTask {
  task_id: string;
  instruction: string;
  acceptance_criteria: string;
  file_scope: string[];
  estimated_complexity: "small" | "medium" | "large";
}

export interface DecomposedEdge {
  from: string;
  to: string;
}

export interface DecomposedGraph {
  tasks: DecomposedTask[];
  edges: DecomposedEdge[];
}

const MAX_FILE_SCOPE_PER_TASK = 10;
const FILENAME_RE = /[A-Za-z_][\w./-]*\.[a-z]{1,8}/g;
const BACKTICK_RE = /`([^`\n]{1,200})`/g;

function splitNumberedList(text: string): string[] | null {
  const re = /(?:^|\n|\s)(\d+)[.)]\s+/g;
  const matches: { idx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push({ idx: m.index + m[0].length });
  }
  if (matches.length < 2) return null;
  const out: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? text.lastIndexOf(`${i + 2}`, matches[i + 1].idx) : text.length;
    const slice = text.slice(start, end).trim();
    if (slice.length > 0) out.push(slice);
  }
  return out.length >= 2 ? out : null;
}

function splitBulletedList(text: string): string[] | null {
  const lines = text.split(/\n/);
  const bulletLines = lines.filter((l) => /^\s*[-*]\s+/.test(l));
  if (bulletLines.length < 2) return null;
  return bulletLines.map((l) => l.replace(/^\s*[-*]\s+/, "").trim()).filter((s) => s.length > 0);
}

function splitConjunctions(text: string): string[] | null {
  const tokens = text.split(/\s*;\s*|\s+(?:then|and then|after that|before that|next)\s+/i);
  const cleaned = tokens.map((t) => t.trim().replace(/[.]+$/, "")).filter((t) => t.length > 0);
  return cleaned.length >= 2 ? cleaned : null;
}

function inferFileScope(clause: string): string[] {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = BACKTICK_RE.exec(clause)) !== null) {
    const candidate = m[1].trim();
    if (FILENAME_RE.test(candidate) || candidate.includes("/")) {
      set.add(candidate);
    }
  }
  BACKTICK_RE.lastIndex = 0;
  while ((m = FILENAME_RE.exec(clause)) !== null) {
    const candidate = m[0];
    if (!candidate.startsWith(".")) set.add(candidate);
  }
  FILENAME_RE.lastIndex = 0;
  const out = Array.from(set);
  return out.slice(0, MAX_FILE_SCOPE_PER_TASK);
}

function truncate(text: string, n: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= n) return clean;
  return `${clean.slice(0, n - 1).trimEnd()}…`;
}

function makeTask(idx: number, clause: string): DecomposedTask {
  const trimmed = clause.replace(/\s+/g, " ").trim();
  const summary = truncate(trimmed, 80);
  return {
    task_id: `step-${idx + 1}`,
    instruction: trimmed,
    acceptance_criteria: `Acceptance: ${summary}. All tests in the affected file_scope pass; lint is green.`,
    file_scope: inferFileScope(trimmed),
    estimated_complexity: "medium",
  };
}

export function decomposeObjective(objective: string): DecomposedGraph {
  const text = (objective ?? "").trim();
  if (text.length === 0) return { tasks: [], edges: [] };

  let clauses =
    splitNumberedList(text) ?? splitBulletedList(text) ?? splitConjunctions(text);
  if (!clauses) clauses = [text];

  const tasks = clauses.map((c, i) => makeTask(i, c));
  const edges: DecomposedEdge[] = [];
  for (let i = 0; i + 1 < tasks.length; i++) {
    edges.push({ from: tasks[i].task_id, to: tasks[i + 1].task_id });
  }
  return { tasks, edges };
}
