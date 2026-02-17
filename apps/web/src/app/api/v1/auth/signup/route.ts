import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import {
  checkSignupSubdomainAvailability,
  submitSignup,
} from '@/lib/auth/signup';
import { signupSubdomainSchema } from '@/lib/auth/signup-schema';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parseResult = signupSubdomainSchema.safeParse({
    subdomain: searchParams.get('subdomain'),
    signupRequestId: searchParams.get('signupRequestId') ?? undefined,
  });

  if (!parseResult.success) {
    throw new ValidationError('Invalid subdomain lookup payload', {
      fieldErrors: parseResult.error.flatten().fieldErrors,
    });
  }

  const availability = await checkSignupSubdomainAvailability(
    parseResult.data.subdomain,
    { excludeSignupRequestId: parseResult.data.signupRequestId },
  );

  return NextResponse.json({ data: availability });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const result = await submitSignup(body);
  return NextResponse.json({ data: result }, { status: 202 });
});
