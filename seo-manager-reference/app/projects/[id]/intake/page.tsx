/* eslint-disable react-doctor/rendering-conditional-render */
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-array-index-as-key */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/async-await-in-loop */
"use client";
import StepNav from "@/components/step-nav";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

interface AACClient {
  ClientStatus: string | null; ClientName: string | null; ClientIDCode: string | null;
  BrandName: string | null; Marketplace: string | null; Country: string | null;
  Tier: number | null; BrandURL: string | null; ClientBibleURL: string | null; ClientBibleID: string | null;
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
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState("");
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {filtered.map(opt=>(
          <button key={opt} type="button"
            onClick={()=>onChange(value===opt?"":opt)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${value===opt?"bg-amber-500/20 text-amber-300 border-amber-500/40":"bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"}`}>
            {opt}
          </button>
        ))}
        {onAddOption && !adding && (
          <button type="button" onClick={()=>setAdding(true)}
            className="px-2 py-0.5 rounded text-[10px] font-medium border border-dashed border-zinc-600 text-zinc-500 hover:border-amber-500/40 hover:text-amber-400 transition-all">+ Add</button>
        )}
      </div>
      {onAddOption && adding && (
        <div className="flex gap-1">
          <input value={newVal} onChange={e=>setNewVal(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&newVal.trim()){onAddOption(newVal.trim());onChange(newVal.trim());setNewVal("");setAdding(false);}if(e.key==="Escape"){setNewVal("");setAdding(false);}}}
            placeholder={placeholder} autoFocus
            className="flex-1 rounded border border-amber-500/30 bg-surface-1 px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"/>
          <button type="button" onClick={()=>{if(newVal.trim()){onAddOption(newVal.trim());onChange(newVal.trim());setNewVal("");setAdding(false);}}}
            className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30">Add</button>
          <button type="button" onClick={()=>{setNewVal("");setAdding(false);}}
            className="px-1.5 py-0.5 text-[10px] text-zinc-600 hover:text-zinc-400">✕</button>
        </div>
      )}
      {value && !filtered.includes(value) && !adding && (
        <input value={value} onChange={e=>onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded border border-surface-4 bg-surface-1 px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"/>
      )}
      {value && !filtered.includes(value) && value.trim() && !adding && (
        <button type="button" onClick={()=>onChange("")}
          className="text-[9px] text-zinc-600 hover:text-zinc-400">✕ clear</button>
      )}
    </div>
  );
}

function VarietyPackSection({varietyPackDetails, setVarietyPackDetails, setIsVarietyPack, setCompletedSteps, setCurrentStep}:{
  varietyPackDetails: VarietyPackItem[];
  setVarietyPackDetails: React.Dispatch<React.SetStateAction<VarietyPackItem[]>>;
  setIsVarietyPack: React.Dispatch<React.SetStateAction<boolean>>;
  setCompletedSteps: React.Dispatch<React.SetStateAction<Set<string>>>;
  setCurrentStep: (s: Step) => void;
}) {
  const allThemes = varietyPackDetails.map(it=>it.variationTheme.toLowerCase()).join(" ");
  const showFlavor = allThemes.includes("flavor") || varietyPackDetails.some(it=>it.familyFlavors.length>0);
  const showSize   = allThemes.includes("size")   || varietyPackDetails.some(it=>it.familySizes.length>0);
  const showColor  = allThemes.includes("color")  || varietyPackDetails.some(it=>it.familyColors.length>0);
  const showStyle  = allThemes.includes("style")  || varietyPackDetails.some(it=>it.familyStyles.length>0);

  const updateRow = useCallback((itemIdx:number, rowIdx:number, field:keyof VarietyPackIncludedRow, val:string) =>
    setVarietyPackDetails(prev=>prev.map((p,i)=>i!==itemIdx?p:{...p,
      includedRows:p.includedRows.map((r,j)=>j!==rowIdx?r:{...r,[field]:val})})), [setVarietyPackDetails]);

  const addRow = useCallback((itemIdx:number) =>
    setVarietyPackDetails(prev=>prev.map((p,i)=>i!==itemIdx?p:{...p,
      includedRows:[...p.includedRows,{flavor:"",size:"",color:"",style:"",units:"1",customLabel:""}]})), [setVarietyPackDetails]);

  const removeRow = useCallback((itemIdx:number, rowIdx:number) =>
    setVarietyPackDetails(prev=>prev.map((p,i)=>i!==itemIdx?p:{...p,
      includedRows:p.includedRows.filter((_,j)=>j!==rowIdx)})), [setVarietyPackDetails]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-medium">S1.2b — Variety Pack Details</h2>
          <p className="text-sm text-zinc-400 mt-1">Confirm what is included in each variety pack. Each row is one included item — select from family members or type a custom value. Add as many rows as needed.</p>
        </div>
        <span className="px-2 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20 shrink-0">Variety Pack</span>
      </div>

      {varietyPackDetails.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
          No variety pack ASINs pre-detected. You can skip or add manually.
        </div>
      )}

      <div className="space-y-5">
        {varietyPackDetails.map((item, i) => (
          <div key={item.asin||i} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-4">
            {/* ASIN header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">{item.asin||"New ASIN"}</span>
                  {item.variationTheme&&<span className="px-1.5 py-0.5 rounded text-[9px] bg-zinc-800 text-zinc-400">Theme: {cleanThemeLabel(item.variationTheme)}</span>}
                </div>
                <p className="text-sm text-zinc-200 font-medium">{item.itemName||"Unnamed"}</p>
              </div>
              <button onClick={()=>setVarietyPackDetails(prev=>prev.filter((_,j)=>j!==i))}
                className="text-[10px] text-zinc-600 hover:text-red-400 shrink-0">Remove</button>
            </div>

            {/* Column headers */}
            <div>
              <div className="grid gap-2 mb-1" style={{gridTemplateColumns:`${showFlavor?"1fr":""}${showSize?" 1fr":""}${showColor?" 1fr":""}${showStyle?" 1fr":""} 80px 1fr`}}>
                {showFlavor&&<div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Flavor</div>}
                {showSize&&<div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Size</div>}
                {showColor&&<div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Color</div>}
                {showStyle&&<div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Style</div>}
                <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Units</div>
                <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Custom Label</div>
              </div>

              {/* Included rows */}
              <div className="space-y-2">
                {item.includedRows.map((row, j) => (
                  <div key={j} className="grid gap-2 items-start" style={{gridTemplateColumns:`${showFlavor?"1fr":""}${showSize?" 1fr":""}${showColor?" 1fr":""}${showStyle?" 1fr":""} 80px 1fr auto`}}>
                    {showFlavor&&(
                      <ChipSelector
                        options={item.familyFlavors}
                        value={row.flavor}
                        onChange={v=>updateRow(i,j,"flavor",v)}
                        onAddOption={v=>setVarietyPackDetails(prev=>prev.map((p,k)=>k===i?{...p,familyFlavors:[...new Set([...p.familyFlavors,v])]}:p))}
                        placeholder="e.g. Vanilla"
                      />
                    )}
                    {showSize&&(
                      <ChipSelector
                        options={item.familySizes}
                        value={row.size}
                        onChange={v=>updateRow(i,j,"size",v)}
                        onAddOption={v=>setVarietyPackDetails(prev=>prev.map((p,k)=>k===i?{...p,familySizes:[...new Set([...p.familySizes,v])]}:p))}
                        placeholder="e.g. 4oz"
                      />
                    )}
                    {showColor&&(
                      <ChipSelector
                        options={item.familyColors}
                        value={row.color}
                        onChange={v=>updateRow(i,j,"color",v)}
                        onAddOption={v=>setVarietyPackDetails(prev=>prev.map((p,k)=>k===i?{...p,familyColors:[...new Set([...p.familyColors,v])]}:p))}
                        placeholder="e.g. Red"
                      />
                    )}
                    {showStyle&&(
                      <ChipSelector
                        options={item.familyStyles}
                        value={row.style}
                        onChange={v=>updateRow(i,j,"style",v)}
                        onAddOption={v=>setVarietyPackDetails(prev=>prev.map((p,k)=>k===i?{...p,familyStyles:[...new Set([...p.familyStyles,v])]}:p))}
                        placeholder="e.g. Classic"
                      />
                    )}
                    <input value={row.units} type="number" min="1"
                      onChange={e=>updateRow(i,j,"units",e.target.value)}
                      placeholder="1"
                      className="rounded border border-surface-4 bg-surface-1 px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none text-center"/>
                    <input value={row.customLabel}
                      onChange={e=>updateRow(i,j,"customLabel",e.target.value)}
                      placeholder="Optional custom label"
                      className="rounded border border-surface-4 bg-surface-1 px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"/>
                    {item.includedRows.length>1&&(
                      <button type="button" onClick={()=>removeRow(i,j)}
                        className="text-zinc-600 hover:text-red-400 text-[11px] px-1 pt-1">✕</button>
                    )}
                    {item.includedRows.length===1&&<div/>}
                  </div>
                ))}
              </div>

              {/* Add row */}
              <button type="button" onClick={()=>addRow(i)}
                className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-amber-400 transition-colors">
                <svg className="size-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                Add another included item
              </button>
            </div>

            {/* Notes */}
            <div>
              <label className="text-[9px] text-zinc-600 font-bold uppercase tracking-wide block mb-1">Pack Notes</label>
              <input value={item.notes} onChange={e=>setVarietyPackDetails(prev=>prev.map((p,k)=>k===i?{...p,notes:e.target.value}:p))}
                placeholder="e.g. includes 2 of each flavor, limited edition packaging…"
                className="w-full rounded border border-surface-4 bg-surface-1 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"/>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button onClick={()=>setCurrentStep("asin-select")} className="px-4 py-2 border border-zinc-700 text-zinc-400 rounded-lg text-sm font-medium hover:bg-zinc-800">← Back</button>
        <div className="flex items-center gap-3">
          <button onClick={()=>{setIsVarietyPack(false);setVarietyPackDetails([]);setCompletedSteps(prev=>new Set([...prev,"variety-pack"]));setCurrentStep("variation-map");}}
            className="px-4 py-2 border border-zinc-700 text-zinc-400 rounded-lg text-sm font-medium hover:bg-zinc-800">Not a Variety Pack — Skip →</button>
          <button onClick={()=>{setCompletedSteps(prev=>new Set([...prev,"asin-select","variety-pack"]));setCurrentStep("variation-map");}}
            className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400">Confirm Pack Details → S1.3</button>
        </div>
      </div>
    </div>
  );
}

type Step = "client-select"|"asin-select"|"variety-pack"|"variation-map"|"baseline"|"competitors"|"guidelines"|"confirm";
const STEPS: {id:Step;label:string;code:string}[] = [
  {id:"client-select",label:"Select Client",code:"S1.1"},
  {id:"asin-select",label:"Select ASINs",code:"S1.2"},
  {id:"variety-pack",label:"Variety Pack Details",code:"S1.2b"},
  {id:"variation-map",label:"Variation Family Map",code:"S1.3"},
  {id:"baseline",label:"Baseline Analysis",code:"S1.4"},
  {id:"competitors",label:"Competitors",code:"S1.5"},
  {id:"guidelines",label:"Brand Guidelines",code:"S1.6"},
  {id:"confirm",label:"Confirm & Approve",code:"S1.7"},
];

function FD({ label, options, filterKey, activeFilters, setActiveFilters, setAsinsPage }: {
  label: string; options: string[]; filterKey: string;
  activeFilters: Record<string, string>;
  setActiveFilters: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setAsinsPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const opts = options || [];
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-zinc-400">{label}</label>
      <select className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" value={activeFilters[filterKey] || ""} onChange={e => { setActiveFilters(p => ({ ...p, [filterKey]: e.target.value })); setAsinsPage(0); }}>
        <option value="">All</option>{opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default function IntakePage() {
  const params=useParams();
  const router=useRouter();
  const projectId=params.id as string;

  const [currentStep,setCurrentStep]=useState<Step>("client-select");
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
  const [isVarietyPack,setIsVarietyPack]=useState(false);
  const [varietyPackDetails,setVarietyPackDetails]=useState<VarietyPackItem[]>([]);
  const [competitors,setCompetitors]=useState<Competitor[]>([]);
  const [newCompName,setNewCompName]=useState("");
  const [newCompURL,setNewCompURL]=useState("");
  const [guidelines,setGuidelines]=useState("");
  const [guidelinesLock,setGuidelinesLock]=useState<"pending"|"locked"|"not_applicable">("pending");
  const [guidelinesFiles,setGuidelinesFiles]=useState<{name:string;extracted:boolean;chars?:number}[]>([]);
  const [guidelinesFileLoading,setGuidelinesFileLoading]=useState(false);
  const fileInputRef=useRef<HTMLInputElement>(null);
  const [s1Approved,setS1Approved]=useState(false);
  const [s1Saving,setS1Saving]=useState(false);
  const [initialLoading,setInitialLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);

  // ── Load saved S1 data on mount ──────────────────────────
  useEffect(()=>{
    if(!projectId||projectId==="new"){setInitialLoading(false);return;}
    (async()=>{
      try{
        // Check if project has S1 approved
        const projRes=await fetch(`/api/projects/${projectId}`);
        if(!projRes.ok){setInitialLoading(false);return;}
        const proj=await projRes.json();
        
        if(proj.s1_approved_at){
          // S1 already approved — load saved data
          const loadRes=await fetch(`/api/projects/${projectId}/load?phase=s1_intake`);
          if(loadRes.ok){
            const saved=await loadRes.json();
            // Restore state from saved data
            if(saved.project){
              setSelectedClient({
                ClientIDCode:saved.project.client_id_code||"",
                BrandName:saved.project.brand_name||"",
                ClientName:saved.project.client_name||"",
                Marketplace:"",Country:"",Tier:null,
                BrandURL:saved.project.brand_url||"",
                ClientBibleURL:saved.project.client_bible_url||"",
                ClientBibleID:null,ClientStatus:"Active",
                Competitor1Name:null,Competitor1URL:null,
                Competitor2Name:null,Competitor2URL:null,
                Competitor3Name:null,Competitor3URL:null,
                Competitor4Name:null,Competitor4URL:null,
                Competitor5Name:null,Competitor5URL:null,
              } as AACClient);
              if(saved.project.competitors&&saved.project.competitors.length>0){
                setCompetitors(saved.project.competitors);
              }
            }
            if(saved.asins&&saved.asins.length>0){
              const mapped:FullASIN[]=saved.asins.map((a:any)=>({
                ASIN:a.asin,SKU:a.sku,
                ParentageLevel:a.parentage_level,ParentASIN:null,ParentSKU:null,
                VariationID:a.variation_id,VariationProduct:a.variation_product,
                VariationThemeName:a.variation_theme_name,
                ChildRelationshipType:null,
                Flavor:a.flavor,Style:a.style,Color:a.color,Size:a.size,
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
              }));
              setFullASINData(mapped);
              buildVariationFamilies(mapped);
            }
            // Restore brand guidelines from saved project
            if(saved.project?.brand_guidelines){
              setGuidelines(saved.project.brand_guidelines);
              setGuidelinesLock(saved.project.brand_guidelines_lock||"locked");
            }
            setS1Approved(true);
            setCompletedSteps(prev=>new Set([...prev,"client-select","asin-select","variation-map","baseline","competitors","guidelines"]));setCurrentStep("confirm");
          }
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
        client_bible_url:selectedClient?.ClientBibleURL||"",
        brand_url:selectedClient?.BrandURL||"",
        date:new Date().toISOString().split("T")[0],
        competitors:competitors,
        brand_guidelines:guidelines,
        brand_guidelines_lock:guidelinesLock,
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
        existing_content:{
          item_name:a.ItemName||"",
          detailed_bullets:[a.DetailedBulletPoint1||"",a.DetailedBulletPoint2||"",a.DetailedBulletPoint3||"",a.DetailedBulletPoint4||"",a.DetailedBulletPoint5||""],
          product_description:a.ProductDescription||"",
          generic_keywords:[a.GenericKeyword1||"",a.GenericKeyword2||"",a.GenericKeyword3||"",a.GenericKeyword4||"",a.GenericKeyword5||""],
        },
      }));
      const res=await fetch(`/api/projects/${projectId}/save`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({phase:"s1_intake",data:{metadata,asins,variety_pack_details:varietyPackDetails}}),
      });
      if(!res.ok)throw new Error(await res.text());
      setS1Approved(true);
    }catch(e:any){setError(`Save failed: ${e.message}`);}
    finally{setS1Saving(false);}
  };

  const searchClients=useCallback(async()=>{
    setClientsLoading(true);setError(null);
    try{const p=new URLSearchParams();if(clientSearch)p.set("brandName",clientSearch);
    const r=await fetch(`/api/bq/clients?${p}`);if(!r.ok)throw new Error(await r.text());
    const d=await r.json();setClients(d.clients||[]);}catch(e:any){setError(e.message);}finally{setClientsLoading(false);}
  },[clientSearch]);
  useEffect(()=>{const t=setTimeout(searchClients,300);return()=>clearTimeout(t);},[searchClients]);

  const loadFilterOptions=useCallback(async(code:string)=>{
    setFiltersLoading(true);try{const r=await fetch(`/api/bq/filters?clientIDCode=${encodeURIComponent(code)}`);
    if(!r.ok)throw new Error(await r.text());setFilterOptions(await r.json());}catch(e:any){setError(e.message);}finally{setFiltersLoading(false);}
  },[]);

  const loadASINs=useCallback(async()=>{
    if(!selectedClient?.ClientIDCode)return;setAsinsLoading(true);setError(null);
    try{const p=new URLSearchParams();p.set("clientIDCode",selectedClient.ClientIDCode);p.set("limit","50");p.set("offset",String(asinsPage*50));
    Object.entries(activeFilters).forEach(([k,v])=>{if(v)p.set(k,v);});if(asinSearch)p.set("searchTerm",asinSearch);
    const r=await fetch(`/api/bq/asins?${p}`);if(!r.ok)throw new Error(await r.text());const d=await r.json();
    setAsins(d.asins||[]);setAsinsTotalCount(d.totalCount||0);}catch(e:any){setError(e.message);}finally{setAsinsLoading(false);}
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
    const r=await fetch("/api/bq/asins",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({asins:uniqueASINs,clientIDCode:selectedClient!.ClientIDCode})});
    if(!r.ok)throw new Error(await r.text());const d=await r.json();
    const allData=d.asins||[];
    // Filter to only the specific ASIN+SKU rows the user selected
    const deduped=allData.filter((r:FullASIN)=>selectedASINs.has(`${r.ASIN||""}::${r.SKU||""}`));
    console.log("Full data loaded:",deduped.length,"ASINs");
    console.log("Parentage breakdown:",deduped.map((r:FullASIN)=>`${r.ASIN}=${r.ParentageLevel||"none"} parent=${r.ParentASIN||"none"}`));
    setFullASINData(deduped);buildVariationFamilies(deduped);setCompletedSteps(prev=>new Set([...prev,"client-select","asin-select"]));
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
      // For each variety-pack ASIN, build structured item with family data
      const newDetails = vpAsins.map((r:FullASIN) => {
        // Find the family this ASIN belongs to
        const theme = (r.VariationThemeName||"").toLowerCase();
        // Collect sibling values from all children in same family
        const siblings = deduped.filter((s:FullASIN) =>
          s.ParentageLevel==="Child" &&
          (s.ParentASIN===r.ParentASIN || (r.ParentASIN && s.ParentASIN===r.ParentASIN))
        );
        const uniq = (arr:string[]) => [...new Set(arr.filter(Boolean))];
        const familyFlavors = uniq(siblings.map((s:FullASIN)=>s.Flavor||""));
        const familySizes   = uniq(siblings.map((s:FullASIN)=>s.Size||""));
        const familyColors  = uniq(siblings.map((s:FullASIN)=>s.Color||""));
        const familyStyles  = uniq(siblings.map((s:FullASIN)=>s.Style||""));
        return {
          asin: r.ASIN||"",
          itemName: r.ItemName||r.SummarizedTitle||"",
          variationTheme: r.VariationThemeName||"",
          familyFlavors, familySizes, familyColors, familyStyles,
          includedRows: [{flavor:"",size:"",color:"",style:"",units:"1",customLabel:""}],
          extraFlavors:"", extraSizes:"", extraColors:"", extraStyles:"",
          notes:"",
        };
      });
      setVarietyPackDetails(newDetails);
      setCurrentStep("variety-pack");
    } else {
      setCurrentStep("variation-map");
    }
    }catch(e:any){setError(e.message);}finally{setFullDataLoading(false);}
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
        const res=await fetch("/api/extract-doc",{method:"POST",body:formData});
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
    }catch(err:any){
      setError(`File error: ${err.message}`);
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

  const addCompetitor=()=>{
    if(!newCompName.trim())return;
    setCompetitors(p=>[...p,{name:newCompName.trim(),url:newCompURL.trim()}]);
    setNewCompName("");setNewCompURL("");
  };
  const removeCompetitor=(idx:number)=>{setCompetitors(p=>p.filter((_,i)=>i!==idx));};


  return(
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold tracking-tight text-zinc-100 mb-1">Intake & Discovery</h1>
      <p className="text-xs text-zinc-500 mb-4">{selectedClient?`${selectedClient.BrandName} (${selectedClient.ClientIDCode})`:"Select a client to begin"}</p>
      <StepNav
        steps={STEPS.map(s=>({key:s.id,label:`${s.code} ${s.label}`}))}
        currentStep={currentStep}
        onStepClick={(key)=>setCurrentStep(key as Step)}
        completedSteps={completedSteps}
        isApproved={s1Approved}
      />

      {error&&<div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4"><p className="text-sm text-red-400">{error}</p><button onClick={()=>setError(null)} className="text-xs text-red-500 underline mt-1">Dismiss</button></div>}

      {initialLoading?(<div className="py-20 text-center"><p className="text-zinc-500">Loading S1 data…</p></div>):s1Approved?(
      <div className="pb-12">
        {/* ═══ LOCKED S1 SUMMARY ═══ */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-emerald-400 text-lg">✓</span>
            <div><p className="text-emerald-400 font-medium text-sm">S1 Intake — Approved & Locked</p>
            <p className="text-xs text-zinc-500 mt-0.5">{fullASINData.length} ASINs • {variationFamilies.length} variation {variationFamilies.length===1?"family":"families"} • {competitors.length} competitor{competitors.length!==1?"s":""}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <a href={`/projects/${projectId}/keywords`} className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-black hover:bg-amber-400">Continue → S2 Keywords</a>
            <button onClick={()=>{setS1Approved(false);setCurrentStep("client-select");}} className="rounded-lg border border-zinc-600 px-4 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">Unlock for Editing</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4">
            <h3 className="text-xs text-zinc-500 uppercase mb-2">Client</h3>
            <p className="text-sm font-medium">{selectedClient?.BrandName}</p>
            <p className="text-xs text-zinc-400 mt-1">{selectedClient?.ClientIDCode}</p>
          </div>
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4">
            <h3 className="text-xs text-zinc-500 uppercase mb-2">Competitors</h3>
            {competitors.length>0?<div className="text-sm text-zinc-300 space-y-0.5">{competitors.map((c,i)=><p key={i}>{i+1}. {c.name}</p>)}</div>:<p className="text-sm text-zinc-500">None</p>}
          </div>
        </div>

        {/* Variation Tree */}
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4 mb-6">
          <h3 className="text-xs text-zinc-500 uppercase mb-3">Variation Family Map</h3>
          <div className="space-y-3">{variationFamilies.map(f=>(<div key={f.parentASIN}>
            <div className="flex items-center gap-2 text-xs"><span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold">P</span><span className="font-mono text-zinc-400">{f.parentASIN}</span><span className="text-zinc-300 truncate">{f.parentTitle}</span><span className="text-zinc-600 ml-auto">{f.children.length} children</span></div>
            {f.children.map(ch=>(<div key={ch.ASIN} className="ml-8 flex items-center gap-2 mt-1 text-xs"><span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px] font-bold">C</span><span className="font-mono text-zinc-500">{ch.ASIN}</span><span className="text-zinc-400 truncate">{ch.ItemName||"—"}</span>
              <div className="flex gap-1 ml-auto shrink-0">{ch.Color&&<span className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-500">{ch.Color}</span>}{ch.Size&&<span className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-500">{ch.Size}</span>}</div>
            </div>))}
          </div>))}</div>
        </div>

        {/* Baseline Summary */}
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-xs text-zinc-500 uppercase mb-3">Content Baseline</h3>
          <div className="space-y-2">{fullASINData.filter(a=>a.ParentageLevel!=="Parent").map(a=>{const sc=getBaselineScore(a);return(
            <div key={a.ASIN} className="flex items-center gap-3 text-xs py-1.5 border-b border-zinc-800/50 last:border-0">
              <span className="font-mono text-zinc-400 w-28 shrink-0">{a.ASIN}</span>
              <span className="text-zinc-300 flex-1 truncate">{a.ItemName||"—"}</span>
              <div className="flex gap-0.5 shrink-0">{[1,2,3,4,5].map(n=><div key={n} className={`size-2 rounded-full ${n<=sc?sc>=4?"bg-emerald-400":sc>=2?"bg-amber-400":"bg-red-400":"bg-zinc-700"}`}/>)}</div>
              <span className="text-zinc-500 w-8 text-right">{sc}/5</span>
            </div>);})}</div>
        </div>
      </div>
      ):(
      <div className="pb-12">

        {/* ═══ S1.1 — Select Client ═══ */}
        {currentStep==="client-select"&&(
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input type="text" placeholder="Search by brand name…" value={clientSearch} onChange={e=>setClientSearch(e.target.value)} className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"/>
              <button onClick={searchClients} disabled={clientsLoading} className="px-4 py-2.5 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50">{clientsLoading?"Loading…":"Search"}</button>
            </div>
            {clients.length>0&&(
              <div className="border border-zinc-800 rounded-lg overflow-hidden max-h-[70vh] overflow-y-auto"><table className="w-full"><thead className="sticky top-0 z-10"><tr className="bg-zinc-900 text-xs text-zinc-400 uppercase">
                <th className="text-left px-4 py-2">Brand</th><th className="text-left px-4 py-2">Client</th><th className="text-left px-4 py-2">ID Code</th><th className="text-left px-4 py-2">Marketplace</th><th className="text-left px-4 py-2">Tier</th><th className="text-left px-4 py-2">Competitors</th><th className="px-4 py-2"></th>
              </tr></thead><tbody>
                {clients.map((c,i)=>{let cc=0;for(let j=1;j<=5;j++){const v=c[`Competitor${j}Name`];if(v&&typeof v==="string"&&v.trim())cc++;}
                return(<tr key={c.ClientIDCode||i} className="border-t border-zinc-800/50 hover:bg-zinc-900/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-zinc-100">{c.BrandName}</td>
                  <td className="px-4 py-3 text-sm text-zinc-300">{c.ClientName}</td>
                  <td className="px-4 py-3 text-xs font-mono text-zinc-400">{c.ClientIDCode}</td>
                  <td className="px-4 py-3 text-sm text-zinc-300">{c.Marketplace}{c.Country&&` (${c.Country})`}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">{c.Tier||"—"}</span></td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{cc>0?`${cc} found`:"—"}</td>
                  <td className="px-4 py-3 text-right"><button onClick={()=>handleSelectClient(c)} className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded text-xs font-medium hover:bg-amber-500/20">Select</button></td>
                </tr>);})}
              </tbody></table></div>
            )}
            {!clientsLoading&&clients.length===0&&<div className="text-center py-12 text-zinc-500"><p className="text-lg">No clients found</p><p className="text-sm mt-1">Try a different search or check BigQuery connection</p></div>}
          </div>
        )}

        {/* ═══ S1.2 — Select ASINs ═══ */}
        {currentStep==="asin-select"&&(
          <div className="space-y-4">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap"><span className="text-sm text-zinc-400">Client:</span><span className="font-medium">{selectedClient?.BrandName}</span><span className="text-zinc-500">•</span><span className="text-xs font-mono text-zinc-400">{selectedClient?.ClientIDCode}</span>
              {competitors.length>0&&<><span className="text-zinc-500">•</span><span className="text-xs text-emerald-400">{competitors.length} competitor{competitors.length!==1?"s":""}</span></>}</div>
              <button onClick={()=>{setSelectedClient(null);setSelectedASINs(new Set());setCurrentStep("client-select");}} className="text-xs text-zinc-400 hover:text-zinc-200">Change client</button>
            </div>
            {filterOptions&&(
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3"><span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Filters</span><span className="text-xs text-zinc-500">{filterOptions.totalCount} total ASINs</span></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  <FD label="Variation ID" options={filterOptions.variationIDs} filterKey="variationID" activeFilters={activeFilters} setActiveFilters={setActiveFilters} setAsinsPage={setAsinsPage}/>
                  <FD label="Variation Theme" options={filterOptions.variationThemeNames} filterKey="variationThemeName" activeFilters={activeFilters} setActiveFilters={setActiveFilters} setAsinsPage={setAsinsPage}/>
                  <FD label="Category" options={filterOptions.productCategories} filterKey="productCategory" activeFilters={activeFilters} setActiveFilters={setActiveFilters} setAsinsPage={setAsinsPage}/>
                  <FD label="Color" options={filterOptions.colors} filterKey="color" activeFilters={activeFilters} setActiveFilters={setActiveFilters} setAsinsPage={setAsinsPage}/>
                  <FD label="Flavor" options={filterOptions.flavors} filterKey="flavor" activeFilters={activeFilters} setActiveFilters={setActiveFilters} setAsinsPage={setAsinsPage}/>
                  <FD label="Style" options={filterOptions.styles} filterKey="style" activeFilters={activeFilters} setActiveFilters={setActiveFilters} setAsinsPage={setAsinsPage}/>
                  <FD label="Size" options={filterOptions.sizes} filterKey="size" activeFilters={activeFilters} setActiveFilters={setActiveFilters} setAsinsPage={setAsinsPage}/>
                  <div className="flex flex-col gap-1"><label className="text-xs text-zinc-400">Search ASIN/SKU</label>
                  <input type="text" placeholder="Search…" value={asinSearch} onChange={e=>{setAsinSearch(e.target.value);setAsinsPage(0);}} className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"/></div>
                </div>
                {(Object.values(activeFilters).some(Boolean)||asinSearch)&&<button onClick={()=>{setActiveFilters({});setAsinSearch("");setAsinsPage(0);}} className="text-xs text-amber-400 hover:text-amber-300 mt-2">Clear all filters</button>}
              </div>
            )}
            {filtersLoading&&<div className="text-center py-8 text-zinc-500">Loading filter options…</div>}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><button onClick={selectAll} className="text-xs text-amber-400 hover:text-amber-300">Select all on page</button><button onClick={deselectAll} className="text-xs text-zinc-400 hover:text-zinc-300">Deselect all on page</button></div>
              <div className="flex items-center gap-3"><span className="text-sm text-zinc-400"><span className="text-amber-400 font-medium">{selectedASINs.size}</span> selected of {asinsTotalCount}</span>
              <button onClick={proceedToVariationMap} disabled={selectedASINs.size===0||fullDataLoading} className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed">{fullDataLoading?"Loading…":`Continue with ${selectedASINs.size} ASINs →`}</button></div>
            </div>

            {asinsLoading?<div className="text-center py-8 text-zinc-500">Loading ASINs…</div>:(
              <div className="border border-zinc-800 rounded-lg overflow-hidden max-h-[70vh] overflow-y-auto"><div className="overflow-x-auto"><table className="w-full"><thead className="sticky top-0 z-10"><tr className="bg-zinc-900 text-xs text-zinc-400 uppercase">
                <th className="px-3 py-2 w-8"></th><th className="text-left px-3 py-2">ASIN</th><th className="text-left px-3 py-2">SKU</th><th className="text-left px-3 py-2">Item Name</th><th className="text-left px-3 py-2">Level</th><th className="text-left px-3 py-2">Var. ID</th><th className="text-left px-3 py-2">Theme</th><th className="text-left px-3 py-2">Color</th><th className="text-left px-3 py-2">Flavor</th><th className="text-left px-3 py-2">Style</th><th className="text-left px-3 py-2">Size</th>
              </tr></thead><tbody>
                {asins.map((row,i)=>{const k=rowKey(row);const sel=selectedASINs.has(k);
                return(<tr key={`${k}-${i}`} className={`border-t border-zinc-800/50 transition-colors cursor-pointer ${sel?"bg-amber-500/5":"hover:bg-zinc-900/30"}`} onClick={()=>toggleASIN(k)}>
                  <td className="px-3 py-2.5 text-center"><input type="checkbox" checked={sel} onChange={()=>toggleASIN(k)} className="accent-amber-500"/></td>
                  <td className="px-3 py-2.5 text-xs font-mono text-zinc-300">{row.ASIN||"—"}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-zinc-400">{row.SKU||"—"}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-200 max-w-[200px] whitespace-normal leading-tight">{row.ItemName||"—"}</td>
                  <td className="px-3 py-2.5"><span className={`text-xs px-2 py-0.5 rounded ${row.ParentageLevel==="Parent"?"bg-blue-500/10 text-blue-400":row.ParentageLevel==="Child"?"bg-purple-500/10 text-purple-400":"bg-zinc-800 text-zinc-400"}`}>{row.ParentageLevel||"—"}</span></td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">{row.VariationID||"—"}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">{row.VariationThemeName||"—"}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-300">{row.Color||"—"}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-300">{row.Flavor||"—"}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-300">{row.Style||"—"}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-300">{row.Size||"—"}</td>
                </tr>);})}
              </tbody></table></div>
              {(()=>{const m=new Map<string,number>();asins.forEach(r=>{if(r.ASIN)m.set(r.ASIN,(m.get(r.ASIN)||0)+1);});const d=Array.from(m.entries()).filter(([,c])=>c>1);if(d.length===0)return null;return(<div className="px-4 py-2 bg-amber-500/5 border-t border-amber-500/20"><p className="text-xs text-amber-400">⚠ Duplicate ASINs: {d.map(([a,c])=>`${a} (${c}×)`).join(", ")}. Handled automatically.</p></div>);})()}
              {asinsTotalCount>50&&(<div className="flex items-center justify-between px-4 py-3 bg-zinc-900/30 border-t border-zinc-800">
                <span className="text-xs text-zinc-500">Page {asinsPage+1} of {Math.ceil(asinsTotalCount/50)}</span>
                <div className="flex gap-2"><button onClick={()=>setAsinsPage(p=>Math.max(0,p-1))} disabled={asinsPage===0} className="px-3 py-1 text-xs bg-zinc-800 rounded hover:bg-zinc-700 disabled:opacity-30">Previous</button>
                <button onClick={()=>setAsinsPage(p=>p<Math.ceil(asinsTotalCount/50)-1?p+1:p)} disabled={asinsPage>=Math.ceil(asinsTotalCount/50)-1} className="px-3 py-1 text-xs bg-zinc-800 rounded hover:bg-zinc-700 disabled:opacity-30">Next</button></div>
              </div>)}
              </div>
            )}
          </div>
        )}

        {/* ═══ S1.2b — Variety Pack Confirmation ═══ */}
        {currentStep==="variety-pack"&&(
          <VarietyPackSection
            varietyPackDetails={varietyPackDetails}
            setVarietyPackDetails={setVarietyPackDetails}
            setIsVarietyPack={setIsVarietyPack}
            setCompletedSteps={setCompletedSteps}
            setCurrentStep={setCurrentStep}
          />
        )}

        {/* ═══ S1.3 — Variation Family Map ═══ */}
        {currentStep==="variation-map"&&(
          <div className="space-y-4">
            <div className="flex items-center justify-between"><h2 className="text-lg font-medium">S1.3 — Variation Family Map</h2><span className="text-sm text-zinc-400">{variationFamilies.length} families • {fullASINData.length} ASINs</span></div>
            {variationFamilies.map(f=>(
              <div key={f.parentASIN} className="border border-zinc-800 rounded-lg overflow-hidden">
                <div className="bg-zinc-900/50 px-4 py-3 flex items-center gap-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">Parent</span>
                  <span className="font-mono text-xs text-zinc-400">{f.parentASIN}</span>
                  <span className="text-xs text-zinc-200 flex-1 whitespace-normal">{f.parentTitle}</span>
                  <span className="text-xs text-zinc-500 whitespace-nowrap">Theme: {cleanThemeLabel(f.variationTheme)||"—"}</span>
                  <span className="text-xs text-zinc-500 whitespace-nowrap">{f.children.length} children</span>
                </div>
                {f.children.length>0&&<div className="divide-y divide-zinc-800/50">{f.children.map(ch=>(
                  <div key={ch.ASIN} className="px-4 py-2.5 pl-10 flex items-center gap-3 text-sm">
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-400">Child</span>
                    <span className="font-mono text-xs text-zinc-400 w-28 shrink-0">{ch.ASIN}</span>
                    <span className="font-mono text-xs text-zinc-500 w-24 shrink-0">{ch.SKU}</span>
                    <span className="text-xs text-zinc-300 flex-1 whitespace-normal">{ch.ItemName||"—"}</span>
                    <div className="flex flex-wrap gap-1.5 text-xs text-zinc-400 shrink-0 max-w-[280px]">
                      {ch.Color&&<span className="px-1.5 py-0.5 bg-zinc-800 rounded">{ch.Color}</span>}
                      {ch.Flavor&&<span className="px-1.5 py-0.5 bg-zinc-800 rounded">{ch.Flavor}</span>}
                      {ch.Style&&<span className="px-1.5 py-0.5 bg-zinc-800 rounded">{ch.Style}</span>}
                      {ch.Size&&<span className="px-1.5 py-0.5 bg-zinc-800 rounded">{ch.Size}</span>}
                      {(()=>{const vp=varietyPackDetails.find(v=>v.asin===ch.ASIN);return vp?(
                        <div className="w-full mt-1 rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-400 space-y-0.5">
                          <div className="font-bold text-amber-300">Variety Pack — {vp.includedRows.length} item{vp.includedRows.length!==1?"s":""}</div>
                          {vp.includedRows.map((row,ri)=>(
                            <div key={ri} className="flex flex-wrap gap-x-2 text-amber-400/80">
                              {row.flavor&&<span>· {row.flavor}</span>}
                              {row.size&&<span>· {row.size}</span>}
                              {row.color&&<span>· {row.color}</span>}
                              {row.style&&<span>· {row.style}</span>}
                              {row.units&&row.units!=="1"&&<span className="text-amber-400/60">×{row.units}</span>}
                              {row.customLabel&&<span className="italic text-amber-400/50">{row.customLabel}</span>}
                            </div>
                          ))}
                          {(vp.extraFlavors||vp.extraSizes||vp.extraColors||vp.extraStyles)&&(
                            <div className="text-amber-400/50 italic">
                              Extra: {[vp.extraFlavors,vp.extraSizes,vp.extraColors,vp.extraStyles].filter(Boolean).join(", ")}
                            </div>
                          )}
                          {vp.notes&&<div className="italic text-amber-400/50">{vp.notes}</div>}
                        </div>
                      ):null;})()}
                    </div>
                  </div>
                ))}</div>}
              </div>
            ))}
            <div className="flex justify-end"><button onClick={()=>{setCompletedSteps(prev=>new Set([...prev,"client-select","asin-select","variation-map"]));setCurrentStep("baseline");}} className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400">Continue to S1.4 Baseline Analysis →</button></div>
          </div>
        )}

        {/* ═══ S1.4 — Baseline Analysis ═══ */}
        {currentStep==="baseline"&&(
          <div className="space-y-4">
            <h2 className="text-lg font-medium">S1.4 — Existing Content Baseline</h2>
            <p className="text-sm text-zinc-400">Quality assessment of current listing content. Reference only — never copy verbatim.</p>
            {fullASINData.filter(a=>a.ParentageLevel!=="Parent").map(asin=>{const sc=getBaselineScore(asin);
            const titleLen=asin.ItemName?.length||0;
            const descLen=asin.ProductDescription?.length||0;
            const bulletLens=[1,2,3,4,5].map(n=>(asin as any)[`DetailedBulletPoint${n}`]?.length||0);
            const kwCount=[1,2,3,4,5].filter(n=>(asin as any)[`GenericKeyword${n}`]).length;
            return(
              <div key={asin.ASIN} className="border border-zinc-800 rounded-lg overflow-hidden">
                <div className="bg-zinc-900/50 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3"><span className="font-mono text-xs text-zinc-400">{asin.ASIN}</span><span className="text-xs text-zinc-200 whitespace-normal">{asin.ItemName||"—"}</span></div>
                  <div className="flex items-center gap-2 shrink-0"><span className="text-xs text-zinc-500">Quality:</span><div className="flex gap-0.5">{[1,2,3,4,5].map(n=><div key={n} className={`size-2 rounded-full ${n<=sc?sc>=4?"bg-emerald-400":sc>=2?"bg-amber-400":"bg-red-400":"bg-zinc-700"}`}/>)}</div><span className="text-xs text-zinc-400">{sc}/5</span></div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-baseline gap-2"><span className="text-[10px] text-zinc-500 uppercase font-bold w-20 shrink-0">Title</span><span className="text-xs text-zinc-500">{titleLen} chars</span></div>
                  <p className="text-xs text-zinc-300 ml-20">{asin.ItemName||<span className="text-red-400 italic">Missing</span>}</p>

                  <div className="flex items-baseline gap-2 mt-3"><span className="text-[10px] text-zinc-500 uppercase font-bold w-20 shrink-0">Bullets</span><span className="text-xs text-zinc-500">{bulletLens.filter(l=>l>0).length}/5 filled</span></div>
                  <div className="ml-20 space-y-1">{[1,2,3,4,5].map(n=>{const v=(asin as any)[`DetailedBulletPoint${n}`];return(<div key={n} className="flex gap-2 items-start"><span className="text-[10px] text-zinc-600 w-3 shrink-0">{n}.</span><span className="text-xs text-zinc-300">{v||<span className="text-zinc-600 italic">Empty</span>}</span>{v&&<span className="text-[10px] text-zinc-600 shrink-0">{v.length}c</span>}</div>);})}</div>

                  <div className="flex items-baseline gap-2 mt-3"><span className="text-[10px] text-zinc-500 uppercase font-bold w-20 shrink-0">Description</span><span className="text-xs text-zinc-500">{descLen} chars</span></div>
                  <p className="text-xs text-zinc-300 ml-20 line-clamp-3">{asin.ProductDescription||<span className="text-red-400 italic">Missing</span>}</p>

                  <div className="flex items-baseline gap-2 mt-3"><span className="text-[10px] text-zinc-500 uppercase font-bold w-20 shrink-0">Keywords</span><span className="text-xs text-zinc-500">{kwCount}/5 filled</span></div>
                  <div className="ml-20 flex flex-wrap gap-1">{[1,2,3,4,5].map(n=>{const v=(asin as any)[`GenericKeyword${n}`];return v?<span key={n} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{v}</span>:null;})}</div>
                </div>
              </div>
            );})}
            <div className="flex justify-end"><button onClick={()=>{setCompletedSteps(prev=>new Set([...prev,"client-select","asin-select","variation-map","baseline"]));setCurrentStep("competitors");}} className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400">Continue to S1.5 Competitors →</button></div>
          </div>
        )}

        {/* ═══ S1.5 — Competitors ═══ */}
        {currentStep==="competitors"&&(
          <div className="space-y-4">
            <h2 className="text-lg font-medium">S1.5 — Competitor Intelligence</h2>
            <p className="text-sm text-zinc-400">Competitors from client record + manually added. Used for S2 Cerebro, S4 Rufus, S5 COSMO. Never named in customer-facing content.</p>
            {competitors.length>0&&(
              <div className="border border-zinc-800 rounded-lg overflow-hidden"><table className="w-full"><thead><tr className="bg-zinc-900/50 text-xs text-zinc-400 uppercase"><th className="text-left px-4 py-2">#</th><th className="text-left px-4 py-2">Name</th><th className="text-left px-4 py-2">URL</th><th className="px-4 py-2 w-16"></th></tr></thead>
              <tbody>{competitors.map((c,i)=>(<tr key={i} className="border-t border-zinc-800/50"><td className="px-4 py-3 text-sm text-zinc-500">{i+1}</td><td className="px-4 py-3 text-sm text-zinc-200">{c.name}</td><td className="px-4 py-3 text-xs text-zinc-400 font-mono truncate max-w-md">{c.url||"—"}</td>
              <td className="px-4 py-3 text-right"><button onClick={()=>removeCompetitor(i)} className="text-xs text-red-400 hover:text-red-300">Remove</button></td></tr>))}</tbody></table></div>
            )}
            {competitors.length===0&&<div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-6 text-center"><p className="text-zinc-500">No competitors yet</p></div>}
            {/* Add competitor form */}
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4">
              <p className="text-xs text-zinc-400 mb-3">Add Competitor</p>
              <div className="flex items-end gap-3">
                <div className="flex-1"><label className="text-[10px] text-zinc-500 mb-1 block">Name *</label><input value={newCompName} onChange={e=>setNewCompName(e.target.value)} placeholder="Competitor brand name" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"/></div>
                <div className="flex-1"><label className="text-[10px] text-zinc-500 mb-1 block">URL (optional)</label><input value={newCompURL} onChange={e=>setNewCompURL(e.target.value)} placeholder="https://amazon.com/dp/..." className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"/></div>
                <button onClick={addCompetitor} disabled={!newCompName.trim()} className="px-4 py-1.5 bg-zinc-700 text-zinc-200 rounded text-sm hover:bg-zinc-600 disabled:opacity-30">+ Add</button>
              </div>
            </div>
            <div className="flex justify-end"><button onClick={()=>{setCompletedSteps(prev=>new Set([...prev,"client-select","asin-select","variation-map","baseline","competitors"]));setCurrentStep("guidelines");}} className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400">Continue to S1.6 Brand Guidelines →</button></div>
          </div>
        )}

        {/* ═══ S1.6 — Brand Guidelines ═══ */}
        {currentStep==="guidelines"&&(
          <div className="space-y-4">
            <h2 className="text-lg font-medium">S1.6 — Brand Guidelines</h2>
            <p className="text-sm text-zinc-400">Share brand voice, language preferences, words to avoid, audience notes, positioning. Upload a document and/or paste text below.</p>
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" onChange={handleGuidelinesFileUpload} className="hidden" multiple={false}/>
                <button onClick={()=>{setError(null);fileInputRef.current?.click();}} disabled={guidelinesFileLoading} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                  {guidelinesFileLoading?(
                    <><span className="inline-block size-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent"/>Extracting…</>
                  ):(
                    <><svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>Upload & Extract</>
                  )}
                </button>
                <span className="text-xs text-zinc-500">PDF • DOCX • DOC • TXT • MD — text extracted automatically</span>
              </div>
              {guidelinesFiles.length>0&&(
                <div className="flex flex-wrap gap-2">
                  {guidelinesFiles.map((f,i)=>(
                    <span key={i} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded ${f.extracted?"bg-emerald-500/10 text-emerald-400 border border-emerald-500/20":"bg-red-500/10 text-red-400 border border-red-500/20"}`}>
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
            <textarea value={guidelines} onChange={e=>setGuidelines(e.target.value)} placeholder="Paste or type brand guidelines, voice notes, words to include/avoid, audience notes…" rows={14} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none resize-y"/>
            {guidelines&&<p className="text-xs text-zinc-500">{guidelines.length} characters</p>}
            <div className="flex gap-3"><button onClick={()=>{if(guidelines.trim())setGuidelinesLock("locked");else setGuidelinesLock("not_applicable");setCompletedSteps(prev=>new Set([...prev,"client-select","asin-select","variation-map","baseline","competitors","guidelines"]));setCurrentStep("confirm");}} className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400">{guidelines.trim()?"Lock Guidelines & Continue →":"No Additions — Skip →"}</button></div>
          </div>
        )}

        {/* ═══ S1.7 — Confirm & Approve ═══ */}
        {currentStep==="confirm"&&(
          <div className="space-y-6">
            <h2 className="text-lg font-medium">S1.7 — Confirm & Approve</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4"><h3 className="text-xs text-zinc-500 uppercase mb-2">Client</h3><p className="text-sm font-medium">{selectedClient?.BrandName}</p><p className="text-xs text-zinc-400 mt-1">{selectedClient?.ClientIDCode} • {selectedClient?.Marketplace}</p></div>
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4"><h3 className="text-xs text-zinc-500 uppercase mb-2">ASINs</h3><p className="text-sm font-medium">{fullASINData.length} ASINs selected</p><p className="text-xs text-zinc-400 mt-1">{variationFamilies.length} variation {variationFamilies.length===1?"family":"families"}</p><p className="text-xs text-zinc-400">{fullASINData.filter(a=>a.Size).length>0?"Size variation detected — placement lock required in S7":"No size variation"}</p>
                <div className="mt-3 space-y-2">{variationFamilies.map(f=>(<div key={f.parentASIN} className="text-xs">
                  <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px]">P</span><span className="font-mono text-zinc-400">{f.parentASIN}</span><span className="text-zinc-500 truncate">{f.parentTitle}</span></div>
                  {f.children.map(ch=>(<div key={ch.ASIN} className="ml-6 flex items-center gap-2 mt-0.5"><span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px]">C</span><span className="font-mono text-zinc-500">{ch.ASIN}</span>{ch.Size&&<span className="text-zinc-600">{ch.Size}</span>}{ch.Color&&<span className="text-zinc-600">{ch.Color}</span>}</div>))}
                </div>))}</div>
              </div>
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4"><h3 className="text-xs text-zinc-500 uppercase mb-2">Competitors</h3>{competitors.length>0?<ul className="text-sm text-zinc-300 space-y-0.5">{competitors.map((c,i)=><li key={i}>{i+1}. {c.name}</li>)}</ul>:<p className="text-sm text-zinc-500">None</p>}</div>
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4"><h3 className="text-xs text-zinc-500 uppercase mb-2">Brand Guidelines</h3>
                {guidelines&&guidelines.trim()?(
                  <div>
                    <p className="text-sm text-emerald-400 mb-2">✓ {guidelinesLock==="locked"?"Locked":"Provided"} ({guidelines.length.toLocaleString()} chars){guidelinesFiles.length>0&&` • ${guidelinesFiles.filter(f=>f.extracted).length} file(s)`}</p>
                    <p className="text-xs text-zinc-400 whitespace-pre-wrap line-clamp-4 leading-relaxed">{guidelines.slice(0,500)}{guidelines.length>500?"…":""}</p>
                  </div>
                ):(
                  <p className="text-sm text-zinc-500">No brand guidelines provided</p>
                )}
              </div>
            </div>
            {!s1Approved?(
              <div className="bg-zinc-900/30 border border-amber-500/20 rounded-lg p-6 text-center">
                <p className="text-sm text-zinc-300 mb-4">Review the intake data above. Once approved, S1 is locked and S2 Keywords will be unlocked.</p>
                <button onClick={saveAndApproveS1} disabled={s1Saving} className="px-6 py-3 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50">{s1Saving?"Saving…":"✓ APPROVE S1 — Proceed to S2 Keywords"}</button>
              </div>
            ):(
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-6 text-center">
                <p className="text-emerald-400 font-medium mb-4">✓ S1 Approved — S2 Keywords is now unlocked</p>
                <div className="flex items-center justify-center gap-3">
                  <a href={`/projects/${projectId}/keywords`} className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-black hover:bg-amber-400">Continue → S2 Keywords</a>
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
