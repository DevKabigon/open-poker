import type { LobbyRoomView } from "@openpoker/protocol";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
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
  formatHandStatusLabel,
  formatSeatLabel,
  formatTableChipAmount,
} from "./table-utils";

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

export interface TableRoomControllerProps {
  roomId: string;
  room: LobbyRoomView | null;
  onBackToLobby: () => void;
  onTopBarChange?: (view: TableRoomTopBarView | null) => void;
}

export function useTableRoomController(props: TableRoomControllerProps) {
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
  const isRoomStateLoading = createMemo(() => roomState.loading);
  const roomStateErrorMessage = createMemo(() => {
    const error = roomState.error;

    return error
      ? (getErrorMessage(error) ?? "Could not load this room snapshot.")
      : null;
  });
  const isClaimingSeat = createMemo(() => claimingSeatId() !== null);

  const selectSeat = (seatId: number) => {
    setSelectedSeatId(seatId);
    setClaimError(null);
    setSeatActionError(null);
  };

  const cancelSeatClaim = () => {
    setSelectedSeatId(null);
    setClaimError(null);
  };

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

  return {
    buyInDraft,
    cancelSeatClaim,
    claimError,
    claimSeat: handleClaimSeat,
    claimingSeatId,
    displayNameDraft,
    isClaimingSeat,
    isRoomStateLoading,
    leavingSeatId,
    leaveSeat: handleLeaveSeat,
    privateView,
    refetchRoom: () => void refetch(),
    roomStateErrorMessage,
    seatActionError,
    selectSeat,
    selectedSeat,
    selectedSeatId,
    setBuyInDraft,
    setDisplayNameDraft,
    table,
  };
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
