let counter = 0;
export function createId(): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36);
  return `${t}-${counter.toString(36)}-${rand}`;
}
