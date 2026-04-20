import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import AcceptInvite from './pages/AcceptInvite';
import Products from './pages/Products';
import Buckets from './pages/Buckets';
import BucketDetail from './pages/BucketDetail';
import Clinics from './pages/Clinics';
import ClinicDetail from './pages/ClinicDetail';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import SpecialPricing from './pages/SpecialPricing';
import ContractTemplates from './pages/ContractTemplates';
import ContractTemplateDetail from './pages/ContractTemplateDetail';
import Contracts from './pages/Contracts';
import ContractDetail from './pages/ContractDetail';
import SignContract from './pages/SignContract';
import Users from './pages/Users';
import PriceRequests from './pages/PriceRequests';
import PortalHome from './pages/PortalHome';
import PortalPricing from './pages/PortalPricing';
import PortalContracts from './pages/PortalContracts';
import PortalContractDetail from './pages/PortalContractDetail';

const STAFF = ['admin', 'sales', 'legal', 'finance'];
const PORTAL = ['clinic_admin', 'clinic_user', 'client_user'];

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/sign/:token" element={<SignContract />} />
        <Route path="/accept-invite/:token" element={<AcceptInvite />} />

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
          <Route path="/clinics" element={<ProtectedRoute allow={STAFF}><Clinics /></ProtectedRoute>} />
          <Route path="/clinics/:id" element={<ProtectedRoute allow={STAFF}><ClinicDetail /></ProtectedRoute>} />
          <Route path="/clients" element={<ProtectedRoute allow={STAFF}><Clients /></ProtectedRoute>} />
          <Route path="/clients/:id" element={<ProtectedRoute allow={STAFF}><ClientDetail /></ProtectedRoute>} />
          <Route path="/special-pricing" element={<ProtectedRoute allow={STAFF}><SpecialPricing /></ProtectedRoute>} />
          <Route path="/contract-templates" element={<ProtectedRoute allow={STAFF}><ContractTemplates /></ProtectedRoute>} />
          <Route path="/contract-templates/:id" element={<ProtectedRoute allow={STAFF}><ContractTemplateDetail /></ProtectedRoute>} />
          <Route path="/contracts" element={<ProtectedRoute allow={STAFF}><Contracts /></ProtectedRoute>} />
          <Route path="/contracts/:id" element={<ProtectedRoute allow={STAFF}><ContractDetail /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute allow={STAFF}><Users /></ProtectedRoute>} />
          <Route path="/price-requests" element={<ProtectedRoute allow={STAFF}><PriceRequests /></ProtectedRoute>} />

          {/* Portal (clinic / client users) */}
          <Route path="/portal" element={<ProtectedRoute allow={PORTAL}><PortalHome /></ProtectedRoute>} />
          <Route path="/portal/locations/:clientId/pricing" element={<ProtectedRoute allow={PORTAL}><PortalPricing /></ProtectedRoute>} />
          <Route path="/portal/locations/:clientId/contracts" element={<ProtectedRoute allow={PORTAL}><PortalContracts /></ProtectedRoute>} />
          <Route path="/portal/contracts/:id" element={<ProtectedRoute allow={PORTAL}><PortalContractDetail /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
