import { sb } from './supabase.js';

export const feedbackMissing = (e) => !!e && (e.code === 'PGRST202' || e.code === '42883' || /bb_feedback/i.test(e.message || ''));

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    const e = new Error(error.message);
    e.code = error.code;
    e.missing = feedbackMissing(error);
    throw e;
  }
  return data;
}

export const sendFeedback = ({ source, kind, message, context = {} }) => rpc('bb_feedback_send', {
  p_source: source,
  p_kind: kind,
  p_message: message,
  p_context: context,
});

export const loadAdminFeedback = ({ status = null, source = null } = {}) => rpc('bb_admin_feedback', {
  p_status: status || null,
  p_source: source || null,
});

export const setAdminFeedback = ({ id, status = null, remove = false }) => rpc('bb_admin_feedback_set', {
  p_id: id,
  p_status: status,
  p_delete: remove,
});
