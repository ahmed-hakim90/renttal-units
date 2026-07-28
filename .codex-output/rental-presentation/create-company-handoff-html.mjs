import fs from "node:fs/promises";

const OUT = "/Users/hakimo/Developer/renttal-units/Rental-Units-System-Presentation.html";

const slides = [
  {
    title: "وحدات الإيجار",
    subtitle: "عرض تسليم يوضح شاشات النظام وكل إجراء يستخدمه فريق الشركة يومياً.",
    screen: "dashboard",
    callouts: [
      ["نظرة عامة على المحفظة من أول شاشة", "blue", 95, 318],
      ["كل قسم واضح من القائمة الجانبية", "green", 95, 445],
    ],
  },
  {
    title: "لوحة التحكم",
    subtitle: "الشاشة اللي تبدأ منها المتابعة اليومية.",
    screen: "dashboard",
    actions: ["عرض المستحق الآن", "متابعة الفواتير المنتظرة", "معرفة المدفوع جزئياً", "فتح الفواتير المدفوعة", "البحث عن وحدة أو فاتورة"],
    callouts: [
      ["الأرقام العليا تقول لك وضع التحصيل فوراً", "blue", 90, 164],
      ["البحث السريع يوصل لأي وحدة أو فاتورة", "amber", 90, 302],
    ],
  },
  {
    title: "شاشة المواقع",
    subtitle: "تنظيم العقارات حسب الموقع والمدينة والمنطقة.",
    screen: "locations",
    actions: ["إضافة موقع", "تعديل بيانات الموقع", "حذف الموقع إذا ما عليه وحدات", "عرض عدد الوحدات داخل كل موقع", "البحث والتصفية"],
    callouts: [
      ["كل موقع له اسم عربي وإنجليزي وعنوان", "blue", 90, 178],
      ["عدد الوحدات يوضح حجم كل موقع", "green", 90, 338],
    ],
  },
  {
    title: "شاشة الوحدات",
    subtitle: "إدارة كل وحدة إيجارية وحالتها وتفاصيلها.",
    screen: "units",
    actions: ["إضافة وحدة", "تعديل وحدة", "تغيير الحالة", "ربط الوحدة بالموقع", "متابعة المستأجر والعقد", "استيراد العقود من Excel"],
    callouts: [
      ["بيانات الوحدة: الرقم، الدور، المساحة، الإيجار", "blue", 90, 168],
      ["الحالة توضح هل الوحدة مشغولة أو شاغرة أو صيانة", "amber", 90, 348],
    ],
  },
  {
    title: "شاشة العقود",
    subtitle: "إنشاء العقد وربطه بالوحدة والمستأجر وجدول الدفعات.",
    screen: "contracts",
    actions: ["إنشاء عقد", "تعديل عقد", "إلغاء عقد", "إضافة بيانات المستأجر", "تحديد مدة العقد", "اختيار نظام الدفع", "معاينة جدول الفواتير"],
    callouts: [
      ["العقد يحدد الوحدة، المستأجر، المدة، وقيمة العقد", "blue", 90, 170],
      ["جدول الدفعات يوضح الفترات والمبالغ قبل الاعتماد", "green", 90, 382],
    ],
  },
  {
    title: "شاشة مستحق الآن",
    subtitle: "كل المستحقات القديمة ومستحقات هذا الشهر في مكان واحد.",
    screen: "due",
    actions: ["مراجعة المستحقات", "إصدار فاتورة", "مزامنة الفواتير المستحقة", "عرض التأخير بالأيام", "فتح تفاصيل الوحدة أو الفاتورة"],
    callouts: [
      ["تعرف فوراً مين عليه مستحق", "blue", 90, 182],
      ["زر إصدار الفاتورة يحول المستحق إلى فاتورة رسمية", "amber", 90, 360],
    ],
  },
  {
    title: "شاشة الفواتير",
    subtitle: "متابعة الفواتير الصادرة وحالتها ومبالغها.",
    screen: "invoices",
    actions: ["إصدار فاتورة", "تسجيل دفعة", "متابعة المتبقي", "معرفة حالة الفاتورة", "تصفية حسب الحالة", "فتح الفاتورة المرتبطة بالوحدة"],
    callouts: [
      ["كل فاتورة تعرض المبلغ والمدفوع والمتبقي", "blue", 90, 174],
      ["الحالة تتغير حسب السداد: منتظرة، جزئية، مكتملة", "green", 90, 356],
    ],
  },
  {
    title: "شاشة المدفوعات",
    subtitle: "سجل التحصيل بالكامل مع الفلاتر والتصدير.",
    screen: "payments",
    actions: ["تسجيل دفعة", "اختيار دفع كامل أو جزئي", "تحديد طريقة الدفع", "إضافة رقم مرجع", "تصفية بالتاريخ أو الطريقة", "تصدير Excel"],
    callouts: [
      ["تسجيل الدفعة يحدث رصيد الفاتورة تلقائياً", "blue", 90, 166],
      ["الفلاتر والتصدير تساعد المحاسبة في المراجعة", "amber", 90, 352],
    ],
  },
  {
    title: "شاشة التقارير",
    subtitle: "تقارير جاهزة لمتابعة الذمم وكشف الموقع.",
    screen: "reports",
    actions: ["تقرير تقادم الذمم", "كشف حساب الموقع", "تصفية حسب الموقع", "تصفية حسب الحالة", "تصدير Excel", "عرض الإجماليات"],
    callouts: [
      ["تقادم الذمم يوضح المتأخر حسب الأيام", "blue", 90, 174],
      ["كشف الموقع يجمع الوحدات والعقود والأرصدة", "green", 90, 360],
    ],
  },
  {
    title: "شاشة الاستيراد",
    subtitle: "تسريع إدخال البيانات من ملفات Excel.",
    screen: "import",
    actions: ["تحميل النموذج", "رفع ملف Excel", "استيراد الوحدات", "استيراد العقود", "عرض الأخطاء", "مراجعة عدد السجلات الناجحة"],
    callouts: [
      ["النموذج يساعد الفريق يدخل البيانات بنفس الترتيب", "blue", 90, 178],
      ["نتيجة الاستيراد توضح الناجح والأخطاء", "amber", 90, 356],
    ],
  },
  {
    title: "المستخدمون والصلاحيات",
    subtitle: "تحديد من يقدر يعدل ومن يقدر يشاهد فقط.",
    screen: "users",
    actions: ["إنشاء مستخدم", "تحديث الصلاحية", "تعيين مدير / محرر", "تعيين مشاهد", "مراجعة بريد المستخدم", "عرض تاريخ الإنشاء"],
    callouts: [
      ["المدير يقدر ينشئ ويعدل ويحذف", "blue", 90, 178],
      ["المشاهد يدخل للقراءة والمتابعة فقط", "green", 90, 356],
    ],
  },
  {
    title: "طريقة العمل اليومية",
    subtitle: "هذه هي دورة الاستخدام المقترحة لفريق الشركة.",
    screen: "workflow",
    actions: ["أضف الموقع", "أضف الوحدات", "أنشئ العقد", "راجع المستحق", "أصدر الفاتورة", "سجل الدفعة", "راجع التقرير"],
    callouts: [
      ["الدورة تمشي من بيانات العقار إلى التحصيل", "blue", 90, 182],
      ["كل خطوة لها شاشة وأكشن واضح", "green", 90, 358],
    ],
  },
];

