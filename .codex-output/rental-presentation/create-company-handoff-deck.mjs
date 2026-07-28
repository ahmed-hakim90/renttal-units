import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT = "/Users/hakimo/Developer/renttal-units/Rental-Units-System-Presentation.pptx";
const TMP = "/Users/hakimo/Developer/renttal-units/.codex-output/rental-presentation/company-deck";

const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

const C = {
  bg: "#F8FAFC",
  ink: "#0F172A",
  muted: "#64748B",
  blue: "#2563EB",
  green: "#16A34A",
  amber: "#D97706",
  white: "#FFFFFF",
  line: "#DBE3EF",
  blueSoft: "#DBEAFE",
  greenSoft: "#DCFCE7",
  amberSoft: "#FEF3C7",
};

const screens = [
  {
    title: "وحدات الإيجار",
    subtitle: "عرض تسليم يوضح شاشات النظام وكل إجراء يستخدمه فريق الشركة يومياً.",
    screen: "dashboard",
    actions: ["لوحة التحكم", "المواقع", "الوحدات", "العقود", "الفواتير", "المدفوعات", "التقارير", "الصلاحيات"],
  },
  {
    title: "لوحة التحكم",
    subtitle: "الشاشة اللي تبدأ منها المتابعة اليومية.",
    screen: "dashboard",
    actions: ["عرض المستحق الآن", "متابعة الفواتير المنتظرة", "معرفة المدفوع جزئياً", "فتح الفواتير المدفوعة", "البحث عن وحدة أو فاتورة"],
  },
  {
    title: "شاشة المواقع",
    subtitle: "تنظيم العقارات حسب الموقع والمدينة والمنطقة.",
    screen: "locations",
    actions: ["إضافة موقع", "تعديل بيانات الموقع", "حذف الموقع إذا ما عليه وحدات", "عرض عدد الوحدات", "البحث والتصفية"],
  },
  {
    title: "شاشة الوحدات",
    subtitle: "إدارة كل وحدة إيجارية وحالتها وتفاصيلها.",
    screen: "units",
    actions: ["إضافة وحدة", "تعديل وحدة", "تغيير الحالة", "ربط الوحدة بالموقع", "متابعة المستأجر والعقد", "استيراد العقود من Excel"],
  },
  {
    title: "شاشة العقود",
    subtitle: "إنشاء العقد وربطه بالوحدة والمستأجر وجدول الدفعات.",
    screen: "contracts",
    actions: ["إنشاء عقد", "تعديل عقد", "إلغاء عقد", "إضافة بيانات المستأجر", "تحديد مدة العقد", "اختيار نظام الدفع", "معاينة جدول الفواتير"],
  },
  {
    title: "شاشة مستحق الآن",
    subtitle: "كل المستحقات القديمة ومستحقات هذا الشهر في مكان واحد.",
    screen: "due",
    actions: ["مراجعة المستحقات", "إصدار فاتورة", "مزامنة الفواتير المستحقة", "عرض التأخير بالأيام", "فتح تفاصيل الوحدة أو الفاتورة"],
  },
  {
    title: "شاشة الفواتير",
    subtitle: "متابعة الفواتير الصادرة وحالتها ومبالغها.",
    screen: "invoices",
    actions: ["إصدار فاتورة", "تسجيل دفعة", "متابعة المتبقي", "معرفة حالة الفاتورة", "تصفية حسب الحالة", "فتح الفاتورة المرتبطة بالوحدة"],
  },
  {
    title: "شاشة المدفوعات",
    subtitle: "سجل التحصيل بالكامل مع الفلاتر والتصدير.",
    screen: "payments",
    actions: ["تسجيل دفعة", "اختيار دفع كامل أو جزئي", "تحديد طريقة الدفع", "إضافة رقم مرجع", "تصفية بالتاريخ أو الطريقة", "تصدير Excel"],
  },
  {
    title: "شاشة التقارير",
    subtitle: "تقارير جاهزة لمتابعة الذمم وكشف الموقع.",
    screen: "reports",
    actions: ["تقرير تقادم الذمم", "كشف حساب الموقع", "تصفية حسب الموقع", "تصفية حسب الحالة", "تصدير Excel", "عرض الإجماليات"],
  },
  {
    title: "شاشة الاستيراد",
    subtitle: "تسريع إدخال البيانات من ملفات Excel.",
    screen: "import",
    actions: ["تحميل النموذج", "رفع ملف Excel", "استيراد الوحدات", "استيراد العقود", "عرض الأخطاء", "مراجعة عدد السجلات الناجحة"],
  },
  {
    title: "المستخدمون والصلاحيات",
    subtitle: "تحديد من يقدر يعدل ومن يقدر يشاهد فقط.",
    screen: "users",
    actions: ["إنشاء مستخدم", "تحديث الصلاحية", "تعيين مدير / محرر", "تعيين مشاهد", "مراجعة بريد المستخدم", "عرض تاريخ الإنشاء"],
  },
  {
    title: "طريقة العمل اليومية",
    subtitle: "هذه هي دورة الاستخدام المقترحة لفريق الشركة.",
    screen: "workflow",
    actions: ["أضف الموقع", "أضف الوحدات", "أنشئ العقد", "راجع المستحق", "أصدر الفاتورة", "سجل الدفعة", "راجع التقرير"],
  },
];

