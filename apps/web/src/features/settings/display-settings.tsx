import {
  createContext,
  createMemo,
  createSignal,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";

export type ChipDisplayUnit = "usd" | "bb";

interface DisplaySettingsContextValue {
  bigBlindCents: Accessor<number | null>;
  chipDisplayUnit: Accessor<ChipDisplayUnit>;
  formatChipAmount: (amountCents: number) => string;
  setChipDisplayUnit: (unit: ChipDisplayUnit) => void;
}

const CHIP_DISPLAY_UNIT_STORAGE_KEY = "openpoker:chip-display-unit";
const DEFAULT_CHIP_DISPLAY_UNIT: ChipDisplayUnit = "usd";

const DisplaySettingsContext = createContext<DisplaySettingsContextValue>();

export function DisplaySettingsProvider(props: { children: JSX.Element }) {
  const [chipDisplayUnit, setChipDisplayUnitSignal] =
    createSignal<ChipDisplayUnit>(readStoredChipDisplayUnit());
  const bigBlindCents = () => null;
  const setChipDisplayUnit = (unit: ChipDisplayUnit) => {
    setChipDisplayUnitSignal(unit);
    writeStoredChipDisplayUnit(unit);
  };
  const value: DisplaySettingsContextValue = {
    bigBlindCents,
    chipDisplayUnit,
    formatChipAmount: (amountCents) =>
      formatChipAmountForDisplay(
        amountCents,
        chipDisplayUnit(),
        bigBlindCents(),
      ),
    setChipDisplayUnit,
  };

  return (
    <DisplaySettingsContext.Provider value={value}>
      {props.children}
    </DisplaySettingsContext.Provider>
  );
}

export function TableChipDisplayScope(props: {
  bigBlindCents: number | null;
  children: JSX.Element;
}) {
  const parent = useDisplaySettings();
  const bigBlindCents = createMemo(() => props.bigBlindCents);
  const value: DisplaySettingsContextValue = {
    bigBlindCents,
    chipDisplayUnit: parent.chipDisplayUnit,
    formatChipAmount: (amountCents) =>
      formatChipAmountForDisplay(
        amountCents,
        parent.chipDisplayUnit(),
        bigBlindCents(),
      ),
    setChipDisplayUnit: parent.setChipDisplayUnit,
  };

  return (
    <DisplaySettingsContext.Provider value={value}>
      {props.children}
    </DisplaySettingsContext.Provider>
  );
}

export function useDisplaySettings(): DisplaySettingsContextValue {
  const context = useContext(DisplaySettingsContext);

  if (!context) {
    throw new Error("Display settings context is not available.");
  }

  return context;
}

export function formatChipAmountForDisplay(
  amountCents: number,
  unit: ChipDisplayUnit,
  bigBlindCents: number | null,
): string {
  if (unit === "bb" && bigBlindCents !== null && bigBlindCents > 0) {
    return `${formatCompactNumber(amountCents / bigBlindCents)} BB`;
  }

  return formatUsdAmount(amountCents);
}

export function formatChipInputValue(
  amountCents: number,
  unit: ChipDisplayUnit,
  bigBlindCents: number | null,
): string {
  if (unit === "bb" && bigBlindCents !== null && bigBlindCents > 0) {
    return formatCompactNumber(amountCents / bigBlindCents);
  }

  const dollars = amountCents / 100;

  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

export function parseChipInputAsCents(
  value: string,
  unit: ChipDisplayUnit,
  bigBlindCents: number | null,
): number | null {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  if (unit === "bb" && bigBlindCents !== null && bigBlindCents > 0) {
    return Math.round(amount * bigBlindCents);
  }

  return Math.round(amount * 100);
}

function formatUsdAmount(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function readStoredChipDisplayUnit(): ChipDisplayUnit {
  if (typeof localStorage === "undefined") {
    return DEFAULT_CHIP_DISPLAY_UNIT;
  }

  const storedValue = localStorage.getItem(CHIP_DISPLAY_UNIT_STORAGE_KEY);

  return storedValue === "bb" || storedValue === "usd"
    ? storedValue
    : DEFAULT_CHIP_DISPLAY_UNIT;
}

function writeStoredChipDisplayUnit(unit: ChipDisplayUnit): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(CHIP_DISPLAY_UNIT_STORAGE_KEY, unit);
}
