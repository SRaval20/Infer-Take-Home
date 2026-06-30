const MESSAGES = {
  starting:          'Launching secure browser…',
  resuming_session:  'Resuming your previous session…',
  logging_in:        'Logging in to carrier portal…',
  mfa_required:      'Waiting for your verification code…',
  fetching_docs:     'Fetching your policy documents…',
  complete:          'Done!',
  error:             'Something went wrong.',
};

const SPINNER_STEPS = ['starting', 'resuming_session', 'logging_in', 'fetching_docs'];

export function StatusBanner({ status, error }) {
  if (status === 'idle') return null;

  const showSpinner = SPINNER_STEPS.includes(status);

  return (
    <div className={`banner banner--${status === 'error' ? 'error' : status === 'complete' ? 'success' : 'info'}`}>
      {showSpinner && <span className="spinner" />}
      <span>{error || MESSAGES[status] || status}</span>
    </div>
  );
}
