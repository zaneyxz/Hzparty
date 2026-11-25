import { useMemo } from 'react';
import QRCode from 'qrcode';
import { buildQrMatrix } from '../utils/qrMatrix';

interface QrCodeSvgProps {
  value: string;
  size?: number;
  accentCrimson?: boolean;
  label?: string;
}

function buildScannableQrMatrix(payload: string): boolean[][] {
  try {
    const qr = QRCode.create(payload || 'HZ-PARTY', { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    return Array.from({ length: count }, (_, r) =>
      Array.from({ length: count }, (_, c) => Boolean(qr.modules.get(r, c)))
    );
  } catch {
    return buildQrMatrix(payload, 25);
  }
}

export function QrCodeSvg({
  value,
  size = 180,
  accentCrimson = false,
  label = 'QR Code visual do ingresso',
}: QrCodeSvgProps) {
  const matrix = useMemo(() => buildScannableQrMatrix(value), [value]);
  const moduleCount = matrix.length;
  const quietZone = 4;
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