function nav(active) {
  const items = ["لوحة التحكم", "المواقع", "الوحدات", "العقود", "مستحق الآن", "الفواتير", "المدفوعات", "التقارير", "الاستيراد", "المستخدمون"];
  return items.map((item) => `<div class="${item === active ? "on" : ""}">${item}</div>`).join("");
}

function rows(kind) {
  const map = {
    dashboard: [
      ["مستحق الآن", "18", "amber"], ["في انتظار الدفع", "42", "blue"], ["مدفوع جزئياً", "9", "amber"], ["مدفوع بالكامل", "128", "green"],
    ],
    locations: [["الرياض - العليا", "12 وحدة", "blue"], ["جدة - السلامة", "8 وحدات", "green"], ["الدمام - الشاطئ", "6 وحدات", "amber"]],
    units: [["A-101", "مشغول", "green"], ["A-102", "شاغر", "blue"], ["B-204", "صيانة", "amber"]],
    contracts: [["CON-2026-017", "نشط", "green"], ["CON-2026-018", "منتهٍ", "amber"], ["CON-2026-019", "ملغي", "blue"]],
    due: [["INV-DUE-041", "متأخر 12 يوم", "amber"], ["INV-DUE-042", "مستحق هذا الشهر", "blue"], ["INV-DUE-043", "مستحق قديم", "amber"]],
    invoices: [["INV-1042", "في انتظار الدفع", "blue"], ["INV-1043", "مدفوع جزئياً", "amber"], ["INV-1044", "مدفوع بالكامل", "green"]],
    payments: [["تحويل بنكي", "4,500 ر.س", "green"], ["نقدي", "2,800 ر.س", "blue"], ["شيك", "6,200 ر.س", "amber"]],
    reports: [["إجمالي المستحق", "86,000 ر.س", "amber"], ["عدد الفواتير", "54", "blue"], ["إجمالي المدفوع", "310,000 ر.س", "green"]],
    import: [["ملف الوحدات", "تم الاستيراد", "green"], ["ملف العقود", "3 أخطاء", "amber"], ["النموذج", "جاهز للتحميل", "blue"]],
    users: [["مدير / محرر", "وصول كامل", "blue"], ["مشاهد", "عرض فقط", "green"], ["مستخدم جديد", "كلمة مرور مؤقتة", "amber"]],
  };
  return map[kind] || [];
}

