import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoReadOnly } from './demoReadOnly';

function createResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn()
  } as unknown as Response;

  vi.mocked(response.status).mockReturnValue(response);
  return response;
}

function createRequest(method: string, isDemo: boolean) {
  return {
    method,
    headers: { 'x-request-id': 'demo-request' },
    user: {
      _id: 'user-1',
      userId: 'user-1',
      role: 'customer',
      branchIds: [],
      isDemo
    }
  } as unknown as Request;
}

describe('demoReadOnly middleware', () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = createResponse();
    next = vi.fn();
  });

  it('allows demo users to read data', () => {
    demoReadOnly(createRequest('GET', true), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects demo writes with a stable error code', () => {
    demoReadOnly(createRequest('POST', true), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'DEMO_READ_ONLY' })
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('does not affect normal authenticated users', () => {
    demoReadOnly(createRequest('DELETE', false), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
