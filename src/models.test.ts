import { describe, expect, it } from "vitest";
import { Constraint, EarsPattern, SpecRequest } from "./models";

describe("Constraint", () => {
  it("parses a valid constraint", () => {
    const result = Constraint.safeParse({
      id: "c1",
      type: "functional",
      earsPattern: "ubiquitous",
      earsText: "The system shall persist user preferences.",
      description: "Preferences must survive restarts.",
      required: true,
      severity: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects severity outside 1-10", () => {
    const result = Constraint.safeParse({
      id: "c1",
      type: "functional",
      earsPattern: "ubiquitous",
      earsText: "The system shall persist user preferences.",
      description: "Preferences must survive restarts.",
      required: true,
      severity: 11,
    });
    expect(result.success).toBe(false);
  });
});

describe("EarsPattern", () => {
  it("rejects a value outside the enum", () => {
    const result = EarsPattern.safeParse("garbage");
    expect(result.success).toBe(false);
  });
});

describe("SpecRequest", () => {
  it("rejects a title shorter than 3 characters", () => {
    const result = SpecRequest.safeParse({
      title: "ab",
      description: "This is a valid description.",
      naturalLanguageSpec: "This spec is definitely long enough to pass.",
    });
    expect(result.success).toBe(false);
  });
});
