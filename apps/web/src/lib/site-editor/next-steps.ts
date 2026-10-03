/**
 * The guided editor's "Next steps" checklist (builder v4, Phase 3).
 *
 * Pure: every input is something the editor already knows, so this decides
 * order, wording and "done" without a request of its own.
 *
 * Two groups, in the design's order:
 *
 *  1. **Florida's website rules**, first. Computed live from the site
 *     (`RequiredSectionStatus`, the same source as the top-bar pill and the
 *     publish checks) and from the records (`summarizeRecords`, the same source
 *     as the Documents tool). Nobody can tick these off by hand: one is done
 *     when the site or the records say so. Below the statute's size threshold
 *     the group says "recommended", and apartments have no group at all.
 *  2. **Make it yours**: six setup steps. Two are ticked by hand ("Mark as
 *     done"), three are done by opening a tool or the phone preview, and
 *     "Publish your site" is done when the site has been published with
 *     nothing waiting.
 *
 * Legal copy: the design's "Associations can be fined $50 per day while this
 * is missing" is not used. That figure is not established for website posting,
 * and we give no legal advice — the law line is `requiredSectionLaw`'s
 * sentence, the one the rest of the builder uses.
 */

import type { RequirementLevel, RequiredSectionStatus } from '@propertypro/shared';
import type { RecordsGroup } from './records-status';

export type MarkableStep = 'welcome' | 'photo';
export type VisitableStep = 'design' | 'pages' | 'phone';

export type NextStepAction =
  | { kind: 'add-section'; blockType: string }
  | { kind: 'show-section'; blockType: string }
  | { kind: 'open-documents' }
  | { kind: 'select-hero' }
  | { kind: 'open-tool'; tool: 'design' | 'pages' }
  | { kind: 'preview-phone' }
  | { kind: 'publish' };

export interface NextStep {
  key: string;
  title: string;
  detail: string;
  /** The statute sentence for a rules item that is not yet done; otherwise null. */
  law: string | null;
  done: boolean;
  /** Label for the step's button; null when there is nothing to do. */
  cta: string | null;
  action: NextStepAction | null;
  /** True for steps the manager may tick by hand. */
  markable: boolean;
}

export interface NextStepGroup {
  id: 'rules' | 'setup';
  title: string;
  steps: NextStep[];
}

export interface NextStepsInput {
  level: RequirementLevel;
  /** From `useRequiredSections().statuses`. Empty while the site is loading. */
  sections: readonly RequiredSectionStatus[];
  lawFor: (blockType: string) => string | null;
  /** From `summarizeRecords`; null while the checklist is loading or unavailable. */
  records: readonly RecordsGroup[] | null;
  marked: readonly MarkableStep[];
  visited: readonly VisitableStep[];
  /** The home page's welcome section already has a photo. */
  heroHasImage: boolean;
  /** The site has been published at least once. */
  everPublished: boolean;
  /** Unpublished changes waiting (the publish count). */
  pendingChanges: number;
}

export interface NextStepsResult {
  groups: NextStepGroup[];
  done: number;
  total: number;
  /** Rough minutes for the setup steps still open. */
  minutesLeft: number;
  /** The one setup step shown expanded: the first that is not done. */
  firstOpenKey: string | null;
}

/** The design's labels for the two required section types. */
const SECTION_COPY: Record<string, { subject: string; noun: string }> = {
  documents: { subject: 'Official records', noun: 'official records' },
  meetings: { subject: 'Meeting notices', noun: 'meeting notices' },
};

function sectionStep(status: RequiredSectionStatus, input: NextStepsInput): NextStep {
  const copy = SECTION_COPY[status.blockType] ?? { subject: status.title, noun: status.title };
  const law = input.lawFor(status.blockType);
  const required = input.level === 'required';
  if (status.state === 'visible') {
    return {
      key: `section-${status.blockType}`,
      title: `${copy.subject} are posted`,
      detail: `Your site has a ${status.title.toLowerCase()}.`,
      law: null,
      done: true,
      cta: null,
      action: null,
      markable: false,
    };
  }
  const hidden = status.state === 'hidden';
  return {
    key: `section-${status.blockType}`,
    title: hidden ? `${copy.subject} are hidden` : `${copy.subject} need a section`,
    detail: hidden
      ? `Your ${status.title.toLowerCase()} is hidden. Show it to post your ${copy.noun}.`
      : `No page has a ${status.title.toLowerCase()} yet. Add one to post your ${copy.noun}.`,
    law: required ? law : null,
    done: false,
    cta: hidden ? 'Show section' : 'Add section',
    action: hidden
      ? { kind: 'show-section', blockType: status.blockType }
      : { kind: 'add-section', blockType: status.blockType },
    markable: false,
  };
}

