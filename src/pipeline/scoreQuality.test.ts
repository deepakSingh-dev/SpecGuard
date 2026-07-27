import { describe, expect, it } from "vitest";
import { scoreQuality } from "./scoreQuality";
import { FakeProvider } from "../providers/fakeProvider";
import { ProviderRegistry } from "../providers/registry";
import { createBaseState, createContext } from "./testHelpers";

const sixDimensionScore = {
  overallScore: 82,
  dimensions: [
    { name: "correctness", score: 85, rationale: "Handles the happy path.", suggestions: [] },
    { name: "completeness", score: 80, rationale: "Covers all constraints.", suggestions: [] },
    { name: "type_safety", score: 90, rationale: "Fully typed.", suggestions: [] },
    { name: "security", score: 75, rationale: "No obvious issues.", suggestions: ["Add rate limiting"] },
    { name: "maintainability", score: 80, rationale: "Readable.", suggestions: [] },
    { name: "test_coverage", score: 82, rationale: "One test per constraint.", suggestions: [] },
  ],
  compliant: true,
  blockingIssues: [],
  summary: "Solid implementation.",
};

describe("scoreQuality", () => {
  it("parses a six-dimension provider report into a QualityReport", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      new FakeProvider({ id: "fake-score", completeResponse: JSON.stringify(sixDimensionScore) })
    );

    const result = await scoreQuality(createBaseState(), createContext(registry, "fake-score"));

    expect(result.qualityReport).not.toBeNull();
    expect(result.qualityReport?.dimensions).toHaveLength(6);
    expect(result.qualityReport?.overallScore).toBe(82);
    expect(result.qualityReport?.compliant).toBe(true);
  });

  it("throws a clear error when a dimension score is out of range", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      new FakeProvider({
        id: "fake-bad",
        completeResponse: JSON.stringify({ ...sixDimensionScore, overallScore: 150 }),
      })
    );

    await expect(
      scoreQuality(createBaseState(), createContext(registry, "fake-bad"))
    ).rejects.toThrow(/did not match the expected shape/);
  });
});
