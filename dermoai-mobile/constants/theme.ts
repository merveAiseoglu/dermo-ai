import { Platform } from "react-native";

const tintColorLight = "#4A7C6F";
const tintColorDark = "#7FB5A5";

export const Colors = {
  light: {
    text: "#1F2937",
    background: "#FAFAF8",
    tint: tintColorLight,
    icon: "#6B7280",
    tabIconDefault: "#6B7280",
    tabIconSelected: tintColorLight,
    surface: "#FFFFFF",
    border: "#E5E7EB",
    primaryLight: "#E8F3F0",
    danger: "#DC2626",
    dangerLight: "#FEF2F2",
    success: "#16A34A",
    successLight: "#F0FDF4",
  },
  dark: {
    text: "#ECEDEE",
    background: "#151718",
    tint: tintColorDark,
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
    surface: "#1E2021",
    border: "#2D3033",
    primaryLight: "#1E2E2A",
    danger: "#F87171",
    dangerLight: "#2E1B1B",
    success: "#4ADE80",
    successLight: "#1B2E1F",
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
