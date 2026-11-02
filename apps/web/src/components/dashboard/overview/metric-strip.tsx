import { KpiCard } from '@/components/shared/kpi-card';
import type { MetricTileData } from '@/lib/dashboard/quick-actions';

export function MetricStrip({ tiles }: { tiles: MetricTileData[] }) {
  if (tiles.length === 0) return null;
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((tile) => (
        <KpiCard key={tile.id} title={tile.title} value={tile.value} href={tile.href} />
      ))}
    </div>
  );
}
