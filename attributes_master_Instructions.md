# Atributos Master — Guía de Referencia

> **REGLA DE ORO:** No modificar estilos, estructura visual ni aspectos de UI sin confirmación expresa del usuario. Ante cualquier duda, preguntar antes de actuar.

---

## 1. Contexto del Proyecto

- **Proyecto:** 1o8Hub
- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **Objetivo:** Migrar todos los campos del formulario de producto PDP para que carguen dinámicamente desde la tabla `attributes_master` en la base de datos (Supabase), en lugar de tener campos hardcodeados.

## 2. Conceptos Clave

### 2.1 Jerarquía de datos

El sistema sigue una jerarquía de **3 niveles**:

```
Card (ej: "Product Details")
  └── Subcard (ej: "Beauty", "Use", "Language")
        └── Atributo (ej: "Hair Conditioner Type")
```

- Cada atributo tiene: `hubLabel`, `bqName` (campo BQ), `requirement` (R/C/P/O), `description` (tooltip)
- Los subcards agrupan atributos visualmente como Collapsibles anidados
- Los cards agrupan subcards como el elemento principal expandable

### 2.2 Tabla `attributes_master` (Supabase)

Columnas principales:

| Columna | Uso |
|---|---|
| `Attributes_PDPCardName` | Nombre del card padre (ej: "Product Details") |
| `Attributes_PDPSubcardName` | Nombre del subcard (ej: "Beauty"). Puede ser "-" |
| `Attributes_HubLabel` | Label visible del atributo |
| `Attributes_Requirement` | "Required" / "Conditionally Required" / "Recommended" / "Optional" |
| `Attributes_Description` | Texto para el tooltip (HelpCircle) |
| `BQ_Master` | Nombre del campo en BigQuery (mapea al producto) |

### 2.3 Hook: `useAttributesMasterCards`

Located at: `src/hooks/use-attributes-master.ts`

```typescript
const { cards, isLoading } = useAttributesMasterCards();
```

- `cards`: array de `PDPCard` (cada uno con `name` y `subcards: PDPSubcard[]`)
- `isLoading`: booleano, mostrar "Loading X attributes..." mientras es true

Uso típico en una sección:

```typescript
const { cards, isLoading } = useAttributesMasterCards();

const myAttributes = useMemo(() => {
  if (!cards) return [];
  const card = cards.find(c => c.name === "My Card Name");
  if (!card) return [];
  return card.subcards.flatMap(sub =>
    sub.attributes.map(attr => ({
      hubLabel: attr.Attributes_HubLabel,
      bqName: attr.BQ_Master || attr.Attributes_HubLabel.replace(/ /g, ""),
      requirement: attr.Attributes_Requirement,
      description: attr.Attributes_Description,
      subcardOrder: attr.Attributes_PDPSubcardOrder ?? 0,
      subcardName: sub.name,
    }))
  ).sort((a, b) => a.subcardOrder - b.subcardOrder);
}, [cards]);
```

---

## 3. Patrones de Implementación

### 3.1 Patrón ANTIGUO (campos hardcodeados)

```typescript
// NO USAR. Solo para referencia.
type Props = {
  amazonMetaByField: Record<string, AmazonFieldMeta>; // prop antigua
  // ...
};

const MY_FIELDS = [
  { bqName: "FieldName", label: "Field Label" },
];

// Contadores desde amazonMetaByField
const reqR = MY_FIELDS.filter((f) => amazonMetaByField[f.bqName]?.requirement === "Required").length;
```

### 3.2 Patrón NUEVO (dinámico desde DB)

```typescript
// SÍ USAR para todas las secciones nuevas
import { useAttributesMasterCards } from "@/hooks/use-attributes-master";

type Props = {
  product: Product;
  readOnly: boolean;
  onSave: (bqName: string, value: string | null) => Promise<void>;
  onFieldSaved?: (bqName: string, label: string, oldValue: string, newValue: string) => void;
};
```

**Props que cambiarON al migrar:**

| Antes | Ahora |
|---|---|
| `amazonMetaByField: Record<string, AmazonFieldMeta>` | Eliminar |
| `onSave: (field, value) => Promise<void>` | `onSave: (bqName, value) => Promise<void>` |
| `onFieldSaved?: (field, value) => void` | `onFieldSaved?: (bqName, label, oldValue, newValue) => void` |

---

## 4. Estilo Visual — Especificación Completa

