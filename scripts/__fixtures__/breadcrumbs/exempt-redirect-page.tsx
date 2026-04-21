// breadcrumbs:exempt — redirect-only page
import { redirect } from 'next/navigation';
export default function Page() {
  redirect('/somewhere');
}
