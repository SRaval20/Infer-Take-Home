import { useState } from 'react';

const CARRIERS = [
  { value: 'progressive', label: 'Progressive' },
  { value: 'geico', label: 'Geico' },
];

export function LoginForm({ onSubmit, disabled }) {
  const [carrier, setCarrier] = useState('progressive');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username && password) onSubmit({ carrier, username, password });
  };

  return (
    <form onSubmit={handleSubmit} className="form">
      <label>
        Carrier
        <select value={carrier} onChange={(e) => setCarrier(e.target.value)} disabled={disabled}>
          {CARRIERS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </label>

      <label>
        Username / Email
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="your@email.com"
          autoComplete="username"
          disabled={disabled}
          required
        />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          disabled={disabled}
          required
        />
      </label>

      <button type="submit" disabled={disabled || !username || !password}>
        {disabled ? 'Connecting…' : 'Fetch My Documents'}
      </button>
    </form>
  );
}
