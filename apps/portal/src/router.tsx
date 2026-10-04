import { createBrowserRouter, Navigate } from 'react-router-dom';
import LoginRoute from './routes/login';
import RegisterRoute from './routes/register';
import PendingRoute from './routes/pending';
import ScanRoute from './routes/scan';
import PatientsRoute from './routes/patients';
import PatientRecordRoute from './routes/patient-record';
import ExpiredRoute from './routes/expired';

// TODO(L1-11) : routes protégées (session + compte APPROUVÉ), redirection vers /login ou /pending.
export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/patients" replace /> },
  { path: '/login', element: <LoginRoute /> },
  { path: '/register', element: <RegisterRoute /> },
  { path: '/pending', element: <PendingRoute /> },
  { path: '/scan', element: <ScanRoute /> },
  { path: '/patients', element: <PatientsRoute /> },
  { path: '/patients/:sessionId', element: <PatientRecordRoute /> },
  { path: '/expired', element: <ExpiredRoute /> },
]);
