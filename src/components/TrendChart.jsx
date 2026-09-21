import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { formatCurrency } from '@/lib/utils';

/**
 * Dashboard's income-vs-outflow area chart.
 *
 * Split out so Recharts loads after the page paints — it is by far the
 * heaviest dependency on the home route.
 */
export default function TrendChart({ data, config }) {
  return (
    <ChartContainer config={config} className="h-[210px] w-full sm:h-[240px]">
      <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="dashIncome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="dashExpense" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.26} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 4" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} interval={0}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} width={44}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 10.5 }}
          tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(0)}jt` : `${(v / 1e3).toFixed(0)}rb`)} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(v)} />} />
        <Area type="monotone" dataKey="income" stroke="var(--chart-1)" strokeWidth={2.5}
          fill="url(#dashIncome)" dot={{ r: 3.5, fill: 'var(--card)', strokeWidth: 2 }} />
        <Area type="monotone" dataKey="expenses" stroke="var(--chart-2)" strokeWidth={2.5}
          fill="url(#dashExpense)" dot={{ r: 3.5, fill: 'var(--card)', strokeWidth: 2 }} />
      </AreaChart>
    </ChartContainer>
  );
}
