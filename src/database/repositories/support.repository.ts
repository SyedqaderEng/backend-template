import { getSupabaseAdmin } from '../supabase';
import { logger } from '../../utils/logger';

export interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  description: string;
  category: 'billing' | 'technical' | 'account' | 'feature_request' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_staff: boolean;
  created_at: string;
}

export interface ErrorReport {
  id: string;
  user_id: string | null;
  error_type: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
  url: string | null;
  user_agent: string | null;
  created_at: string;
}

export const supportRepository = {
  // Tickets
  async findTicketsByUserId(
    userId: string,
    options?: { status?: string; limit?: number }
  ): Promise<SupportTicket[]> {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch tickets');
      throw error;
    }

    return data || [];
  },

  async findAllTickets(options?: {
    status?: string;
    priority?: string;
    limit?: number
  }): Promise<SupportTicket[]> {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    if (options?.priority) {
      query = query.eq('priority', options.priority);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch all tickets');
      throw error;
    }

    return data || [];
  },

  async findTicketById(ticketId: string): Promise<SupportTicket | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  },

  async createTicket(ticket: Omit<SupportTicket, 'id' | 'created_at' | 'updated_at' | 'resolved_at' | 'assigned_to'>): Promise<SupportTicket> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        ...ticket,
        status: 'open',
        assigned_to: null
      })
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create ticket');
      throw error;
    }

    return data;
  },

  async updateTicket(ticketId: string, updates: Partial<SupportTicket>): Promise<SupportTicket> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('support_tickets')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to update ticket');
      throw error;
    }

    return data;
  },

  async closeTicket(ticketId: string): Promise<SupportTicket> {
    return this.updateTicket(ticketId, {
      status: 'closed',
      resolved_at: new Date().toISOString()
    });
  },

  async reopenTicket(ticketId: string): Promise<SupportTicket> {
    return this.updateTicket(ticketId, {
      status: 'open',
      resolved_at: null
    });
  },

  // Messages
  async getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch ticket messages');
      throw error;
    }

    return data || [];
  },

  async createMessage(message: Omit<TicketMessage, 'id' | 'created_at'>): Promise<TicketMessage> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('ticket_messages')
      .insert(message)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create message');
      throw error;
    }

    // Update ticket's updated_at
    await supabase
      .from('support_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', message.ticket_id);

    return data;
  },

  // Error Reports
  async createErrorReport(report: Omit<ErrorReport, 'id' | 'created_at'>): Promise<ErrorReport> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('error_reports')
      .insert(report)
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Failed to create error report');
      throw error;
    }

    return data;
  },

  async getErrorReports(options?: {
    errorType?: string;
    limit?: number
  }): Promise<ErrorReport[]> {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('error_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (options?.errorType) {
      query = query.eq('error_type', options.errorType);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error: error.message }, 'Failed to fetch error reports');
      throw error;
    }

    return data || [];
  }
};
