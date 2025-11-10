import { Suspense } from 'react';
import OrderConfirmationPage from './orderConfirmationPage';

export default function Page() {
  return (
    <Suspense fallback={<div>Loading order confirmation...</div>}>
      <OrderConfirmationPage />
    </Suspense>
  );
} 