import type {
  PrivatePlayerView,
  PublicTableView,
} from "@openpoker/protocol";
import { For } from "solid-js";
import { SectionTitle } from "./table-primitives";
import { SeatCard } from "./TableSeatCard";

export function SeatGrid(props: {
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
  claimingSeatId: number | null;
  leavingSeatId: number | null;
  selectedSeatId: number | null;
  onLeaveSeat: () => void;
  onSelectSeat: (seatId: number) => void;
}) {
  return (
    <section class="rounded-[0.9rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(4,9,21,0.5)] p-2.5 sm:p-3">
      <SectionTitle label="Seats" />
      <div class="mt-2 grid grid-cols-3 gap-2">
        <For each={props.table.seats}>
          {(seat) => (
            <SeatCard
              claimingSeatId={props.claimingSeatId}
              isSelected={props.selectedSeatId === seat.seatId}
              leavingSeatId={props.leavingSeatId}
              onLeaveSeat={props.onLeaveSeat}
              onSelectSeat={props.onSelectSeat}
              seat={seat}
              table={props.table}
              privateView={props.privateView}
            />
          )}
        </For>
      </div>
    </section>
  );
}
