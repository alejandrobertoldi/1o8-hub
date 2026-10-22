"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { hasAdminPowers } from "@/lib/roles";
import {
  loadVisibleClients,
  parseClientIdCodes,
  persistVisibleClients,
  resolveActivePortalClient,
  toggleVisibleClient,
} from "@/lib/client-codes";

type PortalVisibleClientsValue = {
  assigned: string[];
  visible: string[];
  setClientEnabled: (code: string, enabled: boolean) => void;
  showPicker: boolean;
  ready: boolean;
};

const PortalVisibleClientsContext = createContext<PortalVisibleClientsValue | null>(null);

export function PortalVisibleClientsProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const previewClient = isAdmin ? searchParams.get("client") : null;
  const assigned = useMemo(
    () => (previewClient ? [previewClient] : parseClientIdCodes(session?.user?.clientIdCode)),
    [previewClient, session?.user?.clientIdCode],
  );

  const [visible, setVisible] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const assignedKey = assigned.join(",");

  useLayoutEffect(() => {
    const codes = assignedKey ? assignedKey.split(",") : [];
    setVisible(codes.length === 0 ? [] : loadVisibleClients(codes));
    setReady(true);
  }, [assignedKey]);

  const normalizedVisible = useMemo(() => {
    if (!ready) return [];
    const next = assigned.filter((c) => visible.includes(c));
    return next.length > 0 ? next : assigned;
  }, [assigned, visible, ready]);

  const setClientEnabled = useCallback((code: string, enabled: boolean) => {
    setVisible((prev) => {
      const next = toggleVisibleClient(assigned, prev, code, enabled);
      persistVisibleClients(next);
      return next;
    });
  }, [assigned]);

  const value = useMemo<PortalVisibleClientsValue>(
    () => ({
      assigned,
      visible: normalizedVisible,
      setClientEnabled,
      showPicker: !previewClient && assigned.length > 1,
      ready,
    }),
    [assigned, normalizedVisible, setClientEnabled, previewClient, ready],
  );

  return (
    <PortalVisibleClientsContext.Provider value={value}>
      {children}
    </PortalVisibleClientsContext.Provider>
  );
}

export function usePortalVisibleClients(): PortalVisibleClientsValue {
  const ctx = useContext(PortalVisibleClientsContext);
  if (!ctx) {
    return {
      assigned: [],
      visible: [],
      setClientEnabled: () => {},
      showPicker: false,
      ready: true,
    };
  }
  return ctx;
}

export function useActivePortalClientCode(): { clientIdCode: string | null; ready: boolean } {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const isAdmin = hasAdminPowers(session?.user?.role);
  const { visible, ready } = usePortalVisibleClients();
  const clientIdCode = resolveActivePortalClient(
    visible,
    searchParams.get("client"),
    isAdmin,
  );
  return { clientIdCode, ready: ready && status !== "loading" };
}

export function portalClientQuery(clientIdCode: string): string {
  return `?client=${encodeURIComponent(clientIdCode)}`;
}

export function usePortalClientParam(): string {
  const { clientIdCode } = useActivePortalClientCode();
  return clientIdCode ? portalClientQuery(clientIdCode) : "";
}
