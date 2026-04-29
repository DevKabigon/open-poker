import { For, onCleanup, onMount } from "solid-js";
import {
  useDisplaySettings,
  type ChipDisplayUnit,
} from "./display-settings";

const CHIP_DISPLAY_OPTIONS: Array<{
  label: string;
  unit: ChipDisplayUnit;
}> = [
  { label: "Dollar", unit: "usd" },
  { label: "Big blind", unit: "bb" },
];

export function DisplaySettingsDialog(props: { onClose: () => void }) {
  const settings = useDisplaySettings();

  onMount(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  return (
    <div class="fixed inset-0 z-[80] grid place-items-center px-4 py-6">
      <button
        class="absolute inset-0 cursor-default bg-[rgba(4,9,21,0.66)] backdrop-blur-sm"
        type="button"
        aria-label="Close settings"
        onClick={props.onClose}
      />

      <section
        class="relative z-10 w-full max-w-sm rounded-[1rem] border border-[rgba(238,246,255,0.12)] bg-[rgba(7,17,31,0.98)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="display-settings-title"
      >
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-data text-[0.58rem] uppercase tracking-[0.16em] text-[var(--op-muted-500)]">
              Table
            </p>
            <h2
              id="display-settings-title"
              class="mt-1 font-display text-lg font-semibold tracking-[-0.03em] text-[var(--op-cream-100)]"
            >
              Settings
            </h2>
          </div>
          <button
            class="grid size-8 place-items-center rounded-full border border-[rgba(238,246,255,0.12)] bg-[rgba(238,246,255,0.055)] text-[var(--op-muted-300)] transition hover:border-[rgba(96,165,250,0.36)] hover:text-[var(--op-accent-300)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-accent-400)]"
            type="button"
            aria-label="Close settings"
            onClick={props.onClose}
          >
            <CloseIcon />
          </button>
        </div>

        <fieldset class="mt-5">
          <legend class="font-data text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[var(--op-accent-300)]">
            Chip display
          </legend>
          <div class="mt-2 grid gap-2">
            <For each={CHIP_DISPLAY_OPTIONS}>
              {(option) => (
                <label class="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[0.75rem] border border-[rgba(238,246,255,0.1)] bg-[rgba(238,246,255,0.045)] px-3 transition hover:border-[rgba(96,165,250,0.3)]">
                  <span class="font-data text-xs font-semibold text-[var(--op-cream-100)]">
                    {option.label}
                  </span>
                  <input
                    class="size-4 accent-[var(--op-accent-400)]"
                    type="radio"
                    name="chip-display-unit"
                    value={option.unit}
                    checked={settings.chipDisplayUnit() === option.unit}
                    onChange={() => settings.setChipDisplayUnit(option.unit)}
                  />
                </label>
              )}
            </For>
          </div>
        </fieldset>
      </section>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      class="size-4"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
