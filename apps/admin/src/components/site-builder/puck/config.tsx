'use client';

/**
 * Puck editor configuration — defines the 7 block types with their fields
 * and client-side preview render functions.
 *
 * Component keys match DB `block_type` values exactly so the translation
 * layer doesn't need any type-name mapping.
 */
import type { Config } from '@puckeditor/core';
import {
  Bell,
  FileText,
  Calendar,
  Phone,
  Type,
  ImageIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Component prop types (match shared/site-blocks content interfaces)
// ---------------------------------------------------------------------------

interface HeroProps {
  headline: string;
  subheadline: string;
  backgroundImageUrl: string;
  ctaLabel: string;
  ctaHref: string;
}

interface AnnouncementsProps {
  title: string;
  limit: number;
}

interface DocumentsProps {
  title: string;
  categoryIds: number[];
}

interface MeetingsProps {
  title: string;
}

interface ContactProps {
  boardEmail: string;
  managementCompany: string;
  phone: string;
  address: string;
}

interface TextProps {
  body: string;
  format: 'plain' | 'markdown';
}

interface ImageProps {
  url: string;
  alt: string;
  caption: string;
}

// ---------------------------------------------------------------------------
// Config type
// ---------------------------------------------------------------------------

type PuckComponents = {
  hero: HeroProps;
  announcements: AnnouncementsProps;
  documents: DocumentsProps;
  meetings: MeetingsProps;
  contact: ContactProps;
  text: TextProps;
  image: ImageProps;
};

// ---------------------------------------------------------------------------
// Puck config
// ---------------------------------------------------------------------------

export const puckConfig: Config<PuckComponents> = {
  categories: {
    layout: {
      title: 'Layout',
      components: ['hero'],
      defaultExpanded: true,
    },
    content: {
      title: 'Content',
      components: ['text', 'image'],
      defaultExpanded: true,
    },
    dynamic: {
      title: 'Dynamic',
      components: ['announcements', 'documents', 'meetings'],
      defaultExpanded: true,
    },
    info: {
      title: 'Information',
      components: ['contact'],
      defaultExpanded: true,
    },
  },

  components: {
    // ----- Hero Banner -----
    hero: {
      label: 'Hero Banner',
      defaultProps: {
        headline: '',
        subheadline: '',
        backgroundImageUrl: '',
        ctaLabel: '',
        ctaHref: '',
      },
      fields: {
        headline: { type: 'text', label: 'Headline' },
        subheadline: { type: 'textarea', label: 'Subheadline' },
        backgroundImageUrl: { type: 'text', label: 'Background Image URL' },
        ctaLabel: { type: 'text', label: 'Button Label' },
        ctaHref: { type: 'text', label: 'Button URL' },
      },
      render: ({ headline, subheadline, backgroundImageUrl, ctaLabel, ctaHref, puck }) => (
        <div
          ref={puck.dragRef}
          className="relative flex min-h-[240px] flex-col items-center justify-center p-8 text-center text-white"
          style={{
            backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: backgroundImageUrl ? undefined : '#1e3a5f',
          }}
        >
          {/* Overlay for readability */}
          {backgroundImageUrl && (
            <div className="absolute inset-0 bg-black/40" />
          )}
          <div className="relative z-10">
            <h1 className="text-3xl font-bold">
              {headline || <span className="opacity-50">Headline</span>}
            </h1>
            {subheadline && (
              <p className="mt-2 text-lg opacity-90">{subheadline}</p>
            )}
            {ctaLabel && (
              <span className="mt-4 inline-block rounded-md bg-white px-6 py-2 text-sm font-semibold text-blue-700">
                {ctaLabel}
              </span>
            )}
          </div>
        </div>
      ),
    },

    // ----- Announcements (dynamic — mock preview) -----
    announcements: {
      label: 'Announcements',
      defaultProps: {
        title: 'Announcements',
        limit: 5,
      },
      fields: {
        title: { type: 'text', label: 'Section Title' },
        limit: { type: 'number', label: 'Number of Items (1-10)', min: 1, max: 10 },
      },
      render: ({ title, limit, puck }) => (
        <div ref={puck.dragRef} className="p-6">
          <div className="mb-1 flex items-center gap-2 text-gray-400">
            <Bell size={14} />
            <span className="text-[10px] font-medium uppercase tracking-wider">Dynamic</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">{title || 'Announcements'}</h2>
          <div className="mt-4 space-y-3">
            {Array.from({ length: Math.min(limit || 3, 3) }).map((_, i) => (
              <div key={i} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="h-3 w-3/4 rounded bg-gray-200" />
                <div className="mt-2 h-2 w-1/2 rounded bg-gray-100" />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Showing up to {limit} live announcements from your community
          </p>
        </div>
      ),
    },

    // ----- Documents (dynamic — mock preview) -----
    documents: {
      label: 'Documents',
      defaultProps: {
        title: 'Documents',
        categoryIds: [],
      },
      fields: {
        title: { type: 'text', label: 'Section Title' },
        categoryIds: {
          type: 'custom',
          label: 'Category IDs (comma-separated)',
          render: ({ value, onChange, field }) => (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {field.label}
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                value={Array.isArray(value) ? value.join(', ') : ''}
                onChange={(e) => {
                  const ids = e.target.value
                    .split(',')
                    .map((s) => parseInt(s.trim(), 10))
                    .filter((n) => !isNaN(n));
                  onChange(ids);
                }}
                placeholder="Leave empty for all categories"
              />
            </div>
          ),
        },
      },
      render: ({ title, puck }) => (
        <div ref={puck.dragRef} className="p-6">
          <div className="mb-1 flex items-center gap-2 text-gray-400">
            <FileText size={14} />
            <span className="text-[10px] font-medium uppercase tracking-wider">Dynamic</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">{title || 'Documents'}</h2>
          <div className="mt-4 space-y-2">
            {['Budget Report 2026.pdf', 'Meeting Minutes.pdf', 'Bylaws.pdf'].map((name) => (
              <div key={name} className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                <FileText size={14} className="text-gray-400" />
                <span className="text-sm text-gray-600">{name}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Live documents from your community portal
          </p>
        </div>
      ),
    },

    // ----- Meetings (dynamic — mock preview) -----
    meetings: {
      label: 'Meetings',
      defaultProps: {
        title: 'Upcoming Meetings',
      },
      fields: {
        title: { type: 'text', label: 'Section Title' },
      },
      render: ({ title, puck }) => (
        <div ref={puck.dragRef} className="p-6">
          <div className="mb-1 flex items-center gap-2 text-gray-400">
            <Calendar size={14} />
            <span className="text-[10px] font-medium uppercase tracking-wider">Dynamic</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">{title || 'Upcoming Meetings'}</h2>
          <div className="mt-4 space-y-3">
            {[
              { name: 'Board Meeting', date: 'Mar 15, 2026' },
              { name: 'Annual Meeting', date: 'Apr 1, 2026' },
            ].map((mtg) => (
              <div key={mtg.name} className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 p-3">
                <span className="text-sm font-medium text-gray-700">{mtg.name}</span>
                <span className="text-xs text-gray-500">{mtg.date}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Live meeting schedule from your community
          </p>
        </div>
      ),
    },

    // ----- Contact Info -----
    contact: {
      label: 'Contact Info',
      defaultProps: {
        boardEmail: '',
        managementCompany: '',
        phone: '',
        address: '',
      },
      fields: {
        boardEmail: { type: 'text', label: 'Board Email' },
        managementCompany: { type: 'text', label: 'Management Company' },
        phone: { type: 'text', label: 'Phone' },
        address: { type: 'textarea', label: 'Address' },
      },
      render: ({ boardEmail, managementCompany, phone, address, puck }) => (
        <div ref={puck.dragRef} className="p-6">
          <div className="mb-1 flex items-center gap-2 text-gray-400">
            <Phone size={14} />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Contact Information</h2>
          <div className="mt-4 space-y-2 text-sm text-gray-600">
            {boardEmail && (
              <p><span className="font-medium text-gray-700">Email:</span> {boardEmail}</p>
            )}
            {managementCompany && (
              <p><span className="font-medium text-gray-700">Management:</span> {managementCompany}</p>
            )}
            {phone && (
              <p><span className="font-medium text-gray-700">Phone:</span> {phone}</p>
            )}
            {address && (
              <p><span className="font-medium text-gray-700">Address:</span> {address}</p>
            )}
            {!boardEmail && !managementCompany && !phone && !address && (
              <p className="text-gray-400 italic">Add contact information above</p>
            )}
          </div>
        </div>
      ),
    },

    // ----- Text -----
    text: {
      label: 'Text',
      defaultProps: {
        body: '',
        format: 'plain',
      },
      fields: {
        body: { type: 'textarea', label: 'Body Text' },
        format: {
          type: 'radio',
          label: 'Format',
          options: [
            { label: 'Plain Text', value: 'plain' },
            { label: 'Markdown', value: 'markdown' },
          ],
        },
      },
      render: ({ body, puck }) => (
        <div ref={puck.dragRef} className="p-6">
          <div className="mb-1 flex items-center gap-2 text-gray-400">
            <Type size={14} />
          </div>
          <div className="prose prose-sm max-w-none text-gray-700">
            {body ? (
              <p className="whitespace-pre-wrap">{body}</p>
            ) : (
              <p className="text-gray-400 italic">Enter text content above</p>
            )}
          </div>
        </div>
      ),
    },

    // ----- Image -----
    image: {
      label: 'Image',
      defaultProps: {
        url: '',
        alt: '',
        caption: '',
      },
      fields: {
        url: { type: 'text', label: 'Image URL' },
        alt: { type: 'text', label: 'Alt Text' },
        caption: { type: 'text', label: 'Caption' },
      },
      render: ({ url, alt, caption, puck }) => (
        <div ref={puck.dragRef} className="p-6">
          {url ? (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={alt || 'Image'}
                className="w-full rounded-md object-cover"
                style={{ maxHeight: 400 }}
              />
              {caption && (
                <figcaption className="mt-2 text-center text-sm text-gray-500">
                  {caption}
                </figcaption>
              )}
            </figure>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-md border-2 border-dashed border-gray-300 bg-gray-50">
              <div className="text-center">
                <ImageIcon size={32} className="mx-auto text-gray-300" />
                <p className="mt-2 text-sm text-gray-400">Enter an image URL above</p>
              </div>
            </div>
          )}
        </div>
      ),
    },
  },
};
