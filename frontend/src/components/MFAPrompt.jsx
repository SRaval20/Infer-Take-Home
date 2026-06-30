import { useState } from 'react';

export function MFAPrompt({ onSubmit }) {
  const [code, setCode] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (code.trim()) onSubmit(code.trim());
  };

  return (
    <div className="card">
      <h2>Multi-Factor Authentication</h2>
      <p>Enter the code sent to your phone or email.</p>
      <form onSubmit={handleSubmit} className="form">
        <input
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          maxLength={8}
          autoFocus
          required
        />
        <button type="submit" disabled={!code.trim()}>
          Submit Code
        </button>
      </form>
    </div>
  );
}
