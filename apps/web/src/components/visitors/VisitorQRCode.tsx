'use client';

import { useEffect, useState } from 'react';
import { QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface VisitorQRCodeProps {
  passCode: string;
  size?: number;
  className?: string;
}

export function VisitorQRCode({
  passCode,
  size = 200,
  className,
}: VisitorQRCodeProps) {
  const [svgString, setSvgString] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void import('qrcode').then((QRCode) => {
      QRCode.toString(passCode, { type: 'svg', width: size, margin: 1 })
        .then((svg) => {
          if (!cancelled) {
            setSvgString(svg);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSvgString(null);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [passCode, size]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0 text-content-secondary', className)}
        >
          <QrCode className="h-4 w-4" />
          <span className="sr-only">Open QR code</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4">
        {svgString ? (
          <div
            className="rounded-md bg-white p-2"
            dangerouslySetInnerHTML={{ __html: svgString }}
          />
        ) : (
          <div className="h-[200px] w-[200px] animate-pulse rounded-md bg-muted" />
        )}
        <p className="mt-2 text-center font-mono text-sm text-muted-foreground">{passCode}</p>
      </PopoverContent>
    </Popover>
  );
}
