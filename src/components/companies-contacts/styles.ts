import { buttonStyles } from "@/components/ui/styles";

// Catalog actions and pagination can outgrow a nested panel when text is resized.
// Keep the complete label visible by wrapping inside the available width.
const boundedLabel =
  "min-w-0 max-w-full whitespace-normal [overflow-wrap:anywhere]";
export const catalogButtonStyles = {
  primary: `${buttonStyles.primary} ${boundedLabel}`,
  secondary: `${buttonStyles.secondary} ${boundedLabel}`,
  ghost: `${buttonStyles.ghost} ${boundedLabel}`,
};
