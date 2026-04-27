import type { TableCardCode } from "@openpoker/protocol";
import { Show, createMemo } from "solid-js";
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

export function Metric(props: { label: string; value: string; chip?: boolean }) {
  return (
    <div class="min-w-0 rounded-[0.75rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(238,246,255,0.04)] px-2.5 py-2">
      <p class="font-data text-[0.52rem] uppercase leading-none tracking-[0.12em] text-[var(--op-muted-500)]">
        {props.label}
      </p>
      <ChipValue class="mt-1" value={props.value} visible={props.chip} />
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

export function Tag(props: { label: string; tone?: "active" }) {
  const isDealer = createMemo(() => props.label === "BTN");

  return (
    <span
      class={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-data text-[0.55rem] font-bold uppercase leading-none tracking-[0.06em] ${
        props.tone === "active"
          ? "border-[rgba(96,165,250,0.42)] bg-[rgba(96,165,250,0.14)] text-[var(--op-accent-300)]"
          : "border-[rgba(238,246,255,0.1)] bg-[rgba(238,246,255,0.05)] text-[var(--op-muted-300)]"
      }`}
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

export function PlayingCard(props: {
  card: TableCardCode | null;
  compact?: boolean;
}) {
  const assetPath = createMemo(() =>
    props.card ? getCardAssetPath(props.card) : CARD_BACK_ASSET_PATH,
  );
  const sizeClass = createMemo(() =>
    props.compact ? "h-10 w-7" : "h-14 w-10 sm:h-16 sm:w-12",
  );

  return (
    <div
      class={`${sizeClass()} shrink-0 overflow-hidden rounded-[0.45rem] border ${
        props.card
          ? "border-[rgba(238,246,255,0.42)] bg-[var(--op-cream-100)]"
          : "border-[rgba(238,246,255,0.12)] bg-[rgba(238,246,255,0.06)] opacity-55"
      }`}
    >
      <Show
        when={assetPath()}
        fallback={
          <div class="grid size-full place-items-center font-data text-[0.6rem] text-[rgba(238,246,255,0.28)]">
            --
          </div>
        }
      >
        {(src) => (
          <img
            class="size-full object-cover"
            src={src()}
            alt={props.card ? `Card ${props.card}` : "Face-down card"}
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
