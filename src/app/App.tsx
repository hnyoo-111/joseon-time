import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import '@/shared/config/tokens.css';
import '@/shared/ui/kit.css';

export function App() {
  return <RouterProvider router={router} />;
}
