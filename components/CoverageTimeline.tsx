import { clipToTerm } from '@/lib/exposure/windows';
import { daysBetweenInclusive, epochDay, formatUsDate, type IsoDate } from '@/lib/dates';
import { formatDollars, type Cents } from '@/lib/money';
import type { CoverageWindow } from '@/lib/exposure/types';

/**
 * The coverage-window timeline (brief §8.6).
 *
 * This single drawing does more explaining than any amount of copy: a horizontal time
 * axis across the policy term, shaded bands where the certificates on file show workers'
 * comp, payment markers along the axis, and the uncovered payments in the exposure
 * colour. Partial coverage — a certificate expiring in April while the sub worked through
 * August — is the common case, and this is where it becomes obvious.
 */
export interface TimelinePayment {
  readonly id: string;
  readonly paidOn: IsoDate;
  /** The period the work was performed, when it is on file. */
  readonly workFrom: IsoDate | null;
  readonly workTo: IsoDate | null;
  readonly amount: Cents;
  readonly covered: boolean;
  /** The period straddles a coverage boundary. */
  readonly partial: boolean;
  /** No work dates on file, so the payment date stood in. */
  readonly proxied: boolean;
  readonly sourceRef: string | null;
}

const HEIGHT = 132;
const AXIS_Y = 86;
const BAND_TOP = 30;
const BAND_HEIGHT = 26;
const PAD_X = 12;

export function CoverageTimeline({
  termStart,
  termEnd,
  windows,
  payments,
}: {
  termStart: IsoDate;
  termEnd: IsoDate;
  windows: readonly CoverageWindow[];
  payments: readonly TimelinePayment[];
}) {
  const width = 1000;
  const inner = width - PAD_X * 2;
  const start = epochDay(termStart);
  const totalDays = Math.max(1, daysBetweenInclusive(termStart, termEnd));

  const x = (date: IsoDate): number =>
    PAD_X + ((epochDay(date) - start) / totalDays) * inner;

  const clipped = clipToTerm(windows, termStart, termEnd);
  const months = monthTicks(termStart, termEnd);
  const maxAmount = Math.max(1, ...payments.map((payment) => payment.amount));

  return (
    <figure className="panel">
      <figcaption className="panel-head">
        <h3 className="text-sm font-semibold">Work performed against coverage on file</h3>
        <Legend />
      </figcaption>
      <div className="overflow-x-auto px-2 py-3">
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="h-[132px] w-full min-w-[640px]"
          role="img"
          aria-label={`Payment timeline from ${formatUsDate(termStart)} to ${formatUsDate(termEnd)} with ${clipped.length} covered periods`}
        >
          {months.map((tick) => (
            <g key={tick.date}>
              <line
                x1={x(tick.date)}
                x2={x(tick.date)}
                y1={BAND_TOP - 8}
                y2={AXIS_Y + 6}
                stroke="#E2DFD5"
                strokeWidth={1}
              />
              <text
                x={x(tick.date)}
                y={AXIS_Y + 20}
                textAnchor="middle"
                fontSize={9}
                fill="#8B8879"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Coverage bands: what the certificates on file show, and nothing more. */}
          {clipped.map((window) => (
            <g key={`${window.from}-${window.to}`}>
              <rect
                x={x(window.from)}
                y={BAND_TOP}
                width={Math.max(2, x(window.to) - x(window.from))}
                height={BAND_HEIGHT}
                fill="#EDF3EE"
                stroke="#2E5C42"
                strokeOpacity={0.45}
                strokeWidth={1}
              />
              <title>
                Certificate on file shows workers’ comp {formatUsDate(window.from)} –{' '}
                {formatUsDate(window.to)}
              </title>
            </g>
          ))}

          <line
            x1={PAD_X}
            x2={width - PAD_X}
            y1={AXIS_Y}
            y2={AXIS_Y}
            stroke="#C9C5B7"
            strokeWidth={1}
          />

          {payments.map((payment) => {
            // The marker sits on the period tested, not on the check date: the work period
            // where one is on file, the payment date only where one is not.
            const from = payment.workFrom ?? payment.paidOn;
            const to = payment.workTo ?? payment.paidOn;
            const cx = x(from);
            const cxEnd = x(to);
            const barHeight = 8 + (payment.amount / maxAmount) * 26;
            const color = payment.covered ? '#2E5C42' : '#9E2B1B';
            const markerY = AXIS_Y - barHeight;
            return (
              <g key={payment.id}>
                {/* The span of work, drawn along the axis. */}
                {cxEnd - cx > 1 ? (
                  <line
                    x1={cx}
                    x2={cxEnd}
                    y1={AXIS_Y - 4}
                    y2={AXIS_Y - 4}
                    stroke={color}
                    strokeWidth={3}
                    strokeOpacity={payment.covered ? 0.4 : 0.8}
                  />
                ) : null}
                <line
                  x1={cx}
                  x2={cx}
                  y1={AXIS_Y}
                  y2={markerY}
                  stroke={color}
                  strokeWidth={2}
                  strokeOpacity={payment.covered ? 0.55 : 1}
                  strokeDasharray={payment.proxied ? '2 2' : undefined}
                />
                <circle
                  cx={cx}
                  cy={markerY}
                  r={3}
                  fill={payment.covered ? '#FFFFFF' : color}
                  stroke={color}
                  strokeWidth={1.5}
                />
                {payment.proxied ? (
                  <text x={cx} y={markerY - 6} textAnchor="middle" fontSize={8} fill="#8A6A17">
                    ?
                  </text>
                ) : null}
                <title>
                  {payment.proxied
                    ? `Paid ${formatUsDate(payment.paidOn)} · no work dates on file, payment date used as a proxy`
                    : `Work ${formatUsDate(from)} – ${formatUsDate(to)} · paid ${formatUsDate(payment.paidOn)}`}
                  {' · '}
                  {formatDollars(payment.amount)}
                  {payment.sourceRef ? ` · ${payment.sourceRef}` : ''} ·{' '}
                  {payment.partial
                    ? 'straddles a coverage boundary'
                    : payment.covered
                      ? 'inside a covered period on file'
                      : 'outside every covered period on file'}
                </title>
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-2xs text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-4 border border-cleared/45 bg-cleared-soft" />
        Covered period on file
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-cleared bg-white" />
        Payment inside a window
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-risk" />
        Outside every window
      </span>
      <span className="inline-flex items-center gap-1.5 text-note">
        <span className="font-mono">?</span>
        No work dates — payment date used as a proxy
      </span>
    </div>
  );
}

function monthTicks(termStart: IsoDate, termEnd: IsoDate): { date: IsoDate; label: string }[] {
  const ticks: { date: IsoDate; label: string }[] = [];
  const [startYear, startMonth] = [Number(termStart.slice(0, 4)), Number(termStart.slice(5, 7))];
  let year = startYear;
  let month = startMonth;

  for (let index = 0; index < 26; index += 1) {
    const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
    if (date > termEnd) break;
    if (date >= termStart) {
      ticks.push({
        date,
        label: `${MONTHS[month - 1]}${month === 1 || index === 0 ? ` ’${String(year).slice(2)}` : ''}`,
      });
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return ticks;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
