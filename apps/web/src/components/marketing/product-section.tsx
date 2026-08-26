import React from 'react';
import { PinBadIcon, PinOkIcon, PinWarnIcon, SectionMark, SurfaceBar } from './marketing-brand';

/** Rows in the "what to do next" queue. */
const QUEUE = [
  {
    ord: '01',
    title: 'Upload approved meeting minutes',
    meta: '§718.111(12)(g) · blocks the public page',
    status: '5 days late',
    tone: 'bad' as const,
  },
  {
    ord: '02',
    title: 'Upload the insurance declaration',
    meta: '§718.111(11) · blocks the public page',
    status: '2 days late',
    tone: 'bad' as const,
  },
  {
    ord: '03',
    title: 'Confirm the current rules',
    meta: 'Suggested: rules-v2026.1.pdf',
    status: 'Due Jun 02',
    tone: 'warn' as const,
  },
];

const RECORDS = [
  { title: 'Declaration of condominium', meta: 'Posted Mar 12 · 2.1 MB', status: 'Published' },
  { title: 'Annual operating budget, FY2026', meta: 'Posted May 24 · 412 KB', status: 'Published' },
  { title: 'Approved meeting minutes', meta: 'Rolling twelve months · 14 files', status: 'Published' },
  { title: 'Records request form', meta: 'Open · web form or signed PDF', status: 'Open' },
];

interface Tile {
  rows: { label: string; key: string; keyTone?: 'ok' | 'bad' }[];
  title: string;
  body: string;
}

const TILES: Tile[] = [
  {
    rows: [
      { label: 'declaration-2024.pdf', key: '§718.111(12)' },
      { label: 'budget-FY2026.pdf', key: 'Filed', keyTone: 'ok' },
    ],
    title: 'Documents, filed by statute',
    body: 'One upload, filed in the statute’s category.',
  },
  {
    rows: [
      { label: 'Board meeting · Sep 4', key: 'posts in 48h' },
      { label: 'Owner meeting · Sep 18', key: 'posts in 14d' },
    ],
    title: 'Notices on a timer',
    body: 'Scheduled from the meeting date, posted and mailed.',
  },
  {
    rows: [
      { label: 'Unit 8C · L. Martinez', key: 'owner' },
      { label: 'Unit 12A · R. Chen', key: 'owner' },
    ],
    title: 'Owner portal',
    body: 'Owners see what they’re entitled to. Nothing else.',
  },
  {
    rows: [
      { label: 'Request #114 received', key: '6 days left', keyTone: 'bad' }, // design-tokens:exempt — a records-request number, not a color
      { label: 'Request #113', key: 'Answered', keyTone: 'ok' }, // design-tokens:exempt — a records-request number, not a color
    ],
    title: 'Records requests, logged',
    body: 'A timestamp, an owner, and a clock on the duty.',
  },
  {
    rows: [
      { label: 'Pool closed Tuesday', key: '312 sent', keyTone: 'ok' },
      { label: 'Elevator service', key: 'queued' },
    ],
    title: 'Announcements',
    body: 'Reach every owner at once.',
  },
  {
    rows: [
      { label: 'minutes.pdf published', key: '11:24' },
      { label: 'scope → public', key: '11:03' },
    ],
    title: 'An exportable audit trail',
    body: 'Every upload, scope change, and publish — appended.',
  },
];

function keyClass(tone?: 'ok' | 'bad') {
  if (tone === 'ok') return 'mk-kk';
  if (tone === 'bad') return 'mk-kr';
  return 'mk-k';
}

export function ProductSection() {
  return (
    <section className="mk-band" id="product" aria-labelledby="product-h">
      <div className="mk-wrap mk-sec">
        <div className="mk-sec-l">
          <SectionMark index="04" label="The product" />
          <h2 className="mk-display" id="product-h">
            Two screens do most of the work.
          </h2>
          <p>One list of what&apos;s owed. One page that proves it.</p>
          <a className="mk-arrow" href="#onboarding">
            See how a week of setup goes
          </a>
        </div>

        <div className="mk-stack-36">
          <div
            className="mk-surface"
            role="img"
            aria-label="The compliance queue: item one, upload approved meeting minutes, five days late and blocking the public page; item two, upload the insurance declaration, two days late; item three, confirm the current rules, due June 2 with a suggested file from the library."
          >
            <SurfaceBar url="sunsetpalms.getpropertypro.com/compliance" />
            <div className="mk-sbody">
              <div className="mk-shead">
                <div>
                  <p className="mk-shead-title">What to do next</p>
                  <p className="mk-shead-sub">Three open items, ordered by deadline</p>
                </div>
                <span className="mk-pin mk-pin-flat">3 open</span>
              </div>
              {QUEUE.map((row, i) => (
                <div className={i === 0 ? 'mk-srow mk-at' : 'mk-srow'} key={row.ord}>
                  <div>
                    <b>
                      <span className="mk-ord">{row.ord}</span>
                      &nbsp;&nbsp;{row.title}
                    </b>
                    <small>{row.meta}</small>
                  </div>
                  <span className={`mk-pin mk-pin-${row.tone}`}>
                    {row.tone === 'bad' ? <PinBadIcon /> : <PinWarnIcon />}
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="mk-cap">
            Every requirement carries its citation, its deadline, and the file that
            satisfies it.
          </p>

          <div
            className="mk-surface"
            role="img"
            aria-label="The public records page for Sunset Palms, listing the declaration of condominium, the annual operating budget, approved meeting minutes and the records request form, each marked published or open."
          >
            <SurfaceBar url="sunsetpalms.getpropertypro.com/records" />
            <div className="mk-sbody">
              <div className="mk-shead">
                <div>
                  <p className="mk-shead-title">Official records</p>
                  <p className="mk-shead-sub">Sunset Palms Condominium Association</p>
                </div>
                <span className="mk-pin mk-pin-flat">9 records</span>
              </div>
              {RECORDS.map((row) => (
                <div className="mk-srow" key={row.title}>
                  <div>
                    <b>{row.title}</b>
                    <small>{row.meta}</small>
                  </div>
                  <span className="mk-pin mk-pin-ok">
                    <PinOkIcon />
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="mk-cap">
            Only verified records appear publicly. Board notes never leave the workspace.
          </p>
        </div>
      </div>

      <div className="mk-wrap mk-tiles-wrap">
        <div className="mk-tiles">
          {TILES.map((tile) => (
            <div className="mk-tile" key={tile.title}>
              <div className="mk-tui" aria-hidden="true">
                {tile.rows.map((r) => (
                  <div className="mk-mrow" key={r.label}>
                    {r.label}
                    <span className={keyClass(r.keyTone)}>{r.key}</span>
                  </div>
                ))}
              </div>
              <div className="mk-tb">
                <h3>{tile.title}</h3>
                <p>{tile.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
