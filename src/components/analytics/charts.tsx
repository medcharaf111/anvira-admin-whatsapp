'use client';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

const ARABIC_DAY_SHORT = ['أحد', 'إثن', 'ثلا', 'أرب', 'خم', 'جم', 'سب'];

function shortLabel(iso: string): string {
  const d = new Date(iso);
  const day = ARABIC_DAY_SHORT[d.getDay()];
  return `${day} ${d.getDate()}`;
}

interface MessagesPoint {
  date: string;
  in: number;
  out: number;
}

interface BookingsPoint {
  date: string;
  count: number;
}

export function MessagesTrendChart({ data }: { data: MessagesPoint[] }) {
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
          الرسائل خلال 30 يوماً
        </h3>
        <div
          className="text-[10px] uppercase tracking-widest"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        >
          IN / OUT
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="inGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary-glow)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--primary-glow)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="outGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ink-faint)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--ink-faint)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--rule)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortLabel}
            tick={{ fontSize: 10, fill: 'var(--ink-faint)' }}
            axisLine={{ stroke: 'var(--rule)' }}
            tickLine={false}
            interval="preserveStartEnd"
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
            labelFormatter={(label: any) => new Date(label).toLocaleDateString('ar-AE')}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
          />
          <Area
            type="monotone"
            dataKey="in"
            name="عملاء"
            stroke="var(--primary-glow)"
            strokeWidth={2}
            fill="url(#inGradient)"
          />
          <Area
            type="monotone"
            dataKey="out"
            name="ردود"
            stroke="var(--ink-faint)"
            strokeWidth={2}
            fill="url(#outGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BookingsBarChart({ data }: { data: BookingsPoint[] }) {
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
          المواعيد المحجوزة
        </h3>
        <div
          className="text-[10px] uppercase tracking-widest"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        >
          DAILY · 30D
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid stroke="var(--rule)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortLabel}
            tick={{ fontSize: 10, fill: 'var(--ink-faint)' }}
            axisLine={{ stroke: 'var(--rule)' }}
            tickLine={false}
            interval="preserveStartEnd"
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
            labelFormatter={(label: any) => new Date(label).toLocaleDateString('ar-AE')}
          />
          <Bar dataKey="count" fill="var(--primary)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
