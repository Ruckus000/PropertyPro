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
import { eq } from '@propertypro/db/filters';
import { provisioningJobs } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { runProvisioning } from '@/lib/services/provisioning-service';
import { z } from 'zod';

const bodySchema = z.object({
  signupRequestId: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.PROVISIONING_RETRY_SECRET);

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    throw new ValidationError('signupRequestId is required');
  }

  const { signupRequestId } = parsed.data;

  const db = createUnscopedClient();
  const [job] = await db
    .select({
      id: provisioningJobs.id,
      status: provisioningJobs.status,
      lastSuccessfulStatus: provisioningJobs.lastSuccessfulStatus,
      retryCount: provisioningJobs.retryCount,
    })
    .from(provisioningJobs)
    .where(eq(provisioningJobs.signupRequestId, signupRequestId))
    .limit(1);

  if (!job) {
    return NextResponse.json(
      { error: 'No provisioning job found for signupRequestId' },
      { status: 404 },
    );
  }

  await runProvisioning(job.id);

  // Return the refreshed job status after run.
  const [updated] = await db
    .select({
      id: provisioningJobs.id,
      status: provisioningJobs.status,
      lastSuccessfulStatus: provisioningJobs.lastSuccessfulStatus,
      retryCount: provisioningJobs.retryCount,
    })
    .from(provisioningJobs)
    .where(eq(provisioningJobs.id, job.id))
    .limit(1);

  return NextResponse.json({ data: updated });
});
