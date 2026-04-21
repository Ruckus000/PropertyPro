import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';

export function Target() {
  return (
    <PageHeader breadcrumb={<Breadcrumbs currentLabel="Test" />} title="Test" />
  );
}
