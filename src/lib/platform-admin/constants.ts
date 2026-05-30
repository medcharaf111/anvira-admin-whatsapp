// ----------------------------------------------------------------------------
// Phase 2 §5.3 — shared constants for platform-admin tier changes.
//
// ACK_PHRASE is the verbatim acknowledgement string a super-admin must type
// before confirming a tier downgrade. It MUST match byte-for-byte between:
//   * the server-side validator in
//     src/app/api/platform-admin/tenants/[id]/tier/route.ts (Deliv 3)
//   * the client-side check in
//     src/components/platform-admin/change-tier-modal.tsx (Deliv 5)
//
// Any drift here lets a downgrade slip past one of the two enforcement
// points. Both sides import from this file; do not inline.
// ----------------------------------------------------------------------------

export const ACK_PHRASE =
  'I have confirmed the tenant has been informed of their continuing AML obligations';
