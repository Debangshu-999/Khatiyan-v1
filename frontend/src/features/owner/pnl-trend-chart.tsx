import { Text, View } from "react-native";
import Svg, { Line, Polyline, Rect, Text as SvgText } from "react-native-svg";

import { Card } from "@/components/card";
import type { PnlTrendPoint } from "@/store/services/pnl-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Income vs expense bars with a net line, shared by the P&L screen and the
// owner dashboard P&L snapshot.
export function PnlTrendChart({ points }: { points: PnlTrendPoint[] }) {
  const { colors } = useTheme();
  const width = 320;
  const height = 150;
  const padX = 8;
  const padY = 14;
  const barGroupWidth = (width - padX * 2) / Math.max(points.length, 1);
  const barWidth = Math.min(14, barGroupWidth / 3);

  const maxIncome = Math.max(...points.map((p) => p.incomePaise), 0);
  const maxExpense = Math.max(...points.map((p) => p.expensePaise), 0);
  const peak = Math.max(maxIncome, maxExpense, 1);
  const zeroY = height - padY;
  const scale = (height - padY * 2) / peak;

  const netMax = Math.max(...points.map((p) => Math.abs(p.netPaise)), 1);
  const netScale = (height - padY * 2) / (netMax * 2);
  const netMid = height / 2;

  const netLine = points
    .map((p, i) => {
      const x = padX + barGroupWidth * i + barGroupWidth / 2;
      const y = netMid - p.netPaise * netScale;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <ChartLegend color={colors.jade} label="Income" />
          <ChartLegend color={colors.danger} label="Expense" />
          <ChartLegend color={colors.primary} label="Net" line />
        </View>
        <Svg height={height} width="100%" viewBox={`0 0 ${width} ${height}`}>
          <Line stroke={colors.border} strokeWidth={1} x1={padX} x2={width - padX} y1={zeroY} y2={zeroY} />
          {points.map((p, i) => {
            const groupX = padX + barGroupWidth * i;
            const incomeH = p.incomePaise * scale;
            const incomeX = groupX + barGroupWidth / 2 - barWidth - 1;
            return (
              <Rect key={`i-${i}`} fill={colors.jade} height={Math.max(0, incomeH)} rx={2} width={barWidth} x={incomeX} y={zeroY - incomeH} />
            );
          })}
          {points.map((p, i) => {
            const groupX = padX + barGroupWidth * i;
            const expenseH = p.expensePaise * scale;
            const expenseX = groupX + barGroupWidth / 2 + 1;
            return (
              <Rect key={`e-${i}`} fill={colors.danger} height={Math.max(0, expenseH)} rx={2} width={barWidth} x={expenseX} y={zeroY - expenseH} />
            );
          })}
          <Polyline fill="none" points={netLine} stroke={colors.primary} strokeWidth={2} />
          {points.map((p, i) => (
            <SvgText key={`t-${i}`} fill={colors.muted} fontSize={9} textAnchor="middle" x={padX + barGroupWidth * i + barGroupWidth / 2} y={height - 2}>
              {monthShort(p.month)}
            </SvgText>
          ))}
        </Svg>
      </View>
    </Card>
  );
}

function ChartLegend({ color, label, line = false }: { color: string; label: string; line?: boolean }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
      <View style={{ backgroundColor: color, borderRadius: line ? 999 : 2, height: line ? 3 : 10, width: line ? 14 : 10 }} />
      <Text style={[type.caption, { color: colors.muted, fontSize: 11 }]}>
        {label}
      </Text>
    </View>
  );
}

function monthShort(iso?: string) {
  if (!iso) return "";
  const [year, month] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(year, month - 1, 1));
}
