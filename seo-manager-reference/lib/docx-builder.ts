// ═══════════════════════════════════════════════════════════════
// docx-builder.ts — Builds the .docx buffer (ESM, bundled by webpack)
// Drive upload is handled separately in the route file.
// ═══════════════════════════════════════════════════════════════

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, Footer, PageNumber,
} from "docx";

const ORANGE = "E8602A", DARK = "333333", MID = "666666", LIGHT = "F7F7F7", GREEN = "16A34A", RED = "DC2626";
const cb = { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" };
const borders = { top: cb, bottom: cb, left: cb, right: cb };

const gap = (pts = 120) => new Paragraph({ children: [new TextRun("")], spacing: { after: pts } });

const bodyP = (text: string, color = DARK, size = 22) =>
  new Paragraph({ children: [new TextRun({ text, size, font: "Arial", color })], spacing: { after: 80 } });

const metaP = (label: string, value: string, warn = false) =>
  new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 19, font: "Arial", color: MID }),
      new TextRun({ text: value || "—", size: 19, font: "Arial", color: warn ? RED : value ? DARK : "AAAAAA" }),
    ],
    spacing: { after: 60 },
  });

const headingP = (text: string, level: number) =>
  new Paragraph({
    children: [new TextRun({ text, bold: true, font: "Arial", size: level === 1 ? 38 : 27, color: level === 1 ? ORANGE : DARK })],
    spacing: { before: level === 1 ? 480 : 360, after: 120 },
    ...(level === 1 ? { border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ORANGE, space: 1 } } } : {}),
  });

const asinHeader = (asin: string, product: string, level: string, attrs: string) => {
  const isParent = level.toLowerCase() === "parent";
  return [
    new Paragraph({
      children: [
        new TextRun({ text: asin, bold: true, size: 24, font: "Courier New", color: ORANGE }),
        new TextRun({ text: `   ${isParent ? "PARENT" : "CHILD"}`, bold: true, size: 18, font: "Arial", color: isParent ? "1D4ED8" : "7C3AED" }),
        ...(product ? [new TextRun({ text: `   ${product}`, size: 22, font: "Arial", color: DARK })] : []),
      ],
      spacing: { before: 480, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: "EEEEEE", space: 1 } },
    }),
    ...(attrs ? [bodyP(attrs, MID, 19)] : []),
    gap(80),
  ];
};

const bRow = (num: number, label: string, text: string, chars: number, lo: number, hi: number) => {
  const warn = chars > 0 && (chars < lo || chars > hi);
  const cc = warn ? RED : chars > 0 ? GREEN : MID;
  return new TableRow({ children: [
    new TableCell({ borders, width:{size:500,type:WidthType.DXA}, shading:{fill:LIGHT,type:ShadingType.CLEAR},
      margins:{top:80,bottom:80,left:100,right:100},
      children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:String(num),bold:true,size:18,font:"Arial",color:MID})]})] }),
    new TableCell({ borders, width:{size:1300,type:WidthType.DXA}, shading:{fill:LIGHT,type:ShadingType.CLEAR},
      margins:{top:80,bottom:80,left:120,right:120},
      children:[new Paragraph({children:[new TextRun({text:label,bold:true,size:18,font:"Arial",color:MID})]})] }),
    new TableCell({ borders, width:{size:6800,type:WidthType.DXA}, margins:{top:80,bottom:80,left:120,right:120},
      children:[new Paragraph({children:[new TextRun({text:text||"— not generated —",size:20,font:"Arial",color:text?DARK:"BBBBBB"})]})] }),
    new TableCell({ borders, width:{size:760,type:WidthType.DXA}, shading:{fill:LIGHT,type:ShadingType.CLEAR},
      margins:{top:80,bottom:80,left:80,right:80},
      children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:chars?`${chars}c`:"",size:17,font:"Courier New",color:cc})]})] }),
  ]});
};

const bTable = (rows: TableRow[]) => new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[500,1300,6800,760], rows });

const beRow = (label: string, value: string, bytes: number) =>
  new TableRow({ children: [
    new TableCell({ borders, width:{size:1800,type:WidthType.DXA}, shading:{fill:LIGHT,type:ShadingType.CLEAR},
      margins:{top:80,bottom:80,left:120,right:120},
      children:[new Paragraph({children:[new TextRun({text:label,bold:true,size:19,font:"Arial",color:MID})]})] }),
    new TableCell({ borders, width:{size:6900,type:WidthType.DXA}, margins:{top:80,bottom:80,left:120,right:120},
      children:[new Paragraph({children:[new TextRun({text:value||"— not generated —",size:20,font:"Arial",color:value?DARK:"BBBBBB"})]})] }),
    new TableCell({ borders, width:{size:660,type:WidthType.DXA}, shading:{fill:LIGHT,type:ShadingType.CLEAR},
      margins:{top:80,bottom:80,left:80,right:80},
      children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:bytes?`${bytes}B`:"",size:17,font:"Courier New",color:bytes>249?RED:bytes>0?GREEN:MID})]})] }),
  ]});

