import { describe, it, expect } from "vitest";
import { aliasesFromRows } from "./clr-aliases-loader";

describe("aliasesFromRows", () => {
  it("substitutes {MP}/{LANG} placeholders into regex patterns", () => {
    const aliases = aliasesFromRows([
      {
        generalLabel: "ItemName",
        scLabel: "item_name[marketplace_id={MP}][language_tag={LANG}]#1.value",
        scLabelMulti: null,
      },
    ]);
    expect(aliases).toHaveLength(1);
    expect(aliases[0].bqName).toBe("ItemName");
    expect(
      aliases[0].patterns[0].test(
        "item_name[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value"
      )
    ).toBe(true);
  });

  it("forwards sc_label_multi onto the alias", () => {
    const aliases = aliasesFromRows([
      {
        generalLabel: "GenericKeywords",
        scLabel:
          "generic_keyword[marketplace_id={MP}][language_tag={LANG}]#\\d+.value",
        scLabelMulti: "concat",
      },
    ]);
    expect(aliases[0].multi).toBe("concat");
  });

  it("skips rows with null sc_label", () => {
    const aliases = aliasesFromRows([
      { generalLabel: "IsVP", scLabel: null, scLabelMulti: null },
    ]);
    expect(aliases).toHaveLength(0);
  });
});
