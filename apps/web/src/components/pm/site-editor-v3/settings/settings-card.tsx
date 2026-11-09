/**
 * The bordered card every site setting sits in, in the editor's Pages & design
 * view and on the website overview's Settings tab. Its own module so neither
 * place loads the other's panels to get it.
 */
export function SettingsCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-[var(--radius-lg)] border border-edge bg-surface-card p-5">
      {title ? <h3 className="text-base font-semibold text-content">{title}</h3> : null}
      {children}
    </div>
  );
}
