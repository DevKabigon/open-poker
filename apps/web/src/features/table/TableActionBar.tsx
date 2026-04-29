import type {
  PlayerActionRequest,
  PrivatePlayerView,
  PublicTableView,
  TableActionType,
} from "@openpoker/protocol";
import { createEffect, createMemo, createSignal } from "solid-js";
import { TableActionControls } from "./TableActionControls";
import { TableActionHeader } from "./TableActionHeader";
import { TableActionTimer } from "./TableActionTimer";
import {
  NEXT_HAND_DELAY_MS,
  createNowTicker,
  formatDollarInputValue,
  formatRemainingSeconds,
  getDeadlineProgress,
  getTableStatus,
  parseDollarInputAsCents,
  type WagerActionType,
} from "./table-action-utils";
import { isSeatForcedShowdownReveal } from "./table-utils";

export function TableActionBar(props: {
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
  canStartNextHand: boolean;
  isSettingShowdownReveal: boolean;
  isStartingNextHand: boolean;
  pendingAction: PlayerActionRequest["type"] | null;
  showCardsAtShowdown: boolean;
  onAction: (action: PlayerActionRequest) => void;
  onStartNextHand: () => void;
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
  const privateSeat = createMemo(() => {
    const seatId = props.privateView?.seatId;

    return seatId === undefined
      ? null
      : (props.table.seats.find((seat) => seat.seatId === seatId) ?? null);
  });
  const isPrivateHandForcedShown = createMemo(() => {
    const seat = privateSeat();

    return seat ? isSeatForcedShowdownReveal(props.table, seat) : false;
  });
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

    setAmountDraft(
      nextAmount === undefined || nextAmount === null
        ? ""
        : formatDollarInputValue(nextAmount),
    );
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
      <TableActionHeader
        privateView={props.privateView}
        isShowHandControlDisabled={
          props.isSettingShowdownReveal || isPrivateHandForcedShown()
        }
        showCardsAtShowdown={
          props.showCardsAtShowdown || isPrivateHandForcedShown()
        }
        status={status()}
        onShowCardsAtShowdownChange={props.onShowCardsAtShowdownChange}
      />
      <TableActionTimer
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
      <TableActionControls
        allowedActions={allowedActions()}
        amountDraft={amountDraft()}
        canStartNextHand={props.canStartNextHand}
        canSubmitWager={canSubmitWager()}
        canUseButtons={canUseButtons()}
        isStartingNextHand={props.isStartingNextHand}
        pendingAction={props.pendingAction}
        privateView={props.privateView}
        wagerAmount={wagerAmount()}
        wagerAction={wagerAction()}
        onAmountDraftChange={setAmountDraft}
        onQuickAction={submitQuickAction}
        onStartNextHand={props.onStartNextHand}
        onSubmitWager={submitWager}
      />
    </section>
  );
}
