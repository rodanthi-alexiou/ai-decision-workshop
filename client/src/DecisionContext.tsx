import { useEffect, useState } from 'react'
import { api } from './api'
import { isRubricValid, type Criterion, type DecisionRubric, type Evaluation } from './rubric'
import './DecisionContext.css'

type Language = 'en' | 'el'
interface Option { id: string; title: string; description: string }

const words = {
  en: {
    title: 'What matters in this decision?',
    intro: 'Choose the lens before the model scores. Presets are starting points, not objective truths.',
    preset: 'Starting rubric', custom: 'Define my own criteria', weight: 'Weight (%)',
    label: 'Criterion', description: 'What does a better outcome mean?',
    add: '+ Add criterion', remove: 'Remove', total: 'Total weight',
    valid: 'Ready to rank. These priorities will be sent with your scenario and options.',
    invalid: 'Use 2–8 distinct, named criteria with descriptions. Use whole-number weights from 0–100, totaling 100%, with at least two above zero.',
    note: 'Weights express relative importance to the model; this is not a calculated weighted-score formula. Zero means ignore.',
    loading: 'Loading rubric presets…', retry: 'Retry loading presets',
    receipt: 'Inside this decision', receiptIntro: 'The inputs sent to the scorer—not its hidden reasoning.',
    scenario: 'Your scenario', scenarioNote: 'The original case description, not the comparison agent’s summary.',
    options: 'AI-generated choices', optionsNote: 'The exact three options you saw, passed unchanged to the scorer.',
    rubric: 'Your evaluation lens', rubricNote: 'Definitions and priorities confirmed before ranking.',
    model: 'Decision-1', modelNote: 'Selects among A / B / C. It does not generate a written rationale.',
    excluded: 'Kept out of scoring', excludedNote: 'Your private written answer and your A/B/C selection were NOT sent to Decision-1. Your answer was used only by the comparison agent.',
    source: 'Context source: your case description. No external datasource connected.',
    sample: 'MOCK PREVIEW — these inputs were prepared, but not sent to a model. Scores are fixed demo values and do not respond to rubric changes.',
    details: 'Inspect the scoring instructions',
    fullScenario: 'Read the full context', optionDetails: 'Read option descriptions', definitions: 'Read criterion definitions',
    probability: 'Option probabilities are model judgments under this lens, not probabilities of business success.',
  },
  el: {
    title: 'Τι μετράει σε αυτή την απόφαση;',
    intro: 'Διάλεξε κριτήρια πριν βαθμολογήσει το μοντέλο. Τα πρότυπα είναι αφετηρίες, όχι αντικειμενικές αλήθειες.',
    preset: 'Αρχικό πλαίσιο', custom: 'Ορίζω δικά μου κριτήρια', weight: 'Βάρος (%)',
    label: 'Κριτήριο', description: 'Τι σημαίνει καλύτερο αποτέλεσμα;',
    add: '+ Προσθήκη κριτηρίου', remove: 'Αφαίρεση', total: 'Συνολικό βάρος',
    valid: 'Έτοιμο για κατάταξη. Αυτές οι προτεραιότητες θα σταλούν μαζί με το σενάριο και τις επιλογές.',
    invalid: 'Χρησιμοποίησε 2–8 διαφορετικά κριτήρια με ονόματα και περιγραφές. Ακέραια βάρη 0–100, σύνολο 100%, με τουλάχιστον δύο θετικά.',
    note: 'Τα βάρη δηλώνουν σχετική σημασία στο μοντέλο, όχι μαθηματικό σταθμισμένο άθροισμα. Μηδέν σημαίνει αγνόησέ το.',
    loading: 'Φόρτωση προτύπων…', retry: 'Νέα φόρτωση προτύπων',
    receipt: 'Μέσα στην απόφαση', receiptIntro: 'Οι είσοδοι του μοντέλου, όχι η κρυφή συλλογιστική του.',
    scenario: 'Το σενάριό σου', scenarioNote: 'Η αρχική περιγραφή, όχι η σύνοψη του agent σύγκρισης.',
    options: 'Επιλογές της AI', optionsNote: 'Οι ίδιες τρεις επιλογές που είδες, χωρίς αλλαγές.',
    rubric: 'Το πλαίσιο αξιολόγησής σου', rubricNote: 'Ορισμοί και προτεραιότητες πριν από την κατάταξη.',
    model: 'Decision-1', modelNote: 'Επιλέγει μεταξύ A / B / C. Δεν παράγει γραπτή αιτιολόγηση.',
    excluded: 'Εκτός βαθμολόγησης', excludedNote: 'Η προσωπική γραπτή απάντηση και η επιλογή σου A/B/C ΔΕΝ στάλθηκαν στο Decision-1. Η απάντησή σου χρησιμοποιήθηκε μόνο από τον agent σύγκρισης.',
    source: 'Πηγή πλαισίου: η περιγραφή του σεναρίου. Δεν συνδέθηκε εξωτερική πηγή δεδομένων.',
    sample: 'MOCK ΠΡΟΕΠΙΣΚΟΠΗΣΗ — οι είσοδοι προετοιμάστηκαν αλλά δεν στάλθηκαν σε μοντέλο. Οι βαθμολογίες είναι σταθερές και δεν αλλάζουν με τα κριτήρια.',
    details: 'Δες τις οδηγίες βαθμολόγησης',
    fullScenario: 'Δες ολόκληρο το πλαίσιο', optionDetails: 'Δες τις περιγραφές επιλογών', definitions: 'Δες τους ορισμούς κριτηρίων',
    probability: 'Οι πιθανότητες εκφράζουν κρίση του μοντέλου με αυτά τα κριτήρια, όχι πιθανότητες επιχειρηματικής επιτυχίας.',
  },
}

