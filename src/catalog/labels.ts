export const GOAL_ES: Record<string, string> = {
  fuerza: 'Fuerza', hipertrofia: 'Hipertrofia', resistencia: 'Resistencia',
};
export const LEVEL_ES: Record<string, string> = {
  principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado',
};
export const CATEGORY_ES: Record<string, string> = {
  alta_intensidad: 'Alta intensidad y culturismo', fuerza: 'Fuerza y powerlifting',
  hibrido: 'Híbridos fuerza + hipertrofia', otros: 'Otros',
};
export const EQUIPMENT_ES: Record<string, string> = {
  barbell: 'Barra', dumbbell: 'Mancuernas', cable: 'Polea', machine: 'Máquina', 'body only': 'Peso corporal',
  'e-z curl bar': 'Barra Z', kettlebells: 'Kettlebell', bands: 'Bandas', 'medicine ball': 'Pelota medicinal',
  'exercise ball': 'Pelota', 'foam roll': 'Rodillo', other: 'Otro',
};
export const JOINT_ES: Record<string, string> = {
  rodilla: 'Rodilla', cadera: 'Cadera', lumbar: 'Lumbar', hombro: 'Hombro', codo: 'Codo',
  muneca: 'Muñeca', tobillo: 'Tobillo', cuello: 'Cuello',
};
export { MUSCLE_ES } from '@/builder/build';

export const daysLabel = (a: number, b: number) => (a === b ? `${a} d` : `${a}-${b} d`);
