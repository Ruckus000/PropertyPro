'use client';

/**
 * Contact block editor — board email, management company, phone, address.
 */
import type { ContactBlockContent } from '@propertypro/shared/site-blocks';

interface ContactEditorProps {
  content: ContactBlockContent;
  onChange: (content: ContactBlockContent) => void;
}

export function ContactEditor({ content, onChange }: ContactEditorProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="contact-email" className="mb-1 block text-xs font-medium text-gray-700">
          Board Email
        </label>
        <input
          id="contact-email"
          type="email"
          value={content.boardEmail}
          onChange={(e) => onChange({ ...content, boardEmail: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="board@community.com"
        />
      </div>

      <div>
        <label htmlFor="contact-mgmt" className="mb-1 block text-xs font-medium text-gray-700">
          Management Company (optional)
        </label>
        <input
          id="contact-mgmt"
          type="text"
          value={content.managementCompany ?? ''}
          onChange={(e) => onChange({ ...content, managementCompany: e.target.value || undefined })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="ABC Property Management"
        />
      </div>

      <div>
        <label htmlFor="contact-phone" className="mb-1 block text-xs font-medium text-gray-700">
          Phone (optional)
        </label>
        <input
          id="contact-phone"
          type="tel"
          value={content.phone ?? ''}
          onChange={(e) => onChange({ ...content, phone: e.target.value || undefined })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="(305) 555-0100"
        />
      </div>

      <div>
        <label htmlFor="contact-address" className="mb-1 block text-xs font-medium text-gray-700">
          Address (optional)
        </label>
        <textarea
          id="contact-address"
          value={content.address ?? ''}
          onChange={(e) => onChange({ ...content, address: e.target.value || undefined })}
          rows={2}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="123 Ocean Drive, Miami, FL 33139"
        />
      </div>
    </div>
  );
}