export function RubricEditor({ language, value, onChange }: {
  language: Language; value: DecisionRubric | null; onChange: (value: DecisionRubric) => void
}) {
  const t = words[language]
  const [presets, setPresets] = useState<Array<{ id: Exclude<DecisionRubric['preset'], 'custom'>; label: string; criteria: Criterion[] }>>([])
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    void api<{ presets: typeof presets }>(`/api/rubrics?language=${language}`, language)
      .then(result => { if (active) { setPresets(result.presets); setError('') } })
      .catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : String(failure)) })
    return () => { active = false }
  }, [language, attempt])
  useEffect(() => {
    if (!value && presets[0]) onChange({ preset: presets[0].id, criteria: presets[0].criteria.map(item => ({ ...item })) })
  }, [presets, value, onChange])

  const update = (index: number, change: Partial<Criterion>) => {
    if (value) onChange({ ...value, criteria: value.criteria.map((item, position) => position === index ? { ...item, ...change } : item) })
  }
  const total = value?.criteria.reduce((sum, item) => sum + item.weight, 0) ?? 0
  return <section className="rubric-panel" aria-labelledby="rubric-title">
    <p className="panel-label">03 / RUBRIC</p>
    <h3 id="rubric-title">{t.title}</h3>
    <p>{t.intro}</p>
    {error ? <div role="alert"><p>{error}</p><button className="language" onClick={() => setAttempt(attempt + 1)}>{t.retry}</button></div>
      : !presets.length ? <p role="status">{t.loading}</p> : <>
        <label className="rubric-preset">{t.preset}
          <select value={value?.preset ?? 'balanced'} onChange={event => {
            if (event.target.value === 'custom' && value) onChange({ ...value, preset: 'custom' })
            else {
              const preset = presets.find(item => item.id === event.target.value)
              if (preset) onChange({ preset: preset.id, criteria: preset.criteria.map(item => ({ ...item })) })
            }
          }}>
            {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            <option value="custom">{t.custom}</option>
          </select>
        </label>
        {value?.criteria.map((item, index) => <div className="criterion-row" key={item.id}>
          <div className="criterion-copy">
            {value.preset === 'custom' ? <>
              <label>{t.label}<input value={item.label} maxLength={100} onChange={event => update(index, { label: event.target.value })} /></label>
              <label>{t.description}<textarea value={item.description} maxLength={300} onChange={event => update(index, { description: event.target.value })} /></label>
            </> : <><strong>{item.label}</strong><p>{item.description}</p></>}
          </div>
          <label className="criterion-weight">{t.weight}
            <input type="number" min={0} max={100} step={1} value={Number.isNaN(item.weight) ? '' : item.weight}
              onChange={event => update(index, { weight: event.target.valueAsNumber })} aria-label={`${item.label || t.label} — ${t.weight}`} />
          </label>
          {value.preset === 'custom' && <button className="back" disabled={value.criteria.length <= 2}
            aria-label={`${t.remove}: ${item.label || index + 1}`}
            onClick={() => onChange({ ...value, criteria: value.criteria.filter((_, position) => position !== index) })}>{t.remove}</button>}
        </div>)}
        {value?.preset === 'custom' && <button className="language" disabled={value.criteria.length >= 8}
          onClick={() => onChange({ ...value, criteria: [...value.criteria, { id: `custom-${crypto.randomUUID()}`, label: '', description: '', weight: 0 }] })}>{t.add}</button>}
        <div className={`rubric-total ${isRubricValid(value) ? 'valid' : ''}`} role="status">
          <strong>{t.total} <span>{Number.isFinite(total) ? total : '—'} / 100%</span></strong>
          <p>{isRubricValid(value) ? t.valid : t.invalid}</p>
        </div>
      </>}
    <small>{t.note}</small>
  </section>
}

