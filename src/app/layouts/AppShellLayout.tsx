import { Outlet } from 'react-router-dom';
import { Header } from '@/widgets/header';

export function AppShellLayout() {
  return (
    <div className="app-shell" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <Header />
      <div className="body-row">
        <Outlet />
      </div>
    </div>
  );
}
