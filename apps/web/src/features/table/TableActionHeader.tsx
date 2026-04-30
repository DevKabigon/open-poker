import type { PrivatePlayerView, PublicSeatView } from "@openpoker/protocol";
import { Show } from "solid-js";
import type { TableActionStatus } from "./table-action-utils";

export function TableActionHeader(props: {
  privateView: PrivatePlayerView | null;
  privateSeat: PublicSeatView | null;
  isShowHandControlDisabled: boolean;
  isSeatLifecyclePending: boolean;
  isSitOutNextHandDisabled: boolean;
  showCardsAtShowdown: boolean;
  status: TableActionStatus;
  onSitInSeat: () => void;
  onSitOutNextHandChange: (value: boolean) => void;
  onShowCardsAtShowdownChange: (value: boolean) => void;
}) {
  return (
    <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div class="min-w-0">
        <p class="font-data text-[0.58rem] uppercase tracking-[0.16em] text-[var(--op-muted-500)]">
          {props.status.eyebrow}
        </p>
        <div class="mt-1 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <h2 class="truncate font-display text-sm font-semibold tracking-[-0.02em] text-[var(--op-cream-100)]">
            {props.status.title}
          </h2>
          <p class="font-data text-[0.66rem] text-[var(--op-muted-300)]">
            {props.status.detail}
          </p>
        </div>
      </div>

      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <label class="flex items-center gap-2 rounded-full border border-[rgba(238,246,255,0.1)] bg-[rgba(238,246,255,0.045)] px-3 py-1.5 font-data text-[0.6rem] font-bold uppercase tracking-[0.06em] text-[var(--op-muted-300)]">
          <input
            class="size-4 accent-[var(--op-accent-400)]"
            type="checkbox"
            checked={props.showCardsAtShowdown}
            disabled={!props.privateView || props.isShowHandControlDisabled}
            onChange={(event) =>
              props.onShowCardsAtShowdownChange(event.currentTarget.checked)
            }
          />
          Show my hand
        </label>

        <Show when={props.privateSeat && !props.privateSeat.isSittingOut}>
          <label
            class="flex items-center gap-2 rounded-full border border-[rgba(238,246,255,0.1)] bg-[rgba(238,246,255,0.045)] px-3 py-1.5 font-data text-[0.6rem] font-bold uppercase tracking-[0.06em] text-[var(--op-muted-300)]"
            title={
              props.isSitOutNextHandDisabled
                ? "Queued hand needs this seat"
                : undefined
            }
          >
            <input
              class="size-4 accent-[var(--op-accent-400)]"
              type="checkbox"
              checked={props.privateSeat?.isSittingOutNextHand ?? false}
              disabled={
                props.isSeatLifecyclePending || props.isSitOutNextHandDisabled
              }
              onChange={(event) =>
                props.onSitOutNextHandChange(event.currentTarget.checked)
              }
            />
            Sit out next hand
          </label>
        </Show>

        <Show when={props.privateSeat?.isSittingOut}>
          <button
            class="op-button op-button-primary min-h-8 px-3 text-[0.6rem]"
            type="button"
            disabled={props.isSeatLifecyclePending}
            onClick={props.onSitInSeat}
          >
            {props.isSeatLifecyclePending ? "Sitting in" : "Sit in"}
          </button>
        </Show>
      </div>
    </div>
  );
}
