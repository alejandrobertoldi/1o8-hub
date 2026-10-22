/**
 * Seed public_holidays for the six countries the team spans.
 *
 * Idempotent: relies on the (country_code, holiday_date) unique constraint
 * plus onConflictDoNothing, so re-running is safe and adds only what is new.
 *
 * WHAT A ROW HERE ACTUALLY DOES: `getHolidayDates()` is the only consumer of
 * this table in the whole app, and `countWorkingDays()` already skips Saturday
 * and Sunday. So a row does exactly one thing — stops that day being deducted
 * from someone's leave — and a row landing on a weekend is INERT. Weekend rows
 * are seeded anyway (they cost nothing and document the holiday), but they
 * never change anyone's day count.
 *
 * NO ADMIN HOLIDAY UI EXISTS YET (Tasks 8–9). Corrections are made by editing
 * this file and re-running it, or by POSTing to /api/holidays as an admin.
 *
 * ⚠ CONSERVATIVE DEFAULTS, pending per-country confirmation. Over-seeding is
 * the expensive direction: `working_days` is frozen at submission and never
 * recomputed, so a holiday seeded for a day the team does NOT close for
 * permanently bills a 5-day absence as 4. Every list below therefore takes the
 * SMALLER credible set. Each is a one-line edit away from the larger set:
 *   • BOLIVIA, BRAZIL, PERU — national days only (BR's optional "ponto
 *     facultativo" days and São Paulo local days are NOT seeded).
 *   • PHILIPPINES — REGULAR holidays only; TUNISIA — national days. Their
 *     Islamic dates are lunar ESTIMATES and REQUIRE HUMAN REVIEW EVERY YEAR.
 *   • MEXICO — the 7 mandatory rest days of the Ley Federal del Trabajo
 *     (art. 74), with the Monday-moved ones (Feb, Mar, Nov) on their legal
 *     Mondays. Holy Thursday/Friday and Dec 12 are customary, NOT seeded.
 *   • UNITED STATES — the full federal list, unchanged from the first seed.
 *     This is a POLICY call, not a lookup: MLK, Presidents', Columbus,
 *     Veterans and Juneteenth are all seeded, and US holidays never lose a
 *     day to a weekend (observed-day rule).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

// Pure modules with no env dependency — safe as static imports.
import {
  VALID_COUNTRY_CODES,
  isCountryCode,
  type CountryCode,
} from "@/lib/constants";
import { isDateString } from "@/lib/time-off/working-days";

interface SeedHoliday {
  // Derived from the single source of truth, NOT a duplicated literal union —
  // adding a fourth country must not require editing this file.
  countryCode: CountryCode;
  holidayDate: string;
  name: string;
}

const HOLIDAYS: SeedHoliday[] = [
  // ── United States — federal holidays ──────────────────────────────
  { countryCode: "US", holidayDate: "2026-01-01", name: "New Year's Day" },
  { countryCode: "US", holidayDate: "2026-01-19", name: "Martin Luther King Jr. Day" },
  { countryCode: "US", holidayDate: "2026-02-16", name: "Presidents' Day" },
  { countryCode: "US", holidayDate: "2026-05-25", name: "Memorial Day" },
  { countryCode: "US", holidayDate: "2026-06-19", name: "Juneteenth" },
  { countryCode: "US", holidayDate: "2026-07-03", name: "Independence Day (observed)" },
  { countryCode: "US", holidayDate: "2026-09-07", name: "Labor Day" },
  { countryCode: "US", holidayDate: "2026-10-12", name: "Columbus Day" },
  { countryCode: "US", holidayDate: "2026-11-11", name: "Veterans Day" },
  { countryCode: "US", holidayDate: "2026-11-26", name: "Thanksgiving Day" },
  { countryCode: "US", holidayDate: "2026-12-25", name: "Christmas Day" },
  { countryCode: "US", holidayDate: "2027-01-01", name: "New Year's Day" },
  { countryCode: "US", holidayDate: "2027-01-18", name: "Martin Luther King Jr. Day" },
  { countryCode: "US", holidayDate: "2027-02-15", name: "Presidents' Day" },
  { countryCode: "US", holidayDate: "2027-05-31", name: "Memorial Day" },
  { countryCode: "US", holidayDate: "2027-06-18", name: "Juneteenth (observed)" },
  { countryCode: "US", holidayDate: "2027-07-05", name: "Independence Day (observed)" },
  { countryCode: "US", holidayDate: "2027-09-06", name: "Labor Day" },
  { countryCode: "US", holidayDate: "2027-10-11", name: "Columbus Day" },
  { countryCode: "US", holidayDate: "2027-11-11", name: "Veterans Day" },
  { countryCode: "US", holidayDate: "2027-11-25", name: "Thanksgiving Day" },
  { countryCode: "US", holidayDate: "2027-12-24", name: "Christmas Day (observed)" },

  // ── Mexico — mandatory rest days (Ley Federal del Trabajo, art. 74) ──
  // Holy Thursday/Friday and Dec 12 are customary, not mandatory: NOT seeded
  // (conservative default, see the header). Oct 1 inauguration day is every
  // six years (next 2030).
  { countryCode: "MX", holidayDate: "2026-01-01", name: "Año Nuevo (New Year's Day)" },
  { countryCode: "MX", holidayDate: "2026-02-02", name: "Día de la Constitución (Constitution Day)" },
  { countryCode: "MX", holidayDate: "2026-03-16", name: "Natalicio de Benito Juárez (Benito Juárez's Birthday)" },
  { countryCode: "MX", holidayDate: "2026-05-01", name: "Día del Trabajo (Labour Day)" },
  { countryCode: "MX", holidayDate: "2026-09-16", name: "Día de la Independencia (Independence Day)" },
  { countryCode: "MX", holidayDate: "2026-11-16", name: "Día de la Revolución (Revolution Day)" },
  { countryCode: "MX", holidayDate: "2026-12-25", name: "Navidad (Christmas Day)" },
  { countryCode: "MX", holidayDate: "2027-01-01", name: "Año Nuevo (New Year's Day)" },
  { countryCode: "MX", holidayDate: "2027-02-01", name: "Día de la Constitución (Constitution Day)" },
  { countryCode: "MX", holidayDate: "2027-03-15", name: "Natalicio de Benito Juárez (Benito Juárez's Birthday)" },
  { countryCode: "MX", holidayDate: "2027-05-01", name: "Día del Trabajo (Labour Day)" },
  { countryCode: "MX", holidayDate: "2027-09-16", name: "Día de la Independencia (Independence Day)" },
  { countryCode: "MX", holidayDate: "2027-11-15", name: "Día de la Revolución (Revolution Day)" },
  { countryCode: "MX", holidayDate: "2027-12-25", name: "Navidad (Christmas Day)" },
  // ── Bolivia — national holidays. A holiday on a Sunday moves to Monday. ──
  { countryCode: "BO", holidayDate: "2026-01-01", name: "Año Nuevo (New Year's Day)" },
  { countryCode: "BO", holidayDate: "2026-01-22", name: "Día del Estado Plurinacional" },
  { countryCode: "BO", holidayDate: "2026-02-16", name: "Carnaval (Monday)" },
  { countryCode: "BO", holidayDate: "2026-02-17", name: "Carnaval (Tuesday)" },
  { countryCode: "BO", holidayDate: "2026-04-03", name: "Viernes Santo (Good Friday)" },
  { countryCode: "BO", holidayDate: "2026-05-01", name: "Día del Trabajo (Labour Day)" },
  { countryCode: "BO", holidayDate: "2026-06-04", name: "Corpus Christi" },
  { countryCode: "BO", holidayDate: "2026-06-22", name: "Año Nuevo Andino (observed)" },
  { countryCode: "BO", holidayDate: "2026-08-06", name: "Día de la Independencia (Independence Day)" },
  { countryCode: "BO", holidayDate: "2026-11-02", name: "Día de Todos los Difuntos (All Souls' Day)" },
  { countryCode: "BO", holidayDate: "2026-12-25", name: "Navidad (Christmas Day)" },
  { countryCode: "BO", holidayDate: "2027-01-01", name: "Año Nuevo (New Year's Day)" },
  { countryCode: "BO", holidayDate: "2027-01-22", name: "Día del Estado Plurinacional" },
  { countryCode: "BO", holidayDate: "2027-02-08", name: "Carnaval (Monday)" },
  { countryCode: "BO", holidayDate: "2027-02-09", name: "Carnaval (Tuesday)" },
  { countryCode: "BO", holidayDate: "2027-03-26", name: "Viernes Santo (Good Friday)" },
  { countryCode: "BO", holidayDate: "2027-05-01", name: "Día del Trabajo (Labour Day)" },
  { countryCode: "BO", holidayDate: "2027-05-27", name: "Corpus Christi" },
  { countryCode: "BO", holidayDate: "2027-06-21", name: "Año Nuevo Andino (Andean New Year)" },
  { countryCode: "BO", holidayDate: "2027-08-06", name: "Día de la Independencia (Independence Day)" },
  { countryCode: "BO", holidayDate: "2027-11-02", name: "Día de Todos los Difuntos (All Souls' Day)" },
  { countryCode: "BO", holidayDate: "2027-12-25", name: "Navidad (Christmas Day)" },
  // ── Brazil — national holidays. Carnival and Corpus Christi are "ponto
  //    facultativo" (optional), São Paulo state/city days need confirming: NOT seeded.
  { countryCode: "BR", holidayDate: "2026-01-01", name: "Confraternização Universal (New Year's Day)" },
  { countryCode: "BR", holidayDate: "2026-04-03", name: "Sexta-feira Santa (Good Friday)" },
  { countryCode: "BR", holidayDate: "2026-04-21", name: "Tiradentes" },
  { countryCode: "BR", holidayDate: "2026-05-01", name: "Dia do Trabalho (Labour Day)" },
  { countryCode: "BR", holidayDate: "2026-09-07", name: "Independência (Independence Day)" },
  { countryCode: "BR", holidayDate: "2026-10-12", name: "Nossa Senhora Aparecida" },
  { countryCode: "BR", holidayDate: "2026-11-02", name: "Finados (All Souls' Day)" },
  { countryCode: "BR", holidayDate: "2026-11-15", name: "Proclamação da República (Republic Day)" },
  { countryCode: "BR", holidayDate: "2026-11-20", name: "Dia da Consciência Negra" },
  { countryCode: "BR", holidayDate: "2026-12-25", name: "Natal (Christmas Day)" },
  { countryCode: "BR", holidayDate: "2027-01-01", name: "Confraternização Universal (New Year's Day)" },
  { countryCode: "BR", holidayDate: "2027-03-26", name: "Sexta-feira Santa (Good Friday)" },
  { countryCode: "BR", holidayDate: "2027-04-21", name: "Tiradentes" },
  { countryCode: "BR", holidayDate: "2027-05-01", name: "Dia do Trabalho (Labour Day)" },
  { countryCode: "BR", holidayDate: "2027-09-07", name: "Independência (Independence Day)" },
  { countryCode: "BR", holidayDate: "2027-10-12", name: "Nossa Senhora Aparecida" },
  { countryCode: "BR", holidayDate: "2027-11-02", name: "Finados (All Souls' Day)" },
  { countryCode: "BR", holidayDate: "2027-11-15", name: "Proclamação da República (Republic Day)" },
  { countryCode: "BR", holidayDate: "2027-11-20", name: "Dia da Consciência Negra" },
  { countryCode: "BR", holidayDate: "2027-12-25", name: "Natal (Christmas Day)" },
  // ── Peru — national holidays (incl. the days added 2022–2024). ──
  { countryCode: "PE", holidayDate: "2026-01-01", name: "Año Nuevo (New Year's Day)" },
  { countryCode: "PE", holidayDate: "2026-04-02", name: "Jueves Santo (Maundy Thursday)" },
  { countryCode: "PE", holidayDate: "2026-04-03", name: "Viernes Santo (Good Friday)" },
  { countryCode: "PE", holidayDate: "2026-05-01", name: "Día del Trabajo (Labour Day)" },
  { countryCode: "PE", holidayDate: "2026-06-07", name: "Batalla de Arica y Día de la Bandera" },
  { countryCode: "PE", holidayDate: "2026-06-29", name: "San Pedro y San Pablo" },
  { countryCode: "PE", holidayDate: "2026-07-23", name: "Día de la Fuerza Aérea" },
  { countryCode: "PE", holidayDate: "2026-07-28", name: "Fiestas Patrias (Independence Day)" },
  { countryCode: "PE", holidayDate: "2026-07-29", name: "Fiestas Patrias" },
  { countryCode: "PE", holidayDate: "2026-08-06", name: "Batalla de Junín" },
  { countryCode: "PE", holidayDate: "2026-08-30", name: "Santa Rosa de Lima" },
  { countryCode: "PE", holidayDate: "2026-10-08", name: "Combate de Angamos" },
  { countryCode: "PE", holidayDate: "2026-11-01", name: "Día de Todos los Santos (All Saints' Day)" },
  { countryCode: "PE", holidayDate: "2026-12-08", name: "Inmaculada Concepción" },
  { countryCode: "PE", holidayDate: "2026-12-09", name: "Batalla de Ayacucho" },
  { countryCode: "PE", holidayDate: "2026-12-25", name: "Navidad (Christmas Day)" },
  { countryCode: "PE", holidayDate: "2027-01-01", name: "Año Nuevo (New Year's Day)" },
  { countryCode: "PE", holidayDate: "2027-03-25", name: "Jueves Santo (Maundy Thursday)" },
  { countryCode: "PE", holidayDate: "2027-03-26", name: "Viernes Santo (Good Friday)" },
  { countryCode: "PE", holidayDate: "2027-05-01", name: "Día del Trabajo (Labour Day)" },
  { countryCode: "PE", holidayDate: "2027-06-07", name: "Batalla de Arica y Día de la Bandera" },
  { countryCode: "PE", holidayDate: "2027-06-29", name: "San Pedro y San Pablo" },
  { countryCode: "PE", holidayDate: "2027-07-23", name: "Día de la Fuerza Aérea" },
  { countryCode: "PE", holidayDate: "2027-07-28", name: "Fiestas Patrias (Independence Day)" },
  { countryCode: "PE", holidayDate: "2027-07-29", name: "Fiestas Patrias" },
  { countryCode: "PE", holidayDate: "2027-08-06", name: "Batalla de Junín" },
  { countryCode: "PE", holidayDate: "2027-08-30", name: "Santa Rosa de Lima" },
  { countryCode: "PE", holidayDate: "2027-10-08", name: "Combate de Angamos" },
  { countryCode: "PE", holidayDate: "2027-11-01", name: "Día de Todos los Santos (All Saints' Day)" },
  { countryCode: "PE", holidayDate: "2027-12-08", name: "Inmaculada Concepción" },
  { countryCode: "PE", holidayDate: "2027-12-09", name: "Batalla de Ayacucho" },
  { countryCode: "PE", holidayDate: "2027-12-25", name: "Navidad (Christmas Day)" },
  // ── Philippines — REGULAR holidays only (MF's reviewed list). Eid dates are ESTIMATES. ──
  { countryCode: "PH", holidayDate: "2026-01-01", name: "New Year's Day" },
  { countryCode: "PH", holidayDate: "2026-03-20", name: "Eid'l Fitr (estimated)" },
  { countryCode: "PH", holidayDate: "2026-04-02", name: "Maundy Thursday" },
  { countryCode: "PH", holidayDate: "2026-04-03", name: "Good Friday" },
  { countryCode: "PH", holidayDate: "2026-04-09", name: "Araw ng Kagitingan" },
  { countryCode: "PH", holidayDate: "2026-05-01", name: "Labor Day" },
  { countryCode: "PH", holidayDate: "2026-05-27", name: "Eid'l Adha (estimated)" },
  { countryCode: "PH", holidayDate: "2026-06-12", name: "Independence Day" },
  { countryCode: "PH", holidayDate: "2026-08-31", name: "National Heroes Day" },
  { countryCode: "PH", holidayDate: "2026-11-30", name: "Bonifacio Day" },
  { countryCode: "PH", holidayDate: "2026-12-25", name: "Christmas Day" },
  { countryCode: "PH", holidayDate: "2026-12-30", name: "Rizal Day" },
  { countryCode: "PH", holidayDate: "2027-01-01", name: "New Year's Day" },
  { countryCode: "PH", holidayDate: "2027-03-10", name: "Eid'l Fitr (estimated)" },
  { countryCode: "PH", holidayDate: "2027-03-25", name: "Maundy Thursday" },
  { countryCode: "PH", holidayDate: "2027-03-26", name: "Good Friday" },
  { countryCode: "PH", holidayDate: "2027-04-09", name: "Araw ng Kagitingan" },
  { countryCode: "PH", holidayDate: "2027-05-01", name: "Labor Day" },
  { countryCode: "PH", holidayDate: "2027-05-17", name: "Eid'l Adha (estimated)" },
  { countryCode: "PH", holidayDate: "2027-06-12", name: "Independence Day" },
  { countryCode: "PH", holidayDate: "2027-08-30", name: "National Heroes Day" },
  { countryCode: "PH", holidayDate: "2027-11-30", name: "Bonifacio Day" },
  { countryCode: "PH", holidayDate: "2027-12-25", name: "Christmas Day" },
  { countryCode: "PH", holidayDate: "2027-12-30", name: "Rizal Day" },
  // ── Tunisia — national holidays. Islamic dates (Eids, Hijri New Year,
  //    Mawlid) are lunar ESTIMATES: REVIEW EVERY YEAR with the team. ──
  { countryCode: "TN", holidayDate: "2026-01-01", name: "New Year's Day" },
  { countryCode: "TN", holidayDate: "2026-03-20", name: "Independence Day / Eid al-Fitr (estimated)" },
  { countryCode: "TN", holidayDate: "2026-03-21", name: "Eid al-Fitr (estimated)" },
  { countryCode: "TN", holidayDate: "2026-04-09", name: "Martyrs' Day" },
  { countryCode: "TN", holidayDate: "2026-05-01", name: "Labour Day" },
  { countryCode: "TN", holidayDate: "2026-05-27", name: "Eid al-Adha (estimated)" },
  { countryCode: "TN", holidayDate: "2026-05-28", name: "Eid al-Adha (estimated)" },
  { countryCode: "TN", holidayDate: "2026-06-16", name: "Islamic New Year (estimated)" },
  { countryCode: "TN", holidayDate: "2026-07-25", name: "Republic Day" },
  { countryCode: "TN", holidayDate: "2026-08-13", name: "Women's Day" },
  { countryCode: "TN", holidayDate: "2026-08-25", name: "Mawlid (estimated)" },
  { countryCode: "TN", holidayDate: "2026-10-15", name: "Evacuation Day" },
  { countryCode: "TN", holidayDate: "2026-12-17", name: "Revolution Day" },
  { countryCode: "TN", holidayDate: "2027-01-01", name: "New Year's Day" },
  { countryCode: "TN", holidayDate: "2027-03-10", name: "Eid al-Fitr (estimated)" },
  { countryCode: "TN", holidayDate: "2027-03-11", name: "Eid al-Fitr (estimated)" },
  { countryCode: "TN", holidayDate: "2027-03-20", name: "Independence Day" },
  { countryCode: "TN", holidayDate: "2027-04-09", name: "Martyrs' Day" },
  { countryCode: "TN", holidayDate: "2027-05-01", name: "Labour Day" },
  { countryCode: "TN", holidayDate: "2027-05-16", name: "Eid al-Adha (estimated)" },
  { countryCode: "TN", holidayDate: "2027-05-17", name: "Eid al-Adha (estimated)" },
  { countryCode: "TN", holidayDate: "2027-06-06", name: "Islamic New Year (estimated)" },
  { countryCode: "TN", holidayDate: "2027-07-25", name: "Republic Day" },
  { countryCode: "TN", holidayDate: "2027-08-13", name: "Women's Day" },
  { countryCode: "TN", holidayDate: "2027-08-15", name: "Mawlid (estimated)" },
  { countryCode: "TN", holidayDate: "2027-10-15", name: "Evacuation Day" },
  { countryCode: "TN", holidayDate: "2027-12-17", name: "Revolution Day" },
];

/**
 * Validate the seed data at RUNTIME before writing anything (M1 mitigation).
 *
 * This script talks to the database directly, so it bypasses the API boundary
 * where `isCountryCode()` normally guards `country_code`, and there is
 * deliberately no DB-level CHECK on that column — `char(2)` would happily
 * store 'UK', which would then be invisible to every country-scoped query.
 * In-set duplicates are rejected too: `onConflictDoNothing()` would swallow
 * them silently and make the inserted/skipped summary misleading.
 */
