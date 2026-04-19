import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Products from './pages/Products';
import Buckets from './pages/Buckets';
import BucketDetail from './pages/BucketDetail';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Clinics from './pages/Clinics';
import ClinicDetail from './pages/ClinicDetail';
import SpecialPricing from './pages/SpecialPricing';
import ContractTemplates from './pages/ContractTemplates';
import ContractTemplateDetail from './pages/ContractTemplateDetail';
import Contracts from './pages/Contracts';
import ContractDetail from './pages/ContractDetail';
import SignContract from './pages/SignContract';

const STAFF = ['admin', 'sales', 'legal', 'finance'];
const STAFF_LEGAL = ['admin', 'legal'];

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/sign/:token" element={<SignContract />} />

        {/* Authed routes */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<ProtectedRoute allow={STAFF}><Products /></ProtectedRoute>} />
          <Route path="/buckets" element={<ProtectedRoute allow={STAFF}><Buckets /></ProtectedRoute>} />
          <Route path="/buckets/:id" element={<ProtectedRoute allow={STAFF}><BucketDetail /></ProtectedRoute>} />
          <Route path="/clients" element={<ProtectedRoute allow={STAFF}><Clients /></ProtectedRoute>} />
          <Route path="/clients/:id" element={<ProtectedRoute allow={STAFF}><ClientDetail /></ProtectedRoute>} />
          <Route path="/clinics" element={<ProtectedRoute allow={STAFF}><Clinics /></ProtectedRoute>} />
          <Route path="/clinics/:id" element={<ProtectedRoute allow={STAFF}><ClinicDetail /></ProtectedRoute>} />
          <Route path="/special-pricing" element={<ProtectedRoute allow={STAFF}><SpecialPricing /></ProtectedRoute>} />
          <Route path="/contract-templates" element={<ProtectedRoute allow={STAFF}><ContractTemplates /></ProtectedRoute>} />
          <Route path="/contract-templates/:id" element={<ProtectedRoute allow={STAFF}><ContractTemplateDetail /></ProtectedRoute>} />
          <Route path="/contracts" element={<ProtectedRoute allow={STAFF}><Contracts /></ProtectedRoute>} />
          <Route path="/contracts/:id" element={<ProtectedRoute allow={STAFF}><ContractDetail /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
