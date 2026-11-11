/** Native editing handles ordinary characters; Enter/Space explicitly opens search. */
export function opensSearchDialog(key: string, composing = false) {
  return !composing && (key === "Enter" || key === " ");
}
