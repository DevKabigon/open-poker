import type { TableCardCode } from "@openpoker/protocol";
import { Show, createMemo, type JSX } from "solid-js";
import {
  CARD_BACK_ASSET_PATH,
  CHIP_ASSET_PATH,
  DEALER_BUTTON_ASSET_PATH,
  getCardAssetPath,
} from "./table-assets";

export function SectionTitle(props: { label: string }) {
  return (
    <p class="font-data text-[0.62rem] uppercase tracking-[0.16em] text-[var(--op-accent-400)]">
      {props.label}
    </p>
  );
}

export function Metric(props: {
  label: string;
  value: string;
  chip?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      class={`min-w-0 rounded-[0.75rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(238,246,255,0.04)] ${
        props.compact ? "px-2 py-1.5" : "px-2.5 py-2"
      }`}
    >
      <p class="font-data text-[0.52rem] uppercase leading-none tracking-[0.12em] text-[var(--op-muted-500)]">
        {props.label}
      </p>
      <ChipValue
        class={props.compact ? "mt-0.5" : "mt-1"}
        value={props.value}
        visible={props.chip}
      />
    </div>
  );
}

export function ValueRow(props: { label: string; value: string; chip?: boolean }) {
  return (
    <div class="flex min-w-0 items-center justify-between gap-2">
      <span class="text-[var(--op-muted-500)]">{props.label}</span>
      <ChipValue value={props.value} visible={props.chip} />
    </div>
  );
}

export type TagTone =
  | "active"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "all-in"
  | "fold";

export function Tag(props: { label: string; tone?: TagTone }) {
  const isDealer = createMemo(() => props.label === "BTN");

  return (
    <span
      class={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 font-data text-[0.55rem] font-bold uppercase leading-none tracking-[0.06em] ${getTagToneClass(props.tone)}`}
    >
      <Show when={isDealer()}>
        <img
          class="size-3.5 rounded-full"
          src={DEALER_BUTTON_ASSET_PATH}
          alt=""
          aria-hidden="true"
        />
      </Show>
      {props.label}
    </span>
  );
}

function getTagToneClass(tone: TagTone | undefined): string {
  switch (tone) {
    case "active":
      return "border-[rgba(96,165,250,0.42)] bg-[rgba(96,165,250,0.14)] text-[var(--op-accent-300)]";
    case "check":
      return "border-[rgba(74,222,128,0.42)] bg-[rgba(34,197,94,0.14)] text-[#86efac]";
    case "call":
      return "border-[rgba(96,165,250,0.44)] bg-[rgba(59,130,246,0.15)] text-[#93c5fd]";
    case "bet":
      return "border-[rgba(251,146,60,0.46)] bg-[rgba(249,115,22,0.15)] text-[#fdba74]";
    case "raise":
      return "border-[rgba(192,132,252,0.46)] bg-[rgba(147,51,234,0.16)] text-[#d8b4fe]";
    case "all-in":
      return "border-[rgba(255,255,255,0.2)] bg-[linear-gradient(90deg,rgba(34,197,94,0.22),rgba(59,130,246,0.24),rgba(168,85,247,0.28),rgba(249,115,22,0.24))] text-[#fff7ed] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_0_14px_rgba(168,85,247,0.14)]";
    case "fold":
      return "border-[rgba(248,113,113,0.46)] bg-[rgba(220,38,38,0.15)] text-[#fecaca]";
    default:
      return "border-[rgba(238,246,255,0.1)] bg-[rgba(238,246,255,0.05)] text-[var(--op-muted-300)]";
  }
}

export function PlayingCard(props: {
  card: TableCardCode | null;
  class?: string;
  compact?: boolean;
  emptyVariant?: "face-down" | "placeholder";
  size?: "compact" | "default" | "board" | "seat";
  style?: JSX.CSSProperties;
}) {
  const assetPath = createMemo(() =>
    props.card
      ? getCardAssetPath(props.card)
      : props.emptyVariant === "placeholder"
        ? null
        : CARD_BACK_ASSET_PATH,
  );
  const emptyAlt = createMemo(() =>
    props.emptyVariant === "placeholder" ? "Empty card slot" : "Face-down card",
  );
  const sizeClass = createMemo(() => {
    const size = props.size ?? (props.compact ? "compact" : "default");

    if (size === "compact") {
      return "h-10 aspect-[66/96]";
    }

    if (size === "board") {
      return "h-14 aspect-[66/96] sm:h-16 lg:h-[4.6rem] xl:h-20";
    }

    if (size === "seat") {
      return "h-14 aspect-[66/96] sm:h-16 lg:h-[4.6rem] xl:h-20";
    }

    return "h-14 aspect-[66/96] sm:h-16";
  });

  return (
    <div
      class={`${sizeClass()} relative shrink-0 overflow-hidden rounded-[0.32rem] border ${props.class ?? ""} ${
        props.card
          ? "border-[rgba(238,246,255,0.22)] bg-[var(--op-cream-100)]"
          : props.emptyVariant === "placeholder"
            ? "op-board-card-placeholder border-[rgba(238,246,255,0.08)] bg-[rgba(238,246,255,0.03)]"
          : "border-[rgba(238,246,255,0.07)] bg-[rgba(238,246,255,0.035)] opacity-65"
      }`}
      style={props.style}
    >
      <Show
        when={assetPath()}
        fallback={
          <div class="grid size-full place-items-center">
            <span class="sr-only">{emptyAlt()}</span>
          </div>
        }
      >
        {(src) => (
          <img
            class="size-full object-contain"
            src={src()}
            alt={props.card ? `Card ${props.card}` : emptyAlt()}
          />
        )}
      </Show>
    </div>
  );
}

export function ChipValue(props: {
  value: string;
  visible?: boolean;
  class?: string;
}) {
  return (
    <span
      class={`flex min-w-0 items-center justify-end gap-1 font-data text-[0.68rem] font-semibold leading-none text-[var(--op-cream-100)] sm:text-xs ${props.class ?? ""}`}
    >
      <Show when={props.visible}>
        <img
          class="size-4 shrink-0"
          src={CHIP_ASSET_PATH}
          alt=""
          aria-hidden="true"
        />
      </Show>
      <span class="truncate">{props.value}</span>
    </span>
  );
}
