import { useInsuranceWS } from './hooks/useInsuranceWS';
import { LoginForm } from './components/LoginForm';
import { MFAPrompt } from './components/MFAPrompt';
import { StatusBanner } from './components/StatusBanner';
import { DocumentViewer } from './components/DocumentViewer';
import './App.css';

const BUSY_STATES = ['starting', 'resuming_session', 'logging_in', 'fetching_docs'];

export default function App() {
  const { status, error, documents, startSession, submitMFA, reset } = useInsuranceWS();

  const isBusy = BUSY_STATES.includes(status);
  const showLogin = status === 'idle' || status === 'error';
  const showMFA = status === 'mfa_required';
  const showDocs = status === 'complete';

  return (
    <div className="container">
      <header>
        <h1>Insurance Policy Fetcher</h1>
        <p>Pull your policy documents directly from your carrier portal.</p>
      </header>

      <StatusBanner status={status} error={error} />

      {(showLogin || isBusy) && (
        <div className="card">
          <LoginForm onSubmit={startSession} disabled={isBusy} />
        </div>
      )}

      {showMFA && <MFAPrompt onSubmit={submitMFA} />}

      {showDocs && (
        <DocumentViewer documents={documents} onReset={reset} />
      )}

      {status === 'error' && (
        <div className="retry">
          <button className="btn-secondary" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
