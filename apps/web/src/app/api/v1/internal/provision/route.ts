/**
 * Internal provisioning retry endpoint — P2-35
 *
 * POST /api/v1/internal/provision
 *
 * Triggers (or resumes) the provisioning state machine for a given
 * signupRequestId. Intended for platform admin use when automated
 * provisioning fails and manual retry is needed.
 *
 * Auth: Bearer token matching PROVISIONING_RETRY_SECRET env var.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireCronSecret } from '@/lib/api/cron-auth';
import {
  findProvisioningJobBySignupRequestId,
  getProvisioningJobSummaryById,
  runProvisioning,
} from '@/lib/services/provisioning-service';
import { z } from 'zod';

const bodySchema = z.object({
  signupRequestId: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.PROVISIONING_RETRY_SECRET, process.env.CRON_SECRET);

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    throw new ValidationError('signupRequestId is required');
  }

  const { signupRequestId } = parsed.data;

  const job = await findProvisioningJobBySignupRequestId(signupRequestId);

  if (!job) {
    return NextResponse.json(
      { error: 'No provisioning job found for signupRequestId' },
      { status: 404 },
    );
  }

  await runProvisioning(job.id);

  // Return the refreshed job status after run.
  const updated = await getProvisioningJobSummaryById(job.id);

  return NextResponse.json({ data: updated });
});
