import type { PrivatePlayerView } from "@openpoker/protocol";
import type { TableActionStatus } from "./table-action-utils";

export function TableActionHeader(props: {
  privateView: PrivatePlayerView | null;
  isShowHandControlDisabled: boolean;
  showCardsAtShowdown: boolean;
  status: TableActionStatus;
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

      <label class="flex shrink-0 items-center gap-2 rounded-full border border-[rgba(238,246,255,0.1)] bg-[rgba(238,246,255,0.045)] px-3 py-1.5 font-data text-[0.6rem] font-bold uppercase tracking-[0.06em] text-[var(--op-muted-300)]">
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
    </div>
  );
}