function addText(slide, text, pos, style = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: pos,
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    fontFace: "Arial",
    fontSize: 18,
    color: C.ink,
    alignment: "right",
    ...style,
  };
  return shape;
}

function box(slide, pos, fill = C.white, line = C.line, radius = 12) {
  return slide.shapes.add({
    geometry: "roundRect",
    position: pos,
    fill,
    line: { style: "solid", fill: line, width: 1 },
    borderRadius: radius,
    shadow: "shadow-sm",
  });
}

function rows(kind) {
  const map = {
    dashboard: [["مستحق الآن", "18", C.amber], ["في انتظار الدفع", "42", C.blue], ["مدفوع جزئياً", "9", C.amber], ["مدفوع بالكامل", "128", C.green]],
    locations: [["الرياض - العليا", "12 وحدة", C.blue], ["جدة - السلامة", "8 وحدات", C.green], ["الدمام - الشاطئ", "6 وحدات", C.amber]],
    units: [["A-101", "مشغول", C.green], ["A-102", "شاغر", C.blue], ["B-204", "صيانة", C.amber]],
    contracts: [["CON-2026-017", "نشط", C.green], ["CON-2026-018", "منتهٍ", C.amber], ["CON-2026-019", "ملغي", C.blue]],
    due: [["INV-DUE-041", "متأخر 12 يوم", C.amber], ["INV-DUE-042", "مستحق هذا الشهر", C.blue], ["INV-DUE-043", "مستحق قديم", C.amber]],
    invoices: [["INV-1042", "في انتظار الدفع", C.blue], ["INV-1043", "مدفوع جزئياً", C.amber], ["INV-1044", "مدفوع بالكامل", C.green]],
    payments: [["تحويل بنكي", "4,500 ر.س", C.green], ["نقدي", "2,800 ر.س", C.blue], ["شيك", "6,200 ر.س", C.amber]],
    reports: [["إجمالي المستحق", "86,000 ر.س", C.amber], ["عدد الفواتير", "54", C.blue], ["إجمالي المدفوع", "310,000 ر.س", C.green]],
    import: [["ملف الوحدات", "تم الاستيراد", C.green], ["ملف العقود", "3 أخطاء", C.amber], ["النموذج", "جاهز للتحميل", C.blue]],
    users: [["مدير / محرر", "وصول كامل", C.blue], ["مشاهد", "عرض فقط", C.green], ["مستخدم جديد", "كلمة مرور مؤقتة", C.amber]],
  };
  return map[kind] || map.dashboard;
}

function navItems(active) {
  return ["لوحة التحكم", "المواقع", "الوحدات", "العقود", "مستحق الآن", "الفواتير", "المدفوعات", "التقارير", "الاستيراد", "المستخدمون"].map((x) => ({ label: x, active: x === active }));
}

function activeLabel(kind) {
  return {
    dashboard: "لوحة التحكم", locations: "المواقع", units: "الوحدات", contracts: "العقود", due: "مستحق الآن",
    invoices: "الفواتير", payments: "المدفوعات", reports: "التقارير", import: "الاستيراد", users: "المستخدمون",
  }[kind] || "لوحة التحكم";
}

