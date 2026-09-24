/**
 * Florida Modern content blocks — everything between the masthead and the
 * footer. Each is a small table-or-div with inline styles and a bottom margin,
 * so a template is just a column of these in reading order:
 *
 *   <CategoryMark/> <Headline/> [data block…] <ActionRow/> <FinePrint/>
 */
import { Img, Link } from '@react-email/components';
import { Fragment, type ReactNode } from 'react';
import { EmailButton, type ButtonVariant } from './email-button';
import { emailIconUrl, emailImageUrl, type EmailIcon, type EmailImage } from './email-assets';
import { emailTheme as c, mono, serif, toneColors, type EmailTone } from './theme';

// ── Category mark ───────────────────────────────────────────────────────────

/**
 * The one line that survives skimming: a bare 40px glyph beside a 13px
 * uppercase label naming the kind of mail (plus a date or statute). The glyph
 * is decorative — the label says everything.
 */
export function CategoryMark({ icon, label, tone }: { icon: EmailIcon; label: ReactNode; tone: EmailTone | 'meta' }) {
  const colour = tone === 'meta' ? c.meta : toneColors(tone).text;
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: '0 0 22px 0' }}>
      <tbody>
        <tr>
          <td style={{ verticalAlign: 'middle', paddingRight: '16px', width: '40px' }}>
            <Img
              src={emailIconUrl(icon)}
              width={40}
              height={40}
              alt=""
              className="fm-mark"
              style={{ display: 'block', width: '40px', height: '40px' }}
            />
          </td>
          <td style={{ verticalAlign: 'middle' }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: colour,
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
                lineHeight: 1.35,
              }}
            >
              {label}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** The inline 17px variant used by compact (routine) mail instead of a full mark. */
export function InlineMark({ icon, label, tone }: { icon: EmailIcon; label: ReactNode; tone: EmailTone | 'meta' }) {
  const colour = tone === 'meta' ? c.meta : toneColors(tone).text;
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 600,
        color: colour,
        textTransform: 'uppercase',
        letterSpacing: '1.4px',
        margin: '0 0 14px 0',
      }}
    >
      <Img
        src={emailIconUrl(icon)}
        width={17}
        height={17}
        alt=""
        style={{ display: 'inline-block', verticalAlign: '-4px', marginRight: '9px', width: '17px', height: '17px' }}
      />
      {label}
    </div>
  );
}

// ── Headline + prose ────────────────────────────────────────────────────────

/**
 * 30px Fraunces states the event; the lede (16px) says what it means for the
 * reader. `compact` (24px / 15px) is for routine mail, so a posted document
 * never borrows the weight of a notice.
 */
export function Headline({ children, lede, compact = false }: { children: ReactNode; lede?: ReactNode; compact?: boolean }) {
  return (
    <>
      <h1
        className={compact ? undefined : 'fm-h1'}
        style={{
          fontFamily: serif,
          fontSize: compact ? '24px' : '30px',
          fontWeight: 600,
          letterSpacing: compact ? '-0.5px' : '-0.7px',
          lineHeight: compact ? 1.18 : 1.12,
          color: c.ink,
          margin: compact ? '0 0 14px 0' : '0 0 18px 0',
        }}
      >
        {children}
      </h1>
      {lede && <Paragraph size={compact ? 15 : 16}>{lede}</Paragraph>}
    </>
  );
}

export function Paragraph({
  children,
  size = 16,
  tight = false,
  ink = false,
}: {
  children: ReactNode;
  size?: 15 | 16;
  /** Smaller gap below — for consecutive paragraphs. */
  tight?: boolean;
  /** Full-strength ink instead of body grey (emergency copy). */
  ink?: boolean;
}) {
  return (
    <p style={{ fontSize: `${size}px`, color: ink ? c.ink : c.body, lineHeight: 1.7, margin: tight ? '0 0 16px 0' : '0 0 26px 0' }}>
      {children}
    </p>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong style={{ color: c.ink, fontWeight: 600 }}>{children}</strong>;
}

/** 12px meta-grey note under the action row: expiry, statute, "not you?" help. */
export function FinePrint({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: '12px', color: c.meta, lineHeight: 1.6, margin: '0 0 28px 0' }}>{children}</p>;
}

