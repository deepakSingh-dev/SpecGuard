import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "./registry";
import { FakeProvider } from "./fakeProvider";

describe("ProviderRegistry", () => {
  it("resolves a known provider id", () => {
    const registry = new ProviderRegistry();
    const fake = new FakeProvider({ id: "fake" });
    registry.register(fake);

    expect(registry.resolve("fake")).toBe(fake);
  });

  it("throws on an unknown provider id", () => {
    const registry = new ProviderRegistry();
    registry.register(new FakeProvider({ id: "fake" }));

    expect(() => registry.resolve("does-not-exist")).toThrow(/Unknown provider/);
  });
});
