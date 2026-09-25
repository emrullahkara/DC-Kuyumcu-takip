import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import '../styles/admin.css';
import { AuthProvider } from './auth.jsx';
import Layout, { RequirePerm } from './Layout.jsx';
import Login from './pages/Login.jsx';
import { Loading } from '../components/ui.jsx';

const P = {
  Dashboard: lazy(() => import('./pages/Dashboard.jsx')),
  Prices: lazy(() => import('./pages/Prices.jsx')),
  Pos: lazy(() => import('./pages/Pos.jsx')),
  Sales: lazy(() => import('./pages/Sales.jsx')),
  SaleDetail: lazy(() => import('./pages/SaleDetail.jsx')),
  Purchases: lazy(() => import('./pages/Purchases.jsx')),
  Repairs: lazy(() => import('./pages/Repairs.jsx')),
  Products: lazy(() => import('./pages/Products.jsx')),
  Customers: lazy(() => import('./pages/Customers.jsx')),
  CustomerDetail: lazy(() => import('./pages/CustomerDetail.jsx')),
  Suppliers: lazy(() => import('./pages/Suppliers.jsx')),
  Cash: lazy(() => import('./pages/Cash.jsx')),
  Reports: lazy(() => import('./pages/Reports.jsx')),
  Staff: lazy(() => import('./pages/Staff.jsx')),
  SiteAdmin: lazy(() => import('./pages/SiteAdmin.jsx')),
  Inquiries: lazy(() => import('./pages/Inquiries.jsx')),
  Users: lazy(() => import('./pages/Users.jsx')),
  Audit: lazy(() => import('./pages/Audit.jsx')),
  Settings: lazy(() => import('./pages/Settings.jsx')),
  Profile: lazy(() => import('./pages/Profile.jsx')),
};

const guard = (module, el, level) => <RequirePerm module={module} level={level}>{el}</RequirePerm>;

export default function AdminApp() {
  return (
    <AuthProvider>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="giris" element={<Login />} />
          <Route element={<Layout />}>
            <Route index element={guard('dashboard', <P.Dashboard />)} />
            <Route path="fiyatlar" element={guard('prices', <P.Prices />)} />
            <Route path="satis" element={guard('sales', <P.Pos />, 'w')} />
            <Route path="satislar" element={guard('sales', <P.Sales />)} />
            <Route path="satislar/:id" element={guard('sales', <P.SaleDetail />)} />
            <Route path="alis" element={guard('purchases', <P.Purchases />)} />
            <Route path="tamir" element={guard('repairs', <P.Repairs />)} />
            <Route path="urunler" element={guard('products', <P.Products />)} />
            <Route path="musteriler" element={guard('customers', <P.Customers />)} />
            <Route path="musteriler/:id" element={guard('customers', <P.CustomerDetail />)} />
            <Route path="tedarikciler" element={guard('suppliers', <P.Suppliers />)} />
            <Route path="kasa" element={guard('cash', <P.Cash />)} />
            <Route path="raporlar" element={guard('reports', <P.Reports />)} />
            <Route path="personel" element={guard('staff', <P.Staff />)} />
            <Route path="site" element={guard('site', <P.SiteAdmin />)} />
            <Route path="talepler" element={guard('inquiries', <P.Inquiries />)} />
            <Route path="kullanicilar" element={guard('users', <P.Users />)} />
            <Route path="denetim" element={guard('audit', <P.Audit />)} />
            <Route path="ayarlar" element={guard('settings', <P.Settings />)} />
            <Route path="profil" element={<P.Profile />} />
            <Route path="*" element={<div className="alert warn">Sayfa bulunamadı.</div>} />
          </Route>
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