function mockScreen(kind) {
  if (kind === "workflow") {
    return `<div class="workflow">${["المواقع", "الوحدات", "العقود", "المستحق", "الفاتورة", "الدفعة", "التقرير"].map((x, i) => `<div class="flow-step"><b>${i + 1}</b><span>${x}</span></div>`).join("")}</div>`;
  }
  const active = {
    dashboard: "لوحة التحكم", locations: "المواقع", units: "الوحدات", contracts: "العقود", due: "مستحق الآن",
    invoices: "الفواتير", payments: "المدفوعات", reports: "التقارير", import: "الاستيراد", users: "المستخدمون",
  }[kind] || "لوحة التحكم";
  const title = {
    dashboard: "لوحة التحكم", locations: "المواقع", units: "الوحدات", contracts: "العقود", due: "مستحق الآن",
    invoices: "الفواتير", payments: "المدفوعات", reports: "التقارير", import: "استيراد البيانات", users: "المستخدمون والصلاحيات",
  }[kind];
  const button = {
    locations: "إضافة موقع", units: "إضافة وحدة", contracts: "إنشاء عقد", due: "إصدار فاتورة", invoices: "تسجيل دفعة",
    payments: "تسجيل دفعة", reports: "تصدير Excel", import: "رفع ملف", users: "إنشاء مستخدم",
  }[kind] || "عرض التفاصيل";
  return `<div class="mock">
    <aside><div class="brand"><span>م</span><b>وحدات الإيجار</b></div><nav>${nav(active)}</nav></aside>
    <section class="mock-main">
      <div class="mock-head"><div><h3>${title}</h3><p>متابعة وإدارة البيانات اليومية</p></div><button>${button}</button></div>
      <div class="search">بحث أو تصفية...</div>
      <div class="stats">${rows(kind).map((r) => `<div class="stat"><small>${r[0]}</small><b class="${r[2]}">${r[1]}</b></div>`).join("")}</div>
      <div class="table">
        <div class="tr th"><span>العنصر</span><span>التفاصيل</span><span>الحالة</span></div>
        ${rows(kind).map((r, i) => `<div class="tr"><span>${r[0]}</span><span>${r[1]}</span><span class="badge ${r[2]}">${i === 0 ? "إجراء متاح" : "متابعة"}</span></div>`).join("")}
      </div>
    </section>
  </div>`;
}