### 4.1 Colores del tema (CSS Custom Properties)

Usar estas variables de CSS en lugar de hardcodear colores:

```css
--border          /* Borde de cards y campos */
--bg-card         /* Fondo del card principal */
--text-section-title  /* Título de sección */
--text-muted-foreground  /* Labels de campo */
--field-bg        /* Fondo del input */
--field-text      /* Texto del input */
--brand           /* Color para focus ring */
--muted           /* Hover backgrounds */
```

### 4.2 Chips de Requisito (R / C / P / O)

Cada atributo muestra un chip según su `Attributes_Requirement`:

| Requirement | Background | Text | Label |
|---|---|---|---|
| Required | `bg-red-900/60` | `text-red-200` | `R` |
| Conditionally Required | `bg-amber-900/60` | `text-amber-200` | `C` |
| Recommended | `bg-blue-900/60` | `text-blue-200` | `P` |
| Optional | `bg-zinc-700/60` | `text-zinc-300` | `O` |

```typescript
const REQ_CHIP_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Required: { bg: "bg-red-900/60", text: "text-red-200", label: "R" },
  "Conditionally Required": { bg: "bg-amber-900/60", text: "text-amber-200", label: "C" },
  Recommended: { bg: "bg-blue-900/60", text: "text-blue-200", label: "P" },
  Optional: { bg: "bg-zinc-700/60", text: "text-zinc-300", label: "O" },
};
```

**Estructura HTML del chip:**

```tsx
<span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${reqStyle.bg} ${reqStyle.text}`}>
  {reqStyle.label}
</span>
```

**NUNCA usar los colores claros (ej: `bg-red-500/15`) — usar siempre los oscuros (`bg-red-900/60`).**

### 4.3 Card Principal (Collapsible de nivel 1)

```tsx
<div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden">
  <Collapsible defaultOpen={false}>
    <CollapsibleTrigger className="group flex items-center justify-between gap-3 w-full px-4 py-2.5 text-left hover:bg-muted/50 transition-colors">
      {/* Header interior */}
    </CollapsibleTrigger>
    <CollapsibleContent>
      {/* Contenido */}
    </CollapsibleContent>
  </Collapsible>
</div>
```

### 4.4 Header del Card Principal

**Estructura del header (CollapsibleTrigger):**

```
[ChevronRight (rotates 90° on open)] [Título] ............ [Chips R/C/P/O] [Badge X/Y]
```

- `ChevronRight`: `h-4 w-4 text-muted-foreground shrink-0`
- Rotación: `group-data-[state=open]:rotate-90` (CSS, transition)
- Título: `text-sm font-medium text-section-title`
- Chips R/C/P/O: solo se muestran si hay atributos de ese tipo (ordenados: R, C, P, O)
- Badge: `<Badge variant="secondary" className="text-xs tabular-nums">{count}/{total}</Badge>`

### 4.5 Subcard (Collapsible de nivel 2)

Cada subcard es un card interno con borde `border-stone-200` (light) / `border-zinc-800` (dark):

```tsx
<div className="rounded-lg border border-stone-200 bg-card hover:border-stone-300 hover:shadow-md transition-all dark:border-zinc-800 overflow-hidden">
  <Collapsible defaultOpen={false}>
    <CollapsibleTrigger className="group flex items-center justify-between gap-3 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors">
      {/* Header */}
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div className="border-t border-stone-200 px-3 py-2 dark:border-zinc-800">
        {/* Campos */}
      </div>
    </CollapsibleContent>
  </Collapsible>