export function DecisionContext({ language, scenario, options, evaluation, isMock }: {
  language: Language; scenario: string; options: Option[]; evaluation: Evaluation; isMock: boolean
}) {
  const t = words[language]
  return <section className="decision-receipt" aria-labelledby="receipt-title">
    <header><p className="panel-label">INPUT / OUTPUT</p><h3 id="receipt-title">{t.receipt}</h3><p>{t.receiptIntro}</p></header>
    {isMock && <p className="receipt-warning">{t.sample}</p>}
    <div className="context-flow">
      <article><span className="context-step">01 / CONTEXT</span><h4>{t.scenario}</h4><p className="context-excerpt">{scenario}</p><small>{t.scenarioNote}</small>
        <details><summary>{t.fullScenario}</summary><p>{scenario}</p></details>
      </article>
      <article><span className="context-step">02 / OPTIONS</span><h4>{t.options}</h4>
        <ul>{options.map(option => <li key={option.id}><b>{option.id} · {option.title}</b></li>)}</ul><small>{t.optionsNote}</small>
        <details><summary>{t.optionDetails}</summary>{options.map(option => <p key={option.id}><b>{option.id}</b> · {option.description}</p>)}</details>
      </article>
      <article><span className="context-step">03 / RUBRIC</span><h4>{t.rubric}</h4>
        <ul className="receipt-criteria">{evaluation.rubric.criteria.map(item => <li key={item.id}>
          <div><b>{item.label}</b><strong>{item.weight}%</strong></div>
          <div className="weight-track" aria-hidden="true"><i style={{ width: `${item.weight}%` }} /></div>
        </li>)}</ul><small>{t.rubricNote}</small>
        <details><summary>{t.definitions}</summary>{evaluation.rubric.criteria.map(item => <p key={item.id}><b>{item.label}</b> · {item.description}</p>)}</details>
      </article>
      <article className="context-model"><span className="context-step">04 / SCORER</span><h4>{t.model}</h4><code>{evaluation.deployment}</code><p>{t.modelNote}</p></article>
    </div>
    <p className="context-source">{t.source}</p>
    <aside className="context-excluded"><strong>{t.excluded}</strong><p>{t.excludedNote}</p></aside>
    <details><summary>{t.details}</summary><p className="scoring-instructions">{evaluation.instructions}</p></details>
    <p className="context-source">{t.probability}</p>
  </section>
}
