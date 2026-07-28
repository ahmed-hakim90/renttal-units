import fs from "node:fs/promises";

const OUT = "/Users/hakimo/Developer/renttal-units/Rental-Units-System-Presentation.html";
const SHOTS = "/Users/hakimo/Developer/renttal-units/.codex-output/rental-presentation/actual-screens";

async function img(name) {
  const bytes = await fs.readFile(`${SHOTS}/${name}.png`);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

const slides = [
  {
    title: "وحدات الإيجار",
    subtitle: "عرض تسليم يوضح شاشات النظام الفعلية وكل إجراء يستخدمه فريق الشركة يومياً.",
    image: "dashboard",
    actions: ["لوحة التحكم", "المواقع", "الوحدات", "العقود", "الفواتير", "المدفوعات", "التقارير", "الصلاحيات"],
  },
  {
    title: "لوحة التحكم",
    subtitle: "الشاشة اللي يبدأ منها فريق الشركة متابعة التحصيل اليومي.",
    image: "dashboard",
    actions: ["عرض المستحق الآن", "متابعة الفواتير المنتظرة", "معرفة المدفوع جزئياً", "فتح الفواتير المدفوعة", "البحث عن وحدة أو فاتورة"],
  },
  {
    title: "شاشة المواقع",
    subtitle: "إدارة مواقع العقارات وربط كل موقع بالوحدات التابعة له.",
    image: "locations",
    actions: ["إضافة موقع", "تعديل بيانات الموقع", "حذف الموقع إذا ما عليه وحدات", "عرض عدد الوحدات", "البحث والتصفية"],
  },
  {
    title: "شاشة الوحدات",
    subtitle: "إدارة كل وحدة إيجارية وحالتها وبيانات الإيجار الخاصة بها.",
    image: "units",
    actions: ["إضافة وحدة", "تعديل وحدة", "تغيير الحالة", "ربط الوحدة بالموقع", "متابعة المستأجر والعقد", "استيراد العقود من Excel"],
  },
  {
    title: "شاشة العقود",
    subtitle: "إنشاء العقد وربطه بالوحدة والمستأجر وجدول الدفعات.",
    image: "contracts",
    actions: ["إنشاء عقد", "تعديل عقد", "إلغاء عقد", "إضافة بيانات المستأجر", "تحديد مدة العقد", "اختيار نظام الدفع", "معاينة جدول الفواتير"],
  },
  {
    title: "شاشة مستحق الآن",
    subtitle: "كل المستحقات القديمة ومستحقات هذا الشهر في شاشة واحدة.",
    image: "due",
    actions: ["مراجعة المستحقات", "إصدار فاتورة", "مزامنة الفواتير المستحقة", "عرض التأخير بالأيام", "فتح تفاصيل الوحدة أو الفاتورة"],
  },
  {
    title: "شاشة الفواتير",
    subtitle: "متابعة الفواتير الصادرة وحالتها ومبالغها.",
    image: "invoices",
    actions: ["إصدار فاتورة", "تسجيل دفعة", "متابعة المتبقي", "معرفة حالة الفاتورة", "تصفية حسب الحالة", "فتح الفاتورة المرتبطة بالوحدة"],
  },
  {
    title: "مدفوعات جزئية",
    subtitle: "متابعة الفواتير اللي تم دفع جزء منها ولسه عليها رصيد.",
    image: "partial",
    actions: ["عرض الرصيد المتبقي", "تسجيل دفعة جديدة", "متابعة تاريخ الاستحقاق", "فتح تفاصيل الفاتورة", "مراجعة الوحدة والمستأجر"],
  },
  {
    title: "مدفوع بالكامل",
    subtitle: "قائمة الفواتير المكتملة والمدفوعة بالكامل.",
    image: "fully-paid",
    actions: ["مراجعة الفواتير المكتملة", "عرض المدفوع", "فتح تفاصيل الفاتورة", "مراجعة الوحدة والمستأجر", "استخدامها للمطابقة"],
  },
  {
    title: "شاشة المدفوعات",
    subtitle: "سجل التحصيل بالكامل مع الفلاتر والتصدير.",
    image: "payments",
    actions: ["تسجيل دفعة", "اختيار دفع كامل أو جزئي", "تحديد طريقة الدفع", "إضافة رقم مرجع", "تصفية بالتاريخ أو الطريقة", "تصدير Excel"],
  },
  {
    title: "تقرير تقادم الديون",
    subtitle: "تقرير يوضح المستحقات حسب مدة التأخير.",
    image: "debt-aging",
    actions: ["عرض إجمالي المستحق", "تقسيم التأخير حسب الأيام", "تصفية حسب الموقع", "تصفية حسب الحالة", "تصدير Excel"],
  },
  {
    title: "كشف الموقع",
    subtitle: "ملخص الوحدات والعقود والأرصدة لموقع محدد.",
    image: "location-statement",
    actions: ["اختيار الموقع", "عرض الوحدات", "متابعة العقود النشطة", "عرض المدفوع والمتبقي", "تصدير الكشف"],
  },
  {
    title: "شاشة الاستيراد",
    subtitle: "رفع ملفات Excel لتسريع إدخال الوحدات والعقود.",
    image: "import",
    actions: ["تحميل النموذج", "رفع ملف Excel", "استيراد الوحدات", "استيراد العقود", "عرض الأخطاء", "مراجعة عدد السجلات الناجحة"],
  },
  {
    title: "المستخدمون والصلاحيات",
    subtitle: "إدارة من يقدر يعدل ومن يقدر يشاهد فقط.",
    image: "users",
    actions: ["إنشاء مستخدم", "تحديث الصلاحية", "تعيين مدير / محرر", "تعيين مشاهد", "مراجعة بريد المستخدم", "عرض تاريخ الإنشاء"],
  },
  {
    title: "الإعدادات",
    subtitle: "تعديل بيانات الشركة وشروط الدفع الافتراضية.",
    image: "settings",
    actions: ["تعديل اسم الشركة", "تحديد العملة", "تحديث شروط الدفع", "تحديد فترة السماح", "حفظ الإعدادات"],
  },
];

for (const slide of slides) {
  slide.src = await img(slide.image);
}

const body = slides.map((s, i) => `
  <section class="slide ${i === 0 ? "active" : ""}">
    <div class="frame">
      <div class="copy">
        <h1>${s.title}</h1>
        <p>${s.subtitle}</p>
        <h2>الأكشنز في الشاشة</h2>
        <div class="actions">${s.actions.map((a) => `<span>${a}</span>`).join("")}</div>
      </div>
      <div class="shot-wrap">
        <img src="${s.src}" alt="${s.title}" />
      </div>
      <footer>وحدات الإيجار | ${i + 1}</footer>
    </div>
  </section>
`).join("");

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>وحدات الإيجار | عرض الشاشات الفعلية</title>
  <style>
    :root{--bg:#f8fafc;--ink:#0f172a;--muted:#64748b;--blue:#2563eb;--line:#dbe3ef;--white:#fff}
    *{box-sizing:border-box}
    body{margin:0;background:#e5e7eb;color:var(--ink);font-family:Arial,Tahoma,sans-serif;overflow:hidden}
    .deck{width:100vw;height:100vh;display:grid;place-items:center;padding:20px}
    .slide{width:min(1280px,calc(100vw - 40px));aspect-ratio:16/9;background:var(--bg);box-shadow:0 24px 80px rgba(15,23,42,.22);display:none;overflow:hidden}
    .slide.active{display:block}
    .frame{position:relative;width:100%;height:100%;padding:36px 48px}
    .copy{position:absolute;right:48px;top:36px;width:365px;bottom:76px}
    h1{margin:0;font-size:38px;line-height:1.18;font-weight:900;letter-spacing:0}
    p{margin:12px 0 0;color:var(--muted);font-size:18px;line-height:1.55}
    h2{margin:32px 0 14px;font-size:23px}
    .actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .actions span{min-height:46px;border:1px solid var(--line);background:#fff;border-radius:12px;padding:9px 10px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:15px;font-weight:800;line-height:1.25;box-shadow:0 8px 22px rgba(15,23,42,.05)}
    .shot-wrap{position:absolute;left:48px;top:36px;width:790px;height:610px;background:white;border:1px solid #dbe3ef;border-radius:18px;box-shadow:0 18px 55px rgba(15,23,42,.14);overflow:hidden}
    .shot-wrap img{width:100%;height:100%;object-fit:contain;background:#fff;display:block}
    footer{position:absolute;left:48px;bottom:28px;color:#64748b;font-size:15px}
    .controls{position:fixed;left:24px;right:24px;bottom:16px;display:flex;align-items:center;justify-content:center;gap:12px;direction:ltr;pointer-events:none}
    button{pointer-events:auto;border:0;background:#0f172a;color:white;width:44px;height:44px;border-radius:999px;font-size:22px;cursor:pointer;box-shadow:0 10px 28px rgba(15,23,42,.25)}
    .counter{pointer-events:auto;min-width:86px;height:38px;border-radius:999px;display:grid;place-items:center;background:rgba(255,255,255,.94);color:#334155;font-weight:800;border:1px solid #dbe3ef}
    @media(max-width:850px){
      body{overflow:auto}.deck{height:auto;min-height:100vh;padding:10px}.slide{width:calc(100vw - 20px);height:auto;aspect-ratio:auto}.frame{position:relative;height:auto;padding:22px}.copy{position:relative;right:auto;top:auto;width:auto;bottom:auto}.shot-wrap{position:relative;left:auto;top:auto;width:100%;height:auto;margin-top:22px}.shot-wrap img{height:auto}.actions{grid-template-columns:1fr}h1{font-size:28px}p{font-size:15px}footer{position:relative;left:auto;bottom:auto;margin-top:16px}
    }
  </style>
</head>
<body>
<main class="deck">${body}</main>
<div class="controls"><button id="prevBtn" type="button">‹</button><div class="counter"><span id="currentCount">1</span>/<span id="totalCount">${slides.length}</span></div><button id="nextBtn" type="button">›</button></div>
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
