import type { PublicTableView } from "@openpoker/protocol";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";

const SHOWDOWN_OVERLAY_MS = 1_250;

export function TableShowdownOverlay(props: { table: PublicTableView }) {
  const [visible, setVisible] = createSignal(false);
  const [shownKey, setShownKey] = createSignal<string | null>(null);
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const clearHideTimer = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  createEffect(() => {
    const key = getShowdownOverlayKey(props.table);

    if (!key || shownKey() === key) {
      return;
    }

    setShownKey(key);
    setVisible(true);
    clearHideTimer();
    hideTimer = setTimeout(() => setVisible(false), SHOWDOWN_OVERLAY_MS);
  });

  onCleanup(clearHideTimer);

  return (
    <Show when={visible()}>
      <div class="op-showdown-overlay pointer-events-none fixed inset-0 z-40 grid place-items-center px-4">
        <div class="op-showdown-overlay__panel">
          <p class="op-showdown-overlay__eyebrow">Cards up</p>
          <h2 class="op-showdown-overlay__title">SHOWDOWN!</h2>
        </div>
      </div>
    </Show>
  );
}

export function getShowdownOverlayKey(table: PublicTableView): string | null {
  if (table.handStatus === "showdown" && table.street === "showdown") {
    return table.handId ?? `${table.roomId}:${table.handNumber}`;
  }

  if (
    table.handStatus !== "settled" ||
    table.street !== "showdown" ||
    (table.showdownSummary?.handEvaluations.length ?? 0) === 0
  ) {
    return null;
  }

  return (
    table.showdownSummary?.handId ??
    table.handId ??
    `${table.roomId}:${table.handNumber}`
  );
}
