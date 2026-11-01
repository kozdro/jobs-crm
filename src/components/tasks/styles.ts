import { buttonStyles as sharedButtonStyles } from "@/components/ui/styles";

// Task actions include long Polish labels. Cap their intrinsic flex width so
// 200% text at narrow viewports wraps without clipping the label or hit target.
const wrap = "min-w-0 max-w-full whitespace-normal [overflow-wrap:anywhere]";
export const buttonStyles = {
  primary: `${sharedButtonStyles.primary} ${wrap}`,
  secondary: `${sharedButtonStyles.secondary} ${wrap}`,
  ghost: `${sharedButtonStyles.ghost} ${wrap}`,
};
