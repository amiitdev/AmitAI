import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { ThemeKey } from './types';

export type { ThemeKey };

export interface ThemeColors {
  name: string;
  description: string;
  previewAccent: string;
  bg: string;
  bgRaised: string;
  bgInput: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentDim: string;
  user: string;
  danger: string;
  ok: string;
  code: string;
}

export const THEMES: Record<ThemeKey, ThemeColors> = {
  midnight: {
    name: 'Midnight OLED',
    description: 'Pure pitch black AMOLED with electric indigo accents',
    previewAccent: '#6366f1',
    bg: '#000000',
    bgRaised: '#0b0b12',
    bgInput: '#13131c',
    border: '#1f1f2e',
    text: '#f3f4f6',
    textDim: '#9ca3af',
    textFaint: '#5b616e',
    accent: '#6366f1',
    accentDim: '#2a285a',
    user: '#161624',
    danger: '#f43f5e',
    ok: '#10b981',
    code: '#07070a',
  },
  tokyo: {
    name: 'Tokyo Night',
    description: 'Deep cyberpunk navy with neon cyan & lavender',
    previewAccent: '#7aa2f7',
    bg: '#0f141c',
    bgRaised: '#161d27',
    bgInput: '#1c2432',
    border: '#273346',
    text: '#c0caf5',
    textDim: '#7aa2f7',
    textFaint: '#565f89',
    accent: '#7aa2f7',
    accentDim: '#243356',
    user: '#1f2a3e',
    danger: '#f7768e',
    ok: '#9ece6a',
    code: '#131822',
  },
  obsidian: {
    name: 'Cyber Obsidian',
    description: 'Matrix carbon obsidian with cyber emerald accents',
    previewAccent: '#10b981',
    bg: '#0d1117',
    bgRaised: '#161b22',
    bgInput: '#21262d',
    border: '#30363d',
    text: '#e6edf3',
    textDim: '#8b949e',
    textFaint: '#6e7681',
    accent: '#10b981',
    accentDim: '#0d3d2c',
    user: '#192520',
    danger: '#fa4549',
    ok: '#10b981',
    code: '#090d12',
  },
};

/** Default active colors object for backward compatibility */
export const colors: ThemeColors = { ...THEMES.midnight };

export function applyTheme(key: ThemeKey): ThemeColors {
  return THEMES[key] || THEMES.midnight;
}

interface ThemeContextType {
  theme: ThemeKey;
  colors: ThemeColors;
  setTheme: (key: ThemeKey) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'midnight',
  colors: THEMES.midnight,
  setTheme: () => {},
});

export function ThemeProvider({
  theme = 'midnight',
  onThemeChange,
  children,
}: {
  theme?: ThemeKey;
  onThemeChange?: (key: ThemeKey) => void;
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState<ThemeKey>(theme);

  useEffect(() => {
    setCurrent(theme);
  }, [theme]);

  const setTheme = useCallback((key: ThemeKey) => {
    setCurrent(key);
    onThemeChange?.(key);
  }, [onThemeChange]);

  const activeColors = THEMES[current] || THEMES.midnight;
  const value = useMemo(
    () => ({ theme: current, colors: activeColors, setTheme }),
    [current, activeColors, setTheme]
  );

  return React.createElement(
    ThemeContext.Provider,
    { value },
    children,
  );
}

export const useTheme = () => useContext(ThemeContext);

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };

export const space = (n: number) => n * 4;

export const mono = 'monospace';

export const font = {
  h1: { fontSize: 26, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.5 },
  h2: { fontSize: 19, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  small: { fontSize: 13, color: colors.textDim },
  tiny: { fontSize: 11, color: colors.textFaint },
};
