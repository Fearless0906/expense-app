/**
 * Design tokens. Screens style with NativeWind classes (bg-primary, text-muted-foreground, …)
 * from the shadcn variables in global.css and the extras in tailwind.config.js; this file holds the same values for the places that need a
 * raw color: navigation options, ActivityIndicator, placeholderTextColor, icons, and person colors.
 * Change both files together.
 */
export const colors = {
  bg: "#EDF1EE", // cool sage paper
  surface: "#FFFFFF",
  sunken: "#F3F6F4", // inputs, icon wells
  ink: "#1B2E27", // deep forest: text, primary button, hero card
  muted: "#5E6F68",
  placeholder: "#62736B",
  line: "#DDE5E0",
  track: "#DCE5E0", // unused credit on light surfaces
  remaining: "#0F7A5F",
  remainingSoft: "#E1F2E9",
  over: "#B3261E",
  overSoft: "#FBE8E6",
  // On the dark hero card
  onInk: "#FFFFFF",
  onInkMuted: "#AFC3BA",
  onInkGood: "#7EDDB6",
  onInkOver: "#FF9F95",
  heroTrack: "#344D43",
};

/**
 * One color per person: avatar fill (with ink initials, 6.8–8.7:1) and their segment on the
 * dark hero gauge (4.4–5.6:1). Too pale for light tracks, so never use them as the only signal there.
 */
export const personColors = [
  "#F2B33D",
  "#7DB8F2",
  "#F59AB9",
  "#A9D86E",
  "#BCA7F7",
  "#F7A26C",
  "#5ED3C6",
  "#DDB98F",
];

/**
 * Colors follow the order people were added on this phone, so adding someone never
 * recolors everyone else, and people in one budget get different colors.
 */
export function personColorMap(
  members: { id: string; seq: number }[],
): Map<string, string> {
  const ordered = [...members].sort((a, b) => a.seq - b.seq);
  return new Map(
    ordered.map((m, i) => [m.id, personColors[i % personColors.length]]),
  );
}
