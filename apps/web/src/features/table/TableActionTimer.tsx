import { Show } from "solid-js";

export function TableActionTimer(props: {
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
