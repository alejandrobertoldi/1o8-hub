# 1o8Hub — Resumen de la Aplicacion

## Que es 1o8Hub

1o8Hub es la plataforma interna de gestion de **1o8 Agency**, una agencia especializada en Amazon. Centraliza todas las operaciones del dia a dia: gestion de productos, contenido A+, SEO, publicidad PPC, finanzas, diseno y comunicacion con clientes — todo en una sola aplicacion web.

**URL de produccion:** https://1o8hub.vercel.app

## Stack Tecnologico

| Capa            | Tecnologia                                                   |
|-----------------|--------------------------------------------------------------|
| Frontend        | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui |
| Backend         | API Routes de Next.js, Server Components                      |
| Base de datos   | PostgreSQL (Supabase) con Drizzle ORM                         |
| Autenticacion   | NextAuth v5 con Google OAuth                                  |
| Data warehouse  | BigQuery (lectura/escritura), Redshift (Intentwise)           |
| IA              | Claude API (Anthropic) para analisis y generacion de contenido |
| Almacenamiento  | Google Drive (imagenes y archivos de clientes)                |
| Deploy          | Vercel (auto-deploy desde `main`)                             |

## Roles de Usuario

| Rol         | Acceso                                                          |
|-------------|------------------------------------------------------------------|
| **Admin**   | Acceso total: usuarios, configuracion IA, logs, sincronizacion   |
| **Editor**  | Edicion de productos, contenido, SEO                             |
| **Viewer**  | Solo lectura del hub interno                                     |
| **Client**  | Portal de cliente (`/portal/*`) — aprobaciones, reportes, ventas |
| **Pending** | Redirigido a registro hasta que un admin apruebe                 |

## Modulos Principales

### Productos (`/products`)
Gestion de catalogo Amazon con 972 atributos por producto. Edicion inline, registro de columnas, esquema hibrido (columnas indexadas + JSONB para el resto). Publicacion a BigQuery.

### Variaciones (`/variations`)
Agrupacion jerarquica de productos: grupos exclusivos (FK) y tags transversales (tabla de union). Deteccion automatica desde Amazon VariationThemeName. UI de constructor con asignacion masiva.

### Contenido A+ (`/aplus`)
Editor de modulos A+ (hasta 7 por producto). Slots de imagenes con subida a Google Drive. Sistema de comentarios tipo Markup.io. Flujo de aprobacion via portal de cliente.

### Pipeline SEO (`/seo`)
Pipeline de 6 fases:
1. **S1 — Intake**: Recogida de datos del producto
2. **S2 — Keywords**: Investigacion de palabras clave
3. **S3 — Reviews**: Analisis de resenas
4. **S4 — Rufus Q&A**: Preguntas y respuestas simuladas
5. **S5 — COSMO**: Mapas de interes del comprador
6. **S6 — Content**: Generacion de contenido optimizado

Incluye Content Control Center (`/seo/manager`), dashboard SEO y vistas detalladas por cliente.

### PPC Performance (`/ppc`)
Sistema de inteligencia PPC con 6 capacidades:
- **Dashboard**: Metricas clave (Spend, Revenue, ACOS, ROAS) con comparativa entre snapshots
- **Root Cause**: Analisis de causa raiz con IA (Claude)
- **Approvals**: Seguimiento de solicitudes de aprobacion de cambios PPC
- **Alerts**: Alertas predictivas
- **Competitor**: Benchmark competitivo
- **Decisions**: Tracker de accountability de decisiones

Datos de Redshift (Intentwise). Cron job diario a las 02:00 UTC para snapshots automaticos.

### Finanzas (`/finances`)
Reportes financieros con datos de settlement de Amazon via Redshift. Diagrama Sankey de flujo de fondos. Vista de portal para clientes.

### Resumen de Ventas (`/sales-summary`)
Dashboard consolidado de ventas con metricas semanales, inventario, y previsiones. Cache en PostgreSQL con refresco automatico cada 6 horas.

### Amazon Sync (`/amazon-sync`)
Sincronizacion con Amazon SP-API y comparaciones con Rainforest API. Tracking de discrepancias entre datos internos y listings vivos.

### Diseno (`/design`)
Gestion de assets de diseno: Brand Story, Listing Images y Storefront. Vistas internas y de portal para clientes.

### Portal de Cliente (`/portal`)
Area privada para clientes con acceso a:
- Aprobacion de contenido A+
- Reportes y exportaciones
- Datos de ventas e inventario
- Estados financieros
- Calculadora de revenue
- Timeline de actividad
- Assets de diseno

### Admin (`/admin`)
Panel de administracion:
- Gestion de usuarios y roles
- Configuracion de modelos IA (modelo, tokens, prompts por feature)
- Log de eventos y actividad
- Credenciales SP-API por cliente
- Gestion de atributos
- Sincronizacion de datos
- Integracion con Asana
- Observabilidad

### Otros Modulos
- **Publicacion** (`/publish`): Tracking de filas modificadas y escritura a BigQuery
- **Reportes/Export** (`/reports`, `/export`): Generacion de PDF, XLSX y DOCX
- **Calendario** (`/calendar`): Vista de calendario de actividades
- **Onboarding** (`/onboarding`): Flujo de incorporacion de nuevos clientes con Gantt chart
- **Timeline** (`/timeline`): Actividad reciente del hub
- **Clientes** (`/clients/[id]`): Vista detallada por cliente con forecast, inventario, onboarding y timeline
- **Variety Packs** (`/variety-packs`): Gestion de packs de variedad
- **Calculadora** (`/calculator`): Calculadora de revenue

## Integraciones Externas

| Servicio              | Uso                                                       |
|-----------------------|-----------------------------------------------------------|
| **Google BigQuery**   | Import/export de datos de producto (tabla Master)         |
| **Amazon Redshift**   | Datos de Intentwise (PPC, finanzas)                       |
| **Amazon SP-API**     | Datos de catalogo y ventas por cliente                    |
| **Rainforest API**    | Scraping de listings de Amazon                            |
| **Google Drive**      | Almacenamiento de imagenes y archivos                     |
| **Claude (Anthropic)**| Analisis PPC, generacion de alt-text, titulos de video    |
| **Resend**            | Email transaccional                                       |
| **Asana**             | Gestion de tareas (integracion admin)                     |

## Estructura de Base de Datos

PostgreSQL con Drizzle ORM. Esquema hibrido para productos:
- ~30 columnas core indexadas
- JSONB categorizado para ~940 columnas restantes
- `raw_column_values` JSONB para zero data loss

Tablas principales: products, variations, variation_tags, aplus_modules, seo_pipelines, ppc_snapshots, approvals, decisions, alerts, users, activity_log, ai_feature_configs, sp_api_credentials, entre otras.

## Paginas Totales

~80 paginas entre hub interno y portal de cliente, con ~40 rutas API.
