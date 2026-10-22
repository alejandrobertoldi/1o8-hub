/* eslint-disable react-doctor/js-combine-iterations */
import * as dotenv from "dotenv";
import path from "path";
import postgres from "postgres";
import * as XLSX from "xlsx";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL not found in .env.local");
}

// ─── Mapping rules ───────────────────────────────────────────────────────────
// Each rule is { pattern, subgroup } where pattern is a string (exact), a
// string ending with "*" (prefix), or a RegExp.  referenceGroup is an optional
// extra constraint (if omitted, rule applies to any group).
interface Rule {
  pattern: string | RegExp;
  subgroup: string;
  referenceGroup?: string;
}

function matchesPattern(label: string, pattern: string | RegExp): boolean {
  if (pattern instanceof RegExp) return pattern.test(label);
  if (pattern.endsWith("*")) {
    return label.startsWith(pattern.slice(0, -1));
  }
  return label === pattern;
}

// Rules are evaluated in order; first match wins.
const RULES: Rule[] = [
  // ── Pet ──────────────────────────────────────────────────────────────────
  { pattern: "PetType*", subgroup: "Pet" },
  { pattern: "BreedRecommendation*", subgroup: "Pet" },
  { pattern: "PetToyType", subgroup: "Pet" },

  // ── Features ─────────────────────────────────────────────────────────────
  { pattern: "SpecialFeatures*", subgroup: "Features" },
  { pattern: "IncludedFeatures", subgroup: "Features" },
  { pattern: "IsCustomizable", subgroup: "Features" },
  { pattern: "HasHandle", subgroup: "Features" },
  { pattern: "AccessMethod", subgroup: "Features" },
  { pattern: "Reusability", subgroup: "Features" },
  { pattern: "IsTheItemDishwasherSafe*", subgroup: "Features" },
  { pattern: "Istheitemdishwashersafe*", subgroup: "Features" },
  { pattern: "IsTheItemMicrowaveable*", subgroup: "Features" },
  { pattern: "Istheitemmicrowaveable*", subgroup: "Features" },
  { pattern: "WaterResistanceLevel", subgroup: "Features" },
  { pattern: "IsWaterproof*", subgroup: "Features" },
  { pattern: "IsFragile", subgroup: "Features" },
  { pattern: "ThermalPerformanceDescription", subgroup: "Features" },

  // ── Beauty ───────────────────────────────────────────────────────────────
  { pattern: "HairType", subgroup: "Beauty" },
  { pattern: "HairConditionerType", subgroup: "Beauty" },
  { pattern: "SkinTone", subgroup: "Beauty" },
  { pattern: "SkinType*", subgroup: "Beauty" },
  { pattern: "SunProtection*", subgroup: "Beauty" },
  { pattern: "TargetUseBodyPart*", subgroup: "Beauty" },
  { pattern: "SkinCleaningAgentUse", subgroup: "Beauty" },

  // ── Food ─────────────────────────────────────────────────────────────────
  { pattern: "NutOrSeedType*", subgroup: "Food" },
  { pattern: "NutorSeedType*", subgroup: "Food" },
  { pattern: "ManufacturerFoodProcessingMethod*", subgroup: "Food" },
  { pattern: "CultivationMethodClaim*", subgroup: "Food" },
  { pattern: "ProductGrade", subgroup: "Food" },
  { pattern: "PasteurizationType", subgroup: "Food" },
  { pattern: "ProduceSoldAsFormat", subgroup: "Food" },
  { pattern: "ProducePart", subgroup: "Food" },
  { pattern: "ProduceType", subgroup: "Food" },
  { pattern: "ProduceVariety", subgroup: "Food" },
  { pattern: "CerealGrainForm", subgroup: "Food" },
  { pattern: "BreakfastCerealType", subgroup: "Food" },
  { pattern: "HoneyType", subgroup: "Food" },

  // ── Protein (existing subgroup) ───────────────────────────────────────────
  { pattern: "ProteinSource*", subgroup: "Protein" },
  { pattern: "ProteinSource", subgroup: "Protein" },

  // ── Coffee (existing) ────────────────────────────────────────────────────
  { pattern: "GrindType", subgroup: "Coffee" },
  { pattern: "CoffeeType", subgroup: "Coffee" },
  { pattern: "CoffeeBlendName", subgroup: "Coffee" },

  // ── CAffeine (existing) ───────────────────────────────────────────────────
  { pattern: "CaffeineContentPerServing", subgroup: "CAffeine" },
  { pattern: "CaffeineContentPerServingUnit", subgroup: "CAffeine" },

  // ── Tech ─────────────────────────────────────────────────────────────────
  { pattern: "ConnectivityTechnology*", subgroup: "Tech" },
  { pattern: "DigitalStorageCapacity*", subgroup: "Tech" },
  { pattern: "ProcessorDescription*", subgroup: "Tech" },

  // ── Optics ───────────────────────────────────────────────────────────────
  { pattern: "BaseCurveRadius*", subgroup: "Optics" },
  { pattern: "OpticalPower", subgroup: "Optics" },

  // ── Language ─────────────────────────────────────────────────────────────
  { pattern: "LanguageType*", subgroup: "Language" },
  { pattern: /^Language\d+$/, subgroup: "Language" },

  // ── Education ────────────────────────────────────────────────────────────
  { pattern: "Genre*", subgroup: "Education" },
  { pattern: "SubjectCode*", subgroup: "Education" },
  { pattern: "SubjectCodeType*", subgroup: "Education" },
  { pattern: "Subject*", subgroup: "Education" },
  { pattern: "SubjectType*", subgroup: "Education" },
  { pattern: "LexileCode", subgroup: "Education" },
  { pattern: "TextbookType", subgroup: "Education" },
  { pattern: "SchoolType*", subgroup: "Education" },
  { pattern: "MinimumRecommendedGradeLevel*", subgroup: "Education" },
  { pattern: "MaximumRecommendedGradeLevel*", subgroup: "Education" },
  { pattern: "EditionNumber", subgroup: "Education" },

  // ── Edition (existing) ───────────────────────────────────────────────────
  { pattern: "SeriesTitle", subgroup: "Edition" },
  { pattern: "Seriestitle", subgroup: "Edition" },
  { pattern: "SeriesNumber", subgroup: "Edition" },
  { pattern: "Volume", subgroup: "Edition" },
  { pattern: "Author*", subgroup: "Edition" },
  { pattern: "NumberofPages*", subgroup: "Edition" },
  { pattern: "NumberOfPages*", subgroup: "Edition" },
  { pattern: "NumberofWords*", subgroup: "Edition" },
  { pattern: "NumberOfWords*", subgroup: "Edition" },
  { pattern: "Binding", subgroup: "Edition" },
  { pattern: "ReprintDate", subgroup: "Edition" },
  { pattern: "PublicationDate", subgroup: "Edition" },

  // ── Sport (existing) ─────────────────────────────────────────────────────
  { pattern: "Athlete*", subgroup: "Sport" },
  { pattern: "SoftballVariation*", subgroup: "Sport" },
  { pattern: "GolfClub*", subgroup: "Sport" },
  { pattern: "GripType", subgroup: "Sport" },

  // ── Clothing (existing) ──────────────────────────────────────────────────
  { pattern: "CollarStyle*", subgroup: "Clothing" },
  { pattern: "BottomStyle*", subgroup: "Clothing" },
  { pattern: "FitType", subgroup: "Clothing" },
  { pattern: "CareInstructions*", subgroup: "Clothing" },
  { pattern: "RiseStyle", subgroup: "Clothing" },
  { pattern: "WidthRange*", subgroup: "Clothing" },
  { pattern: "ShirtBodyType", subgroup: "Clothing" },
  { pattern: "ShirtHeightType", subgroup: "Clothing" },
  { pattern: "TopStyle*", subgroup: "Clothing" },
  { pattern: "WeaveType", subgroup: "Clothing" },
  { pattern: "SleeveLengthValue", subgroup: "Clothing" },
  { pattern: "SleeveLengthToValue", subgroup: "Clothing" },
  { pattern: "NumberofPockets*", subgroup: "Clothing" },
  { pattern: "NumberOfPockets*", subgroup: "Clothing" },
  { pattern: "FabricStretchability", subgroup: "Clothing" },
  { pattern: "ShirtFormType", subgroup: "Clothing" },
  { pattern: "SleeveCuffStyle*", subgroup: "Clothing" },
  { pattern: "SweaterForm", subgroup: "Clothing" },
  { pattern: "GarmentClosureLengthDescription", subgroup: "Clothing" },
  { pattern: "CoatSilhouetteType", subgroup: "Clothing" },
  { pattern: "ToeStyle*", subgroup: "Clothing" },
  { pattern: "SocksForm", subgroup: "Clothing" },
  { pattern: "HatFormType", subgroup: "Clothing" },
  { pattern: "FabricDistressing*", subgroup: "Clothing" },
  { pattern: "FabricType*", subgroup: "Clothing" },
  // FabricType standalone already covered by FabricType*

  // ── Material (existing) ──────────────────────────────────────────────────
  { pattern: "MetalType*", subgroup: "Material" },
  { pattern: "GemType*", subgroup: "Material" },
  { pattern: "FinishType", subgroup: "Material" },
  { pattern: "OuterMaterial*", subgroup: "Material", referenceGroup: "Product Details" },
  { pattern: "InnerMaterial", subgroup: "Material", referenceGroup: "Product Details" },
  // S&C specific material compliance
  { pattern: "ComplianceDownPlumageWeight", subgroup: "Material" },
  { pattern: "ComplianceIsFurskinPresent", subgroup: "Material" },
  { pattern: "ComplianceAnimalLeather", subgroup: "Material" },
  { pattern: "ComplianceConstructionType", subgroup: "Material" },
  { pattern: "ComplianceHandbagType", subgroup: "Material" },

  // ── Color (existing) ─────────────────────────────────────────────────────
  { pattern: "MatteStyle*", subgroup: "Color" },

  // ── Package (existing) ───────────────────────────────────────────────────
  { pattern: "PackageTypeName", subgroup: "Package" },
  { pattern: "PackagingFeature*", subgroup: "Package" },

  // ── Design (existing) ────────────────────────────────────────────────────
  { pattern: "Theme", subgroup: "Design" },
  { pattern: /^Theme\d+$/, subgroup: "Design" },
  { pattern: "AnimalTheme", subgroup: "Design" },
  { pattern: "FashionDecade", subgroup: "Design" },
  { pattern: "CollectionName", subgroup: "Design" },
  { pattern: "Inscription", subgroup: "Design" },
  { pattern: "SetName", subgroup: "Design" },
  { pattern: "DesignName", subgroup: "Design" },
  { pattern: "Pattern", subgroup: "Design" },
  { pattern: "SubBrand", subgroup: "Design" },

  // ── Form (existing) ──────────────────────────────────────────────────────
  { pattern: "BlanketForm", subgroup: "Form" },
  { pattern: "DrinkingCupFormType", subgroup: "Form" },
  { pattern: "DrinkingCupFormSubType", subgroup: "Form" },
  { pattern: "DrinkingCupFormSub_type", subgroup: "Form" },
  { pattern: "Format*", subgroup: "Form" },

  // ── Size (existing) ──────────────────────────────────────────────────────
  { pattern: "GaugeDecimalValue", subgroup: "Size" },
  { pattern: "GaugeStringValue", subgroup: "Size" },
  { pattern: "ItemDisplayWidth*", subgroup: "Size" },
  { pattern: "InseamLength*", subgroup: "Size" },
  { pattern: "HeightMap*", subgroup: "Size" },
  { pattern: "BrimWidth*", subgroup: "Size" },
  { pattern: "ChestSize*", subgroup: "Size" },
  { pattern: "CupSize*", subgroup: "Size" },
  { pattern: "BandSize*", subgroup: "Size" },
  { pattern: "WaistSize*", subgroup: "Size" },
  { pattern: "ApparelSize*", subgroup: "Size" },
  { pattern: "ShirtSize*", subgroup: "Size" },
  { pattern: "NeckSize*", subgroup: "Size" },
  { pattern: "HeadwearSize*", subgroup: "Size" },
  { pattern: "SizeDisplayName", subgroup: "Size" },
  { pattern: "HeadSize", subgroup: "Size" },
  { pattern: "RingSize", subgroup: "Size" },
  { pattern: "SizeSystem", subgroup: "Size" },
  { pattern: "SizeClass", subgroup: "Size" },
  { pattern: "SizeValue", subgroup: "Size" },
  { pattern: "SpecificClothingSize*", subgroup: "Size" },
  { pattern: "ShapewearSizeToRange", subgroup: "Size" },
  { pattern: "SpecialSize", subgroup: "Size" },
  { pattern: "GripSize", subgroup: "Size" },

  // ── Item (existing) ──────────────────────────────────────────────────────
  { pattern: "ItemShape", subgroup: "Item" },
  { pattern: "NumberofItems*", subgroup: "Item" },
  { pattern: "NumberOfItems*", subgroup: "Item" },
  { pattern: "ItemPackageQuantity", subgroup: "Item" },
  { pattern: "NumberofCompartments*", subgroup: "Item" },
  { pattern: "NumberOfCompartments*", subgroup: "Item" },
  { pattern: "TotalEaches", subgroup: "Item" },
  { pattern: "NumberOfPieces", subgroup: "Item" },
  { pattern: "NumberofPieces", subgroup: "Item" },

  // ── SEO (existing) ───────────────────────────────────────────────────────
  { pattern: "SubjectKeyword*", subgroup: "SEO" },
  { pattern: "ShortProductDescription", subgroup: "SEO" },

  // ── Configuration (existing) ─────────────────────────────────────────────
  { pattern: "VersionforCountry*", subgroup: "Configuration" },
  { pattern: "PrePrintedText", subgroup: "Configuration" },
  { pattern: "Variety", subgroup: "Configuration" },

  // ── Storage (existing) ───────────────────────────────────────────────────
  { pattern: "StorageInstructions", subgroup: "Storage" },
  { pattern: "TemperatureCondition", subgroup: "Storage" },

  // ── Use (existing) ───────────────────────────────────────────────────────
  { pattern: "IndoorOutdoorUsage*", subgroup: "Use" },
  { pattern: "PlatformforDisplay", subgroup: "Use" },
  { pattern: "RecommendedUsesForProduct*", subgroup: "Use" },
  { pattern: "SpecificUsesforProduct*", subgroup: "Use" },

  // ── Age Restriction (existing) ───────────────────────────────────────────
  { pattern: "IsAdultProduct", subgroup: "Age Restriction" },
  { pattern: "ManufacturerMinimumAgeMONTHS", subgroup: "Age Restriction" },
  { pattern: "MinimumReadingAge*", subgroup: "Age Restriction" },
  { pattern: "MaximumReadingAge*", subgroup: "Age Restriction" },

  // ── Diet → existing Diet subgroup ────────────────────────────────────────
  { pattern: "DietType*", subgroup: "Diet" },

  // ── Target (existing) ────────────────────────────────────────────────────
  { pattern: "Lifestyle", subgroup: "Target" },
  { pattern: "DepartmentName", subgroup: "Target" },

  // ── Specialty (existing) ─────────────────────────────────────────────────
  { pattern: "Specialty*", subgroup: "Specialty" },

  // ── ID Numbers (existing) ────────────────────────────────────────────────
  { pattern: "ManufactureYear", subgroup: "ID Numbers" },

  // ── Components (existing) ────────────────────────────────────────────────
  { pattern: "InsertType*", subgroup: "Components" },

  // ── StrapLength → Clothing ───────────────────────────────────────────────
  { pattern: "StrapLength*", subgroup: "Clothing" },

  // ── GenericType → Form ───────────────────────────────────────────────────
  { pattern: "GenericType*", subgroup: "Form" },

  // ────────────────────────────────────────────────────────────────────────
  // Safety & Compliance specific ungrouped rules
  // ────────────────────────────────────────────────────────────────────────
  { pattern: "ProductComplianceCertificate", subgroup: "Compliance", referenceGroup: "Safety & Compliance" },
  { pattern: "RegulatoryOrganizationName", subgroup: "Compliance", referenceGroup: "Safety & Compliance" },
  { pattern: "ComplianceCertificationStatus", subgroup: "Compliance", referenceGroup: "Safety & Compliance" },
  { pattern: "ComplianceCertificationValue", subgroup: "Compliance", referenceGroup: "Safety & Compliance" },
  { pattern: "IsOEMSourcedProduct", subgroup: "Compliance", referenceGroup: "Safety & Compliance" },

  // Batteries
  { pattern: "BatteryIECCode", subgroup: "Batteries" },
  { pattern: "HasMultipleBatteryPoweredComponents", subgroup: "Batteries" },
  { pattern: "ContainsBatteryorCell", subgroup: "Batteries" },
  { pattern: "BatteryContainsfreeUnabsorbedLiquid", subgroup: "Batteries" },
  { pattern: "IsBatteryNonSpillable", subgroup: "Batteries" },
  { pattern: "NonLithiumBatteryPackaging", subgroup: "Batteries" },
  { pattern: "HasReplaceableBattery", subgroup: "Batteries" },
  { pattern: "NonLithiumBatteryEnergyContent*", subgroup: "Batteries" },
  { pattern: "HasLessthan30PercentStateofCharge", subgroup: "Batteries" },
  { pattern: "BatteryInstallationDeviceType", subgroup: "Batteries" },

  // Copyright → Compliance
  { pattern: "Copyright*", subgroup: "Compliance" },

  // Textile compliance
  { pattern: "ComplianceBookType", subgroup: "Textile" },
  { pattern: "CompliancePrintingAndPublicationCountry", subgroup: "Textile" },
  { pattern: "CompliancePageCount", subgroup: "Textile" },
  { pattern: "ComplianceJoiningMethod", subgroup: "Textile" },
  { pattern: "ComplianceCoverType", subgroup: "Textile" },
  { pattern: "ComplianceEmbellishmentFeature", subgroup: "Textile" },

  // ── Product Identity specific ungrouped ──────────────────────────────────
  { pattern: "Manufacturer", subgroup: "Main Attributes", referenceGroup: "Product Identity" },
  { pattern: "PlantorAnimalProductType", subgroup: "Main Attributes", referenceGroup: "Product Identity" },

  // ── Hub-Internal ─────────────────────────────────────────────────────────
  { pattern: "IsVP", subgroup: "Flags", referenceGroup: "Hub-Internal" },

  // ── CertificateType → Compliance (S&C) or Diet/Allergen (PD) ────────────
  { pattern: "CertificateType*", subgroup: "Compliance", referenceGroup: "Safety & Compliance" },
  { pattern: "CertificateType*", subgroup: "Diet", referenceGroup: "Product Details" },
];

