import type { LobbyRoomView } from "@openpoker/protocol";
import { Match, Show, Switch } from "solid-js";
import {
  BoardInfo,
  BetInfo,
  TableStatePanel,
  TableStatusPanel,
} from "./TableRoomPanels";
import { ClaimSeatDialog, SeatGrid } from "./TableSeats";
import {
  useTableRoomController,
  type TableRoomTopBarView,
} from "./useTableRoomController";

export type { TableRoomTopBarView } from "./useTableRoomController";

export interface TableRoomPageProps {
  roomId: string;
  room: LobbyRoomView | null;
  onBackToLobby: () => void;
  onTopBarChange?: (view: TableRoomTopBarView | null) => void;
}

export function TableRoomPage(props: TableRoomPageProps) {
  const tableRoom = useTableRoomController(props);

  return (
    <main class="relative z-10 mx-auto flex w-full max-w-[1320px] flex-col gap-2.5 px-3 pb-4 pt-2.5 sm:px-6 lg:px-8 xl:gap-2 xl:pb-3 xl:pt-2">
      <Switch>
        <Match when={tableRoom.table()}>
          {(currentTable) => (
            <>
              <div class="grid gap-2.5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] xl:gap-2">
                <BoardInfo
                  table={currentTable()}
                  privateView={tableRoom.privateView()}
                />
                <BetInfo
                  table={currentTable()}
                  privateView={tableRoom.privateView()}
                />
              </div>
              <SeatGrid
                table={currentTable()}
                privateView={tableRoom.privateView()}
                claimingSeatId={tableRoom.claimingSeatId()}
                leavingSeatId={tableRoom.leavingSeatId()}
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
                    isClaiming={tableRoom.isClaimingSeat()}
                    room={props.room}
                    seat={seat()}
                    onBuyInInput={tableRoom.setBuyInDraft}
                    onCancel={tableRoom.cancelSeatClaim}
                    onClaim={tableRoom.claimSeat}
                    onDisplayNameInput={tableRoom.setDisplayNameDraft}
                  />
                )}
              </Show>
              <TableStatusPanel
                table={currentTable()}
                privateView={tableRoom.privateView()}
                isSettingShowdownReveal={tableRoom.isSettingShowdownReveal()}
                showCardsAtShowdown={tableRoom.showCardsAtShowdown()}
                onShowCardsAtShowdownChange={
                  tableRoom.setShowCardsAtShowdown
                }
              />
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
  );
}
