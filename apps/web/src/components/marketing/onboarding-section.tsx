import React from 'react';
import { SectionMark } from './marketing-brand';
import { MarketingPhoto } from './marketing-photo';

const STEPS = [
  {
    day: 'Day one',
    title: 'Add the association',
    body: 'Name, type, unit count. The statute checklist and a website come with it.',
  },
  {
    day: 'Day one to three',
    title: 'Drag in the documents',
    body: 'Bylaws, budgets, minutes, insurance — each lands in the category the statute names.',
  },
  {
    day: 'By day seven',
    title: 'Invite the board and owners',
    body: 'Everyone gets the access their role allows. From here, the list tells you what’s next.',
  },
];

export function OnboardingSection() {
  return (
    <section className="mk-band mk-band-warm" id="onboarding" aria-labelledby="ob-h">
      <div className="mk-wrap mk-sec">
        <div className="mk-sec-l">
          <SectionMark index="05" label="Getting started" />
          <h2 className="mk-display" id="ob-h">
            Current inside a week.
          </h2>
          <div className="mk-wk-shot">
            <MarketingPhoto
              name="onboarding"
              widths={[400, 800]}
              // Sits inside the 300px sticky column on desktop.
              sizes="(max-width: 900px) calc(100vw - 72px), 300px"
              alt="Board members seated around a table, reviewing printed documents together."
              width={1500}
              height={1125}
            />
          </div>
        </div>
        <div className="mk-wk">
          {STEPS.map((s) => (
            <div className="mk-wkr" key={s.day}>
              <p className="mk-d">{s.day}</p>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
