import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseKey);

export const subscribeToLeads = (onInsert, onUpdate, onDelete) => {
  return supabase
    .channel('leads-channel')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'leads' },
      (payload) => onInsert(payload.new)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'leads' },
      (payload) => onUpdate(payload.new)
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'leads' },
      (payload) => onDelete(payload.old.id)
    )
    .subscribe();
};
