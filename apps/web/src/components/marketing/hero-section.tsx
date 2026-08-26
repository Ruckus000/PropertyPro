'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SIGNUP_TRIAL_DAYS } from '@propertypro/shared';
import { DaysInForce } from './days-in-force';
import { PinBadIcon, PinOkIcon, PinWarnIcon, SectionMark, SurfaceBar } from './marketing-brand';

type Severity = 'bad' | 'warn';

interface DemoItem {
  id: string;
  title: string;
  cite: string;
  status: string;
  severity: Severity;
  /** Points the compliance score gains when this item is published. */
  gain: number;
}

const OPEN_ITEMS: DemoItem[] = [
  {
    id: 'minutes',
    title: 'Approved meeting minutes',
    cite: '§718.111(12)(g)',
    status: '5 days late',
    severity: 'bad',
    gain: 6,
  },
  {
    id: 'insurance',
    title: 'Insurance declaration',
    cite: '§718.111(11)',
    status: '2 days late',
    severity: 'bad',
    gain: 7,
  },
  {
    id: 'rules',
    title: 'Rules & regulations',
    cite: '§718.112(2)',
    status: 'Due Jun 02',
    severity: 'warn',
    gain: 6,
  },
];

const SETTLED_ITEMS = [
  { title: 'Annual operating budget', meta: 'Posted May 24' },
  { title: 'Declaration of condominium', meta: 'Posted Mar 12' },
];

const START_SCORE = 81;
const SCORE_ANIMATION_MS = 420;

function useScoreAnimation(target: number, reduced: boolean) {
  const [shown, setShown] = useState(target);
  const [rising, setRising] = useState(false);
  const frame = useRef<number | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const from = useRef(target);

  useEffect(() => {
    const start = from.current;
    from.current = target;
    if (reduced || start === target) {
      setShown(target);
      return;
    }
    setRising(true);
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / SCORE_ANIMATION_MS);
      setShown(Math.round(start + (target - start) * k));
      if (k < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        frame.current = null;
        setShown(target);
      }
    };
    frame.current = requestAnimationFrame(step);
    // Guaranteed terminal write: rAF is throttled in a background tab, timers
    // are not. Without this the score can stall mid-count if the reader tabs
    // away during the animation.
    fallback.current = setTimeout(() => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = null;
      setShown(target);
      setRising(false);
    }, SCORE_ANIMATION_MS + 380);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      if (fallback.current) clearTimeout(fallback.current);
      frame.current = null;
      fallback.current = null;
    };
  }, [target, reduced]);

  return { shown, rising };
}

function DemoRow({
  item,
  isNext,
  published,
  onPublish,
}: {
  item: DemoItem;
  isNext: boolean;
  published: boolean;
  onPublish: () => void;
}) {
  return (
    <div className={isNext ? 'mk-srow mk-at' : 'mk-srow'}>
      <div>
        <b>{item.title}</b>
        <small>{item.cite}</small>
      </div>
      <div className="mk-act">
        {published ? (
          <span className="mk-pin mk-pin-ok">
            <PinOkIcon />
            Published
          </span>
        ) : (
          <>
            <span className={`mk-pin mk-pin-${item.severity}`}>
              {item.severity === 'bad' ? <PinBadIcon /> : <PinWarnIcon />}
              {item.status}
            </span>
            <button className="mk-resolve" type="button" onClick={onPublish}>
              Publish<span className="sr-only"> {item.title}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Hero, plus the interactive compliance demo. Publishing an item moves the
 * score — the point of the demo is that the score is a consequence of the
 * work, not a separate thing to maintain.
 */
export function HeroSection() {
  const [done, setDone] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  const target = Math.min(
    100,
    OPEN_ITEMS.reduce((n, i) => (done.includes(i.id) ? n + i.gain : n), START_SCORE),
  );
  const { shown, rising } = useScoreAnimation(target, reduced);

  const publish = useCallback((item: DemoItem) => {
    setDone((prev) => {
      if (prev.includes(item.id)) return prev;
      const next = [...prev, item.id];
      const score = Math.min(
        100,
        OPEN_ITEMS.reduce((n, i) => (next.includes(i.id) ? n + i.gain : n), START_SCORE),
      );
      setAnnouncement(`${item.title} published. Compliance score is now ${score} percent.`);
      return next;
    });
  }, []);

  const openCount = OPEN_ITEMS.length - done.length;
  const nextOpen = OPEN_ITEMS.find((i) => !done.includes(i.id));

  return (
    <section className="mk-hero" id="top">
      <div className="mk-wrap mk-hero-grid">
        <div>
          <SectionMark index="§718" label="In effect since January 1, 2026" />
          <h1 className="mk-display">
            The records your association owes owners,{' '}
            <span className="mk-swash">on the record.</span>
          </h1>
          <p className="mk-hero-lede">
            Florida requires most condos and HOAs to publish their official records —{' '}
            <b>within 30 days, with the board on the hook.</b> PropertyPro turns that into
            a tracked list with dates and evidence.
          </p>
          <div className="mk-hero-cta">
            <a className="mk-pill mk-pill-primary" href="/signup">
              Start a {SIGNUP_TRIAL_DAYS}-day trial
            </a>
            <a className="mk-arrow" href="#statute">
              See what the statute asks for
            </a>
          </div>
          <div className="mk-facts">
            <div className="mk-fact mk-live">
              <b>
                <DaysInForce />
              </b>
              <span>Days the requirement has been in force</span>
            </div>
            <div className="mk-fact">
              <b>25+</b>
              <span>Condo units before a website is required</span>
            </div>
            <div className="mk-fact">
              <b>100+</b>
              <span>HOA parcels before a website is required</span>
            </div>
          </div>
        </div>

        <div className="mk-hero-art">
          <div
            className="mk-surface"
            role="group"
            aria-label="Interactive demo: the PropertyPro compliance view for Sunset Palms"
          >
            <SurfaceBar url="sunsetpalms.getpropertypro.com/compliance" />
            <div className="mk-sbody">
              <div className="mk-shead">
                <div>
                  <p className="mk-shead-title">Compliance</p>
                  <p className="mk-shead-sub">Sunset Palms · 124 units · §718</p>
                </div>
                <p className={rising ? 'mk-sscore mk-up' : 'mk-sscore'}>
                  {shown}
                  <span>%</span>
                </p>
              </div>
              {OPEN_ITEMS.map((item) => (
                <DemoRow
                  key={item.id}
                  item={item}
                  isNext={nextOpen?.id === item.id}
                  published={done.includes(item.id)}
                  onPublish={() => publish(item)}
                />
              ))}
              {SETTLED_ITEMS.map((item) => (
                <div className="mk-srow" key={item.title}>
                  <div>
                    <b>{item.title}</b>
                    <small>{item.meta}</small>
                  </div>
                  <span className="mk-pin mk-pin-ok">
                    <PinOkIcon />
                    Published
                  </span>
                </div>
              ))}
            </div>
            <div className="mk-sfoot">
              <span>
                {openCount === 0
                  ? 'All requirements satisfied · audit trail recording'
                  : `${openCount} ${openCount === 1 ? 'item' : 'items'} open · audit trail recording`}
              </span>
              {done.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDone([]);
                    setAnnouncement('Demo reset.');
                  }}
                >
                  Reset demo
                </button>
              )}
            </div>
          </div>
          <p className="mk-cap">
            <b>Try it — publish an item.</b> The board&apos;s view, with demo data.
          </p>
          <p className="sr-only" role="status">
            {announcement}
          </p>
        </div>
      </div>
    </section>
  );
}
