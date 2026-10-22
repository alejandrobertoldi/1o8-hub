# Atributos Dinámicos por Categoría — Guía de Referencia

> **REGLA DE ORO:** No modificar estilos, estructura visual ni aspectos de UI sin confirmación expresa del usuario. Ante cualquier duda, preguntar antes de actuar.

---

## 1. Contexto del Proyecto

- **Proyecto:** 1o8Hub
- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **Objetivo:** Mostrar u ocultar atributos del formulario de producto PDP en función de la categoría del producto (`ProductType`), usando los datos de `Attributes_ValidValues` en la tabla `attributes_master` de Supabase.

---

## 2. Conceptos Clave

### 2.1 ProductType

- **Qué es:** El valor del campo `ProductType` del producto
- **Origen:** Viene de Amazon (es un valor guardado en el producto)
- **Ejemplos:** `SHIRT`, `PET_FOOD`, `FIGURINE`, `MEDICATION`, `BEVERAGE`, `SWEATSHIRT`
- **Importancia:** Es la clave que se compara con las claves del JSON en `Attributes_ValidValues`

### 2.2 Attributes_ValidValues

- **Dónde está:** Columna `Attributes_ValidValues` de la tabla `attributes_master`
- **Qué contiene:** Un JSON que define las categorías donde aplica el atributo y los valores permitidos
- **Nomenclatura de claves en el JSON:** Las claves son nombres de `ProductType` de Amazon separados por coma (ej: `"APPAREL, DRESS, SHIRT, SWEATSHIRT"`)

### 2.3 Estructura del JSON en Attributes_ValidValues

El JSON de `Attributes_ValidValues` puede tener 6 formatos distintos:

#### Caso 1: Columna vacía

La columna no tiene ningún valor.

**Comportamiento:** El atributo es **forzado por Manu** → siempre se muestra, se ignora cualquier filtrado de categoría.

**Render:** Campo libre (input de texto).

#### Caso 2: `{"ALL":""}`

El atributo aplica a **todas** las categorías y el campo es **libre** (sin valores predefinidos).

**Comportamiento:** Se muestra para todos los productos. Valor vacío → campo de texto libre.

**Render:** `<input type="text">`

#### Caso 3: `{"ALL":"valor1, valor2, valor3"}`

El atributo aplica a **todas** las categorías y tiene **valores predefinidos**.

**Comportamiento:** Se muestra para todos los productos. Los valores después de los dos puntos son una lista separada por comas → select dropdown.

**Render:** `<select>` con opciones parseadas de la lista.

#### Caso 4: `{"CLAVE":""}`

El atributo aplica a **una sola categoría** específica y es **campo libre**.

**Comportamiento:**
- Comparar `ProductType` del producto con la clave
- Si coincide → mostrar como **campo libre**
- Si NO coincide → **ocultar** el atributo completamente

**Render:** Si match: `<input type="text">` | Si no match: no renderizar

#### Caso 5: `{"CLAVE":"valor1, valor2"}` (o múltiples claves)

El atributo aplica a **una o varias categorías** y tiene **valores predefinidos**.

**Comportamiento:**
- Para **múltiples claves**: buscar cuál clave contiene el `ProductType` del producto → usar los valores de esa clave
- Para **una sola clave**: si el `ProductType` coincide → usar los valores; si no coincide → ocultar

**Render:** Si match y con valores: `<select>` | Si match y vacío: `<input type="text">` | Si no match: no renderizar

#### Caso 6: Parse error — Lista separada por pipe `|`

Algunos atributos tienen un formato que **no es JSON válido** — son listas separadas por `|`.

**Comportamiento:** Renderizar como `<select>` con los valores de la lista.

**Render:** `<select>` con opciones separadas por `|`

---

## 3. Resumen de Casos

| Caso | Attributes_ValidValues | ProductType Match? | Render |
|---|---|---|---|
| 1 — Forzado | Vacío/null | No aplica | Campo libre (input) |
| 2 — ALL vacío | `{"ALL":""}` | Todos | Campo libre (input) |
| 3 — ALL con valores | `{"ALL":"v1, v2"}` | Todos | Select |
| 4 — Clave específica vacía | `{"CLAVE":""}` | Si coincide | Campo libre (input) |
| 5 — Clave específica con valores | `{"CLAVE":"v1, v2"}` o múltiples | Si coincide | Select |
| 6 — Parse error | Lista con `\|` | No aplica | Select |

---

## 4. Excepción: Listing Identity

### 4.1 Card completo — NO se modifica

El card **Listing Identity** (`listing-identity-section.tsx`) se mantiene **intacto** durante esta fase de implementación.

**Razón:** Listing Identity tiene campos complejos con lógicas especiales que deben preservarse:
- `Status` → dropdown con colores de estado
- `UrlField` → link clickable + botón edit
- `ComputedField` → campos readonly con badges AAC/Auto/VB
- `ASIN` → validación especial (10 caracteres, empieza con B0)
- `SummarizedTitle` → concatenación de variation/flavor/size
- Campos con `aacData` para BrandName, ClientName, etc.

### 4.2 Atributo Action — SÍ se modifica

El único campo del card Listing Identity que **SÍ** se integra en el sistema de filtrado es `Action`.

- Aplica a todos los productos
- Renderizado como **campo libre**
- Se filtra por categoría como cualquier otro atributo

---

## 5. Hook: `use-category-filter.ts`

Ubicación: `src/hooks/use-category-filter.ts`

