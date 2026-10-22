# AAC Attribute Reconciliation

Generated 2026-05-04. Source of truth: FigJam diagram (canonical names).

**Summary:** 99 aligned · 19 pending rename · 9 missing in BQ+PG · 13 PG orphan keys (dropped from BQ, still in raw_data)

**Legend:** `✓` = canonical name found · `→` = uses old name (rename target) · `—` = not present

App code follows BigQuery column names — every BQ rename implies a code rename.

| Group             | Canonical (FigJam)            | BigQuery                   | Supabase rawData                | Status           |
| ----------------- | ----------------------------- | -------------------------- | ------------------------------- | ---------------- |
| Identity          | ClientIDCode                  | ✓ ClientIDCode             | ✓ ClientIDCode (37)             | Aligned          |
| Identity          | ClientName                    | ✓ ClientName               | ✓ ClientName (42)               | Aligned          |
| Identity          | ClientStatus                  | ✓ ClientStatus             | ✓ ClientStatus (42)             | Aligned          |
| Identity          | merchantID                    | ✓ merchantID               | ✓ merchantID (37)               | Aligned          |
| Identity          | Tier                          | ✓ Tier                     | ✓ Tier (37)                     | Aligned          |
| Identity          | BrandName                     | ✓ BrandName                | ✓ BrandName (39)                | Aligned          |
| Identity          | Marketplace                   | ✓ Marketplace              | ✓ Marketplace (41)              | Aligned          |
| Identity          | Country                       | ✓ Country                  | ✓ Country (41)                  | Aligned          |
| Identity          | MarketplaceClientName         | ✓ MarketplaceClientName    | ✓ MarketplaceClientName (38)    | Aligned          |
| Identity          | BrandRegistry                 | ✓ BrandRegistry            | ✓ BrandRegistry (37)            | Aligned          |
| Identity          | RetainerType                  | ✓ RetainerType             | ✓ RetainerType (37)             | Aligned          |
| Identity          | Commission                    | ✓ Commission               | ✓ Commission (37)               | Aligned          |
| Identity          | BrandURL                      | ✓ BrandURL                 | ✓ BrandURL (39)                 | Aligned          |
| Contacts          | ClientContactName1            | ✓ ClientContactName1       | ✓ ClientContactName1 (40)       | Aligned          |
| Contacts          | ClientContactEmail1           | ✓ ClientContactEmail1      | ✓ ClientContactEmail1 (40)      | Aligned          |
| Contacts          | ClientContactName2            | ✓ ClientContactName2       | ✓ ClientContactName2 (40)       | Aligned          |
| Contacts          | ClientContactEmail2           | ✓ ClientContactEmail2      | ✓ ClientContactEmail2 (40)      | Aligned          |
| Contacts          | ClientContactName3            | ✓ ClientContactName3       | ✓ ClientContactName3 (40)       | Aligned          |
| Contacts          | ClientContactEmail3           | ✓ ClientContactEmail3      | ✓ ClientContactEmail3 (40)      | Aligned          |
| Contacts          | ClientContactName4            | ✓ ClientContactName4       | ✓ ClientContactName4 (40)       | Aligned          |
| Contacts          | ClientContactEmail4           | ✓ ClientContactEmail4      | ✓ ClientContactEmail4 (40)      | Aligned          |
| Contacts          | ClientContactName5            | ✓ ClientContactName5       | ✓ ClientContactName5 (40)       | Aligned          |
| Contacts          | ClientContactEmail5           | ✓ ClientContactEmail5      | ✓ ClientContactEmail5 (40)      | Aligned          |
| Contacts          | ClientBillingName1            | — missing                  | — missing                       | Missing in BQ+PG |
| Contacts          | ClientBillingName2            | — missing                  | — missing                       | Missing in BQ+PG |
| Contacts          | ClientBillingName3            | — missing                  | — missing                       | Missing in BQ+PG |
| Contacts          | ClientBillingName4            | — missing                  | — missing                       | Missing in BQ+PG |
| Contacts          | ClientBillingEmail1           | → BillingEmail1            | → BillingEmail1 (37)            | Pending rename   |
| Contacts          | ClientBillingEmail2           | → BillingEmail2            | → BillingEmail2 (37)            | Pending rename   |
| Contacts          | ClientBillingEmail3           | → BillingEmail3            | → BillingEmail3 (37)            | Pending rename   |
| Contacts          | ClientBillingEmail4           | → BillingEmail4            | → BillingEmail4 (37)            | Pending rename   |
| Team 1o8M         | ExecutiveStrategist_1o8M      | ✓ ExecutiveStrategist_1o8M | ✓ ExecutiveStrategist_1o8M (40) | Aligned          |
| Team 1o8M         | AccountManager1_1o8M          | → AccountManager_1o8M      | → AccountManager_1o8M (39)      | Pending rename   |
| Team 1o8M         | AccountManager2_1o8M          | — missing                  | — missing                       | Missing in BQ+PG |
| Team 1o8M         | ProjectManager_1o8M           | ✓ ProjectManager_1o8M      | ✓ ProjectManager_1o8M (39)      | Aligned          |
| Team 1o8M         | ProjectManagerAsana_1o8M      | ✓ ProjectManagerAsana_1o8M | ✓ ProjectManagerAsana_1o8M (37) | Aligned          |
| Team 1o8M         | PPCManager_1o8M               | ✓ PPCManager_1o8M          | ✓ PPCManager_1o8M (39)          | Aligned          |
| Team 1o8M         | SEOManager_1o8M               | ✓ SEOManager_1o8M          | ✓ SEOManager_1o8M (39)          | Aligned          |
| Team 1o8M         | CatalogManager_1o8M           | ✓ CatalogManager_1o8M      | ✓ CatalogManager_1o8M (39)      | Aligned          |
| Team 1o8M         | DesignManager_1o8M            | ✓ DesignManager_1o8M       | ✓ DesignManager_1o8M (39)       | Aligned          |
| Team 1o8M         | DesignUploadManager_1o8M      | ✓ DesignUploadManager_1o8M | ✓ DesignUploadManager_1o8M (37) | Aligned          |
| Team 1o8A         | ExecutiveStrategist_1o8A      | ✓ ExecutiveStrategist_1o8A | ✓ ExecutiveStrategist_1o8A (37) | Aligned          |
| Team 1o8A         | AccountManager_1o8A           | ✓ AccountManager_1o8A      | ✓ AccountManager_1o8A (37)      | Aligned          |
| Team 1o8A         | ProjectManager_1o8A           | ✓ ProjectManager_1o8A      | ✓ ProjectManager_1o8A (37)      | Aligned          |
| Dates             | ClientOnboardingDate          | — missing                  | — missing                       | Missing in BQ+PG |
| Dates             | ClientOffboardingDate         | — missing                  | — missing                       | Missing in BQ+PG |
| Dates             | ClientOnboardingEmailSendDate | — missing                  | — missing                       | Missing in BQ+PG |
| Drive             | ClientRootFolderURL           | — missing                  | — missing                       | Missing in BQ+PG |
| Intentwise        | IntentwiseName                | ✓ IntentwiseName           | ✓ IntentwiseName (38)           | Aligned          |
| Intentwise        | IntentwiseID                  | ✓ IntentwiseID             | ✓ IntentwiseID (39)             | Aligned          |
| Intentwise        | IntentwiseNameAMC             | ✓ IntentwiseNameAMC        | ✓ IntentwiseNameAMC (38)        | Aligned          |
| Intentwise        | IntentwiseIDAMC               | ✓ IntentwiseIDAMC          | ✓ IntentwiseIDAMC (38)          | Aligned          |
| Intentwise        | IntentwiseShareOfVoice        | ✓ IntentwiseShareOfVoice   | ✓ IntentwiseShareOfVoice (37)   | Aligned          |
| Competitors       | Competitor1Name               | ✓ Competitor1Name          | ✓ Competitor1Name (37)          | Aligned          |
| Competitors       | Competitor1URL                | ✓ Competitor1URL           | ✓ Competitor1URL (37)           | Aligned          |
| Competitors       | Competitor2Name               | ✓ Competitor2Name          | ✓ Competitor2Name (37)          | Aligned          |
| Competitors       | Competitor2URL                | ✓ Competitor2URL           | ✓ Competitor2URL (37)           | Aligned          |
| Competitors       | Competitor3Name               | ✓ Competitor3Name          | ✓ Competitor3Name (37)          | Aligned          |
| Competitors       | Competitor3URL                | ✓ Competitor3URL           | ✓ Competitor3URL (37)           | Aligned          |
| Competitors       | Competitor4Name               | ✓ Competitor4Name          | ✓ Competitor4Name (37)          | Aligned          |
| Competitors       | Competitor4URL                | ✓ Competitor4URL           | ✓ Competitor4URL (37)           | Aligned          |
| Competitors       | Competitor5Name               | ✓ Competitor5Name          | ✓ Competitor5Name (37)          | Aligned          |
| Competitors       | Competitor5URL                | ✓ Competitor5URL           | ✓ Competitor5URL (37)           | Aligned          |
| Promotions        | Promo1Name                    | ✓ Promo1Name               | ✓ Promo1Name (37)               | Aligned          |
| Promotions        | Promo1Discount                | ✓ Promo1Discount           | ✓ Promo1Discount (37)           | Aligned          |
| Promotions        | Promo1StartDate               | ✓ Promo1StartDate          | ✓ Promo1StartDate (37)          | Aligned          |
| Promotions        | Promo1EndDate                 | ✓ Promo1EndDate            | ✓ Promo1EndDate (37)            | Aligned          |
| Promotions        | Promo1Comment                 | ✓ Promo1Comment            | ✓ Promo1Comment (37)            | Aligned          |
| Promotions        | Promo2Name                    | ✓ Promo2Name               | ✓ Promo2Name (37)               | Aligned          |
| Promotions        | Promo2Discount                | ✓ Promo2Discount           | ✓ Promo2Discount (37)           | Aligned          |
| Promotions        | Promo2StartDate               | ✓ Promo2StartDate          | ✓ Promo2StartDate (37)          | Aligned          |
| Promotions        | Promo2EndDate                 | ✓ Promo2EndDate            | ✓ Promo2EndDate (37)            | Aligned          |
| Promotions        | Promo2Comment                 | ✓ Promo2Comment            | ✓ Promo2Comment (37)            | Aligned          |
| Promotions        | Promo3Name                    | ✓ Promo3Name               | ✓ Promo3Name (37)               | Aligned          |
| Promotions        | Promo3Discount                | ✓ Promo3Discount           | ✓ Promo3Discount (37)           | Aligned          |
| Promotions        | Promo3StartDate               | ✓ Promo3StartDate          | ✓ Promo3StartDate (37)          | Aligned          |
| Promotions        | Promo3EndDate                 | ✓ Promo3EndDate            | ✓ Promo3EndDate (37)            | Aligned          |
| Promotions        | Promo3Comment                 | ✓ Promo3Comment            | ✓ Promo3Comment (37)            | Aligned          |
| External Services | Levanta                       | ✓ Levanta                  | ✓ Levanta (37)                  | Aligned          |
| External Services | PowerBIDashboardURL           | ✓ PowerBIDashboardURL      | ✓ PowerBIDashboardURL (37)      | Aligned          |
| External Services | PowerBIEmbedURL               | ✓ PowerBIEmbedURL          | ✓ PowerBIEmbedURL (38)          | Aligned          |
| External Services | FeedbackWhiz                  | ✓ FeedbackWhiz             | ✓ FeedbackWhiz (37)             | Aligned          |
| Goals             | ADSpendBudget1D               | ✓ ADSpendBudget1D          | ✓ ADSpendBudget1D (37)          | Aligned          |
| Goals             | ADSpendBudget1W               | ✓ ADSpendBudget1W          | ✓ ADSpendBudget1W (37)          | Aligned          |
| Goals             | ADSpendBudget1M               | ✓ ADSpendBudget1M          | ✓ ADSpendBudget1M (37)          | Aligned          |
| Goals             | ADSpendBudget3M               | ✓ ADSpendBudget3M          | ✓ ADSpendBudget3M (37)          | Aligned          |
| Goals             | ADSpendBudget6M               | ✓ ADSpendBudget6M          | ✓ ADSpendBudget6M (37)          | Aligned          |
| Goals             | ADSpendBudget1Y               | ✓ ADSpendBudget1Y          | ✓ ADSpendBudget1Y (37)          | Aligned          |
| Goals             | ADSpendBudgetComment          | ✓ ADSpendBudgetComment     | ✓ ADSpendBudgetComment (37)     | Aligned          |
| Goals             | SalesForecast1D               | ✓ SalesForecast1D          | ✓ SalesForecast1D (37)          | Aligned          |
| Goals             | SalesForecast1W               | ✓ SalesForecast1W          | ✓ SalesForecast1W (37)          | Aligned          |
| Goals             | SalesForecast1M               | ✓ SalesForecast1M          | ✓ SalesForecast1M (37)          | Aligned          |
| Goals             | SalesForecast3M               | ✓ SalesForecast3M          | ✓ SalesForecast3M (37)          | Aligned          |
| Goals             | SalesForecast6M               | ✓ SalesForecast6M          | ✓ SalesForecast6M (37)          | Aligned          |
| Goals             | SalesForecast1Y               | ✓ SalesForecast1Y          | ✓ SalesForecast1Y (37)          | Aligned          |
| Goals             | SalesForecastComment          | ✓ SalesForecastComment     | ✓ SalesForecastComment (37)     | Aligned          |
| Goals             | PercentageOrgRevGoal1D        | ✓ PercentageOrgRevGoal1D   | ✓ PercentageOrgRevGoal1D (37)   | Aligned          |
| Goals             | PercentageOrgRevGoal1W        | ✓ PercentageOrgRevGoal1W   | ✓ PercentageOrgRevGoal1W (37)   | Aligned          |
| Goals             | PercentageOrgRevGoal1M        | ✓ PercentageOrgRevGoal1M   | ✓ PercentageOrgRevGoal1M (37)   | Aligned          |
| Goals             | PercentageOrgRevGoal3M        | ✓ PercentageOrgRevGoal3M   | ✓ PercentageOrgRevGoal3M (37)   | Aligned          |
| Goals             | PercentageOrgRevGoal6M        | ✓ PercentageOrgRevGoal6M   | ✓ PercentageOrgRevGoal6M (37)   | Aligned          |
| Goals             | PercentageOrgRevGoal1Y        | ✓ PercentageOrgRevGoal1Y   | ✓ PercentageOrgRevGoal1Y (37)   | Aligned          |
| Goals             | PercentageOrgRevComment       | ✓ PercentageOrgRevComment  | ✓ PercentageOrgRevComment (37)  | Aligned          |
| Goals             | ROASGoal1D                    | ✓ ROASGoal1D               | ✓ ROASGoal1D (37)               | Aligned          |
| Goals             | ROASGoal1W                    | ✓ ROASGoal1W               | ✓ ROASGoal1W (37)               | Aligned          |
| Goals             | ROASGoal1M                    | ✓ ROASGoal1M               | ✓ ROASGoal1M (37)               | Aligned          |
| Goals             | ROASGoal3M                    | ✓ ROASGoal3M               | ✓ ROASGoal3M (37)               | Aligned          |
| Goals             | ROASGoal6M                    | ✓ ROASGoal6M               | ✓ ROASGoal6M (37)               | Aligned          |
| Goals             | ROASGoal1Y                    | ✓ ROASGoal1Y               | ✓ ROASGoal1Y (37)               | Aligned          |
| Goals             | ROASGoalComment               | ✓ ROASGoalComment          | ✓ ROASGoalComment (37)          | Aligned          |
| Goals             | ACoSGoal1D                    | → ACOSGoal1D               | → ACOSGoal1D (37)               | Pending rename   |
| Goals             | ACoSGoal1W                    | → ACOSGoal1W               | → ACOSGoal1W (37)               | Pending rename   |
| Goals             | ACoSGoal1M                    | → ACOSGoal1M               | → ACOSGoal1M (37)               | Pending rename   |
| Goals             | ACoSGoal3M                    | → ACOSGoal3M               | → ACOSGoal3M (37)               | Pending rename   |
| Goals             | ACoSGoal6M                    | → ACOSGoal6M               | → ACOSGoal6M (37)               | Pending rename   |
| Goals             | ACoSGoal1Y                    | → ACOSGoal1Y               | → ACOSGoal1Y (37)               | Pending rename   |
| Goals             | ACoSGoalComment               | → ACOSGoalComment          | → ACOSGoalComment (37)          | Pending rename   |
| Goals             | TACoSGoal1D                   | → TACOSGoal1D              | → TACOSGoal1D (37)              | Pending rename   |
| Goals             | TACoSGoal1W                   | → TACOSGoal1W              | → TACOSGoal1W (37)              | Pending rename   |
| Goals             | TACoSGoal1M                   | → TACOSGoal1M              | → TACOSGoal1M (37)              | Pending rename   |
| Goals             | TACoSGoal3M                   | → TACOSGoal3M              | → TACOSGoal3M (37)              | Pending rename   |
| Goals             | TACoSGoal6M                   | → TACOSGoal6M              | → TACOSGoal6M (37)              | Pending rename   |
| Goals             | TACoSGoal1Y                   | → TACOSGoal1Y              | → TACOSGoal1Y (37)              | Pending rename   |
| Goals             | TACoSGoalComment              | → TACOSGoalComment         | → TACOSGoalComment (37)         | Pending rename   |
| Amazon Contact    | AmazonContactName             | ✓ AmazonContactName        | ✓ AmazonContactName (37)        | Aligned          |
| Amazon Contact    | AmazonContactEmail            | ✓ AmazonContactEmail       | ✓ AmazonContactEmail (37)       | Aligned          |
| Others            | ExpoWest2026Location          | ✓ ExpoWest2026Location     | ✓ ExpoWest2026Location (37)     | Aligned          |
| [orphan]          | AINotetakerApproval           | — dropped                  | ✓ AINotetakerApproval (37)      | PG orphan        |
| [orphan]          | ClientBibleID                 | — dropped                  | ✓ ClientBibleID (37)            | PG orphan        |
| [orphan]          | ClientBibleURL                | — dropped                  | ✓ ClientBibleURL (37)           | PG orphan        |
| [orphan]          | ClientIdCode                  | — dropped                  | ✓ ClientIdCode (5)              | PG orphan        |
| [orphan]          | DashboardDataSource           | — dropped                  | ✓ DashboardDataSource (37)      | PG orphan        |
| [orphan]          | DashboardTrack                | — dropped                  | ✓ DashboardTrack (37)           | PG orphan        |
| [orphan]          | GDSDashboard                  | — dropped                  | ✓ GDSDashboard (37)             | PG orphan        |
| [orphan]          | GeneralStructureNotes         | — dropped                  | ✓ GeneralStructureNotes (37)    | PG orphan        |
| [orphan]          | IntentwiseDashboard           | — dropped                  | ✓ IntentwiseDashboard (37)      | PG orphan        |
| [orphan]          | MasterAACRow                  | — dropped                  | ✓ MasterAACRow (37)             | PG orphan        |
| [orphan]          | RunningAgendaURL              | — dropped                  | ✓ RunningAgendaURL (37)         | PG orphan        |
| [orphan]          | TimelineURL                   | — dropped                  | ✓ TimelineURL (37)              | PG orphan        |
| [orphan]          | Walmart                       | — dropped                  | ✓ Walmart (37)                  | PG orphan        |
