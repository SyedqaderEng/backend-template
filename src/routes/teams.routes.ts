import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireUserId } from '../middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

const router = Router();

// In-memory team storage (in production, use Supabase)
interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
}

interface Team {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const teams: Team[] = [];
const teamMembers: TeamMember[] = [];

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       slug:
 *                         type: string
 *                       role:
 *                         type: string
 *                         enum: [owner, admin, member]
 *                       memberCount:
 *                         type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/',
  authMiddleware,
  async (req: Request, res: Response) => {
    const clerkUserId = requireUserId(req);

    // Get teams user is a member of
    const userTeamMemberships = teamMembers.filter((m) => m.userId === clerkUserId);
    const userTeams = userTeamMemberships.map((membership) => {
      const team = teams.find((t) => t.id === membership.teamId);
      if (!team) return null;

      const memberCount = teamMembers.filter((m) => m.teamId === team.id).length;

      return {
        id: team.id,
        name: team.name,
        slug: team.slug,
        description: team.description,
        role: membership.role,
        memberCount,
        createdAt: team.createdAt.toISOString(),
      };
    }).filter(Boolean);

    res.status(200).json({
      success: true,
      data: userTeams,
    });
  }
);

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
 *                 minLength: 2
 *                 maxLength: 100
 *               slug:
 *                 type: string
 *                 pattern: '^[a-z0-9-]+$'
 *               description:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: Team created successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
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
      if (teams.some((t) => t.slug === slug)) {
        throw new ApiError(400, 'Team slug already exists');
      }

      const team: Team = {
        id: randomUUID(),
        name,
        slug,
        ownerId: clerkUserId,
        description: description || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      teams.push(team);

      // Add creator as owner
      teamMembers.push({
        id: randomUUID(),
        userId: clerkUserId,
        teamId: team.id,
        role: 'owner',
        joinedAt: new Date(),
      });

      logger.info({ clerkUserId, teamId: team.id, slug }, 'Team created');

      res.status(201).json({
        success: true,
        data: {
          id: team.id,
          name: team.name,
          slug: team.slug,
          description: team.description,
          createdAt: team.createdAt.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

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
router.get(
  '/:teamId',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);
      const { teamId } = req.params;

      const team = teams.find((t) => t.id === teamId);
      if (!team) {
        throw new ApiError(404, 'Team not found');
      }

      // Check membership
      const membership = teamMembers.find(
        (m) => m.teamId === teamId && m.userId === clerkUserId
      );
      if (!membership) {
        throw new ApiError(403, 'Access denied to this team');
      }

      const members = teamMembers
        .filter((m) => m.teamId === teamId)
        .map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
        }));

      res.status(200).json({
        success: true,
        data: {
          id: team.id,
          name: team.name,
          slug: team.slug,
          description: team.description,
          ownerId: team.ownerId,
          members,
          memberCount: members.length,
          createdAt: team.createdAt.toISOString(),
          updatedAt: team.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

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
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  '/:teamId',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);
      const { teamId } = req.params;

      const team = teams.find((t) => t.id === teamId);
      if (!team) {
        throw new ApiError(404, 'Team not found');
      }

      // Check admin/owner role
      const membership = teamMembers.find(
        (m) => m.teamId === teamId && m.userId === clerkUserId
      );
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

      if (validationResult.data.name) {
        team.name = validationResult.data.name;
      }
      if (validationResult.data.description !== undefined) {
        team.description = validationResult.data.description;
      }
      team.updatedAt = new Date();

      logger.info({ clerkUserId, teamId }, 'Team updated');

      res.status(200).json({
        success: true,
        data: {
          id: team.id,
          name: team.name,
          slug: team.slug,
          description: team.description,
          updatedAt: team.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

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
router.delete(
  '/:teamId',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);
      const { teamId } = req.params;

      const teamIndex = teams.findIndex((t) => t.id === teamId);
      if (teamIndex === -1) {
        throw new ApiError(404, 'Team not found');
      }

      const team = teams[teamIndex];
      if (team.ownerId !== clerkUserId) {
        throw new ApiError(403, 'Only the team owner can delete the team');
      }

      // Remove team and all memberships
      teams.splice(teamIndex, 1);
      const memberIndicesToRemove = teamMembers
        .map((m, i) => (m.teamId === teamId ? i : -1))
        .filter((i) => i !== -1)
        .reverse();
      memberIndicesToRemove.forEach((i) => teamMembers.splice(i, 1));

      logger.info({ clerkUserId, teamId }, 'Team deleted');

      res.status(200).json({
        success: true,
        message: 'Team deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

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
router.get(
  '/:teamId/members',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);
      const { teamId } = req.params;

      const team = teams.find((t) => t.id === teamId);
      if (!team) {
        throw new ApiError(404, 'Team not found');
      }

      // Check membership
      const membership = teamMembers.find(
        (m) => m.teamId === teamId && m.userId === clerkUserId
      );
      if (!membership) {
        throw new ApiError(403, 'Access denied to this team');
      }

      const members = teamMembers
        .filter((m) => m.teamId === teamId)
        .map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
        }));

      res.status(200).json({
        success: true,
        data: members,
      });
    } catch (error) {
      next(error);
    }
  }
);

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
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  '/:teamId/invite',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);
      const { teamId } = req.params;

      const team = teams.find((t) => t.id === teamId);
      if (!team) {
        throw new ApiError(404, 'Team not found');
      }

      // Check admin/owner role
      const membership = teamMembers.find(
        (m) => m.teamId === teamId && m.userId === clerkUserId
      );
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

      // In production, send invitation email and store pending invitation
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
  }
);

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
router.delete(
  '/:teamId/members/:memberId',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);
      const { teamId, memberId } = req.params;

      const team = teams.find((t) => t.id === teamId);
      if (!team) {
        throw new ApiError(404, 'Team not found');
      }

      // Check admin/owner role
      const requestingMembership = teamMembers.find(
        (m) => m.teamId === teamId && m.userId === clerkUserId
      );
      if (!requestingMembership || requestingMembership.role === 'member') {
        throw new ApiError(403, 'Only team admins can remove members');
      }

      const memberIndex = teamMembers.findIndex(
        (m) => m.id === memberId && m.teamId === teamId
      );
      if (memberIndex === -1) {
        throw new ApiError(404, 'Member not found');
      }

      const member = teamMembers[memberIndex];
      if (member.role === 'owner') {
        throw new ApiError(400, 'Cannot remove the team owner');
      }

      teamMembers.splice(memberIndex, 1);

      logger.info({ clerkUserId, teamId, memberId }, 'Team member removed');

      res.status(200).json({
        success: true,
        message: 'Member removed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

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
router.post(
  '/:teamId/leave',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkUserId = requireUserId(req);
      const { teamId } = req.params;

      const team = teams.find((t) => t.id === teamId);
      if (!team) {
        throw new ApiError(404, 'Team not found');
      }

      const memberIndex = teamMembers.findIndex(
        (m) => m.teamId === teamId && m.userId === clerkUserId
      );
      if (memberIndex === -1) {
        throw new ApiError(404, 'You are not a member of this team');
      }

      const member = teamMembers[memberIndex];
      if (member.role === 'owner') {
        throw new ApiError(400, 'Owners must transfer ownership before leaving');
      }

      teamMembers.splice(memberIndex, 1);

      logger.info({ clerkUserId, teamId }, 'User left team');

      res.status(200).json({
        success: true,
        message: 'Left team successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as teamsRouter };
