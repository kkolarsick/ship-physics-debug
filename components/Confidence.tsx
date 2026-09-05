import {
  CONFIDENCE_FACTOR_LABELS,
  CONFIDENCE_LABELS,
  compareLevels,
  type ConfidenceLevel,
  type EstimateConfidence,
} from '@/lib/exposure/confidence';

/**
 * Confidence is shown next to the figure, not buried in a tooltip. The point of this
 * product is a number an auditor can be argued with about; a number whose weakest input is
 * hidden is worth less than one that names it.
 */
const TONE: Readonly<Record<ConfidenceLevel, string>> = {
  deterministic: 'border-cleared/40 bg-cleared-soft text-cleared',
  high: 'border-cleared/30 bg-cleared-soft text-cleared',
  medium: 'border-note/40 bg-note/5 text-note',
  low: 'border-note/50 bg-note/10 text-note',
  unavailable: 'border-risk-rule bg-risk-soft text-risk',
};

export function ConfidenceBadge({
  confidence,
  className = '',
}: {
  confidence: EstimateConfidence;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center border px-1.5 py-0.5 text-2xs font-medium ${TONE[confidence.level]} ${className}`}
      title={confidence.assumptions.join(' · ')}
    >
      {CONFIDENCE_LABELS[confidence.level]}
    </span>
  );
}

export function ConfidencePanel({
  confidence,
  title = 'What this figure rests on',
}: {
  confidence: EstimateConfidence;
  title?: string;
}) {
  // Weakest first: the thing most likely to be wrong is the thing worth reading.
  const factors = [...confidence.factors].sort((a, b) => compareLevels(a.level, b.level));

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="text-sm font-semibold">{title}</h2>
        <ConfidenceBadge confidence={confidence} />
      </div>
      <table className="workpaper-table">
        <thead>
          <tr>
            <th className="w-44">Input</th>
            <th className="w-32">Level</th>
            <th>What is known, and what was assumed</th>
          </tr>
        </thead>
        <tbody>
          {factors.map((entry) => (
            <tr key={entry.id}>
              <td className="font-medium">{CONFIDENCE_FACTOR_LABELS[entry.id]}</td>
              <td>
                <span className={`border px-1.5 py-0.5 text-2xs ${TONE[entry.level]}`}>
                  {CONFIDENCE_LABELS[entry.level]}
                </span>
              </td>
              <td>
                <p className="text-ink-muted">{entry.statement}</p>
                {entry.assumption ? (
                  <p className="mt-1 border-l-2 border-note/50 pl-2 text-2xs text-note">
                    Assumption: {entry.assumption}
                  </p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
