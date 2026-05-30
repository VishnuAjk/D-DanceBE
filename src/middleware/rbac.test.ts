import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth, requireBranchAccess, requireRole } from './rbac';

function createResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn()
  } as unknown as Response;

  vi.mocked(response.status).mockReturnValue(response);
  return response;
}

describe('rbac middleware', () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = createResponse();
    next = vi.fn();
  });

  it('requireRole rejects customer users for super_admin access', () => {
    const req = {
      headers: { 'x-request-id': 'req-1' },
      user: {
        _id: 'user-1',
        userId: 'user-1',
        role: 'customer',
        branchIds: ['branch-1']
      }
    } as unknown as Request;

    requireRole('super_admin')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' })
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('requireBranchAccess allows super_admin to bypass branch checks', () => {
    const req = {
      headers: { 'x-request-id': 'req-2' },
      params: { branchId: 'branch-9' },
      user: {
        _id: 'user-2',
        userId: 'user-2',
        role: 'super_admin',
        branchIds: []
      }
    } as unknown as Request;

    requireBranchAccess((request) => request.params.branchId)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('requireAuth rejects requests without req.user', () => {
    const req = {
      headers: { 'x-request-id': 'req-3' }
    } as unknown as Request;

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'UNAUTHORIZED' })
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
