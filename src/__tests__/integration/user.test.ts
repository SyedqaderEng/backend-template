import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app';
import { Application } from 'express';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Supabase
const mockProfile = {
  id: 'profile-uuid-123',
  clerk_user_id: 'test-user-id',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  avatar_url: null,
  plan: 'free' as const,
  subscription_status: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

vi.mock('../../database', () => ({
  profileRepository: {
    findByClerkUserId: vi.fn(),
    create: vi.fn(),
    updateByClerkUserId: vi.fn(),
  },
}));

import { profileRepository } from '../../database';

describe('User API Endpoints', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    app = createApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/users/me', () => {
    it('should return 401 without authorization token', async () => {
      const response = await request(app)
        .get('/api/v1/users/me');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Authorization token required');
    });

    it('should return user profile when authenticated', async () => {
      vi.mocked(profileRepository.findByClerkUserId).mockResolvedValue(mockProfile);

      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        id: mockProfile.id,
        clerkUserId: mockProfile.clerk_user_id,
        email: mockProfile.email,
        firstName: mockProfile.first_name,
        lastName: mockProfile.last_name,
        avatarUrl: mockProfile.avatar_url,
        plan: mockProfile.plan,
        subscriptionStatus: mockProfile.subscription_status,
        createdAt: mockProfile.created_at,
        updatedAt: mockProfile.updated_at,
      });
    });

    it('should create profile if not found', async () => {
      vi.mocked(profileRepository.findByClerkUserId).mockResolvedValue(null);
      vi.mocked(profileRepository.create).mockResolvedValue(mockProfile);

      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(profileRepository.create).toHaveBeenCalledWith({
        clerk_user_id: 'test-user-id',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
      });
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(profileRepository.findByClerkUserId).mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Database connection failed');
    });
  });

  describe('PATCH /api/v1/users/me', () => {
    it('should return 401 without authorization token', async () => {
      const response = await request(app)
        .patch('/api/v1/users/me')
        .send({ first_name: 'Updated' });

      expect(response.status).toBe(401);
    });

    it('should update user profile', async () => {
      const updatedProfile = {
        ...mockProfile,
        first_name: 'Updated',
        updated_at: '2024-01-02T00:00:00Z',
      };

      vi.mocked(profileRepository.findByClerkUserId).mockResolvedValue(mockProfile);
      vi.mocked(profileRepository.updateByClerkUserId).mockResolvedValue(updatedProfile);

      const response = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', 'Bearer test-token')
        .send({ first_name: 'Updated' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.firstName).toBe('Updated');
    });

    it('should allow updating multiple fields', async () => {
      const updatedProfile = {
        ...mockProfile,
        first_name: 'John',
        last_name: 'Doe',
        avatar_url: 'https://example.com/avatar.png',
      };

      vi.mocked(profileRepository.findByClerkUserId).mockResolvedValue(mockProfile);
      vi.mocked(profileRepository.updateByClerkUserId).mockResolvedValue(updatedProfile);

      const response = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', 'Bearer test-token')
        .send({
          first_name: 'John',
          last_name: 'Doe',
          avatar_url: 'https://example.com/avatar.png',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.firstName).toBe('John');
      expect(response.body.data.lastName).toBe('Doe');
      expect(response.body.data.avatarUrl).toBe('https://example.com/avatar.png');
    });

    it('should reject empty update body', async () => {
      const response = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('No valid fields to update');
    });

    it('should validate first_name length', async () => {
      const response = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', 'Bearer test-token')
        .send({ first_name: '' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate avatar_url format', async () => {
      const response = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', 'Bearer test-token')
        .send({ avatar_url: 'not-a-url' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should allow setting avatar_url to null', async () => {
      const updatedProfile = {
        ...mockProfile,
        avatar_url: null,
      };

      vi.mocked(profileRepository.findByClerkUserId).mockResolvedValue(mockProfile);
      vi.mocked(profileRepository.updateByClerkUserId).mockResolvedValue(updatedProfile);

      const response = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', 'Bearer test-token')
        .send({ avatar_url: null });

      expect(response.status).toBe(200);
      expect(response.body.data.avatarUrl).toBeNull();
    });

    it('should create profile if not exists during update', async () => {
      vi.mocked(profileRepository.findByClerkUserId).mockResolvedValue(null);
      vi.mocked(profileRepository.create).mockResolvedValue({
        ...mockProfile,
        first_name: 'NewName',
      });

      const response = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', 'Bearer test-token')
        .send({ first_name: 'NewName' });

      expect(response.status).toBe(200);
      expect(profileRepository.create).toHaveBeenCalled();
    });

    it('should reject unknown fields silently (Zod strips them)', async () => {
      const updatedProfile = {
        ...mockProfile,
        first_name: 'ValidName',
      };

      vi.mocked(profileRepository.findByClerkUserId).mockResolvedValue(mockProfile);
      vi.mocked(profileRepository.updateByClerkUserId).mockResolvedValue(updatedProfile);

      const response = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', 'Bearer test-token')
        .send({
          first_name: 'ValidName',
          unknown_field: 'should be ignored',
          plan: 'enterprise', // should not be updatable
        });

      expect(response.status).toBe(200);
      // Verify only first_name was passed to update
      expect(profileRepository.updateByClerkUserId).toHaveBeenCalledWith(
        'test-user-id',
        { first_name: 'ValidName' }
      );
    });
  });
});
