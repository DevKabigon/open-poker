import type { LobbyRoomView } from "@openpoker/protocol";
import { Match, Show, Switch } from "solid-js";
import { TableChipDisplayScope } from "../settings/display-settings";
import { ClaimSeatDialog } from "./ClaimSeatDialog";
import { TableActionBar } from "./TableActionBar";
import { BoardInfo } from "./TableBoardInfo";
import { SeatGrid } from "./TableSeats";
import { TableShowdownOverlay } from "./TableShowdownOverlay";
import { TableStatePanel } from "./TableStatePanel";
import {
  useTableRoomController,
  type TableRoomTopBarView,
} from "./useTableRoomController";

export type { TableRoomTopBarView } from "./useTableRoomController";

export interface TableRoomPageProps {
  authenticatedDisplayName?: string | null;
  isAuthenticated: boolean;
  isAuthConfigured: boolean;
  isSigningIn: boolean;
  roomId: string;
  room: LobbyRoomView | null;
  onBackToLobby: () => void;
  onSignInWithGoogle: () => void;
  onTopBarChange?: (view: TableRoomTopBarView | null) => void;
}

export function TableRoomPage(props: TableRoomPageProps) {
  const tableRoom = useTableRoomController(props);

  return (
    <TableChipDisplayScope bigBlindCents={props.room?.bigBlind ?? null}>
      <main class="relative z-10 mx-auto flex w-full max-w-[1320px] flex-col gap-2.5 px-3 pb-4 pt-2.5 sm:px-6 lg:px-8 xl:gap-2 xl:pb-3 xl:pt-2">
        <Switch>
          <Match when={tableRoom.table()}>
            {(currentTable) => (
              <>
                <TableShowdownOverlay table={currentTable()} />
                <BoardInfo
                  table={currentTable()}
                  privateView={tableRoom.privateView()}
                />
                <SeatGrid
                  table={currentTable()}
                  privateView={tableRoom.privateView()}
                  claimingSeatId={tableRoom.claimingSeatId()}
                  leavingSeatId={tableRoom.leavingSeatId()}
                  seatLifecyclePendingSeatId={tableRoom.seatLifecyclePendingSeatId()}
                  selectedSeatId={tableRoom.selectedSeatId()}
                  onLeaveSeat={tableRoom.leaveSeat}
                  onSelectSeat={tableRoom.selectSeat}
                />
                <Show when={tableRoom.socketErrorMessage()}>
                  {(error) => (
                    <section class="rounded-[1rem] border border-[rgba(250,204,21,0.22)] bg-[rgba(113,63,18,0.18)] p-3 font-data text-xs text-[var(--op-warning-500)]">
                      {error()}
                    </section>
                  )}
                </Show>
                <Show when={tableRoom.seatActionError()}>
                  {(error) => (
                    <section class="rounded-[1rem] border border-[rgba(239,68,68,0.22)] bg-[rgba(127,29,29,0.16)] p-3 font-data text-xs text-[var(--op-red-500)]">
                      {error()}
                    </section>
                  )}
                </Show>
                <Show when={!tableRoom.privateView() && tableRoom.selectedSeat()}>
                  {(seat) => (
                    <ClaimSeatDialog
                      buyInDraft={tableRoom.buyInDraft()}
                      claimError={tableRoom.claimError()}
                      displayNameDraft={tableRoom.displayNameDraft()}
                      isAuthenticated={props.isAuthenticated}
                      isAuthConfigured={props.isAuthConfigured}
                      isClaiming={tableRoom.isClaimingSeat()}
                      isSigningIn={props.isSigningIn}
                      room={props.room}
                      seat={seat()}
                      signedInDisplayName={props.authenticatedDisplayName ?? null}
                      onBuyInInput={tableRoom.setBuyInDraft}
                      onCancel={tableRoom.cancelSeatClaim}
                      onClaim={tableRoom.claimSeat}
                      onDisplayNameInput={tableRoom.setDisplayNameDraft}
                      onSignInWithGoogle={props.onSignInWithGoogle}
                    />
                  )}
                </Show>
                <Show
                  when={tableRoom.privateView() || tableRoom.canStartNextHand()}
                >
                  <TableActionBar
                    table={currentTable()}
                    privateView={tableRoom.privateView()}
                    canStartNextHand={tableRoom.canStartNextHand()}
                    isSettingShowdownReveal={tableRoom.isSettingShowdownReveal()}
                    isStartingNextHand={tableRoom.isStartingNextHand()}
                    seatLifecyclePendingSeatId={tableRoom.seatLifecyclePendingSeatId()}
                    pendingAction={tableRoom.pendingPlayerAction()}
                    showCardsAtShowdown={tableRoom.showCardsAtShowdown()}
                    onAction={tableRoom.submitPlayerAction}
                    onSitInSeat={tableRoom.sitInSeat}
                    onSitOutNextHandChange={tableRoom.setSitOutNextHand}
                    onStartNextHand={tableRoom.startNextHand}
                    onShowCardsAtShowdownChange={
                      tableRoom.setShowCardsAtShowdown
                    }
                  />
                </Show>
              </>
            )}
          </Match>

          <Match when={tableRoom.roomStateErrorMessage()}>
            {(errorMessage) => (
              <TableStatePanel
                eyebrow="Room snapshot failed"
                title="Could not load this table."
                detail={errorMessage()}
                actionLabel="Try again"
                onAction={tableRoom.refetchRoom}
                onBackToLobby={props.onBackToLobby}
              />
            )}
          </Match>

          <Match when={tableRoom.isRoomStateLoading()}>
            <TableStatePanel
              eyebrow="Loading table"
              title="Fetching the latest room snapshot."
              detail={props.roomId}
              onBackToLobby={props.onBackToLobby}
            />
          </Match>
        </Switch>
      </main>
    </TableChipDisplayScope>
  );
}
