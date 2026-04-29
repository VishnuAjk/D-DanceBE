import type { Request, Response } from 'express';

export function sendSuccess<T>(
  req: Request,
  res: Response,
  data: T,
  statusCode = 200,
  pagination?: { page: number; limit: number; total: number }
) {
  const meta: Record<string, unknown> = {
    requestId: req.headers['x-request-id'] || 'N/A',
    timestamp: new Date().toISOString()
  };

  if (pagination) {
    meta.pagination = {
      ...pagination,
      totalPages: Math.ceil(pagination.total / pagination.limit)
    };
  }

  return res.status(statusCode).json({
    success: true,
    data,
    error: null,
    meta
  });
}
