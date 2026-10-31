import { useStore, type Field } from "../engine/store";
import { dictate } from "../engine/voice";

export const VOICE_NOTE = "Tap the mic beside any field to speak it. Voice uses your browser's speech service, so type if you prefer.";

/** Per-field dictation button (full scope only). */
export function MicButton({ field }: { field: Field }) {
  const on = useStore((s) => s.dictating === field);
  return (
    <button className={"mic-sm" + (on ? " on" : "")} onClick={() => dictate(field)} aria-label="Speak" aria-pressed={on}>
      <span />
    </button>
  );
}
