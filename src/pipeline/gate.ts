import type { Constraint, QualityReport, TestCase } from "../models";

export interface GateResult {
  passed: boolean;
  reasons: string[];
}

/**
 * Authoritative pass/fail decision, independent of whatever `compliant` the
 * scoring provider self-reported. compliant = overallScore >= threshold AND
 * no severity >= 8 constraint has a failing test.
 */
export function applyGate(
  qualityReport: QualityReport,
  threshold: number,
  constraints: Constraint[],
  testCases: TestCase[]
): GateResult {
  const reasons: string[] = [];

  if (qualityReport.overallScore < threshold) {
    reasons.push(
      `Overall score ${qualityReport.overallScore} is below the gate threshold of ${threshold}.`
    );
  }

  for (const constraint of findSevereFailures(constraints, testCases)) {
    reasons.push(
      `Constraint "${constraint.earsText}" has severity ${constraint.severity} (>= 8) and a failing test.`
    );
  }

  return { passed: reasons.length === 0, reasons };
}

function findSevereFailures(constraints: Constraint[], testCases: TestCase[]): Constraint[] {
  const failingConstraintIds = new Set(
    testCases.filter((t) => t.passed === false).map((t) => t.constraintId)
  );
  return constraints.filter((c) => c.severity >= 8 && failingConstraintIds.has(c.id));
}
