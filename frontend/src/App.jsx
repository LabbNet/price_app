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

const STAFF = ['admin', 'sales', 'legal', 'finance'];

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Home />} />
          <Route
            path="/products"
            element={
              <ProtectedRoute allow={STAFF}>
                <Products />
              </ProtectedRoute>
            }
          />
          <Route
            path="/buckets"
            element={
              <ProtectedRoute allow={STAFF}>
                <Buckets />
              </ProtectedRoute>
            }
          />
          <Route
            path="/buckets/:id"
            element={
              <ProtectedRoute allow={STAFF}>
                <BucketDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients"
            element={
              <ProtectedRoute allow={STAFF}>
                <Clients />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients/:id"
            element={
              <ProtectedRoute allow={STAFF}>
                <ClientDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clinics"
            element={
              <ProtectedRoute allow={STAFF}>
                <Clinics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clinics/:id"
            element={
              <ProtectedRoute allow={STAFF}>
                <ClinicDetail />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
