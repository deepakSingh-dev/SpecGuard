import { describe, expect, it } from "vitest";
import { extractConstraints } from "./extractConstraints";
import { FakeProvider } from "../providers/fakeProvider";
import { ProviderRegistry } from "../providers/registry";
import { createBaseState, createContext } from "./testHelpers";

describe("extractConstraints", () => {
  it("parses provider JSON into typed EARS constraints", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      new FakeProvider({
        id: "fake-extract",
        completeResponse: JSON.stringify({
          constraints: [
            {
              type: "functional",
              earsPattern: "event_driven",
              earsText: "When a user submits valid credentials, the system shall log them in.",
              description: "Successful login on valid credentials.",
              required: true,
              severity: 8,
            },
          ],
        }),
      })
    );

    const result = await extractConstraints(
      createBaseState(),
      createContext(registry, "fake-extract")
    );

    expect(result.constraints).toHaveLength(1);
    expect(result.constraints[0].earsPattern).toBe("event_driven");
    expect(result.constraints[0].type).toBe("functional");
    expect(result.constraints[0].id).toBeTruthy();
  });

  it("throws a clear error, including the raw response, on invalid JSON", async () => {
    const registry = new ProviderRegistry();
    registry.register(new FakeProvider({ id: "fake-bad", completeResponse: "not json" }));

    await expect(
      extractConstraints(createBaseState(), createContext(registry, "fake-bad"))
    ).rejects.toThrow(/not valid JSON/);
  });
});