function validate(rows: SeedHoliday[]): void {
  const problems: string[] = [];
  const seen = new Set<string>();

  rows.forEach((h, i) => {
    if (!isCountryCode(h.countryCode)) {
      problems.push(
        `row ${i}: countryCode ${JSON.stringify(h.countryCode)} is not one of ${VALID_COUNTRY_CODES.join(", ")}`
      );
    }
    if (!isDateString(h.holidayDate)) {
      problems.push(
        `row ${i}: holidayDate ${JSON.stringify(h.holidayDate)} is not a valid YYYY-MM-DD date`
      );
    }
    if (!h.name.trim()) {
      problems.push(`row ${i}: name is empty`);
    }
    if (h.name.length > 120) {
      problems.push(
        `row ${i}: name is ${h.name.length} chars, over the varchar(120) limit`
      );
    }
    const key = `${h.countryCode}|${h.holidayDate}`;
    if (seen.has(key)) {
      problems.push(
        `row ${i}: duplicate ${key} — onConflictDoNothing would silently drop one`
      );
    }
    seen.add(key);
  });

  if (problems.length > 0) {
    console.error(`[seed-holidays] ${problems.length} invalid row(s):`);
    for (const p of problems) console.error(`  ${p}`);
    throw new Error("seed data failed validation; nothing was written");
  }
  console.log(`[seed-holidays] validated ${rows.length} rows — all valid`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Validation runs in BOTH modes, before the dry-run short-circuits, so
  // --dry-run genuinely proves the data is insertable.
  validate(HOLIDAYS);

  console.log(`[seed-holidays] ${HOLIDAYS.length} rows prepared`);
  // Iterate the single source of truth, NOT a hardcoded list — the previous
  // literal silently omitted calendars from this summary even though their
  // rows inserted fine.
  for (const cc of VALID_COUNTRY_CODES) {
    const n = HOLIDAYS.filter((h) => h.countryCode === cc).length;
    console.log(`  ${cc}: ${n}`);
  }

  if (dryRun) {
    console.log("[seed-holidays] --dry-run: nothing written");
    return;
  }

  // Env-dependent — MUST be dynamic, after config() has run above. A static
  // top-level import would evaluate src/lib/db/index.ts (which reads
  // process.env.DATABASE_URL at module scope) before dotenv has loaded
  // .env.local, pointing the client at localhost:5432.
  const { db } = await import("@/lib/db");
  const { publicHolidays } = await import("@/lib/db/schema");

  const inserted = await db
    .insert(publicHolidays)
    .values(HOLIDAYS)
    .onConflictDoNothing()
    .returning({ id: publicHolidays.id });

  console.log(
    `[seed-holidays] inserted ${inserted.length}, skipped ${HOLIDAYS.length - inserted.length} already present`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-holidays] failed:", err);
    process.exit(1);
  });
