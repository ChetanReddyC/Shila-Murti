import { Suspense } from 'react';
import AccountPage from './accountPage';
import SessionGuard from '@/components/SessionGuard';
 
// Export the AccountPage component as the default export for this route
export default function Page() {
  return (
    <SessionGuard>
      <Suspense fallback={<div>Loading...</div>}>
        <AccountPage />
      </Suspense>
    </SessionGuard>
  );
} 