import { createBrowserRouter } from 'react-router-dom';
import { AppShellLayout } from './layouts/AppShellLayout';
import { MainPage } from '@/pages/main/ui/MainPage';
import { MapPage } from '@/pages/map/ui/MapPage';
import { JourneyPage } from '@/pages/journey/ui/JourneyPage';
import { PaintingPage } from '@/pages/painting/ui/PaintingPage';
import { AdminLoginPage } from '@/pages/admin-login/ui/AdminLoginPage';
import { AdminPage } from '@/pages/admin/ui/AdminPage';

export const router = createBrowserRouter([
  { path: '/', element: <MainPage /> },
  {
    element: <AppShellLayout />,
    children: [
      { path: '/map', element: <MapPage /> },
      { path: '/journey/:journeyId', element: <JourneyPage /> },
    ],
  },
  { path: '/painting/:workId', element: <PaintingPage /> },
  { path: '/admin/login', element: <AdminLoginPage /> },
  { path: '/admin', element: <AdminPage /> },
]);
