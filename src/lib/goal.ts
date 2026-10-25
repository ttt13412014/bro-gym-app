// Meta de peso: ¿el cambio te acercó o te alejó?
export type Toward = 'good' | 'bad' | null;

export function towardGoal(from: number, to: number, goal: number | null | undefined): Toward {
  if (goal == null || from === to) return null;
  const a = Math.abs(from - goal), b = Math.abs(to - goal);
  if (Math.abs(a - b) < 0.001) return null;
  return b < a ? 'good' : 'bad';
}
