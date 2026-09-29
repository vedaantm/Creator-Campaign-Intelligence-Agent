import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../apiPlugin.ts';
import { getRepositories, resetRepositoriesForTesting } from '../repositories/index.ts';
import { SearchPackContent } from '../../shared/types.ts';

describe('Phase 7 — Section A: Search Pack Data Models & API Endpoints Suite', () => {
  let app: any;
  let campaignId: string;

  const OWNER_AUTH = 'Bearer demo_user_alpha';
  const OTHER_AUTH = 'Bearer demo_user_beta';

  const sampleSearchPackContent: SearchPackContent = {
    highIntentQueries: [
      {
        id: 'q_1',
        query: 'best portable espresso maker for camping 2026',
        intent: 'product_comparison',
        priority: 'high',
        rationale: 'High buying intent for travel coffee gear.',
        targetCreatorIds: ['creator_1'],
      },
      {
        id: 'q_2',
        query: 'how to pull real espresso without electricity',
        intent: 'how_to',
        priority: 'high',
        rationale: 'Educational query capturing espresso enthusiasts.',
        targetCreatorIds: ['creator_1'],
      },
    ],
    titleFormulas: [
      {
        formula: '{Product} Review: Is Portable Espresso Worth It?',
        exampleTitle: 'Picopresso Review: Is Portable Espresso Worth It?',
        searchIntent: 'product_comparison',
      },
    ],
    thumbnailHooks: ['Naked Portafilter Shot', '350g Handheld Machine'],
    searchDescriptionTemplate: 'Full breakdown of {Product} portable espresso machine. Links and discounts below.',
    recommendedTags: ['espresso', 'portable coffee', 'picopresso', 'wacaco'],
    creatorGuidelines: 'Include primary search query in first 20 seconds and in title.',
  };

  beforeEach(async () => {
    resetRepositoriesForTesting();
    app = createApiApp();
    const repos = getRepositories();

    // Create campaign
    const campaign = await repos.campaigns.create({
      ownerId: 'demo_user_alpha',
      ownerEmail: 'demo_user_alpha@example.com',
      memberEmails: [],
      name: 'Search Capture Campaign',
      status: 'active',
      brief: {
        brandName: 'Wacaco',
        productName: 'Picopresso',
      },
      settings: {},
      approvedLineup: null,
    });

    campaignId = campaign.id;
  });

  it('GET /api/v1/campaigns/:id/search-pack returns 404 when no search pack exists', async () => {
    const res = await request(app)
      .get(`/api/v1/campaigns/${campaignId}/search-pack`)
      .set('Authorization', OWNER_AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('not found');
  });

  it('POST /api/v1/campaigns/:id/search-pack/generate enqueues generation job', async () => {
    const res = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/search-pack/generate`)
      .set('Authorization', OWNER_AUTH)
      .send({ instruction: 'Focus on outdoor travel queries' });

    expect(res.status).toBe(202);
    expect(res.body.jobId).toBeDefined();

    // Verify search pack was saved by the job runner task
    const repos = getRepositories();
    const pack = await repos.searchPack.get(campaignId);
    expect(pack).not.toBeNull();
    expect(pack?.content.creatorGuidelines).toBe('Focus on outdoor travel queries');
  });

  it('GET /api/v1/campaigns/:id/search-pack returns search pack data once created', async () => {
    const repos = getRepositories();
    await repos.searchPack.upsert(campaignId, {
      id: 'sp_test_1',
      campaignId,
      status: 'draft',
      content: sampleSearchPackContent,
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    });

    const res = await request(app)
      .get(`/api/v1/campaigns/${campaignId}/search-pack`)
      .set('Authorization', OWNER_AUTH);

    expect(res.status).toBe(200);
    expect(res.body.campaignId).toBe(campaignId);
    expect(res.body.content.highIntentQueries.length).toBe(2);
    expect(res.body.content.highIntentQueries[0].query).toContain('best portable espresso');
  });

  it('PATCH /api/v1/campaigns/:id/search-pack updates content and enforces optimistic concurrency version check', async () => {
    const repos = getRepositories();
    const created = await repos.searchPack.upsert(campaignId, {
      id: 'sp_test_1',
      campaignId,
      status: 'draft',
      content: sampleSearchPackContent,
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    });

    // Attempt patch with wrong version
    const wrongRes = await request(app)
      .patch(`/api/v1/campaigns/${campaignId}/search-pack`)
      .set('Authorization', OWNER_AUTH)
      .send({
        content: sampleSearchPackContent,
        version: 99,
      });

    expect(wrongRes.status).toBe(409);

    // Patch with correct version
    const updatedContent = {
      ...sampleSearchPackContent,
      thumbnailHooks: ['Updated Thumbnail Hook'],
    };

    const validRes = await request(app)
      .patch(`/api/v1/campaigns/${campaignId}/search-pack`)
      .set('Authorization', OWNER_AUTH)
      .send({
        content: updatedContent,
        status: 'final',
        version: created.version,
      });

    expect(validRes.status).toBe(200);
    expect(validRes.body.version).toBe(2);
    expect(validRes.body.status).toBe('final');
    expect(validRes.body.content.thumbnailHooks[0]).toBe('Updated Thumbnail Hook');
  });

  it('DELETE /api/v1/campaigns/:id/search-pack removes the document', async () => {
    const repos = getRepositories();
    await repos.searchPack.upsert(campaignId, {
      id: 'sp_test_1',
      campaignId,
      status: 'draft',
      content: sampleSearchPackContent,
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    });

    const delRes = await request(app)
      .delete(`/api/v1/campaigns/${campaignId}/search-pack`)
      .set('Authorization', OWNER_AUTH);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const checkRes = await request(app)
      .get(`/api/v1/campaigns/${campaignId}/search-pack`)
      .set('Authorization', OWNER_AUTH);

    expect(checkRes.status).toBe(404);
  });
});
