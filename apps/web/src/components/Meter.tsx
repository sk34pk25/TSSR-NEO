interface MeterProps {
  /** Valeur affichee, entre 0 et 1. */
  value: number;
  label: string;
  width?: number | string;
  /** Texte lu a la place du pourcentage brut, quand une formulation aide plus. */
  valueText?: string;
}

/**
 * Barre de progression accessible.
 *
 * Un simple element decoratif portant une etiquette ne transmet rien aux
 * technologies d assistance, et constitue meme une violation : une etiquette
 * n est permise que sur un role qui l accepte. On declare donc un vrai role de
 * barre de progression, avec sa valeur.
 */
export function Meter({ value, label, width, valueText }: MeterProps): JSX.Element {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const percent = Math.round(clamped * 100);
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText ?? `${percent} %`}
      style={width === undefined ? undefined : { width }}
    >
      <div className="meter__fill" style={{ width: `${percent}%` }} />
    </div>
  );
}