```typescript
export type ValidValuesResult = {
  visible: boolean;
  options: string[] | null;
  isFreeText: boolean;
};

function parseOptions(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export function parseValidValues(
  validValues: string | null | undefined,
  productType: string | null | undefined
): ValidValuesResult {
  // Caso 1: columna vacía → forzado
  if (!validValues || validValues === "null" || validValues.trim() === "") {
    return { visible: true, options: null, isFreeText: true };
  }

  try {
    const parsed = JSON.parse(validValues);
    const keys = Object.keys(parsed);

    // Caso 2 y 3: tiene clave "ALL"
    if (keys.includes("ALL")) {
      const allValue = parsed["ALL"];
      if (!allValue || allValue.trim() === "") {
        return { visible: true, options: null, isFreeText: true };
      }
      return { visible: true, options: parseOptions(allValue), isFreeText: false };
    }

    // Casos 4 y 5: buscar coincidencia
    let matchedValue: string | null = null;

    for (const key of keys) {
      const keyParts = key.split(",").map((k) => k.trim());
      if (productType && keyParts.includes(productType)) {
        matchedValue = parsed[key];
        break;
      }
    }

    if (matchedValue === null || matchedValue === undefined) {
      return { visible: false, options: null, isFreeText: false };
    }

    if (!matchedValue || matchedValue.trim() === "") {
      return { visible: true, options: null, isFreeText: true };
    }

    return { visible: true, options: parseOptions(matchedValue), isFreeText: false };
  } catch {
    // Caso 6: lista separada por |
    const options = validValues.split("|").map((s) => s.trim()).filter(Boolean);
    return { visible: true, options, isFreeText: false };
  }
}

export function useValidValues(validValues: string | null | undefined, productType: string | null | undefined) {
  return useMemo(() => parseValidValues(validValues, productType), [validValues, productType]);
}
```

---

## 6. Integración en Secciones Migradas

### 6.1 Importar el hook

```typescript
import { parseValidValues } from "@/hooks/use-category-filter";
```

### 6.2 Obtener productType

```typescript
const productType = getProductFieldValue(product, "ProductType");
```

### 6.3 Añadir validValues a los atributos

```typescript
const sectionAttributes = useMemo((): { ...; validValues: string | null }[] => {
  // extraer validValues de cada atributo
}, [cards]);
```

### 6.4 Filtrar atributos visibles

```typescript
const visibleAttributes = useMemo(() => {
  return sectionAttributes.filter((attr) => {
    const result = parseValidValues(attr.validValues, productType);
    return result.visible;
  });
}, [sectionAttributes, productType]);
```

### 6.5 Usar visibleAttributes en vez de sectionAttributes

- Contadores de badge: `{populatedCount}/{visibleAttributes.length}`
- Iteración de atributos: `.map((attr) => ...)`

### 6.6 Renderizar select o input según el tipo

**REGLA CRÍTICA:** Cuando `isSelect` es `false` (free text), SIEMPRE renderizar `<input type="text">` (o `type="number"` según el campo). **NUNCA renderizar `<select>` por defecto.** Un campo que no tiene opciones predefinidas en la DB NO debe mostrarse como select vacío.

```typescript
const validValuesParsed = validValues ? parseValidValues(validValues, productType) : null;
const isSelectFromDB = validValuesParsed?.options != null && validValuesParsed.options.length > 0;
const selectOptionsFromDB = validValuesParsed?.options ?? [];

const getSelectOptions = (): string[] => {
  // Hardcoded options only for specific fields (e.g., isAdult -> Yes/No)
  const isBoolean = bqName.toLowerCase().includes("isadult") || bqName.toLowerCase().includes("adult");
  if (isBoolean) return ["Yes", "No"];
  return [];
};

const hardcodedOpts = getSelectOptions();
const isSelect = isSelectFromDB || hardcodedOpts.length > 0;
const selectOptions = isSelectFromDB ? selectOptionsFromDB : hardcodedOpts;

// En el render del campo:
{readOnly ? (
  <span>{value || "—"}</span>
) : isSelect ? (
  <select value={localValue} onChange={(e) => handleChange(e.target.value)}>
    <option value="">— select —</option>
    {selectOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
  </select>
) : (
  <input type="text" value={localValue} onChange={(e) => handleChange(e.target.value)} />
)}
```

**Flujo de decisión:**
1. ¿`validValues` de la DB tiene opciones? → `isSelect = true` → `<select>`
2. ¿`bqName` tiene lógica hardcoded (ej: `isadult` → Yes/No)? → `isSelect = true` → `<select>`
3. ¿Hardcoded options encontrados? → usar hardcoded
4. ¿Ninguno? → `isSelect = false` → `<input type="text">` (nunca select)

**Errores comunes a evitar:**
- ❌ Renderizar `<select>` cuando `isSelect = false` — esto muestra un dropdown vacío
- ❌ No verificar que `options.length > 0` antes de marcar como select
- ❌ Dejar opciones hardcoded que aplican a un campo en otro campo (verificar `bqName`)

---

## 7. Secciones a Integrar

- `offer-section.tsx`
- `dimensions-section.tsx`
- `compliance-section.tsx`
- `ingredients-nutrition-section.tsx`
- `apparel-style-section.tsx`
- `materials-section.tsx`
- `food-attributes-section.tsx`
- `technical-specs-section.tsx`
- `pet-attributes-section.tsx`
- `sport-recreation-section.tsx`
- `publication-section.tsx`
- `specifications-section.tsx`
- `target-audience-section.tsx`
- `storage-shelf-life-section.tsx`
- `item-details-section.tsx`
- `safety-compliance-section.tsx`
- `manufacturing-section.tsx`
- `product-details-section.tsx`
- `product-identity-section.tsx`
- `variation-section.tsx`
- `listing-identity-section.tsx` (solo Action)