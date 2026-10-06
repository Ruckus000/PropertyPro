'use client';

/**
 * The "Front porch" layout: the community card assembles on the left while the
 * right side asks one question at a time. Below 900px the card is hidden and a
 * compact header carries the brand and the community name instead.
 */
import Image from 'next/image';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  FileText,
  Globe,
  House,
  KeyRound,
  Loader2,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import type { CommunityType } from '@propertypro/shared';
import { cn } from '@/lib/utils';
import './front-porch.css';

export interface CardRow {
  key: 'addr' | 'units' | 'url' | 'plan';
  text: string | null;
  mono?: boolean;
}

export type CardFooter =
  | { kind: 'requirements'; count: number }
  | { kind: 'apartment' }
  | { kind: 'provisioning' }
  | { kind: 'live' }
  | null;

export interface CommunityCardModel {
  name: string | null;
  type: CommunityType | null;
  typeBadge: string | null;
  rows: CardRow[];
  footer: CardFooter;
}

const ROW_ICONS = { addr: MapPin, units: Building, url: Globe, plan: CreditCard } as const;
const SKELETON_WIDTHS = { addr: 'w-3/5', units: 'w-1/2', url: 'w-2/3', plan: 'w-1/2' } as const;
const TYPE_ICONS = { condo_718: Building2, hoa_720: House, apartment: KeyRound } as const;

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex flex-none items-center gap-2">
      <span
        className={cn(
          'flex items-center justify-center rounded-md bg-interactive text-content-inverse',
          compact ? 'h-8 w-8' : 'h-9 w-9',
        )}
      >
        <Building className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
      </span>
      <span className={cn('font-semibold text-content', compact ? 'text-base' : 'text-lg')}>
        PropertyPro <span className="text-content-link">Florida</span>
      </span>
    </span>
  );
}

export function CommunityCard({ card }: { card: CommunityCardModel }) {
  const TypeIcon = card.type ? TYPE_ICONS[card.type] : Building2;
  return (
    <div
      data-testid="community-card"
      className="relative mx-6 -mt-32 rounded-lg border border-edge bg-surface-card p-6 shadow-e3"
    >
      <div className="flex items-center gap-4">
        {card.name ? (
          <span className="fp-enter flex h-12 w-12 flex-none items-center justify-center rounded-full bg-interactive text-xl font-semibold text-content-inverse">
            {card.name[0]?.toUpperCase()}
          </span>
        ) : (
          <span className="h-12 w-12 flex-none rounded-full border-2 border-dashed border-edge-strong" />
        )}
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          <div
            data-land="name"
            className={cn(
              'max-w-full truncate text-xl font-semibold',
              card.name ? 'text-content' : 'text-content-disabled',
            )}
          >
            {card.name ?? 'Your community'}
          </div>
          {card.typeBadge ? (
            <span
              data-land="type"
              className="fp-enter inline-flex items-center gap-2 rounded-full bg-interactive-subtle px-3 py-1 text-xs font-semibold text-content-brand"
            >
              <TypeIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {card.typeBadge}
            </span>
          ) : (
            <span className="block h-6 w-32 rounded-full bg-surface-muted" />
          )}
        </div>
      </div>
      <dl className="mt-5 flex flex-col gap-3 border-t border-edge-subtle pt-5">
        {card.rows.map((row) => {
          const Icon = ROW_ICONS[row.key];
          return (
            <div key={row.key} className="flex min-h-6 items-center gap-3 text-content-tertiary">
              <Icon className="h-4 w-4 flex-none" aria-hidden="true" />
              {row.text ? (
                <span
                  data-land={row.key}
                  className={cn(
                    'fp-enter min-w-0 truncate text-sm text-content',
                    row.mono && 'font-mono',
                  )}
                >
                  {row.text}
                </span>
              ) : (
                <span className={cn('block h-2.5 rounded-full bg-surface-muted', SKELETON_WIDTHS[row.key])} />
              )}
            </div>
          );
        })}
      </dl>
      {card.footer?.kind === 'requirements' ? (
        <div className="fp-enter mt-5 flex items-center gap-3 rounded-md border border-status-warning-border bg-status-warning-bg px-4 py-3 text-status-warning">
          <FileText className="h-4 w-4 flex-none" aria-hidden="true" />
          <span className="flex-1 text-sm font-semibold">{card.footer.count} required document categories</span>
          <span className="text-xs font-semibold">0 posted</span>
        </div>
      ) : null}
      {card.footer?.kind === 'apartment' ? (
        <div className="fp-enter mt-5 flex items-center gap-3 rounded-md border border-status-info-border bg-status-info-bg px-4 py-3 text-status-info">
          <KeyRound className="h-4 w-4 flex-none" aria-hidden="true" />
          <span className="flex-1 text-sm font-semibold">Operations portal · 6 tools ready</span>
        </div>
      ) : null}
      {card.footer?.kind === 'provisioning' ? (
        <div className="fp-enter mt-5 flex items-center gap-3 rounded-md bg-surface-muted px-4 py-3 text-content-secondary">
          <Loader2 className="h-4 w-4 flex-none animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span className="flex-1 text-sm font-semibold">Setting up your portal</span>
        </div>
      ) : null}
      {card.footer?.kind === 'live' ? (
        <div className="fp-enter mt-5 flex items-center gap-3 rounded-md border border-status-success-border bg-status-success-bg px-4 py-3 text-status-success">
          <CheckCircle2 className="h-4 w-4 flex-none" aria-hidden="true" />
          <span className="flex-1 text-sm font-semibold">Live — owners can find you now</span>
        </div>
      ) : null}
    </div>
  );
}

