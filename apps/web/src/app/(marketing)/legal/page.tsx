import { redirect } from 'next/navigation';

/** There is no legal index; the layout's footer links the other documents. */
export default function LegalIndexPage() {
  redirect('/legal/terms');
}
