import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';

export default function Page() {
  return (
    <PageHeader
      title="Test"
      breadcrumb={<Breadcrumbs items={[]} currentLabel="Test" />}
    />
  );
}
