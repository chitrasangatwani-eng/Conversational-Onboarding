// Assistant transcript entries. Each kind renders as a different card.

export interface StatusRow { glyph: string; label: string; state: string; color: string }

/** Labels shared by the cards; translated with the message. */
export type CardText = Record<string, string>;

interface Base { id: number; t?: CardText }

export type Msg = Base & (
  | { kind: "text"; text: string; mine?: boolean }
  | { kind: "status"; rows: StatusRow[]; nextLabel?: string; act?: () => void }
  | { kind: "source"; text: string; src: string; ver: string }
  | { kind: "checklist"; items: string[]; act: () => void }
  | { kind: "summary"; fields: string[]; goal: string; confirmAct: () => void; declineAct: () => void }
  | { kind: "handoff"; fields: string[]; callAct: () => void; centreAct: () => void }
  | { kind: "link"; label: string; act: () => void }
  | { kind: "secure"; act: () => void }
);
