import { ObjectIdString } from '@danceapp/shared';
import { Router, type Router as ExpressRouter, type Request } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../models/AuditLog';
import { Video } from '../../models/Video';
import { sendSuccess } from '../../utils/response';

export const videosRouter: ExpressRouter = Router();

const VideoBodySchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(1000).optional(),
  videoUrl: z.string().url(),
  courseId: ObjectIdString.optional(),
  levelId: ObjectIdString.optional(),
  branchIds: z.array(ObjectIdString).default([]),
  tags: z.array(z.string().min(1).max(40)).max(12).default([]),
  isPublished: z.boolean().optional()
});

const VideoUpdateSchema = VideoBodySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field must be provided'
);

function getYoutubeEmbedData(url: string) {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);

  if (!match) {
    throw new AppError(400, 'INVALID_YOUTUBE_URL', 'Not a valid YouTube URL');
  }

  const videoId = match[1];

  return {
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  };
}

function sanitizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
}

function assertBranchAccess(branchIds: string[], user: Request['user']) {
  if (!user || user.role === 'super_admin') {
    return;
  }

  const allowed = new Set(user.branchIds);
  const unauthorized = branchIds.find((branchId) => !allowed.has(branchId));

  if (unauthorized) {
    throw new AppError(403, 'BRANCH_ACCESS_DENIED', 'You do not have access to one or more selected branches');
  }
}

async function findVideoForAdmin(videoId: string) {
  const video = await Video.findById(videoId);

  if (!video) {
    throw new AppError(404, 'NOT_FOUND', 'Video not found');
  }

  return video;
}

videosRouter.get('/', async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = {};

    if (req.user?.role === 'branch_admin') {
      filter.branchIds = { $in: req.user.branchIds };
    }

    const videos = await Video.find(filter)
      .populate('courseId', 'name')
      .populate('levelId', 'name order')
      .populate('branchIds', 'name city')
      .sort({ createdAt: -1 });

    return sendSuccess(req, res, videos);
  } catch (err) {
    return next(err);
  }
});

videosRouter.post('/', async (req, res, next) => {
  try {
    const payload = VideoBodySchema.parse(req.body);
    const resolvedBranchIds =
      req.user?.role === 'branch_admin' && payload.branchIds.length === 0
        ? req.user.branchIds
        : payload.branchIds;

    assertBranchAccess(resolvedBranchIds, req.user);
    const { embedUrl, thumbnailUrl } = getYoutubeEmbedData(payload.videoUrl);
    const video = await Video.create({
      ...payload,
      branchIds: resolvedBranchIds,
      tags: sanitizeTags(payload.tags),
      videoUrl: embedUrl,
      thumbnailUrl,
      publishedAt: payload.isPublished ? new Date() : undefined,
      createdBy: req.user!._id
    });

    await logAudit({
      actorId: req.user!._id,
      action: 'VIDEO_CREATED',
      resourceType: 'video',
      resourceId: String(video._id),
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, video, 201);
  } catch (err) {
    return next(err);
  }
});

videosRouter.put('/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const payload = VideoUpdateSchema.parse(req.body);
    const existing = await findVideoForAdmin(id);

    if (req.user?.role === 'branch_admin') {
      assertBranchAccess(existing.branchIds.map((branchId) => String(branchId)), req.user);
    }

    if (payload.branchIds) {
      assertBranchAccess(payload.branchIds, req.user);
    }

    const update: Record<string, unknown> = {
      ...payload
    };

    if (payload.tags) {
      update.tags = sanitizeTags(payload.tags);
    }

    if (payload.videoUrl) {
      const { embedUrl, thumbnailUrl } = getYoutubeEmbedData(payload.videoUrl);
      update.videoUrl = embedUrl;
      update.thumbnailUrl = thumbnailUrl;
    }

    if (payload.isPublished === true && !existing.publishedAt) {
      update.publishedAt = new Date();
    }

    if (payload.isPublished === false) {
      update.publishedAt = undefined;
    }

    const updated = await Video.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true
    });

    await logAudit({
      actorId: req.user!._id,
      action: 'VIDEO_UPDATED',
      resourceType: 'video',
      resourceId: id,
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, updated);
  } catch (err) {
    return next(err);
  }
});

videosRouter.delete('/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const video = await findVideoForAdmin(id);

    if (req.user?.role === 'branch_admin') {
      assertBranchAccess(video.branchIds.map((branchId) => String(branchId)), req.user);
    }

    await video.deleteOne();

    await logAudit({
      actorId: req.user!._id,
      action: 'VIDEO_DELETED',
      resourceType: 'video',
      resourceId: id,
      payload: { title: video.title },
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, { deleted: true });
  } catch (err) {
    return next(err);
  }
});
