import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
} from '../../src/lib/api/errors';

describe('Error classes', () => {
  describe('AppError', () => {
    it('sets the correct properties', () => {
      const error = new AppError('test message', 418, 'TEAPOT', { key: 'value' });
      expect(error.message).toBe('test message');
      expect(error.statusCode).toBe(418);
      expect(error.code).toBe('TEAPOT');
      expect(error.details).toEqual({ key: 'value' });
      expect(error.name).toBe('AppError');
    });

    it('produces correct JSON with details', () => {
      const error = new AppError('test', 400, 'TEST', { field: 'name' });
      expect(error.toJSON()).toEqual({
        error: {
          code: 'TEST',
          message: 'test',
          details: { field: 'name' },
        },
      });
    });

    it('omits details from JSON when not provided', () => {
      const error = new AppError('test', 400, 'TEST');
      const json = error.toJSON();
      expect(json.error).not.toHaveProperty('details');
      expect(json).toEqual({
        error: { code: 'TEST', message: 'test' },
      });
    });

    it('is an instance of Error', () => {
      const error = new AppError('test', 400, 'TEST');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ValidationError', () => {
    it('returns 400 status code', () => {
      const error = new ValidationError('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
    });

    it('is an instance of AppError', () => {
      const error = new ValidationError('Invalid input');
      expect(error).toBeInstanceOf(AppError);
    });

    it('supports details', () => {
      const error = new ValidationError('Invalid', { fields: ['email'] });
      expect(error.details).toEqual({ fields: ['email'] });
    });
  });

  describe('UnauthorizedError', () => {
    it('returns 401 status code', () => {
      const error = new UnauthorizedError();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.name).toBe('UnauthorizedError');
    });

    it('has a default message', () => {
      const error = new UnauthorizedError();
      expect(error.message).toBe('Authentication required');
    });

    it('accepts a custom message', () => {
      const error = new UnauthorizedError('Token expired');
      expect(error.message).toBe('Token expired');
    });
  });

  describe('ForbiddenError', () => {
    it('returns 403 status code', () => {
      const error = new ForbiddenError();
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.name).toBe('ForbiddenError');
    });
  });

  describe('NotFoundError', () => {
    it('returns 404 status code', () => {
      const error = new NotFoundError();
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.name).toBe('NotFoundError');
    });
  });

  describe('RateLimitError', () => {
    it('returns 429 status code', () => {
      const error = new RateLimitError();
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.name).toBe('RateLimitError');
    });
  });

  describe('JSON structure consistency', () => {
    const errorCases: Array<{
      name: string;
      error: AppError;
      expectedCode: string;
      expectedStatus: number;
    }> = [
      {
        name: 'ValidationError',
        error: new ValidationError('bad input'),
        expectedCode: 'VALIDATION_ERROR',
        expectedStatus: 400,
      },
      {
        name: 'UnauthorizedError',
        error: new UnauthorizedError(),
        expectedCode: 'UNAUTHORIZED',
        expectedStatus: 401,
      },
      {
        name: 'ForbiddenError',
        error: new ForbiddenError(),
        expectedCode: 'FORBIDDEN',
        expectedStatus: 403,
      },
      {
        name: 'NotFoundError',
        error: new NotFoundError(),
        expectedCode: 'NOT_FOUND',
        expectedStatus: 404,
      },
      {
        name: 'RateLimitError',
        error: new RateLimitError(),
        expectedCode: 'RATE_LIMIT_EXCEEDED',
        expectedStatus: 429,
      },
    ];

    for (const { name, error, expectedCode, expectedStatus } of errorCases) {
      it(`${name} has consistent JSON structure`, () => {
        const json = error.toJSON();
        expect(json).toHaveProperty('error');
        expect(json.error).toHaveProperty('code', expectedCode);
        expect(json.error).toHaveProperty('message');
        expect(error.statusCode).toBe(expectedStatus);
      });
    }
  });
});
