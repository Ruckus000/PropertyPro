import type { CommunityType } from '@propertypro/shared';
import { COMMUNITY_TYPE_DISPLAY_NAMES } from '@propertypro/shared';
import type {
  PublicSiteTemplateEditorInput,
  PublicSiteTemplateThumbnailDescriptor,
} from './types';

export const DEFAULT_TEMPLATE_THUMBNAIL_DESCRIPTOR: PublicSiteTemplateThumbnailDescriptor = {
  gradient: ['#1d4ed8', '#0f172a'],
  layout: 'hero-grid',
};

export const DEFAULT_TEMPLATE_JSX = `function App() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Public Site Template
            </p>
            <h1 className="text-2xl font-semibold text-slate-950">
              {PP_TEMPLATE.communityName}
            </h1>
          </div>
          <a
            href="/auth/login"
            className="rounded-full bg-[var(--pp-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            Resident Login
          </a>
        </div>
      </header>

      <main>
        <section className="bg-[linear-gradient(135deg,var(--pp-primary),var(--pp-secondary))] px-6 py-20 text-white">
          <div className="mx-auto max-w-5xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/70">
              Welcome
            </p>
            <h2 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight">
              A clear, branded front door for {PP_TEMPLATE.communityName}.
            </h2>
            <p className="mt-6 max-w-2xl text-lg text-white/80">
              This template is rendered from JSX and themed at runtime with the community's branding tokens.
            </p>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-3">
          {[
            ['Announcements', 'Publish timely community updates and important reminders.'],
            ['Documents', 'Surface key records, forms, and transparency materials.'],
            ['Meetings', 'Highlight schedules, agendas, and board communication.'],
          ].map(([title, body]) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}`;

export function getDefaultTemplateName(communityType: CommunityType): string {
  const label = COMMUNITY_TYPE_DISPLAY_NAMES[communityType];
  return `${label} Public Template`;
}

export function getDefaultTemplateSummary(communityType: CommunityType): string {
  switch (communityType) {
    case 'condo_718':
      return 'Board-forward public site starter for condo demos.';
    case 'hoa_720':
      return 'Community-friendly public site starter for HOA demos.';
    case 'apartment':
      return 'Resident-services public site starter for apartment demos.';
    default:
      return 'Public site starter template.';
  }
}

export function getDefaultTemplateTags(communityType: CommunityType): string[] {
  switch (communityType) {
    case 'condo_718':
      return ['Formal', 'Board-forward'];
    case 'hoa_720':
      return ['Community', 'Events'];
    case 'apartment':
      return ['Services', 'Resident-first'];
    default:
      return ['Starter'];
  }
}

export function buildDefaultTemplateDraft(communityType: CommunityType): PublicSiteTemplateEditorInput {
  return {
    name: getDefaultTemplateName(communityType),
    summary: getDefaultTemplateSummary(communityType),
    tags: getDefaultTemplateTags(communityType),
    thumbnailDescriptor: DEFAULT_TEMPLATE_THUMBNAIL_DESCRIPTOR,
    communityType,
    draftJsxSource: DEFAULT_TEMPLATE_JSX,
  };
}
