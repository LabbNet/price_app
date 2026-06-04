import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Stock from './pages/Stock.jsx';
import Items from './pages/Items.jsx';
import Warehouses from './pages/Warehouses.jsx';
import Movements from './pages/Movements.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="stock" element={<Stock />} />
        <Route path="items" element={<Items />} />
        <Route path="warehouses" element={<Warehouses />} />
        <Route path="movements" element={<Movements />} />
      </Route>
    </Routes>
  );
}
