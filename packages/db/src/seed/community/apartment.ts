/** Apartment-only operational data: leases and registry-tracked maintenance requests. */
import { and, eq } from '../../filters';
import { leases, maintenanceRequests } from '../../schema';
import { db, debugSeed } from './context';
import { lookupRegistry, upsertRegistryEntry } from './registry';

export async function seedApartmentLeases(
  communityId: number,
  unitIds: number[],
  unitNumbers: string[],
  tenantUserIds: string[],
): Promise<void> {
  if (tenantUserIds.length === 0) {
    debugSeed('no tenant users supplied for apartment lease seeding');
    return;
  }

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  function formatDate(date: Date): string {
    return date.toISOString().split('T')[0]!;
  }

  function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  function startOfMonth(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  const leaseBlueprints: Array<{
    unitNumber: string;
    rentAmount: string;
    leaseStartDays: number;
    leaseEndDays: number;
  }> = [
    { unitNumber: '101', rentAmount: '1250.00', leaseStartDays: -365, leaseEndDays: 15 },
    { unitNumber: '102', rentAmount: '1300.00', leaseStartDays: -200, leaseEndDays: 25 },
    { unitNumber: '201', rentAmount: '1275.00', leaseStartDays: -180, leaseEndDays: 45 },
    { unitNumber: '202', rentAmount: '1350.00', leaseStartDays: -150, leaseEndDays: 50 },
    { unitNumber: '301', rentAmount: '1200.00', leaseStartDays: -120, leaseEndDays: 70 },
    { unitNumber: '302', rentAmount: '1400.00', leaseStartDays: -90, leaseEndDays: 75 },
    { unitNumber: '103', rentAmount: '1325.00', leaseStartDays: -60, leaseEndDays: 90 },
    { unitNumber: '104', rentAmount: '1375.00', leaseStartDays: -45, leaseEndDays: 105 },
    { unitNumber: '105', rentAmount: '1225.00', leaseStartDays: -30, leaseEndDays: 120 },
    { unitNumber: '106', rentAmount: '1450.00', leaseStartDays: -15, leaseEndDays: 135 },
    { unitNumber: '203', rentAmount: '1500.00', leaseStartDays: -300, leaseEndDays: 150 },
    { unitNumber: '204', rentAmount: '1425.00', leaseStartDays: -250, leaseEndDays: 160 },
    { unitNumber: '205', rentAmount: '1475.00', leaseStartDays: -220, leaseEndDays: 165 },
    { unitNumber: '206', rentAmount: '1550.00', leaseStartDays: -190, leaseEndDays: 170 },
    { unitNumber: '303', rentAmount: '1600.00', leaseStartDays: -160, leaseEndDays: 180 },
  ];

  const leaseData = leaseBlueprints.map((config, index) => {
    const unitIndex = unitNumbers.indexOf(config.unitNumber);
    if (unitIndex === -1) {
      throw new Error(`Unit ${config.unitNumber} not found in seeded units`);
    }

    const unitId = unitIds[unitIndex];
    const residentId = tenantUserIds[index % tenantUserIds.length];

    if (!unitId) {
      throw new Error(`Unit ID missing for unit ${config.unitNumber} at index ${unitIndex}`);
    }
    if (!residentId) {
      throw new Error(`Tenant user ID missing for lease index ${index}`);
    }

    return {
      unitId,
      residentId,
      startDate: formatDate(startOfMonth(addDays(today, config.leaseStartDays))),
      endDate: formatDate(addDays(today, config.leaseEndDays)),
      rentAmount: config.rentAmount,
      status: 'active' as const,
    };
  });

  for (const lease of leaseData) {
    const existing = await db
      .select({ id: leases.id })
      .from(leases)
      .where(
        and(
          eq(leases.communityId, communityId),
          eq(leases.unitId, lease.unitId),
          eq(leases.residentId, lease.residentId),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(leases)
        .set({
          startDate: lease.startDate,
          endDate: lease.endDate,
          rentAmount: lease.rentAmount,
          status: lease.status,
          updatedAt: new Date(),
        })
        .where(eq(leases.id, existing[0].id));
      continue;
    }

    await db.insert(leases).values({
      communityId,
      unitId: lease.unitId,
      residentId: lease.residentId,
      startDate: lease.startDate,
      endDate: lease.endDate,
      rentAmount: lease.rentAmount,
      status: lease.status,
    });
  }

  debugSeed('apartment leases seeded');
}

export async function seedApartmentMaintenanceRequests(
  communityId: number,
  unitIds: number[],
  unitNumbers: string[],
  submitterUserIds: string[],
): Promise<void> {
  if (submitterUserIds.length === 0) {
    debugSeed('no tenant users supplied for apartment maintenance seeding');
    return;
  }

  const requestBlueprints: Array<{
    seedKey: string;
    unitNumber: string;
    title: string;
    description: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    priority: 'low' | 'normal' | 'high' | 'urgent';
  }> = [
    { seedKey: 'apt-maint-1', unitNumber: '101', title: 'Leaking faucet in kitchen', description: 'Kitchen sink faucet is dripping continuously.', status: 'open', priority: 'normal' },
    { seedKey: 'apt-maint-2', unitNumber: '102', title: 'AC not cooling properly', description: 'Air conditioner is running but not cooling the unit.', status: 'in_progress', priority: 'high' },
    { seedKey: 'apt-maint-3', unitNumber: '201', title: 'Broken window latch', description: 'Bedroom window latch is broken and will not close securely.', status: 'open', priority: 'normal' },
    { seedKey: 'apt-maint-4', unitNumber: '202', title: 'Dishwasher not draining', description: 'Dishwasher leaves standing water after each cycle.', status: 'resolved', priority: 'normal' },
    { seedKey: 'apt-maint-5', unitNumber: '301', title: 'Light fixture flickering', description: 'Living room ceiling light flickers intermittently.', status: 'in_progress', priority: 'low' },
    { seedKey: 'apt-maint-6', unitNumber: '302', title: 'Garbage disposal jammed', description: 'Garbage disposal is stuck and making a grinding noise.', status: 'open', priority: 'normal' },
    { seedKey: 'apt-maint-7', unitNumber: '103', title: 'Water heater issue', description: 'Hot water runs out very quickly during showers.', status: 'in_progress', priority: 'high' },
    { seedKey: 'apt-maint-8', unitNumber: '104', title: 'Carpet stain removal', description: 'Need professional carpet cleaning for the bedroom.', status: 'closed', priority: 'low' },
    { seedKey: 'apt-maint-9', unitNumber: '105', title: 'Door lock sticking', description: 'Front door lock is difficult to turn.', status: 'open', priority: 'normal' },
  ];

  const requestData = requestBlueprints.map((config, index) => {
    const unitIndex = unitNumbers.indexOf(config.unitNumber);
    if (unitIndex === -1) {
      throw new Error(`Unit ${config.unitNumber} not found in seeded units`);
    }

    const unitId = unitIds[unitIndex];
    const submittedById = submitterUserIds[index % submitterUserIds.length];

    if (!unitId) {
      throw new Error(`Unit ID missing for unit ${config.unitNumber} at index ${unitIndex}`);
    }
    if (!submittedById) {
      throw new Error(`Submitter user ID missing for request index ${index}`);
    }

    return {
      seedKey: config.seedKey,
      unitId,
      submittedById,
      title: config.title,
      description: config.description,
      status: config.status,
      priority: config.priority,
    };
  });

  for (const request of requestData) {
    const registryEntityId = await lookupRegistry('maintenance_request', request.seedKey, communityId);
    if (registryEntityId) {
      const id = Number(registryEntityId);
      const [updated] = await db
        .update(maintenanceRequests)
        .set({
          communityId,
          unitId: request.unitId,
          submittedById: request.submittedById,
          title: request.title,
          description: request.description,
          status: request.status,
          priority: request.priority,
          deletedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(maintenanceRequests.id, id))
        .returning({ id: maintenanceRequests.id });

      if (updated) {
        await upsertRegistryEntry('maintenance_request', request.seedKey, String(updated.id), communityId);
        continue;
      }
    }

    const existing = await db
      .select({ id: maintenanceRequests.id })
      .from(maintenanceRequests)
      .where(and(eq(maintenanceRequests.communityId, communityId), eq(maintenanceRequests.title, request.title)))
      .limit(1);

    if (existing[0]) {
      await db
        .update(maintenanceRequests)
        .set({
          unitId: request.unitId,
          submittedById: request.submittedById,
          description: request.description,
          status: request.status,
          priority: request.priority,
          deletedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(maintenanceRequests.id, existing[0].id));
      await upsertRegistryEntry('maintenance_request', request.seedKey, String(existing[0].id), communityId);
      continue;
    }

    const [created] = await db
      .insert(maintenanceRequests)
      .values({
        communityId,
        unitId: request.unitId,
        submittedById: request.submittedById,
        title: request.title,
        description: request.description,
        status: request.status,
        priority: request.priority,
      })
      .returning({ id: maintenanceRequests.id });

    await upsertRegistryEntry('maintenance_request', request.seedKey, String(created!.id), communityId);
  }

  debugSeed('apartment maintenance requests seeded');
}
