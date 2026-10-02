import { forwardRef } from "react";
import type { LucideProps } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";

// Code-native vector artwork: agreement/signature and exit/checklist.
const SHEET = "M12 5H36L47 16V40M36 5V16H47M12 5Q8 5 8 9V51Q8 55 12 55H29";
const AGREEMENT = "M16 23H35M16 30H30M16 37H25M16 47Q20 39 22 45T28 44 M32 47L45 34L51 40L38 53L30 55Z M42 37L48 43";
const EXIT_SHEET = "M19 9H12Q8 9 8 13V52Q8 56 12 56H31M34 9H41Q45 9 45 13V29 M21 5H32Q35 5 35 8V11Q35 14 32 14H21Q18 14 18 11V8Q18 5 21 5Z";
const EXIT_POLICY = "M15 23L18 26L23 20M28 23H37M15 34L18 37L23 31M28 34H31M15 46H25 M58 45A14 14 0 1 0 30 45A14 14 0 1 0 58 45 M36 45H52M46 39L52 45L46 51";

function ruleIcon(details: string, sheet = SHEET) {
  return forwardRef<SVGSVGElement, LucideProps>(function TenancyRuleIcon({ size = 32 }, _ref) {
    return <Svg width={Number(size)} height={Number(size)} viewBox="0 0 64 64">
      <Path d={sheet} fill="none" stroke="#000000" strokeWidth={3.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={details} fill="none" stroke="#000000" strokeWidth={3.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>;
  });
}

export const TenancyAgreementIcon = ruleIcon(AGREEMENT);
export const ExitPolicyIcon = ruleIcon(EXIT_POLICY, EXIT_SHEET);