export async function buildDocxBuffer(rows: any[], brand: string, today: string): Promise<Buffer> {
  const children: any[] = [];

  children.push(gap(240));
  children.push(new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:80},
    children:[new TextRun({text:"1o8 Marketplace SEO",size:52,bold:true,font:"Arial",color:ORANGE})] }));
  children.push(new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:80},
    children:[new TextRun({text:"OUT_SEO — Amazon Listing Content Optimization",size:30,font:"Arial",color:MID})] }));
  children.push(new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:360},
    children:[new TextRun({text:`${brand}  ·  ${rows.length} ASINs  ·  ${today}`,size:22,font:"Arial",color:MID})] }));
  children.push(new Paragraph({
    border:{bottom:{style:BorderStyle.SINGLE,size:10,color:ORANGE,space:1}},
    children:[new TextRun("")], spacing:{after:480},
  }));

  for (const r of rows) {
    const attrs = [r.flavor,r.style,r.color,r.size].filter(Boolean).join("  ·  ");
    children.push(...asinHeader(r.asin, r.product, r.parentage, attrs));

    children.push(headingP("B1 — Title", 2));
    children.push(bodyP(r.title||"— not generated —", r.title?DARK:"BBBBBB"));
    children.push(metaP("Characters", `${r.titleC} / 200`, r.titleC>200||(r.titleC>0&&r.titleC<190)));
    children.push(gap(200));

    children.push(headingP("B2 — Bullet Points", 2));
    children.push(bodyP("Detailed  (390–400 chars)", MID, 19));
    children.push(bTable([bRow(1,"DBP1",r.d1,r.d1c,390,400),bRow(2,"DBP2",r.d2,r.d2c,390,400),bRow(3,"DBP3",r.d3,r.d3c,390,400),bRow(4,"DBP4",r.d4,r.d4c,390,400),bRow(5,"DBP5",r.d5,r.d5c,390,400)]));
    children.push(gap(100));
    children.push(bodyP("Concise  (190–200 chars)", MID, 19));
    children.push(bTable([bRow(1,"CBP1",r.c1,r.c1c,190,200),bRow(2,"CBP2",r.c2,r.c2c,190,200),bRow(3,"CBP3",r.c3,r.c3c,190,200),bRow(4,"CBP4",r.c4,r.c4c,190,200),bRow(5,"CBP5",r.c5,r.c5c,190,200)]));
    children.push(gap(100));
    children.push(bodyP("Content  (90–100 chars)", MID, 19));
    children.push(bTable([bRow(1,"ContBP1",r.ct1,r.ct1c,90,100),bRow(2,"ContBP2",r.ct2,r.ct2c,90,100),bRow(3,"ContBP3",r.ct3,r.ct3c,90,100),bRow(4,"ContBP4",r.ct4,r.ct4c,90,100),bRow(5,"ContBP5",r.ct5,r.ct5c,90,100)]));
    children.push(gap(100));
    children.push(bodyP("Key Features  (40–50 chars)", MID, 19));
    children.push(bTable([bRow(1,"KFBP1",r.kf1,r.kf1c,40,50),bRow(2,"KFBP2",r.kf2,r.kf2c,40,50),bRow(3,"KFBP3",r.kf3,r.kf3c,40,50),bRow(4,"KFBP4",r.kf4,r.kf4c,40,50),bRow(5,"KFBP5",r.kf5,r.kf5c,40,50)]));
    children.push(gap(200));

    children.push(headingP("B3 — Product Description", 2));
    children.push(bodyP(r.desc||"— not generated —", r.desc?DARK:"BBBBBB"));
    children.push(metaP("Characters", `${r.descC} / 1200`, r.descC>1200||(r.descC>0&&r.descC<1000)));
    children.push(gap(200));

    children.push(headingP("B4 — Backend Search Terms", 2));
    children.push(new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[1800,6900,660], rows:[
      beRow("Core",r.bkCore,r.bkCoreB), beRow("Supplement",r.bkSupp,r.bkSuppB),
      beRow("Symptom",r.bkSymp,r.bkSympB), beRow("Audience",r.bkAud,r.bkAudB),
      beRow("Long Tail",r.bkLong,r.bkLongB),
    ]}));
    children.push(gap(400));
  }

  const footerPara = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text:`${brand}  ·  1o8 Marketplace SEO  ·  Page `, size:16, font:"Arial", color:"AAAAAA" }),
      new TextRun({ children:[PageNumber.CURRENT], size:16, font:"Arial", color:"AAAAAA" }),
      new TextRun({ text:" of ", size:16, font:"Arial", color:"AAAAAA" }),
      new TextRun({ children:[PageNumber.TOTAL_PAGES], size:16, font:"Arial", color:"AAAAAA" }),
    ],
  });

  const doc = new Document({
    styles: { default: { document: { run: { font:"Arial", size:22, color:DARK } } } },
    sections: [{
      properties: { page: { size:{width:12240,height:15840}, margin:{top:1080,right:1080,bottom:1080,left:1080} } },
      footers: { default: new Footer({ children:[footerPara] }) },
      children,
    }],
  });

  return await Packer.toBuffer(doc) as Buffer;
}
