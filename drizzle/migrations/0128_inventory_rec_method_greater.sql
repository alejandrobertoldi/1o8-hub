-- 0128: allow the "greater" recommendation method (basis = max(recent units,
-- seasonal-window units)). Drop + re-add the CHECK in ONE statement so there is
-- no moment without the constraint. Additive: every existing value stays valid.
ALTER TABLE "inventory_rec_settings"
  DROP CONSTRAINT "inventory_rec_settings_method_chk",
  ADD CONSTRAINT "inventory_rec_settings_method_chk" CHECK ("method" IN ('recent', 'seasonal', 'average', 'greater'));