function suggestSubgroup(label: string, referenceGroup: string): string {
  for (const rule of RULES) {
    // Check referenceGroup constraint
    if (rule.referenceGroup && rule.referenceGroup !== referenceGroup) continue;
    if (matchesPattern(label, rule.pattern)) {
      return rule.subgroup;
    }
  }
  return "";
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const sql = postgres(DATABASE_URL!, {
    prepare: false,
    ssl: "require",
  });

  console.log("Querying attributes table...");

  const rows = await sql<
    { id: number; general_label: string; reference_group: string; subgroup: string }[]
  >`
    SELECT id, general_label, reference_group, subgroup
    FROM attributes
    ORDER BY reference_group, master_row
  `;

  console.log(`Total rows fetched: ${rows.length}`);

  const emptyCount = rows.filter((r) => r.subgroup === "" || r.subgroup == null).length;
  console.log(`Rows with empty subgroup: ${emptyCount}`);

  type OutRow = {
    id: number;
    reference_group: string;
    current_subgroup: string;
    general_label: string;
    suggested_subgroup: string;
    effective_subgroup: string;
    needs_update: boolean;
  };

  const outputRows: OutRow[] = [];
  let suggestedCount = 0;

  for (const row of rows) {
    const current = row.subgroup ?? "";
    const isEmpty = current === "";
    const suggestion = isEmpty ? suggestSubgroup(row.general_label, row.reference_group) : "";
    const effective = isEmpty ? suggestion : current;
    if (isEmpty && suggestion) suggestedCount++;

    outputRows.push({
      id: row.id,
      reference_group: row.reference_group,
      current_subgroup: current,
      general_label: row.general_label,
      suggested_subgroup: suggestion,
      effective_subgroup: effective,
      needs_update: isEmpty,
    });
  }

  const COLS = [
    { wch: 8 },   // id
    { wch: 24 },  // reference_group
    { wch: 20 },  // current_subgroup
    { wch: 42 },  // general_label
    { wch: 22 },  // suggested_subgroup
    { wch: 22 },  // effective_subgroup
    { wch: 12 },  // needs_update
  ];

  const header = ["id", "reference_group", "current_subgroup", "general_label", "suggested_subgroup", "effective_subgroup", "needs_update"];

  const wb = XLSX.utils.book_new();

  // Sheet 1: All rows
  const allData = [header, ...outputRows.map(r => [r.id, r.reference_group, r.current_subgroup, r.general_label, r.suggested_subgroup, r.effective_subgroup, r.needs_update])];
  const wsAll = XLSX.utils.aoa_to_sheet(allData);
  wsAll["!cols"] = COLS;
  XLSX.utils.book_append_sheet(wb, wsAll, "All Attributes");

  // Sheet 2: Only rows needing update
  const needsData = [header, ...outputRows.filter(r => r.needs_update).map(r => [r.id, r.reference_group, r.current_subgroup, r.general_label, r.suggested_subgroup, r.effective_subgroup, r.needs_update])];
  const wsNeeds = XLSX.utils.aoa_to_sheet(needsData);
  wsNeeds["!cols"] = COLS;
  XLSX.utils.book_append_sheet(wb, wsNeeds, "Needs Subgroup (334)");

  // One sheet per reference_group
  const byGroup: Record<string, OutRow[]> = {};
  for (const r of outputRows) {
    if (!byGroup[r.reference_group]) byGroup[r.reference_group] = [];
    byGroup[r.reference_group].push(r);
  }
  for (const [grp, grpRows] of Object.entries(byGroup)) {
    const sheetData = [header, ...grpRows.map(r => [r.id, r.reference_group, r.current_subgroup, r.general_label, r.suggested_subgroup, r.effective_subgroup, r.needs_update])];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws["!cols"] = COLS;
    XLSX.utils.book_append_sheet(wb, ws, grp.slice(0, 31));
  }

  const outputPath = path.resolve(process.cwd(), "docs/attributes-subgroup-suggestions.xlsx");
  XLSX.writeFile(wb, outputPath);

  await sql.end();

  console.log("\n─── Summary ────────────────────────────────────────────");
  console.log(`Total rows            : ${rows.length}`);
  console.log(`Need subgroup         : ${emptyCount}`);
  console.log(`Suggestions generated : ${suggestedCount}`);
  console.log(`Output file           : ${outputPath}`);
  console.log("────────────────────────────────────────────────────────");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
