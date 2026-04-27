import type { LobbyRoomView } from "@openpoker/protocol";
import {
  Match,
  Show,
  Switch,
  createMemo,
  createEffect,
  onCleanup,
  createResource,
  createSignal,
} from "solid-js";
import {
  claimSeat,
  clearStoredRoomSession,
  fetchRoomState,
  leaveSeat,
  readStoredRoomSession,
  resetRoom,
  writeStoredRoomSession,
} from "../../lib";
import { formatBlindLabel, formatBuyInRange } from "../lobby/lobby-utils";
import {
  BoardInfo,
  BetInfo,
  TableStatePanel,
} from "./TableRoomPanels";
import { ClaimSeatDialog, SeatGrid } from "./TableSeats";
import {
  formatHandStatusLabel,
  formatSeatLabel,
  formatTableChipAmount,
} from "./table-utils";

export interface TableRoomPageProps {
  roomId: string;
  room: LobbyRoomView | null;
  onBackToLobby: () => void;
  onTopBarChange?: (view: TableRoomTopBarView | null) => void;
}

export interface TableRoomTopBarView {
  buyInLabel: string;
  canLeaveSeat: boolean;
  isLeavingSeat: boolean;
  isRefreshing: boolean;
  isResettingRoom: boolean;
  leaveSeatLabel: string;
  metaLabel: string;
  roomTitle: string;
  onBackToLobby: () => void;
  onLeaveSeat: () => void;
  onRefresh: () => void;
  onResetRoom: () => void;
}