function actions(items = []) {
  return `<div class="actions">${items.map((x) => `<div>${x}</div>`).join("")}</div>`;
}

function callouts(items = []) {
  return items.map(([text, color, left, top], i) => `
    <span class="pin ${color}" style="left:${left + 390}px;top:${top + (i ? 18 : 0)}px"></span>
    <div class="note ${color}" style="left:${left}px;top:${top}px">${text}</div>
  `).join("");
}

const body = slides.map((slide, index) => `
  <section class="slide ${index === 0 ? "active" : ""}">
    <div class="content">
      <header><h1>${slide.title}</h1><p>${slide.subtitle}</p></header>
      <div class="screen-wrap">${mockScreen(slide.screen)}</div>
      ${slide.actions ? `<h2>الأكشنز في الشاشة</h2>${actions(slide.actions)}` : ""}
      ${callouts(slide.callouts)}
      <footer>وحدات الإيجار | ${index + 1}</footer>
    </div>
  </section>
`).join("");

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>وحدات الإيجار | عرض تسليم الشركة</title>
  <style>
    :root{--bg:#f8fafc;--ink:#0f172a;--muted:#64748b;--blue:#2563eb;--green:#16a34a;--amber:#d97706;--line:#dbe3ef;--white:#fff}
    *{box-sizing:border-box} body{margin:0;background:#e5e7eb;color:var(--ink);font-family:Arial,Tahoma,sans-serif;overflow:hidden}.deck{width:100vw;height:100vh;display:grid;place-items:center;padding:22px}
    .slide{position:relative;width:min(1280px,calc(100vw - 44px));aspect-ratio:16/9;background:var(--bg);box-shadow:0 24px 80px rgba(15,23,42,.22);overflow:hidden;display:none}.slide.active{display:block}.content{position:absolute;inset:0;padding:38px 56px}
    header{text-align:right;margin-right:520px;min-height:108px}h1{margin:0;font-size:42px;line-height:1.15;font-weight:900;letter-spacing:0}header p{margin:10px 0 0;color:var(--muted);font-size:20px;line-height:1.5}h2{position:absolute;right:70px;top:166px;margin:0;font-size:24px}
    .screen-wrap{position:absolute;right:520px;top:145px;width:690px;height:455px}.mock{position:absolute;inset:0;background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 18px 50px rgba(15,23,42,.12);overflow:hidden}aside{position:absolute;right:0;top:0;width:160px;height:100%;border-left:1px solid #e5e7eb;padding:16px 12px}.brand{display:flex;gap:8px;align-items:center;font-size:14px;margin-bottom:18px}.brand span{width:30px;height:30px;border-radius:10px;background:#2563eb;color:#fff;display:grid;place-items:center;font-weight:900}nav div{font-size:12px;color:#64748b;border-radius:9px;padding:8px 10px;margin:4px 0}.on{background:#dbeafe;color:#1d4ed8!important;font-weight:800}.mock-main{position:absolute;right:160px;left:0;top:0;bottom:0;padding:22px}.mock-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.mock-head h3{font-size:25px;margin:0}.mock-head p{font-size:13px;color:#64748b;margin:6px 0 0}.mock-head button{border:0;background:#2563eb;color:white;border-radius:10px;padding:10px 14px;font-weight:800}.search{height:34px;border:1px solid #e2e8f0;border-radius:10px;color:#94a3b8;display:flex;align-items:center;padding:0 12px;margin-top:18px;font-size:13px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.stat{border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fff}.stat small{display:block;color:#64748b;font-size:12px}.stat b{display:block;font-size:20px;margin-top:6px}.blue{color:#2563eb}.green{color:#16a34a}.amber{color:#d97706}.table{margin-top:14px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}.tr{display:grid;grid-template-columns:1.3fr 1fr 1fr;min-height:38px;align-items:center;padding:0 12px;border-top:1px solid #eef2f7;font-size:12px}.th{border-top:0;background:#f1f5f9;color:#475569;font-weight:800}.badge{width:max-content;border-radius:999px;padding:5px 9px;background:#eff6ff;font-weight:800}.badge.green{background:#dcfce7}.badge.amber{background:#fef3c7}.workflow{position:absolute;inset:0;display:grid;grid-template-columns:repeat(7,1fr);gap:10px;align-items:center}.flow-step{height:120px;background:white;border:1px solid #bfdbfe;border-radius:16px;display:grid;place-items:center;text-align:center;padding:10px;box-shadow:0 12px 30px rgba(15,23,42,.08)}.flow-step b{font-size:26px;color:#2563eb}.flow-step span{font-weight:800}
    .actions{position:absolute;right:70px;top:210px;width:385px;display:grid;grid-template-columns:1fr 1fr;gap:10px}.actions div{background:white;border:1px solid #e2e8f0;border-radius:12px;min-height:48px;display:flex;align-items:center;justify-content:center;text-align:center;padding:8px;font-size:16px;font-weight:800;box-shadow:0 8px 22px rgba(15,23,42,.05)}
    .note{position:absolute;width:360px;border:2px solid var(--blue);background:rgba(255,255,255,.96);border-radius:14px;padding:15px 18px;font-size:18px;line-height:1.45;font-weight:900;box-shadow:0 14px 34px rgba(15,23,42,.08);z-index:3}.note.green{border-color:#16a34a}.note.amber{border-color:#d97706}.pin{position:absolute;width:18px;height:18px;border-radius:50%;border:3px solid white;background:#2563eb;z-index:4}.pin.green{background:#16a34a}.pin.amber{background:#d97706}footer{position:absolute;left:56px;bottom:30px;color:#64748b;font-size:15px}
    .controls{position:fixed;left:24px;right:24px;bottom:18px;display:flex;align-items:center;justify-content:center;gap:12px;direction:ltr;pointer-events:none}button.ctrl{pointer-events:auto;border:0;background:#0f172a;color:white;width:44px;height:44px;border-radius:999px;font-size:22px;cursor:pointer;box-shadow:0 10px 28px rgba(15,23,42,.25)}.counter{pointer-events:auto;min-width:82px;height:38px;border-radius:999px;display:grid;place-items:center;background:rgba(255,255,255,.94);color:#334155;font-weight:800;border:1px solid #dbe3ef}
    @media(max-width:760px){body{overflow:auto}.deck{height:auto;min-height:100vh;padding:10px}.slide{width:calc(100vw - 20px)}.content{padding:22px}header{margin-right:0}.screen-wrap{right:22px;left:22px;top:150px;width:auto;height:300px}.actions{right:22px;left:22px;top:470px;width:auto}.note,.pin{display:none}h1{font-size:28px}header p{font-size:15px}h2{right:22px;top:430px}.actions div{font-size:12px}}
  </style>
</head>
<body>
<main class="deck">${body}</main>
<div class="controls"><button class="ctrl" id="prevBtn" type="button">‹</button><div class="counter"><span id="currentCount">1</span>/<span id="totalCount">${slides.length}</span></div><button class="ctrl" id="nextBtn" type="button">›</button></div>
<script>
  const slides=[...document.querySelectorAll('.slide')];
  let index=0;
  const currentCount=document.getElementById('currentCount');
  function showSlide(n){slides[index].classList.remove('active');index=(n+slides.length)%slides.length;slides[index].classList.add('active');currentCount.textContent=String(index+1)}
  document.getElementById('prevBtn').addEventListener('click',()=>showSlide(index-1));
  document.getElementById('nextBtn').addEventListener('click',()=>showSlide(index+1));
  window.addEventListener('keydown',e=>{if(['ArrowLeft','PageDown',' '].includes(e.key)){e.preventDefault();showSlide(index+1)}if(['ArrowRight','PageUp'].includes(e.key)){e.preventDefault();showSlide(index-1)}if(e.key==='Home'){showSlide(0)}if(e.key==='End'){showSlide(slides.length-1)}});
</script>
</body>
</html>`;

await fs.writeFile(OUT, html);
console.log(OUT);
