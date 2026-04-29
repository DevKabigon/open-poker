import { describe, expect, it } from "vitest";
import { createTableSkeletonSnapshot } from "./table-fixtures";
import { getShowdownOverlayKey } from "./TableShowdownOverlay";

const bestCards = ["As", "Ah", "Kd", "Qc", "Js"] as [
  string,
  string,
  string,
  string,
  string,
];

describe("showdown overlay trigger", () => {
  it("shows once for the transient showdown street", () => {
    const { table } = createTableSkeletonSnapshot();
    const showdownTable = {
      ...table,
      handStatus: "showdown" as const,
      street: "showdown" as const,
      showdownSummary: null,
    };

    expect(getShowdownOverlayKey(showdownTable)).toBe("mock-hand-0001");
  });

  it("shows for settled showdown summaries because the server may settle immediately", () => {
    const { table } = createTableSkeletonSnapshot();
    const settledShowdownTable = {
      ...table,
      handStatus: "settled" as const,
      street: "showdown" as const,
      showdownSummary: {
        handId: table.handId,
        handNumber: table.handNumber,
        handEvaluations: [
          {
            seatId: 0,
            category: "one-pair" as const,
            bestCards,
            isRevealed: true,
          },
        ],
        potAwards: [
          {
            potIndex: 0,
            amount: 4800,
            eligibleSeatIds: [0, 2],
            winnerSeatIds: [0],
            shares: [{ seatId: 0, amount: 4800 }],
          },
        ],
        payouts: [{ seatId: 0, amount: 4800 }],
        uncalledBetReturn: null,
      },
    };

    expect(getShowdownOverlayKey(settledShowdownTable)).toBe("mock-hand-0001");
  });

  it("does not show for fold-ended uncontested pots", () => {
    const { table } = createTableSkeletonSnapshot();
    const uncontestedTable = {
      ...table,
      handStatus: "settled" as const,
      showdownSummary: {
        handId: table.handId,
        handNumber: table.handNumber,
        handEvaluations: [],
        potAwards: [
          {
            potIndex: 0,
            amount: 4800,
            eligibleSeatIds: [0],
            winnerSeatIds: [0],
            shares: [{ seatId: 0, amount: 4800 }],
          },
        ],
        payouts: [{ seatId: 0, amount: 4800 }],
        uncalledBetReturn: null,
      },
    };

    expect(getShowdownOverlayKey(uncontestedTable)).toBeNull();
  });
});
