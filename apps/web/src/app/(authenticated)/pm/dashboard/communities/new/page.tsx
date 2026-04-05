import { redirect } from 'next/navigation';

/**
 * The standalone Add Community wizard has been replaced by the
 * AddCommunityModal on the PM dashboard. Redirect to preserve old links.
 */
export default function AddCommunityPage() {
  redirect('/pm/dashboard/communities');
}
