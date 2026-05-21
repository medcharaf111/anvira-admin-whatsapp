/**
 * Real-estate reply-template starter pack.
 *
 * The operator can either:
 *   - have these seeded automatically on first onboarding for RE clients
 *     (POST /api/templates/seed-re from /onboarding), or
 *   - press the "Add real-estate starter pack" button on /templates when
 *     their table is empty.
 *
 * Each entry uses `{{customer_name}}`, `{{project}}`, `{{time}}`,
 * `{{location}}`, `{{partner_bank}}`, `{{budget}}` placeholders the
 * operator edits per-use from the reply box.
 *
 * Language convention:
 *   - 'ar+en' for bilingual blocks (Arabic on top, English on bottom)
 *   - single language code ('ar', 'en') when only one is appropriate
 *
 * Keep this list to ~12 — more than that and the operator hits decision
 * fatigue and stops using templates altogether. We err on the side of
 * the most common ops scenarios.
 */
export interface RETemplateSeed {
  label: string;
  body: string;
  language: 'ar' | 'en' | 'ar+en';
  sort_order: number;
}

export const RE_REPLY_TEMPLATE_SEEDS: RETemplateSeed[] = [
  {
    label: 'ترحيب — أونلاين',
    language: 'ar+en',
    sort_order: 10,
    body: `أهلاً وسهلاً، {{customer_name}}. شو يهمّك تعرف؟ شقة جاهزة، Off-plan، أم مشروع معيّن في بالك؟

Hi {{customer_name}} — what would you like to know? A ready unit, off-plan, or a specific project in mind?`,
  },
  {
    label: 'ترحيب — خارج الدوام',
    language: 'ar+en',
    sort_order: 20,
    body: `أهلاً 🌷 نحن خارج ساعات العمل الآن، لكن سأجيب صباحاً بإذن الله. أي مشروع تركّز عليه؟

Hi! We're after-hours right now, I'll get back at 9am. Which project are you interested in?`,
  },
  {
    label: 'إرسال البروشور',
    language: 'ar+en',
    sort_order: 30,
    body: `تمام، أرسلت لك الكتالوج 🌷 إذا حابب نحدّد معاينة قول لي اليوم اللي يناسبك.

Sent the brochure 🌷 Let me know which day works for a viewing.`,
  },
  {
    label: 'تذكير المعاينة — 24h',
    language: 'ar+en',
    sort_order: 40,
    body: `تذكير سريع — معاينتنا غداً الساعة {{time}} في {{location}}.
ردّ YES للتأكيد · RESCHEDULE لتغيير الموعد · CANCEL للإلغاء.

Quick reminder — viewing tomorrow at {{time}} in {{location}}.
Reply YES to confirm · RESCHEDULE to move · CANCEL to drop.`,
  },
  {
    label: 'خطة الأقساط — قادمة',
    language: 'ar+en',
    sort_order: 50,
    body: `تمام، خلّيني أرجع لك بخطة الأقساط الكاملة كملف PDF خلال دقيقتين.

Sure, I'll send the full payment-plan PDF in ~2 minutes.`,
  },
  {
    label: 'تحويل للتمويل',
    language: 'ar+en',
    sort_order: 60,
    body: `للتمويل نحوّلك على {{partner_bank}} — متخصصهم بيكلمك في أقل من ساعة. ابعت لي رقم جوّالك للتأكيد.

For mortgage we'll connect you to {{partner_bank}} — their specialist calls within an hour. Confirm your number please.`,
  },
  {
    label: 'توضيح: جاهز أم Off-plan',
    language: 'ar',
    sort_order: 70,
    body: `حتى أساعدك بشكل أفضل — تبحث عن وحدة جاهزة (تسلَّم خلال شهر) أو Off-plan (تحت الإنشاء بخطة دفع موسّعة)؟`,
  },
  {
    label: 'بوّابة الجنسية — KSA',
    language: 'ar',
    sort_order: 80,
    body: `للأخوة من خارج السعودية: حالياً المناطق المتاحة لتمليك غير السعوديين هي الرياض وجدة — هل العقار اللي يهمّك في أحد هذه المدن؟`,
  },
  {
    label: 'استرداد No-show',
    language: 'ar',
    sort_order: 90,
    body: `ما لحقتك اليوم — أكيد ظرف طارئ. متى يناسبك نحدّد معاينة جديدة؟`,
  },
  {
    label: 'دفعة Cold lead',
    language: 'ar+en',
    sort_order: 100,
    body: `تذكير ودّي 🌷 — هل ما زال {{project}} في خانة الاهتمام؟ ممكن أرسل لك مشاريع أخرى تناسب ميزانيتك.

Friendly nudge 🌷 — still considering {{project}}? Happy to share other options matching your budget.`,
  },
  {
    label: 'تنبيه Hot lead (داخلي)',
    language: 'en',
    sort_order: 110,
    body: `🔥 Lead score 80+ — budget {{budget}}, asking about {{project}}. Likely ready to close. Take over and call within the hour.`,
  },
  {
    label: 'إقرار التحويل',
    language: 'ar+en',
    sort_order: 120,
    body: `تمام، حوّلتك على فريق المبيعات — سيكلمك واحد من الأخصائيين خلال ١٥ دقيقة.

Got it — handed you over to our sales team. A specialist will call within 15 minutes.`,
  },
];
