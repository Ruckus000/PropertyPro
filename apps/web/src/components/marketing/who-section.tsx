import React from 'react';
import { SectionMark } from './marketing-brand';
import { MarketingPhoto } from './marketing-photo';

interface Audience {
  /** Base filename under public/marketing/v1 — see MarketingPhoto. */
  photo: string;
  alt: string;
  kicker: string;
  title: string;
  body: string;
  statValue: string;
  statRest: string;
}

const AUDIENCES: Audience[] = [
  {
    photo: 'who-condo',
    alt: 'A white Florida condominium tower on the waterfront, palms in the foreground.',
    kicker: 'Self-managed condo',
    title: 'The volunteer board',
    body: 'No manager, no staff. One director who took on the records.',
    statValue: '25–149',
    statRest: ' units · §718',
  },
  {
    photo: 'who-hoa',
    alt: 'A quiet Florida residential street lined with palm trees and single-family homes.',
    kicker: 'Homeowners association',
    title: 'The monthly board',
    body: 'Same obligations, different statute — and owners who read the minutes.',
    statValue: '100+',
    statRest: ' parcels · §720',
  },
  {
    photo: 'who-cam',
    alt: 'A person at a desk annotating printed documents with a pen.',
    kicker: 'Licensed manager',
    title: 'The CAM portfolio',
    body: 'Every association is a separate obligation. One late posting is your problem.',
    statValue: '5–40',
    statRest: ' communities · both',
  },
];

export function WhoSection() {
  return (
    <section className="mk-band mk-band-warm" id="who" aria-labelledby="who-h">
      <div className="mk-wrap">
        <div className="mk-head">
          <SectionMark index="01" label="Who this is for" />
          <h2 className="mk-display" id="who-h">
            Three kinds of people sign up.
          </h2>
        </div>
        <div className="mk-who">
          {AUDIENCES.map((a) => (
            <article className="mk-wcard" key={a.kicker}>
              <div className="mk-wshot">
                <MarketingPhoto
                  name={a.photo}
                  widths={[400, 800, 1100]}
                  // One of three columns above 900px, full width minus the gutter below it.
                  sizes="(max-width: 900px) calc(100vw - 72px), 364px"
                  alt={a.alt}
                  width={1100}
                  height={1100}
                />
              </div>
              <p className="mk-n">{a.kicker}</p>
              <h3>{a.title}</h3>
              <p>{a.body}</p>
              <p className="mk-stat">
                <b>{a.statValue}</b>
                {a.statRest}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
