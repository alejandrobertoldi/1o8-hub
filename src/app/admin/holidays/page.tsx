"use client";

import { useState } from "react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/country-flag";
import { countryCodeToDisplayCode, VALID_COUNTRY_CODES } from "@/lib/constants";
import { HolidayCountryTab } from "./_components/HolidayCountryTab";

const YEARS = [2026, 2027] as const;

export default function AdminHolidaysPage() {
  const [year, setYear] = useState<(typeof YEARS)[number]>(2026);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Public Holidays">
          <span className="font-bold text-sidebar-foreground">Public</span>
          <span className="font-normal text-brand">Holidays</span>
        </h1>
      </PageMetaSlot>

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground">
          Manage the country holiday calendars that drive time-off day counts.
        </p>
        <div className="flex gap-1">
          {YEARS.map((y) => (
            <Button
              key={y}
              size="sm"
              variant={year === y ? "brand" : "outline"}
              onClick={() => setYear(y)}
            >
              {y}
            </Button>
          ))}
        </div>
      </div>

      <Tabs defaultValue={VALID_COUNTRY_CODES[0]}>
        <TabsList>
          {VALID_COUNTRY_CODES.map((code) => {
            const display = countryCodeToDisplayCode(code);
            return (
              <TabsTrigger
                key={code}
                value={code}
                aria-label={display}
                className="gap-1.5"
              >
                <CountryFlag code={code} />
                <span className="tabular-nums tracking-wider">{display}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
        {VALID_COUNTRY_CODES.map((code) => (
          <TabsContent key={code} value={code}>
            <HolidayCountryTab country={code} year={year} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
