'use client';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReAnalytics } from '@/lib/analytics-re';

const STAGE_ORDER: { key: keyof ReAnalytics['stageCounts']; label: string; color: string }[] = [
  { key: 'cold', label: 'بارد', color: 'var(--ink-faint)' },
  { key: 'warm', label: 'دافئ', color: 'var(--warn)' },
  { key: 'hot', label: 'ساخن', color: 'var(--signal)' },
  { key: 'viewing_booked', label: 'معاينة', color: 'var(--primary-glow)' },
  { key: 'deposited', label: 'مقدّم', color: 'var(--primary)' },
  { key: 'closed', label: 'مغلق', color: '#7a8f5b' },
  { key: 'lost', label: 'مفقود', color: 'var(--ink-ghost)' },
];

// Diverse palette for the donut. We avoid red↔green confusion (a few
// portals would otherwise read as "good" vs "bad" by hue alone).
const SOURCE_PALETTE = [
  'var(--primary-glow)',
  'var(--warn)',
  '#7a8f5b',
  '#4a4d44',
  '#a88640',
  '#c14a28',
  '#8f8e82',
  '#c6c1b1',
];

function CardShell({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-5"
      style={{
        background: 'var(--paper-lift)',
        border: '1px solid var(--rule)',
        borderRadius: '3px',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3
          className="text-sm font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          {title}
        </h3>
        <div
          className="text-[10px] uppercase tracking-widest"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--ink-faint)',
          }}
        >
          {caption}
        </div>
      </div>
      {children}
    </div>
  );
}

export function StageFunnel({ stageCounts }: { stageCounts: ReAnalytics['stageCounts'] }) {
  const data = STAGE_ORDER.map((s) => ({
    name: s.label,
    count: stageCounts[s.key] ?? 0,
    color: s.color,
    key: s.key,
  }));
  return (
    <CardShell title="قمع المراحل" caption="STAGE FUNNEL · 30D">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid stroke="var(--rule)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: 'var(--ink-faint)' }}
            axisLine={{ stroke: 'var(--rule)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--ink-faint)' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--paper-sink)',
              border: '1px solid var(--rule)',
              borderRadius: 3,
              fontSize: 12,
            }}
          />
          <Bar dataKey="count" radius={[2, 2, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.key as string} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </CardShell>
  );
}

