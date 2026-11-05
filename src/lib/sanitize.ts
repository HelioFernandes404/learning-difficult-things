/** Removes soft hyphens and zero-width characters the model sometimes emits in the middle of words. */
const INVISIBLE = /[­​-‍⁠﻿]/g;

export function stripInvisible(text: string) {
  return text.replace(INVISIBLE, "");
}
