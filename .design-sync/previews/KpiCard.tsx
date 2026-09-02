import { KpiCard } from '@propertypro/design-system';
import {
  ShieldCheck,
  AlertTriangle,
  Wallet,
  Users,
  FileText,
  Wrench,
} from 'lucide-react';

export const DashboardRow = () => (
  <div className="grid w-full grid-cols-2 gap-4 lg:grid-cols-4">
    <KpiCard title="Compliance score" value="94%" delta={4} trend="up" icon={ShieldCheck} />
    <KpiCard title="Open violations" value={7} delta={12} trend="up" invertTrend icon={AlertTriangle} />
    <KpiCard title="Delinquent balance" value="$48,230" delta={9} trend="down" invertTrend icon={Wallet} />
    <KpiCard title="Portal adoption" value="68%" delta={3} trend="down" icon={Users} />
  </div>
);

export const TrendDirections = () => (
  <div className="grid w-full grid-cols-2 gap-4 lg:grid-cols-4">
    <KpiCard title="Documents posted (30d)" value={18} delta={22} trend="up" icon={FileText} />
    <KpiCard title="Work orders closed" value={31} delta={7} trend="down" icon={Wrench} />
    <KpiCard title="Units on file" value={148} delta={0} trend="neutral" icon={Users} />
    <KpiCard title="Reserve balance" value="$1.24M" icon={Wallet} />
  </div>
);

export const LoadingRow = () => (
  <div className="grid w-full grid-cols-2 gap-4 lg:grid-cols-4">
    <KpiCard title="Compliance score" value="—" isLoading />
    <KpiCard title="Open violations" value="—" isLoading />
    <KpiCard title="Delinquent balance" value="—" isLoading />
    <KpiCard title="Portal adoption" value="—" isLoading />
  </div>
);
