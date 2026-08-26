import React from 'react';
import { MarketingPhoto } from './marketing-photo';

/**
 * Full-bleed photographic band between the statute and the reckoning. The
 * photo is atmospheric — the caption carries the meaning — so it is
 * `alt=""` rather than described twice.
 */
export function RecordsBand() {
  return (
    <div className="mk-shotband">
      <MarketingPhoto
        name="records-band"
        widths={[800, 1600, 2400]}
        sizes="100vw"
        alt=""
        width={2400}
        height={800}
      />
      <p className="mk-sbcap">
        Every association on this coastline owes its owners the same four things
      </p>
    </div>
  );
}
