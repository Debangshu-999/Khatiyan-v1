import Svg, { Circle, Path } from "react-native-svg";

/**
 * A filled person with a small mark at the shoulder: a tick when the profile is
 * complete, a "!" when it is not (user, 2026-11-08: the Account tab's Profile
 * tile). The caller passes the state colour. The mark sits on a white ring so it
 * reads apart from the body.
 */
export function ProfileStateIcon({ color, complete, size = 30 }: { color: string; complete: boolean; size?: number }) {
  return (
    <Svg accessibilityElementsHidden height={size} importantForAccessibility="no" viewBox="0 0 24 24" width={size}>
      {/* The person, Lucide's UserRound shape, filled. */}
      <Circle cx={10} cy={7.5} fill={color} r={4.5} />
      <Path d="M1.5 21.5a8.5 8.5 0 0 1 17 0Z" fill={color} />
      {/* The mark: a disc in the state colour on a white ring. */}
      <Circle cx={18.5} cy={17.5} fill={color} r={5} stroke="#FFFFFF" strokeWidth={1.6} />
      {complete ? (
        <Path d="m16.3 17.6 1.5 1.5 2.9-3" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} />
      ) : (
        <Path d="M18.5 15v2.8M18.5 20.1v.01" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={1.7} />
      )}
    </Svg>
  );
}
