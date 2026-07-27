import { describe, expect, it } from "vitest";
import { generateTests } from "./generateTests";
import { FakeProvider } from "../providers/fakeProvider";
import { ProviderRegistry } from "../providers/registry";
import { createBaseState, createContext } from "./testHelpers";

const constraint = {
  id: "c1",
  type: "functional" as const,
  earsPattern: "event_driven" as const,
  earsText: "When a user submits valid credentials, the system shall log them in.",
  description: "desc",
  required: true,
  severity: 8,
};

describe("generateTests", () => {
  it("produces one TestCase per constraint from provider JSON", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      new FakeProvider({
        id: "fake-tests",
        completeResponse: JSON.stringify({
          testCases: [
            {
              constraintId: "c1",
              name: "logs in with valid credentials",
              description: "Verifies successful login.",
              testCode: "expect(login('a@b.com','pw')).toBe(true);",
              expectedOutcome: "login returns true",
            },
          ],
        }),
      })
    );

    const result = await generateTests(
      createBaseState({ constraints: [constraint] }),
      createContext(registry, "fake-tests")
    );

    expect(result.testCases).toHaveLength(1);
    expect(result.testCases[0].constraintId).toBe("c1");
    expect(result.testCases[0].passed).toBeNull();
    expect(result.testCases[0].id).toBeTruthy();
  });

  it("throws a clear error on a malformed response", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      new FakeProvider({ id: "fake-bad", completeResponse: JSON.stringify({ oops: true }) })
    );

    await expect(
      generateTests(
        createBaseState({ constraints: [constraint] }),
        createContext(registry, "fake-bad")
      )
    ).rejects.toThrow(/did not match the expected shape/);
  });
});