export interface ShellProgress {
  index: number;
  total: number;
}

export interface ShellFooter {
  note: string;
  cta: string | null;
  onNext?: () => void;
  onBack?: () => void;
  busy?: boolean;
}

export function FrontPorchShell({
  card,
  progress,
  footer,
  children,
}: {
  card: CommunityCardModel;
  progress?: ShellProgress | null;
  footer?: ShellFooter | null;
  children: ReactNode;
}) {
  return (
    <main
      id="main-content"
      className="grid min-h-screen grid-cols-1 bg-surface-card min-[900px]:h-screen min-[900px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
    >
      <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-edge bg-surface-page px-10 py-8 min-[900px]:flex">
        <BrandMark />
        <div className="mt-8 flex flex-auto flex-col">
          <div className="relative min-h-72 flex-1 overflow-hidden rounded-lg bg-surface-muted">
            {/* Decorative: the card, not the photo, carries the content. */}
            <Image
              src="/email/photo-condo.jpg"
              alt=""
              aria-hidden="true"
              fill
              sizes="(min-width: 900px) 40vw, 0px"
              className="object-cover"
              priority
            />
          </div>
          <CommunityCard card={card} />
        </div>
        <div className="mt-6 flex items-center gap-2 text-sm text-content-secondary">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Built for Florida §718 &amp; §720 associations
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col bg-surface-card">
        <div className="flex flex-none items-center justify-between gap-3 border-b border-edge-subtle px-5 py-3 min-[900px]:hidden">
          <BrandMark compact />
          {card.name ? (
            <span className="min-w-0 truncate text-sm font-medium text-content-secondary">{card.name}</span>
          ) : null}
        </div>
        {progress ? (
          <div className="flex flex-none items-center gap-4 border-b border-edge-subtle px-5 py-3 min-[900px]:px-12 min-[900px]:py-5">
            <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-content-tertiary">
              Step {progress.index + 1} of {progress.total}
            </span>
            <div className="flex max-w-60 flex-1 gap-2" aria-hidden="true">
              {Array.from({ length: progress.total }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-colors duration-500',
                    i <= progress.index ? 'bg-interactive' : 'bg-surface-muted',
                  )}
                />
              ))}
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto box-border max-w-[620px] px-5 pb-10 pt-6 min-[900px]:px-12 min-[900px]:pb-16 min-[900px]:pt-14">
            {children}
          </div>
        </div>
        {footer ? (
          <div className="flex flex-none items-center justify-between gap-4 border-t border-edge-subtle bg-surface-card px-5 py-3 min-[900px]:px-12 min-[900px]:py-4">
            <span className="hidden min-w-0 items-center gap-2 text-sm text-content-tertiary min-[900px]:flex">
              <Check className="h-4 w-4 text-status-success" aria-hidden="true" />
              {footer.note}
            </span>
            <div className="ml-auto flex items-center gap-3">
              {footer.onBack ? (
                <button
                  type="button"
                  onClick={footer.onBack}
                  className="inline-flex h-12 items-center gap-2 rounded-md px-4 text-base font-medium text-content-secondary hover:bg-surface-hover"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </button>
              ) : null}
              {footer.cta && footer.onNext ? (
                <button
                  type="button"
                  onClick={footer.onNext}
                  disabled={footer.busy}
                  className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-md bg-interactive px-6 text-base font-semibold text-content-inverse shadow-e1 transition-colors hover:bg-interactive-hover active:bg-interactive-active disabled:bg-interactive-disabled"
                >
                  {footer.busy ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : null}
                  {footer.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

/** The design's page heading: Fraunces, the only display-font use in the flow. */
export function StepHeading({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
}) {
  return (
    <div className="fp-enter">
      {eyebrow ? (
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-content-tertiary">{eyebrow}</div>
      ) : null}
      <h1 className="m-0 text-balance font-display text-3xl font-semibold leading-tight tracking-tight text-content">
        {title}
      </h1>
      {lede ? <p className="mt-3 text-pretty text-lg text-content-secondary">{lede}</p> : null}
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <div id={id} role="alert" className="mt-2 flex items-start gap-2 text-sm text-status-danger">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
