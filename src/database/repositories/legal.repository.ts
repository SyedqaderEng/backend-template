import { getSupabaseAdmin } from '../supabase';
import { logger } from '../../utils/logger';

export interface LegalConsent {
  id: string;
  user_id: string;
  terms_accepted_at: string | null;
  terms_version: string | null;
  privacy_accepted_at: string | null;
  privacy_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface GdprRequest {
  id: string;
  user_id: string;
  request_type: 'export' | 'delete';
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  reason: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export const legalRepository = {
  // Consents
  async findConsentByUserId(userId: string): Promise<LegalConsent | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('legal_consents')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error({ error: error.message }, 'Failed to fetch legal consent');
      throw error;
    }

    return data;
  },

  async acceptTerms(userId: string, termsVersion: string, privacyVersion: string): Promise<LegalConsent> {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const existing = await this.findConsentByUserId(userId);

    if (existing) {
      const { data, error } = await supabase
        .from('legal_consents')
        .update({
          terms_accepted_at: now,
          terms_version: termsVersion,
          privacy_accepted_at: now,
          privacy_version: privacyVersion,
          updated_at: now
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error({ error: error.message }, 'Failed to update legal consent');
        throw error;
      }

      return data;
    }

    const { data, error } = await supabase
      .from('legal_consents')
      .insert({
        user_id: userId,
        terms_accepted_at: now,
        terms_version: termsVersion,
        privacy_accepted_at: now,
        privacy_version: privacyVersion
      })
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create legal consent');
      throw error;
    }

    return data;
  },

  // GDPR Requests
  async createGdprRequest(request: Omit<GdprRequest, 'id' | 'created_at' | 'completed_at'>): Promise<GdprRequest> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('gdpr_requests')
      .insert(request)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create GDPR request');
      throw error;
    }

    return data;
  },

  async findGdprRequestsByUserId(userId: string): Promise<GdprRequest[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('gdpr_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch GDPR requests');
      throw error;
    }

    return data || [];
  },

  async findPendingGdprRequest(userId: string, requestType: 'export' | 'delete'): Promise<GdprRequest | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('gdpr_requests')
      .select('*')
      .eq('user_id', userId)
      .eq('request_type', requestType)
      .in('status', ['pending', 'processing'])
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  },

  async updateGdprRequestStatus(requestId: string, status: GdprRequest['status']): Promise<GdprRequest> {
    const supabase = getSupabaseAdmin();
    const updates: Partial<GdprRequest> = { status };

    if (status === 'completed') {
      updates.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('gdpr_requests')
      .update(updates)
      .eq('id', requestId)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to update GDPR request');
      throw error;
    }

    return data;
  },

  async cancelGdprRequest(requestId: string, userId: string): Promise<GdprRequest | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('gdpr_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .eq('user_id', userId)
      .in('status', ['pending', 'processing'])
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error({ error: error.message }, 'Failed to cancel GDPR request');
      throw error;
    }

    return data;
  }
};
