import type { LobbyRoomView, PublicSeatView } from "@openpoker/protocol";
import { Show } from "solid-js";
import { SectionTitle } from "./table-primitives";
import { formatSeatLabel, formatTableChipAmount } from "./table-utils";

export function ClaimSeatDialog(props: {
  buyInDraft: string;
  claimError: string | null;
  displayNameDraft: string;
  isClaiming: boolean;
  room: LobbyRoomView | null;
  seat: PublicSeatView;
  onBuyInInput: (value: string) => void;
  onCancel: () => void;
  onClaim: () => void;
  onDisplayNameInput: (value: string) => void;
}) {
  return (
    <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(4,9,21,0.72)] px-3 pb-6 pt-[calc(env(safe-area-inset-top)+4.5rem)] backdrop-blur-sm sm:items-center sm:px-6 sm:py-8">
      <section
        aria-labelledby="claim-seat-title"
        aria-modal="true"
        class="w-full max-w-[34rem] rounded-[1rem] border border-[rgba(96,165,250,0.22)] bg-[rgba(13,30,51,0.96)] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.42)] sm:p-4"
        role="dialog"
      >
        <form
          class="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            props.onClaim();
          }}
        >
          <div class="flex items-start justify-between gap-3">
            <div id="claim-seat-title" class="min-w-0">
              <SectionTitle
                label={`Sit at ${formatSeatLabel(props.seat.seatId)}`}
              />
              <Show when={props.room}>
                {(room) => (
                  <p class="mt-2 font-data text-[0.68rem] text-[var(--op-muted-500)]">
                    Range {formatTableChipAmount(room().minBuyIn)} -{" "}
                    {formatTableChipAmount(room().maxBuyIn)}
                  </p>
                )}
              </Show>
            </div>

            <button
              class="op-button op-button-secondary min-h-9 px-3 text-[0.6rem]"
              type="button"
              disabled={props.isClaiming}
              onClick={props.onCancel}
            >
              Cancel
            </button>
          </div>

          <label class="grid gap-1">
            <span class="font-data text-[0.55rem] uppercase tracking-[0.12em] text-[var(--op-muted-500)]">
              Name
            </span>
            <input
              class="min-h-11 rounded-[0.75rem] border border-[rgba(238,246,255,0.1)] bg-[rgba(4,9,21,0.5)] px-3 font-data text-sm text-[var(--op-cream-100)] outline-none focus:border-[rgba(96,165,250,0.45)]"
              value={props.displayNameDraft}
              disabled={props.isClaiming}
              onInput={(event) =>
                props.onDisplayNameInput(event.currentTarget.value)
              }
            />
          </label>

          <label class="grid gap-1">
            <span class="font-data text-[0.55rem] uppercase tracking-[0.12em] text-[var(--op-muted-500)]">
              Buy-in $
            </span>
            <input
              class="min-h-11 rounded-[0.75rem] border border-[rgba(238,246,255,0.1)] bg-[rgba(4,9,21,0.5)] px-3 font-data text-sm text-[var(--op-cream-100)] outline-none focus:border-[rgba(96,165,250,0.45)]"
              type="number"
              inputmode="decimal"
              min={props.room ? props.room.minBuyIn / 100 : undefined}
              max={props.room ? props.room.maxBuyIn / 100 : undefined}
              step="1"
              value={props.buyInDraft}
              disabled={props.isClaiming}
              onInput={(event) => props.onBuyInInput(event.currentTarget.value)}
            />
          </label>

          <Show when={props.claimError}>
            {(error) => (
              <p class="font-data text-xs text-[var(--op-red-500)]">
                {error()}
              </p>
            )}
          </Show>

          <button
            class="op-button op-button-primary min-h-11 w-full px-3"
            type="submit"
            disabled={props.isClaiming || !props.room}
          >
            {props.isClaiming ? "Buying in" : "Buy In"}
          </button>
        </form>
      </section>
    </div>
  );
}
