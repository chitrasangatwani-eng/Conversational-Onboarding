import { useStore } from "../engine/store";
import { LANGS } from "../engine/i18n";
import { setLang } from "../engine/flow";

export function LangSelect({ style }: { style?: React.CSSProperties }) {
  const lang = useStore((s) => s.lang);
  return (
    <select className="lang" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language" style={style}>
      {LANGS.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>)}
    </select>
  );
}
