import { getSupabaseAdmin } from '../supabase';
import { logger } from '../../utils/logger';

export interface Team {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
}

export const teamsRepository = {
  async findByUserId(userId: string): Promise<(Team & { role: string; member_count: number })[]> {
    const supabase = getSupabaseAdmin();

    // Get all teams where user is a member
    const { data: memberships, error: memberError } = await supabase
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', userId);

    if (memberError) {
      logger.error({ error: memberError.message }, 'Failed to fetch team memberships');
      throw memberError;
    }

    if (!memberships || memberships.length === 0) {
      return [];
    }

    const teamIds = memberships.map(m => m.team_id);

    // Get team details
    const { data: teams, error: teamError } = await supabase
      .from('teams')
      .select('*')
      .in('id', teamIds);

    if (teamError) {
      logger.error({ error: teamError.message }, 'Failed to fetch teams');
      throw teamError;
    }

    // Get member counts
    const result = await Promise.all((teams || []).map(async (team) => {
      const { count } = await supabase
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', team.id);

      const membership = memberships.find(m => m.team_id === team.id);
      return {
        ...team,
        role: membership?.role || 'member',
        member_count: count || 0
      };
    }));

    return result;
  },

  async findById(teamId: string): Promise<Team | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error({ error: error.message }, 'Failed to fetch team');
      throw error;
    }

    return data;
  },

  async findBySlug(slug: string): Promise<Team | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  },

  async create(team: Omit<Team, 'id' | 'created_at' | 'updated_at'>): Promise<Team> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('teams')
      .insert(team)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create team');
      throw error;
    }

    return data;
  },

  async update(teamId: string, updates: Partial<Pick<Team, 'name' | 'description'>>): Promise<Team> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('teams')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', teamId)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to update team');
      throw error;
    }

    return data;
  },

  async delete(teamId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId);

    if (error) {
      logger.error({ error: error.message }, 'Failed to delete team');
      throw error;
    }
  },

  async getMembers(teamId: string): Promise<TeamMember[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('team_id', teamId);

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch team members');
      throw error;
    }

    return data || [];
  },

  async getMember(teamId: string, userId: string): Promise<TeamMember | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  },

  async addMember(member: Omit<TeamMember, 'id' | 'joined_at'>): Promise<TeamMember> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_members')
      .insert(member)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to add team member');
      throw error;
    }

    return data;
  },

  async removeMember(memberId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      logger.error({ error: error.message }, 'Failed to remove team member');
      throw error;
    }
  },

  async removeMemberByUserId(teamId: string, userId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ error: error.message }, 'Failed to remove team member');
      throw error;
    }
  },

  async updateMemberRole(memberId: string, role: 'admin' | 'member'): Promise<TeamMember> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_members')
      .update({ role })
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to update member role');
      throw error;
    }

    return data;
  }
};
