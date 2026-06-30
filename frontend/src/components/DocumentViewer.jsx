const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function resolveUrl(url) {
  if (!url) return url;
  return url.startsWith('/') ? `${BACKEND}${url}` : url;
}

export function DocumentViewer({ documents, onReset }) {
  if (!documents.length) return null;

  return (
    <div className="card">
      <div className="doc-header">
        <h2>Your Policy Documents ({documents.length})</h2>
        <button className="btn-secondary" onClick={onReset}>
          Start Over
        </button>
      </div>

      <ul className="doc-list">
        {documents.map((doc, i) => (
          <li key={i} className="doc-item">
            <div className="doc-info">
              <span className="doc-name">{doc.name}</span>
              {doc.type && <span className="doc-badge">{doc.type.toUpperCase()}</span>}
            </div>

            <a href={resolveUrl(doc.url)} target="_blank" rel="noopener noreferrer" className="btn-open">
              {doc.type === 'pdf' ? 'Open PDF →' : 'View Page →'}
            </a>

            {doc.summary && (
              <pre className="doc-summary">{doc.summary}</pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
