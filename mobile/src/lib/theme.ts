/**
 * React Native Reusables theme in JS: the same values as the CSS variables in global.css,
 * for places that can't use classes. NAV_THEME colors navigation headers and screen
 * backgrounds (used by the ThemeProvider in app/_layout.tsx). Light only.
 */
import { DefaultTheme } from 'expo-router';

export const THEME = {
  light: {
    background: 'hsl(135 12.5% 93.7%)',
    foreground: 'hsl(157.9 26% 14.3%)',
    card: 'hsl(0 0% 100%)',
    cardForeground: 'hsl(157.9 26% 14.3%)',
    popover: 'hsl(0 0% 100%)',
    popoverForeground: 'hsl(157.9 26% 14.3%)',
    primary: 'hsl(157.9 26% 14.3%)',
    primaryForeground: 'hsl(0 0% 100%)',
    secondary: 'hsl(140 14.3% 95.9%)',
    secondaryForeground: 'hsl(157.9 26% 14.3%)',
    muted: 'hsl(140 14.3% 95.9%)',
    mutedForeground: 'hsl(155.3 8.3% 40.2%)',
    accent: 'hsl(148.2 39.5% 91.6%)',
    accentForeground: 'hsl(157.9 26% 14.3%)',
    destructive: 'hsl(3.2 71.3% 41%)',
    border: 'hsl(142.5 13.3% 88.2%)',
    input: 'hsl(142.5 13.3% 88.2%)',
    ring: 'hsl(164.9 78.1% 26.9%)',
    radius: '14px',
    chart1: 'hsl(39.1 87.4% 59.4%)',
    chart2: 'hsl(209.7 81.8% 72%)',
    chart3: 'hsl(339.6 82% 78.2%)',
    chart4: 'hsl(86.6 57.6% 63.9%)',
    chart5: 'hsl(255.8 83.3% 81.2%)',
  },
};

export const NAV_THEME = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.background, // headers sit on the page color
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
};