function buttonLabel(kind) {
  return {
    locations: "إضافة موقع", units: "إضافة وحدة", contracts: "إنشاء عقد", due: "إصدار فاتورة", invoices: "تسجيل دفعة",
    payments: "تسجيل دفعة", reports: "تصدير Excel", import: "رفع ملف", users: "إنشاء مستخدم",
  }[kind] || "عرض التفاصيل";
}

function drawMock(slide, kind, x, y, w, h) {
  if (kind === "workflow") {
    const labels = ["المواقع", "الوحدات", "العقود", "المستحق", "الفاتورة", "الدفعة", "التقرير"];
    const gap = 10;
    const stepW = (w - gap * 6) / 7;
    labels.forEach((label, i) => {
      const sx = x + w - (i + 1) * stepW - i * gap;
      box(slide, { left: sx, top: y + 150, width: stepW, height: 120 }, C.white, "#BFDBFE");
      addText(slide, String(i + 1), { left: sx + 12, top: y + 170, width: stepW - 24, height: 30 }, { fontSize: 26, bold: true, color: C.blue, alignment: "center" });
      addText(slide, label, { left: sx + 10, top: y + 215, width: stepW - 20, height: 34 }, { fontSize: 16, bold: true, alignment: "center" });
    });
    return;
  }

  box(slide, { left: x, top: y, width: w, height: h }, C.white, "#E2E8F0", 16);
  const sideW = 155;
  slide.shapes.add({ geometry: "rect", position: { left: x + w - sideW, top: y, width: sideW, height: h }, fill: C.white, line: { style: "solid", fill: "#E5E7EB", width: 1 } });
  box(slide, { left: x + w - sideW + 14, top: y + 18, width: 30, height: 30 }, C.blue, C.blue, 9);
  addText(slide, "م", { left: x + w - sideW + 14, top: y + 23, width: 30, height: 20 }, { fontSize: 14, bold: true, color: C.white, alignment: "center" });
  addText(slide, "وحدات الإيجار", { left: x + w - sideW + 50, top: y + 20, width: 88, height: 24 }, { fontSize: 13, bold: true });
  const active = activeLabel(kind);
  navItems(active).forEach((item, i) => {
    const top = y + 70 + i * 30;
    if (item.active) box(slide, { left: x + w - sideW + 12, top, width: sideW - 24, height: 24 }, C.blueSoft, C.blueSoft, 8);
    addText(slide, item.label, { left: x + w - sideW + 22, top: top + 4, width: sideW - 44, height: 16 }, { fontSize: 11, bold: item.active, color: item.active ? "#1D4ED8" : C.muted });
  });

  const mainX = x + 22;
  const mainW = w - sideW - 44;
  addText(slide, active, { left: mainX, top: y + 26, width: 260, height: 32 }, { fontSize: 25, bold: true });
  addText(slide, "متابعة وإدارة البيانات اليومية", { left: mainX, top: y + 60, width: 260, height: 20 }, { fontSize: 13, color: C.muted });
  box(slide, { left: mainX + mainW - 115, top: y + 28, width: 110, height: 34 }, C.blue, C.blue, 9);
  addText(slide, buttonLabel(kind), { left: mainX + mainW - 110, top: y + 37, width: 100, height: 16 }, { fontSize: 12, bold: true, color: C.white, alignment: "center" });
  box(slide, { left: mainX, top: y + 100, width: mainW, height: 34 }, C.white, "#E2E8F0", 9);
  addText(slide, "بحث أو تصفية...", { left: mainX + 12, top: y + 108, width: mainW - 24, height: 16 }, { fontSize: 12, color: "#94A3B8" });

  const data = rows(kind);
  const cardW = (mainW - 20) / 3;
  data.slice(0, 3).forEach((r, i) => {
    const cx = mainX + i * (cardW + 10);
    box(slide, { left: cx, top: y + 150, width: cardW, height: 72 }, C.white, "#E2E8F0", 11);
    addText(slide, r[0], { left: cx + 10, top: y + 163, width: cardW - 20, height: 16 }, { fontSize: 11, color: C.muted });
    addText(slide, r[1], { left: cx + 10, top: y + 185, width: cardW - 20, height: 24 }, { fontSize: 20, bold: true, color: r[2] });
  });

  box(slide, { left: mainX, top: y + 246, width: mainW, height: 145 }, C.white, "#E2E8F0", 11);
  slide.shapes.add({ geometry: "rect", position: { left: mainX, top: y + 246, width: mainW, height: 34 }, fill: "#F1F5F9", line: { style: "solid", fill: "#F1F5F9", width: 0 } });
  addText(slide, "العنصر", { left: mainX + mainW - 150, top: y + 255, width: 110, height: 16 }, { fontSize: 11, bold: true, color: C.muted });
  addText(slide, "التفاصيل", { left: mainX + mainW - 300, top: y + 255, width: 110, height: 16 }, { fontSize: 11, bold: true, color: C.muted });
  addText(slide, "الحالة", { left: mainX + 30, top: y + 255, width: 110, height: 16 }, { fontSize: 11, bold: true, color: C.muted });
  data.forEach((r, i) => {
    const ry = y + 285 + i * 34;
    addText(slide, r[0], { left: mainX + mainW - 160, top: ry, width: 120, height: 16 }, { fontSize: 11 });
    addText(slide, r[1], { left: mainX + mainW - 305, top: ry, width: 120, height: 16 }, { fontSize: 11 });
    box(slide, { left: mainX + 24, top: ry - 3, width: 88, height: 22 }, r[2] === C.green ? C.greenSoft : r[2] === C.amber ? C.amberSoft : C.blueSoft, r[2] === C.green ? C.greenSoft : r[2] === C.amber ? C.amberSoft : C.blueSoft, 10);
    addText(slide, i === 0 ? "إجراء متاح" : "متابعة", { left: mainX + 29, top: ry + 2, width: 78, height: 12 }, { fontSize: 9, bold: true, color: r[2], alignment: "center" });
  });
}

