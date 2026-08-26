import React from 'react';
import { ComplianceChecker } from './compliance-checker';
import { DaysInForce } from './days-in-force';
import { SectionMark } from './marketing-brand';

/**
 * The uncomfortable part: there is no enforcement calendar, so the first
 * notice most boards get is a records request. The `$0` counter is deliberate
 * — overstating the penalty would be the easy sale and the wrong one.
 */
export function ReckoningSection() {
  return (
    <section className="mk-band mk-band-ink" id="reckoning" aria-labelledby="reck-h">
      <div className="mk-wrap">
        <div className="mk-reck">
          <SectionMark index="03" label="The uncomfortable part" />
          <h2 className="mk-display" id="reck-h">
            Nobody is going to remind you.
          </h2>
        </div>
        <p className="mk-reck-sub">
          No inspector, no annual filing, no letter from the state.{' '}
          <b>
            The first notice most boards get is a records request from an owner who is
            already angry.
          </b>
        </p>

        <div className="mk-counter">
          <div className="mk-cbox">
            <b>
              <DaysInForce />
            </b>
            <span>Days the 25-unit requirement has been in force</span>
          </div>
          <div className="mk-cbox">
            <b>10</b>
            <span>Days to answer an owner&apos;s written records request</span>
          </div>
          <div className="mk-cbox">
            <b>$0</b>
            <span>
              Fine for lacking a website. The exposure is the request you can&apos;t
              answer
            </span>
          </div>
        </div>

        <ComplianceChecker />
      </div>
    </section>
  );
}
