import { forwardRef } from "react";
import type { LucideProps } from "lucide-react-native";
import Svg, { Circle, Path } from "react-native-svg";

const RECEIPT = "M10 14H7Q4 14 4 10Q4 6 8 6H44Q48 6 48 10Q48 14 44 14V28M10 14V54L15 51L20 54L25 51L30 54M18 21H35M18 29H32M18 37H25";
function icon(paths: string[], circles: number[][] = [], blue = false) {
  return forwardRef<SVGSVGElement, LucideProps>(function BillingVectorIcon({ size = 32 }, _ref) {
    const color = blue ? "#4775C5" : "#000000";
    return <Svg width={Number(size)} height={Number(size)} viewBox="0 0 64 64">
      {paths.map((d, index) => <Path key={index} d={d} fill="none" stroke={color} strokeWidth={3.8} strokeLinecap="round" strokeLinejoin="round" />)}
      {circles.map(([cx, cy, r], index) => <Circle key={index} cx={cx} cy={cy} r={r} fill={r <= 2 ? color : "none"} stroke={r <= 2 ? "none" : color} strokeWidth={3.8} />)}
    </Svg>;
  });
}
export const BillingCyclesIcon = icon(["M7 25A26 26 0 0 1 56 18M56 18V8M56 18H48M57 39A26 26 0 0 1 8 46M8 46V56M8 46H16", "M19 23H17Q15 23 15 20Q15 17 18 17H45Q48 17 48 20Q48 23 45 23V48L40 45L35 48L30 45L25 48L19 45V23M25 29H39M25 37H39"]);
export const OverdueBillIcon = icon([RECEIPT, "M43 34V44L50 48"], [[43,43,15]]);
export const OtherBillsIcon = icon(["M11 14H8Q4 14 4 10Q4 6 8 6H52Q56 6 56 10Q56 14 52 14V56L45 52L38 56L31 52L24 56L17 52L11 56V14M19 23H43M19 33H43M19 43H35"]);
export const PaidBillIcon = icon([RECEIPT, "M36 44L42 50L52 39"], [[44,44,15]]);
export const UnpaidBillIcon = icon([RECEIPT, "M44 35V44"], [[44,44,15],[44,51,2]]);
export const DiscountBillIcon = icon(["M32 5L40 10L49 11L53 19L59 26L57 35L57 44L49 49L42 56L32 54L22 56L15 49L7 44L7 35L5 26L11 19L15 11L24 10Z", "M23 41L41 23"], [[23,24,4],[41,40,4]]);
export const PaymentHistoryIcon = icon([RECEIPT, "M31 40A15 15 0 1 1 30 49M31 40H40M31 40V31M45 36V45L51 49"], [], true);
export const TenantBillsIcon = icon(["M8 7H48V56L43 53L38 56L33 53L28 56L23 53L18 56L13 53L8 56Z", "M18 36Q18 29 28 29Q38 29 38 36M17 43H39M17 48H32"], [[28,21,6]], true);
export const MonthlyReportIcon = icon(["M10 6H36L47 17V53H10Z M36 6V17H47M18 37V31M26 37V27M34 37V23M17 44H39"], [], true);
export const PaymentSetupIcon = icon(["M7 18V11Q7 7 12 7H44V12M7 18H49Q53 18 53 22V27M7 18V50Q7 54 12 54H26M17 29H27", "M43 29H49L50 33L54 35L58 34L61 39L58 42V46L61 49L58 54L54 53L50 55L49 59H43L42 55L38 53L34 54L31 49L34 46V42L31 39L34 34L38 35L42 33Z"], [[46,44,6]], true);