/** An 11px uppercase heading over a data block, optionally with a 17px glyph. */
export function SectionLabel({ children, icon }: { children: ReactNode; icon?: EmailIcon }) {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 600,
        color: c.meta,
        textTransform: 'uppercase',
        letterSpacing: '1.2px',
        margin: '0 0 10px 0',
      }}
    >
      {icon && (
        <Img
          src={emailIconUrl(icon)}
          width={17}
          height={17}
          alt=""
          style={{ display: 'inline-block', verticalAlign: '-4px', marginRight: '9px', width: '17px', height: '17px' }}
        />
      )}
      {children}
    </div>
  );
}

// ── Pills ───────────────────────────────────────────────────────────────────

/** "● Label" status pill. Never colour alone — the label is the status. */
export function StatusPill({ tone, children, dot = true }: { tone: EmailTone; children: ReactNode; dot?: boolean }) {
  const colours = toneColors(tone);
  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: colours.bg,
        color: colours.text,
        border: `1px solid ${colours.border}`,
        padding: '3px 9px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        lineHeight: 1.5,
      }}
    >
      {dot ? '● ' : ''}
      {children}
    </span>
  );
}

// ── Data rows ───────────────────────────────────────────────────────────────

export interface DataRow {
  label: ReactNode;
  value: ReactNode;
  /** Colour the value (e.g. green "$0.00 — paid in full"). */
  tone?: EmailTone;
  /** Set the value in mono — confirmation numbers, codes, filenames. */
  mono?: boolean;
}

/**
 * Label/value rows. `panel` = a bordered masthead-tint box (announcement
 * schedule); `ruled` = hairlines on the card (statement detail).
 */
