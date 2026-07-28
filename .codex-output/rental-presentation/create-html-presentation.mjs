import fs from "node:fs/promises";

const ROOT = "/Users/hakimo/Developer/renttal-units";
const ASSETS = `${ROOT}/.codex-output/rental-presentation/assets`;
const OUT = `${ROOT}/Rental-Units-System-Presentation.html`;

async function dataUrl(name) {
  const bytes = await fs.readFile(`${ASSETS}/${name}.jpg`);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

const img = {
  dashboard: await dataUrl("dashboard"),
  contracts: await dataUrl("contracts"),
  setup: await dataUrl("setup"),
  login: await dataUrl("real-login"),
};

const html = String.raw`<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>وحدات الإيجار | عرض النظام</title>
  <style>
    :root {
      --bg: #f8fafc;
      --ink: #0f172a;
      --muted: #64748b;
      --blue: #2563eb;
      --green: #16a34a;
      --amber: #d97706;
      --line: #cbd5e1;
      --white: #fff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #e5e7eb;
      color: var(--ink);
      font-family: Arial, Tahoma, sans-serif;
      overflow: hidden;
    }
    .deck {
      width: 100vw;
      height: 100vh;
      display: grid;
      place-items: center;
      padding: 22px;
    }
    .slide {
      position: relative;
      width: min(1280px, calc(100vw - 44px));
      aspect-ratio: 16 / 9;
      background: var(--bg);
      overflow: hidden;
      box-shadow: 0 24px 80px rgba(15, 23, 42, .22);
      display: none;
    }
    .slide.active { display: block; }
    .content { position: absolute; inset: 0; padding: 52px 70px; }
    h1, h2, p { margin: 0; }
    h1 { font-size: clamp(42px, 4.4vw, 58px); line-height: 1.18; font-weight: 850; letter-spacing: 0; }
    h2 { font-size: clamp(30px, 3vw, 40px); line-height: 1.2; font-weight: 850; letter-spacing: 0; }
    .subtitle { margin-top: 14px; color: var(--muted); font-size: clamp(18px, 1.7vw, 25px); line-height: 1.55; max-width: 880px; }
    .screen {
      position: absolute;
      border-radius: 18px;
      box-shadow: 0 22px 60px rgba(15, 23, 42, .13);
      border: 1px solid #e2e8f0;
      object-fit: cover;
      background: white;
    }
    .note {
      position: absolute;
      border: 2px solid var(--blue);
      background: rgba(255,255,255,.96);
      border-radius: 14px;
      padding: 18px 22px;
      font-size: clamp(17px, 1.35vw, 22px);
      line-height: 1.45;
      font-weight: 800;
      box-shadow: 0 14px 38px rgba(15,23,42,.08);
    }
    .note.amber { border-color: var(--amber); }
    .note.green { border-color: var(--green); }
    .pin {
      position: absolute;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--blue);
      border: 3px solid white;
      box-shadow: 0 8px 22px rgba(15,23,42,.18);
    }
    .pin.amber { background: var(--amber); }
    .pin.green { background: var(--green); }
    .line {
      position: absolute;
      height: 2px;
      background: var(--blue);
      transform-origin: right center;
    }
    .line.amber { background: var(--amber); }
    .line.green { background: var(--green); }
    .cards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 28px;
      margin-top: 58px;
      max-width: 980px;
    }
    .card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 30px 32px;
      min-height: 142px;
      box-shadow: 0 12px 32px rgba(15,23,42,.05);
    }
    .card strong { display: block; color: var(--blue); font-size: 26px; margin-bottom: 12px; }
    .card span { display: block; color: var(--muted); font-size: 19px; line-height: 1.55; }
    .flow {
      display: flex;
      flex-direction: row-reverse;
      align-items: center;
      justify-content: center;
      gap: 20px;
      margin-top: 96px;
    }
    .node {
      width: 178px;
      min-height: 88px;
      display: grid;
      place-items: center;
      text-align: center;
      background: white;
      border: 1px solid var(--line);
      border-radius: 16px;
      font-size: 21px;
      font-weight: 850;
      padding: 12px;
    }
    .arrow { color: var(--blue); font-size: 34px; font-weight: 900; }
    .steps {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 18px;
      margin-top: 90px;
    }
    .step {
      background: white;
      border: 1px solid #bfdbfe;
      border-radius: 16px;
      padding: 22px 18px;
      min-height: 118px;
      text-align: center;
      box-shadow: 0 12px 32px rgba(15,23,42,.05);
    }
    .num { color: var(--blue); font-size: 30px; font-weight: 900; margin-bottom: 12px; }
    .step div:last-child { font-size: 19px; font-weight: 800; line-height: 1.35; }
    .footer {
      position: absolute;
      left: 70px;
      bottom: 34px;
      color: #64748b;
      font-size: 16px;
    }
    .controls {
      position: fixed;
      left: 24px;
      right: 24px;
      bottom: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      direction: ltr;
      pointer-events: none;
    }
    button {
      pointer-events: auto;
      border: 0;
      background: #0f172a;
      color: white;
      width: 44px;
      height: 44px;
      border-radius: 999px;
      font-size: 22px;
      cursor: pointer;
      box-shadow: 0 10px 28px rgba(15,23,42,.25);
    }
    .counter {
      pointer-events: auto;
      min-width: 78px;
      height: 38px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      background: rgba(255,255,255,.92);
      color: #334155;
      font-weight: 800;
      border: 1px solid #dbe3ef;
    }
    @media (max-width: 760px) {
      body { overflow: auto; }
      .deck { height: auto; min-height: 100vh; padding: 10px; }
      .slide { width: calc(100vw - 20px); }
      .content { padding: 28px 28px; }
      .cards, .steps { gap: 10px; }
      .note { font-size: 11px; padding: 8px 10px; border-radius: 8px; }
      .footer { left: 28px; bottom: 18px; font-size: 11px; }
      .controls { bottom: 8px; }
    }
  </style>
</head>
<body>
  <main class="deck" aria-label="عرض وحدات الإيجار">
    <section class="slide active">
      <div class="content">
        <h1>وحدات الإيجار</h1>
        <p class="subtitle">عرض سريع يشرح كيف نأسس النظام، نشغله، وكيف تمشي دورة العمل من الوحدة إلى التحصيل والتقارير.</p>
        <img class="screen" src="${img.dashboard}" alt="صورة لوحة التحكم" style="right:70px;bottom:74px;width:66%;height:45%;" />
        <div class="note" style="left:96px;top:322px;width:300px;">مكان واحد يشوف الوحدات، العقود، الفواتير، والتحصيل بدون ملفات متفرقة.</div>
        <div class="footer">وحدات الإيجار | 1</div>
      </div>
    </section>

    <section class="slide">
      <div class="content">
        <h2>وش يسوي النظام؟</h2>
        <p class="subtitle">يرتب دورة الإيجارات اليومية من أول تسجيل الوحدة إلى متابعة الدفعات.</p>
        <div class="cards">
          <div class="card"><strong>المواقع والوحدات</strong><span>تعرف كل موقع ووحدة وحالتها: مشغولة، شاغرة، أو صيانة.</span></div>
          <div class="card"><strong>العقود</strong><span>تسجل بيانات العقد، مدة الإيجار، المستأجر، ودورة الدفع.</span></div>
          <div class="card"><strong>الفواتير والتحصيل</strong><span>تصدر الفاتورة، تسجل السداد، وتحدث الحالة تلقائياً.</span></div>
          <div class="card"><strong>التقارير</strong><span>تشوف تقادم الديون وكشف الموقع وسجل المدفوعات.</span></div>
        </div>
        <div class="footer">وحدات الإيجار | 2</div>
      </div>
    </section>

    <section class="slide">
      <div class="content">
        <h2>التأسيس يبدأ من أربع خطوات</h2>
        <p class="subtitle">إذا هذي الأشياء جاهزة، النظام يقوم معك بدون تعقيد.</p>
        <img class="screen" src="${img.setup}" alt="شاشة أوامر تشغيل النظام" style="right:70px;top:150px;width:62%;height:58%;" />
        <span class="pin" style="right:455px;top:250px;"></span>
        <div class="line" style="right:465px;top:260px;width:260px;"></div>
        <div class="note" style="left:90px;top:166px;width:330px;">ثبت الحزم أولاً: npm install</div>
        <span class="pin amber" style="right:455px;top:305px;"></span>
        <div class="line amber" style="right:465px;top:315px;width:250px;"></div>
        <div class="note amber" style="left:90px;top:292px;width:340px;">انسخ env وحط مفاتيح Supabase</div>
        <span class="pin green" style="right:455px;top:405px;"></span>
        <div class="line green" style="right:465px;top:415px;width:250px;"></div>
        <div class="note green" style="left:90px;top:430px;width:350px;">ادفع migrations عشان الجداول والسياسات تتطبق</div>
        <div class="footer">وحدات الإيجار | 3</div>
      </div>
    </section>

    <section class="slide">
      <div class="content">
        <h2>بعد التشغيل تدخل من رابط عربي</h2>
        <p class="subtitle">الرابط الأساسي للتجربة: http://localhost:3000/ar/dashboard</p>
        <img class="screen" src="${img.login}" alt="شاشة تسجيل الدخول" style="right:86px;top:150px;width:52%;height:58%;" />
        <span class="pin" style="right:470px;top:300px;"></span>
        <div class="line" style="right:480px;top:310px;width:235px;"></div>
        <div class="note" style="left:96px;top:178px;width:360px;">كل مستخدم يدخل بحسابه من Supabase Auth</div>
        <span class="pin amber" style="right:470px;top:470px;"></span>
        <div class="line amber" style="right:480px;top:480px;width:235px;"></div>
        <div class="note amber" style="left:96px;top:346px;width:360px;">الصلاحيات تحدد اللي يقدر يعدل واللي يشوف فقط</div>
        <p class="subtitle" style="position:absolute;left:96px;top:510px;width:390px;font-size:19px;">أول مستخدم غالباً يبدأ Viewer، وبعدها نرقّيه من profiles إلى admin_editor.</p>
        <div class="footer">وحدات الإيجار | 4</div>
      </div>
    </section>

    <section class="slide">
      <div class="content">
        <h2>كيف يمشي الطلب داخل النظام؟</h2>
        <p class="subtitle">الواجهة ما تكلم قاعدة البيانات مباشرة؛ فيه طبقات واضحة تحفظ المنطق والصلاحيات.</p>
        <div class="flow">
          <div class="node" style="background:#dbeafe;">المتصفح</div><div class="arrow">←</div>
          <div class="node">Server Actions</div><div class="arrow">←</div>
          <div class="node">Services</div><div class="arrow">←</div>
          <div class="node">Repositories</div><div class="arrow">←</div>
          <div class="node" style="border-color:#16a34a;">Supabase</div>
        </div>
        <p class="subtitle" style="max-width:960px;text-align:center;margin:72px auto 0;">المستخدم يضغط إجراء في الواجهة، Service يتحقق من الصلاحيات والبيانات، Repository ينفذ الاستعلام، و Supabase يطبق RLS ويحفظ السجل.</p>
        <div class="note" style="right:240px;left:240px;bottom:106px;text-align:center;color:var(--blue);background:#eff6ff;">النتيجة: تشغيل مرتب، أخطاء أقل، وسهولة في التتبع عن طريق correlation id و audit logs.</div>
        <div class="footer">وحدات الإيجار | 5</div>
      </div>
    </section>

    <section class="slide">
      <div class="content">
        <h2>واضحة الفاتورة إلى العقد رحلة</h2>
        <p class="subtitle">الفاتورة حالتها تتحدث دفعة ورا دفعة، والدفع دوره حسب مستحقات كل عقد.</p>
        <img class="screen" src="${img.contracts}" alt="شاشة العقود والفواتير" style="right:70px;top:150px;width:62%;height:58%;" />
        <span class="pin" style="right:470px;top:320px;"></span>
        <div class="line" style="right:480px;top:330px;width:250px;"></div>
        <div class="note" style="left:94px;top:178px;width:385px;">دورة الدفع تحدد مبلغ الفترة: شهري، ربع سنوي، نصف سنوي، أو سنوي</div>
        <span class="pin green" style="right:235px;top:520px;"></span>
        <div class="line green" style="right:245px;top:530px;width:485px;"></div>
        <div class="note green" style="left:94px;top:382px;width:385px;">حالة الفاتورة تتغير حسب المدفوع: صادرة، جزئية، كاملة، أو متأخرة</div>
        <div class="footer">وحدات الإيجار | 6</div>
      </div>
    </section>

    <section class="slide">
      <div class="content">
        <h2>اليومية المتابعة تختصر التحكم لوحة</h2>
        <p class="subtitle">بيومك تبدأ وين لك تقول المؤشرات، الجداول في تدور ما بدل.</p>
        <img class="screen" src="${img.dashboard}" alt="لوحة التحكم" style="right:70px;top:148px;width:63%;height:59%;" />
        <span class="pin" style="right:610px;top:255px;"></span>
        <div class="line" style="right:620px;top:265px;width:220px;"></div>
        <div class="note" style="left:90px;top:174px;width:360px;">فوراً التحصيل وضع تعطيك العليا الأرقام</div>
        <span class="pin amber" style="right:190px;top:170px;"></span>
        <div class="line amber" style="right:200px;top:180px;width:640px;"></div>
        <div class="note amber" style="left:90px;top:334px;width:370px;">تتنقل بدون فاتورة أو وحدة تلقى يساعدك السريع البحث كثير</div>
        <span class="pin green" style="right:725px;top:408px;"></span>
        <div class="line green" style="right:735px;top:418px;width:105px;"></div>
        <div class="note green" style="left:90px;top:500px;width:370px;">تقارير، دفعات، عقود، وحدات: العمل تفصل القوائم وصلاحيات</div>
        <div class="footer">وحدات الإيجار | 7</div>
      </div>
    </section>

    <section class="slide">
      <div class="content">
        <h2>التشغيل اليومي: بسيط وممسوك</h2>
        <p class="subtitle">هذه هي الدائرة اللي تمشي عليها الإدارة بعد التأسيس.</p>
        <div class="steps">
          <div class="step"><div class="num">1</div><div>أضف المواقع والوحدات</div></div>
          <div class="step"><div class="num">2</div><div>سجل العقد والمستأجر</div></div>
          <div class="step"><div class="num">3</div><div>أصدر الفواتير المستحقة</div></div>
          <div class="step"><div class="num">4</div><div>سجل الدفعات</div></div>
          <div class="step"><div class="num">5</div><div>راجع التقارير والصلاحيات</div></div>
        </div>
        <div class="note green" style="right:170px;left:170px;bottom:130px;text-align:center;background:#ecfdf5;color:#166534;">النظام جاهز للتشغيل لما تكون البيئة مضبوطة، المستخدمين مترقين، والجداول مطبقة في Supabase.</div>
        <div class="footer">وحدات الإيجار | 8</div>
      </div>
    </section>
  </main>
  <div class="controls" aria-label="أدوات العرض">
    <button id="prev" type="button" aria-label="السابق">‹</button>
    <div class="counter"><span id="current">1</span>/<span id="total">8</span></div>
    <button id="next" type="button" aria-label="التالي">›</button>
  </div>
  <script>
    const slides = [...document.querySelectorAll(".slide")];
    const current = document.getElementById("current");
    const total = document.getElementById("total");
    let index = 0;
    total.textContent = String(slides.length);
    function show(nextIndex) {
      slides[index].classList.remove("active");
      index = (nextIndex + slides.length) % slides.length;
      slides[index].classList.add("active");
      current.textContent = String(index + 1);
    }
    document.getElementById("prev").addEventListener("click", () => show(index - 1));
    document.getElementById("next").addEventListener("click", () => show(index + 1));
    window.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "PageDown" || event.key === " ") show(index + 1);
      if (event.key === "ArrowRight" || event.key === "PageUp") show(index - 1);
      if (event.key === "Home") show(0);
      if (event.key === "End") show(slides.length - 1);
    });
  </script>
</body>
</html>`;

await fs.writeFile(OUT, html);
console.log(OUT);
