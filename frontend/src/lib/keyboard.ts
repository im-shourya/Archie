/** Text entry only: a focused checkbox or button must not swallow board shortcuts (⌘Z, H, /). */
const NON_TEXT_INPUTS = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "range",
  "color",
  "file",
]);

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
    return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}
