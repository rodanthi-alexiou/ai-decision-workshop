export type Language = 'en' | 'el'
export type CaseId = 'support'
export type CaseKind = CaseId | 'custom'
export type OptionId = 'A' | 'B' | 'C'

export interface DecisionOption {
  id: OptionId
  title: string
  description: string
}

export interface CaseDefinition {
  id: CaseId
  company: string
  title: Record<Language, string>
  scenario: Record<Language, string>
  prompt: Record<Language, string>
  weights: {
    businessImpact: number
    peopleImpact: number
    implementationRisk: number
    reversibility: number
    timeToValue: number
  }
  options: Record<Language, [DecisionOption, DecisionOption, DecisionOption]>
}

export const cases: Record<CaseId, CaseDefinition> = {
  support: {
    id: 'support',
    company: 'Northstar Services',
    title: {
      en: 'Customer-support AI rollout',
      el: 'Εισαγωγή AI στην εξυπηρέτηση πελατών',
    },
    scenario: {
      en: 'Northstar Services is a 300-person service company. Support wait time has risen from 4 to 11 minutes. Leadership wants visible AI progress within three months. Employees are concerned about quality and job impact, while customers expect faster responses.',
      el: 'Η Northstar Services είναι μια εταιρεία υπηρεσιών 300 ατόμων. Ο χρόνος αναμονής υποστήριξης αυξήθηκε από 4 σε 11 λεπτά. Η διοίκηση θέλει ορατή πρόοδο με AI μέσα σε τρεις μήνες. Οι εργαζόμενοι ανησυχούν για την ποιότητα και τις θέσεις εργασίας, ενώ οι πελάτες περιμένουν ταχύτερη εξυπηρέτηση.',
    },
    prompt: {
      en: 'What action would you take as the support manager?',
      el: 'Ποια ενέργεια θα έκανες ως υπεύθυνος υποστήριξης;',
    },
    weights: {
      businessImpact: 20,
      peopleImpact: 30,
      implementationRisk: 20,
      reversibility: 10,
      timeToValue: 20,
    },
    options: {
      en: [
        { id: 'A', title: 'AI-first rollout', description: 'Introduce AI for common support requests, with humans handling exceptions.' },
        { id: 'B', title: 'Controlled pilot', description: 'Run an eight-week pilot for one request category with human review and success thresholds.' },
        { id: 'C', title: 'Fix foundations first', description: 'Improve the knowledge base and support process before customer-facing AI.' },
      ],
      el: [
        { id: 'A', title: 'AI-first εφαρμογή', description: 'Εισαγωγή AI για τα συνήθη αιτήματα, με τους ανθρώπους να χειρίζονται τις εξαιρέσεις.' },
        { id: 'B', title: 'Ελεγχόμενο πιλοτικό', description: 'Πιλοτική εφαρμογή οκτώ εβδομάδων σε μία κατηγορία, με ανθρώπινο έλεγχο και όρια επιτυχίας.' },
        { id: 'C', title: 'Πρώτα οι βάσεις', description: 'Βελτίωση της γνωσιακής βάσης και της διαδικασίας πριν από AI προς τους πελάτες.' },
      ],
    },
  },
}

export const rubric = [
  'Expected business impact',
  'Customer or employee impact',
  'Implementation risk',
  'Reversibility',
  'Time to measurable value',
] as const
