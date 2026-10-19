export class ApiError extends Error {
  code: string
  constructor(code: string, message: string) { super(message); this.code = code }
}
export async function api<T>(url: string, language: 'en' | 'el', init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, credentials: 'same-origin' })
  if (response.ok) return response.json() as Promise<T>
  const body: { code?: string; retryAfter?: number } = await response.json()
  const code = body.code ?? 'UNAVAILABLE'
  const messages: Record<string, [string, string]> = {
    WORKSHOP_CLOSED: ['The workshop has ended. Thank you for taking part.', 'Το εργαστήριο ολοκληρώθηκε. Ευχαριστούμε για τη συμμετοχή.'],
    QUOTA_EXHAUSTED: ['You have used all your journeys for this event.', 'Χρησιμοποίησες όλες τις προσπάθειες για αυτό το εργαστήριο.'],
    EVENT_EXHAUSTED: ['The event allowance has been used. Please contact the host.', 'Το όριο του εργαστηρίου εξαντλήθηκε. Επικοινώνησε με τον συντονιστή.'],
    EVENT_PAUSED: ['New journeys are paused. Please contact the host.', 'Οι νέες προσπάθειες έχουν παύσει. Επικοινώνησε με τον συντονιστή.'],
    RATE_LIMITED: ['Please wait before starting another journey.', 'Περίμενε πριν ξεκινήσεις νέα προσπάθεια.'],
    IN_PROGRESS: ['An operation is already running. Please wait.', 'Μια ενέργεια εκτελείται ήδη. Περίμενε.'],
    INTERRUPTED: ['This attempt is running or was interrupted. Wait, then start a new journey if needed; its allowance is not refunded.', 'Η προσπάθεια εκτελείται ή διακόπηκε. Περίμενε και ξεκίνα νέα προσπάθεια αν χρειάζεται. Το όριο δεν επιστρέφεται.'],
    ALREADY_RANKED: ['This journey was already ranked for your original choice. Start a new journey to choose again.', 'Αυτή η προσπάθεια αξιολογήθηκε ήδη για την αρχική επιλογή σου. Ξεκίνα νέα προσπάθεια για διαφορετική επιλογή.'],
    SESSION_NOT_FOUND: ['This session has expired. Start a new journey.', 'Αυτή η συνεδρία έληξε. Ξεκίνα νέα προσπάθεια.'],
    BUSY: ['The workshop is busy. Please try again shortly.', 'Το εργαστήριο είναι απασχολημένο. Δοκίμασε ξανά σε λίγο.'],
    UNAVAILABLE: ['The service is temporarily unavailable. Please try again shortly.', 'Η υπηρεσία δεν είναι διαθέσιμη προσωρινά. Δοκίμασε ξανά σε λίγο.'],
  }
  const pair = messages[code] ?? messages.UNAVAILABLE!
  const delay = Number(response.headers.get('retry-after') ?? body.retryAfter ?? 0)
  const suffix = delay > 0 ? (language === 'en' ? ` Retry in ${delay}s.` : ` Δοκίμασε σε ${delay} δευτερόλεπτα.`) : ''
  throw new ApiError(code, pair[language === 'en' ? 0 : 1] + suffix)
}