</div>
```

**Header del subcard:**

```
[ChevronRight] [Nombre del subcard] ................... [Badge X/Y]
```

- Título: `text-[13px] font-semibold text-section-title`
- Chevron: `h-3.5 w-3.5`
- Badge: `text-[10px]` con `mr-1`

### 4.6 Campo (FieldRow)

**Estructura de cada fila de atributo:**

```
[Label] [Chip R/C/P/O] [HelpCircle] ... [Input/Select/SaveIcon]
```

```tsx
<div className="flex items-center gap-3 min-w-0">
  <span className="text-xs text-muted-foreground whitespace-normal leading-tight shrink-0">{label}</span>

  {/* Chip de requisito */}
  {reqStyle && (
    <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${reqStyle.bg} ${reqStyle.text}`}>
      {reqStyle.label}
    </span>
  )}

  {/* HelpCircle con tooltip */}
  {showHelpCircle && (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-[10px] font-sans">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )}

  {/* Valor / Input */}
  {readOnly ? (
    <span className="text-xs text-foreground/80 font-mono tabular-nums">{value || "—"}</span>
  ) : (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        className="h-6 px-2 text-xs rounded border border-border bg-field-bg text-field-text focus:outline-none focus:ring-1 focus:ring-brand flex-1 font-mono tabular-nums"
      />
      {/* Icono de estado: Loader2 (saving) | Check (saved) | X (error) */}
      {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
      {saveState === "saved" && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
      {saveState === "error" && <X className="h-3 w-3 text-destructive shrink-0" />}
    </div>
  )}
</div>
```

**Input/Input de texto:**
- `h-6 px-2 text-xs`
- `rounded border border-border`
- `bg-field-bg text-field-text`
- `focus:outline-none focus:ring-1 focus:ring-brand`
- `flex-1 font-mono tabular-nums`

**Valores en modo solo lectura:**
- `text-xs text-foreground/80 font-mono tabular-nums`
- Si no hay valor: mostrar "—"

**Save state icons:**
- Saving: `<Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />`
- Saved: `<Check className="h-3 w-3 text-emerald-500 shrink-0" />`
- Error: `<X className="h-3 w-3 text-destructive shrink-0" />`

### 4.7 Iconos

| Icono | Uso | Tamaño |
|---|---|---|
| `ChevronRight` | Collapsibles (card y subcard) | `h-4 w-4` (card) / `h-3.5 w-3.5` (subcard) |
| `HelpCircle` | Tooltip del atributo | `h-3 w-3` |
| `Loader2` | Estado guardando (spinner) | `h-3 w-3` + `animate-spin` |
| `Check` | Estado guardado correctamente | `h-3 w-3` |
| `X` | Estado de error | `h-3 w-3` |

### 4.8 Tooltip

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs">
      <p className="text-[10px] font-sans">{description}</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**Solo mostrar el HelpCircle** cuando `description !== null` (no cuando es vacío).

### 4.9 Estados de hover

- **Card principal (CollapsibleTrigger):** `hover:bg-muted/50 transition-colors`
- **Subcard (CollapsibleTrigger):** `hover:bg-muted/30 transition-colors`
- **Subcard container:** `hover:border-stone-300 hover:shadow-md transition-all`

### 4.10 Tipografías

| Elemento | Estilo |
|---|---|
| Título del card | `text-sm font-medium text-section-title` |
| Título del subcard | `text-[13px] font-semibold text-section-title` |
| Label del campo | `text-xs text-muted-foreground whitespace-normal leading-tight shrink-0` |
| Valor en readonly | `text-xs text-foreground/80 font-mono tabular-nums` |
| Texto en tooltip | `text-[10px] font-sans` |
| Chips | `text-[9px] font-medium` |
| Badge | `text-xs tabular-nums` |

### 4.11 Spacing y tamaños

- Card principal padding: `px-4 py-2.5`
- Subcard padding: `px-3 py-2`
- Espaciado entre campos: `space-y-1.5`
- Espaciado entre subcards: `space-y-2`
- Gap entre elementos del field row: `gap-3`
- Gap entre campos input e icono: `gap-1`

---

## 5. Reglas de Lógica de Subcards

### 5.1 Regla principal

Solo crear un Collapsible wrapper para un subcard si:

```
subcardName !== cardName  AND  subcardName !== "-"
```

En caso contrario, los atributos van directamente al card principal (sin wrapper de subcard).

### 5.2 Ejemplos

| Card | Subcard | Resultado |
|---|---|---|
| "Materials" | "Material" | Atributos directos al card (sin wrapper — mismo nombre) |
| "Manufacturing" | "-" | Atributos directos al card |
| "Product Details" | "Beauty" | Subcard Collapsible "Beauty" |
| "Compliance" | "Age Restriction" | Subcard Collapsible "Age Restriction" |

### 5.3 Agrupación de subcards

```typescript
const subcardsGrouped = useMemo(() => {
  const grouped = new Map<string, typeof allAttributes>();
  for (const attr of allAttributes) {
    if (attr.subcardName === "-" || attr.subcardName === cardName) continue;
    if (!grouped.has(attr.subcardName)) grouped.set(attr.subcardName, []);
    grouped.get(attr.subcardName)!.push(attr);
  }
  return grouped;
}, [allAttributes]);

const mainAttributes = useMemo(() =>
  allAttributes.filter(a => a.subcardName === "-" || a.subcardName === cardName),
  [allAttributes]
);
```

### 5.4 Casos especiales de secciones

#### Product Identity

Esta sección mezcla campos normales con campos especiales:

- `ProductIdType` → Usa select con opciones fijas (ASIN, UPC, EAN, etc.)
- `Title` → Campo especial del SEO, no es editável aquí
- `ItemHighlight` → 5 campos, todos en subcard "Use"
- `TargetAudience` → 5 campos + 5 keywords, en subcard "Target Audience"

**Regla:** Parsear `Attributes_ValidValues` del JSON para convertir campos select dinámicamente. Si el campo tiene `Attributes_ValidValues` con formato `{"ALL": "valor1, valor2"}`, convertir a select si tiene ≤50 opciones.

#### Variation

Esta sección mezcla 3 tipos de campos:

1. **Campos computados** (solo lectura, fuente VB): `VariationID`, `ParentageLevel`, `ParentSKU`, `ParentASIN`, `VariationThemeName`
2. **Campo sourced** (solo lectura, de variations table): `VariationName`
3. **Campo inferido** (auto-computado): `ChildRelationshipType` → muestra "variation" si el producto tiene variación
4. **Campos editables** (theme attributes): `Color`, `Flavor`, `Size`, `Style` → editables solo si coinciden con el theme

**Importante:** Los campos `Color`, `Flavor`, `Size`, `Style` se ocultan si no coinciden con el `VariationThemeName` del producto.

#### Variety Pack

**NO usar `useAttributesMasterCards`** — esta sección tiene su propia lógica de negocio (VarietyPackCard, VarietyPackBadge) con estado, mutate, y datos de API (`/api/products/[id]/variety-pack`). Solo contiene campos propios: `IsVarietyPack`, `VarietyPackUnits`, `VarietyPackVariationAttribute1/2/3` — estos NO se muestran como fields editables porque el componente ya tiene su propia UI de builder.

Si necesitas añadir contadores R/C/P/O al header, puedes usar `useAttributesMasterCards` para obtener los requirements pero **NO** para renderizar fields — el componente ya tiene su propia UI completa.

---

## 6. Uso de useMemo para contadores

### 6.1 Conteo de atributos populateados

```typescript
const populatedCount = useMemo(() => {
  return attributes.filter((attr) => {
    const val = getProductFieldValue(product, attr.bqName);
    return val != null && val !== "";
  }).length;
}, [attributes, product]);
```

### 6.2 Conteo de requisitos

```typescript
const requirementCounts = useMemo(() => {
  const counts = { required: 0, conditionallyRequired: 0, recommended: 0, optional: 0 };
  for (const attr of attributes) {
    if (attr.requirement === "Required") counts.required++;
    else if (attr.requirement === "Conditionally Required") counts.conditionallyRequired++;
    else if (attr.requirement === "Recommended") counts.recommended++;
    else if (attr.requirement === "Optional") counts.optional++;
  }
  return counts;
}, [attributes]);
```

---

## 7. Cómo migrar una sección

### Paso 1: Leer el archivo actual

Localizar el archivo en `src/components/products/{name}-section.tsx`.

### Paso 2: Escribir el nuevo archivo

1. Copiar la estructura base (imports, tipos, REQ_CHIP_STYLES)
2. Cambiar `Props` al patrón nuevo (eliminar `amazonMetaByField`, cambiar `onSave`)
3. Añadir `useAttributesMasterCards` hook
4. Crear `useMemo` para extraer y agrupar atributos
5. Implementar el render con la estructura visual correcta
6. Añadir estado de loading (`isLoading` → mostrar mensaje)
7. Implementar `FieldRow` con debounce, save state icons, requirement chip, HelpCircle

### Paso 3: Actualizar product-detail-form.tsx

1. Eliminar la prop `amazonMetaByField` de la llamada al componente
2. Mantener `product`, `readOnly`, `onSave`, `onFieldSaved`

### Paso 4: Verificar

1. `npm run build` o `npx tsc --noEmit` para errores de TypeScript
2. Abrir la sección en el formulario para verificar que carga datos
3. Verificar que los contadores R/C/P/O son correctos
4. Verificar que los tooltips muestran la descripción correcta
5. Verificar que el save funciona (Spinner → Check/X)

---

## 8. Estado de las Secciones

| Sección | Archivo | Card en DB | Subcards | Estado |
|---|---|---|---|---|
| SEO | `seo-section.tsx` | Sí | No | ✅ Migrada |
| Images | `images-section.tsx` | Sí | No | ✅ Migrada |
| Listing Identity | `listing-identity-section.tsx` | Sí | No | ✅ Migrada |
| Offer | `offer-section.tsx` | Sí | 1 (B2B) | ✅ Migrada |
| Dimensions & Shipping | `dimensions-section.tsx` | Sí | Sí | ✅ Migrada |
| Compliance | `compliance-section.tsx` | Sí | 4 | ✅ Migrada |
| Ingredients & Nutrition | `ingredients-nutrition-section.tsx` | Sí | 9 | ✅ Migrada |
| Apparel & Style | `apparel-style-section.tsx` | Sí | 24 | ✅ Migrada |
| Materials | `materials-section.tsx` | Sí | 1 (mismo nombre → directo) | ✅ Migrada |
| Food Attributes | `food-attributes-section.tsx` | Sí | 5 | ✅ Migrada |
| Technical Specs | `technical-specs-section.tsx` | Sí | 2 | ✅ Migrada |
| Pet Attributes | `pet-attributes-section.tsx` | Sí | 3 | ✅ Migrada |
| Sport & Recreation | `sport-recreation-section.tsx` | Sí | — | ✅ Migrada |
| Publication | `publication-section.tsx` | Sí | — | ✅ Migrada |
| Specifications | `specifications-section.tsx` | Sí | — | ✅ Migrada |
| Target Audience | `target-audience-section.tsx` | Sí | — | ✅ Migrada |
| Storage & Shelf Life | `storage-shelf-life-section.tsx` | Sí | — | ✅ Migrada |
| Item Details | `item-details-section.tsx` | Sí | — | ✅ Migrada |
| Safety & Compliance | `safety-compliance-section.tsx` | Sí | — | ✅ Migrada |
| Manufacturing | `manufacturing-section.tsx` | Sí | Solo "-" → directo | ✅ Migrada |
| Product Details | `product-details-section.tsx` | Sí | — | ✅ Migrada |
| Product Identity | `product-identity-section.tsx` | Sí | Sí (Gender, Clothing, Use, Model, ID Numbers, Target Audience) | ✅ Migrada |
| Variation | `variation-section.tsx` | Sí | — | ✅ Migrada |
| Variety Pack | `variety-pack-section.tsx` | Sí | — | ⚠️ Adaptada (campos propios del componente VP) |
| Marketplace | — | No existe | — | ❌ Eliminado |
| Other | — | No existe | — | ❌ Eliminado |

---

## 9. Cards NO existentes en la DB

Estos cards **no existen** en la tabla `attributes_master` y no deben crearse secciones para ellos:

- **Marketplace** → archivo eliminado
- **Other** → archivo eliminado

---

## 10. Archivos relevantes

| Archivo | Descripción |
|---|---|
| `src/hooks/use-attributes-master.ts` | Hook para cargar cards desde la API |
| `src/lib/attributes-master.ts` | Tipos TypeScript (PDPCard, PDPSubcard, etc.) |
| `src/app/api/attributes-master/route.ts` | API endpoint con caché de 5 min |
| `src/components/products/product-detail-form.tsx` | Formulario principal — aquí se llaman las secciones |
| `src/components/products/{name}-section.tsx` | Cada sección individual |
| `src/lib/product-mapper.ts` | `getProductFieldValue(product, bqName)` para leer valores |
| `src/components/ui/collapsible.tsx` | Componente Collapsible de shadcn |
| `src/components/ui/badge.tsx` | Componente Badge de shadcn |
| `src/components/ui/tooltip.tsx` | Componentes Tooltip de shadcn |

---

## 11. CommonJS vs ESM

El archivo `src/lib/attributes-master.ts` es **ESM** (`"module"`). Si necesitas usar `require` desde un script, el archivo debe usar `.cjs` o `.mjs`. No mezclar syntax en el mismo archivo.

---

## 12. Nota sobre el archivo de referencia

El archivo `src/components/products/compliance-section.tsx` es la referencia más completa porque incluye:
- Subcards múltiples con Collapsible anidado
- Atributos directos al card principal
- Todos los patrones visuales correctos

Usarlo como plantilla al crear nuevas secciones.

---

*Última actualización: Mayo 2026*