function recordsStep(records: readonly RecordsGroup[], input: NextStepsInput): NextStep {
  const empty = records.filter((g) => g.status === 'nothing_posted');
  if (empty.length === 0) {
    return {
      key: 'records',
      title: 'Required documents are posted',
      detail: 'Every records group has a posted document.',
      law: null,
      done: true,
      cta: null,
      action: null,
      markable: false,
    };
  }
  const names = empty.map((g) => g.label).join(', ');
  return {
    key: 'records',
    title:
      empty.length === 1
        ? 'A required document category is empty'
        : `${empty.length} required document categories are empty`,
    detail: `Nothing is posted yet for: ${names}.`,
    law: input.level === 'required' ? input.lawFor('documents') : null,
    done: false,
    cta: 'Open documents',
    action: { kind: 'open-documents' },
    markable: false,
  };
}

interface SetupDefinition {
  key: string;
  title: string;
  detail: string;
  cta: string;
  action: NextStepAction;
  minutes: number;
  markable: boolean;
  done: (input: NextStepsInput) => boolean;
}

/** The design's "Make it yours" steps, in its order. */
const SETUP: readonly SetupDefinition[] = [
  {
    key: 'welcome',
    title: 'Check your welcome message',
    detail: 'Click the headline on the page and type. It saves as you go.',
    cta: 'Show me',
    action: { kind: 'select-hero' },
    minutes: 1,
    markable: true,
    done: (i) => i.marked.includes('welcome'),
  },
  {
    key: 'photo',
    title: 'Add a photo of your community',
    detail: 'Click the welcome section, then choose a photo for it.',
    cta: 'Show me',
    action: { kind: 'select-hero' },
    minutes: 2,
    markable: true,
    done: (i) => i.marked.includes('photo') || i.heroHasImage,
  },
  {
    key: 'design',
    title: 'Choose a template and colours',
    detail: 'Try a different template or colour set. Your words and sections stay the same.',
    cta: 'Open design',
    action: { kind: 'open-tool', tool: 'design' },
    minutes: 1,
    markable: false,
    done: (i) => i.visited.includes('design'),
  },
  {
    key: 'pages',
    title: 'Review your pages',
    detail: 'Decide which pages show in the top menu.',
    cta: 'Open pages',
    action: { kind: 'open-tool', tool: 'pages' },
    minutes: 1,
    markable: false,
    done: (i) => i.visited.includes('pages'),
  },
  {
    key: 'phone',
    title: 'Check it on a phone',
    detail: 'Most residents will visit on their phone.',
    cta: 'Preview on phone',
    action: { kind: 'preview-phone' },
    minutes: 1,
    markable: false,
    done: (i) => i.visited.includes('phone'),
  },
  {
    key: 'publish',
    title: 'Publish your site',
    detail: 'Review what changed, then put it live for residents.',
    cta: 'Review and publish',
    action: { kind: 'publish' },
    minutes: 1,
    markable: false,
    done: (i) => i.everPublished && i.pendingChanges === 0,
  },
];

export function buildNextSteps(input: NextStepsInput): NextStepsResult {
  const groups: NextStepGroup[] = [];

  if (input.level !== 'none') {
    const rules = input.sections.map((s) => sectionStep(s, input));
    if (input.records !== null && input.records.length > 0) {
      rules.push(recordsStep(input.records, input));
    }
    if (rules.length > 0) {
      groups.push({
        id: 'rules',
        title:
          input.level === 'required' ? 'Required by Florida law' : 'Recommended by Florida law',
        steps: rules,
      });
    }
  }

  const setup: NextStep[] = SETUP.map((d) => {
    const done = d.done(input);
    return {
      key: d.key,
      title: d.title,
      detail: d.detail,
      law: null,
      done,
      cta: done ? null : d.cta,
      action: done ? null : d.action,
      markable: d.markable && !done,
    };
  });
  groups.push({ id: 'setup', title: 'Make it yours', steps: setup });

  const all = groups.flatMap((g) => g.steps);
  const minutesLeft = SETUP.filter((d) => !d.done(input)).reduce((sum, d) => sum + d.minutes, 0);

  return {
    groups,
    done: all.filter((s) => s.done).length,
    total: all.length,
    minutesLeft,
    firstOpenKey: setup.find((s) => !s.done)?.key ?? null,
  };
}
