import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT = "/Users/hakimo/Developer/renttal-units/Rental-Units-System-Presentation.pptx";
const TMP = "/Users/hakimo/Developer/renttal-units/.codex-output/rental-presentation";
const ASSETS = `${TMP}/assets`;

async function writeBlob(path, blob) {
  await fs.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
}

async function image(name) {
  const bytes = await fs.readFile(`${ASSETS}/${name}.jpg`);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

const colors = {
  bg: "#F8FAFC",
  ink: "#0F172A",
  muted: "#64748B",
  blue: "#2563EB",
  green: "#16A34A",
  amber: "#D97706",
  line: "#CBD5E1",
  white: "#FFFFFF",
  dark: "#0B1220",
};

function addText(slide, text, position, style = {}) {
  const s = slide.shapes.add({
    geometry: "textbox",
    position,
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  s.text = text;
  s.text.style = {
    fontFace: "Arial",
    fontSize: 20,
    color: colors.ink,
    alignment: "right",
    ...style,
  };
  return s;
}

function addBox(slide, position, fill = colors.white, lineFill = colors.line) {
  return slide.shapes.add({
    geometry: "roundRect",
    position,
    fill,
    line: { style: "solid", fill: lineFill, width: 1 },
    borderRadius: 12,
    shadow: "shadow-sm",
  });
}

function addCallout(slide, text, boxPos, anchorPos, opts = {}) {
  const anchor = slide.shapes.add({
    geometry: "ellipse",
    position: anchorPos,
    fill: opts.dotFill || colors.blue,
    line: { style: "solid", fill: colors.white, width: 2 },
  });
  const box = addBox(slide, boxPos, opts.fill || colors.white, opts.line || colors.blue);
  const arrow = slide.shapes.connect(anchor, box, {
    kind: "elbow",
    line: { style: "solid", fill: opts.line || colors.blue, width: 2 },
    head: { type: "arrow", width: "med", length: "med" },
  });
  arrow.sendToBack?.();
  addText(slide, text, {
    left: boxPos.left + 16,
    top: boxPos.top + 14,
    width: boxPos.width - 32,
    height: boxPos.height - 28,
  }, { fontSize: opts.fontSize || 18, bold: opts.bold ?? true, color: opts.color || colors.ink });
  return { anchor, box, arrow };
}

function addHeader(slide, title, subtitle) {
  addText(slide, title, { left: 70, top: 42, width: 1040, height: 52 }, { fontSize: 38, bold: true });
  if (subtitle) addText(slide, subtitle, { left: 70, top: 96, width: 1040, height: 34 }, { fontSize: 20, color: colors.muted });
}

function addFooter(slide, n) {
  addText(slide, `وحدات الإيجار | ${n}`, { left: 70, top: 670, width: 180, height: 24 }, { fontSize: 16, color: colors.muted, alignment: "left" });
}

function notes(slide, lines) {
  slide.speakerNotes.textFrame.setText([
    ...lines,
    "",
    "[Sources]",
    "README.md: Tech stack, setup commands, architecture, locales, roles, and pages.",
    "package.json: Next.js, Supabase, next-intl, Sentry, Tailwind, scripts.",
    "supabase/migrations/20250606000001_initial_schema.sql: tables, RLS policies, roles, invoices, payments, audit logs.",
    "src/lib/services/payment-service.ts and src/lib/services/invoice-service.ts: payment validation, invoice status flow, audit logging.",
  ]);
}

function addMiniFlow(slide, y = 238) {
  const labels = ["المتصفح", "Server Actions", "Services", "Repositories", "Supabase"];
  const x = [900, 690, 480, 270, 80];
  const nodes = labels.map((label, i) => {
    const node = addBox(slide, { left: x[i], top: y, width: 170, height: 84 }, i === 0 ? "#DBEAFE" : colors.white, i === 4 ? "#16A34A" : colors.line);
    addText(slide, label, { left: x[i] + 14, top: y + 24, width: 142, height: 32 }, { fontSize: 20, bold: true, alignment: "center" });
    return node;
  });
  for (let i = 0; i < nodes.length - 1; i++) {
    slide.shapes.connect(nodes[i], nodes[i + 1], {
      kind: "straight",
      fromSide: "left",
      toSide: "right",
      line: { style: "solid", fill: colors.blue, width: 2 },
      head: { type: "arrow", width: "med", length: "med" },
    });
  }
}

{
  const s = deck.slides.add();
  s.background.fill = colors.bg;
  addText(s, "وحدات الإيجار", { left: 110, top: 92, width: 980, height: 70 }, { fontSize: 58, bold: true });
  addText(s, "عرض سريع يشرح كيف نأسس النظام، نشغله، وكيف تمشي دورة العمل من الوحدة إلى التحصيل والتقارير.", { left: 110, top: 184, width: 860, height: 95 }, { fontSize: 26, color: colors.muted });
  const imgBytes = await image("dashboard");
  s.images.add({ dataUrl: imgBytes, alt: "صورة لوحة التحكم", fit: "cover", position: { left: 90, top: 318, width: 820, height: 320 }, geometry: "roundRect", borderRadius: 18 });
  addBox(s, { left: 850, top: 350, width: 300, height: 160 }, "#DBEAFE", "#93C5FD");
  addText(s, "الفكرة ببساطة: مكان واحد يشوف الوحدات، العقود، الفواتير، والتحصيل بدون ملفات متفرقة.", { left: 875, top: 382, width: 250, height: 92 }, { fontSize: 24, bold: true });
  addFooter(s, 1);
  notes(s, ["غلاف العرض. الصورة التوضيحية مبنية على شاشات النظام وأسماء القوائم من ملفات الترجمة العربية."]);
}

{
  const s = deck.slides.add();
  s.background.fill = colors.bg;
  addHeader(s, "وش يسوي النظام؟", "يرتب دورة الإيجارات اليومية من أول تسجيل الوحدة إلى متابعة الدفعات.");
  const items = [
    ["المواقع والوحدات", "تعرف كل موقع ووحدة وحالتها: مشغولة، شاغرة، أو صيانة."],
    ["العقود", "تسجل بيانات العقد، مدة الإيجار، المستأجر، ودورة الدفع."],
    ["الفواتير والتحصيل", "تصدر الفاتورة، تسجل السداد، وتحدث الحالة تلقائياً."],
    ["التقارير", "تشوف تقادم الديون وكشف الموقع وسجل المدفوعات."],
  ];
  items.forEach((it, i) => {
    const x = i % 2 === 0 ? 710 : 130;
    const y = i < 2 ? 178 : 392;
    addBox(s, { left: x, top: y, width: 430, height: 150 }, colors.white, i === 0 ? colors.blue : colors.line);
    addText(s, it[0], { left: x + 24, top: y + 24, width: 360, height: 32 }, { fontSize: 26, bold: true, color: i === 0 ? colors.blue : colors.ink });
    addText(s, it[1], { left: x + 24, top: y + 70, width: 360, height: 58 }, { fontSize: 18, color: colors.muted });
  });
  addFooter(s, 2);
  notes(s, ["ملخص نطاق النظام حسب README وصفحات التنقل العربية."]);
}

{
  const s = deck.slides.add();
  s.background.fill = colors.bg;
  addHeader(s, "التأسيس يبدأ من أربع خطوات", "إذا هذي الأشياء جاهزة، النظام يقوم معك بدون تعقيد.");
  s.images.add({ dataUrl: await image("setup"), alt: "شاشة أوامر تشغيل النظام", fit: "cover", position: { left: 78, top: 150, width: 760, height: 420 }, geometry: "roundRect", borderRadius: 18 });
  addCallout(s, "ثبت الحزم أولاً: npm install", { left: 800, top: 160, width: 330, height: 76 }, { left: 430, top: 232, width: 20, height: 20 });
  addCallout(s, "انسخ env وحط مفاتيح Supabase", { left: 790, top: 280, width: 340, height: 86 }, { left: 438, top: 278, width: 20, height: 20 }, { line: colors.amber, dotFill: colors.amber });
  addCallout(s, "ادفع migrations عشان الجداول والسياسات تتطبق", { left: 790, top: 415, width: 340, height: 96 }, { left: 428, top: 374, width: 20, height: 20 }, { line: colors.green, dotFill: colors.green });
  addFooter(s, 3);
  notes(s, ["خطوات التأسيس مأخوذة من README: npm install, .env.local, supabase link/db push, npm run dev."]);
}

{
  const s = deck.slides.add();
  s.background.fill = colors.bg;
  addHeader(s, "بعد التشغيل تدخل من رابط عربي", "الرابط الأساسي للتجربة: http://localhost:3000/ar/dashboard");
  s.images.add({ dataUrl: await image("real-login"), alt: "شاشة تسجيل الدخول الحقيقية", fit: "cover", position: { left: 88, top: 150, width: 640, height: 420 }, geometry: "roundRect", borderRadius: 18 });
  addCallout(s, "كل مستخدم يدخل بحسابه من Supabase Auth", { left: 760, top: 178, width: 360, height: 90 }, { left: 420, top: 280, width: 20, height: 20 });
  addCallout(s, "الصلاحيات تحدد اللي يقدر يعدل واللي يشوف فقط", { left: 760, top: 330, width: 360, height: 102 }, { left: 420, top: 455, width: 20, height: 20 }, { line: colors.amber, dotFill: colors.amber });
  addText(s, "ملاحظة تشغيلية: أول مستخدم غالباً يبدأ Viewer، وبعدها نرقّيه من profiles إلى admin_editor.", { left: 750, top: 494, width: 385, height: 72 }, { fontSize: 19, color: colors.muted });
  addFooter(s, 4);
  notes(s, ["لقطة شاشة حقيقية من التطبيق المحلي. صلاحيات admin_editor/viewer مأخوذة من README وسياسات RLS في migration."]);
}

{
  const s = deck.slides.add();
  s.background.fill = colors.bg;
  addHeader(s, "كيف يمشي الطلب داخل النظام؟", "الواجهة ما تكلم قاعدة البيانات مباشرة؛ فيه طبقات واضحة تحفظ المنطق والصلاحيات.");
  addMiniFlow(s, 245);
  addText(s, "المستخدم يضغط إجراء في الواجهة، Server Action يستقبل الطلب، Service يتحقق من الصلاحيات والبيانات، Repository ينفذ الاستعلام، و Supabase يطبق RLS ويحفظ السجل.", { left: 160, top: 400, width: 960, height: 98 }, { fontSize: 24, color: colors.muted, alignment: "center" });
  addBox(s, { left: 240, top: 535, width: 800, height: 70 }, "#EFF6FF", "#93C5FD");
  addText(s, "النتيجة: تشغيل مرتب، أخطاء أقل، وسهولة في التتبع عن طريق correlation id و audit logs.", { left: 275, top: 556, width: 730, height: 34 }, { fontSize: 22, bold: true, color: colors.blue, alignment: "center" });
  addFooter(s, 5);
  notes(s, ["البنية مأخوذة من README: UI → Server Actions → Services → Repositories → Supabase، مع دعم observability و audit logs من ملفات الخدمات."]);
}

{
  const s = deck.slides.add();
  s.background.fill = colors.bg;
  addHeader(s, "رحلة العقد إلى الفاتورة واضحة", "كل عقد يطلع مستحقات حسب دورة الدفع، وكل دفعة تحدث حالة الفاتورة.");
  s.images.add({ dataUrl: await image("contracts"), alt: "صورة شاشة العقود والفواتير", fit: "cover", position: { left: 80, top: 150, width: 760, height: 420 }, geometry: "roundRect", borderRadius: 18 });
  addCallout(s, "دورة الدفع تحدد مبلغ الفترة: شهري، ربع سنوي، نصف سنوي، أو سنوي", { left: 770, top: 160, width: 370, height: 104 }, { left: 532, top: 274, width: 20, height: 20 });
  addCallout(s, "حالة الفاتورة تتغير حسب المدفوع: صادرة، جزئية، كاملة، أو متأخرة", { left: 760, top: 330, width: 380, height: 110 }, { left: 230, top: 500, width: 20, height: 20 }, { line: colors.green, dotFill: colors.green });
  addFooter(s, 6);
  notes(s, ["منطق الفاتورة والدفع مأخوذ من invoice-service.ts و payment-service.ts، وشاشة العقود من صفحات ومكونات contracts."]);
}

{
  const s = deck.slides.add();
  s.background.fill = colors.bg;
  addHeader(s, "لوحة التحكم تختصر المتابعة اليومية", "بدل ما تدور في الجداول، المؤشرات تقول لك وين تبدأ يومك.");
  s.images.add({ dataUrl: await image("dashboard"), alt: "صورة لوحة التحكم", fit: "cover", position: { left: 84, top: 148, width: 770, height: 430 }, geometry: "roundRect", borderRadius: 18 });
  addCallout(s, "الأرقام العليا تعطيك وضع التحصيل فوراً", { left: 765, top: 162, width: 360, height: 86 }, { left: 600, top: 250, width: 20, height: 20 });
  addCallout(s, "البحث السريع يساعدك تلقى وحدة أو فاتورة بدون تنقل كثير", { left: 760, top: 300, width: 370, height: 98 }, { left: 190, top: 172, width: 20, height: 20 }, { line: colors.amber, dotFill: colors.amber });
  addCallout(s, "القوائم تفصل العمل: وحدات، عقود، دفعات، تقارير، وصلاحيات", { left: 760, top: 460, width: 370, height: 94 }, { left: 720, top: 405, width: 20, height: 20 }, { line: colors.green, dotFill: colors.green });
  addFooter(s, 7);
  notes(s, ["مؤشرات لوحة التحكم مأخوذة من dashboard messages و getDashboardCounts في invoice-service.ts."]);
}

{
  const s = deck.slides.add();
  s.background.fill = colors.bg;
  addHeader(s, "التشغيل اليومي: بسيط وممسوك", "هذه هي الدائرة اللي تمشي عليها الإدارة بعد التأسيس.");
  const steps = [
    ["1", "أضف المواقع والوحدات"],
    ["2", "سجل العقد والمستأجر"],
    ["3", "أصدر الفواتير المستحقة"],
    ["4", "سجل الدفعات"],
    ["5", "راجع التقارير والصلاحيات"],
  ];
  steps.forEach((st, i) => {
    const x = 900 - i * 205;
    const box = addBox(s, { left: x, top: 235, width: 170, height: 112 }, colors.white, i === 0 ? colors.blue : colors.line);
    addText(s, st[0], { left: x + 112, top: 252, width: 36, height: 36 }, { fontSize: 28, bold: true, color: colors.blue, alignment: "center" });
    addText(s, st[1], { left: x + 18, top: 292, width: 132, height: 42 }, { fontSize: 18, bold: true, alignment: "center" });
    if (i < steps.length - 1) {
      const next = addBox(s, { left: x - 70, top: 278, width: 24, height: 24 }, "#DBEAFE", "#DBEAFE");
      slideConnectSilent(s, box, next);
    }
  });
  addBox(s, { left: 170, top: 465, width: 940, height: 88 }, "#ECFDF5", "#86EFAC");
  addText(s, "النظام جاهز للتشغيل لما تكون البيئة مضبوطة، المستخدمين مترقين، والجداول مطبقة في Supabase.", { left: 205, top: 492, width: 870, height: 36 }, { fontSize: 24, bold: true, color: "#166534", alignment: "center" });
  addFooter(s, 8);
  notes(s, ["خاتمة عملية تلخص التشغيل اليومي حسب صفحات النظام وصلاحياته."]);
}

function slideConnectSilent(slide, from, to) {
  slide.shapes.connect(from, to, {
    kind: "straight",
    fromSide: "left",
    toSide: "right",
    line: { style: "solid", fill: colors.blue, width: 2 },
    head: { type: "arrow", width: "med", length: "med" },
  });
}

await fs.mkdir(`${TMP}/rendered`, { recursive: true });
for (const [index, slide] of deck.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, "0")}`;
  await writeBlob(`${TMP}/rendered/${stem}.png`, await deck.export({ slide, format: "png", scale: 1 }));
  await fs.writeFile(`${TMP}/rendered/${stem}.layout.json`, await (await slide.export({ format: "layout" })).text());
}
await writeBlob(`${TMP}/rendered/montage.webp`, await deck.export({ format: "webp", montage: true, scale: 1 }));
const pptx = await PresentationFile.exportPptx(deck);
await pptx.save(OUT);
console.log(OUT);
