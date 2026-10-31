import { Navigate, Route, Routes } from 'react-router';
import LandingPage from './pages/LandingPage';
import MenuPage from './pages/MenuPage';
import KdsPage from './pages/KdsPage';
import AdminPage from './pages/AdminPage';

/**
 * Public routes (customer)  → / and /menu
 * Staff routes              → /kds (auth gate inside page)
 * Owner/admin route         → /admin (role gate inside page)
 */
export function App() {
  return (
    <Routes>
      <Route element={<LandingPage />} path="/" />
      <Route element={<MenuPage />} path="/menu" />
      <Route element={<KdsPage />} path="/kds" />
      <Route element={<AdminPage />} path="/admin" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}

export default App;
