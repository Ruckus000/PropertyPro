'use client';

import { PhoneFrame } from '@propertypro/ui';

interface MobilePreviewClientProps {
  src: string;
}

export function MobilePreviewClient({ src }: MobilePreviewClientProps) {
  return (
    <div className="flex flex-1 items-center justify-center bg-gray-950">
      <PhoneFrame src={src} />
    </div>
  );
}
