export interface Criterion { id: string; label: string; description: string; weight: number }
export interface DecisionRubric {
  preset: 'balanced' | 'people' | 'delivery' | 'custom'
  criteria: Criterion[]
}
export interface Evaluation {
  deployment: string
  rubric: DecisionRubric
  instructions: string
}

export function isRubricValid(rubric: DecisionRubric | null): rubric is DecisionRubric {
  if (!rubric || rubric.criteria.length < 2 || rubric.criteria.length > 8) return false
  return rubric.criteria.every(item => item.label.trim() && item.description.trim() &&
    Number.isInteger(item.weight) && item.weight >= 0 && item.weight <= 100) &&
    new Set(rubric.criteria.map(item => item.label.trim().toLocaleLowerCase())).size === rubric.criteria.length &&
    rubric.criteria.reduce((sum, item) => sum + item.weight, 0) === 100 &&
    rubric.criteria.filter(item => item.weight > 0).length >= 2
}
