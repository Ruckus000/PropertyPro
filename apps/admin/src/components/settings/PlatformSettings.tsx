'use client';

import { useState } from 'react';
import {
  Building2,
  MonitorPlay,
  Shield,
  Plus,
  Trash2,
  Loader2,
  X,
} from 'lucide-react';

interface PlatformAdmin {
  userId: string;
  email: string;
  role: string;
  invitedBy: string | null;
  createdAt: string;
}

interface PlatformStats {
  communityCount: number;
  demoCount: number;
}

interface PlatformSettingsProps {
  currentAdmin: { id: string; email: string; role: string };
  admins: PlatformAdmin[];
  stats: PlatformStats;
}

export function PlatformSettings({ currentAdmin, admins: initialAdmins, stats }: PlatformSettingsProps) {
  const [admins, setAdmins] = useState(initialAdmins);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);

    try {
      const res = await fetch('/api/admin/platform-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAddError(data.error?.message ?? 'Failed to add admin');
        return;
      }

      setAdmins((prev) => [...prev, data.admin]);
      setAddEmail('');
      setShowAddForm(false);
    } catch {
      setAddError('Network error');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemove(userId: string) {
    setRemoveLoading(true);
    try {
      const res = await fetch(`/api/admin/platform-admins/${userId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setAdmins((prev) => prev.filter((a) => a.userId !== userId));
      }
    } finally {
      setRemoveLoading(false);
      setRemoveId(null);
    }
  }

  const statCards = [
    { label: 'Communities', value: stats.communityCount, icon: Building2, color: 'text-blue-600' },
    { label: 'Demo Instances', value: stats.demoCount, icon: MonitorPlay, color: 'text-violet-600' },
    { label: 'Platform Admins', value: admins.length, icon: Shield, color: 'text-emerald-600' },
  ];

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">Platform Settings</h1>

      {/* Stats */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Platform Overview
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {statCards.map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-e1"
            >
              <div className={`rounded-lg bg-gray-50 p-2.5 ${color}`}>
                <Icon size={20} />
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-900">{value}</p>
                <p className="text-sm text-gray-500">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Admin Management */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Platform Administrators
          </h2>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} />
              Add Admin
            </button>
          )}
        </div>

        {/* Add form */}
        {showAddForm && (
          <form onSubmit={handleAdd} className="mb-4 flex items-start gap-3">
            <div className="flex-1">
              <input
                type="email"
                placeholder="Email address"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {addError && (
                <p className="mt-1 text-xs text-red-600">{addError}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={addLoading}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {addLoading && <Loader2 size={14} className="animate-spin" />}
              Add
            </button>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setAddError(''); setAddEmail(''); }}
              className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X size={16} />
            </button>
          </form>
        )}

        {/* Admin table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-e1">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Added
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {admins.map((admin) => {
                const isSelf = admin.userId === currentAdmin.id;
                return (
                  <tr
                    key={admin.userId}
                    className={isSelf ? 'bg-blue-50/50' : 'hover:bg-gray-50'}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {admin.email}
                      {isSelf && (
                        <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                          you
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 capitalize">
                      {admin.role.replace('_', ' ')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {new Date(admin.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {isSelf ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : removeId === admin.userId ? (
                        <div className="inline-flex items-center gap-2">
                          <span className="text-xs text-gray-500">Remove?</span>
                          <button
                            onClick={() => handleRemove(admin.userId)}
                            disabled={removeLoading}
                            className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            {removeLoading ? 'Removing…' : 'Yes'}
                          </button>
                          <button
                            onClick={() => setRemoveId(null)}
                            className="text-xs font-medium text-gray-500 hover:text-gray-700"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRemoveId(admin.userId)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={12} />
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
