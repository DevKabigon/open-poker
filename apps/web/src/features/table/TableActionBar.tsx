import type {
  PlayerActionRequest,
  PrivatePlayerView,
  PublicTableView,
  TableActionType,
} from "@openpoker/protocol";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import {
  formatActionLabel,
  formatHandStatusLabel,
  formatSeatLabel,
  formatStreetLabel,
  formatTableChipAmount,
} from "./table-utils";

type WagerActionType = Extract<TableActionType, "bet" | "raise">;

const NEXT_HAND_DELAY_MS = 3_000;
const QUICK_ACTIONS: Array<PlayerActionRequest & { type: TableActionType }> = [
  { type: "fold" },
  { type: "check" },
  { type: "call" },
  { type: "all-in" },
];

export function TableActionBar(props: {
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
  isSettingShowdownReveal: boolean;
  pendingAction: PlayerActionRequest["type"] | null;
  showCardsAtShowdown: boolean;
  onAction: (action: PlayerActionRequest) => void;
  onShowCardsAtShowdownChange: (value: boolean) => void;
}) {
  const now = createNowTicker();
  const [amountDraft, setAmountDraft] = createSignal("");
  const status = createMemo(() =>
    getTableStatus(props.table, props.privateView, now()),
  );
  const allowedActions = createMemo(
    () => new Set<TableActionType>(props.privateView?.allowedActions ?? []),
  );
  const actionTimer = createMemo(() =>
    props.privateView?.canAct
      ? getDeadlineProgress(
          props.privateView.actionDeadlineAt,
          props.table.actionTimeoutMs,
          now(),
        )
      : null,
  );
  const nextHandTimer = createMemo(() =>
    getDeadlineProgress(props.table.nextHandStartAt, NEXT_HAND_DELAY_MS, now()),
  );
  const visibleTimer = createMemo(() => actionTimer() ?? nextHandTimer());
  const timerLabel = createMemo(() =>
    actionTimer() ? "Action timer" : nextHandTimer() ? "Next hand" : "Timer",
  );
  const timerTone = createMemo<"action" | "next">(() =>
    actionTimer() ? "action" : "next",
  );
  const timeoutActionLabel = createMemo(() => {
    if (!props.privateView?.canAct) {
      return null;
    }

    return allowedActions().has("check") ? "Timeout: Check" : "Timeout: Fold";
  });
  const wagerAction = createMemo<WagerActionType | null>(() => {
    if (allowedActions().has("raise")) {
      return "raise";
    }

    return allowedActions().has("bet") ? "bet" : null;
  });
  const isActionPending = createMemo(() => props.pendingAction !== null);
  const canUseButtons = createMemo(
    () => props.privateView?.canAct === true && !isActionPending(),
  );
  const wagerAmount = createMemo(() => parseDollarInputAsCents(amountDraft()));
  const canSubmitWager = createMemo(() => {
    const viewer = props.privateView;
    const action = wagerAction();
    const amount = wagerAmount();

    return (
      viewer?.canAct === true &&
      action !== null &&
      amount !== null &&
      viewer.minBetOrRaiseTo !== null &&
      viewer.maxBetOrRaiseTo !== null &&
      amount >= viewer.minBetOrRaiseTo &&
      amount <= viewer.maxBetOrRaiseTo &&
      !isActionPending()
    );
  });

  createEffect(() => {
    const nextAmount = props.privateView?.minBetOrRaiseTo;

    setAmountDraft(nextAmount === undefined || nextAmount === null
      ? ""
      : formatDollarInputValue(nextAmount));
  });

  const submitQuickAction = (action: PlayerActionRequest) => {
    if (canUseButtons() && allowedActions().has(action.type)) {
      props.onAction(action);
    }
  };

  const submitWager = () => {
    const action = wagerAction();
    const amount = wagerAmount();

    if (action === null || amount === null || !canSubmitWager()) {
      return;
    }

    props.onAction({ type: action, amount });
  };

  return (
    <section class="rounded-[0.85rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(4,9,21,0.48)] p-2.5 sm:p-3">
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div class="min-w-0">
          <p class="font-data text-[0.58rem] uppercase tracking-[0.16em] text-[var(--op-muted-500)]">
            {status().eyebrow}
          </p>
          <div class="mt-1 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
            <h2 class="truncate font-display text-sm font-semibold tracking-[-0.02em] text-[var(--op-cream-100)]">
              {status().title}
            </h2>
            <p class="font-data text-[0.66rem] text-[var(--op-muted-300)]">
              {status().detail}
            </p>
          </div>
        </div>

        <label class="flex shrink-0 items-center gap-2 rounded-full border border-[rgba(238,246,255,0.1)] bg-[rgba(238,246,255,0.045)] px-3 py-1.5 font-data text-[0.6rem] font-bold uppercase tracking-[0.06em] text-[var(--op-muted-300)]">
          <input
            class="size-4 accent-[var(--op-accent-400)]"
            type="checkbox"
            checked={props.showCardsAtShowdown}
            disabled={!props.privateView || props.isSettingShowdownReveal}
            onChange={(event) =>
              props.onShowCardsAtShowdownChange(event.currentTarget.checked)
            }
          />
          Reveal my hand
        </label>
      </div>

      <TimerProgress
        label={timerLabel()}
        remainingLabel={
          visibleTimer()
            ? formatRemainingSeconds(visibleTimer()!.remainingMs)
            : "-"
        }
        percent={visibleTimer()?.percent ?? 0}
        remainingMs={visibleTimer()?.remainingMs ?? 0}
        timeoutLabel={timeoutActionLabel()}
        tone={timerTone()}
        isActive={visibleTimer() !== null}
      />

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
                    !canUseButtons() || !allowedActions().has(action.type)
                  }
                  onClick={() => submitQuickAction(action)}
                >
                  {props.pendingAction === action.type
                    ? "..."
                    : formatActionLabel(action.type, props.privateView)}
                </button>
              )}
            </For>
          </div>

          <Show when={props.privateView && wagerAction()}>
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
                    value={amountDraft()}
                    disabled={!canUseButtons()}
                    onInput={(event) =>
                      setAmountDraft(event.currentTarget.value)
                    }
                  />
                </label>

                <button
                  class="op-button op-button-primary min-h-9 px-4 py-2 text-[0.66rem] disabled:opacity-40"
                  type="button"
                  disabled={!canSubmitWager()}
                  title={`Minimum ${formatNullableChipAmount(
                    props.privateView?.minBetOrRaiseTo ?? null,
                  )}`}
                  onClick={submitWager}
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
    </section>
  );
}

