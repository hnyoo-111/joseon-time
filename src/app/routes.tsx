import { createBrowserRouter } from 'react-router-dom';
import { AppShellLayout } from './layouts/AppShellLayout';
import { MainPage } from '@/pages/main/ui/MainPage';
import { MapPage } from '@/pages/map/ui/MapPage';
import { JourneyPage } from '@/pages/journey/ui/JourneyPage';
import { PaintingPage } from '@/pages/painting/ui/PaintingPage';
import { ArtifactsPage } from '@/pages/artifacts/ui/ArtifactsPage';
import { AdminLoginPage } from '@/pages/admin-login/ui/AdminLoginPage';
import { AdminPage } from '@/pages/admin/ui/AdminPage';

export const router = createBrowserRouter([
  { path: '/', element: <MainPage /> },
  {
    element: <AppShellLayout />,
    children: [
      { path: '/map', element: <MapPage /> },
      { path: '/artifacts', element: <ArtifactsPage /> },
      { path: '/journey/:journeyId', element: <JourneyPage /> },
    ],
  },
  { path: '/painting/:workId', element: <PaintingPage /> },
  { path: '/admin/login', element: <AdminLoginPage /> },
  { path: '/admin', element: <AdminPage /> },
], {
  // Vite base 경로(GitHub Pages 하위 경로 배포)를 라우터에도 반영
  basename: import.meta.env.BASE_URL,
});
