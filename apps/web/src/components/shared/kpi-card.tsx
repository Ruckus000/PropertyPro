'use client';

import Link from 'next/link';
import { KpiCard as UiKpiCard, type KpiCardProps as UiKpiCardProps } from '@propertypro/ui';

export type KpiCardProps = Omit<UiKpiCardProps, 'linkComponent'>;

/** Web binds next/link once so every existing call site keeps `href` semantics. */
export function KpiCard(props: KpiCardProps) {
  return <UiKpiCard {...props} linkComponent={Link} />;
}
