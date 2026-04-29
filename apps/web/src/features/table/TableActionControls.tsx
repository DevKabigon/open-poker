import type {
  PlayerActionRequest,
  PrivatePlayerView,
  TableActionType,
} from "@openpoker/protocol";
import { For, Show } from "solid-js";
import type { WagerActionType } from "./table-action-utils";
import {
  formatDollarInputValue,
  formatNullableChipAmount,
} from "./table-action-utils";
import { formatActionLabel } from "./table-utils";

const QUICK_ACTIONS: Array<PlayerActionRequest & { type: TableActionType }> = [
  { type: "fold" },
  { type: "check" },
  { type: "call" },
  { type: "all-in" },
];

export function TableActionControls(props: {
  allowedActions: ReadonlySet<TableActionType>;
  amountDraft: string;
  canSubmitWager: boolean;
  canUseButtons: boolean;
  pendingAction: PlayerActionRequest["type"] | null;
  privateView: PrivatePlayerView | null;
  wagerAction: WagerActionType | null;
  onAmountDraftChange: (value: string) => void;
  onQuickAction: (action: PlayerActionRequest) => void;
  onSubmitWager: () => void;
}) {
  return (
    <div class="mt-2 flex flex-col gap-2 border-t border-[rgba(238,246,255,0.07)] pt-2 lg:flex-row lg:items-center lg:justify-between">
      <p class="font-data text-[0.58rem] uppercase tracking-[0.16em] text-[var(--op-muted-500)]">
        Action
      </p>

      <div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
        <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <For each={QUICK_ACTIONS}>
            {(action) => (
              <button
                class={`op-button min-h-9 px-3 py-2 text-[0.66rem] disabled:opacity-40 ${
                  action.type === "fold"
                    ? "op-button-danger"
                    : action.type === "all-in"
                      ? "op-button-primary"
                      : "op-button-secondary"
                }`}
                type="button"
                disabled={
                  !props.canUseButtons ||
                  !props.allowedActions.has(action.type)
                }
                onClick={() => props.onQuickAction(action)}
              >
                {props.pendingAction === action.type
                  ? "..."
                  : formatActionLabel(action.type, props.privateView)}
              </button>
            )}
          </For>
        </div>

        <Show when={props.privateView && props.wagerAction}>
          {(action) => (
            <div class="grid grid-cols-[minmax(5.75rem,1fr)_auto] gap-2 sm:flex sm:items-center">
              <label class="min-w-0">
                <span class="sr-only">
                  {action() === "raise" ? "Raise to" : "Bet"}
                </span>
                <input
                  class="h-9 w-full rounded-full border border-[rgba(238,246,255,0.12)] bg-[rgba(238,246,255,0.055)] px-3 font-data text-xs font-semibold text-[var(--op-cream-100)] outline-none transition focus:border-[rgba(96,165,250,0.52)] sm:w-28"
                  type="number"
                  aria-label={action() === "raise" ? "Raise to" : "Bet"}
                  min={formatDollarInputValue(
                    props.privateView?.minBetOrRaiseTo ?? 0,
                  )}
                  max={formatDollarInputValue(
                    props.privateView?.maxBetOrRaiseTo ?? 0,
                  )}
                  step="1"
                  value={props.amountDraft}
                  disabled={!props.canUseButtons}
                  onInput={(event) =>
                    props.onAmountDraftChange(event.currentTarget.value)
                  }
                />
              </label>

              <button
                class="op-button op-button-primary min-h-9 px-4 py-2 text-[0.66rem] disabled:opacity-40"
                type="button"
                disabled={!props.canSubmitWager}
                title={`Minimum ${formatNullableChipAmount(
                  props.privateView?.minBetOrRaiseTo ?? null,
                )}`}
                onClick={props.onSubmitWager}
              >
                {props.pendingAction === action()
                  ? "..."
                  : formatActionLabel(action(), props.privateView)}
              </button>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}
