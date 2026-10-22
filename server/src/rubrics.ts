import { cases, type Language } from './cases.js'

export interface RubricCriterion {
  id: string
  label: string
  description: string
  weight: number
}

export interface DecisionRubric {
  preset: 'balanced' | 'people' | 'delivery' | 'custom'
  criteria: RubricCriterion[]
}

const definitions = [
  { id: 'businessImpact', en: ['Expected business impact', 'Prefer meaningful, sustainable progress toward the stated goal.'], el: ['Αναμενόμενη επιχειρηματική επίδραση', 'Προτίμησε ουσιαστική, βιώσιμη πρόοδο προς τον δηλωμένο στόχο.'] },
  { id: 'peopleImpact', en: ['Customer or employee impact', 'Prefer better outcomes for affected people and fewer adverse effects.'], el: ['Επίδραση σε πελάτες ή εργαζομένους', 'Προτίμησε καλύτερα αποτελέσματα για τους εμπλεκόμενους και λιγότερες αρνητικές συνέπειες.'] },
  { id: 'implementationRisk', en: ['Implementation risk', 'Prefer lower delivery, safety and operational risk.'], el: ['Κίνδυνος υλοποίησης', 'Προτίμησε χαμηλότερο κίνδυνο υλοποίησης, ασφάλειας και λειτουργίας.'] },
  { id: 'reversibility', en: ['Reversibility', 'Prefer actions that can be stopped or reversed with limited cost or harm.'], el: ['Αναστρεψιμότητα', 'Προτίμησε ενέργειες που σταματούν ή αναστρέφονται με περιορισμένο κόστος ή βλάβη.'] },
  { id: 'timeToValue', en: ['Time to measurable value', 'Prefer earlier measurable benefits within the stated constraints.'], el: ['Χρόνος μέχρι μετρήσιμη αξία', 'Προτίμησε συντομότερα μετρήσιμα οφέλη εντός των δηλωμένων περιορισμών.'] },
] as const

export function rubricPresets(language: Language = 'en') {
  return [
    { id: 'balanced' as const, label: language === 'en' ? 'Workshop balance' : 'Ισορροπία εργαστηρίου', weights: definitions.map(item => cases.support.weights[item.id]) },
    { id: 'people' as const, label: language === 'en' ? 'People & caution' : 'Άνθρωποι και προσοχή', weights: [10, 40, 25, 15, 10] },
    { id: 'delivery' as const, label: language === 'en' ? 'Impact & speed' : 'Επίδραση και ταχύτητα', weights: [35, 15, 15, 10, 25] },
  ].map(preset => ({
    id: preset.id,
    label: preset.label,
    criteria: definitions.map((definition, index) => ({
      id: definition.id,
      label: definition[language][0],
      description: definition[language][1],
      weight: preset.weights[index]!,
    })),
  }))
}

export function defaultRubric(): DecisionRubric {
  return { preset: 'balanced', criteria: rubricPresets()[0]!.criteria }
}

export function validateRubric(value: DecisionRubric): DecisionRubric {
  const criteria = value.criteria.map(item => ({
    id: item.id,
    label: item.label.trim(),
    description: item.description.trim(),
    weight: item.weight,
  }))
  if (criteria.length < 2 || criteria.length > 8 ||
      criteria.some(item => !item.label || item.label.length > 100 || !item.description || item.description.length > 300 ||
        !/^[a-zA-Z][a-zA-Z0-9-]{0,49}$/.test(item.id) ||
        !Number.isInteger(item.weight) || item.weight < 0 || item.weight > 100) ||
      new Set(criteria.map(item => item.id)).size !== criteria.length ||
      new Set(criteria.map(item => item.label.toLocaleLowerCase())).size !== criteria.length ||
      criteria.reduce((sum, item) => sum + item.weight, 0) !== 100 ||
      criteria.filter(item => item.weight > 0).length < 2) {
    throw new Error('Use distinct criteria and weights totaling 100%, with at least two positive weights.')
  }
  if (value.preset !== 'custom') {
    const preset = rubricPresets()[0]!.criteria
    if (criteria.length !== preset.length || criteria.some((item, index) => item.id !== preset[index]!.id ||
      !(['en', 'el'] as const).some(language => {
        const original = rubricPresets(language)[0]!.criteria[index]!
        return item.label === original.label && item.description === original.description
      }))) {
      throw new Error('Use custom mode to change criterion definitions.')
    }
  }
  return { preset: value.preset, criteria }
}

export const rubricSchema = {
  type: 'object', required: ['preset', 'criteria'], additionalProperties: false,
  properties: {
    preset: { type: 'string', enum: ['balanced', 'people', 'delivery', 'custom'] },
    criteria: {
      type: 'array', minItems: 2, maxItems: 8,
      items: {
        type: 'object', required: ['id', 'label', 'description', 'weight'], additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9-]{0,49}$' },
          label: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', minLength: 1, maxLength: 300 },
          weight: { type: 'integer', minimum: 0, maximum: 100 },
        },
      },
    },
  },
} as const
