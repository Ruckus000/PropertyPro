import { Settings } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';

export default function SettingsPage() {
  return (
    <AdminLayout>
      <div className="p-6">
        <h1 className="text-xl font-semibold text-gray-900">Platform Settings</h1>
        <div className="mt-6 flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white">
          <div className="text-center">
            <Settings size={32} className="mx-auto mb-3 text-gray-400" />
            <p className="text-sm text-gray-500">
              Platform-wide settings coming in a future phase.
            </p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
