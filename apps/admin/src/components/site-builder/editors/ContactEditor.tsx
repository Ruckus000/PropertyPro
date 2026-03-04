'use client';

/**
 * Contact block editor — title, email, phone, address, showForm toggle.
 */
import type { ContactContent } from '@propertypro/shared/site-blocks';

interface ContactEditorProps {
  content: ContactContent;
  onChange: (content: ContactContent) => void;
}

export function ContactEditor({ content, onChange }: ContactEditorProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="contact-title" className="mb-1 block text-xs font-medium text-gray-700">
          Section Title
        </label>
        <input
          id="contact-title"
          type="text"
          value={content.title}
          onChange={(e) => onChange({ ...content, title: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Contact Us"
        />
      </div>

      <div>
        <label htmlFor="contact-email" className="mb-1 block text-xs font-medium text-gray-700">
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          value={content.email ?? ''}
          onChange={(e) => onChange({ ...content, email: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="office@community.com"
        />
      </div>

      <div>
        <label htmlFor="contact-phone" className="mb-1 block text-xs font-medium text-gray-700">
          Phone
        </label>
        <input
          id="contact-phone"
          type="tel"
          value={content.phone ?? ''}
          onChange={(e) => onChange({ ...content, phone: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="(305) 555-0100"
        />
      </div>

      <div>
        <label htmlFor="contact-address" className="mb-1 block text-xs font-medium text-gray-700">
          Address
        </label>
        <textarea
          id="contact-address"
          value={content.address ?? ''}
          onChange={(e) => onChange({ ...content, address: e.target.value })}
          rows={2}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="123 Ocean Drive, Miami, FL 33139"
        />
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={content.showForm}
          onChange={(e) => onChange({ ...content, showForm: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">Show contact form</span>
      </label>
    </div>
  );
}
