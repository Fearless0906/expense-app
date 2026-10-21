import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and lets later ones win on conflicts (e.g. a passed `text-xs` beats `text-sm`). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
