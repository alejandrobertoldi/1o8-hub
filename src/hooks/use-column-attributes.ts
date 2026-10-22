"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnAttribute } from "@/lib/db/schema";

export type EnrichedAttribute = ColumnAttribute;

export type SubgroupData = {
  name: string;
  attributes: EnrichedAttribute[];
};

export type GroupData = {
  name: string;
  subgroups: SubgroupData[];
  totalFields: number;
};

async function fetchAttributes(
  clientCode?: string
): Promise<EnrichedAttribute[]> {
  const params = new URLSearchParams();
  if (clientCode) params.set("client", clientCode);
  const res = await fetch(`/api/attributes?${params}`);
  if (!res.ok) throw new Error("Failed to fetch column attributes");
  return res.json();
}

export function useColumnAttributes(clientCode?: string) {
  const { data: attributes = [], isLoading } = useQuery({
    queryKey: ["column-attributes", clientCode || "all"],
    queryFn: () => fetchAttributes(clientCode),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const groups = useMemo(() => {
    const groupMap = new Map<string, Map<string, EnrichedAttribute[]>>();

    for (const attr of attributes) {
      const groupName = attr.referenceGroup || "Other";
      const subgroupName = attr.subgroup || "";

      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, new Map());
      }
      const subgroupMap = groupMap.get(groupName)!;
      if (!subgroupMap.has(subgroupName)) {
        subgroupMap.set(subgroupName, []);
      }
      subgroupMap.get(subgroupName)!.push(attr);
    }

    // Convert to sorted array structure
    const result: GroupData[] = [];
    for (const [groupName, subgroupMap] of groupMap) {
      const subgroups: SubgroupData[] = [];
      let totalFields = 0;

      for (const [subName, attrs] of subgroupMap) {
        subgroups.push({ name: subName, attributes: attrs });
        totalFields += attrs.length;
      }

      // Sort subgroups: empty name first, then alphabetical
      subgroups.sort((a, b) => {
        if (a.name === "" && b.name !== "") return -1;
        if (a.name !== "" && b.name === "") return 1;
        return a.name.localeCompare(b.name);
      });

      result.push({ name: groupName, subgroups, totalFields });
    }

    // Listing Identity always first
    result.sort((a, b) => {
      if (a.name === "Listing Identity") return -1;
      if (b.name === "Listing Identity") return 1;
      return 0;
    });

    return result;
  }, [attributes]);

  const byGeneralLabel = useMemo(() => {
    const map = new Map<string, EnrichedAttribute>();
    for (const attr of attributes) {
      map.set(attr.generalLabel, attr);
    }
    return map;
  }, [attributes]);

  return { groups, byGeneralLabel, attributes, isLoading };
}
