import { getSupabaseAdmin } from '../supabase';
import { logger } from '../../utils/logger';
import { createHash, randomBytes } from 'crypto';

export interface UserSession {
  id: string;
  user_id: string;
  session_token: string;
  device_info: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  last_active_at: string;
  expires_at: string;
  created_at: string;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  device_info: Record<string, unknown>;
  ip_address: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export const sessionsRepository = {
  // Sessions
  async createSession(
    userId: string,
    options: {
      deviceInfo?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
      expiresInDays?: number;
    }
  ): Promise<{ session: UserSession; token: string }> {
    const supabase = getSupabaseAdmin();
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (options.expiresInDays || 7));

    const { data, error } = await supabase
      .from('user_sessions')
      .insert({
        user_id: userId,
        session_token: token,
        device_info: options.deviceInfo || {},
        ip_address: options.ipAddress || null,
        user_agent: options.userAgent || null,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create session');
      throw error;
    }

    return { session: data, token };
  },

  async findSessionByToken(token: string): Promise<UserSession | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('session_token', token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  },

  async findSessionsByUserId(userId: string): Promise<UserSession[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('last_active_at', { ascending: false });

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch sessions');
      throw error;
    }

    return data || [];
  },

  async updateSessionActivity(sessionId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('user_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', sessionId);
  },

  async deleteSession(sessionId: string, userId: string): Promise<boolean> {
    const supabase = getSupabaseAdmin();
    const { error, count } = await supabase
      .from('user_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ error: error.message }, 'Failed to delete session');
      throw error;
    }

    return (count || 0) > 0;
  },

  async deleteAllUserSessions(userId: string): Promise<number> {
    const supabase = getSupabaseAdmin();
    const { error, count } = await supabase
      .from('user_sessions')
      .delete()
      .eq('user_id', userId);

    if (error) {
      logger.error({ error: error.message }, 'Failed to delete all sessions');
      throw error;
    }

    return count || 0;
  },

  // Refresh Tokens
  async createRefreshToken(
    userId: string,
    options: {
      deviceInfo?: Record<string, unknown>;
      ipAddress?: string;
      expiresInDays?: number;
    }
  ): Promise<{ refreshToken: RefreshToken; token: string }> {
    const supabase = getSupabaseAdmin();
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (options.expiresInDays || 30));

    const { data, error } = await supabase
      .from('refresh_tokens')
      .insert({
        user_id: userId,
        token_hash: tokenHash,
        device_info: options.deviceInfo || {},
        ip_address: options.ipAddress || null,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create refresh token');
      throw error;
    }

    return { refreshToken: data, token };
  },

  async findRefreshToken(token: string): Promise<RefreshToken | null> {
    const supabase = getSupabaseAdmin();
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const { data, error } = await supabase
      .from('refresh_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  },

  async revokeRefreshToken(tokenId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', tokenId);
  },

  async revokeAllUserRefreshTokens(userId: string): Promise<number> {
    const supabase = getSupabaseAdmin();
    const { error, count } = await supabase
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);

    if (error) {
      logger.error({ error: error.message }, 'Failed to revoke all refresh tokens');
      throw error;
    }

    return count || 0;
  }
};
