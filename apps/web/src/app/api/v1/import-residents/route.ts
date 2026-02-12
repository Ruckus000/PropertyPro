import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  communities,
  createScopedClient,
  logAuditEvent,
  notificationPreferences,
  units,
  userRoles,
  users,
} from "@propertypro/db";
import { withErrorHandler } from "@/lib/api/error-handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { formatZodErrors } from "@/lib/api/zod/error-formatter";
import { validateResidentCsv } from "@/lib/utils/csv-validator";
import { validateRoleAssignment } from "@/lib/utils/role-validator";
import type { CommunityRole, CommunityType } from "@propertypro/shared";
import { requireAuthenticatedUserId } from "@/lib/api/auth";
import { requireCommunityMembership } from "@/lib/api/community-membership";

const importSchema = z.object({
  communityId: z.number().int().positive(),
  csv: z.string().min(1, "CSV text is required"),
  dryRun: z.boolean().optional().default(false),
});

async function getCommunityType(communityId: number): Promise<CommunityType> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(communities);
  const community = rows.find((row) => row["id"] === communityId);

  if (!community) {
    throw new NotFoundError(`Community ${communityId} not found`);
  }

  return community["communityType"] as CommunityType;
}

function getInsertedStringId(row: Record<string, unknown> | undefined): string | null {
  const id = row?.["id"];
  return typeof id === "string" ? id : null;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();

  const body: unknown = await req.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Invalid import request", { fields: formatZodErrors(parsed.error) });
  }

  const { communityId, csv, dryRun } = parsed.data;
  await requireCommunityMembership(communityId, actorUserId);
  const scoped = createScopedClient(communityId);

  // Parse and validate CSV
  const parsedCsv = validateResidentCsv(csv);
  const invalidCsvRowNumbers = new Set<number>(parsedCsv.errors.map((e) => e.rowNumber));

  // If dryRun, just return preview + errors
  if (dryRun) {
    return NextResponse.json({
      data: {
        preview: parsedCsv.rows.map((r) => r.data),
        errors: parsedCsv.errors,
        header: parsedCsv.header,
      },
    });
  }

  // Proceed with import
  const communityType = await getCommunityType(communityId);
  const unitRows = await scoped.query(units);
  const unitByNumber = new Map<string, number>();
  for (const row of unitRows) {
    const number = (row["unitNumber"] as string | undefined)?.toLowerCase();
    if (number) {
      unitByNumber.set(number, row["id"] as number);
    }
  }

  const allUserRows = await scoped.query(users);
  const userByEmail = new Map<string, string>();
  for (const row of allUserRows) {
    const email = (row["email"] as string | undefined)?.toLowerCase();
    const id = row["id"];
    if (email && typeof id === "string") {
      userByEmail.set(email, id);
    }
  }

  const existingRoles = await scoped.query(userRoles);
  const userHasRole = new Set<string>();
  for (const existingRole of existingRoles) {
    const id = existingRole["userId"];
    if (typeof id === "string") userHasRole.add(id);
  }

  const errors = [...parsedCsv.errors];
  const createdUsers: Array<{ userId: string; email: string; role: CommunityRole }> = [];
  let importedCount = 0;
  let skippedCount = invalidCsvRowNumbers.size; // rows with parse-level errors already skipped

  for (const row of parsedCsv.rows) {
    const { name, email, role, unit_number } = row.data;

    // Resolve unitId if provided
    let unitId: number | null = null;
    if (unit_number) {
      const found = unitByNumber.get(unit_number.toLowerCase());
      if (!found) {
        errors.push({ rowNumber: row.rowNumber, column: "unit_number", message: `Unit '${unit_number}' not found` });
        skippedCount++;
        continue;
      }
      unitId = found;
    }

    // Validate role assignment vs community type & unit requirement
    const validation = validateRoleAssignment(role, communityType, unitId);
    if (!validation.valid) {
      errors.push({ rowNumber: row.rowNumber, column: "role", message: validation.error ?? "Invalid role assignment" });
      skippedCount++;
      continue;
    }

    // Find or create user
    let userId = userByEmail.get(email);
    if (!userId) {
      const newUserId = crypto.randomUUID();
      const insertedUsers = await scoped.insert(users, {
        id: newUserId,
        email,
        fullName: name,
        phone: null,
      });

      const insertedUserId = getInsertedStringId(insertedUsers[0]);
      if (!insertedUserId) {
        errors.push({ rowNumber: row.rowNumber, column: "email", message: `Failed to create user for '${email}'` });
        skippedCount++;
        continue;
      }

      userId = insertedUserId;
      userByEmail.set(email, insertedUserId);
    }

    // Skip if user already has a role in this community
    if (userHasRole.has(userId)) {
      errors.push({
        rowNumber: row.rowNumber,
        column: "email",
        message: `User with email '${email}' already has a role in this community`,
      });
      skippedCount++;
      continue;
    }

    await scoped.insert(userRoles, {
      userId,
      role,
      unitId,
    });

    await scoped.insert(notificationPreferences, { userId });

    userHasRole.add(userId);
    importedCount++;
    createdUsers.push({ userId, email, role });
  }

  // Audit log one event per created user with bulkCount metadata
  for (const cu of createdUsers) {
    await logAuditEvent({
      userId: actorUserId,
      action: "user_invited",
      resourceType: "resident",
      resourceId: cu.userId,
      communityId,
      newValues: { email: cu.email, role: cu.role },
      metadata: { bulkCount: createdUsers.length },
    });
  }

  return NextResponse.json({
    data: {
      importedCount,
      skippedCount,
      errors,
    },
  });
});
