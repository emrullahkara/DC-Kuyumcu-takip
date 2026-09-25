import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider, ConfirmProvider, Loading } from './components/ui.jsx';
import SiteLayout from './site/SiteLayout.jsx';
import Home from './site/Home.jsx';

// Web sitesi sayfaları
const About = lazy(() => import('./site/About.jsx'));
const Products = lazy(() => import('./site/Products.jsx'));
const ProductDetail = lazy(() => import('./site/ProductDetail.jsx'));
const Prices = lazy(() => import('./site/Prices.jsx'));
const Contact = lazy(() => import('./site/Contact.jsx'));
const Calculator = lazy(() => import('./site/Calculator.jsx'));
const Kvkk = lazy(() => import('./site/Kvkk.jsx'));
const NotFound = lazy(() => import('./site/NotFound.jsx'));

// Yönetim paneli (ayrı paket olarak yüklenir)
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/panel/*" element={<AdminApp />} />
              <Route element={<SiteLayout />}>
                <Route index element={<Home />} />
                <Route path="hakkimizda" element={<About />} />
                <Route path="urunler" element={<Products />} />
                <Route path="urunler/:category" element={<Products />} />
                <Route path="urun/:id" element={<ProductDetail />} />
                <Route path="fiyatlar" element={<Prices />} />
                <Route path="altin-hesapla" element={<Calculator />} />
                <Route path="iletisim" element={<Contact />} />
                <Route path="kvkk" element={<Kvkk />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