function TimerProgress(props: {
  label: string;
  remainingLabel: string;
  percent: number;
  remainingMs: number;
  timeoutLabel: string | null;
  tone: "action" | "next";
  isActive: boolean;
}) {
  return (
    <div class="mt-2">
      <div
        class={`flex items-center justify-between gap-3 font-data text-[0.62rem] uppercase tracking-[0.12em] text-[var(--op-muted-500)] ${
          props.isActive ? "" : "opacity-35"
        }`}
      >
        <span>{props.label}</span>
        <span class="flex items-center gap-2">
          <Show when={props.timeoutLabel}>
            {(timeoutLabel) => (
              <span class="text-[var(--op-muted-300)]">
                {timeoutLabel()}
              </span>
            )}
          </Show>
          <span>{props.remainingLabel}</span>
        </span>
      </div>
      <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[rgba(238,246,255,0.08)]">
        <div
          class={`op-timer-fill h-full origin-left rounded-full ${
            props.isActive ? "" : "opacity-0"
          }`}
          style={`${getTimerColorStyle(props.remainingMs, props.tone)} transform: scaleX(${props.percent / 100})`}
        />
      </div>
    </div>
  );
}

function getTimerColorStyle(
  remainingMs: number,
  tone: "action" | "next",
): string {
  if (tone === "next") {
    return [
      "--op-timer-start: var(--op-blue-500);",
      "--op-timer-end: var(--op-accent-300);",
      "--op-timer-glow: rgba(96, 165, 250, 0.34);",
      "--op-timer-glow-warm: rgba(56, 189, 248, 0.16);",
    ].join(" ");
  }

  const seconds = Math.max(0, Math.min(30, remainingMs / 1000));
  const hue =
    seconds <= 10
      ? interpolate(2, 30, seconds / 10)
      : seconds <= 20
        ? interpolate(30, 42, (seconds - 10) / 10)
        : interpolate(42, 145, (seconds - 20) / 10);
  const endHue = Math.min(hue + 12, 155);
  const glow = `hsla(${hue}, 92%, 62%, 0.38)`;
  const warmGlow = `hsla(${endHue}, 92%, 58%, 0.18)`;

  return [
    `--op-timer-start: hsl(${hue}, 88%, 58%);`,
    `--op-timer-end: hsl(${endHue}, 92%, 66%);`,
    `--op-timer-glow: ${glow};`,
    `--op-timer-glow-warm: ${warmGlow};`,
  ].join(" ");
}

function interpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * Math.max(0, Math.min(1, progress));
}

function createNowTicker() {
  const [now, setNow] = createSignal(Date.now());

  if (typeof window === "undefined") {
    return now;
  }

  let frameId = 0;
  const tick = () => {
    setNow(Date.now());
    frameId = window.requestAnimationFrame(tick);
  };

  frameId = window.requestAnimationFrame(tick);

  onCleanup(() => window.cancelAnimationFrame(frameId));

  return now;
}

function getDeadlineProgress(
  deadlineAt: string | null,
  totalMs: number,
  now: number,
): { percent: number; remainingMs: number } | null {
  if (!deadlineAt) {
    return null;
  }

  const deadline = Date.parse(deadlineAt);

  if (Number.isNaN(deadline) || totalMs <= 0) {
    return null;
  }

  const remainingMs = Math.max(deadline - now, 0);
  const percent = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));

  return { percent, remainingMs };
}

function formatRemainingSeconds(remainingMs: number): string {
  return `${Math.ceil(remainingMs / 1000)}s`;
}

function getTableStatus(
  table: PublicTableView,
  privateView: PrivatePlayerView | null,
  now: number,
): { eyebrow: string; title: string; detail: string } {
  if (privateView?.canAct) {
    return {
      eyebrow: "Your turn",
      title: "Choose an action",
      detail: "Act before the timer reaches zero.",
    };
  }

  if (table.handStatus === "showdown") {
    return {
      eyebrow: "Showdown",
      title: "Cards are revealed",
      detail: "Eligible live hands can be shown until the pot is settled.",
    };
  }

  if (table.handStatus === "settled") {
    return {
      eyebrow: "Hand settled",
      title: "Next hand is queued",
      detail: table.nextHandStartAt
        ? `Starts in ${formatRemainingSeconds(Math.max(Date.parse(table.nextHandStartAt) - now, 0))}`
        : "Waiting for the next hand.",
    };
  }

  if (table.actingSeat !== null) {
    return {
      eyebrow: "Waiting",
      title: `Waiting for ${formatSeatLabel(table.actingSeat)}`,
      detail: "The table will update when the action resolves.",
    };
  }

  if (table.handStatus === "waiting") {
    return {
      eyebrow: "Waiting",
      title: "Waiting for players",
      detail: "A hand starts automatically when enough seats are ready.",
    };
  }

  return {
    eyebrow: formatStreetLabel(table.street),
    title: formatHandStatusLabel(table.handStatus),
    detail: "Table state is syncing live.",
  };
}

function parseDollarInputAsCents(value: string): number | null {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100);
}

function formatDollarInputValue(amountCents: number): string {
  const amount = amountCents / 100;

  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function formatNullableChipAmount(amount: number | null): string {
  return amount === null ? "-" : formatTableChipAmount(amount);
}
