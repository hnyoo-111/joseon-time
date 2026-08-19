import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/shared/lib/supabaseClient';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError('로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.');
      return;
    }
    navigate('/admin');
  }

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <div className="admin-login-kicker">조선의 시간</div>
        <div className="admin-login-title">관리자 로그인</div>
        <label className="admin-field-label" htmlFor="admin-email">이메일</label>
        <input
          id="admin-email" type="email" className="admin-input" value={email}
          onChange={(e) => setEmail(e.target.value)} required autoFocus
        />
        <label className="admin-field-label" htmlFor="admin-password">비밀번호</label>
        <input
          id="admin-password" type="password" className="admin-input" value={password}
          onChange={(e) => setPassword(e.target.value)} required
        />
        {error && <div className="admin-error">{error}</div>}
        <button type="submit" className="admin-btn-primary" disabled={loading}>
          {loading ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}
