/* eslint-disable react-doctor/nextjs-no-a-element */
/* eslint-disable react-doctor/rendering-conditional-render */
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/async-await-in-loop */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";
import { ClientMark, CoverageRow, ScopePill } from "@/components/seo/target-display";
import { BASELINE_FIELD_KEYS, baselineVersionLabel, type BaselineFields, type BaselineVersion } from "@/lib/seo/baseline-source";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSectionHeader } from "@/components/seo/project-shell";

import React, { Fragment, useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

interface AACClient {
  ClientStatus: string | null; ClientName: string | null; ClientIDCode: string | null;
  BrandName: string | null; Marketplace: string | null; Country: string | null;
  Tier: number | null; BrandURL: string | null;
  Competitor1Name: string | null; Competitor1URL: string | null;
  Competitor2Name: string | null; Competitor2URL: string | null;
  Competitor3Name: string | null; Competitor3URL: string | null;
  Competitor4Name: string | null; Competitor4URL: string | null;
  Competitor5Name: string | null; Competitor5URL: string | null;
  [key: string]: string | number | null | undefined;
}
interface ASINRow {
  ASIN: string | null; SKU: string | null; SummarizedTitle: string | null;
  ParentageLevel: string | null; ParentASIN: string | null; ParentSKU: string | null;
  VariationID: string | null; VariationProduct: string | null; VariationThemeName: string | null;
  ChildRelationshipType: string | null; Flavor: string | null; Style: string | null;
  Color: string | null; Size: string | null; Status: string | null;
  ProductCategory: string | null; ProductSubcategory: string | null;
  ItemName: string | null; ListPrice: string | null;
  VariationGroup: string | null;
}
interface FilterOptions {
  parentageLevels: string[]; variationThemeNames: string[]; variationIDs: string[];
  productCategories: string[]; productSubcategories: string[];
  flavors: string[]; styles: string[]; colors: string[]; sizes: string[];
  statuses: string[]; totalCount: number;
}
interface FullASIN extends ASINRow {
  AmazonPDPURL: string | null; WebsitePDPURL: string | null;
  DetailedBulletPoint1: string | null; DetailedBulletPoint2: string | null;
  DetailedBulletPoint3: string | null; DetailedBulletPoint4: string | null;
  DetailedBulletPoint5: string | null; ProductDescription: string | null;
  GenericKeyword1: string | null; GenericKeyword2: string | null;
  GenericKeyword3: string | null; GenericKeyword4: string | null;
  GenericKeyword5: string | null;
  [key: string]: string | null | number | undefined;
}
interface Competitor { name: string; url: string; }
interface VariationFamily { parentASIN: string; parentSKU: string; parentTitle: string; variationTheme: string; children: FullASIN[]; }
interface VarietyPackIncludedRow {
  flavor: string; size: string; color: string; style: string;
  units: string; customLabel: string;
}
interface VarietyPackItem {
  asin: string; itemName: string; variationTheme: string;
  familyFlavors: string[]; familySizes: string[]; familyColors: string[]; familyStyles: string[];
  includedRows: VarietyPackIncludedRow[];
  extraFlavors: string; extraSizes: string; extraColors: string; extraStyles: string;
  notes: string;
}

const VARIETY_CHIP_FILTER = /^variety\s*pack$|^assort|^sampler$|^mixed\s*pack$/i;

function cleanThemeLabel(theme: string): string {
  return theme.replace(/[\/\\]/g, " / ").replace(/\bscent\b/gi, "").replace(/\s*\/\s*$/, "").replace(/^\s*\/\s*/, "").replace(/\s+/g, " ").trim() || theme;
}

function ChipSelector({options, value, onChange, onAddOption, placeholder}:{options:string[];value:string;onChange:(v:string)=>void;onAddOption?:(v:string)=>void;placeholder:string}) {
  const filtered = options.filter(o=>!VARIETY_CHIP_FILTER.test(o));
  const [showDropdown, setShowDropdown] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [newVal, setNewVal] = useState("");
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(()=>{
    if(!showDropdown) return;
    const handler=(e:MouseEvent)=>{if(dropRef.current&&!dropRef.current.contains(e.target as Node))setShowDropdown(false);};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[showDropdown]);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {value && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-amber-500/20 text-amber-300 border-amber-500/40 flex items-center gap-1">
            {value}
            <button type="button" onClick={()=>onChange("")} className="hover:text-red-400 ml-0.5">✕</button>
          </span>
        )}
        {!value && (
          <div className="relative" ref={dropRef}>
            <button type="button" onClick={()=>{setShowDropdown(!showDropdown);setCustomMode(false);setNewVal("");}}
              className="inline-flex h-9 items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-medium border border-dashed border-border text-muted-foreground hover:border-amber-500/40 hover:text-amber-400 transition-all">+ Add</button>
            {showDropdown && !customMode && (
              <div className="absolute z-20 top-full left-0 mt-1 min-w-[140px] max-h-48 overflow-y-auto rounded-lg border border-amber-500/30 bg-surface-1 shadow-lg">
                {filtered.length === 0 ? (
                  <div className="px-3 py-2 text-[10px] text-muted-foreground">No options available</div>
                ) : (
                  filtered.map(opt=>(
                    <button key={opt} type="button"
                      onClick={()=>{onChange(opt);setShowDropdown(false);}}
                      className="block w-full text-left px-3 py-1.5 text-[11px] text-foreground hover:bg-amber-500/10 hover:text-amber-300 transition-colors">
                      {opt}
                    </button>
                  ))
                )}
                {onAddOption && (
                  <>
                    <div className="border-t border-border"/>
                    <button type="button" onClick={()=>setCustomMode(true)}
                      className="block w-full text-left px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-amber-500/10 hover:text-amber-400 transition-colors italic">
                      Custom value…
                    </button>
                  </>
                )}
              </div>
            )}
            {showDropdown && customMode && (
              <div className="absolute z-20 top-full left-0 mt-1 min-w-[180px] rounded-lg border border-amber-500/30 bg-surface-1 shadow-lg p-2">
                <div className="flex gap-1">
                  <input value={newVal} onChange={e=>setNewVal(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&newVal.trim()){onAddOption?.(newVal.trim());onChange(newVal.trim());setNewVal("");setShowDropdown(false);setCustomMode(false);}if(e.key==="Escape"){setCustomMode(false);setNewVal("");}}}
                    placeholder={placeholder} autoFocus
                    className="h-9 flex-1 rounded-full border border-amber-500/30 bg-surface-1 px-2 text-[11px] text-foreground placeholder-muted-foreground/60 focus:border-amber-500 focus:outline-none"/>
                  <button type="button" onClick={()=>{if(newVal.trim()){onAddOption?.(newVal.trim());onChange(newVal.trim());setNewVal("");setShowDropdown(false);setCustomMode(false);}}}
                    className="inline-flex h-9 items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30">Add</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function VarietyPackSection({varietyPackDetails, setCompletedSteps, setCurrentStep}:{
  varietyPackDetails: VarietyPackItem[];
  setCompletedSteps: React.Dispatch<React.SetStateAction<Set<string>>>;
  setCurrentStep: (s: Step) => void;
}) {
  const allThemes = varietyPackDetails.map(it=>it.variationTheme.toLowerCase()).join(" ");
  const showFlavor = allThemes.includes("flavor") || varietyPackDetails.some(it=>it.familyFlavors.length>0);
  const showSize   = allThemes.includes("size")   || varietyPackDetails.some(it=>it.familySizes.length>0);
  const showColor  = allThemes.includes("color")  || varietyPackDetails.some(it=>it.familyColors.length>0);
  const showStyle  = allThemes.includes("style")  || varietyPackDetails.some(it=>it.familyStyles.length>0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-medium">S1.2b — Variety Pack Details</h2>
          <p className="text-sm text-muted-foreground mt-1">Pulled from the Variety Pack Builder. To edit pack composition, use the <a href="/variety-packs" className="text-brand hover:underline" target="_blank">Variety Pack Builder</a>.</p>
        </div>
        <span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20 shrink-0">Variety Pack</span>
      </div>

      {varietyPackDetails.length === 0 && (
        <div className="rounded-[18px] border border-border bg-card/80 p-4 text-sm text-muted-foreground">
          No variety pack data found. Configure packs in the <a href="/variety-packs" className="text-brand hover:underline" target="_blank">Variety Pack Builder</a>.
        </div>
      )}

      <div className="space-y-5">
        {varietyPackDetails.map((item, i) => (
          <div key={item.asin||i} className="rounded-[18px] border border-amber-500/20 bg-amber-500/5 p-4 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{item.asin||"—"}</span>
                {item.variationTheme&&<span className="px-1.5 py-0.5 rounded-full text-[9px] bg-muted text-muted-foreground">Theme: {cleanThemeLabel(item.variationTheme)}</span>}
              </div>
              <p className="text-sm text-foreground font-medium">{item.itemName||"Unnamed"}</p>
            </div>

            <div>
              <div className="grid gap-2 mb-1" style={{gridTemplateColumns:`${showFlavor?"1fr":""}${showSize?" 1fr":""}${showColor?" 1fr":""}${showStyle?" 1fr":""} 80px`}}>
                {showFlavor&&<div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Flavor</div>}
                {showSize&&<div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Size</div>}
                {showColor&&<div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Color</div>}
                {showStyle&&<div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Style</div>}
                <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Units</div>
              </div>
              <div className="space-y-1">
                {item.includedRows.map((row, j) => (
                  <div key={j} className="grid gap-2" style={{gridTemplateColumns:`${showFlavor?"1fr":""}${showSize?" 1fr":""}${showColor?" 1fr":""}${showStyle?" 1fr":""} 80px`}}>
                    {showFlavor&&<span className="text-xs text-foreground/80 px-2 py-1 bg-muted/50 rounded-full">{row.flavor||"—"}</span>}
                    {showSize&&<span className="text-xs text-foreground/80 px-2 py-1 bg-muted/50 rounded-full">{row.size||"—"}</span>}
                    {showColor&&<span className="text-xs text-foreground/80 px-2 py-1 bg-muted/50 rounded-full">{row.color||"—"}</span>}
                    {showStyle&&<span className="text-xs text-foreground/80 px-2 py-1 bg-muted/50 rounded-full">{row.style||"—"}</span>}
                    <span className="text-xs text-foreground/80 px-2 py-1 bg-muted/50 rounded-full text-center">{row.units||"1"}</span>
                  </div>
                ))}
              </div>
            </div>
            {item.notes&&<p className="text-xs text-muted-foreground/60 italic">{item.notes}</p>}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button onClick={()=>setCurrentStep("summary")} className="inline-flex h-9 items-center justify-center px-4 border border-border text-muted-foreground rounded-full text-[13px] font-medium hover:bg-muted">← Back</button>
        <button onClick={()=>{setCompletedSteps(prev=>new Set([...prev,"summary","variety-pack"]));setCurrentStep("baseline");}}
          className="inline-flex h-9 items-center justify-center px-4 bg-brand text-white rounded-full text-[13px] font-medium hover:bg-brand-hover">Continue → S1.3</button>
      </div>
    </div>
  );
}

type Step = "client-select"|"asin-select"|"summary"|"variety-pack"|"baseline"|"competitors"|"guidelines"|"confirm";
const STEPS: {id:Step;label:string;code:string}[] = [
  {id:"summary",label:"Project Summary",code:"S1.0"},
  {id:"variety-pack",label:"Variety Pack Details",code:"S1.2b"},
  {id:"baseline",label:"Baseline Analysis",code:"S1.3"},
  {id:"competitors",label:"Competitors",code:"S1.4"},
  {id:"guidelines",label:"Brand Guidelines",code:"S1.5"},
  {id:"confirm",label:"Confirm & Approve",code:"S1.6"},
];

function FilterDropdown({label,options,filterKey,value,onChange}:{label:string;options:string[];filterKey:string;value:string;onChange:(key:string,val:string)=>void}){
  const opts=options||[];
  return(<div className="flex flex-col gap-1"><label className="text-xs text-muted-foreground">{label}</label>
  <select className="h-9 bg-muted border border-border rounded-full px-2 text-sm text-foreground focus:border-amber-500 focus:outline-none" value={value} onChange={e=>onChange(filterKey,e.target.value)}>
  <option value="">All</option>{opts.map(o=><option key={o} value={o}>{o}</option>)}</select></div>);
}

export default function IntakePage() {
  const params=useParams();
  const router=useRouter();
  const projectId=params.id as string;

  const [currentStep,setCurrentStep]=useState<Step>("summary");
  const [completedSteps,setCompletedSteps]=useState<Set<string>>(new Set());
  const [clientSearch,setClientSearch]=useState("");
  const [clients,setClients]=useState<AACClient[]>([]);
  const [clientsLoading,setClientsLoading]=useState(false);
  const [selectedClient,setSelectedClient]=useState<AACClient|null>(null);
  const [filterOptions,setFilterOptions]=useState<FilterOptions|null>(null);
  const [filtersLoading,setFiltersLoading]=useState(false);
  const [activeFilters,setActiveFilters]=useState<Record<string,string>>({});
  const [asinSearch,setAsinSearch]=useState("");
  const [asins,setAsins]=useState<ASINRow[]>([]);
  const [asinsLoading,setAsinsLoading]=useState(false);
  const [asinsTotalCount,setAsinsTotalCount]=useState(0);
  const [asinsPage,setAsinsPage]=useState(0);
  const [selectedASINs,setSelectedASINs]=useState<Set<string>>(new Set());
  const [fullASINData,setFullASINData]=useState<FullASIN[]>([]);
  const [fullDataLoading,setFullDataLoading]=useState(false);
  const [variationFamilies,setVariationFamilies]=useState<VariationFamily[]>([]);
  // S1.3 baseline source per ASIN: an SEO version from BigQuery (V00 inherited CLR / V01+ ours),
  // or "hub" (product record copied at creation) when the listing has no version yet
  const [baselineVersions,setBaselineVersions]=useState<Record<string,BaselineVersion[]>|null>(null);
  const [baselinePick,setBaselinePick]=useState<Record<string,string>>({});
  const hubBaseline=useRef<Map<string,BaselineFields>>(new Map());
  // Summarized titles + product ids from the Hub products table (seo_asins stores neither)
  const [listingMeta,setListingMeta]=useState<Record<string,{productId:string;summarizedTitle:string|null}>>({});
  useEffect(()=>{
    fetch(`/api/seo/projects/${projectId}/listing-meta`)
      .then(r=>r.ok?r.json():Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d:{meta?:Record<string,{productId:string;summarizedTitle:string|null}>})=>setListingMeta(d.meta||{}))
      .catch(()=>{/* titles fall back to the full item name */});
  },[projectId]);
  const metaFor=(asin:string|null|undefined,sku?:string|null)=>asin?(listingMeta[`${asin}::${sku??""}`]??listingMeta[asin]):undefined;
  const [isVarietyPack,setIsVarietyPack]=useState(false);
  const [varietyPackDetails,setVarietyPackDetails]=useState<VarietyPackItem[]>([]);
  const [linkedVariation,setLinkedVariation]=useState<{name:string;code:string;primary_dimension:string|null;theme_attributes:string[]|null}|null>(null);
  const [linkedVariationId,setLinkedVariationId]=useState<string|null>(null);
  const [projectVersion,setProjectVersion]=useState<number>(1);
  const [competitors,setCompetitors]=useState<Competitor[]>([]);
  const [newCompName,setNewCompName]=useState("");
  const [newCompURL,setNewCompURL]=useState("");
  const [guidelines,setGuidelines]=useState("");
  const [guidelinesNotes,setGuidelinesNotes]=useState("");
  const [guidelinesLock,setGuidelinesLock]=useState<"pending"|"locked"|"not_applicable">("pending");
  const [guidelinesFiles,setGuidelinesFiles]=useState<{name:string;extracted:boolean;chars?:number}[]>([]);
  const [guidelinesFileLoading,setGuidelinesFileLoading]=useState(false);
  const fileInputRef=useRef<HTMLInputElement>(null);
  const [s1Approved,setS1Approved]=useState(false);
  const [s1Saving,setS1Saving]=useState(false);
  const [initialLoading,setInitialLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [exportingVariation,setExportingVariation]=useState(false);

  // ── Load saved S1 data on mount ──────────────────────────
  useEffect(()=>{
    if(!projectId||projectId==="new"){setInitialLoading(false);return;}
    (async()=>{
      try{
        // Load project metadata
        const projRes=await fetch(`/api/seo/projects/${projectId}`);
        if(!projRes.ok){setInitialLoading(false);return;}
        const proj=await projRes.json();

        // Load linked variation and version
        if(proj.variation) setLinkedVariation(proj.variation);
        if(proj.variation_id) setLinkedVariationId(proj.variation_id);
        if(proj.version) setProjectVersion(proj.version);

        // Always populate client from project metadata (set by wizard)
        if(proj.client_id_code){
          setSelectedClient({
            ClientIDCode:proj.client_id_code||"",
            BrandName:proj.brand_name||"",
            ClientName:proj.client_name||proj.brand_name||"",
            Marketplace:"",Country:"",Tier:null,
            BrandURL:proj.brand_url||"",
            ClientStatus:"Active",
            Competitor1Name:null,Competitor1URL:null,
            Competitor2Name:null,Competitor2URL:null,
            Competitor3Name:null,Competitor3URL:null,
            Competitor4Name:null,Competitor4URL:null,
            Competitor5Name:null,Competitor5URL:null,
          } as AACClient);
          if(proj.competitors&&proj.competitors.length>0){
            setCompetitors(proj.competitors);
          }
        }

        // Hydrate brand-guidelines from the project itself. They are populated at
        // create time via snapshotClientBrandGuidelines, so they should appear in
        // S1.5 on the very first visit (pre-approval) without a Refresh click.
        if(typeof proj.brand_guidelines==="string"&&proj.brand_guidelines){
          setGuidelines(proj.brand_guidelines);
        }
        const projLock=proj.brand_guidelines_lock;
        if(projLock){
          if(typeof projLock==="string"){
            setGuidelinesLock(projLock as "pending"|"locked"|"not_applicable");
          }else if(typeof projLock==="object"&&typeof projLock.status==="string"){
            setGuidelinesLock(projLock.status as "pending"|"locked"|"not_applicable");
          }else{
            setGuidelinesLock("locked");
          }
        }
        if(typeof proj.brand_guidelines_notes==="string"){
          setGuidelinesNotes(proj.brand_guidelines_notes);
        }

        if(proj.s1_approved_at){
          // S1 already approved — load saved data
          const loadRes=await fetch(`/api/seo/projects/${projectId}/load?phase=s1_intake`);
          if(loadRes.ok){
            const saved=await loadRes.json();
            if(saved.project?.brand_guidelines){
              setGuidelines(saved.project.brand_guidelines);
              setGuidelinesLock(saved.project.brand_guidelines_lock||"locked");
            }
            if(saved.asins&&saved.asins.length>0){
              const mapped:FullASIN[]=saved.asins.map((a:any)=>({
                ASIN:a.asin,SKU:a.sku,
                ParentageLevel:a.parentage_level,ParentASIN:null,ParentSKU:null,
                VariationID:a.variation_id,VariationProduct:a.variation_product,
                VariationThemeName:a.variation_theme_name,
                ChildRelationshipType:null,
                Flavor:a.flavor,Style:a.style,Color:a.color,Size:a.size,
                VariationGroup:a.variation_group||null,
                Status:"Active",ProductCategory:null,ProductSubcategory:null,
                ItemName:a.existing_content?.item_name||"",
                ListPrice:null,SummarizedTitle:null,
                AmazonPDPURL:a.amazon_url,WebsitePDPURL:a.website_url,
                DetailedBulletPoint1:a.existing_content?.detailed_bullets?.[0]||null,
                DetailedBulletPoint2:a.existing_content?.detailed_bullets?.[1]||null,
                DetailedBulletPoint3:a.existing_content?.detailed_bullets?.[2]||null,
                DetailedBulletPoint4:a.existing_content?.detailed_bullets?.[3]||null,
                DetailedBulletPoint5:a.existing_content?.detailed_bullets?.[4]||null,
                ProductDescription:a.existing_content?.product_description||null,
                GenericKeyword1:a.existing_content?.generic_keywords?.[0]||null,
                GenericKeyword2:a.existing_content?.generic_keywords?.[1]||null,
                GenericKeyword3:a.existing_content?.generic_keywords?.[2]||null,
                GenericKeyword4:a.existing_content?.generic_keywords?.[3]||null,
                GenericKeyword5:a.existing_content?.generic_keywords?.[4]||null,
                // Saved baseline source (S1.3 dropdown); absent on older projects = Hub record
                _baselineVersion:a.existing_content?.source?.type==="seo_version"?String(a.existing_content.source.version):null,
                _baselineCategory:a.existing_content?.source?.category??null,
                _baselineProject:a.existing_content?.source?.project_name??null,
              }));
              setFullASINData(mapped);
              buildVariationFamilies(mapped);
            }
            setS1Approved(true);
            setCompletedSteps(prev=>new Set([...prev,"summary","variety-pack","baseline","competitors","guidelines"]));setCurrentStep("confirm");
          }
        } else {
          // S1 not approved yet — load seoAsins from DB (created by wizard)
          const loadRes=await fetch(`/api/seo/projects/${projectId}/load?phase=s1_intake`);
          if(loadRes.ok){
            const saved=await loadRes.json();
            if(saved.asins&&saved.asins.length>0){
              const mapped:FullASIN[]=saved.asins.map((a:any)=>({
                ASIN:a.asin,SKU:a.sku,
                ParentageLevel:a.parentage_level,ParentASIN:null,ParentSKU:null,
                VariationID:a.variation_id,VariationProduct:a.variation_product,
                VariationThemeName:a.variation_theme_name,
                ChildRelationshipType:null,
                Flavor:a.flavor,Style:a.style,Color:a.color,Size:a.size,
                VariationGroup:a.variation_group||null,
                Status:"Active",ProductCategory:null,ProductSubcategory:null,
                ItemName:a.existing_content?.item_name||"",
                ListPrice:null,SummarizedTitle:null,
                AmazonPDPURL:a.amazon_url,WebsitePDPURL:a.website_url,
                DetailedBulletPoint1:a.existing_content?.detailed_bullets?.[0]||null,
                DetailedBulletPoint2:a.existing_content?.detailed_bullets?.[1]||null,
                DetailedBulletPoint3:a.existing_content?.detailed_bullets?.[2]||null,
                DetailedBulletPoint4:a.existing_content?.detailed_bullets?.[3]||null,
                DetailedBulletPoint5:a.existing_content?.detailed_bullets?.[4]||null,
                ProductDescription:a.existing_content?.product_description||null,
                GenericKeyword1:a.existing_content?.generic_keywords?.[0]||null,
                GenericKeyword2:a.existing_content?.generic_keywords?.[1]||null,
                GenericKeyword3:a.existing_content?.generic_keywords?.[2]||null,
                GenericKeyword4:a.existing_content?.generic_keywords?.[3]||null,
                GenericKeyword5:a.existing_content?.generic_keywords?.[4]||null,
                // Saved baseline source (S1.3 dropdown); absent on older projects = Hub record
                _baselineVersion:a.existing_content?.source?.type==="seo_version"?String(a.existing_content.source.version):null,
                _baselineCategory:a.existing_content?.source?.category??null,
                _baselineProject:a.existing_content?.source?.project_name??null,
              }));
              setFullASINData(mapped);
              buildVariationFamilies(mapped);
              // Detect variety packs from saved ASINs
              const VARIETY_SIGNALS_LOAD = /variety|assort|sampler|multi[- ]?pack|bundle|combo|mixed|selection|collection/i;
              const hasVP = mapped.some((r:FullASIN) =>
                VARIETY_SIGNALS_LOAD.test(r.ItemName||"") || VARIETY_SIGNALS_LOAD.test(r.SummarizedTitle||"") ||
                VARIETY_SIGNALS_LOAD.test(r.VariationProduct||"") || VARIETY_SIGNALS_LOAD.test(r.Flavor||"")
              );
              if (hasVP) {
                setIsVarietyPack(true);
                const vpAsins = mapped.filter((r:FullASIN) =>
                  VARIETY_SIGNALS_LOAD.test(r.ItemName||"") || VARIETY_SIGNALS_LOAD.test(r.SummarizedTitle||"") ||
                  VARIETY_SIGNALS_LOAD.test(r.VariationProduct||"") || VARIETY_SIGNALS_LOAD.test(r.Flavor||"")
                );
                // Collect family values from all non-variety-pack ASINs (since ParentASIN is null in saved data)
                const nonVP = mapped.filter((r:FullASIN) =>
                  !VARIETY_SIGNALS_LOAD.test(r.ItemName||"") && !VARIETY_SIGNALS_LOAD.test(r.SummarizedTitle||"") &&
                  !VARIETY_SIGNALS_LOAD.test(r.VariationProduct||"") && !VARIETY_SIGNALS_LOAD.test(r.Flavor||"")
                );
                const uniq = (arr:string[]) => [...new Set(arr.filter(Boolean))];
                const allFlavors = uniq(nonVP.map((s:FullASIN)=>s.Flavor||""));
                const allSizes = uniq(nonVP.map((s:FullASIN)=>s.Size||""));
                const allColors = uniq(nonVP.map((s:FullASIN)=>s.Color||""));
                const allStyles = uniq(nonVP.map((s:FullASIN)=>s.Style||""));

                // Query master variety_pack_items to pre-populate includedRows
                let masterVPDataLoad: Record<string, Array<{flavor:string|null;size:string|null;color:string|null;style:string|null;customLabel:string|null;units:number}>> = {};
                try {
                  const vpRes = await fetch("/api/products/variety-pack-batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ asins: vpAsins.map((r:FullASIN) => r.ASIN).filter(Boolean) }),
                  });
                  if (vpRes.ok) masterVPDataLoad = await vpRes.json();
                } catch { /* fall back to empty rows */ }

                const newVPDetails = vpAsins.map((r:FullASIN) => {
                  const masterItems = masterVPDataLoad[r.ASIN||""] || [];
                  const includedRows = masterItems.length > 0
                    ? masterItems.map(mi => ({
                        flavor: mi.flavor || "",
                        size: mi.size || "",
                        color: mi.color || "",
                        style: mi.style || "",
                        units: String(mi.units || 1),
                        customLabel: mi.customLabel || "",
                      }))
                    : [{flavor:"",size:"",color:"",style:"",units:"1",customLabel:""}];
                  return {
                    asin: r.ASIN||"",
                    itemName: r.ItemName||r.SummarizedTitle||"",
                    variationTheme: r.VariationThemeName||"",
                    familyFlavors: allFlavors,
                    familySizes: allSizes,
                    familyColors: allColors,
                    familyStyles: allStyles,
                    includedRows,
                    extraFlavors:"", extraSizes:"", extraColors:"", extraStyles:"",
                    notes:"",
                  };
                });
                setVarietyPackDetails(newVPDetails);
              }
              setCompletedSteps(prev=>new Set([...prev,"summary"]));
            }
          }
          // Start at summary step (read-only)
          setCurrentStep("summary");
        }
      }catch(e){console.error("Load S1 error:",e);}
      finally{setInitialLoading(false);}
    })();
  },[projectId]);

  // ── Save S1 to Supabase ──────────────────────────────────
  const saveAndApproveS1=async()=>{
    if(!projectId||projectId==="new")return;
    setS1Saving(true);
    try{
      const metadata={
        brand_name:selectedClient?.BrandName||"",
        client_name:selectedClient?.ClientName||"",
        client_id_code:selectedClient?.ClientIDCode||"",
        brand_url:selectedClient?.BrandURL||"",
        date:new Date().toISOString().split("T")[0],
        competitors:competitors,
        brand_guidelines:guidelines,
        brand_guidelines_lock:guidelinesLock,
        brand_guidelines_notes:guidelinesNotes,
      };
      const asins=fullASINData.map(a=>({
        asin:a.ASIN||"",
        sku:a.SKU||"",
        amazon_url:(a as any).AmazonPDPURL||"",
        website_url:(a as any).WebsitePDPURL||"",
        variation_id:a.VariationID||"",
        variation_product:a.VariationProduct||"",
        parentage_level:a.ParentageLevel||"Child",
        variation_theme_name:a.VariationThemeName||"",
        flavor:a.Flavor||"",
        style:a.Style||"",
        color:a.Color||"",
        size:a.Size||"",
        variation_group:a.VariationGroup||"",
        existing_content:{
          item_name:a.ItemName||"",
          detailed_bullets:[a.DetailedBulletPoint1||"",a.DetailedBulletPoint2||"",a.DetailedBulletPoint3||"",a.DetailedBulletPoint4||"",a.DetailedBulletPoint5||""],
          product_description:a.ProductDescription||"",
          generic_keywords:[a.GenericKeyword1||"",a.GenericKeyword2||"",a.GenericKeyword3||"",a.GenericKeyword4||"",a.GenericKeyword5||""],
          // Where this baseline came from (S1.3 picker): the Hub record or an earlier project's S6 copy
          source:a._baselineVersion!=null?{type:"seo_version",version:a._baselineVersion,category:a._baselineCategory,project_name:a._baselineProject}:{type:"hub"},
        },
      }));
      const res=await fetch(`/api/seo/projects/${projectId}/save`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({phase:"s1_intake",data:{metadata,asins,variety_pack_details:varietyPackDetails}}),
      });
      if(!res.ok)throw new Error(await res.text());
      setS1Approved(true);
    }catch(e: unknown){setError(`Save failed: ${e instanceof Error ? e.message : String(e)}`);}
    finally{setS1Saving(false);}
  };

  const searchClients=useCallback(async()=>{
    setClientsLoading(true);setError(null);
    try{const p=new URLSearchParams();if(clientSearch)p.set("brandName",clientSearch);
    const r=await fetch(`/api/seo/bq/clients?${p}`);if(!r.ok)throw new Error(await r.text());
    const d=await r.json();setClients(d.clients||[]);}catch(e: unknown){setError(e instanceof Error ? e.message : String(e));}finally{setClientsLoading(false);}
  },[clientSearch]);
  useEffect(()=>{const t=setTimeout(searchClients,300);return()=>clearTimeout(t);},[searchClients]);

  const loadFilterOptions=useCallback(async(code:string)=>{
    setFiltersLoading(true);try{const r=await fetch(`/api/seo/bq/filters?clientIDCode=${encodeURIComponent(code)}`);
    if(!r.ok)throw new Error(await r.text());setFilterOptions(await r.json());}catch(e: unknown){setError(e instanceof Error ? e.message : String(e));}finally{setFiltersLoading(false);}
  },[]);

  const loadASINs=useCallback(async()=>{
    if(!selectedClient?.ClientIDCode)return;setAsinsLoading(true);setError(null);
    try{const p=new URLSearchParams();p.set("clientIDCode",selectedClient.ClientIDCode);p.set("limit","50");p.set("offset",String(asinsPage*50));
    Object.entries(activeFilters).forEach(([k,v])=>{if(v)p.set(k,v);});if(asinSearch)p.set("searchTerm",asinSearch);
    const r=await fetch(`/api/seo/bq/asins?${p}`);if(!r.ok)throw new Error(await r.text());const d=await r.json();
    setAsins(d.asins||[]);setAsinsTotalCount(d.totalCount||0);}catch(e: unknown){setError(e instanceof Error ? e.message : String(e));}finally{setAsinsLoading(false);}
  },[selectedClient,activeFilters,asinSearch,asinsPage]);
  useEffect(()=>{if(currentStep==="asin-select"&&selectedClient?.ClientIDCode)loadASINs();},[currentStep,loadASINs,selectedClient]);

  const handleSelectClient=(client:AACClient)=>{
    setSelectedClient(client);
    const comps:Competitor[]=[];
    for(let i=1;i<=5;i++){
      const nk=`Competitor${i}Name`,uk=`Competitor${i}URL`;
      let name=client[nk],url=client[uk];
      if(!name){const keys=Object.keys(client);const fk=keys.find(k=>k.toLowerCase()===nk.toLowerCase());if(fk)name=client[fk];}
      if(!url){const keys=Object.keys(client);const fk=keys.find(k=>k.toLowerCase()===uk.toLowerCase());if(fk)url=client[fk];}
      if(name&&typeof name==="string"&&name.trim().length>0)comps.push({name:name.trim(),url:url&&typeof url==="string"?url.trim():""});
    }
    setCompetitors(comps);
    if(client.ClientIDCode)loadFilterOptions(client.ClientIDCode);
    setCompletedSteps(prev=>new Set([...prev,"client-select"]));
    setCurrentStep("asin-select");
  };

  const rowKey=(row:ASINRow)=>`${row.ASIN||""}::${row.SKU||""}`;
  const toggleASIN=(key:string)=>{if(!key)return;setSelectedASINs(p=>{const n=new Set(p);if(n.has(key))n.delete(key);else n.add(key);return n;});};
  const selectAll=()=>{const u=new Set(asins.map(rowKey).filter(k=>k!=="::"));setSelectedASINs(p=>{const n=new Set(p);u.forEach(k=>n.add(k));return n;});};
  const deselectAll=()=>{const o=new Set(asins.map(rowKey));setSelectedASINs(p=>{const n=new Set(p);o.forEach(k=>n.delete(k));return n;});};

  const proceedToVariationMap=async()=>{
    if(selectedASINs.size===0)return;setFullDataLoading(true);setError(null);
    try{
    // Extract unique ASINs from composite keys (ASIN::SKU)
    const uniqueASINs=Array.from(new Set(Array.from(selectedASINs).map(k=>k.split("::")[0]).filter(Boolean)));
    const r=await fetch("/api/seo/bq/asins",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({asins:uniqueASINs,clientIDCode:selectedClient!.ClientIDCode})});
    if(!r.ok)throw new Error(await r.text());const d=await r.json();
    const allData=d.asins||[];
    // Filter to only the specific ASIN+SKU rows the user selected
    const deduped=allData.filter((r:FullASIN)=>selectedASINs.has(`${r.ASIN||""}::${r.SKU||""}`));
    setFullASINData(deduped);buildVariationFamilies(deduped);setCompletedSteps(prev=>new Set([...prev,"summary"]));
    // Detect variety pack: any child has multiple flavors/sizes/colors in ItemName or VariationProduct that suggest assortment
    const VARIETY_SIGNALS = /variety|assort|sampler|multi[- ]?pack|bundle|combo|mixed|selection|collection/i;
    const hasVarietyPack = deduped.some((r:FullASIN) =>
      VARIETY_SIGNALS.test(r.ItemName||"") || VARIETY_SIGNALS.test(r.SummarizedTitle||"") ||
      VARIETY_SIGNALS.test(r.VariationProduct||"") || VARIETY_SIGNALS.test(r.Flavor||"")
    );
    if (hasVarietyPack) {
      setIsVarietyPack(true);
      // Pre-populate variety pack details from detected ASINs
      const vpAsins = deduped.filter((r:FullASIN) =>
        VARIETY_SIGNALS.test(r.ItemName||"") || VARIETY_SIGNALS.test(r.SummarizedTitle||"") ||
        VARIETY_SIGNALS.test(r.VariationProduct||"") || VARIETY_SIGNALS.test(r.Flavor||"")
      );
      // Collect family values from all non-variety-pack ASINs
      const nonVP = deduped.filter((r:FullASIN) =>
        !VARIETY_SIGNALS.test(r.ItemName||"") && !VARIETY_SIGNALS.test(r.SummarizedTitle||"") &&
        !VARIETY_SIGNALS.test(r.VariationProduct||"") && !VARIETY_SIGNALS.test(r.Flavor||"")
      );
      const uniq = (arr:string[]) => [...new Set(arr.filter(Boolean))];
      const allFlavors = uniq(nonVP.map((s:FullASIN)=>s.Flavor||""));
      const allSizes = uniq(nonVP.map((s:FullASIN)=>s.Size||""));
      const allColors = uniq(nonVP.map((s:FullASIN)=>s.Color||""));
      const allStyles = uniq(nonVP.map((s:FullASIN)=>s.Style||""));

      // Query master variety_pack_items data to pre-populate includedRows
      let masterVPData: Record<string, Array<{flavor:string|null;size:string|null;color:string|null;style:string|null;customLabel:string|null;units:number}>> = {};
      try {
        const vpRes = await fetch("/api/products/variety-pack-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asins: vpAsins.map((r:FullASIN) => r.ASIN).filter(Boolean) }),
        });
        if (vpRes.ok) masterVPData = await vpRes.json();
      } catch { /* fall back to empty rows */ }

      const newDetails = vpAsins.map((r:FullASIN) => {
        const masterItems = masterVPData[r.ASIN||""] || [];
        const includedRows = masterItems.length > 0
          ? masterItems.map(mi => ({
              flavor: mi.flavor || "",
              size: mi.size || "",
              color: mi.color || "",
              style: mi.style || "",
              units: String(mi.units || 1),
              customLabel: mi.customLabel || "",
            }))
          : [{flavor:"",size:"",color:"",style:"",units:"1",customLabel:""}];
        return {
          asin: r.ASIN||"",
          itemName: r.ItemName||r.SummarizedTitle||"",
          variationTheme: r.VariationThemeName||"",
          familyFlavors: allFlavors, familySizes: allSizes, familyColors: allColors, familyStyles: allStyles,
          includedRows,
          extraFlavors:"", extraSizes:"", extraColors:"", extraStyles:"",
          notes:"",
        };
      });
      setVarietyPackDetails(newDetails);
      setCurrentStep("variety-pack");
    } else {
      setCurrentStep("baseline");
    }
    }catch(e: unknown){setError(e instanceof Error ? e.message : String(e));}finally{setFullDataLoading(false);}
  };

  const buildVariationFamilies=(data:FullASIN[])=>{
    const fam=new Map<string,VariationFamily>();
    // Build lookup maps: ASIN->row, SKU->row for parents
    const parentByASIN=new Map<string,FullASIN>();
    const parentBySKU=new Map<string,FullASIN>();
    const parentByVarID=new Map<string,FullASIN>();

    // Pass 1: Index parents
    data.forEach(r=>{
      if(r.ParentageLevel==="Parent"){
        if(r.ASIN)parentByASIN.set(r.ASIN,r);
        if(r.SKU)parentBySKU.set(r.SKU,r);
        if(r.VariationID)parentByVarID.set(r.VariationID,r);
        if(r.ASIN)fam.set(r.ASIN,{parentASIN:r.ASIN,parentSKU:r.SKU||"",parentTitle:r.ItemName||r.SummarizedTitle||r.ASIN,variationTheme:r.VariationThemeName||"",children:[]});
      }
    });

    // Pass 2: Attach children — match by ParentASIN, then ParentSKU, then VariationID
    data.forEach(r=>{
      if(r.ParentageLevel!=="Child")return;
      let parent:FullASIN|undefined;
      let parentKey="";

      // Try ParentASIN first
      if(r.ParentASIN){parent=parentByASIN.get(r.ParentASIN);if(parent)parentKey=parent.ASIN!;}
      // Fallback: match by ParentSKU
      if(!parent&&r.ParentSKU){parent=parentBySKU.get(r.ParentSKU);if(parent)parentKey=parent.ASIN!;}
      // Fallback: match by VariationID
      if(!parent&&r.VariationID){parent=parentByVarID.get(r.VariationID);if(parent)parentKey=parent.ASIN!;}

      if(parentKey&&fam.has(parentKey)){
        fam.get(parentKey)!.children.push(r);
      } else {
        // Orphan child — create placeholder family
        const key=r.ParentASIN||r.ParentSKU||r.VariationID||r.ASIN||"unknown";
        let f=fam.get(key);
        if(!f){f={parentASIN:key,parentSKU:r.ParentSKU||"",parentTitle:`Parent: ${key}`,variationTheme:r.VariationThemeName||"",children:[]};fam.set(key,f);}
        f.children.push(r);
      }
    });

    // Pass 3: Standalone
    data.forEach(r=>{
      if(r.ParentageLevel!=="Parent"&&r.ParentageLevel!=="Child"&&r.ASIN&&!fam.has(r.ASIN)){
        fam.set(r.ASIN,{parentASIN:r.ASIN,parentSKU:r.SKU||"",parentTitle:r.ItemName||r.SummarizedTitle||r.ASIN,variationTheme:"Standalone",children:[]});
      }
    });

    setVariationFamilies(Array.from(fam.values()));
  };

  // Swap listings to the chosen baseline ("hub" or a version number), per ASIN.
  // The Hub copy is captured once, before the first swap, so "hub" can restore it.
  const applyBaselinePicks=(picks:Record<string,string>,versions:Record<string,BaselineVersion[]>,rows:FullASIN[])=>{
    if(hubBaseline.current.size===0){
      for(const r of rows){
        if(!r.ASIN)continue;
        const snap={} as BaselineFields;
        for(const k of BASELINE_FIELD_KEYS)snap[k]=(r[k] as string|null)??null;
        hubBaseline.current.set(r.ASIN,snap);
      }
    }
    const next=rows.map(r=>{
      if(!r.ASIN||!(r.ASIN in picks))return r;
      const pick=picks[r.ASIN];
      const v=pick==="hub"?undefined:versions[r.ASIN]?.find(x=>x.version===pick);
      const fields=v?v.fields:hubBaseline.current.get(r.ASIN);
      return {...r,...fields,_baselineVersion:v?v.version:null,_baselineCategory:v?v.category:null,_baselineProject:v?.projectName??null};
    });
    setFullASINData(next);
    buildVariationFamilies(next);
  };

  // Load each listing's SEO versions (read-only BigQuery) when S1.3 opens; default to the latest version.
  useEffect(()=>{
    if(currentStep!=="baseline"||baselineVersions!==null||fullASINData.length===0)return;
    fetch(`/api/seo/projects/${projectId}/baseline-versions`)
      .then(r=>r.ok?r.json():Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d:{versions?:Record<string,BaselineVersion[]>})=>{
        const versions=d.versions||{};
        const picks:Record<string,string>={};
        for(const r of fullASINData){
          if(!r.ASIN)continue;
          const list=versions[r.ASIN]||[];
          picks[r.ASIN]=list.length?list[list.length-1].version:"hub";
        }
        setBaselineVersions(versions);
        setBaselinePick(picks);
        applyBaselinePicks(picks,versions,fullASINData);
      })
      .catch(()=>setBaselineVersions({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[currentStep,baselineVersions,projectId,fullASINData.length]);

  const pickBaseline=(asin:string,value:string)=>{
    const picks={...baselinePick,[asin]:value};
    setBaselinePick(picks);
    applyBaselinePicks({[asin]:value},baselineVersions||{},fullASINData);
  };

  const getBaselineScore=(row:FullASIN):number=>{let s=0;[row.ItemName&&row.ItemName.length>50,row.DetailedBulletPoint1&&row.DetailedBulletPoint1.length>20,row.DetailedBulletPoint2&&row.DetailedBulletPoint2.length>20,row.DetailedBulletPoint3&&row.DetailedBulletPoint3.length>20,row.ProductDescription&&row.ProductDescription.length>100,row.GenericKeyword1&&row.GenericKeyword1.length>5].forEach(c=>{if(c)s++;});return Math.min(5,Math.round((s/6)*5));};

  // File upload — server-side extraction for PDF/DOCX/TXT/MD
  const extractPdfClientSide=async(file:File):Promise<string>=>{
    const pdfjsLib=await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
    const arrayBuf=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:arrayBuf}).promise;
    const pages:string[]=[];
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i);
      const content=await page.getTextContent();
      const text=content.items.map((item:any)=>item.str).join(" ");
      if(text.trim())pages.push(text.trim());
    }
    return pages.join("\n\n");
  };

  const handleGuidelinesFileUpload=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>50*1024*1024){setError(`"${file.name}" is too large (${(file.size/1024/1024).toFixed(1)}MB). Max 50MB.`);return;}
    const ext=file.name.split(".").pop()?.toLowerCase()||"";
    setGuidelinesFileLoading(true);setError(null);
    try{
      let extracted="";

      // PDFs: extract client-side to avoid Vercel body size limits
      if(ext==="pdf"){
        extracted=await extractPdfClientSide(file);
      }
      // TXT/MD: read directly in browser
      else if(ext==="txt"||ext==="md"){
        extracted=await file.text();
      }
      // DOCX/DOC: send to server (small enough usually)
      else {
        const formData=new FormData();
        formData.append("file",file);
        const res=await fetch("/api/seo/extract-doc",{method:"POST",body:formData});
        const contentType=res.headers.get("content-type")||"";
        if(!contentType.includes("application/json")){
          setError(`Extraction failed for "${file.name}". The file may be too large. Try a smaller file or paste the content manually.`);
          setGuidelinesFiles(p=>[...p,{name:file.name,extracted:false}]);
          return;
        }
        const data=await res.json();
        if(!res.ok||data.error){
          setError(`Could not extract "${file.name}": ${data.error||"unknown error"}. Please paste the content manually below.`);
          setGuidelinesFiles(p=>[...p,{name:file.name,extracted:false}]);
          return;
        }
        extracted=data.text?.trim()||"";
      }

      if(extracted.trim()){
        setGuidelines(p=>{
          const clean=p.replace(/\[Uploaded:[^\]]+\(attached\)\]\n?/g,"").trim();
          return clean?`${clean}\n\n--- From ${file.name} ---\n\n${extracted}`:extracted;
        });
        setGuidelinesFiles(p=>[...p,{name:file.name,extracted:true,chars:extracted.length}]);
      } else {
        setError(`"${file.name}" appears empty or unreadable. Please paste the content manually.`);
        setGuidelinesFiles(p=>[...p,{name:file.name,extracted:false}]);
      }
    }catch(err: unknown){
      setError(`File error: ${err instanceof Error ? err.message : String(err)}`);
      setGuidelinesFiles(p=>[...p,{name:file.name,extracted:false}]);
    }finally{setGuidelinesFileLoading(false);if(fileInputRef.current)fileInputRef.current.value="";}
  };

  // Remove a file entry and strip its content from the textarea
  const removeGuidelinesFile=(idx:number)=>{
    const file=guidelinesFiles[idx];
    setGuidelinesFiles(p=>p.filter((_,i)=>i!==idx));
    if(file.extracted){
      setGuidelines(p=>{
        // Remove the section added by this file
        const marker=`--- From ${file.name} ---`;
        const parts=p.split(/\n\n---/);
        const filtered=parts.filter(part=>!part.includes(marker.replace("--- From ","").replace(" ---","")));
        // Also handle if it was the first/only content
        const rejoined=filtered.join("\n\n---").trim();
        // Clean up leading separator if present
        return rejoined.replace(/^---[^\n]*\n\n/,"").trim();
      });
    }
  };

  // Refresh brand_guidelines/lock from the client's active brand book
  const [refreshingBg,setRefreshingBg]=useState(false);
  const refreshFromClient=async()=>{
    if(!projectId||projectId==="new")return;
    if(!confirm("Refresh will overwrite the auto-imported brand guidelines from the client's active book. Your additional notes are preserved. Continue?"))return;
    setRefreshingBg(true);
    try{
      const r=await fetch(`/api/seo/projects/${projectId}/brand-guidelines/refresh`,{method:"POST"});
      if(!r.ok){
        const txt=await r.text().catch(()=>"");
        alert(`Refresh failed: ${r.status}${txt?` — ${txt}`:""}`);
        return;
      }
      // Re-fetch the saved S1 intake to pull updated brand_guidelines + lock
      const loadRes=await fetch(`/api/seo/projects/${projectId}/load?phase=s1_intake`);
      if(loadRes.ok){
        const saved=await loadRes.json();
        if(typeof saved.project?.brand_guidelines==="string"){
          setGuidelines(saved.project.brand_guidelines);
        }
        const lock=saved.project?.brand_guidelines_lock;
        if(lock){
          // The DB column is jsonb {status, ...}; the legacy "string" form may still appear.
          if(typeof lock==="string"){
            setGuidelinesLock(lock as "pending"|"locked"|"not_applicable");
          }else if(typeof lock==="object"&&typeof lock.status==="string"){
            setGuidelinesLock(lock.status as "pending"|"locked"|"not_applicable");
          }else{
            setGuidelinesLock("locked");
          }
        }else{
          setGuidelinesLock("locked");
        }
      }
    }finally{
      setRefreshingBg(false);
    }
  };

  const addCompetitor=()=>{
    if(!newCompName.trim())return;
    setCompetitors(p=>[...p,{name:newCompName.trim(),url:newCompURL.trim()}]);
    setNewCompName("");setNewCompURL("");
  };
  const removeCompetitor=(idx:number)=>{setCompetitors(p=>p.filter((_,i)=>i!==idx));};

  const handleFilterChange=useCallback((filterKey:string,value:string)=>{
    setActiveFilters(p=>({...p,[filterKey]:value}));setAsinsPage(0);
  },[]);

  useSectionHeader({
    title: "Intake & Discovery",
    subtitle: selectedClient?`${selectedClient.BrandName||selectedClient.ClientName} (${selectedClient.ClientIDCode})`:"Loading project…",
    steps: STEPS.map(s=>({key:s.id,label:`${s.code} ${s.label}`})),
    currentStep: currentStep,
    onStepClick: (key)=>setCurrentStep(key as Step),
    completedSteps,
    isApproved: s1Approved,
  });

  // Shared by S1.0 Project Summary and S1.6 Confirm & Approve
  const renderClientCard=()=>(
              <div className="flex items-center justify-between gap-3 bg-card/80 border border-border rounded-[18px] p-4">
                <div className="min-w-0">
                  <h3 className="text-xs text-muted-foreground uppercase mb-2">Client</h3>
                  <p className="text-sm font-medium truncate">{selectedClient?.BrandName||selectedClient?.ClientName||"—"}</p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">{selectedClient?.ClientIDCode||"No client"}</p>
                </div>
                {selectedClient?.ClientIDCode && (
                  <ClientMark
                    compact
                    client={{ clientIdCode: selectedClient.ClientIDCode, clientName: selectedClient.BrandName || selectedClient.ClientName || selectedClient.ClientIDCode }}
                  />
                )}
              </div>
  );
  const renderTargetedAsins=()=>(
            <div className="bg-card/80 border border-border rounded-[18px] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs text-muted-foreground uppercase">Targeted ASINs</h3>
                <span className="text-xs text-muted-foreground">{fullASINData.length} ASINs • {variationFamilies.length} {variationFamilies.length===1?"family":"families"}</span>
              </div>

              {fullASINData.length>0?(
                <div className="space-y-3">
                  {variationFamilies.map(f=>{
                    // Families with a real parent row in the project; orphan children
                    // get a placeholder family keyed by ParentASIN / VariationID.
                    const parentRow=fullASINData.find(r=>r.ASIN===f.parentASIN&&r.ParentageLevel==="Parent");
                    const isStandalone=f.variationTheme==="Standalone"&&f.children.length===0;
                    const varId=parentRow?.VariationID||f.children[0]?.VariationID||"";
                    const title=parentRow
                      ?(parentRow.SummarizedTitle||parentRow.ItemName||f.parentTitle)
                      :isStandalone?"Standalone":(f.children[0]?.VariationProduct||"");
                    return(
                      <div key={f.parentASIN} className="rounded-[18px] border border-border bg-muted/20 p-3">
                        <div className="mb-2 flex min-w-0 items-center gap-2">
                          <ScopePill scope={parentRow?"VARIATION":"ASIN"} />
                          <span className="truncate text-sm text-foreground">{[varId,title].filter(Boolean).join(" ")||f.parentASIN}</span>
                        </div>
                        {(parentRow||isStandalone)&&(
                          <CoverageRow badge={isStandalone?"Standalone":"Parent"} asin={f.parentASIN} from="seo-project" productId={metaFor(f.parentASIN,parentRow?.SKU)?.productId} title={metaFor(f.parentASIN,parentRow?.SKU)?.summarizedTitle||parentRow?.SummarizedTitle||parentRow?.ItemName||f.parentTitle} />
                        )}
                        <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
                          {f.children.map(ch=>(
                            <CoverageRow key={`${ch.ASIN}::${ch.SKU}`} badge="Child" asin={ch.ASIN||""} from="seo-project" productId={metaFor(ch.ASIN,ch.SKU)?.productId} title={metaFor(ch.ASIN,ch.SKU)?.summarizedTitle||ch.SummarizedTitle||ch.ItemName||null} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ):(
                <p className="text-sm text-muted-foreground">No ASINs loaded yet. If this project was created without the wizard, ASIN data may not be available.</p>
              )}
            </div>
  );

  return(
    <div className="w-full min-w-0">
      {error&&<div className=""><div className="bg-red-500/10 border border-red-500/30 rounded-[18px] p-3 mb-4"><p className="text-sm text-red-400">{error}</p><button onClick={()=>setError(null)} className="text-xs text-red-500 underline mt-1">Dismiss</button></div></div>}

      {initialLoading?(<div className="py-20 text-center"><p className="text-muted-foreground">Loading S1 data…</p></div>):s1Approved?(
      <div className="pb-12">
        {/* ═══ LOCKED S1 SUMMARY ═══ */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-[18px] p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-emerald-400 text-lg">✓</span>
            <div><p className="text-emerald-400 font-medium text-sm">S1 Intake — Approved & Locked</p>
            <p className="text-xs text-muted-foreground mt-0.5">{fullASINData.length} ASINs • {variationFamilies.length} variation {variationFamilies.length===1?"family":"families"} • {competitors.length} competitor{competitors.length!==1?"s":""}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <a href={`/seo/${projectId}/keywords`} className="inline-flex h-9 items-center justify-center rounded-full bg-brand px-4 text-[13px] font-medium text-white hover:bg-brand-hover">Continue → S2 Keywords</a>
            <button onClick={()=>{setS1Approved(false);setCurrentStep("summary");}} className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground">Unlock for Editing</button>
          </div>
        </div>

        <div className={`grid grid-cols-1 gap-4 mb-6 ${linkedVariation ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          {renderClientCard()}
          {linkedVariation && (
            <div className="bg-card/80 border border-amber-500/20 rounded-[18px] p-4">
              <h3 className="text-xs text-muted-foreground uppercase mb-2">Version</h3>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-amber-400">{linkedVariation.name}</p>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">V{projectVersion}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-mono">{linkedVariation.code}</p>
            </div>
          )}
          <div className="bg-card/80 border border-border rounded-[18px] p-4">
            <h3 className="text-xs text-muted-foreground uppercase mb-2">Competitors</h3>
            {competitors.length>0?<div className="text-sm text-foreground/80 space-y-0.5">{competitors.map((c,i)=><p key={i}>{i+1}. {c.name}</p>)}</div>:<p className="text-sm text-muted-foreground">None</p>}
          </div>
        </div>

        {/* Targeted ASINs — same panel as S1.0 */}
        <div className="mb-6">{renderTargetedAsins()}</div>

        {/* Baseline Summary */}
        <div className="bg-card/80 border border-border rounded-[18px] p-4">
          <h3 className="text-xs text-muted-foreground uppercase mb-3">Content Baseline</h3>
          <div className="space-y-2">{fullASINData.filter(a=>a.ParentageLevel!=="Parent").map(a=>{const sc=getBaselineScore(a);return(
            <div key={a.ASIN} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/50 last:border-0">
              <span className="font-mono text-muted-foreground w-28 shrink-0">{a.ASIN}</span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${a._baselineVersion!=null?"border-brand/30 bg-brand/10 text-brand":"border-border text-muted-foreground"}`} title="Baseline source chosen in S1.3">
                {a._baselineVersion!=null?baselineVersionLabel({version:String(a._baselineVersion),category:String(a._baselineCategory??""),status:"",projectName:(a._baselineProject as string|null)??null}):"Hub product record"}
              </span>
              <span className="text-foreground/80 flex-1 truncate">{a.ItemName||"—"}</span>
              <div className="flex gap-0.5 shrink-0">{[1,2,3,4,5].map(n=><div key={n} className={`size-2 rounded-full ${n<=sc?sc>=4?"bg-emerald-400":sc>=2?"bg-amber-400":"bg-red-400":"bg-muted"}`}/>)}</div>
              <span className="text-muted-foreground w-8 text-right">{sc}/5</span>
            </div>);})}</div>
        </div>
      </div>
      ):(
      <div className="pb-12">

        {/* ═══ S1.0 — Project Summary (read-only, set by wizard) ═══ */}
        {currentStep==="summary"&&(
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Project Summary</h2>
              <span className="text-xs text-muted-foreground">Client &amp; ASINs configured during project creation</span>
            </div>

            {/* Client info cards */}
            <div className={`grid grid-cols-1 gap-4 ${linkedVariation ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
              {renderClientCard()}
              {linkedVariation && (
                <div className="bg-card/80 border border-amber-500/20 rounded-[18px] p-4">
                  <h3 className="text-xs text-muted-foreground uppercase mb-2">Version</h3>
                  <p className="text-sm font-medium text-amber-400">{linkedVariation.name}</p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">{linkedVariation.code}</p>
                  {linkedVariation.theme_attributes && linkedVariation.theme_attributes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {linkedVariation.theme_attributes.map(attr => (
                        <span key={attr} className="px-1.5 py-0.5 rounded-full text-[9px] bg-amber-500/10 text-amber-400/80 border border-amber-500/15">{attr}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="bg-card/80 border border-border rounded-[18px] p-4">
                <h3 className="text-xs text-muted-foreground uppercase mb-2">Competitors</h3>
                {competitors.length>0?<div className="text-sm text-foreground/80 space-y-0.5">{competitors.map((c,i)=><p key={i}>{i+1}. {c.name}</p>)}</div>:<p className="text-sm text-muted-foreground">None — add in S1.4</p>}
              </div>
            </div>

            {/* Targeted ASINs */}
            {renderTargetedAsins()}

            <div className="flex justify-end">
              <button onClick={()=>{setCompletedSteps(prev=>new Set([...prev,"summary"]));setCurrentStep(isVarietyPack?"variety-pack":"baseline");}} className="inline-flex h-9 items-center justify-center px-4 bg-brand text-white rounded-full text-[13px] font-medium hover:bg-brand-hover">
                {isVarietyPack ? "Continue to S1.2b Variety Pack Details →" : "Continue to S1.3 Baseline Analysis →"}
              </button>
            </div>
          </div>
        )}

        {/* ═══ S1.2b — Variety Pack Confirmation ═══ */}
        {currentStep==="variety-pack"&&(
          <VarietyPackSection
            varietyPackDetails={varietyPackDetails}
            setCompletedSteps={setCompletedSteps}
            setCurrentStep={setCurrentStep}
          />
        )}

        {/* ═══ S1.3 — Baseline Analysis ═══ */}
        {currentStep==="baseline"&&(
          <div className="space-y-4">
            <h2 className="text-lg font-medium">S1.3 — Existing Content Baseline</h2>
            <p className="text-sm text-muted-foreground">Completeness check of the current listing content (are fields filled and long enough — not a judgement of copy quality). Reference only — never copy verbatim.</p>
            {baselineVersions===null&&<p className="text-xs text-muted-foreground">Loading SEO versions…</p>}
            {fullASINData.filter(a=>a.ParentageLevel!=="Parent").map(asin=>{const sc=getBaselineScore(asin);
            const titleLen=asin.ItemName?.length||0;
            const descLen=asin.ProductDescription?.length||0;
            const bulletLens=[1,2,3,4,5].map(n=>(asin as any)[`DetailedBulletPoint${n}`]?.length||0);
            const kwCount=[1,2,3,4,5].filter(n=>(asin as any)[`GenericKeyword${n}`]).length;
            return(
              <div key={asin.ASIN} className="border border-border rounded-[18px] overflow-hidden">
                <div className="bg-card/80 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3"><span className="font-mono text-xs text-muted-foreground">{asin.ASIN}</span><span className="text-xs text-foreground whitespace-normal">{asin.ItemName||"—"}</span></div>
                  {asin.ASIN&&baselineVersions!==null&&(
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">Baseline source:</span>
                      {(baselineVersions[asin.ASIN]||[]).length>0?(
                        <Select value={baselinePick[asin.ASIN]??"hub"} onValueChange={v=>pickBaseline(asin.ASIN!,v)}>
                          <SelectTrigger className="h-9 w-[240px] rounded-full text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[...(baselineVersions[asin.ASIN]||[])].reverse().map(v=>(
                              <SelectItem key={v.version} value={v.version} className="text-xs">{baselineVersionLabel(v)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ):(
                        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground" title="No SEO version exists for this listing yet (e.g. a new NTA client) — the Hub product record is used">Hub product record · no SEO version yet</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 shrink-0"><span className="text-xs text-muted-foreground" title="Title >50 chars, bullets 1–3 >20 chars, description >100 chars, a keyword — scaled to 5">Completeness:</span><div className="flex gap-0.5">{[1,2,3,4,5].map(n=><div key={n} className={`size-2 rounded-full ${n<=sc?sc>=4?"bg-emerald-400":sc>=2?"bg-amber-400":"bg-red-400":"bg-muted"}`}/>)}</div><span className="text-xs text-muted-foreground">{sc}/5</span></div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-baseline gap-2"><span className="text-[10px] text-muted-foreground uppercase font-bold w-20 shrink-0">Title</span><span className="text-xs text-muted-foreground">{titleLen} chars</span></div>
                  <p className="text-xs text-foreground/80 ml-20">{asin.ItemName||<span className="text-red-400 italic">Missing</span>}</p>

                  <div className="flex items-baseline gap-2 mt-3"><span className="text-[10px] text-muted-foreground uppercase font-bold w-20 shrink-0">Bullets</span><span className="text-xs text-muted-foreground">{bulletLens.filter(l=>l>0).length}/5 filled</span></div>
                  <div className="ml-20 space-y-1">{[1,2,3,4,5].map(n=>{const v=(asin as any)[`DetailedBulletPoint${n}`];return(<div key={n} className="flex gap-2 items-start"><span className="text-[10px] text-muted-foreground/60 w-3 shrink-0">{n}.</span><span className="text-xs text-foreground/80">{v||<span className="text-muted-foreground/60 italic">Empty</span>}</span>{v&&<span className="text-[10px] text-muted-foreground/60 shrink-0">{v.length}c</span>}</div>);})}</div>

                  <div className="flex items-baseline gap-2 mt-3"><span className="text-[10px] text-muted-foreground uppercase font-bold w-20 shrink-0">Description</span><span className="text-xs text-muted-foreground">{descLen} chars</span></div>
                  <p className="text-xs text-foreground/80 ml-20 line-clamp-3">{asin.ProductDescription||<span className="text-red-400 italic">Missing</span>}</p>

                  <div className="flex items-baseline gap-2 mt-3"><span className="text-[10px] text-muted-foreground uppercase font-bold w-20 shrink-0">Keywords</span><span className="text-xs text-muted-foreground">{kwCount}/5 filled</span></div>
                  <div className="ml-20 flex flex-wrap gap-1">{[1,2,3,4,5].map(n=>{const v=(asin as any)[`GenericKeyword${n}`];return v?<span key={n} className="text-xs bg-muted text-foreground/80 px-2 py-0.5 rounded-full">{v}</span>:null;})}</div>
                </div>
              </div>
            );})}
            <div className="flex justify-end"><button onClick={()=>{setCompletedSteps(prev=>new Set([...prev,"summary","baseline"]));setCurrentStep("competitors");}} className="inline-flex h-9 items-center justify-center px-4 bg-brand text-white rounded-full text-[13px] font-medium hover:bg-brand-hover">Continue to S1.4 Competitors →</button></div>
          </div>
        )}

        {/* ═══ S1.4 — Competitors ═══ */}
        {currentStep==="competitors"&&(
          <div className="space-y-4">
            <h2 className="text-lg font-medium">S1.4 — Competitor Intelligence</h2>
            <p className="text-sm text-muted-foreground">Competitors from client record + manually added. Used for S2 Cerebro, S4 Alexa for Shopping, S5 COSMO. Never named in customer-facing content.</p>
            {competitors.length>0&&(
              <div className="border border-border rounded-[18px] overflow-hidden"><table className="w-full"><thead><tr className="bg-card/80 text-xs text-muted-foreground uppercase"><th className="text-left px-4 py-2">#</th><th className="text-left px-4 py-2">Name</th><th className="text-left px-4 py-2">URL</th><th className="px-4 py-2 w-16"></th></tr></thead>
              <tbody>{competitors.map((c,i)=>(<tr key={i} className="border-t border-border/50"><td className="px-4 py-3 text-sm text-muted-foreground">{i+1}</td><td className="px-4 py-3 text-sm text-foreground">{c.name}</td><td className="px-4 py-3 text-xs text-muted-foreground font-mono truncate max-w-md">{c.url||"—"}</td>
              <td className="px-4 py-3 text-right"><button onClick={()=>removeCompetitor(i)} className="text-xs text-red-400 hover:text-red-300">Remove</button></td></tr>))}</tbody></table></div>
            )}
            {competitors.length===0&&<div className="bg-card/80 border border-border rounded-[18px] p-6 text-center"><p className="text-muted-foreground">No competitors yet</p></div>}
            {/* Add competitor form */}
            <div className="bg-card/80 border border-border rounded-[18px] p-4">
              <p className="text-xs text-muted-foreground mb-3">Add Competitor</p>
              <div className="flex items-end gap-3">
                <div className="flex-1"><label className="text-[10px] text-muted-foreground mb-1 block">Name *</label><input value={newCompName} onChange={e=>setNewCompName(e.target.value)} placeholder="Competitor brand name" className="h-9 w-full bg-muted border border-border rounded-full px-3 text-sm text-foreground focus:border-amber-500 focus:outline-none"/></div>
                <div className="flex-1"><label className="text-[10px] text-muted-foreground mb-1 block">URL (optional)</label><input value={newCompURL} onChange={e=>setNewCompURL(e.target.value)} placeholder="https://amazon.com/dp/..." className="h-9 w-full bg-muted border border-border rounded-full px-3 text-sm text-foreground focus:border-amber-500 focus:outline-none"/></div>
                <button onClick={addCompetitor} disabled={!newCompName.trim()} className="inline-flex h-9 items-center justify-center px-4 bg-muted text-foreground rounded-full text-[13px] hover:bg-muted disabled:opacity-30">+ Add</button>
              </div>
            </div>
            <div className="flex justify-end"><button onClick={()=>{setCompletedSteps(prev=>new Set([...prev,"summary","baseline","competitors"]));setCurrentStep("guidelines");}} className="inline-flex h-9 items-center justify-center px-4 bg-brand text-white rounded-full text-[13px] font-medium hover:bg-brand-hover">Continue to S1.5 Brand Guidelines →</button></div>
          </div>
        )}

        {/* ═══ S1.5 — Brand Guidelines ═══ */}
        {currentStep==="guidelines"&&(
          <div className="space-y-4">
            <h2 className="text-lg font-medium">S1.5 — Brand Guidelines</h2>
            <p className="text-sm text-muted-foreground">Share brand voice, language preferences, words to avoid, audience notes, positioning. Upload a document and/or paste text below.</p>
            <div className="bg-card/80 border border-border rounded-[18px] p-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" onChange={handleGuidelinesFileUpload} className="hidden" multiple={false}/>
                <button onClick={()=>{setError(null);fileInputRef.current?.click();}} disabled={guidelinesFileLoading} className="inline-flex h-9 justify-center items-center gap-2 px-4 bg-muted border border-border rounded-full text-[13px] text-foreground hover:bg-muted disabled:opacity-50">
                  {guidelinesFileLoading?(
                    <><span className="inline-block size-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"/>Extracting…</>
                  ):(
                    <><svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>Upload & Extract</>
                  )}
                </button>
                <span className="text-xs text-muted-foreground">PDF • DOCX • DOC • TXT • MD — text extracted automatically</span>
                <button type="button" onClick={refreshFromClient} disabled={refreshingBg} className="inline-flex h-9 items-center justify-center ml-auto px-3 text-[13px] border border-border rounded-full hover:bg-muted disabled:opacity-50" title="Overwrite project-specific edits with the client's active brand book snapshot">{refreshingBg?"Refreshing…":"Refresh from client"}</button>
              </div>
              {guidelinesFiles.length>0&&(
                <div className="flex flex-wrap gap-2">
                  {guidelinesFiles.map((f,i)=>(
                    <span key={i} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${f.extracted?"bg-emerald-500/10 text-emerald-400 border border-emerald-500/20":"bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                      <span>{f.extracted?"✓":"✗"}</span>
                      <span className="max-w-[200px] truncate">{f.name}</span>
                      {f.chars&&<span className="opacity-60">({f.chars.toLocaleString()} chars)</span>}
                      <button onClick={()=>removeGuidelinesFile(i)} className="ml-1 opacity-60 hover:opacity-100 hover:text-white transition-opacity" title="Remove">
                        <svg className="size-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">From client (auto-imported)</label>
              <p className="text-[11px] text-muted-foreground">Pulled from the client's active brand book at project create. The Refresh button overwrites this with the latest client snapshot.</p>
              <textarea value={guidelines} onChange={e=>setGuidelines(e.target.value)} placeholder="Brand-book content auto-imports here when the client has an active book. Click Refresh from client to re-sync." rows={12} className="w-full bg-card border border-border rounded-[18px] px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:border-amber-500 focus:outline-none resize-y"/>
              <p className="text-[11px] text-muted-foreground">{guidelines.length.toLocaleString()} characters</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">Additional notes (project-specific)</label>
              <p className="text-[11px] text-muted-foreground">Notes that survive every Refresh from client. Use this for project-specific context the brand book doesn't cover.</p>
              <textarea value={guidelinesNotes} onChange={e=>setGuidelinesNotes(e.target.value)} placeholder="e.g. for this launch, lean into the &quot;cooling performance&quot; angle; avoid emojis in bullets; reference the FIN-MISSION 2026 catalog only." rows={6} className="w-full bg-card border border-border rounded-[18px] px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:border-amber-500 focus:outline-none resize-y"/>
              <p className="text-[11px] text-muted-foreground">{guidelinesNotes.length.toLocaleString()} characters</p>
            </div>
            <div className="flex gap-3"><button onClick={()=>{const hasContent=guidelines.trim()||guidelinesNotes.trim();if(hasContent)setGuidelinesLock("locked");else setGuidelinesLock("not_applicable");setCompletedSteps(prev=>new Set([...prev,"summary","baseline","competitors","guidelines"]));setCurrentStep("confirm");}} className="inline-flex h-9 items-center justify-center px-4 bg-brand text-white rounded-full text-[13px] font-medium hover:bg-brand-hover">{(guidelines.trim()||guidelinesNotes.trim())?"Lock Guidelines & Continue →":"No Additions — Skip →"}</button></div>
          </div>
        )}

        {/* ═══ S1.6 — Confirm & Approve ═══ */}
        {currentStep==="confirm"&&(
          <div className="space-y-6">
            <h2 className="text-lg font-medium">S1.6 — Confirm & Approve</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderClientCard()}
              <div className="bg-card/80 border border-border rounded-[18px] p-4"><h3 className="text-xs text-muted-foreground uppercase mb-2">Competitors</h3>{competitors.length>0?<ul className="text-sm text-foreground/80 space-y-0.5">{competitors.map((c,i)=><li key={i}>{i+1}. {c.name}</li>)}</ul>:<p className="text-sm text-muted-foreground">None</p>}</div>
            </div>
            {renderTargetedAsins()}
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-card/80 border border-border rounded-[18px] p-4"><h3 className="text-xs text-muted-foreground uppercase mb-2">Brand Guidelines</h3>
                {(guidelines&&guidelines.trim())||(guidelinesNotes&&guidelinesNotes.trim())?(
                  <div className="space-y-3">
                    {guidelines&&guidelines.trim()&&(
                      <div>
                        <p className="text-sm text-emerald-400 mb-1">✓ {guidelinesLock==="locked"?"Locked":"Provided"} from client ({guidelines.length.toLocaleString()} chars){guidelinesFiles.length>0&&` • ${guidelinesFiles.filter(f=>f.extracted).length} file(s)`}</p>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3 leading-relaxed">{guidelines.slice(0,400)}{guidelines.length>400?"…":""}</p>
                      </div>
                    )}
                    {guidelinesNotes&&guidelinesNotes.trim()&&(
                      <div>
                        <p className="text-sm text-emerald-400 mb-1">✓ Additional notes ({guidelinesNotes.length.toLocaleString()} chars)</p>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3 leading-relaxed">{guidelinesNotes.slice(0,400)}{guidelinesNotes.length>400?"…":""}</p>
                      </div>
                    )}
                  </div>
                ):(
                  <p className="text-sm text-muted-foreground">No brand guidelines provided</p>
                )}
              </div>
            </div>
            {!s1Approved?(
              <div className="bg-card/80 border border-amber-500/20 rounded-[18px] p-6 text-center">
                <p className="text-sm text-foreground/80 mb-4">Review the intake data above. Once approved, S1 is locked and S2 Keywords will be unlocked.</p>
                <button onClick={saveAndApproveS1} disabled={s1Saving} className="inline-flex h-9 items-center justify-center px-4 bg-emerald-500 text-white rounded-full text-[13px] font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50">{s1Saving?"Saving…":"✓ APPROVE S1 — Proceed to S2 Keywords"}</button>
              </div>
            ):(
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-[18px] p-6 text-center">
                <p className="text-emerald-400 font-medium mb-4">✓ S1 Approved — S2 Keywords is now unlocked</p>
                <div className="flex items-center justify-center gap-3">
                  <a href={`/seo/${projectId}/keywords`} className="inline-flex h-9 items-center justify-center rounded-full bg-brand px-4 text-[13px] font-medium text-white hover:bg-brand-hover">Continue → S2 Keywords</a>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
      )}
    </div>
  );
}