function drawActions(slide, items) {
  addText(slide, "الأكشنز في الشاشة", { left: 735, top: 170, width: 400, height: 32 }, { fontSize: 25, bold: true });
  const x0 = 735;
  const y0 = 215;
  const w = 185;
  const h = 48;
  items.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = x0 + (1 - col) * (w + 14);
    const y = y0 + row * (h + 12);
    box(slide, { left: x, top: y, width: w, height: h }, C.white, "#E2E8F0", 11);
    addText(slide, item, { left: x + 10, top: y + 13, width: w - 20, height: 22 }, { fontSize: 15, bold: true, alignment: "center" });
  });
}

function notes(slide) {
  slide.speakerNotes.textFrame.setText([
    "عرض تسليم غير تقني يشرح الشاشات والإجراءات اليومية.",
    "",
    "[Sources]",
    "src/messages/ar/*.json: أسماء الشاشات والأزرار والحالات المستخدمة في واجهة النظام.",
    "README.md: نطاق النظام العام وصفحات التشغيل.",
  ]);
}

for (const [i, item] of screens.entries()) {
  const slide = deck.slides.add();
  slide.background.fill = C.bg;
  addText(slide, item.title, { left: 70, top: 45, width: 1050, height: 54 }, { fontSize: i === 0 ? 52 : 39, bold: true });
  addText(slide, item.subtitle, { left: 70, top: i === 0 ? 118 : 98, width: 1050, height: 34 }, { fontSize: 20, color: C.muted });
  drawMock(slide, item.screen, 70, 150, 620, 430);
  drawActions(slide, item.actions);
  addText(slide, `وحدات الإيجار | ${i + 1}`, { left: 70, top: 670, width: 180, height: 22 }, { fontSize: 15, color: C.muted, alignment: "left" });
  notes(slide);
}

await fs.mkdir(TMP, { recursive: true });
for (const [index, slide] of deck.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, "0")}`;
  const png = await deck.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(`${TMP}/${stem}.png`, new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(`${TMP}/${stem}.layout.json`, await layout.text());
}
const pptx = await PresentationFile.exportPptx(deck);
await pptx.save(OUT);
console.log(OUT);
