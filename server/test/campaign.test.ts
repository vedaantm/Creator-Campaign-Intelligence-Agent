import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import {
  CreateCampaignInputSchema,
  UpdateCampaignInputSchema,
  CampaignQuerySchema,
  CampaignExportSchema,
  CampaignSchema,
  UserSchema,
  JobSchema,
  ActivityEntrySchema,
  ALLOWED_STATUS_TRANSITIONS,
  CampaignStatus,
  CampaignBriefSchema,
  PutBriefInputSchema,
  PatchBriefInputSchema,
  SAMPLE_BRIEF,
  isBriefComplete,
} from '../../shared/types.ts';
import {
  InMemoryCampaignRepository,
  InMemoryJobRepository,
} from '../repositories/InMemoryRepository.ts';
import { resetRepositoriesForTesting, getRepositories } from '../repositories/index.ts';
import { AppError } from '../errors/AppError.ts';
import { createApiApp } from '../apiPlugin.ts';
import { JobRunner } from '../jobs/runner.ts';
import { errorHandler } from '../middleware/error.ts';
import express, { Request, Response, NextFunction } from 'express';
import { ZodError, z } from 'zod';

// ============================================================================
// 1. Zod Schemas Test Suite
// ============================================================================
describe('1. Zod Schemas Suite', () => {
  describe('CreateCampaignInputSchema', () => {
    it('rejects names under 3 characters', () => {
      expect(() => CreateCampaignInputSchema.parse({ name: 'ab' })).toThrow();
      expect(() => CreateCampaignInputSchema.parse({ name: '' })).toThrow();
      expect(() => CreateCampaignInputSchema.parse({ name: '  ' })).toThrow();
    });

    it('rejects names over 80 characters', () => {
      expect(() => CreateCampaignInputSchema.parse({ name: 'x'.repeat(81) })).toThrow();
    });

    it('accepts names within 3 to 80 characters and trims whitespace', () => {
      const parsed = CreateCampaignInputSchema.parse({ name: '  Launch 2026 Product  ' });
      expect(parsed.name).toBe('Launch 2026 Product');
      expect(CreateCampaignInputSchema.parse({ name: 'abc' }).name).toBe('abc');
      expect(CreateCampaignInputSchema.parse({ name: 'x'.repeat(80) }).name).toBe('x'.repeat(80));
    });

    it('rejects missing or non-string name', () => {
      expect(() => CreateCampaignInputSchema.parse({})).toThrow();
      expect(() => CreateCampaignInputSchema.parse({ name: 123 })).toThrow();
    });
  });

  describe('UpdateCampaignInputSchema', () => {
    it('requires a non-negative integer version', () => {
      expect(() => UpdateCampaignInputSchema.parse({ name: 'Valid' })).toThrow();
      expect(() => UpdateCampaignInputSchema.parse({ name: 'Valid', version: -1 })).toThrow();
      expect(() => UpdateCampaignInputSchema.parse({ name: 'Valid', version: 1.5 })).toThrow();
      expect(UpdateCampaignInputSchema.parse({ version: 0 }).version).toBe(0);
      expect(UpdateCampaignInputSchema.parse({ version: 2 }).version).toBe(2);
    });

    it('validates optional fields (name, status, memberEmails)', () => {
      const valid = UpdateCampaignInputSchema.parse({
        name: 'Updated Name',
        status: 'active',
        memberEmails: ['team@example.com'],
        version: 1,
      });
      expect(valid.name).toBe('Updated Name');
      expect(valid.status).toBe('active');
      expect(valid.memberEmails).toEqual(['team@example.com']);

      // Invalid status
      expect(() =>
        UpdateCampaignInputSchema.parse({
          status: 'invalid_status',
          version: 1,
        })
      ).toThrow();

      // Invalid email
      expect(() =>
        UpdateCampaignInputSchema.parse({
          memberEmails: ['not-an-email'],
          version: 1,
        })
      ).toThrow();
    });
  });

  describe('CampaignQuerySchema', () => {
    it('applies default pagination and sort order', () => {
      const parsed = CampaignQuerySchema.parse({});
      expect(parsed.sort).toBe('updatedAt');
      expect(parsed.order).toBe('desc');
      expect(parsed.limit).toBe(12);
    });

    it('validates allowed sort fields and orders', () => {
      const parsed = CampaignQuerySchema.parse({
        sort: 'name',
        order: 'asc',
        limit: '15',
        search: 'Tech',
        status: 'draft',
      });
      expect(parsed.sort).toBe('name');
      expect(parsed.order).toBe('asc');
      expect(parsed.limit).toBe(15);
      expect(parsed.search).toBe('Tech');
      expect(parsed.status).toBe('draft');
    });

    it('rejects negative or excessive limit', () => {
      expect(() => CampaignQuerySchema.parse({ limit: 0 })).toThrow();
      expect(() => CampaignQuerySchema.parse({ limit: 200 })).toThrow();
    });
  });

  describe('CampaignExportSchema', () => {
    const validPayload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      campaign: {
        name: 'Export Test',
        brief: { target: 'Gen Z' },
        settings: { budget: 10000 },
        guidelines: [],
        creators: [],
      },
    };

    it('accepts valid schemaVersion 1 export payload', () => {
      const parsed = CampaignExportSchema.parse(validPayload);
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.campaign.name).toBe('Export Test');
    });

    it('rejects unsupported schemaVersion', () => {
      expect(() =>
        CampaignExportSchema.parse({
          ...validPayload,
          schemaVersion: 2,
        })
      ).toThrow();
      expect(() =>
        CampaignExportSchema.parse({
          ...validPayload,
          schemaVersion: 0,
        })
      ).toThrow();
    });

    it('rejects missing or malformed campaign object', () => {
      expect(() => CampaignExportSchema.parse({ schemaVersion: 1, exportedAt: '2026-01-01' })).toThrow();
      expect(() =>
        CampaignExportSchema.parse({
          schemaVersion: 1,
          exportedAt: '2026-01-01',
          campaign: { name: 'ab' }, // name too short (<3)
        })
      ).toThrow();
    });
  });

  describe('Domain Schemas (UserSchema, JobSchema, ActivityEntrySchema, CampaignSchema)', () => {
    it('validates UserSchema properly', () => {
      expect(() =>
        UserSchema.parse({
          uid: 'u_1',
          email: 'invalid-email',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        })
      ).toThrow();

      const valid = UserSchema.parse({
        uid: 'u_1',
        email: 'user@example.com',
        displayName: 'Alice',
        photoURL: 'https://example.com/photo.jpg',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      });
      expect(valid.email).toBe('user@example.com');
    });

    it('validates JobSchema properly', () => {
      const valid = JobSchema.parse({
        id: 'job_123',
        campaignId: 'cmp_123',
        ownerId: 'u_1',
        type: 'SEARCH_CREATORS',
        status: 'running',
        progress: { done: 10, total: 100, message: 'Processing...' },
        cancelRequested: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(valid.status).toBe('running');
    });

    it('validates ActivityEntrySchema properly', () => {
      const valid = ActivityEntrySchema.parse({
        id: 'act_1',
        campaignId: 'cmp_1',
        actorEmail: 'admin@example.com',
        action: 'CAMPAIGN_CREATED',
        entityType: 'campaign',
        entityId: 'cmp_1',
        summary: 'Created campaign',
        at: new Date().toISOString(),
      });
      expect(valid.action).toBe('CAMPAIGN_CREATED');
    });

    it('validates CampaignSchema defaults and constraints', () => {
      const valid = CampaignSchema.parse({
        id: 'cmp_1',
        ownerId: 'u_1',
        ownerEmail: 'u1@example.com',
        name: 'Valid Campaign',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(valid.status).toBe('draft');
      expect(valid.version).toBe(1);
      expect(valid.memberEmails).toEqual([]);
      expect(valid.deletedAt).toBeNull();
    });
  });
});

// ============================================================================
// 2. InMemoryRepository Suite
// ============================================================================
describe('2. InMemoryRepository Operations Suite', () => {
  let repo: InMemoryCampaignRepository;

  beforeEach(() => {
    repo = new InMemoryCampaignRepository();
  });

  it('create and getById', async () => {
    const created = await repo.create({
      ownerId: 'u_1',
      ownerEmail: 'u1@example.com',
      memberEmails: ['team@example.com'],
      name: 'Spring Launch',
      status: 'draft',
      brief: { prod: 'Earbuds' },
      settings: { budget: 10000 },
      approvedLineup: [],
    });

    expect(created.id).toMatch(/^cmp_/);
    expect(created.version).toBe(1);
    expect(created.deletedAt).toBeNull();

    const fetched = await repo.getById(created.id);
    expect(fetched).toEqual(created);

    const nonExistent = await repo.getById('cmp_nonexistent');
    expect(nonExistent).toBeNull();
  });

  it('list with status filter, search filter, sorting, and pagination', async () => {
    const now = Date.now();
    // Seed 5 campaigns
    for (let i = 1; i <= 5; i++) {
      await repo.create({
        ownerId: 'u_1',
        ownerEmail: 'u1@example.com',
        memberEmails: [],
        name: `Campaign ${i < 3 ? 'Alpha' : 'Beta'} ${i}`,
        status: i % 2 === 0 ? 'active' : 'draft',
        brief: {},
        settings: {},
        approvedLineup: [],
      });
    }

    // List all
    const all = await repo.list({}, 'u1@example.com', 'u_1');
    expect(all.total).toBe(5);
    expect(all.items.length).toBe(5);

    // Filter by status=active
    const activeOnly = await repo.list({ status: 'active' }, 'u1@example.com', 'u_1');
    expect(activeOnly.items.every((c) => c.status === 'active')).toBe(true);
    expect(activeOnly.total).toBe(2);

    // Filter by search='Alpha'
    const searchAlpha = await repo.list({ search: 'Alpha' }, 'u1@example.com', 'u_1');
    expect(searchAlpha.items.length).toBe(2);
    expect(searchAlpha.items.every((c) => c.name.includes('Alpha'))).toBe(true);

    // Sort by name ascending
    const sortNameAsc = await repo.list({ sort: 'name', order: 'asc' }, 'u1@example.com', 'u_1');
    expect(sortNameAsc.items[0].name.localeCompare(sortNameAsc.items[1].name)).toBeLessThanOrEqual(0);

    // Sort by name descending
    const sortNameDesc = await repo.list({ sort: 'name', order: 'desc' }, 'u1@example.com', 'u_1');
    expect(sortNameDesc.items[0].name.localeCompare(sortNameDesc.items[1].name)).toBeGreaterThanOrEqual(0);

    // Pagination limit=2
    const page1 = await repo.list({ limit: 2 }, 'u1@example.com', 'u_1');
    expect(page1.items.length).toBe(2);
    expect(page1.nextCursor).toBeDefined();

    const page2 = await repo.list({ limit: 2, cursor: page1.nextCursor! }, 'u1@example.com', 'u_1');
    expect(page2.items.length).toBe(2);
    expect(page2.items[0].id).not.toBe(page1.items[0].id);

    const page3 = await repo.list({ limit: 2, cursor: page2.nextCursor! }, 'u1@example.com', 'u_1');
    expect(page3.items.length).toBe(1);
    expect(page3.nextCursor).toBeNull();
  });

  it('update modifies fields and increments version', async () => {
    const created = await repo.create({
      ownerId: 'u_1',
      ownerEmail: 'u1@example.com',
      memberEmails: [],
      name: 'Initial Name',
      status: 'draft',
      brief: {},
      settings: {},
      approvedLineup: [],
    });

    const updated = await repo.update(created.id, 1, {
      name: 'Renamed Campaign',
      memberEmails: ['collab@example.com'],
    });

    expect(updated.name).toBe('Renamed Campaign');
    expect(updated.memberEmails).toEqual(['collab@example.com']);
    expect(updated.version).toBe(2);
  });

  it('softDelete moves campaign to trash and increments version', async () => {
    const created = await repo.create({
      ownerId: 'u_1',
      ownerEmail: 'u1@example.com',
      memberEmails: [],
      name: 'To Delete',
      status: 'draft',
      brief: {},
      settings: {},
      approvedLineup: [],
    });

    const trashed = await repo.softDelete(created.id, 1);
    expect(trashed.deletedAt).not.toBeNull();
    expect(trashed.version).toBe(2);

    // Normal list excludes trashed
    const list = await repo.list({}, 'u1@example.com', 'u_1');
    expect(list.items.find((c) => c.id === created.id)).toBeUndefined();

    // Trash list includes it
    const trash = await repo.listTrash('u_1');
    expect(trash.items.find((c) => c.id === created.id)).toBeDefined();
  });

  it('restore brings back soft-deleted campaign', async () => {
    const created = await repo.create({
      ownerId: 'u_1',
      ownerEmail: 'u1@example.com',
      memberEmails: [],
      name: 'Restorable',
      status: 'draft',
      brief: {},
      settings: {},
      approvedLineup: [],
    });

    await repo.softDelete(created.id, 1);
    const restored = await repo.restore(created.id);

    expect(restored.deletedAt).toBeNull();
    expect(restored.version).toBe(3);

    const list = await repo.list({}, 'u1@example.com', 'u_1');
    expect(list.items.find((c) => c.id === created.id)).toBeDefined();

    const trash = await repo.listTrash('u_1');
    expect(trash.items.find((c) => c.id === created.id)).toBeUndefined();
  });

  it('hardDelete permanently purges campaign and subcollections', async () => {
    const created = await repo.create({
      ownerId: 'u_1',
      ownerEmail: 'u1@example.com',
      memberEmails: [],
      name: 'Permanent Delete',
      status: 'draft',
      brief: {},
      settings: {},
      approvedLineup: [],
    });

    await repo.hardDelete(created.id);
    const fetched = await repo.getById(created.id);
    expect(fetched).toBeNull();

    const trash = await repo.listTrash('u_1');
    expect(trash.items.find((c) => c.id === created.id)).toBeUndefined();
  });

  it('throws notFound error when updating, soft-deleting, or restoring non-existent ID', async () => {
    await expect(repo.update('cmp_ghost', 1, { name: 'New' })).rejects.toThrow(AppError);
    await expect(repo.softDelete('cmp_ghost', 1)).rejects.toThrow(AppError);
    await expect(repo.restore('cmp_ghost')).rejects.toThrow(AppError);
  });
});

// ============================================================================
// 3. Campaign Status Transitions Suite (Every allowed and forbidden transition)
// ============================================================================
describe('3. Campaign Status Transitions State Machine Suite', () => {
  let repo: InMemoryCampaignRepository;
  const statuses: CampaignStatus[] = ['draft', 'active', 'completed', 'archived'];

  beforeEach(() => {
    repo = new InMemoryCampaignRepository();
  });

  // Test every allowed transition
  describe('Allowed status transitions', () => {
    for (const fromStatus of statuses) {
      const allowedTargets = ALLOWED_STATUS_TRANSITIONS[fromStatus];
      for (const toStatus of allowedTargets) {
        it(`allows transition from "${fromStatus}" to "${toStatus}"`, async () => {
          const campaign = await repo.create({
            ownerId: 'u_1',
            ownerEmail: 'u1@example.com',
            memberEmails: [],
            name: `Transition ${fromStatus} to ${toStatus}`,
            status: fromStatus,
            brief: {},
            settings: {},
            approvedLineup: [],
          });

          const updated = await repo.update(campaign.id, campaign.version, { status: toStatus });
          expect(updated.status).toBe(toStatus);
        });
      }
    }
  });

  // Test every forbidden transition
  describe('Forbidden status transitions', () => {
    for (const fromStatus of statuses) {
      const allowedTargets = ALLOWED_STATUS_TRANSITIONS[fromStatus];
      const forbiddenTargets = statuses.filter(
        (target) => target !== fromStatus && !allowedTargets.includes(target)
      );

      for (const toStatus of forbiddenTargets) {
        it(`forbids transition from "${fromStatus}" to "${toStatus}" with 422 UNPROCESSABLE`, async () => {
          const campaign = await repo.create({
            ownerId: 'u_1',
            ownerEmail: 'u1@example.com',
            memberEmails: [],
            name: `Forbidden ${fromStatus} to ${toStatus}`,
            status: fromStatus,
            brief: {},
            settings: {},
            approvedLineup: [],
          });

          try {
            await repo.update(campaign.id, campaign.version, { status: toStatus });
            expect.unreachable(`Should have rejected transition from ${fromStatus} to ${toStatus}`);
          } catch (err) {
            expect(err).toBeInstanceOf(AppError);
            const appErr = err as AppError;
            expect(appErr.statusCode).toBe(422);
            expect(appErr.code).toBe('UNPROCESSABLE');
          }
        });
      }
    }
  });

  it('allows updating name without changing status', async () => {
    const campaign = await repo.create({
      ownerId: 'u_1',
      ownerEmail: 'u1@example.com',
      memberEmails: [],
      name: 'Current Draft',
      status: 'draft',
      brief: {},
      settings: {},
      approvedLineup: [],
    });

    const updated = await repo.update(campaign.id, campaign.version, {
      name: 'Renamed Draft',
      status: 'draft', // same status
    });
    expect(updated.name).toBe('Renamed Draft');
    expect(updated.status).toBe('draft');
  });
});

// ============================================================================
// 4. Optimistic Concurrency Suite (409 on version mismatch for PATCH and DELETE)
// ============================================================================
describe('4. Optimistic Concurrency Suite', () => {
  let app: express.Express;
  let testCampaignId: string;

  beforeEach(async () => {
    const repos = resetRepositoriesForTesting();
    app = createApiApp();

    const campaign = await repos.campaigns.create({
      ownerId: 'demo_user_owner',
      ownerEmail: 'owner@example.com',
      memberEmails: ['member@example.com'],
      name: 'Concurrency Testing Campaign',
      status: 'draft',
      brief: {},
      settings: {},
      approvedLineup: [],
    });
    testCampaignId = campaign.id;
  });

  it('PATCH returns 409 CONFLICT on version mismatch', async () => {
    // Current version is 1. Supply version: 99
    const res = await request(app)
      .patch(`/api/v1/campaigns/${testCampaignId}`)
      .set('Authorization', 'Bearer demo_user_owner')
      .send({
        name: 'Conflict Attempt',
        version: 99,
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toContain('version mismatch');
  });

  it('PATCH succeeds on exact version match and increments version', async () => {
    const res1 = await request(app)
      .patch(`/api/v1/campaigns/${testCampaignId}`)
      .set('Authorization', 'Bearer demo_user_owner')
      .send({
        name: 'First Update',
        version: 1,
      });

    expect(res1.status).toBe(200);
    expect(res1.body.version).toBe(2);

    // Stale update using version 1 fails
    const res2 = await request(app)
      .patch(`/api/v1/campaigns/${testCampaignId}`)
      .set('Authorization', 'Bearer demo_user_owner')
      .send({
        name: 'Second Update Stale',
        version: 1,
      });

    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe('CONFLICT');

    // Update using new version 2 succeeds
    const res3 = await request(app)
      .patch(`/api/v1/campaigns/${testCampaignId}`)
      .set('Authorization', 'Bearer demo_user_owner')
      .send({
        name: 'Second Update Fresh',
        version: 2,
      });

    expect(res3.status).toBe(200);
    expect(res3.body.version).toBe(3);
  });

  it('DELETE (soft delete) returns 409 CONFLICT on version mismatch', async () => {
    // Current version is 1. Provide version: 88
    const res = await request(app)
      .delete(`/api/v1/campaigns/${testCampaignId}`)
      .set('Authorization', 'Bearer demo_user_owner')
      .send({ version: 88 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('DELETE (soft delete) succeeds on exact version match', async () => {
    const res = await request(app)
      .delete(`/api/v1/campaigns/${testCampaignId}`)
      .set('Authorization', 'Bearer demo_user_owner')
      .send({ version: 1 });

    expect(res.status).toBe(200);
    expect(res.body.deletedAt).not.toBeNull();
    expect(res.body.version).toBe(2);
  });

  it('DELETE returns 400 VALIDATION_ERROR when version is missing', async () => {
    const res = await request(app)
      .delete(`/api/v1/campaigns/${testCampaignId}`)
      .set('Authorization', 'Bearer demo_user_owner')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ============================================================================
// 5. Authorization Suite (Owner vs Member vs Stranger for every endpoint)
// ============================================================================
describe('5. Authorization Suite (Owner vs Member vs Stranger)', () => {
  let app: express.Express;
  let campaignId: string;

  const OWNER_TOKEN = 'Bearer demo_user_owner';
  const MEMBER_TOKEN = 'Bearer demo_user_member';
  const STRANGER_TOKEN = 'Bearer demo_user_stranger';

  beforeEach(async () => {
    const repos = resetRepositoriesForTesting();
    app = createApiApp();

    const campaign = await repos.campaigns.create({
      ownerId: 'demo_user_owner',
      ownerEmail: 'owner@example.com',
      memberEmails: ['member@example.com'],
      name: 'Auth Matrix Campaign',
      status: 'draft',
      brief: { goals: 'High ROI' },
      settings: { budget: 20000 },
      approvedLineup: [],
    });
    campaignId = campaign.id;
  });

  describe('GET /api/v1/campaigns/:id', () => {
    it('allows owner', async () => {
      const res = await request(app).get(`/api/v1/campaigns/${campaignId}`).set('Authorization', OWNER_TOKEN);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(campaignId);
    });

    it('allows member', async () => {
      const res = await request(app).get(`/api/v1/campaigns/${campaignId}`).set('Authorization', MEMBER_TOKEN);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(campaignId);
    });

    it('returns 404 NOT_FOUND for stranger (no existence leak)', async () => {
      const res = await request(app).get(`/api/v1/campaigns/${campaignId}`).set('Authorization', STRANGER_TOKEN);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/v1/campaigns/:id', () => {
    it('allows owner to update name and members', async () => {
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignId}`)
        .set('Authorization', OWNER_TOKEN)
        .send({ name: 'Owner Updated', memberEmails: ['member@example.com', 'new@example.com'], version: 1 });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Owner Updated');
    });

    it('allows member to update name or status', async () => {
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignId}`)
        .set('Authorization', MEMBER_TOKEN)
        .send({ name: 'Member Updated', version: 1 });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Member Updated');
    });

    it('returns 403 FORBIDDEN when member tries to modify memberEmails', async () => {
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignId}`)
        .set('Authorization', MEMBER_TOKEN)
        .send({ memberEmails: ['hacker@example.com'], version: 1 });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 NOT_FOUND for stranger', async () => {
      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignId}`)
        .set('Authorization', STRANGER_TOKEN)
        .send({ name: 'Stranger Rename', version: 1 });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/v1/campaigns/:id (Soft delete)', () => {
    it('allows owner to soft delete', async () => {
      const res = await request(app)
        .delete(`/api/v1/campaigns/${campaignId}`)
        .set('Authorization', OWNER_TOKEN)
        .send({ version: 1 });

      expect(res.status).toBe(200);
      expect(res.body.deletedAt).not.toBeNull();
    });

    it('returns 403 FORBIDDEN for member', async () => {
      const res = await request(app)
        .delete(`/api/v1/campaigns/${campaignId}`)
        .set('Authorization', MEMBER_TOKEN)
        .send({ version: 1 });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 NOT_FOUND for stranger', async () => {
      const res = await request(app)
        .delete(`/api/v1/campaigns/${campaignId}`)
        .set('Authorization', STRANGER_TOKEN)
        .send({ version: 1 });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/v1/campaigns/:id/restore', () => {
    beforeEach(async () => {
      const repos = getRepositories();
      await repos.campaigns.softDelete(campaignId, 1);
    });

    it('allows owner to restore', async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/restore`)
        .set('Authorization', OWNER_TOKEN);

      expect(res.status).toBe(200);
      expect(res.body.deletedAt).toBeNull();
    });

    it('returns 403 FORBIDDEN for member', async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/restore`)
        .set('Authorization', MEMBER_TOKEN);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 NOT_FOUND for stranger', async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/restore`)
        .set('Authorization', STRANGER_TOKEN);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/v1/campaigns/:id/permanent', () => {
    it('returns 422 UNPROCESSABLE if campaign is not trashed first', async () => {
      const res = await request(app)
        .delete(`/api/v1/campaigns/${campaignId}/permanent`)
        .set('Authorization', OWNER_TOKEN);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('UNPROCESSABLE');
    });

    it('allows owner to permanently delete if trashed', async () => {
      const repos = getRepositories();
      await repos.campaigns.softDelete(campaignId, 1);

      const res = await request(app)
        .delete(`/api/v1/campaigns/${campaignId}/permanent`)
        .set('Authorization', OWNER_TOKEN);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('permanently deleted');
    });

    it('returns 403 FORBIDDEN for member', async () => {
      const repos = getRepositories();
      await repos.campaigns.softDelete(campaignId, 1);

      const res = await request(app)
        .delete(`/api/v1/campaigns/${campaignId}/permanent`)
        .set('Authorization', MEMBER_TOKEN);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 NOT_FOUND for stranger', async () => {
      const repos = getRepositories();
      await repos.campaigns.softDelete(campaignId, 1);

      const res = await request(app)
        .delete(`/api/v1/campaigns/${campaignId}/permanent`)
        .set('Authorization', STRANGER_TOKEN);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/v1/campaigns/:id/export', () => {
    it('allows owner', async () => {
      const res = await request(app).get(`/api/v1/campaigns/${campaignId}/export`).set('Authorization', OWNER_TOKEN);
      expect(res.status).toBe(200);
      expect(res.body.schemaVersion).toBe(1);
    });

    it('allows member', async () => {
      const res = await request(app).get(`/api/v1/campaigns/${campaignId}/export`).set('Authorization', MEMBER_TOKEN);
      expect(res.status).toBe(200);
      expect(res.body.schemaVersion).toBe(1);
    });

    it('returns 404 NOT_FOUND for stranger', async () => {
      const res = await request(app).get(`/api/v1/campaigns/${campaignId}/export`).set('Authorization', STRANGER_TOKEN);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/v1/campaigns/:id/activity and /jobs', () => {
    it('allows member and owner to view activity & jobs', async () => {
      const resAct = await request(app).get(`/api/v1/campaigns/${campaignId}/activity`).set('Authorization', MEMBER_TOKEN);
      expect(resAct.status).toBe(200);

      const resJobs = await request(app).get(`/api/v1/campaigns/${campaignId}/jobs`).set('Authorization', MEMBER_TOKEN);
      expect(resJobs.status).toBe(200);
    });

    it('returns 404 NOT_FOUND for stranger', async () => {
      const resAct = await request(app).get(`/api/v1/campaigns/${campaignId}/activity`).set('Authorization', STRANGER_TOKEN);
      expect(resAct.status).toBe(404);

      const resJobs = await request(app).get(`/api/v1/campaigns/${campaignId}/jobs`).set('Authorization', STRANGER_TOKEN);
      expect(resJobs.status).toBe(404);
    });
  });
});

// ============================================================================
// 6. Duplicate Campaign Suite
// ============================================================================
describe('6. Duplicate Campaign Suite', () => {
  let app: express.Express;
  let originalId: string;

  beforeEach(async () => {
    const repos = resetRepositoriesForTesting();
    app = createApiApp();

    const campaign = await repos.campaigns.create({
      ownerId: 'demo_user_owner',
      ownerEmail: 'owner@example.com',
      memberEmails: ['collab@example.com', 'marketer@example.com'],
      name: 'Original Q3 Video Push',
      status: 'active',
      brief: { targetAudience: 'Gamers', budgetMax: 50000 },
      settings: { timezone: 'UTC' },
      approvedLineup: ['creator_alpha', 'creator_beta'],
    });
    originalId = campaign.id;
  });

  it('duplicates campaign settings & brief, resets status to draft, clears approved lineup, creates unique ID', async () => {
    const res = await request(app)
      .post(`/api/v1/campaigns/${originalId}/duplicate`)
      .set('Authorization', 'Bearer demo_user_marketer');

    expect(res.status).toBe(201);
    const dup = res.body;

    expect(dup.id).not.toBe(originalId);
    expect(dup.id).toMatch(/^cmp_/);
    expect(dup.name).toBe('Copy of Original Q3 Video Push');
    expect(dup.status).toBe('draft');
    expect(dup.version).toBe(1);
    expect(dup.ownerId).toBe('demo_user_marketer');
    expect(dup.ownerEmail).toBe('marketer@example.com');
    expect(dup.memberEmails).toEqual([]);
    expect(dup.approvedLineup).toEqual([]);
    expect(dup.brief).toEqual({ targetAudience: 'Gamers', budgetMax: 50000 });
    expect(dup.settings).toEqual({ timezone: 'UTC' });
  });

  it('returns 404 NOT_FOUND when attempting to duplicate non-existent or inaccessible campaign', async () => {
    const res = await request(app)
      .post('/api/v1/campaigns/cmp_ghost/duplicate')
      .set('Authorization', 'Bearer demo_user_marketer');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ============================================================================
// 7. Import Validation Suite
// ============================================================================
describe('7. Import Validation Suite', () => {
  let app: express.Express;

  beforeEach(() => {
    resetRepositoriesForTesting();
    app = createApiApp();
  });

  it('imports valid JSON file format successfully', async () => {
    const validPayload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      campaign: {
        name: 'Imported Marketing Blitz',
        brief: { goals: 'High Reach' },
        settings: { budget: 75000 },
        guidelines: [{ title: 'Brand Safety' }],
        creators: [{ name: 'Tech Guru' }],
      },
    };

    const res = await request(app)
      .post('/api/v1/campaigns/import')
      .set('Authorization', 'Bearer demo_user_importer')
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Imported Marketing Blitz');
    expect(res.body.status).toBe('draft');
    expect(res.body.ownerId).toBe('demo_user_importer');
    expect(res.body.ownerEmail).toBe('importer@example.com');
  });

  it('returns 400 VALIDATION_ERROR on malformed JSON / syntax error', async () => {
    const res = await request(app)
      .post('/api/v1/campaigns/import')
      .set('Authorization', 'Bearer demo_user_importer')
      .set('Content-Type', 'application/json')
      .send('{ "schemaVersion": 1, invalid_json: ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR on unsupported schemaVersion', async () => {
    const res = await request(app)
      .post('/api/v1/campaigns/import')
      .set('Authorization', 'Bearer demo_user_importer')
      .send({
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        campaign: { name: 'V2 Campaign' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR on missing required fields', async () => {
    // Missing campaign.name
    const res1 = await request(app)
      .post('/api/v1/campaigns/import')
      .set('Authorization', 'Bearer demo_user_importer')
      .send({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        campaign: {},
      });

    expect(res1.status).toBe(400);
    expect(res1.body.error.code).toBe('VALIDATION_ERROR');

    // Missing exportedAt
    const res2 = await request(app)
      .post('/api/v1/campaigns/import')
      .set('Authorization', 'Bearer demo_user_importer')
      .send({
        schemaVersion: 1,
        campaign: { name: 'No Timestamp' },
      });

    expect(res2.status).toBe(400);
    expect(res2.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ============================================================================
// 8. Job Runner Suite (Single job per type per campaign, cancellation, timeout)
// ============================================================================
describe('8. Background Job Runner Suite', () => {
  let runner: JobRunner;

  beforeEach(() => {
    resetRepositoriesForTesting();
    runner = new JobRunner();
  });

  it('enforces single running job per type per campaign (idempotency)', async () => {
    let unblockJob!: () => void;
    const blocker = new Promise<void>((resolve) => {
      unblockJob = resolve;
    });

    const job1 = await runner.createJob('ANALYSIS', 'cmp_test', 'user_1', async () => {
      await blocker;
      return { score: 98 };
    });

    expect(job1.id).toBeDefined();
    expect(job1.status).toBe('running');

    // Attempt second job of same type on same campaign while job1 is still active
    const job2 = await runner.createJob('ANALYSIS', 'cmp_test', 'user_1', async () => {
      return { score: 50 };
    });

    // Should return existing active job rather than launching duplicate
    expect(job2.id).toBe(job1.id);

    // Clean up
    unblockJob();
  });

  it('allows concurrent jobs if job type is different or campaign is different', async () => {
    let unblock!: () => void;
    const blocker = new Promise<void>((resolve) => {
      unblock = resolve;
    });

    const jobA = await runner.createJob('ANALYSIS', 'cmp_test', 'user_1', async () => {
      await blocker;
    });
    const jobB = await runner.createJob('CREATOR_SEARCH', 'cmp_test', 'user_1', async () => {
      await blocker;
    });
    const jobC = await runner.createJob('ANALYSIS', 'cmp_other', 'user_1', async () => {
      await blocker;
    });

    expect(jobA.id).not.toBe(jobB.id);
    expect(jobA.id).not.toBe(jobC.id);

    unblock();
  });

  it('handles user cancellation request during execution', async () => {
    let cancelledObserved = false;
    let finishTrigger!: () => void;
    const finishPromise = new Promise<void>((resolve) => {
      finishTrigger = resolve;
    });

    const job = await runner.createJob('LONG_TASK', 'cmp_cancel', 'user_1', async (ctx) => {
      await finishPromise;
      if (await ctx.isCancelled()) {
        cancelledObserved = true;
        throw new Error('JOB_CANCELLED');
      }
      return { done: true };
    });

    // Request cancellation
    await runner.requestCancel(job.id);

    // Let job finish
    finishTrigger();

    // Small tick to allow job promise to settle
    await new Promise((r) => setTimeout(r, 20));

    expect(cancelledObserved).toBe(true);

    const fetched = await runner.getJob(job.id);
    expect(fetched.status).toBe('cancelled');
  });

  it('detects and marks timeout on running jobs exceeding timeout window', async () => {
    const repos = getRepositories();
    // Simulate a job created 20 minutes ago (CONFIG.JOB_TIMEOUT_MINUTES is 10)
    const oldDate = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const staleJob = await repos.jobs.create({
      campaignId: 'cmp_timeout',
      ownerId: 'user_1',
      type: 'HEAVY_ANALYSIS',
      status: 'running',
      progress: { done: 10, total: 100, message: 'Working...' },
      result: null,
      error: null,
      cancelRequested: false,
    });

    // Backdate createdAt in repo
    await repos.jobs.update(staleJob.id, { createdAt: oldDate });

    // getJob should detect timeout and transition status to failed with code JOB_TIMEOUT
    const checked = await runner.getJob(staleJob.id);
    expect(checked.status).toBe('failed');
    expect(checked.error?.code).toBe('JOB_TIMEOUT');
    expect(checked.error?.message).toContain('exceeded execution timeout');
  });
});

// ============================================================================
// 9. Error Middleware Suite (Each error code maps to the right status & shape)
// ============================================================================
describe('9. Error Middleware Mapping Suite', () => {
  function createTestErrorApp(errorToThrow: unknown) {
    const app = express();
    app.get('/test-error', (req: Request, res: Response, next: NextFunction) => {
      next(errorToThrow);
    });
    app.use(errorHandler);
    return app;
  }

  it('maps ZodError to 400 VALIDATION_ERROR with structured details array', async () => {
    const schema = z.object({
      name: z.string().min(5),
      age: z.number().int().positive(),
    });

    let zodErr: unknown;
    try {
      schema.parse({ name: 'abc', age: -10 });
    } catch (e) {
      zodErr = e;
    }

    const app = createTestErrorApp(zodErr);
    const res = await request(app).get('/test-error').set('x-request-id', 'req-123');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.requestId).toBe('req-123');
    expect(res.body.error.details.length).toBeGreaterThan(0);
    expect(res.body.error.details[0].field).toBeDefined();
  });

  const appErrorCases = [
    {
      name: 'VALIDATION_ERROR',
      err: AppError.validation('Invalid parameters', [{ field: 'name', message: 'Required' }]),
      expectedStatus: 400,
      expectedCode: 'VALIDATION_ERROR',
      expectedRetryable: false,
    },
    {
      name: 'UNAUTHENTICATED',
      err: AppError.unauthenticated('Token invalid'),
      expectedStatus: 401,
      expectedCode: 'UNAUTHENTICATED',
      expectedRetryable: false,
    },
    {
      name: 'FORBIDDEN',
      err: AppError.forbidden('Forbidden action'),
      expectedStatus: 403,
      expectedCode: 'FORBIDDEN',
      expectedRetryable: false,
    },
    {
      name: 'NOT_FOUND',
      err: AppError.notFound('Resource missing'),
      expectedStatus: 404,
      expectedCode: 'NOT_FOUND',
      expectedRetryable: false,
    },
    {
      name: 'CONFLICT',
      err: AppError.conflict('Version mismatch', { currentVersion: 2 }),
      expectedStatus: 409,
      expectedCode: 'CONFLICT',
      expectedRetryable: false,
    },
    {
      name: 'UNPROCESSABLE',
      err: AppError.unprocessable('Invalid state transition'),
      expectedStatus: 422,
      expectedCode: 'UNPROCESSABLE',
      expectedRetryable: false,
    },
    {
      name: 'RATE_LIMITED',
      err: AppError.rateLimited('Slow down'),
      expectedStatus: 429,
      expectedCode: 'RATE_LIMITED',
      expectedRetryable: true,
    },
    {
      name: 'INTERNAL',
      err: AppError.internal('Internal glitch'),
      expectedStatus: 500,
      expectedCode: 'INTERNAL',
      expectedRetryable: false,
    },
    {
      name: 'UPSTREAM_ERROR',
      err: AppError.upstream('YouTube API failure', true),
      expectedStatus: 502,
      expectedCode: 'UPSTREAM_ERROR',
      expectedRetryable: true,
    },
    {
      name: 'AI_INVALID_OUTPUT',
      err: AppError.aiInvalidOutput('Gemini returned unexpected shape', { raw: '...' }),
      expectedStatus: 422,
      expectedCode: 'AI_INVALID_OUTPUT',
      expectedRetryable: false,
    },
    {
      name: 'AI_RATE_LIMITED',
      err: AppError.aiRateLimited('Gemini quota reached'),
      expectedStatus: 429,
      expectedCode: 'AI_RATE_LIMITED',
      expectedRetryable: true,
    },
    {
      name: 'AI_UNAVAILABLE',
      err: AppError.aiUnavailable('Gemini service unavailable'),
      expectedStatus: 503,
      expectedCode: 'AI_UNAVAILABLE',
      expectedRetryable: true,
    },
  ];

  for (const testCase of appErrorCases) {
    it(`maps AppError.${testCase.name} to status ${testCase.expectedStatus} and code ${testCase.expectedCode}`, async () => {
      const app = createTestErrorApp(testCase.err);
      const res = await request(app).get('/test-error');

      expect(res.status).toBe(testCase.expectedStatus);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe(testCase.expectedCode);
      expect(res.body.error.retryable).toBe(testCase.expectedRetryable);
      expect(res.body.error.message).toBe(testCase.err.message);
    });
  }

  it('maps unhandled generic Error to 500 INTERNAL with redacted message', async () => {
    const app = createTestErrorApp(new Error('Sensitive database credentials leak'));
    const res = await request(app).get('/test-error');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    // Ensure sensitive message was redacted
    expect(res.body.error.message).toBe('An unexpected internal error occurred');
    expect(res.body.error.message).not.toContain('Sensitive database credentials');
  });
});

// ============================================================================
// 10. Phase 2 - Section A: Campaign Brief Suite
// ============================================================================
describe('10. Campaign Brief Suite (Phase 2 - Section A)', () => {
  describe('CampaignBriefSchema & Helpers', () => {
    it('validates SAMPLE_BRIEF successfully', () => {
      const parsed = CampaignBriefSchema.parse(SAMPLE_BRIEF);
      expect(parsed.brandName).toBe('Wacaco');
      expect(parsed.productName).toBe('Picopresso Portable Espresso Machine');
      expect(isBriefComplete(SAMPLE_BRIEF)).toBe(true);
    });

    it('identifies incomplete or null brief correctly', () => {
      expect(isBriefComplete(null)).toBe(false);
      expect(isBriefComplete({})).toBe(false);
      expect(isBriefComplete({ brandName: 'Brand only' })).toBe(false);
    });

    it('requires brandName and productName (1-80 chars)', () => {
      expect(() =>
        CampaignBriefSchema.parse({
          ...SAMPLE_BRIEF,
          brandName: '',
        })
      ).toThrow();

      expect(() =>
        CampaignBriefSchema.parse({
          ...SAMPLE_BRIEF,
          productName: 'x'.repeat(81),
        })
      ).toThrow();
    });

    it('requires landingPageUrl to be a valid https URL', () => {
      expect(() =>
        CampaignBriefSchema.parse({
          ...SAMPLE_BRIEF,
          landingPageUrl: 'http://insecure.com',
        })
      ).toThrow();

      expect(() =>
        CampaignBriefSchema.parse({
          ...SAMPLE_BRIEF,
          landingPageUrl: 'not-a-url',
        })
      ).toThrow();

      const valid = CampaignBriefSchema.parse({
        ...SAMPLE_BRIEF,
        landingPageUrl: 'https://myshop.com/product-page',
      });
      expect(valid.landingPageUrl).toBe('https://myshop.com/product-page');
    });

    it('validates approvedFacts constraints (1-20 items, 5-300 chars)', () => {
      // Empty facts array fails
      expect(() =>
        CampaignBriefSchema.parse({
          ...SAMPLE_BRIEF,
          approvedFacts: [],
        })
      ).toThrow();

      // Fact too short (<5 chars) fails
      expect(() =>
        CampaignBriefSchema.parse({
          ...SAMPLE_BRIEF,
          approvedFacts: ['Tiny'],
        })
      ).toThrow();

      // Fact too long (>300 chars) fails
      expect(() =>
        CampaignBriefSchema.parse({
          ...SAMPLE_BRIEF,
          approvedFacts: ['a'.repeat(301)],
        })
      ).toThrow();
    });

    it('validates targetAudience (20-500 chars)', () => {
      expect(() =>
        CampaignBriefSchema.parse({
          ...SAMPLE_BRIEF,
          targetAudience: 'Too short',
        })
      ).toThrow();

      expect(() =>
        CampaignBriefSchema.parse({
          ...SAMPLE_BRIEF,
          targetAudience: 'x'.repeat(501),
        })
      ).toThrow();
    });

    it('validates budgetUsd (> 0 and <= 10,000,000)', () => {
      expect(() =>
        CampaignBriefSchema.parse({
          ...SAMPLE_BRIEF,
          budgetUsd: 0,
        })
      ).toThrow();

      expect(() =>
        CampaignBriefSchema.parse({
          ...SAMPLE_BRIEF,
          budgetUsd: -500,
        })
      ).toThrow();

      expect(() =>
        CampaignBriefSchema.parse({
          ...SAMPLE_BRIEF,
          budgetUsd: 10000001,
        })
      ).toThrow();

      const parsed = CampaignBriefSchema.parse({
        ...SAMPLE_BRIEF,
        budgetUsd: 50000,
      });
      expect(parsed.budgetUsd).toBe(50000);
    });

    it('validates goal enum and tones selection', () => {
      expect(() =>
        CampaignBriefSchema.parse({
          ...SAMPLE_BRIEF,
          goal: 'unsupported_goal',
        })
      ).toThrow();

      expect(() =>
        CampaignBriefSchema.parse({
          ...SAMPLE_BRIEF,
          tones: [],
        })
      ).toThrow();
    });
  });

  describe('Campaign Brief Endpoints (GET, PUT, PATCH)', () => {
    let app: express.Express;
    let campaignId: string;

    const OWNER_AUTH = 'Bearer demo_user_owner';
    const MEMBER_AUTH = 'Bearer demo_user_member';
    const STRANGER_AUTH = 'Bearer demo_user_stranger';

    beforeEach(async () => {
      const repos = resetRepositoriesForTesting();
      app = createApiApp();

      const campaign = await repos.campaigns.create({
        ownerId: 'demo_user_owner',
        ownerEmail: 'owner@example.com',
        memberEmails: ['member@example.com'],
        name: 'Brief Test Campaign',
        status: 'draft',
        brief: {},
        settings: {},
        approvedLineup: [],
      });
      campaignId = campaign.id;
    });

    it('GET /api/v1/campaigns/:id/brief returns empty brief initially and 404 for stranger', async () => {
      const resOwner = await request(app)
        .get(`/api/v1/campaigns/${campaignId}/brief`)
        .set('Authorization', OWNER_AUTH);

      expect(resOwner.status).toBe(200);
      expect(resOwner.body.brief).toBeNull();
      expect(resOwner.body.isComplete).toBe(false);
      expect(resOwner.body.version).toBe(1);

      // Stranger gets 404
      const resStranger = await request(app)
        .get(`/api/v1/campaigns/${campaignId}/brief`)
        .set('Authorization', STRANGER_AUTH);

      expect(resStranger.status).toBe(404);
      expect(resStranger.body.error.code).toBe('NOT_FOUND');
    });

    it('PUT /api/v1/campaigns/:id/brief saves full brief and increments version', async () => {
      const res = await request(app)
        .put(`/api/v1/campaigns/${campaignId}/brief`)
        .set('Authorization', OWNER_AUTH)
        .send({
          ...SAMPLE_BRIEF,
          version: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.brief).toBeDefined();
      expect(res.body.brief.brandName).toBe('Wacaco');
      expect(res.body.version).toBe(2);
      expect(res.body.isComplete).toBe(true);

      // GET returns saved brief
      const getRes = await request(app)
        .get(`/api/v1/campaigns/${campaignId}/brief`)
        .set('Authorization', MEMBER_AUTH);

      expect(getRes.status).toBe(200);
      expect(getRes.body.brief.productName).toBe('Picopresso Portable Espresso Machine');
      expect(getRes.body.isComplete).toBe(true);
      expect(getRes.body.version).toBe(2);
    });

    it('PUT rejects version mismatch with 409 CONFLICT', async () => {
      const res = await request(app)
        .put(`/api/v1/campaigns/${campaignId}/brief`)
        .set('Authorization', OWNER_AUTH)
        .send({
          ...SAMPLE_BRIEF,
          version: 99,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('PUT rejects draft launch date in the past with 400 VALIDATION_ERROR', async () => {
      const pastDate = new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0];
      const res = await request(app)
        .put(`/api/v1/campaigns/${campaignId}/brief`)
        .set('Authorization', OWNER_AUTH)
        .send({
          ...SAMPLE_BRIEF,
          launchDate: pastDate,
          version: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Launch date');
    });

    it('PATCH /api/v1/campaigns/:id/brief allows partial brief update with version check', async () => {
      // First save sample brief
      await request(app)
        .put(`/api/v1/campaigns/${campaignId}/brief`)
        .set('Authorization', OWNER_AUTH)
        .send({
          ...SAMPLE_BRIEF,
          version: 1,
        });

      // Partial update budget and custom tone
      const patchRes = await request(app)
        .patch(`/api/v1/campaigns/${campaignId}/brief`)
        .set('Authorization', MEMBER_AUTH)
        .send({
          budgetUsd: 85000,
          customTone: 'ultra-technical espresso analysis',
          version: 2,
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.brief.budgetUsd).toBe(85000);
      expect(patchRes.body.brief.customTone).toBe('ultra-technical espresso analysis');
      expect(patchRes.body.brief.brandName).toBe('Wacaco'); // preserved
      expect(patchRes.body.version).toBe(3);

      // Stale version fails 409
      const staleRes = await request(app)
        .patch(`/api/v1/campaigns/${campaignId}/brief`)
        .set('Authorization', OWNER_AUTH)
        .send({
          budgetUsd: 90000,
          version: 2,
        });

      expect(staleRes.status).toBe(409);
      expect(staleRes.body.error.code).toBe('CONFLICT');
    });

    it('PATCH persists modifications and survives a simulated page refresh (GET /api/v1/campaigns/:id/brief)', async () => {
      // 1. Initial save of brief
      const initialPut = await request(app)
        .put(`/api/v1/campaigns/${campaignId}/brief`)
        .set('Authorization', OWNER_AUTH)
        .send({
          ...SAMPLE_BRIEF,
          version: 1,
        });
      expect(initialPut.status).toBe(200);

      // 2. User edits fields in form and sticky save bar sends PATCH
      const patchRes = await request(app)
        .patch(`/api/v1/campaigns/${campaignId}/brief`)
        .set('Authorization', OWNER_AUTH)
        .send({
          brandName: 'Wacaco Pro Precision',
          productName: 'Picopresso Custom Edition',
          budgetUsd: 75000,
          customTone: 'ultra-refined specialty craft',
          nicheKeywords: ['espresso', 'portafilter', 'travel coffee'],
          version: initialPut.body.version,
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.brief.brandName).toBe('Wacaco Pro Precision');
      expect(patchRes.body.brief.productName).toBe('Picopresso Custom Edition');
      expect(patchRes.body.brief.budgetUsd).toBe(75000);
      expect(patchRes.body.brief.customTone).toBe('ultra-refined specialty craft');

      // 3. Simulating page refresh (GET /api/v1/campaigns/:id/brief)
      const refreshRes = await request(app)
        .get(`/api/v1/campaigns/${campaignId}/brief`)
        .set('Authorization', OWNER_AUTH);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.brief).toBeDefined();
      expect(refreshRes.body.brief.brandName).toBe('Wacaco Pro Precision');
      expect(refreshRes.body.brief.productName).toBe('Picopresso Custom Edition');
      expect(refreshRes.body.brief.budgetUsd).toBe(75000);
      expect(refreshRes.body.brief.customTone).toBe('ultra-refined specialty craft');
      expect(refreshRes.body.brief.nicheKeywords).toEqual(['espresso', 'portafilter', 'travel coffee']);
      expect(refreshRes.body.isComplete).toBe(true);
    });
  });
});
