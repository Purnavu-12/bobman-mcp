import type { RiskScore } from "../risk/score.js";

export interface FormattedRiskScore extends RiskScore {
  composite_0_1: number;
  risk_score_0_100: number;
  explanation: string;
  coverage_lines_pct: number | null;
  coverage_data_available: boolean;
}

export function formatRiskScore(
  score: RiskScore,
  coverageMeta?: { lines_pct: number | null; has_data: boolean },
): FormattedRiskScore {
  const composite_0_1 = score.composite;
  const risk_score_0_100 = Math.round(composite_0_1 * 100);
  const covPct =
    coverageMeta?.has_data && coverageMeta.lines_pct !== null
      ? Math.round(coverageMeta.lines_pct * 100)
      : null;
  const covNote =
    covPct !== null
      ? `test line coverage ${covPct}% (gap ${Math.round(score.coverage_gap * 100)}%)`
      : "no coverage.json found; coverage gap assumed 50%";

  const explanation = [
    `Risk score ${risk_score_0_100}/100 (composite ${composite_0_1.toFixed(2)}).`,
    `Fan-in weight ${Math.round(score.fan_in * 100)}%, churn ${Math.round(score.churn * 100)}%,`,
    `merge conflicts ${Math.round(score.conflict * 100)}%, ${covNote}.`,
    `Prioritize impact map before editing high fan-in files.`,
  ].join(" ");

  return {
    ...score,
    composite_0_1,
    risk_score_0_100,
    explanation,
    coverage_lines_pct: coverageMeta?.lines_pct ?? null,
    coverage_data_available: coverageMeta?.has_data ?? false,
  };
}
