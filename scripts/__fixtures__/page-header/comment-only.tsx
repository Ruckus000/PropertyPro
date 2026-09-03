/**
 * This docblock mentions the page <h1> that PageHeader renders, and must not
 * count: a guard that trips on prose would fail every well-commented file.
 */
import { PageHeader } from '@/components/shared/page-header';

// Line comment: the old markup was <h1 className="text-2xl">Documents</h1>.
export default function CommentOnlyPage() {
  return (
    <div>
      {/* JSX comment: <h1>Documents</h1> used to live here. */}
      <PageHeader title="Documents" />
    </div>
  );
}