export function TableRoomPage(props: TableRoomPageProps) {
  const storedSession = readStoredRoomSession();
  const initialRoomSession =
    storedSession?.roomId === props.roomId ? storedSession : null;
  const [sessionToken, setSessionToken] = createSignal(
    initialRoomSession?.sessionToken ?? null,
  );
  const [playerId, setPlayerId] = createSignal(
    initialRoomSession?.playerId ?? createLocalPlayerId(),
  );
  const [selectedSeatId, setSelectedSeatId] = createSignal<number | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = createSignal("Player");
  const [buyInDraft, setBuyInDraft] = createSignal(
    props.room ? formatDollarInputValue(props.room.minBuyIn) : "100",
  );
  const [claimingSeatId, setClaimingSeatId] = createSignal<number | null>(null);
  const [leavingSeatId, setLeavingSeatId] = createSignal<number | null>(null);
  const [isResettingRoom, setIsResettingRoom] = createSignal(false);
  const [claimError, setClaimError] = createSignal<string | null>(null);
  const [seatActionError, setSeatActionError] = createSignal<string | null>(
    null,
  );
  const [roomState, { mutate, refetch }] = createResource(
    () => ({ roomId: props.roomId, sessionToken: sessionToken() }),
    async (source) =>
      await fetchRoomState(source.roomId, source.sessionToken ?? undefined),
  );
  const snapshot = createMemo(
    () => roomState.latest?.snapshot ?? roomState()?.snapshot ?? null,
  );
  const table = createMemo(() => snapshot()?.table ?? null);
  const privateView = createMemo(() => snapshot()?.privateView ?? null);
  const roomTitle = createMemo(() => props.room?.displayName ?? props.roomId);
  const blindLabel = createMemo(() =>
    props.room
      ? formatBlindLabel(props.room.smallBlind, props.room.bigBlind)
      : "NLH",
  );
  const buyInLabel = createMemo(() =>
    props.room ? formatBuyInRange(props.room) : "Buy-in pending",
  );
  const leaveSeatLabel = createMemo(() => {
    const viewer = privateView();

    return viewer ? `Leave ${formatSeatLabel(viewer.seatId)}` : "Leave seat";
  });
  const topBarMetaLabel = createMemo(() => {
    const currentTable = table();

    if (!currentTable) {
      return `${blindLabel()} · Loading`;
    }

    return `${blindLabel()} · ${formatHandStatusLabel(currentTable.handStatus)} · Sync v${currentTable.roomVersion}`;
  });
  const selectedSeat = createMemo(() => {
    const seatId = selectedSeatId();

    return seatId === null
      ? null
      : (table()?.seats.find((seat) => seat.seatId === seatId) ?? null);
  });

  const handleClaimSeat = async () => {
    const seatId = selectedSeatId();
    const room = props.room;
    const viewer = privateView();

    if (seatId === null || !room || claimingSeatId() !== null) {
      return;
    }

    if (viewer) {
      setClaimError(`Already seated at ${formatSeatLabel(viewer.seatId)}.`);
      setSelectedSeatId(null);
      return;
    }

    const buyIn = parseDollarInputAsCents(buyInDraft());

    if (buyIn === null || buyIn < room.minBuyIn || buyIn > room.maxBuyIn) {
      setClaimError(
        `Buy-in must be between ${formatTableChipAmount(room.minBuyIn)} and ${formatTableChipAmount(room.maxBuyIn)}.`,
      );
      return;
    }

    setClaimingSeatId(seatId);
    setClaimError(null);
    setSeatActionError(null);

    try {
      const response = await claimSeat(props.roomId, seatId, {
        playerId: playerId(),
        displayName: normalizeOptionalDisplayName(displayNameDraft()),
        buyIn,
      });

      writeStoredRoomSession({
        roomId: response.roomId,
        playerId: response.playerId,
        sessionToken: response.sessionToken,
      });
      setPlayerId(response.playerId);
      setSessionToken(response.sessionToken);
      mutate(response);
      setSelectedSeatId(null);
    } catch (error) {
      setClaimError(getErrorMessage(error) ?? "Could not claim this seat.");
    } finally {
      setClaimingSeatId(null);
    }
  };

  const handleLeaveSeat = async () => {
    const viewer = privateView();
    const token = sessionToken();

    if (!viewer || !token || leavingSeatId() !== null) {
      return;
    }

    setLeavingSeatId(viewer.seatId);
    setClaimError(null);
    setSeatActionError(null);

    try {
      const response = await leaveSeat(props.roomId, viewer.seatId, {
        sessionToken: token,
      });

      clearStoredRoomSession();
      setSessionToken(null);
      setPlayerId(createLocalPlayerId());
      mutate(response);
      setSelectedSeatId(null);
    } catch (error) {
      setSeatActionError(getErrorMessage(error) ?? "Could not leave this seat.");
    } finally {
      setLeavingSeatId(null);
    }
  };

  const handleResetRoom = async () => {
    if (isResettingRoom()) {
      return;
    }

    setIsResettingRoom(true);
    setClaimError(null);
    setSeatActionError(null);

    try {
      const response = await resetRoom(props.roomId);

      clearStoredRoomSession();
      setSessionToken(null);
      setPlayerId(createLocalPlayerId());
      mutate(response);
      setSelectedSeatId(null);
    } catch (error) {
      setSeatActionError(getErrorMessage(error) ?? "Could not reset this room.");
    } finally {
      setIsResettingRoom(false);
    }
  };

  createEffect(() => {
    props.onTopBarChange?.({
      buyInLabel: buyInLabel(),
      canLeaveSeat: privateView() !== null && sessionToken() !== null,
      isLeavingSeat: leavingSeatId() !== null,
      isRefreshing: roomState.loading,
      isResettingRoom: isResettingRoom(),
      leaveSeatLabel: leaveSeatLabel(),
      metaLabel: topBarMetaLabel(),
      roomTitle: roomTitle(),
      onBackToLobby: props.onBackToLobby,
      onLeaveSeat: handleLeaveSeat,
      onRefresh: () => void refetch(),
      onResetRoom: handleResetRoom,
    });
  });

  onCleanup(() => props.onTopBarChange?.(null));

  return (
    <main class="relative z-10 mx-auto flex w-full max-w-[1320px] flex-col gap-3 px-3 pb-5 pt-3 sm:px-6 lg:px-8">
      <Switch>
        <Match when={table()}>
          {(currentTable) => (
            <>
              <BoardInfo table={currentTable()} privateView={privateView()} />
              <BetInfo table={currentTable()} privateView={privateView()} />
              <SeatGrid
                table={currentTable()}
                privateView={privateView()}
                claimingSeatId={claimingSeatId()}
                leavingSeatId={leavingSeatId()}
                selectedSeatId={selectedSeatId()}
                onLeaveSeat={handleLeaveSeat}
                onSelectSeat={(seatId) => {
                  setSelectedSeatId(seatId);
                  setClaimError(null);
                  setSeatActionError(null);
                }}
              />
              <Show when={seatActionError()}>
                {(error) => (
                  <section class="rounded-[1rem] border border-[rgba(239,68,68,0.22)] bg-[rgba(127,29,29,0.16)] p-3 font-data text-xs text-[var(--op-red-500)]">
                    {error()}
                  </section>
                )}
              </Show>
              <Show when={!privateView() && selectedSeat()}>
                {(seat) => (
                  <ClaimSeatDialog
                    buyInDraft={buyInDraft()}
                    claimError={claimError()}
                    displayNameDraft={displayNameDraft()}
                    isClaiming={claimingSeatId() !== null}
                    room={props.room}
                    seat={seat()}
                    onBuyInInput={setBuyInDraft}
                    onCancel={() => {
                      setSelectedSeatId(null);
                      setClaimError(null);
                    }}
                    onClaim={handleClaimSeat}
                    onDisplayNameInput={setDisplayNameDraft}
                  />
                )}
              </Show>
            </>
          )}
        </Match>

        <Match when={roomState.error}>
          <TableStatePanel
            eyebrow="Room snapshot failed"
            title="Could not load this table."
            detail={getErrorMessage(roomState.error)}
            actionLabel="Try again"
            onAction={() => void refetch()}
            onBackToLobby={props.onBackToLobby}
          />
        </Match>

        <Match when={roomState.loading}>
          <TableStatePanel
            eyebrow="Loading table"
            title="Fetching the latest room snapshot."
            detail={props.roomId}
            onBackToLobby={props.onBackToLobby}
          />
        </Match>
      </Switch>
    </main>
  );
}

function formatDollarInputValue(amountCents: number): string {
  const amount = amountCents / 100;

  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function parseDollarInputAsCents(value: string): number | null {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100);
}

function normalizeOptionalDisplayName(value: string): string | null {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function createLocalPlayerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `web-${crypto.randomUUID()}`;
  }

  return `web-${Date.now()}`;
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  return null;
}
