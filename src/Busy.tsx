/** Three dots that pulse in turn. Decorative: the words before them carry the meaning. */
export const Dots = () => (
  <span className="dots" aria-hidden="true">
    <span>.</span><span>.</span><span>.</span>
  </span>
)

/** A button label that becomes "Doing the thing..." with moving dots while `busy`, so a slow action never looks hung. */
export const Busy = ({ busy, idle, doing }: { busy: boolean; idle: string; doing: string }) =>
  busy ? <>{doing}<Dots /></> : <>{idle}</>
