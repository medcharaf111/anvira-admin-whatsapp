'use client';

// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md Phase 2 Completion Slice §3.4 — tenant detail
// page header actions + ChangeTierModal host.
//
// This client component owns:
//   * The open/closed state of the ChangeTierModal (Implementer D, Deliv 5).
//   * The two header buttons rendered at the top-right of the detail page:
//       1. [تغيير الباقة] — opens the modal.
//       2. [الذهاب لحساب المستأجِر] — placeholder for impersonation (Phase 3).
//   * A React context (ChangeTierActionContext) that exposes an
//     openChangeTier() opener. The Subscription tab's "تغيير الباقة"
//     link inside <TenantDetailTabs/> consumes this context so the
//     timeline button reuses the SAME modal instance — no second
//     useState dialog, no duplicated wiring.
//
// The provider intentionally wraps `children` (the tabs) so the tabs
// can render anywhere in the React tree below this component without
// prop drilling. If the consumer renders outside the provider the
// context returns a no-op, which lets <TenantDetailTabs/> be used in
// isolation (e.g. tests, Storybook) without crashing.
//
// onSuccess of the modal: we call router.refresh() to re-render the
// server component and pull a fresh tenant row + tier-change timeline,
// rather than reaching for window.location.reload() which would dump
// the user's scroll position and re-run every other RSC on the page.
// ----------------------------------------------------------------------------

import { createContext, useCallback, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { ChangeTierModal } from './change-tier-modal';
import type { TenantDetail } from '@/lib/platform-admin/tenant-detail-types';

// ───── Context for cross-tree modal triggering ─────

interface ChangeTierActionContextValue {
  openChangeTier: () => void;
}

const ChangeTierActionContext = createContext<ChangeTierActionContextValue>({
  // No-op fallback — safe to call when rendered outside a provider.
  openChangeTier: () => {},
});

/**
 * Consume the openChangeTier() trigger from anywhere in the subtree
 * rendered below <TenantActions/>. Used by <TenantDetailTabs/> for the
 * Subscription tab's "+ تغيير الباقة" button.
 */
export function useOpenChangeTier(): () => void {
  return useContext(ChangeTierActionContext).openChangeTier;
}

// ───── Component ─────

export function TenantActions({
  tenant,
  children,
}: {
  tenant: TenantDetail;
  /** Anything that should be able to call openChangeTier() — typically the tabs. */
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  const openChangeTier = useCallback(() => setModalOpen(true), []);
  const closeChangeTier = useCallback(() => setModalOpen(false), []);

  const onSuccess = useCallback(() => {
    setModalOpen(false);
    // Re-render the RSC tree so the tenant header chips, the overview
    // metadata, and the Subscription tab's timeline all update from
    // the freshly-mutated dashboard_clients + subscription_tier_changes.
    router.refresh();
  }, [router]);

  return (
    <ChangeTierActionContext.Provider value={{ openChangeTier }}>
      {/* Header buttons — rendered above the tabs, aligned end-of-row. */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <button
          type="button"
          onClick={openChangeTier}
          className="btn-primary"
        >
          تغيير الباقة
        </button>
        <button
          type="button"
          disabled
          title="ميزة قيد التطوير · Phase 3 impersonation"
          aria-disabled="true"
          className="btn-ghost inline-flex items-center gap-2"
          style={{ opacity: 0.5, cursor: 'not-allowed' }}
        >
          <span>الذهاب لحساب المستأجِر</span>
          <ExternalLink className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>

      {children}

      <ChangeTierModal
        tenant={tenant}
        open={modalOpen}
        onClose={closeChangeTier}
        onSuccess={onSuccess}
      />
    </ChangeTierActionContext.Provider>
  );
}
