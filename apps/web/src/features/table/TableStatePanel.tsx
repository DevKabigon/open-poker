import { Show } from "solid-js";

export function TableStatePanel(props: {
  eyebrow: string;
  title: string;
  detail: string | null;
  actionLabel?: string;
  onAction?: () => void;
  onBackToLobby: () => void;
}) {
  return (
    <section class="rounded-[1rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(4,9,21,0.62)] p-4 sm:p-6">
      <p class="font-data text-[0.62rem] uppercase tracking-[0.16em] text-[var(--op-accent-400)]">
        {props.eyebrow}
      </p>
      <h1 class="mt-2 font-display text-xl font-semibold tracking-[-0.03em] text-[var(--op-cream-100)]">
        {props.title}
      </h1>
      <Show when={props.detail}>
        {(detail) => (
          <p class="mt-2 font-data text-xs text-[var(--op-muted-300)]">
            {detail()}
          </p>
        )}
      </Show>
      <div class="mt-4 flex flex-wrap gap-2">
        <Show
          when={
            props.actionLabel && props.onAction
              ? { label: props.actionLabel, handler: props.onAction }
              : null
          }
        >
          {(action) => (
            <button
              class="op-button op-button-primary px-3"
              type="button"
              onClick={action().handler}
            >
              {action().label}
            </button>
          )}
        </Show>
        <button
          class="op-button op-button-secondary px-3"
          type="button"
          onClick={props.onBackToLobby}
        >
          Lobby
        </button>
      </div>
    </section>
  );
}
