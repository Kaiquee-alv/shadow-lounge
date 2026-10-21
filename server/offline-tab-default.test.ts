import { describe, expect, it } from "vitest";
import { createOfflineTab } from "../client/src/lib/offline";

describe("createOfflineTab", () => {
  it("starts empty without a tip when the cash session is closed", () => {
    const tab = createOfflineTab({ id: 2, number: 4 }, false);
    expect(tab).toMatchObject({ tipPercent: 0, tipCents: 0, items: [], payments: [] });
  });

  it("keeps the default tip selected when the cash session is open", () => {
    const tab = createOfflineTab({ id: 2, number: 4 }, true);
    expect(tab).toMatchObject({ tipPercent: 10, tipCents: 0, items: [], payments: [] });
  });
});
