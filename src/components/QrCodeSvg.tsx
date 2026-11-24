import { useMemo } from 'react';
import { buildQrMatrix } from '../utils/qrMatrix';

interface QrCodeSvgProps {
  value: string;
  size?: number;
  accentCrimson?: boolean;
  label?: string;
}

export function QrCodeSvg({
  value,
  size = 180,
  accentCrimson = false,
  label = 'QR Code visual do ingresso',
}: QrCodeSvgProps) {
  const matrix = useMemo(() => buildQrMatrix(value, 25), [value]);
  const moduleCount = matrix.length;
  const quietZone = 2;
  const viewBoxSize = moduleCount + quietZone * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      role="img"
      aria-label={label}
      className="block rounded-md bg-white p-2 shadow-sm"
    >
      <rect width={viewBoxSize} height={viewBoxSize} fill="#FFFFFF" />
      {matrix.map((row, r) =>
        row.map((active, c) => {
          if (!active) return null;
          const isCenterEye =
            (r >= 2 && r <= 4 && c >= 2 && c <= 4) ||
            (r >= 2 && r <= 4 && c >= moduleCount - 5 && c <= moduleCount - 3) ||
            (r >= moduleCount - 5 && r <= moduleCount - 3 && c >= 2 && c <= 4);

          return (
            <rect
              key={`${r}-${c}`}
              x={c + quietZone}
              y={r + quietZone}
              width={1}
              height={1}
              fill={accentCrimson && isCenterEye ? '#DC143C' : '#09090B'}
            />
          );
        })
      )}
    </svg>
  );
}
