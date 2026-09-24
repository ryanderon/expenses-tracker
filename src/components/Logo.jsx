import { useId } from 'react';

const P_STEM = 'M148 210h72v164a36 36 0 0 1-72 0z';

/**
 * Penny's mark: a copper penny with a "P" struck into it, on the brand green.
 * Same artwork as public/favicon.svg — keep the two in step. Colours are fixed
 * rather than themed so it matches the installed app icon.
 */
export default function Logo({ size = 38, className }) {
  const id = useId();
  const bg = `${id}-bg`;
  const coin = `${id}-coin`;

  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Penny"
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00863b" />
          <stop offset="1" stopColor="#007b7e" />
        </linearGradient>
        <linearGradient id={coin} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f7c67f" />
          <stop offset="1" stopColor="#d27a36" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${bg})`} />
      <circle cx="256" cy="264" r="186" fill="#000" fillOpacity=".14" />
      <circle cx="256" cy="256" r="186" fill={`url(#${coin})`} />
      {/* Reeded edge; pathLength keeps the ticks seamless all the way round. */}
      <circle
        cx="256" cy="256" r="174" fill="none"
        stroke="#b5652a" strokeOpacity=".45" strokeWidth="12"
        pathLength="360" strokeDasharray="1.4 2.2"
      />
      <circle cx="256" cy="256" r="146" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="8" />
      {/* A shadow offset down, then the P on top, so it reads as struck. */}
      <g transform="translate(256 262) scale(.56) translate(-256 -256)">
        <path d={P_STEM} fill="#a8551f" fillOpacity=".45" />
        <circle cx="256" cy="210" r="72" fill="none" stroke="#a8551f" strokeOpacity=".45" strokeWidth="72" />
      </g>
      <g transform="translate(256 256) scale(.56) translate(-256 -256)">
        <path d={P_STEM} fill="#fff" />
        <circle cx="256" cy="210" r="72" fill="none" stroke="#fff" strokeWidth="72" />
      </g>
    </svg>
  );
}
