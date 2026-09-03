import { PageHeader } from '@/components/shared/page-header';

export default function CleanPage() {
  return (
    <div>
      <PageHeader title="Units" actions={<button type="button">Add Unit</button>} />
      <h2>Occupied</h2>
    </div>
  );
}
