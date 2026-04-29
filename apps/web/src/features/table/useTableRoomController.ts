import type {
  LobbyRoomView,
  PlayerActionRequest,
  RoomSnapshotMessage,
  ServerToClientMessage,
} from "@openpoker/protocol";
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
  createRoomWebSocket,
  dispatchRoomCommand,
  fetchRoomState,
  leaveSeat,
  readStoredRoomSession,
  resetRoom,
  setShowdownRevealPreference,
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
  const [pendingPlayerAction, setPendingPlayerAction] = createSignal<
    PlayerActionRequest["type"] | null
  >(null);
  const [claimError, setClaimError] = createSignal<string | null>(null);
  const [seatActionError, setSeatActionError] = createSignal<string | null>(
    null,
  );
  const [showCardsAtShowdown, setShowCardsAtShowdown] = createSignal(false);
  const [isSettingShowdownReveal, setIsSettingShowdownReveal] =
    createSignal(false);
  const [liveSnapshot, setLiveSnapshot] =
    createSignal<RoomSnapshotMessage | null>(null);
  const [socketStatus, setSocketStatus] =
    createSignal<TableRoomSocketStatus>("idle");
  const [socketErrorMessage, setSocketErrorMessage] = createSignal<
    string | null
  >(null);
  const [roomState, { mutate, refetch }] = createResource(
    () => ({ roomId: props.roomId, sessionToken: sessionToken() }),
    async (source) =>
      await fetchRoomState(source.roomId, source.sessionToken ?? undefined),
  );
  const httpSnapshot = createMemo(
    () => roomState.latest?.snapshot ?? roomState()?.snapshot ?? null,
  );
  const snapshot = createMemo(() =>
    selectLatestSnapshot(liveSnapshot(), httpSnapshot()),
  );
  const table = createMemo(() => snapshot()?.table ?? null);
  const privateView = createMemo(() =>
    getTrustedPrivateView(snapshot()?.privateView ?? null, playerId()),
  );
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
      setLiveSnapshot(response.snapshot);
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
      setLiveSnapshot(response.snapshot);
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
      setLiveSnapshot(response.snapshot);
      setSelectedSeatId(null);
    } catch (error) {
      setSeatActionError(getErrorMessage(error) ?? "Could not reset this room.");
    } finally {
      setIsResettingRoom(false);
    }
  };

  const submitPlayerAction = async (action: PlayerActionRequest) => {
    const viewer = privateView();
    const token = sessionToken();

    if (!viewer || pendingPlayerAction() !== null) {
      return;
    }

    if (!token) {
      setSeatActionError("Seat session is missing. Refresh this table.");
      return;
    }

    if (!viewer.canAct || !viewer.allowedActions.includes(action.type)) {
      setSeatActionError("That action is not available right now.");
      return;
    }

    setPendingPlayerAction(action.type);
    setClaimError(null);
    setSeatActionError(null);

    try {
      const response = await dispatchRoomCommand(props.roomId, {
        sessionToken: token,
        command: {
          type: "act",
          seatId: viewer.seatId,
          action,
          timestamp: new Date().toISOString(),
        },
      });

      mutate(response);
      setLiveSnapshot(response.snapshot);
    } catch (error) {
      setSeatActionError(
        getErrorMessage(error) ?? "Could not submit this action.",
      );
    } finally {
      setPendingPlayerAction(null);
    }
  };

  const refetchRoom = () => {
    setSocketErrorMessage(null);
    void refetch();
  };

  const updateShowCardsAtShowdown = async (value: boolean) => {
    const viewer = privateView();
    const token = sessionToken();

    setShowCardsAtShowdown(value);

    if (!viewer || !token || isSettingShowdownReveal()) {
      return;
    }

    setIsSettingShowdownReveal(true);
    setSeatActionError(null);

    try {
      const response = await setShowdownRevealPreference(
        props.roomId,
        viewer.seatId,
        {
          sessionToken: token,
          showCardsAtShowdown: value,
        },
      );

      mutate(response);
      setLiveSnapshot(response.snapshot);
      setShowCardsAtShowdown(response.showCardsAtShowdown);
    } catch (error) {
      setShowCardsAtShowdown(viewer.showCardsAtShowdown);
      setSeatActionError(
        getErrorMessage(error) ?? "Could not update showdown reveal.",
      );
    } finally {
      setIsSettingShowdownReveal(false);
    }
  };

  createEffect(() => {
    setShowCardsAtShowdown(privateView()?.showCardsAtShowdown ?? false);
  });

  createEffect(() => {
    const roomId = props.roomId;
    const socketSessionToken = sessionToken();

    if (typeof WebSocket === "undefined") {
      setSocketStatus("idle");
      return;
    }

    setLiveSnapshot(null);
    setSocketStatus("connecting");
    setSocketErrorMessage(null);

    let socket: WebSocket;
    let isDisposed = false;

    try {
      socket = createRoomWebSocket(roomId, socketSessionToken ?? undefined);
    } catch (error) {
      setSocketStatus("error");
      setSocketErrorMessage(
        getErrorMessage(error) ?? "Live room connection could not start.",
      );
      return;
    }

    socket.onopen = () => {
      if (!isDisposed) {
        setSocketStatus("open");
      }
    };

    socket.onmessage = (event) => {
      if (
        isDisposed ||
        roomId !== props.roomId ||
        socketSessionToken !== sessionToken() ||
        typeof event.data !== "string"
      ) {
        return;
      }

      const message = parseServerMessage(event.data);

      if (message === null) {
        setSocketErrorMessage("Live room update did not match the protocol.");
        return;
      }

      if (message.type === "room-snapshot") {
        if (message.table.roomId === roomId) {
          setLiveSnapshot(message);
          setSocketErrorMessage(null);
        }
        return;
      }

      if (message.type === "command-rejected") {
        setSocketErrorMessage(message.reason);
      }
    };

    socket.onerror = () => {
      if (!isDisposed) {
        setSocketStatus("error");
        setSocketErrorMessage("Live room connection failed.");
      }
    };

    socket.onclose = (event) => {
      if (!isDisposed) {
        setSocketStatus(event.wasClean ? "closed" : "error");
        if (!event.wasClean) {
          setSocketErrorMessage("Live room connection closed unexpectedly.");
        }
      }
    };

    onCleanup(() => {
      isDisposed = true;
      socket.close(1000, "Table room view changed.");
    });
  });

  createEffect(() => {
    props.onTopBarChange?.({
      buyInLabel: buyInLabel(),
      canLeaveSeat: privateView() !== null && sessionToken() !== null,
      isLeavingSeat: leavingSeatId() !== null,
      isRefreshing: roomState.loading || socketStatus() === "connecting",
      isResettingRoom: isResettingRoom(),
      leaveSeatLabel: leaveSeatLabel(),
      metaLabel: topBarMetaLabel(),
      roomTitle: roomTitle(),
      onBackToLobby: props.onBackToLobby,
      onLeaveSeat: handleLeaveSeat,
      onRefresh: refetchRoom,
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
    isSettingShowdownReveal,
    leavingSeatId,
    leaveSeat: handleLeaveSeat,
    privateView,
    pendingPlayerAction,
    refetchRoom,
    roomStateErrorMessage,
    seatActionError,
    selectSeat,
    selectedSeat,
    selectedSeatId,
    setBuyInDraft,
    setDisplayNameDraft,
    setShowCardsAtShowdown: updateShowCardsAtShowdown,
    showCardsAtShowdown,
    socketErrorMessage,
    socketStatus,
    submitPlayerAction,
    table,
  };
}

type TableRoomSocketStatus = "idle" | "connecting" | "open" | "closed" | "error";

function selectLatestSnapshot(
  liveSnapshot: RoomSnapshotMessage | null,
  httpSnapshot: RoomSnapshotMessage | null,
): RoomSnapshotMessage | null {
  if (!liveSnapshot) {
    return httpSnapshot;
  }

  if (!httpSnapshot) {
    return liveSnapshot;
  }

  if (liveSnapshot.roomVersion > httpSnapshot.roomVersion) {
    return liveSnapshot;
  }

  if (httpSnapshot.roomVersion > liveSnapshot.roomVersion) {
    return httpSnapshot;
  }

  return liveSnapshot;
}

function getTrustedPrivateView(
  privateView: RoomSnapshotMessage["privateView"],
  expectedPlayerId: string,
): RoomSnapshotMessage["privateView"] {
  if (!privateView) {
    return null;
  }

  return privateView.playerId === expectedPlayerId ? privateView : null;
}

function parseServerMessage(payload: string): ServerToClientMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  return isServerToClientMessage(parsed) ? parsed : null;
}

function isServerToClientMessage(value: unknown): value is ServerToClientMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "room-snapshot") {
    return isRoomSnapshotMessage(value);
  }

  if (value.type === "command-ack") {
    return (
      typeof value.commandId === "string" &&
      Number.isInteger(value.roomVersion)
    );
  }

  if (value.type === "command-rejected") {
    return (
      typeof value.commandId === "string" && typeof value.reason === "string"
    );
  }

  return false;
}

function isRoomSnapshotMessage(value: unknown): value is RoomSnapshotMessage {
  return (
    isRecord(value) &&
    value.type === "room-snapshot" &&
    Number.isInteger(value.roomVersion) &&
    isRecord(value.table) &&
    typeof value.table.roomId === "string" &&
    (value.privateView === null || isRecord(value.privateView))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