export function DataRows({ rows, variant = 'ruled' }: { rows: DataRow[]; variant?: 'ruled' | 'panel' }) {
  const visible = rows.filter((row) => row.value !== undefined && row.value !== null && row.value !== '');
  if (visible.length === 0) return null;
  const panel = variant === 'panel';
  const cellPad = panel ? '15px 20px' : '14px 0';

  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{
        margin: '0 0 28px 0',
        ...(panel
          ? { backgroundColor: c.masthead, border: `1px solid ${c.border}`, borderRadius: '10px', borderCollapse: 'separate' as const }
          : { borderTop: `1px solid ${c.border}`, borderCollapse: 'collapse' as const }),
      }}
    >
      <tbody>
        {visible.map((row, index) => {
          const last = index === visible.length - 1;
          const border = panel && last ? undefined : `1px solid ${c.border}`;
          return (
            <tr key={index}>
              <td style={{ padding: cellPad, borderBottom: border, fontSize: '12px', color: c.body, width: '42%', verticalAlign: 'top' }}>
                {row.label}
              </td>
              <td
                style={{
                  padding: cellPad,
                  borderBottom: border,
                  fontSize: '14px',
                  fontWeight: 500,
                  color: row.tone ? toneColors(row.tone).text : c.ink,
                  textAlign: 'right',
                  verticalAlign: 'top',
                  fontFamily: row.mono ? mono : undefined,
                  wordBreak: 'break-word',
                }}
              >
                {row.value}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Figure ──────────────────────────────────────────────────────────────────

/**
 * The amount is the largest object in a money email. Amber when due, green
 * when paid, red when failed — the same object in three states.
 */
export function Figure({
  label,
  icon,
  amount,
  tone,
  asideLabel,
  asideValue,
}: {
  label: ReactNode;
  icon?: EmailIcon;
  amount: ReactNode;
  tone: EmailTone;
  asideLabel?: ReactNode;
  asideValue?: ReactNode;
}) {
  const colours = toneColors(tone);
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{
        backgroundColor: c.masthead,
        border: `1px solid ${c.border}`,
        borderLeft: `3px solid ${colours.rule}`,
        borderRadius: '0 10px 10px 0',
        margin: '0 0 28px 0',
      }}
    >
      <tbody>
        <tr>
          <td style={{ padding: '22px 24px 20px' }}>
            <SectionLabel icon={icon}>{label}</SectionLabel>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td className="fm-stack" style={{ verticalAlign: 'bottom' }}>
                    <span style={{ fontFamily: serif, fontSize: '38px', fontWeight: 600, color: c.ink, letterSpacing: '-1px', lineHeight: 1 }}>
                      {amount}
                    </span>
                  </td>
                  {asideValue !== undefined && asideValue !== null && asideValue !== '' && (
                    <td className="fm-stack fm-stack-gap" style={{ verticalAlign: 'bottom', textAlign: 'right' }}>
                      {asideLabel && (
                        <div style={{ fontSize: '11px', color: c.meta, textTransform: 'uppercase', letterSpacing: '1.1px' }}>{asideLabel}</div>
                      )}
                      <div style={{ fontFamily: serif, fontSize: '17px', fontWeight: 600, color: colours.text, marginTop: '3px' }}>
                        {asideValue}
                      </div>
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// ── Lists ───────────────────────────────────────────────────────────────────

export interface ItemRow {
  title: ReactNode;
  detail?: ReactNode;
  /** Right-hand pill. */
  status?: { tone: EmailTone; label: ReactNode; dot?: boolean };
  /** Left-hand chip (the digest's type column). */
  kind?: ReactNode;
}

/** A checklist: item + owner/detail + status pill. Doubles as the punch list. */
export function ItemRows({ items }: { items: ItemRow[] }) {
  if (items.length === 0) return null;
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: '0 0 28px 0', borderTop: `1px solid ${c.border}` }}>
      <tbody>
        {items.map((item, index) => (
          <tr key={index}>
            {item.kind !== undefined && (
              <td style={{ padding: '16px 14px 16px 0', borderBottom: `1px solid ${c.border}`, verticalAlign: 'top', width: '84px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    backgroundColor: c.canvas,
                    color: c.body,
                    border: `1px solid ${c.border}`,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.3px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.kind}
                </span>
              </td>
            )}
            <td style={{ padding: '16px 0', borderBottom: `1px solid ${c.border}`, verticalAlign: 'top' }}>
              <div style={{ fontSize: '14px', color: c.ink, fontWeight: 500, lineHeight: 1.45 }}>{item.title}</div>
              {item.detail && <div style={{ fontSize: '12px', color: c.meta, marginTop: '3px', lineHeight: 1.55 }}>{item.detail}</div>}
            </td>
            {item.status && (
              <td style={{ padding: '16px 0 16px 12px', borderBottom: `1px solid ${c.border}`, textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                <StatusPill tone={item.status.tone} dot={item.status.dot}>
                  {item.status.label}
                </StatusPill>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface NumberedRow {
  title: ReactNode;
  detail?: ReactNode;
  status?: { tone: EmailTone; label: ReactNode; dot?: boolean };
}

/** Numbered steps (01, 02, 03) — welcome orientation, deletion stages. */
export function NumberedRows({ rows, tone = 'coral' }: { rows: NumberedRow[]; tone?: EmailTone }) {
  if (rows.length === 0) return null;
  const numeral = tone === 'coral' ? c.coral : toneColors(tone).text;
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: '0 0 30px 0', borderTop: `1px solid ${c.border}` }}>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            <td style={{ padding: '17px 0', borderBottom: `1px solid ${c.border}`, width: '38px', verticalAlign: 'top' }}>
              <span style={{ fontFamily: serif, fontSize: '17px', fontWeight: 600, color: numeral }}>{String(index + 1).padStart(2, '0')}</span>
            </td>
            <td style={{ padding: '17px 0', borderBottom: `1px solid ${c.border}`, verticalAlign: 'top' }}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: c.ink, margin: '0 0 3px 0', lineHeight: 1.4 }}>{row.title}</div>
              {row.detail && <div style={{ fontSize: '13px', color: c.meta, lineHeight: 1.55 }}>{row.detail}</div>}
            </td>
            {row.status && (
              <td style={{ padding: '17px 0 17px 12px', borderBottom: `1px solid ${c.border}`, verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>
                <StatusPill tone={row.status.tone} dot={row.status.dot}>
                  {row.status.label}
                </StatusPill>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Actions ─────────────────────────────────────────────────────────────────

/**
 * One filled button and, optionally, one quiet text link — never two equal
 * buttons. Wrapping inline-blocks (not table cells) so the pair separates on
 * its own at phone width in any client, with or without the <style> block.
 */
export function ActionRow({
  href,
  label,
  variant = 'default',
  secondary,
  aside,
}: {
  href: string;
  label: ReactNode;
  variant?: ButtonVariant;
  secondary?: { href: string; label: ReactNode };
  /** Quiet text beside the button instead of a link (e.g. "Expires 10:41 AM"). */
  aside?: ReactNode;
}) {
  return (
    <div style={{ fontSize: 0, margin: '4px 0 14px 0' }}>
      <div className="fm-action" style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '15px', padding: '0 18px 14px 0' }}>
        <EmailButton href={href} variant={variant}>
          {label}
        </EmailButton>
      </div>
      {secondary && (
        <div className="fm-action" style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '13px', padding: '0 0 14px 0' }}>
          <Link
            href={secondary.href}
            style={{ fontSize: '13px', color: c.link, textDecoration: 'none', borderBottom: `1px solid ${c.coralBorder}`, paddingBottom: '1px' }}
          >
            {secondary.label}
          </Link>
        </div>
      )}
      {!secondary && aside && (
        <div className="fm-action" style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '12px', color: c.meta, padding: '0 0 14px 0' }}>
          {aside}
        </div>
      )}
    </div>
  );
}

// ── Media ───────────────────────────────────────────────────────────────────

/**
 * Photography is rationed: digests, community announcements and the signup
 * verification only. Fixed width/height and real alt text; it never carries
 * information, so images-off loses nothing but warmth.
 */
export function PhotoBand({ image, alt, height = 150 }: { image: EmailImage; alt: string; height?: number }) {
  return (
    <Img
      src={emailImageUrl(image)}
      width={540}
      height={height}
      alt={alt}
      className="fm-photo"
      style={{
        display: 'block',
        width: '100%',
        maxWidth: '540px',
        height: `${height}px`,
        objectFit: 'cover',
        borderRadius: '10px',
        border: `1px solid ${c.border}`,
        margin: '0 0 24px 0',
      }}
    />
  );
}

/** A human sender under the content: initials disc, name, role. */
export function Signature({ name, role }: { name: string; role?: ReactNode }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderTop: `1px solid ${c.border}`, margin: '6px 0 28px 0' }}>
      <tbody>
        <tr>
          <td style={{ paddingTop: '18px', width: '40px', verticalAlign: 'middle' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '19px',
                backgroundColor: c.canvas,
                border: `1px solid ${c.border}`,
                textAlign: 'center',
                lineHeight: '36px',
                fontFamily: serif,
                fontSize: '14px',
                fontWeight: 600,
                color: c.link,
              }}
            >
              {initials}
            </div>
          </td>
          <td style={{ paddingTop: '18px', paddingLeft: '12px', verticalAlign: 'middle' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: c.ink }}>{name}</div>
            {role && <div style={{ fontSize: '12px', color: c.meta, marginTop: '2px' }}>{role}</div>}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Big mono code, centred in a panel — OTP. */
export function CodeBlock({ code, caption }: { code: string; caption?: ReactNode }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{ backgroundColor: c.masthead, border: `1px solid ${c.border}`, borderRadius: '12px', margin: '0 0 28px 0' }}
    >
      <tbody>
        <tr>
          <td style={{ padding: '28px 20px', textAlign: 'center' }}>
            <div style={{ fontFamily: mono, fontSize: '38px', fontWeight: 600, color: c.ink, letterSpacing: '10px', lineHeight: 1 }}>{code}</div>
            {caption && <div style={{ fontSize: '12px', color: c.body, marginTop: '12px' }}>{caption}</div>}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Plain text with its line breaks rendered as real `<br />` elements. Use this
 * instead of `white-space: pre-line`: Outlook desktop (Word engine) ignores
 * `white-space`, so a CSS-only break collapses into one run-on line there.
 */
export function MultilineText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\r?\n/).map((line, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}

/** A quoted message from a person (e-sign note, denial reason, maintenance notes). */
export function Quote({ children, attribution }: { children: ReactNode; attribution?: ReactNode }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{ borderLeft: `3px solid ${c.border}`, margin: '0 0 28px 0' }}
    >
      <tbody>
        <tr>
          <td style={{ padding: '4px 0 4px 16px' }}>
            <div style={{ fontSize: '15px', color: c.body, lineHeight: 1.65, fontStyle: 'italic' }}>
              {typeof children === 'string' ? <MultilineText text={children} /> : children}
            </div>
            {attribution && <div style={{ fontSize: '12px', color: c.meta, marginTop: '6px' }}>{attribution}</div>}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
