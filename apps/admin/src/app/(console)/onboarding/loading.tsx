import { AdminPageLoading } from '@/components/loading/AdminPageLoading';

/**
 * The pipeline runs six reads — four in parallel, then two more once the trial
 * ids are known — so this boundary is not decorative. The route is
 * `force-dynamic`, which is what makes the Suspense boundary real rather than a
 * file that never renders.
 */
export default function OnboardingLoading() {
  return <AdminPageLoading label="Loading the onboarding pipeline" />;
}
