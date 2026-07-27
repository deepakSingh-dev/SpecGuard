import { describe, expect, it } from "vitest";
import { generateCode } from "./generateCode";
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

describe("generateCode", () => {
  it("delegates to the code-generation provider and stores its summary", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      new FakeProvider({
        id: "fake-gen",
        delegateTaskResult: { filesWritten: ["src/login.ts"], summary: "Implemented login." },
      })
    );

    const result = await generateCode(
      createBaseState({ constraints: [constraint], worktreePath: "/tmp/fake-worktree" }),
      createContext(registry, "fake-gen")
    );

    expect(result.generatedCode).toBe("Implemented login.");
  });

  it("throws when worktreePath is not set", async () => {
    const registry = new ProviderRegistry();
    registry.register(new FakeProvider({ id: "fake-gen" }));

    await expect(
      generateCode(
        createBaseState({ constraints: [constraint], worktreePath: null }),
        createContext(registry, "fake-gen")
      )
    ).rejects.toThrow(/worktreePath/);
  });
});
