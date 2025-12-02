import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { logger } from '../utils/logger';
import { teamsRepository } from '../database';

const router = Router();

/**
 * Team creation schema
 */
const createTeamSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and dashes only'),
  description: z.string().max(500).optional(),
});

/**
 * Team update schema
 */
const updateTeamSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
});

/**
 * Invite member schema
 */
const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']),
});

/**
 * @openapi
 * /v1/teams:
 *   get:
 *     summary: List user's teams
 *     description: Get all teams the authenticated user belongs to
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Teams list retrieved successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const userTeams = await teamsRepository.findByUserId(clerkUserId);

    res.status(200).json({
      success: true,
      data: userTeams.map((team) => ({
        id: team.id,
        name: team.name,
        slug: team.slug,
        description: team.description,
        role: team.role,
        memberCount: team.member_count,
        createdAt: team.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/teams:
 *   post:
 *     summary: Create a new team
 *     description: Create a new team with the authenticated user as owner
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - slug
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Team created successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);

    const validationResult = createTeamSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new ApiError(400, 'Validation failed', errors);
    }

    const { name, slug, description } = validationResult.data;

    // Check if slug is unique
    const existingTeam = await teamsRepository.findBySlug(slug);
    if (existingTeam) {
      throw new ApiError(400, 'Team slug already exists');
    }

    // Create team
    const team = await teamsRepository.create({
      name,
      slug,
      owner_id: clerkUserId,
      description: description || null,
    });

    // Add creator as owner
    await teamsRepository.addMember({
      team_id: team.id,
      user_id: clerkUserId,
      role: 'owner',
    });

    logger.info({ clerkUserId, teamId: team.id, slug }, 'Team created');

    res.status(201).json({
      success: true,
      data: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        description: team.description,
        createdAt: team.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/teams/{teamId}:
 *   get:
 *     summary: Get team details
 *     description: Get details of a specific team
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: teamId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Team details retrieved successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:teamId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const { teamId } = req.params;

    const team = await teamsRepository.findById(teamId);
    if (!team) {
      throw new ApiError(404, 'Team not found');
    }

    // Check membership
    const membership = await teamsRepository.getMember(teamId, clerkUserId);
    if (!membership) {
      throw new ApiError(403, 'Access denied to this team');
    }

    const members = await teamsRepository.getMembers(teamId);

    res.status(200).json({
      success: true,
      data: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        description: team.description,
        ownerId: team.owner_id,
        members: members.map((m) => ({
          id: m.id,
          userId: m.user_id,
          role: m.role,
          joinedAt: m.joined_at,
        })),
        memberCount: members.length,
        createdAt: team.created_at,
        updatedAt: team.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/teams/{teamId}:
 *   put:
 *     summary: Update team
 *     description: Update team details. Requires owner or admin role.
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: teamId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Team updated successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/:teamId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const { teamId } = req.params;

    const team = await teamsRepository.findById(teamId);
    if (!team) {
      throw new ApiError(404, 'Team not found');
    }

    // Check admin/owner role
    const membership = await teamsRepository.getMember(teamId, clerkUserId);
    if (!membership || membership.role === 'member') {
      throw new ApiError(403, 'Only team admins can update team details');
    }

    const validationResult = updateTeamSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new ApiError(400, 'Validation failed', errors);
    }

    const updates: { name?: string; description?: string } = {};
    if (validationResult.data.name) {
      updates.name = validationResult.data.name;
    }
    if (validationResult.data.description !== undefined) {
      updates.description = validationResult.data.description;
    }

    const updatedTeam = await teamsRepository.update(teamId, updates);

    logger.info({ clerkUserId, teamId }, 'Team updated');

    res.status(200).json({
      success: true,
      data: {
        id: updatedTeam.id,
        name: updatedTeam.name,
        slug: updatedTeam.slug,
        description: updatedTeam.description,
        updatedAt: updatedTeam.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/teams/{teamId}:
 *   delete:
 *     summary: Delete team
 *     description: Delete a team. Only the owner can delete a team.
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: teamId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Team deleted successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:teamId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const { teamId } = req.params;

    const team = await teamsRepository.findById(teamId);
    if (!team) {
      throw new ApiError(404, 'Team not found');
    }

    if (team.owner_id !== clerkUserId) {
      throw new ApiError(403, 'Only the team owner can delete the team');
    }

    await teamsRepository.delete(teamId);

    logger.info({ clerkUserId, teamId }, 'Team deleted');

    res.status(200).json({
      success: true,
      message: 'Team deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/teams/{teamId}/members:
 *   get:
 *     summary: List team members
 *     description: Get all members of a team
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: teamId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Team members retrieved successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:teamId/members', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const { teamId } = req.params;

    const team = await teamsRepository.findById(teamId);
    if (!team) {
      throw new ApiError(404, 'Team not found');
    }

    // Check membership
    const membership = await teamsRepository.getMember(teamId, clerkUserId);
    if (!membership) {
      throw new ApiError(403, 'Access denied to this team');
    }

    const members = await teamsRepository.getMembers(teamId);

    res.status(200).json({
      success: true,
      data: members.map((m) => ({
        id: m.id,
        userId: m.user_id,
        role: m.role,
        joinedAt: m.joined_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/teams/{teamId}/invite:
 *   post:
 *     summary: Invite member to team
 *     description: Send an invitation to join the team. Requires admin role.
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: teamId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [admin, member]
 *     responses:
 *       200:
 *         description: Invitation sent successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/:teamId/invite', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const { teamId } = req.params;

    const team = await teamsRepository.findById(teamId);
    if (!team) {
      throw new ApiError(404, 'Team not found');
    }

    // Check admin/owner role
    const membership = await teamsRepository.getMember(teamId, clerkUserId);
    if (!membership || membership.role === 'member') {
      throw new ApiError(403, 'Only team admins can invite members');
    }

    const validationResult = inviteMemberSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new ApiError(400, 'Validation failed', errors);
    }

    const { email, role } = validationResult.data;

    logger.info({ clerkUserId, teamId, email, role }, 'Team invitation sent');

    // TODO: Send invitation email via Resend and store pending invitation
    res.status(200).json({
      success: true,
      message: `Invitation sent to ${email}`,
      data: {
        email,
        role,
        invitedBy: clerkUserId,
        invitedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/teams/{teamId}/members/{memberId}:
 *   delete:
 *     summary: Remove team member
 *     description: Remove a member from the team. Requires admin role.
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: teamId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: memberId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:teamId/members/:memberId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const { teamId, memberId } = req.params;

    const team = await teamsRepository.findById(teamId);
    if (!team) {
      throw new ApiError(404, 'Team not found');
    }

    // Check admin/owner role
    const requestingMembership = await teamsRepository.getMember(teamId, clerkUserId);
    if (!requestingMembership || requestingMembership.role === 'member') {
      throw new ApiError(403, 'Only team admins can remove members');
    }

    const members = await teamsRepository.getMembers(teamId);
    const memberToRemove = members.find((m) => m.id === memberId);

    if (!memberToRemove) {
      throw new ApiError(404, 'Member not found');
    }

    if (memberToRemove.role === 'owner') {
      throw new ApiError(400, 'Cannot remove the team owner');
    }

    await teamsRepository.removeMember(memberId);

    logger.info({ clerkUserId, teamId, memberId }, 'Team member removed');

    res.status(200).json({
      success: true,
      message: 'Member removed successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /v1/teams/{teamId}/leave:
 *   post:
 *     summary: Leave team
 *     description: Leave a team. Owners cannot leave without transferring ownership.
 *     tags: [Teams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: teamId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Left team successfully
 *       400:
 *         description: Cannot leave as owner
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/:teamId/leave', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = requireUserId(req);
    const { teamId } = req.params;

    const team = await teamsRepository.findById(teamId);
    if (!team) {
      throw new ApiError(404, 'Team not found');
    }

    const membership = await teamsRepository.getMember(teamId, clerkUserId);
    if (!membership) {
      throw new ApiError(404, 'You are not a member of this team');
    }

    if (membership.role === 'owner') {
      throw new ApiError(400, 'Owners must transfer ownership before leaving');
    }

    await teamsRepository.removeMemberByUserId(teamId, clerkUserId);

    logger.info({ clerkUserId, teamId }, 'User left team');

    res.status(200).json({
      success: true,
      message: 'Left team successfully',
    });
  } catch (error) {
    next(error);
  }
});

export { router as teamsRouter };