export function SourceDonut({
  data,
}: {
  data: ReAnalytics['sourceBreakdown'];
}) {
  const router = useRouter();
  const total = data.reduce((s, r) => s + r.count, 0);
  const chartData = data.map((d, i) => ({
    ...d,
    fill: SOURCE_PALETTE[i % SOURCE_PALETTE.length],
  }));

  return (
    <CardShell title="مصادر العملاء المحتملين" caption="LEAD SOURCES · 30D">
      {total === 0 ? (
        <p
          className="text-xs text-center py-12"
          style={{ color: 'var(--ink-faint)' }}
        >
          لا بيانات بعد
        </p>
      ) : (
        <div className="flex items-center gap-4 flex-wrap">
          <div style={{ width: 200, height: 200 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="pretty"
                  innerRadius={56}
                  outerRadius={92}
                  paddingAngle={2}
                  strokeWidth={2}
                  stroke="var(--paper-lift)"
                  onClick={(payload: unknown) => {
                    // Recharts wraps each slice's data inside `.payload`.
                    // We accept the loose shape and pluck `source`.
                    const src = (payload as { source?: string; payload?: { source?: string } })?.source
                      ?? (payload as { payload?: { source?: string } })?.payload?.source;
                    if (src) {
                      router.push(`/leads?source=${encodeURIComponent(src)}`);
                    }
                  }}
                  cursor="pointer"
                >
                  {chartData.map((d) => (
                    <Cell key={d.source} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--paper-sink)',
                    border: '1px solid var(--rule)',
                    borderRadius: 3,
                    fontSize: 12,
                  }}
                  formatter={(value) => {
                    const n = typeof value === 'number' ? value : Number(value);
                    return [
                      `${n} · ${total === 0 ? 0 : ((n / total) * 100).toFixed(0)}%`,
                      'leads',
                    ];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 min-w-[12rem] space-y-1.5">
            {chartData.map((d) => {
              const pct = total === 0 ? 0 : (d.count / total) * 100;
              return (
                <li
                  key={d.source}
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-[var(--paper-hover)] px-1 py-0.5 -mx-1"
                  onClick={() =>
                    router.push(
                      `/leads?source=${encodeURIComponent(d.source)}`
                    )
                  }
                  role="button"
                  style={{ borderRadius: '2px' }}
                >
                  <span
                    className="w-2 h-2 shrink-0"
                    style={{ background: d.fill }}
                  />
                  <span
                    className="flex-1 truncate"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-soft)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {d.pretty}
                  </span>
                  <span
                    className="tabular"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-faint)',
                    }}
                  >
                    {d.count} · {pct.toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </CardShell>
  );
}

export function ConversionBySource({
  data,
}: {
  data: ReAnalytics['sourceConversion'];
}) {
  return (
    <CardShell title="تحويل حسب المصدر" caption="VIEWING+ / LEADS · 30D">
      {data.length === 0 ? (
        <p
          className="text-xs text-center py-8"
          style={{ color: 'var(--ink-faint)' }}
        >
          لا بيانات كافية للحساب (نحتاج ٣ leads على الأقل لكل مصدر)
        </p>
      ) : (
        <ul className="space-y-2.5">
          {data.map((r) => {
            const pct = r.rate * 100;
            return (
              <li key={r.source}>
                <div className="flex items-baseline justify-between mb-1">
                  <span
                    className="text-xs tabular"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {r.pretty}
                  </span>
                  <span
                    className="text-[10px] tabular"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-faint)',
                    }}
                  >
                    {pct.toFixed(0)}% · {r.total}
                  </span>
                </div>
                <div
                  className="h-1.5 w-full"
                  style={{
                    background: 'var(--paper-sink)',
                    borderRadius: '1px',
                  }}
                >
                  <div
                    className="h-full transition-all"
                    style={{
                      background: 'var(--primary-glow)',
                      width: `${pct}%`,
                      borderRadius: '1px',
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}

export function TopDevelopers({
  data,
}: {
  data: ReAnalytics['topDevelopers'];
}) {
  const max = data.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <CardShell title="أفضل المطوّرين" caption="DEVELOPERS · INVENTORY">
      {data.length === 0 ? (
        <p
          className="text-xs text-center py-8"
          style={{ color: 'var(--ink-faint)' }}
        >
          أضف العقارات لرؤية المطوّرين الأكثر طلباً.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {data.map((r) => {
            const pct = max === 0 ? 0 : (r.count / max) * 100;
            return (
              <li key={r.developer}>
                <div className="flex items-baseline justify-between mb-1">
                  <span
                    className="text-xs"
                    style={{ color: 'var(--ink)' }}
                  >
                    {r.developer}
                  </span>
                  <span
                    className="text-[10px] tabular"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-faint)',
                    }}
                  >
                    {r.count}
                  </span>
                </div>
                <div
                  className="h-1.5 w-full"
                  style={{
                    background: 'var(--paper-sink)',
                    borderRadius: '1px',
                  }}
                >
                  <div
                    className="h-full"
                    style={{
                      background: 'var(--warn)',
                      width: `${pct}%`,
                      borderRadius: '1px',
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}

export function TopPropertyTypes({
  data,
}: {
  data: ReAnalytics['topPropertyTypes'];
}) {
  const max = data.reduce((m, r) => Math.max(m, r.count), 0);
  const TYPE_AR: Record<string, string> = {
    apartment: 'شقة',
    villa: 'فيلا',
    townhouse: 'تاون هاوس',
    penthouse: 'بنتهاوس',
    plot: 'أرض',
    commercial: 'تجاري',
    office: 'مكتب',
    retail: 'محل تجاري',
    studio: 'استوديو',
  };
  return (
    <CardShell title="أكثر أنواع العقارات طلباً" caption="TYPES REQUESTED · 30D">
      {data.length === 0 ? (
        <p
          className="text-xs text-center py-8"
          style={{ color: 'var(--ink-faint)' }}
        >
          سيظهر هنا أكثر ما يبحث عنه العملاء.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {data.map((r) => {
            const pct = max === 0 ? 0 : (r.count / max) * 100;
            return (
              <li key={r.type}>
                <div className="flex items-baseline justify-between mb-1">
                  <span
                    className="text-xs"
                    style={{ color: 'var(--ink)' }}
                  >
                    {TYPE_AR[r.type] ?? r.type}
                  </span>
                  <span
                    className="text-[10px] tabular"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-faint)',
                    }}
                  >
                    {r.count}
                  </span>
                </div>
                <div
                  className="h-1.5 w-full"
                  style={{
                    background: 'var(--paper-sink)',
                    borderRadius: '1px',
                  }}
                >
                  <div
                    className="h-full"
                    style={{
                      background: 'var(--primary-glow)',
                      width: `${pct}%`,
                      borderRadius: '1px',
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}
